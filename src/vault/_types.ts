export default interface VaultPhoto {
  id: string;
  uri: string;
  filename: string;
  dateAdded: number;
  mediaType: 'image' | 'video';
  width?: number;
  height?: number;
  duration?: number;
  originalAssetId?: string;
}

export interface PhotoVaultProps {
  onBack: () => void;
  onLockRequest?: () => void;
}

export type VaultViewMode = 'grid' | 'fullscreen';
