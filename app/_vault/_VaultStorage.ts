import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { VaultPhoto } from './_types';

const VAULT_PHOTOS_KEY = 'vault_photos';

export class VaultStorage {
  private static getVaultDirectory(): Directory {
    return new Directory(Paths.document, 'vault');
  }

  static async initializeVault(): Promise<void> {
    try {
      const vaultDir = this.getVaultDirectory();
      if (!vaultDir.exists) {
        vaultDir.create({ intermediates: true });
      }
    } catch (error) {
      console.error('Error initializing vault:', error);
    }
  }

  static async getVaultPhotos(): Promise<VaultPhoto[]> {
    try {
      const photosJson = await AsyncStorage.getItem(VAULT_PHOTOS_KEY);
      return photosJson ? JSON.parse(photosJson) : [];
    } catch (error) {
      console.error('Error getting vault photos:', error);
      return [];
    }
  }

  static async addPhotoToVault(mediaUri: string, originalUri?: string): Promise<VaultPhoto | null> {
    try {
      await this.initializeVault();

      const photoId = Date.now().toString();
      const sourceFile = new File(mediaUri);

      // Determine media type and file extension
      const isVideo = mediaUri.toLowerCase().includes('.mov') ||
                     mediaUri.toLowerCase().includes('.mp4') ||
                     mediaUri.toLowerCase().includes('.m4v') ||
                     mediaUri.toLowerCase().includes('video');

      const extension = isVideo ? '.mp4' : '.jpg';
      const prefix = isVideo ? 'video_' : 'photo_';
      const filename = `${prefix}${photoId}${extension}`;

      const vaultDir = this.getVaultDirectory();
      const vaultFile = new File(vaultDir, filename);

      // Copy media to secure vault directory
      sourceFile.copy(vaultFile);

      const vaultPhoto: VaultPhoto = {
        id: photoId,
        uri: vaultFile.uri,
        filename,
        dateAdded: Date.now(),
        originalUri,
        mediaType: isVideo ? 'video' : 'image',
        width: undefined,
        height: undefined,
        duration: undefined,
      };

      // Update vault photos list
      const currentPhotos = await this.getVaultPhotos();
      const updatedPhotos = [...currentPhotos, vaultPhoto];
      await AsyncStorage.setItem(VAULT_PHOTOS_KEY, JSON.stringify(updatedPhotos));

      return vaultPhoto;
    } catch (error) {
      console.error('Error adding media to vault:', error);
      return null;
    }
  }

  static async removePhotoFromVault(photoId: string): Promise<boolean> {
    try {
      const currentPhotos = await this.getVaultPhotos();
      const photoToRemove = currentPhotos.find(photo => photo.id === photoId);

      if (!photoToRemove) return false;

      // Delete physical file
      const vaultFile = new File(photoToRemove.uri);
      if (vaultFile.exists) {
        vaultFile.delete();
      }

      // Update vault photos list
      const updatedPhotos = currentPhotos.filter(photo => photo.id !== photoId);
      await AsyncStorage.setItem(VAULT_PHOTOS_KEY, JSON.stringify(updatedPhotos));

      return true;
    } catch (error) {
      console.error('Error removing photo from vault:', error);
      return false;
    }
  }

  static async clearVault(): Promise<void> {
    try {
      // Delete all photos
      const photos = await this.getVaultPhotos();
      for (const photo of photos) {
        const vaultFile = new File(photo.uri);
        if (vaultFile.exists) {
          vaultFile.delete();
        }
      }

      // Clear vault photos list
      await AsyncStorage.removeItem(VAULT_PHOTOS_KEY);

      // Remove vault directory
      const vaultDir = this.getVaultDirectory();
      if (vaultDir.exists) {
        vaultDir.delete();
      }
    } catch (error) {
      console.error('Error clearing vault:', error);
    }
  }
}