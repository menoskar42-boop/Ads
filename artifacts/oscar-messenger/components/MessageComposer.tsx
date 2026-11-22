import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { TextField } from "./TextField";
import { colors } from "../lib/theme";

export function MessageComposer({
  value,
  onChangeText,
  onSend,
  onSchedule,
  onPickMedia,
  onPickFile,
  onVoicePress,
  busy,
  voiceEnabled,
  voiceBusy,
  voiceHint,
  mediaEnabled,
  mediaBusy,
  mediaName,
  mediaInfo,
  mediaError,
  replyText,
  onClearReply,
  onClearMedia,
  onCancelMediaUpload,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  onSchedule: () => void;
  onPickMedia: () => void;
  onPickFile: () => void;
  onVoicePress: () => void;
  busy: boolean;
  voiceEnabled: boolean;
  voiceBusy: boolean;
  voiceHint?: string;
  mediaEnabled: boolean;
  mediaBusy: boolean;
  mediaName?: string;
  mediaInfo?: string;
  mediaError?: string;
  replyText?: string;
  onClearReply: () => void;
  onClearMedia: () => void;
  onCancelMediaUpload: () => void;
}) {
  return (
    <View style={styles.wrap}>
      {!!replyText && (
        <View style={styles.replyPreview}>
          <View style={styles.previewCopy}>
            <Text style={styles.previewLabel}>رد على رسالة</Text>
            <Text numberOfLines={1} style={styles.previewText}>{replyText}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إلغاء الرد"
            onPress={onClearReply}
            style={styles.clearPreview}
          >
            <Text style={styles.clearText}>×</Text>
          </Pressable>
        </View>
      )}
      {!!mediaName && (
        <View style={styles.filePreview}>
          <View style={styles.previewCopy}>
            <Text style={styles.previewLabel}>المرفق قبل الإرسال</Text>
            <Text numberOfLines={1} style={styles.previewText}>{mediaName}</Text>
            {!!mediaInfo && <Text style={styles.previewInfo}>{mediaInfo}</Text>}
          </View>
          {mediaBusy ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إلغاء رفع الملف"
              onPress={onCancelMediaUpload}
              style={styles.cancelUpload}
            >
              <Text style={styles.cancelUploadText}>إلغاء الرفع</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إزالة المرفق"
              onPress={onClearMedia}
              style={styles.clearPreview}
            >
              <Text style={styles.clearText}>×</Text>
            </Pressable>
          )}
        </View>
      )}
      {!!mediaError && <Text style={styles.voiceHint}>{mediaError}</Text>}
      <View style={styles.composer}>
        <TextField
          value={value}
          onChangeText={onChangeText}
          placeholder="اكتب رسالة…"
          multiline
          maxLength={4000}
          returnKeyType="default"
          blurOnSubmit={false}
          accessibilityLabel="نص الرسالة"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mediaEnabled ? "اختيار صورة أو فيديو" : "المرفقات غير مفعلة"}
          testID="message-pick-media"
          onPress={onPickMedia}
          disabled={!mediaEnabled || busy || mediaBusy}
          hitSlop={6}
          style={({ pressed }) => [
            styles.action,
            (!mediaEnabled || busy || mediaBusy) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="images-outline" size={21} color={mediaEnabled ? colors.blue : colors.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mediaEnabled ? "اختيار ملف" : "المرفقات غير مفعلة"}
          testID="message-pick-file"
          onPress={onPickFile}
          disabled={!mediaEnabled || busy || mediaBusy}
          hitSlop={6}
          style={({ pressed }) => [
            styles.action,
            (!mediaEnabled || busy || mediaBusy) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="document-attach-outline" size={21} color={mediaEnabled ? colors.blue : colors.muted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            voiceEnabled ? "تسجيل رسالة صوتية" : "الرسائل الصوتية غير مفعلة"
          }
          testID="voice-message-open"
          onPress={onVoicePress}
          disabled={busy || voiceBusy || mediaBusy || !voiceEnabled}
          hitSlop={6}
          style={({ pressed }) => [
            styles.voice,
            (!voiceEnabled || busy || voiceBusy || mediaBusy) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name={voiceBusy ? "cloud-upload-outline" : "mic-outline"}
            size={23}
            color={voiceEnabled ? colors.blue : colors.muted}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="جدولة الرسالة"
          onPress={onSchedule}
          disabled={busy || mediaBusy || !value.trim()}
          hitSlop={6}
          style={({ pressed }) => [
            styles.schedule,
            (!value.trim() || busy || mediaBusy) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="time-outline" size={23} color={colors.blue} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="إرسال الرسالة"
          onPress={onSend}
          disabled={busy || mediaBusy || (!value.trim() && !mediaName)}
          style={({ pressed }) => [
            styles.send,
            (!value.trim() && !mediaName || busy || mediaBusy) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.sendText}>{busy || mediaBusy ? "…" : "➤"}</Text>
        </Pressable>
      </View>
      {!voiceEnabled && !!voiceHint && (
        <Text style={styles.voiceHint}>{voiceHint}</Text>
      )}
      <Text style={styles.limit}>{value.length}/4000</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 9, paddingHorizontal: 12, paddingBottom: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 5 },
  input: { flex: 1, maxHeight: 130, minHeight: 47, paddingTop: 12, paddingBottom: 10, borderRadius: 18 },
  action: { width: 28, height: 46, alignItems: "center", justifyContent: "center" },
  voice: { width: 34, height: 46, alignItems: "center", justifyContent: "center" },
  schedule: { width: 34, height: 46, alignItems: "center", justifyContent: "center" },
  send: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: "#06111F", fontSize: 20, fontWeight: "900", marginLeft: -2 },
  limit: { color: colors.muted, fontSize: 10, textAlign: "right", marginTop: 4, marginRight: 5 },
  voiceHint: { color: colors.muted, fontSize: 11, textAlign: "right", marginTop: 5 },
  replyPreview: { minHeight: 48, marginBottom: 8, paddingHorizontal: 10, borderRadius: 13, backgroundColor: colors.surfaceRaised, borderRightWidth: 3, borderRightColor: colors.blue, flexDirection: "row", alignItems: "center", gap: 8 },
  filePreview: { minHeight: 54, marginBottom: 8, paddingHorizontal: 10, borderRadius: 13, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 8 },
  previewCopy: { flex: 1, alignItems: "flex-end", paddingVertical: 7, gap: 2 },
  previewLabel: { color: colors.blue, fontSize: 10, fontWeight: "800", textAlign: "right" },
  previewText: { color: colors.text, fontSize: 12, textAlign: "right", maxWidth: "100%" },
  previewInfo: { color: colors.muted, fontSize: 10, textAlign: "right" },
  clearPreview: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.surface },
  clearText: { color: colors.muted, fontSize: 22, lineHeight: 24 },
  cancelUpload: { paddingHorizontal: 9, paddingVertical: 8, borderRadius: 10, backgroundColor: "#3A2530" },
  cancelUploadText: { color: colors.red, fontSize: 11, fontWeight: "700" },
  pressed: { opacity: 0.78 },
});
