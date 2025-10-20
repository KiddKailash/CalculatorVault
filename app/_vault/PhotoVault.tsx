import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import React, { useEffect, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PhotoVaultProps, VaultPhoto, VaultViewMode } from "./_types";
import { VaultStorage } from "./_VaultStorage";
import ConfirmDialog from "./ConfirmDialog";
import PhotoGrid from "./PhotoGrid";
import PhotoViewer from "./PhotoViewer";

export default function PhotoVault({ onBack }: PhotoVaultProps) {
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [viewMode, setViewMode] = useState<VaultViewMode>("grid");
  const [selectedPhoto, setSelectedPhoto] = useState<VaultPhoto | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    const vaultPhotos = await VaultStorage.getVaultPhotos();
    setPhotos(vaultPhotos);
  };

  const requestPermissions = async (): Promise<boolean> => {
    const { status: cameraStatus } =
      await ImagePicker.requestCameraPermissionsAsync();
    const { status: libraryStatus } =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    const { status: mediaStatus } = await MediaLibrary.requestPermissionsAsync(
      true
    ); // Request write permissions

    return (
      cameraStatus === "granted" &&
      libraryStatus === "granted" &&
      mediaStatus === "granted"
    );
  };

  const showImagePickerOptions = async () => {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      Alert.alert(
        "Permissions Required",
        "Please grant camera and photo library permissions to import photos.",
        [{ text: "OK" }]
      );
      return;
    }

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take Photo/Video", "Choose from Library"],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            takePhoto();
          } else if (buttonIndex === 2) {
            pickFromLibrary();
          }
        }
      );
    } else {
      Alert.alert("Add Media", "Choose an option", [
        { text: "Cancel", style: "cancel" },
        { text: "Take Photo/Video", onPress: takePhoto },
        { text: "Choose from Library", onPress: pickFromLibrary },
      ]);
    }
  };

  const takePhoto = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 60, // 60 seconds max
      });

      if (!result.canceled && result.assets[0]) {
        const mediaUri = result.assets[0].uri;
        await importPhotoToVault(mediaUri);
      }
    } catch (error) {
      console.error("Error taking photo/video:", error);
      Alert.alert("Error", "Failed to capture media");
    }
  };

  const pickFromLibrary = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 0.8,
        videoMaxDuration: 60, // 60 seconds max
        allowsMultipleSelection: false,
      });

      if (!result.canceled && result.assets[0]) {
        const mediaUri = result.assets[0].uri;
        // Directly import without asking to delete original
        await importPhotoToVault(mediaUri);
      }
    } catch (error) {
      console.error("Error picking media:", error);
      Alert.alert("Error", "Failed to pick media");
    }
  };

  const importPhotoToVault = async (photoUri: string) => {
    try {
      const vaultPhoto = await VaultStorage.addPhotoToVault(photoUri);

      if (vaultPhoto) {
        await loadPhotos();
        Alert.alert("Success", "Photo added to vault successfully");
      } else {
        Alert.alert("Error", "Failed to add photo to vault");
      }
    } catch (error) {
      console.error("Error importing photo:", error);
      Alert.alert("Error", "Failed to import photo");
    }
  };

  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

  const handlePhotoPress = (photo: VaultPhoto) => {
    const photoIndex = photos.findIndex((p) => p.id === photo.id);
    setSelectedPhotoIndex(photoIndex >= 0 ? photoIndex : 0);
    setSelectedPhoto(photo);
    setViewMode("fullscreen");
  };

  const handlePhotoLongPress = (photo: VaultPhoto) => {
    if (!photo) {
      console.error("No photo provided to handlePhotoLongPress");
      return;
    }
    setSelectedPhoto(photo);
    setShowDeleteDialog(true);
  };

  const handleDeletePhoto = async (photoToDelete?: VaultPhoto) => {
    const targetPhoto = photoToDelete || selectedPhoto;

    if (!targetPhoto) {
      console.error("No photo to delete - targetPhoto is null/undefined");
      Alert.alert("Error", "No photo selected for deletion");
      setShowDeleteDialog(false);
      return;
    }

    console.log(
      "Attempting to delete photo:",
      targetPhoto.id,
      targetPhoto.filename
    );

    try {
      const success = await VaultStorage.removePhotoFromVault(targetPhoto.id);

      if (success) {
        console.log("Photo deleted successfully:", targetPhoto.id);
        await loadPhotos();
        setViewMode("grid");
        setSelectedPhoto(null);
        setShowDeleteDialog(false);
        Alert.alert("Success", "Photo removed from vault");
      } else {
        console.error("VaultStorage.removePhotoFromVault returned false");
        Alert.alert("Error", "Failed to remove photo");
        setShowDeleteDialog(false);
      }
    } catch (error) {
      console.error("Error deleting photo:", error);
      Alert.alert("Error", "Failed to delete photo");
      setShowDeleteDialog(false);
    }
  };

  if (viewMode === "fullscreen" && selectedPhoto) {
    return (
      <PhotoViewer
        photos={photos}
        initialIndex={selectedPhotoIndex}
        onClose={() => {
          setViewMode("grid");
          setSelectedPhoto(null);
        }}
        onDelete={handleDeletePhoto}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Header */}
      <View style={styles.vaultHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={showImagePickerOptions}
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.vaultContent}>
        <PhotoGrid
          photos={photos}
          onPhotoPress={handlePhotoPress}
          onPhotoLongPress={handlePhotoLongPress}
        />
      </View>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        visible={showDeleteDialog}
        title="Delete Photo"
        message="Are you sure you want to permanently delete this photo from your vault?"
        confirmText="Delete"
        onConfirm={() => handleDeletePhoto(selectedPhoto || undefined)}
        onCancel={() => setShowDeleteDialog(false)}
        destructive
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    width: "100%",
    height: "100%",
  },
  vaultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 15,
  },
  backButton: {
    padding: 0,
  },
  backButtonText: {
    color: "white",
    fontSize: 24,
    fontWeight: "700",
  },
  vaultTitle: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    flex: 1,
    textAlign: "center",
  },
  addButton: {
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  addButtonText: {
    color: "white",
    fontSize: 24,
  },
  vaultContent: {
    flex: 1,
  },
});
