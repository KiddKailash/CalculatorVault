import React from 'react';
import { Dimensions, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VaultPhoto } from './_types';

interface PhotoGridProps {
  photos: VaultPhoto[];
  onPhotoPress: (photo: VaultPhoto) => void;
  onPhotoLongPress: (photo: VaultPhoto) => void;
}

const { width } = Dimensions.get('window');
const PHOTO_SIZE = (width - 60) / 3; // 3 photos per row with padding

export default function PhotoGrid({ photos, onPhotoPress, onPhotoLongPress }: PhotoGridProps) {
  const renderPhoto = ({ item }: { item: VaultPhoto }) => {
    const isVideo = item.mediaType === 'video';

    return (
      <TouchableOpacity
        style={styles.photoContainer}
        onPress={() => onPhotoPress(item)}
        onLongPress={() => onPhotoLongPress(item)}
      >
        <Image
          source={{ uri: item.uri }}
          style={styles.photo}
          resizeMode="cover"
        />
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
  container: {
    padding: 15,
  },
  photoContainer: {
    margin: 5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photo: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    backgroundColor: '#333',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#666',
    fontSize: 24,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptySubText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
  videoOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoIcon: {
    color: 'white',
    fontSize: 24,
    textAlign: 'center',
  },
  videoDuration: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    color: 'white',
    fontSize: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 2,
  },
});