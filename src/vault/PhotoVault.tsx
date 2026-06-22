import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import VaultPhoto, { VaultViewMode } from "./_types";
import type VaultStorage from "./_VaultStorage";
import ActionSheet from "./ActionSheet";
import ConfirmDialog from "./ConfirmDialog";
import PhotoGrid from "./PhotoGrid";
import PhotoViewer from "./PhotoViewer";

interface Props {
  storage: VaultStorage;
  onBack: () => void;
  suppressLockRef?: React.MutableRefObject<boolean>;
}

const promptOpenSettings = (purpose: string) => {
  Alert.alert(
    "Permission Needed",
    `${purpose} permission was denied. Open Settings to grant access.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ],
  );
};

export default function PhotoVault({ storage, onBack, suppressLockRef }: Props) {
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [photosLoaded, setPhotosLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<VaultViewMode>("grid");
  const [selectedPhoto, setSelectedPhoto] = useState<VaultPhoto | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddMediaSheet, setShowAddMediaSheet] = useState(false);

  const withSuppressedLock = async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (suppressLockRef) suppressLockRef.current = true;
    try {
      return await fn();
    } finally {
      // Defer release so an AppState event queued during the system flow
      // (Android picker activity returns -> background change) doesn't slip
      // through after we clear the flag.
      setTimeout(() => {
        if (suppressLockRef) suppressLockRef.current = false;
      }, 500);
    }
  };

  useEffect(() => {
    loadPhotos();
  }, []);

  const wipeVault = async () => {
    try {
      await storage.clearVault();
    } catch {
      // best effort — even on failure we want to return the user to a clean slate
    }
    setPhotos([]);
    setPhotosLoaded(true);
    onBack();
  };

  const promptCorruptedRecovery = () => {
    Alert.alert(
      "Vault Unreadable",
      "The vault index could not be decrypted. This usually means the file is corrupted. You can reset the vault to start fresh — all encrypted media will be deleted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset Vault", style: "destructive", onPress: wipeVault },
      ],
    );
  };

  const loadPhotos = async () => {
    try {
      const vaultPhotos = await storage.getVaultPhotos();
      setPhotos(vaultPhotos);
      setPhotosLoaded(true);
    } catch {
      setPhotos([]);
      setPhotosLoaded(true);
      promptCorruptedRecovery();
    }
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    return result.status === "granted";
  };

  const requestLibraryPermission = async (): Promise<boolean> => {
    const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return result.status === "granted";
  };

  const requestMediaWritePermission = async (): Promise<boolean> => {
    const result = await MediaLibrary.requestPermissionsAsync(true);
    return result.status === "granted";
  };

  const importAsset = async (asset: ImagePicker.ImagePickerAsset, options: { deleteOriginal: boolean }) => {
    try {
      const vaultPhoto = await storage.addPhotoToVault(asset.uri, {
        originalAssetId: asset.assetId ?? undefined,
        mediaType: asset.type === "video" ? "video" : "image",
        width: asset.width,
        height: asset.height,
        duration: asset.duration ?? undefined,
      });
      if (!vaultPhoto) {
        Alert.alert("Error", "Failed to add to vault");
        return;
      }
      if (options.deleteOriginal && asset.assetId) {
        try {
          await MediaLibrary.deleteAssetsAsync([asset.assetId]);
        } catch {
          Alert.alert("Heads up", "Vaulted, but the original could not be deleted from Photos. Please delete it manually.");
        }
      }
      await loadPhotos();
    } catch {
      // Most likely the vault index is corrupted — offer recovery rather than
      // a dead-end "Failed to import" message.
      promptCorruptedRecovery();
    }
  };

  const takePhoto = async () => {
    const granted = await withSuppressedLock(requestCameraPermission);
    if (!granted) {
      promptOpenSettings("Camera");
      return;
    }
    try {
      const result = await withSuppressedLock(() =>
        ImagePicker.launchCameraAsync({
          mediaTypes: ["images", "videos"],
          allowsEditing: false,
          quality: 0.8,
          videoMaxDuration: 60,
        }),
      );
      if (!result.canceled && result.assets[0]) {
        await importAsset(result.assets[0], { deleteOriginal: false });
      }
    } catch {
      Alert.alert("Error", "Failed to capture media");
    }
  };

  const promptImportFromLibrary = (asset: ImagePicker.ImagePickerAsset) => {
    Alert.alert(
      "Remove from Photos?",
      "Delete the original from your photo library after vaulting? The vault copy is encrypted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Keep original", onPress: () => importAsset(asset, { deleteOriginal: false }) },
        {
          text: "Delete original",
          style: "destructive",
          onPress: async () => {
            // Defer the write-permission prompt until the user actually opts in
            // to delete, so a normal "Keep" flow never triggers a second prompt.
            const canWrite = await withSuppressedLock(requestMediaWritePermission);
            if (!canWrite) {
              Alert.alert(
                "Cannot Delete Original",
                "Photos write permission was denied. The asset has been vaulted; the original is still in Photos.",
                [{ text: "OK", onPress: () => importAsset(asset, { deleteOriginal: false }) }],
              );
              return;
            }
            await importAsset(asset, { deleteOriginal: true });
          },
        },
      ],
    );
  };

  const pickFromLibrary = async () => {
    const granted = await withSuppressedLock(requestLibraryPermission);
    if (!granted) {
      promptOpenSettings("Photos");
      return;
    }
    try {
      const result = await withSuppressedLock(() =>
        ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images", "videos"],
          allowsEditing: false,
          quality: 0.8,
          videoMaxDuration: 60,
          allowsMultipleSelection: false,
        }),
      );
      if (!result.canceled && result.assets[0]) {
        promptImportFromLibrary(result.assets[0]);
      }
    } catch {
      Alert.alert("Error", "Failed to pick media");
    }
  };

  const handlePhotoPress = (photo: VaultPhoto) => {
    const idx = photos.findIndex((p) => p.id === photo.id);
    setSelectedPhotoIndex(idx >= 0 ? idx : 0);
    setSelectedPhoto(photo);
    setViewMode("fullscreen");
  };

  const handlePhotoLongPress = (photo: VaultPhoto) => {
    if (!photo) return;
    setSelectedPhoto(photo);
    setShowDeleteDialog(true);
  };

  const handleDeletePhoto = async (photoToDelete?: VaultPhoto) => {
    const target = photoToDelete || selectedPhoto;
    if (!target) {
      setShowDeleteDialog(false);
      return;
    }
    try {
      const ok = await storage.removePhotoFromVault(target.id);
      if (ok) {
        await loadPhotos();
        setViewMode("grid");
        setSelectedPhoto(null);
      } else {
        Alert.alert("Error", "Failed to remove media");
      }
    } catch {
      Alert.alert("Error", "Failed to delete media");
    } finally {
      setShowDeleteDialog(false);
    }
  };

  if (viewMode === "fullscreen" && selectedPhoto) {
    return (
      <PhotoViewer
        storage={storage}
        photos={photos}
        initialIndex={selectedPhotoIndex}
        onClose={() => {
          setViewMode("grid");
          setSelectedPhoto(null);
          storage.scrubDecryptedCache();
        }}
        onDelete={handleDeletePhoto}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.vaultHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowAddMediaSheet(true)} style={styles.addButton}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.vaultContent}>
        <PhotoGrid
          storage={storage}
          photos={photos}
          loaded={photosLoaded}
          onPhotoPress={handlePhotoPress}
          onPhotoLongPress={handlePhotoLongPress}
        />
      </View>
      <ConfirmDialog
        visible={showDeleteDialog}
        title="Delete Media"
        message="Permanently delete this from your vault?"
        confirmText="Delete"
        onConfirm={() => handleDeletePhoto(selectedPhoto || undefined)}
        onCancel={() => setShowDeleteDialog(false)}
        destructive
      />
      <ActionSheet
        visible={showAddMediaSheet}
        title="Add Media"
        options={[
          { text: "Take Photo/Video", onPress: takePhoto },
          { text: "Choose from Library", onPress: pickFromLibrary },
        ]}
        onCancel={() => setShowAddMediaSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000000", width: "100%", height: "100%" },
  vaultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 15 },
  backButton: { padding: 0 },
  backButtonText: { color: "white", fontSize: 24, fontWeight: "700" },
  addButton: { borderRadius: 6, justifyContent: "center", alignItems: "center" },
  addButtonText: { color: "white", fontSize: 24 },
  vaultContent: { flex: 1 },
});
