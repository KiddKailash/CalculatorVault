export interface VaultPhoto {
  id: string;
  uri: string;
  filename: string;
  dateAdded: number;
  originalUri?: string; // Original URI from device before importing
  mediaType: 'image' | 'video';
  width?: number;
  height?: number;
  duration?: number; // For videos
}

export interface PhotoVaultProps {
  onBack: () => void;
}

export type VaultViewMode = 'grid' | 'fullscreen';