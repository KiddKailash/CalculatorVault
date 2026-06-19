import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import React, { useEffect, useState } from "react";
import {
  Alert,
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
}

export default function PhotoVault({ storage, onBack }: Props) {
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [viewMode, setViewMode] = useState<VaultViewMode>("grid");
  const [selectedPhoto, setSelectedPhoto] = useState<VaultPhoto | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddMediaSheet, setShowAddMediaSheet] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    try {
      const vaultPhotos = await storage.getVaultPhotos();
      setPhotos(vaultPhotos);
    } catch {
      Alert.alert("Vault Error", "Could not read vault index. The vault may be corrupted.");
      setPhotos([]);
    }
  };

  const requestMediaPermission = async (): Promise<{ camera: boolean; library: boolean; media: boolean }> => {
    const camera = (await ImagePicker.requestCameraPermissionsAsync()).status === "granted";
    const library = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status === "granted";
    const media = (await MediaLibrary.requestPermissionsAsync(true)).status === "granted";
    return { camera, library, media };
  };

  const showImagePickerOptions = async () => {
    const perms = await requestMediaPermission();
    if (!perms.camera && !perms.library) {
      Alert.alert("Permissions Required", "Camera and Photos permissions are required to add to the vault.", [{ text: "OK" }]);
      return;
    }
    setShowAddMediaSheet(true);
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
      Alert.alert("Error", "Failed to import to vault");
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 60,
      });
      if (!result.canceled && result.assets[0]) {
        await importAsset(result.assets[0], { deleteOriginal: false });
      }
    } catch {
      Alert.alert("Error", "Failed to capture media");
    }
  };

  const pickFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 60,
        allowsMultipleSelection: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        Alert.alert(
          "Remove from Photos?",
          "Delete the original from your photo library after vaulting? The vault copy is encrypted.",
          [
            { text: "Keep original", onPress: () => importAsset(asset, { deleteOriginal: false }) },
            { text: "Delete original", style: "destructive", onPress: () => importAsset(asset, { deleteOriginal: true }) },
          ],
        );
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
        <TouchableOpacity onPress={showImagePickerOptions} style={styles.addButton}>
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.vaultContent}>
        <PhotoGrid
          storage={storage}
          photos={photos}
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
