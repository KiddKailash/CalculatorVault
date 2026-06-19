import { Directory, File, Paths, __testFs } from './mocks/expo-file-system';
import AsyncStorage from './mocks/async-storage';
import * as SecureStoreMock from './mocks/expo-secure-store';
import SecureSession from '../app/_vault/_SecureSession';
import VaultStorage from '../app/_vault/_VaultStorage';
import {
  base64ToBytes,
  bytesToHex,
  bytesToUtf8,
} from '../app/_vault/_VaultCrypto';

const PASSWORD = '1+2×3=4';

const makeSession = async (): Promise<SecureSession> => {
  const s = new SecureSession();
  await s.initialize(PASSWORD);
  return s;
};

const makeStorage = (s: SecureSession): VaultStorage =>
  new VaultStorage(s, AsyncStorage as any);

const seedSource = (path: string, contents: string): string => {
  const file = new File(path);
  file.create();
  file.write(new TextEncoder().encode(contents));
  return file.uri;
};

beforeEach(() => {
  __testFs.reset();
  SecureStoreMock.__reset();
  AsyncStorage.__reset();
});

describe('initializeVault', () => {
  it('creates vault and cache directories', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    storage.initializeVault();
    expect(new Directory(Paths.document, 'vault').exists).toBe(true);
    expect(new Directory(Paths.cache, 'vault_decrypted').exists).toBe(true);
  });

  it('is idempotent', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    storage.initializeVault();
    expect(() => storage.initializeVault()).not.toThrow();
  });
});

describe('addPhotoToVault', () => {
  it('persists encrypted file with opaque name', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/photo.jpg', 'PLAINTEXT_PIXELS');
    const photo = await storage.addPhotoToVault(src, { mediaType: 'image' });

    expect(photo).toBeTruthy();
    expect(photo!.filename).toMatch(/^[0-9a-f]{32}$/);
    expect(photo!.filename).not.toContain('photo');
    expect(photo!.filename).not.toMatch(/\.(jpg|jpeg|png|mp4)$/);
  });

  it('encrypts at rest (no plaintext present)', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/secret.jpg', 'TOP_SECRET_PIXELS_42');
    const photo = await storage.addPhotoToVault(src, { mediaType: 'image' });

    const ciphertext = await new File(photo!.uri).bytes();
    const hex = bytesToHex(ciphertext);
    expect(hex).not.toContain(bytesToHex(new TextEncoder().encode('TOP_SECRET_PIXELS_42')));
  });

  it('encrypts the index in AsyncStorage', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/x.jpg', 'BYTES');
    await storage.addPhotoToVault(src, { mediaType: 'image' });
    const raw = await AsyncStorage.getItem('vault.index.v1');
    expect(raw).toBeTruthy();
    expect(raw).not.toContain('BYTES');
    expect(raw).not.toContain('filename');
    expect(() => base64ToBytes(raw!)).not.toThrow();
  });

  it('does not store originalUri (privacy)', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/private/dcim/secret.jpg', 'BYTES');
    const photo = await storage.addPhotoToVault(src, { mediaType: 'image' });
    expect((photo as any).originalUri).toBeUndefined();
  });

  it('infers video from extension when not hinted', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/clip.mp4', 'VIDEO_BYTES');
    const photo = await storage.addPhotoToVault(src);
    expect(photo!.mediaType).toBe('video');
  });

  it('honors explicit mediaType hint over extension', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/clip.mp4', 'X');
    const photo = await storage.addPhotoToVault(src, { mediaType: 'image' });
    expect(photo!.mediaType).toBe('image');
  });

  it('cleans up vault file if index write fails', async () => {
    const s = await makeSession();
    const failing: any = {
      _store: new Map(),
      async getItem(k: string) { return this._store.get(k) ?? null; },
      async setItem(_k: string, _v: string) { throw new Error('boom'); },
      async removeItem(k: string) { this._store.delete(k); },
    };
    const storage = new VaultStorage(s, failing);
    const src = seedSource('file:///tmp/p.jpg', 'X');
    await expect(storage.addPhotoToVault(src)).rejects.toThrow();
    expect(__testFs.ls('file:///document/vault')).toEqual([]);
  });

  it('throws when locked', async () => {
    const s = await makeSession();
    s.lock();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/p.jpg', 'X');
    await expect(storage.addPhotoToVault(src)).rejects.toThrow();
  });
});

describe('getVaultPhotos', () => {
  it('returns empty list when nothing added', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    expect(await storage.getVaultPhotos()).toEqual([]);
  });

  it('returns added photos', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src1 = seedSource('file:///tmp/a.jpg', 'A');
    const src2 = seedSource('file:///tmp/b.jpg', 'B');
    await storage.addPhotoToVault(src1);
    await storage.addPhotoToVault(src2);
    const list = await storage.getVaultPhotos();
    expect(list).toHaveLength(2);
  });

  it('throws when locked', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/a.jpg', 'A');
    await storage.addPhotoToVault(src);
    s.lock();
    await expect(storage.getVaultPhotos()).rejects.toThrow();
  });

  it('rejects index decryption with wrong key', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/a.jpg', 'A');
    await storage.addPhotoToVault(src);
    s.lock();
    SecureStoreMock.__reset();

    const fresh = new SecureSession();
    await fresh.initialize('9÷9-1=2');
    const storage2 = makeStorage(fresh);
    await expect(storage2.getVaultPhotos()).rejects.toThrow();
  });
});

describe('removePhotoFromVault', () => {
  it('removes file and index entry', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/a.jpg', 'A');
    const photo = await storage.addPhotoToVault(src);
    expect(new File(photo!.uri).exists).toBe(true);

    const ok = await storage.removePhotoFromVault(photo!.id);
    expect(ok).toBe(true);
    expect(new File(photo!.uri).exists).toBe(false);
    expect(await storage.getVaultPhotos()).toHaveLength(0);
  });

  it('returns false for unknown id', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    expect(await storage.removePhotoFromVault('nonexistent')).toBe(false);
  });
});

describe('clearVault', () => {
  it('deletes all files, index, and vault dir', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    await storage.addPhotoToVault(seedSource('file:///tmp/a.jpg', 'A'));
    await storage.addPhotoToVault(seedSource('file:///tmp/b.jpg', 'B'));

    await storage.clearVault();
    expect(await AsyncStorage.getItem('vault.index.v1')).toBeNull();
    expect(new Directory(Paths.document, 'vault').exists).toBe(false);
  });
});

describe('decryptToCache + scrub', () => {
  it('decrypts vault file into cache dir with extension', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/clip.jpg', 'HELLO_PIXELS');
    const photo = await storage.addPhotoToVault(src, { mediaType: 'image' });
    const cacheUri = await storage.decryptToCache(photo!);
    expect(cacheUri).toContain('vault_decrypted');
    expect(cacheUri).toMatch(/\.jpg$/);
    const text = await new File(cacheUri).text();
    expect(text).toBe('HELLO_PIXELS');
  });

  it('uses mp4 extension for videos', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/clip.mp4', 'V');
    const photo = await storage.addPhotoToVault(src, { mediaType: 'video' });
    const cacheUri = await storage.decryptToCache(photo!);
    expect(cacheUri).toMatch(/\.mp4$/);
  });

  it('scrub removes all decrypted cache entries', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/clip.jpg', 'X');
    const photo = await storage.addPhotoToVault(src);
    await storage.decryptToCache(photo!);
    await storage.decryptToCache(photo!);
    expect(__testFs.ls('file:///cache/vault_decrypted').length).toBe(2);
    storage.scrubDecryptedCache();
    expect(__testFs.ls('file:///cache/vault_decrypted').length).toBe(0);
  });

  it('throws when decrypting under wrong session', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/clip.jpg', 'X');
    const photo = await storage.addPhotoToVault(src);
    s.lock();
    await expect(storage.decryptToCache(photo!)).rejects.toThrow();
  });
});

describe('reconcile (orphan cleanup)', () => {
  it('removes vault files without index entries', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    storage.initializeVault();
    // create an orphan in the vault dir
    const orphan = new File(new Directory(Paths.document, 'vault'), 'orphan_file');
    orphan.create();
    orphan.write(new Uint8Array([1, 2, 3]));
    expect(orphan.exists).toBe(true);

    const src = seedSource('file:///tmp/keep.jpg', 'K');
    await storage.addPhotoToVault(src);

    await storage.reconcile();
    expect(orphan.exists).toBe(false);
  });
});

describe('end-to-end roundtrip', () => {
  it('add, list, decrypt, delete', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/data.jpg', 'PAYLOAD');
    const photo = await storage.addPhotoToVault(src, { mediaType: 'image' });

    const list = await storage.getVaultPhotos();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(photo!.id);

    const decUri = await storage.decryptToCache(photo!);
    const txt = bytesToUtf8(await new File(decUri).bytes());
    expect(txt).toBe('PAYLOAD');

    await storage.removePhotoFromVault(photo!.id);
    expect(await storage.getVaultPhotos()).toHaveLength(0);
  });

  it('survives lock + reopen with same password', async () => {
    const s = await makeSession();
    const storage = makeStorage(s);
    const src = seedSource('file:///tmp/a.jpg', 'PERSISTED');
    const photo = await storage.addPhotoToVault(src);
    s.lock();

    const s2 = new SecureSession();
    expect(await s2.unlock(PASSWORD)).toBe(true);
    const storage2 = makeStorage(s2);
    const list = await storage2.getVaultPhotos();
    expect(list).toHaveLength(1);
    const decUri = await storage2.decryptToCache(list[0]);
    expect(bytesToUtf8(await new File(decUri).bytes())).toBe('PERSISTED');
    expect(list[0].id).toBe(photo!.id);
  });
});
