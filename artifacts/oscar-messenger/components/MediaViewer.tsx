import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as React from "react";
import { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CachedMedia } from "../lib/media-cache";
import { colors } from "../lib/theme";
import { shortTime } from "../lib/format";

export type MediaViewerItem = CachedMedia & {
  senderName: string;
  createdAt: string;
};

export function MediaViewer({
  media,
  onClose,
  onSave,
  onForward,
}: {
  media: MediaViewerItem | null;
  onClose: () => void;
  onSave: () => void;
  onForward?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;
  const scaleValue = useRef(1);
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const previousTapAt = useRef(0);

  useEffect(() => {
    scale.setValue(1);
    scaleValue.current = 1;
  }, [media?.messageId, scale]);

  useEffect(() => {
    if (!media || Platform.OS !== "web") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [media, onClose]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (event, gesture) =>
        event.nativeEvent.touches.length > 1 ||
        (scaleValue.current <= 1 && gesture.dy > 14),
      onMoveShouldSetPanResponderCapture: (event, gesture) =>
        event.nativeEvent.touches.length > 1 ||
        (scaleValue.current <= 1 && gesture.dy > 14),
      onPanResponderGrant: (event) => {
        const touches = event.nativeEvent.touches;
        if (touches.length > 1) {
          pinchStartDistance.current = distanceBetweenTouches(touches);
          pinchStartScale.current = scaleValue.current;
        }
      },
      onPanResponderMove: (event, gesture) => {
        const touches = event.nativeEvent.touches;
        if (touches.length > 1) {
          const start = pinchStartDistance.current;
          if (start > 0) {
            const next = Math.max(
              1,
              Math.min(4, pinchStartScale.current * (distanceBetweenTouches(touches) / start)),
            );
            scaleValue.current = next;
            scale.setValue(next);
          }
        } else if (scaleValue.current <= 1 && gesture.dy > 0) {
          scale.setValue(Math.max(0.82, 1 - gesture.dy / 520));
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        if (scaleValue.current <= 1 && gesture.dy > 100) {
          onClose();
          return;
        }
        if (scaleValue.current <= 1) scale.setValue(1);
        scaleValue.current = Math.max(1, scaleValue.current);
      },
      onPanResponderTerminate: () => {
        if (scaleValue.current <= 1) scale.setValue(1);
      },
    }),
  ).current;

  const toggleDoubleTapZoom = () => {
    const now = Date.now();
    if (now - previousTapAt.current < 300) {
      const next = scaleValue.current > 1 ? 1 : 2;
      scaleValue.current = next;
      Animated.spring(scale, {
        toValue: next,
        useNativeDriver: true,
        friction: 7,
      }).start();
    }
    previousTapAt.current = now;
  };

  return (
    <Modal
      visible={!!media}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {media && (
        <View style={styles.root}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <View style={styles.headerCopy}>
              <Text numberOfLines={1} style={styles.sender}>{media.senderName}</Text>
              <Text style={styles.time}>{shortTime(media.createdAt)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إغلاق عارض الوسائط"
              testID="media-viewer-close"
              onPress={onClose}
              hitSlop={10}
              style={styles.iconButton}
            >
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </Pressable>
          </View>
          <View style={styles.content} {...panResponder.panHandlers}>
            {media.kind === "image" ? (
              Platform.OS === "ios" ? (
                <ScrollView
                  style={styles.zoomScroll}
                  contentContainerStyle={styles.imageContent}
                  minimumZoomScale={1}
                  maximumZoomScale={4}
                  centerContent
                  bouncesZoom
                >
                  <Image
                    source={{ uri: media.uri }}
                    style={styles.viewerImage}
                    contentFit="contain"
                    cachePolicy="none"
                    onTouchEnd={toggleDoubleTapZoom}
                  />
                </ScrollView>
              ) : (
                <Pressable
                  accessibilityRole="image"
                  testID="media-viewer-image"
                  onPress={toggleDoubleTapZoom}
                  style={styles.imageContent}
                >
                  <Animated.Image
                    source={{ uri: media.uri }}
                    resizeMode="contain"
                    style={[
                      styles.viewerImage,
                      {
                        transform: [{ scale }],
                        ...(Platform.OS === "web"
                          ? ({ touchAction: "pinch-zoom" } as object)
                          : {}),
                      },
                    ]}
                  />
                </Pressable>
              )
            ) : media.kind === "video" && Platform.OS === "web" ? (
              <WebVideo uri={media.uri} />
            ) : (
              <View style={styles.unsupportedVideo}>
                <Ionicons
                  name={media.kind === "video" ? "videocam-outline" : "document-text-outline"}
                  size={52}
                  color="#FFFFFF"
                />
                <Text style={styles.videoHint}>
                  {media.kind === "video"
                    ? "استخدم «حفظ / مشاركة» لفتح الفيديو على جهازك."
                    : media.filename}
                </Text>
                {media.kind === "video" && (
                  <Text style={styles.videoSize}>{formatBytes(media.sizeBytes)}</Text>
                )}
              </View>
            )}
          </View>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <Pressable
              accessibilityRole="button"
              testID="media-viewer-save"
              onPress={onSave}
              style={styles.footerAction}
            >
              <Ionicons name="share-outline" size={19} color="#FFFFFF" />
              <Text style={styles.footerText}>حفظ / مشاركة</Text>
            </Pressable>
            {onForward && (
              <Pressable
                accessibilityRole="button"
                testID="media-viewer-forward"
                onPress={onForward}
                style={styles.footerAction}
              >
                <Ionicons name="arrow-redo-outline" size={19} color="#FFFFFF" />
                <Text style={styles.footerText}>تحويل</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </Modal>
  );
}

function WebVideo({ uri }: { uri: string }) {
  const videoElement = "video" as unknown as React.ElementType;
  return (
    <View style={styles.videoWrap}>
      {React.createElement(videoElement, {
        src: uri,
        controls: true,
        playsInline: true,
        preload: "metadata",
        style: { width: "100%", maxHeight: "100%", backgroundColor: "#000" },
        "data-testid": "media-viewer-video",
      })}
    </View>
  );
}

function distanceBetweenTouches(touches: readonly { pageX: number; pageY: number }[]) {
  const first = touches[0];
  const second = touches[1];
  if (!first || !second) return 0;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: { minHeight: 64, flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 18, gap: 12 },
  headerCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  sender: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  time: { color: "rgba(255,255,255,0.7)", fontSize: 11 },
  iconButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  zoomScroll: { width: "100%", flex: 1 },
  imageContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  viewerImage: { width: "100%", height: "100%" },
  videoWrap: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  unsupportedVideo: { alignItems: "center", justifyContent: "center", gap: 12, padding: 30 },
  videoHint: { color: "#FFFFFF", fontSize: 14, textAlign: "center" },
  videoSize: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  footer: { minHeight: 68, flexDirection: "row-reverse", justifyContent: "center", alignItems: "center", gap: 28, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.16)" },
  footerAction: { minHeight: 44, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  footerText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
});
