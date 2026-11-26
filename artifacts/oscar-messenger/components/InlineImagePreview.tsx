import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../lib/theme";

export function InlineImagePreview({
  uri,
  loading,
  error,
  onPress,
  onRetry,
  onImageLoaded,
  onImageError,
  testID,
}: {
  uri?: string;
  loading: boolean;
  error: boolean;
  onPress: () => void;
  onRetry: () => void;
  onImageLoaded: () => void;
  onImageError: () => void;
  testID: string;
}) {
  const [imageRatio, setImageRatio] = useState(4 / 3);
  const height = Math.min(320, Math.max(120, 240 / imageRatio));
  const boxStyle = [styles.frame, { width: 240, height }];
  if (uri && !error) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="عرض الصورة"
        testID={testID}
        onPress={onPress}
        disabled={loading}
        style={({ pressed }) => [boxStyle, pressed && styles.pressed]}
      >
        <Image
          source={{ uri }}
          style={[styles.image, loading && styles.loadingImage]}
          contentFit="cover"
          cachePolicy="none"
          accessibilityLabel="صورة في الرسالة"
          onLoad={(event) => {
            const { width: sourceWidth, height: sourceHeight } = event.source;
            if (sourceWidth > 0 && sourceHeight > 0) {
              setImageRatio(sourceWidth / sourceHeight);
            }
            onImageLoaded();
          }}
          onError={onImageError}
        />
        {loading && (
          <View pointerEvents="none" style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.blue} />
          </View>
        )}
      </Pressable>
    );
  }
  return (
    <View style={[boxStyle, styles.placeholder]}>
      {loading ? (
        <ActivityIndicator color={colors.blue} />
      ) : (
        <>
          <Ionicons name="image-outline" size={24} color={colors.muted} />
          <Text style={styles.errorText}>
            {error ? "تعذر تحميل الصورة" : "الصورة غير جاهزة"}
          </Text>
          {error && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إعادة تحميل الصورة"
              testID={`${testID}-retry`}
              onPress={onRetry}
              style={styles.retry}
            >
              <Text style={styles.retryText}>إعادة المحاولة</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: 12, backgroundColor: colors.surfaceRaised },
  image: { width: "100%", height: "100%" },
  hiddenImage: { position: "absolute", width: 1, height: 1, opacity: 0 },
  loadingImage: { opacity: 0 },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  placeholder: { alignItems: "center", justifyContent: "center", gap: 8 },
  errorText: { color: colors.muted, fontSize: 12, textAlign: "center" },
  retry: { minHeight: 34, justifyContent: "center", paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.surface },
  retryText: { color: colors.blue, fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.82 },
});
