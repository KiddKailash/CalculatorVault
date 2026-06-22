import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import VaultPhoto from './_types';
import type VaultStorage from './_VaultStorage';

interface PhotoGridProps {
  storage: VaultStorage;
  photos: VaultPhoto[];
  loaded?: boolean;
  onPhotoPress: (photo: VaultPhoto) => void;
  onPhotoLongPress: (photo: VaultPhoto) => void;
}

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - 60) / 3;

const Thumbnail = ({ storage, photo }: { storage: VaultStorage; photo: VaultPhoto }) => {
  const [uri, setUri] = useState<string | null>(null);

  // Key the effect on photo.id rather than the photo object so loadPhotos()
  // (which produces a new array of new object refs) doesn't trigger another
  // round of decryption + cache-file allocation for unchanged thumbnails.
  useEffect(() => {
    let cancelled = false;
    let producedUri: string | null = null;
    (async () => {
      try {
        const decryptedUri = await storage.decryptToCache(photo);
        if (cancelled) {
          storage.removeDecryptedFile(decryptedUri);
          return;
        }
        producedUri = decryptedUri;
        setUri(decryptedUri);
      } catch {
        if (!cancelled) setUri(null);
      }
    })();
    return () => {
      cancelled = true;
      if (producedUri) storage.removeDecryptedFile(producedUri);
    };
    // photo.uri/filename are derived from photo.id (each id maps 1:1 to a stored
    // file), so id is a sufficient cache key. Using the whole `photo` object as
    // a dep would re-trigger decryption on every loadPhotos() rerender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, photo.id]);

  if (!uri) return <View style={[styles.photo, styles.placeholder]} />;
  return (
    <Image
      source={{ uri }}
      style={styles.photo}
      contentFit="cover"
      transition={150}
      cachePolicy="none"
    />
  );
};

export default function PhotoGrid({ storage, photos, loaded = true, onPhotoPress, onPhotoLongPress }: PhotoGridProps) {
  const renderPhoto = ({ item }: { item: VaultPhoto }) => {
    const isVideo = item.mediaType === 'video';
    return (
      <TouchableOpacity
        style={styles.photoContainer}
        onPress={() => onPhotoPress(item)}
        onLongPress={() => onPhotoLongPress(item)}
      >
        <Thumbnail storage={storage} photo={item} />
        {isVideo && (
          <View style={styles.videoOverlay}>
            <Text style={styles.videoIcon}>▶</Text>
            {item.duration && (
              <Text style={styles.videoDuration}>
                {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (photos.length === 0) {
    if (!loaded) return <View style={styles.emptyContainer} />;
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No media in vault</Text>
        <Text style={styles.emptySubText}>Tap the + button to add photos and videos</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={photos}
      renderItem={renderPhoto}
      keyExtractor={(item) => item.id}
      numColumns={3}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 15 },
  photoContainer: { margin: 5, borderRadius: 8, overflow: 'hidden' },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, backgroundColor: '#333' },
  placeholder: { backgroundColor: '#222' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyText: { color: '#666', fontSize: 24, marginBottom: 10, textAlign: 'center' },
  emptySubText: { color: '#888', fontSize: 16, textAlign: 'center' },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  videoIcon: { color: 'white', fontSize: 24, textAlign: 'center' },
  videoDuration: { position: 'absolute', bottom: 4, right: 4, color: 'white', fontSize: 10, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2 },
});
