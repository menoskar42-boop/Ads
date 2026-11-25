import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  deleteMessengerProfileAvatar,
  uploadMessengerProfileAvatar,
  type Profile,
  type ProfileAvatarInput,
} from "@workspace/api-client-react";
import { readableError } from "../lib/format";
import { colors } from "../lib/theme";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isAvatarContentType(
  value: string,
): value is ProfileAvatarInput["contentType"] {
  return AVATAR_TYPES.has(value);
}

export function ProfileAvatarSettings({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient();
  const webInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const upload = useMutation({
    mutationFn: (input: ProfileAvatarInput) => uploadMessengerProfileAvatar(input),
    onSuccess: async () => {
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["messenger"] });
    },
    onError: (cause) => setError(readableError(cause, "تعذر رفع الصورة.")),
  });
  const remove = useMutation({
    mutationFn: () => deleteMessengerProfileAvatar(),
    onSuccess: async () => {
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["messenger"] });
    },
    onError: (cause) => setError(readableError(cause, "تعذر مسح الصورة.")),
  });

  const uploadFile = (contentType: string, base64: string, size?: number) => {
    if (!isAvatarContentType(contentType)) {
      setError("اختار صورة JPEG أو PNG أو WebP.");
      return;
    }
    if ((size ?? Math.ceil(base64.length * 0.75)) > MAX_AVATAR_BYTES) {
      setError("حجم الصورة لازم يكون 2 ميجا أو أقل.");
      return;
    }
    upload.mutate({ contentType, base64 });
  };

  const chooseNativeImage = async () => {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("اسمح للتطبيق بالوصول للصور لاختيار صورة البروفايل.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setError("تعذر قراءة الصورة المختارة.");
        return;
      }
      uploadFile(asset.mimeType || "", asset.base64, asset.fileSize);
    } catch (cause) {
      setError(readableError(cause, "تعذر اختيار الصورة."));
    }
  };

  const chooseWebImage = (file: File | null) => {
    if (!file) return;
    setError("");
    if (!isAvatarContentType(file.type)) {
      setError("اختار صورة JPEG أو PNG أو WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("حجم الصورة لازم يكون 2 ميجا أو أقل.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      if (comma < 0) {
        setError("تعذر قراءة الصورة المختارة.");
        return;
      }
      uploadFile(file.type, result.slice(comma + 1), file.size);
    };
    reader.onerror = () => setError("تعذر قراءة الصورة المختارة.");
    reader.readAsDataURL(file);
  };

  const confirmRemove = () => {
    const perform = () => remove.mutate();
    if (Platform.OS === "web") {
      if (globalThis.confirm("تمسح صورة البروفايل؟")) perform();
      return;
    }
    Alert.alert("مسح صورة البروفايل؟", "", [
      { text: "إلغاء", style: "cancel" },
      { text: "مسح", style: "destructive", onPress: perform },
    ]);
  };

  return (
    <View style={styles.section}>
      <Text style={styles.title}>صورة البروفايل</Text>
      <View style={styles.actions}>
        {Platform.OS === "web" ? (
          <>
            <input
              ref={webInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(event) => {
                chooseWebImage(event.currentTarget.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            <Pressable
              accessibilityRole="button"
              testID="profile-avatar-choose"
              disabled={upload.isPending}
              onPress={() => webInput.current?.click()}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
                upload.isPending && styles.disabled,
              ]}
            >
              <Text style={styles.buttonText}>
                {profile.avatarUrl ? "تغيير الصورة" : "اختيار صورة"}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            testID="profile-avatar-choose"
            disabled={upload.isPending}
            onPress={() => void chooseNativeImage()}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.pressed,
              upload.isPending && styles.disabled,
            ]}
          >
            <Text style={styles.buttonText}>
              {profile.avatarUrl ? "تغيير الصورة" : "اختيار صورة"}
            </Text>
          </Pressable>
        )}
        {profile.avatarUrl && (
          <Pressable
            accessibilityRole="button"
            testID="profile-avatar-delete"
            disabled={remove.isPending}
            onPress={confirmRemove}
            style={({ pressed }) => [
              styles.removeButton,
              pressed && styles.pressed,
              remove.isPending && styles.disabled,
            ]}
          >
            <Text style={styles.removeText}>مسح الصورة</Text>
          </Pressable>
        )}
      </View>
      {upload.isPending || remove.isPending ? (
        <Text style={styles.feedback}>جارٍ تحديث الصورة…</Text>
      ) : null}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 10,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "right" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  button: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.blueDark,
  },
  buttonText: { color: colors.text, fontWeight: "700" },
  removeButton: {
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.red,
  },
  removeText: { color: colors.red, fontWeight: "700" },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  feedback: { color: colors.muted, textAlign: "right" },
  error: { color: colors.red, textAlign: "right", lineHeight: 20 },
});
