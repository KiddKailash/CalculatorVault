import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import SecureSession from './_SecureSession';
import VaultPhoto from './_types';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  decryptBytes,
  encryptBytes,
  generateOpaqueId,
  utf8ToBytes,
} from './_VaultCrypto';

const VAULT_INDEX_KEY = 'vault.index.v1';
const VAULT_DIR_NAME = 'vault';
const CACHE_DIR_NAME = 'vault_decrypted';

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface FileSystemPort {
  vaultDir(): Directory;
  cacheDir(): Directory;
  file(parent: Directory, name: string): File;
  fileFromUri(uri: string): File;
}

const defaultFs: FileSystemPort = {
  vaultDir: () => new Directory(Paths.document, VAULT_DIR_NAME),
  cacheDir: () => new Directory(Paths.cache, CACHE_DIR_NAME),
  file: (parent, name) => new File(parent, name),
  fileFromUri: (uri) => new File(uri),
};

const VIDEO_EXTENSIONS = ['mov', 'mp4', 'm4v', 'webm', '3gp', 'avi', 'mkv'];

const detectMediaType = (uri: string, hintedType?: string): 'image' | 'video' => {
  if (hintedType === 'video' || hintedType === 'image') return hintedType;
  const lower = uri.toLowerCase();
  const match = lower.match(/\.([a-z0-9]+)(?:\?|$)/);
  if (match && VIDEO_EXTENSIONS.includes(match[1])) return 'video';
  return 'image';
};

export interface AddPhotoOptions {
  originalUri?: string;
  originalAssetId?: string;
  mediaType?: 'image' | 'video';
  width?: number;
  height?: number;
  duration?: number;
}

export default class VaultStorage {
  private readonly session: SecureSession;
  private readonly storage: AsyncStorageLike;
  private readonly fs: FileSystemPort;
  private readonly decryptedFiles: Set<string> = new Set();
  // Serializes read-modify-write of the encrypted index so concurrent
  // add/remove calls don't drop entries.
  private indexLock: Promise<unknown> = Promise.resolve();

  constructor(
    session: SecureSession,
    storage: AsyncStorageLike = AsyncStorage,
    fs: FileSystemPort = defaultFs,
  ) {
    this.session = session;
    this.storage = storage;
    this.fs = fs;
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.indexLock.then(fn, fn);
    this.indexLock = next.catch(() => undefined);
    return next;
  }

  initializeVault(): void {
    const dir = this.fs.vaultDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const cache = this.fs.cacheDir();
    if (!cache.exists) cache.create({ intermediates: true });
  }

  async getVaultPhotos(): Promise<VaultPhoto[]> {
    const ciphertextB64 = await this.storage.getItem(VAULT_INDEX_KEY);
    if (!ciphertextB64) return [];
    const keys = this.session.getKeys();
    const plaintext = decryptBytes(keys, base64ToBytes(ciphertextB64));
    const json = bytesToUtf8(plaintext);
    const parsed = JSON.parse(json) as VaultPhoto[];
    if (!Array.isArray(parsed)) return [];
    return [...parsed].sort((a, b) => (b.dateAdded ?? 0) - (a.dateAdded ?? 0));
  }

  private async saveVaultPhotos(photos: VaultPhoto[]): Promise<void> {
    const keys = this.session.getKeys();
    const ciphertext = encryptBytes(keys, utf8ToBytes(JSON.stringify(photos)));
    await this.storage.setItem(VAULT_INDEX_KEY, bytesToBase64(ciphertext));
  }

  addPhotoToVault(
    sourceUri: string,
    opts: AddPhotoOptions = {},
  ): Promise<VaultPhoto | null> {
    return this.runExclusive(async () => {
      this.initializeVault();
      const keys = this.session.getKeys();

      const source = this.fs.fileFromUri(sourceUri);
      const plaintext = await source.bytes();

      const mediaType = detectMediaType(sourceUri, opts.mediaType);
      const id = generateOpaqueId();
      const opaqueFilename = generateOpaqueId();

      const ciphertext = encryptBytes(keys, plaintext);

      const vaultDir = this.fs.vaultDir();
      const target = this.fs.file(vaultDir, opaqueFilename);
      if (target.exists) throw new Error('Opaque filename collision');
      target.create();
      target.write(ciphertext);

      const photo: VaultPhoto = {
        id,
        uri: target.uri,
        filename: opaqueFilename,
        dateAdded: Date.now(),
        mediaType,
        width: opts.width,
        height: opts.height,
        duration: opts.duration,
        originalAssetId: opts.originalAssetId,
      };

      try {
        const current = await this.getVaultPhotos();
        await this.saveVaultPhotos([...current, photo]);
      } catch (err) {
        if (target.exists) target.delete();
        throw err;
      }

      return photo;
    });
  }

  removePhotoFromVault(photoId: string): Promise<boolean> {
    return this.runExclusive(async () => {
      const photos = await this.getVaultPhotos();
      const photo = photos.find((p) => p.id === photoId);
      if (!photo) return false;

      const file = this.fs.fileFromUri(photo.uri);
      if (file.exists) file.delete();
      await this.saveVaultPhotos(photos.filter((p) => p.id !== photoId));
      return true;
    });
  }

  async clearVault(): Promise<void> {
    let photos: VaultPhoto[] = [];
    try {
      photos = await this.getVaultPhotos();
    } catch {
      // index unreadable — fall through to nuke directory
    }
    for (const photo of photos) {
      const file = this.fs.fileFromUri(photo.uri);
      if (file.exists) file.delete();
    }
    await this.storage.removeItem(VAULT_INDEX_KEY);
    const dir = this.fs.vaultDir();
    if (dir.exists) dir.delete();
    this.scrubDecryptedCache();
  }

  async decryptToCache(photo: VaultPhoto): Promise<string> {
    const keys = this.session.getKeys();
    const file = this.fs.fileFromUri(photo.uri);
    const ciphertext = await file.bytes();
    const plaintext = decryptBytes(keys, ciphertext);

    const cacheDir = this.fs.cacheDir();
    if (!cacheDir.exists) cacheDir.create({ intermediates: true });
    const ext = photo.mediaType === 'video' ? '.mp4' : '.jpg';
    const cacheName = `${generateOpaqueId()}${ext}`;
    const cacheFile = this.fs.file(cacheDir, cacheName);
    cacheFile.create();
    cacheFile.write(plaintext);
    this.decryptedFiles.add(cacheFile.uri);
    return cacheFile.uri;
  }

  removeDecryptedFile(uri: string): void {
    if (!this.decryptedFiles.has(uri)) return;
    try {
      const file = this.fs.fileFromUri(uri);
      if (file.exists) file.delete();
    } catch {
      // best effort
    }
    this.decryptedFiles.delete(uri);
  }

  scrubDecryptedCache(): void {
    for (const uri of this.decryptedFiles) {
      try {
        const file = this.fs.fileFromUri(uri);
        if (file.exists) file.delete();
      } catch {
        // best effort
      }
    }
    this.decryptedFiles.clear();
    const dir = this.fs.cacheDir();
    if (dir.exists) {
      try {
        for (const entry of dir.list()) {
          try {
            entry.delete();
          } catch {
            // best effort
          }
        }
      } catch {
        // best effort
      }
    }
  }

  async reconcile(): Promise<void> {
    let photos: VaultPhoto[];
    try {
      photos = await this.getVaultPhotos();
    } catch {
      return;
    }
    const known = new Set(photos.map((p) => p.filename));
    const dir = this.fs.vaultDir();
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      const name = entry.uri.split('/').filter(Boolean).pop();
      if (!name) continue;
      if (!known.has(name)) {
        try {
          entry.delete();
        } catch {
          // best effort
        }
      }
    }
  }
}
