import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import VaultPhoto from "./_types";

interface PhotoViewerProps {
  photos: VaultPhoto[];
  initialIndex: number;
  onClose: () => void;
  onDelete: (photo: VaultPhoto) => void;
}

const { width: screenWidth } = Dimensions.get("window");

export default function PhotoViewer({
  photos,
  initialIndex,
  onClose,
  onDelete,
}: PhotoViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showControls, setShowControls] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [lastTap, setLastTap] = useState(0);

  const scrollViewRef = useRef<ScrollView>(null);
  const scaleValue = useRef(new Animated.Value(1)).current;
  const translateXValue = useRef(new Animated.Value(0)).current;
  const translateYValue = useRef(new Animated.Value(0)).current;
  const initialDistance = useRef(0);
  const initialScale = useRef(1);
  const gestureType = useRef<"pinch" | "pan" | null>(null);

  const currentPhoto = photos[currentIndex];
  const isVideo = currentPhoto?.mediaType === "video";

  // Create video player for the current video
  const videoPlayer = useVideoPlayer(
    isVideo ? currentPhoto.uri : null,
    (player: any) => {
      if (player) {
        player.loop = true;
      }
    }
  );

  // Calculate distance between two touches (for pinch zoom)
  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const [touch1, touch2] = touches;
    const dx = touch1.pageX - touch2.pageX;
    const dy = touch1.pageY - touch2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Pan responder for zoom and pan gestures
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      const touchCount = evt.nativeEvent.touches.length;
      const currentScale = (scaleValue as any).__getValue() || 1;
      return touchCount >= 2 || currentScale > 1;
    },
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      const touchCount = evt.nativeEvent.touches.length;
      const currentScale = (scaleValue as any).__getValue() || 1;

      // Always respond to two-finger gestures (pinch)
      if (touchCount >= 2) {
        return true;
      }

      // Respond to single-finger pan only when zoomed and there's movement
      if (
        currentScale > 1 &&
        (Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5)
      ) {
        return true;
      }

      return false;
    },
    onMoveShouldSetPanResponderCapture: () => false,

    onPanResponderGrant: (evt) => {
      const touches = evt.nativeEvent.touches;
      const currentScale = (scaleValue as any).__getValue() || 1;

      if (touches.length >= 2) {
        // Pinch zoom gesture starting
        gestureType.current = "pinch";
        initialDistance.current = getDistance(touches);
        initialScale.current = currentScale;
      } else if (currentScale > 1) {
        // Pan gesture starting (only when zoomed)
        gestureType.current = "pan";
        translateXValue.setOffset(translateX);
        translateYValue.setOffset(translateY);
        translateXValue.setValue(0);
        translateYValue.setValue(0);
      } else {
        gestureType.current = null;
      }
    },

    onPanResponderMove: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches;

      // Handle based on the gesture type we determined at start
      if (gestureType.current === "pinch" || touches.length >= 2) {
        // Pinch zoom - always allow if we detect 2 fingers
        const currentDistance = getDistance(touches);
        if (initialDistance.current > 0 && currentDistance > 0) {
          const newScale = Math.max(
            1,
            Math.min(
              4,
              initialScale.current * (currentDistance / initialDistance.current)
            )
          );

          scaleValue.setValue(newScale);
        }
      } else if (gestureType.current === "pan") {
        // Single-finger pan when zoomed
        translateXValue.setValue(gestureState.dx);
        translateYValue.setValue(gestureState.dy);
      }
    },

    onPanResponderRelease: (evt, gestureState) => {
      const wasGestureType = gestureType.current;

      if (wasGestureType === "pinch") {
        // Pinch gesture ended
        let finalScale = Math.max(
          1,
          Math.min(4, (scaleValue as any).__getValue() || 1)
        );

        if (finalScale <= 1.1) {
          // Snap back to 1x
          Animated.parallel([
            Animated.spring(scaleValue, {
              toValue: 1,
              useNativeDriver: true,
              tension: 40,
              friction: 7,
            }),
            Animated.spring(translateXValue, {
              toValue: 0,
              useNativeDriver: true,
              tension: 40,
              friction: 7,
            }),
            Animated.spring(translateYValue, {
              toValue: 0,
              useNativeDriver: true,
              tension: 40,
              friction: 7,
            }),
          ]).start(() => {
            setScale(1);
            setTranslateX(0);
            setTranslateY(0);
          });
        } else {
          // Persist the zoom level
          setScale(finalScale);
          scaleValue.setValue(finalScale);
        }

        initialDistance.current = 0;
        initialScale.current = 1;
      } else if (wasGestureType === "pan") {
        // Pan gesture ended
        translateXValue.flattenOffset();
        translateYValue.flattenOffset();

        const newTranslateX = translateX + gestureState.dx;
        const newTranslateY = translateY + gestureState.dy;

        setTranslateX(newTranslateX);
        setTranslateY(newTranslateY);
      }

      // Reset gesture type
      gestureType.current = null;
    },
  });

  const handleTap = () => {
    if (isVideo) {
      setShowControls(!showControls);
      return;
    }

    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;

    if (lastTap && now - lastTap < DOUBLE_TAP_DELAY) {
      // Double tap - zoom in/out
      // Read current scale from animated value for accuracy
      const currentScale = (scaleValue as any).__getValue() || scale;
      const newScale = currentScale > 1 ? 1 : 2.5;
      const newTranslateX = newScale === 1 ? 0 : translateX;
      const newTranslateY = newScale === 1 ? 0 : translateY;

      Animated.parallel([
        Animated.spring(scaleValue, {
          toValue: newScale,
          useNativeDriver: true,
          tension: 40,
          friction: 7,
        }),
        Animated.spring(translateXValue, {
          toValue: newTranslateX,
          useNativeDriver: true,
          tension: 40,
          friction: 7,
        }),
        Animated.spring(translateYValue, {
          toValue: newTranslateY,
          useNativeDriver: true,
          tension: 40,
          friction: 7,
        }),
      ]).start(() => {
        setScale(newScale);
        setTranslateX(newTranslateX);
        setTranslateY(newTranslateY);
      });

      setLastTap(0);
    } else {
      // Single tap - toggle controls
      setLastTap(now);
      setTimeout(() => {
        if (Date.now() - now >= DOUBLE_TAP_DELAY) {
          setShowControls(!showControls);
        }
      }, DOUBLE_TAP_DELAY);
    }
  };

  const handleShare = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(currentPhoto.uri, {
          mimeType: isVideo ? "video/mp4" : "image/jpeg",
          dialogTitle: `Share ${currentPhoto.filename}`,
        });
      } else {
        Alert.alert("Error", "Sharing is not available on this device");
      }
    } catch (error) {
      console.error("Error sharing photo:", error);
      Alert.alert("Error", "Failed to share photo");
    }
  };

  const onScroll = (event: any) => {
    const contentOffset = event.nativeEvent.contentOffset;
    const newIndex = Math.round(contentOffset.x / screenWidth);
    if (
      newIndex !== currentIndex &&
      newIndex >= 0 &&
      newIndex < photos.length
    ) {
      setCurrentIndex(newIndex);
      // Reset zoom when changing photos
      setScale(1);
      setTranslateX(0);
      setTranslateY(0);
      scaleValue.setValue(1);
      translateXValue.setValue(0);
      translateYValue.setValue(0);
    }
  };

  const formatDuration = (duration: number) => {
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const renderPhoto = (photo: VaultPhoto, index: number) => {
    const isCurrentPhoto = index === currentIndex;

    return (
      <View
        key={photo.id}
        style={styles.photoSlide}
        {...(isCurrentPhoto && !isVideo ? panResponder.panHandlers : {})}
      >
        <View style={styles.photoContainer}>
          {photo.mediaType === "video" && isCurrentPhoto ? (
            <VideoView
              player={videoPlayer}
              allowsPictureInPicture={true}
              startsPictureInPictureAutomatically={true}
              style={styles.media}
              nativeControls={true}
              contentFit="fill"
            />
          ) : photo.mediaType === "video" ? (
            // Placeholder for non-current videos
            <View style={styles.media} />
          ) : (
            <Animated.View
              style={[
                styles.imageContainer,
                isCurrentPhoto && {
                  transform: [
                    { scale: scaleValue },
                    { translateX: translateXValue },
                    { translateY: translateYValue },
                  ],
                },
              ]}
            >
              <Image
                source={{ uri: photo.uri }}
                style={styles.media}
                contentFit="contain"
                transition={200}
                cachePolicy="memory-disk"
                onError={(error) => {
                  console.error("Image load error:", error);
                }}
              />
            </Animated.View>
          )}
        </View>

        {/* Tap overlay for controls and zoom - only for images */}
        {isCurrentPhoto && scale === 1 && photo.mediaType !== "video" && (
          <TouchableOpacity
            style={styles.tapOverlay}
            activeOpacity={1}
            onPress={handleTap}
          />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      {/* Header Controls */}
      {showControls && (
        <Animated.View style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.headerButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Text style={styles.headerButtonText}>←</Text>
          </TouchableOpacity>

          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleShare}
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.headerButtonText}>⤴</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowMetadata(!showMetadata)}
              style={styles.headerButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.headerButtonText}>⋮</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* Photo Scroll View */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentOffset={{ x: currentIndex * screenWidth, y: 0 }}
        style={styles.scrollView}
        bounces={false}
        scrollEnabled={scale === 1}
      >
        {photos.map((photo, index) => renderPhoto(photo, index))}
      </ScrollView>

      {/* More Options Menu */}
      <Modal
        visible={showMetadata}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMetadata(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMetadata(false)}
        >
          <View style={styles.menuContainer}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMetadata(false);
                setShowDeleteConfirm(true);
              }}
            >
              <Text style={styles.menuIcon}>🗑</Text>
              <Text style={styles.menuText}>Delete</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <View style={styles.menuInfoSection}>
              <Text style={styles.menuInfoTitle}>Details</Text>

              <View style={styles.menuInfoRow}>
                <Text style={styles.menuInfoLabel}>Type</Text>
                <Text style={styles.menuInfoValue}>
                  {isVideo ? "Video" : "Image"}
                </Text>
              </View>

              <View style={styles.menuInfoRow}>
                <Text style={styles.menuInfoLabel}>Date Added</Text>
                <Text style={styles.menuInfoValue}>
                  {new Date(currentPhoto?.dateAdded || 0).toLocaleDateString()}
                </Text>
              </View>

              {currentPhoto?.width && currentPhoto?.height && (
                <View style={styles.menuInfoRow}>
                  <Text style={styles.menuInfoLabel}>Dimensions</Text>
                  <Text style={styles.menuInfoValue}>
                    {currentPhoto.width} × {currentPhoto.height}
                  </Text>
                </View>
              )}

              {isVideo && currentPhoto?.duration && (
                <View style={styles.menuInfoRow}>
                  <Text style={styles.menuInfoLabel}>Duration</Text>
                  <Text style={styles.menuInfoValue}>
                    {formatDuration(currentPhoto.duration)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteConfirm(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={styles.deleteModalContainer}>
            <Text style={styles.deleteModalTitle}>
              Delete {isVideo ? "video" : "photo"}?
            </Text>
            <Text style={styles.deleteModalMessage}>
              This {isVideo ? "video" : "photo"} will be permanently deleted
              from your vault.
            </Text>

            <View style={styles.deleteModalButtons}>
              <TouchableOpacity
                style={styles.deleteModalCancelButton}
                onPress={() => setShowDeleteConfirm(false)}
              >
                <Text style={styles.deleteModalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.deleteModalDeleteButton}
                onPress={() => {
                  setShowDeleteConfirm(false);
                  onDelete(currentPhoto);
                }}
              >
                <Text style={styles.deleteModalDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    width: "100%",
    height: "100%",
  },
  header: {
    position: "absolute",
    top: 40,
    left: 2,
    right: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 10,
  },
  headerButton: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 24,
  },
  headerButtonText: {
    color: "white",
    fontSize: 24,
    fontWeight: "700",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "400",
  },
  headerActions: {
    flexDirection: "row",
    gap: 4,
  },
  scrollView: {
    flex: 1,
  },
  photoSlide: {
    width: screenWidth,
    height: "100%",
  },
  photoContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  media: {
    width: screenWidth,
    height: "100%",
  },
  tapOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "flex-end",
  },
  menuContainer: {
    backgroundColor: "#1c1c1c",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuIcon: {
    fontSize: 22,
    marginRight: 16,
  },
  menuText: {
    color: "#ff4444",
    fontSize: 16,
    fontWeight: "600",
  },
  menuDivider: {
    height: 1,
    backgroundColor: "#2a2a2a",
    marginVertical: 8,
  },
  menuInfoSection: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  menuInfoTitle: {
    color: "#888",
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  menuInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  menuInfoLabel: {
    color: "#aaa",
    fontSize: 15,
  },
  menuInfoValue: {
    color: "white",
    fontSize: 15,
    fontWeight: "500",
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  deleteModalContainer: {
    backgroundColor: "#1c1c1c",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  deleteModalTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 12,
  },
  deleteModalMessage: {
    color: "#aaa",
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 24,
  },
  deleteModalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  deleteModalCancelButton: {
    flex: 1,
    backgroundColor: "#333",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  deleteModalDeleteButton: {
    flex: 1,
    backgroundColor: "#ff4444",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  deleteModalCancelText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  deleteModalDeleteText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
});
