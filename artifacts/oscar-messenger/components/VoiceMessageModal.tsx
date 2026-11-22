import { Ionicons } from "@expo/vector-icons";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { readableError } from "../lib/format";
import { colors } from "../lib/theme";

const MAX_DURATION_MS = 120_000;

type AudioContentType = "audio/mp4" | "audio/webm";

export function VoiceMessageModal({
  visible,
  busy,
  onClose,
  onSend,
}: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onSend: (
    uri: string,
    durationMs: number,
    contentType: AudioContentType,
  ) => Promise<void>;
}) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const insets = useSafeAreaInsets();
  const recorderState = useAudioRecorderState(recorder, 250);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [permissionLocked, setPermissionLocked] = useState(false);
  const [errorText, setErrorText] = useState("");
  const previewPlayer = useAudioPlayer(
    recordingUri ? { uri: recordingUri } : null,
    { updateInterval: 250 },
  );
  const previewStatus = useAudioPlayerStatus(previewPlayer);
  const stopping = useRef(false);

  const removeLocalRecording = useCallback(async (uri: string | null) => {
    if (!uri) return;
    if (Platform.OS === "web" && uri.startsWith("blob:")) {
      URL.revokeObjectURL(uri);
      return;
    }
    try {
      new File(uri).delete();
    } catch {
      // A cache file may already have been removed by the operating system.
    }
  }, []);

  const clearPreview = useCallback(async () => {
    previewPlayer.pause();
    previewPlayer.replace(null);
    await removeLocalRecording(recordingUri);
    setRecordingUri(null);
    setDurationMs(0);
  }, [previewPlayer, recordingUri, removeLocalRecording]);

  const stopRecording = useCallback(async () => {
    if (!recorder.isRecording || stopping.current) return;
    stopping.current = true;
    const finalDuration = Math.max(
      0,
      Math.min(
        MAX_DURATION_MS,
        Math.round(recorder.currentTime * 1000 || recorderState.durationMillis),
      ),
    );
    try {
      await recorder.stop();
      const uri = recorder.uri ?? recorderState.url;
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        allowsRecording: false,
      });
      if (!uri || finalDuration < 500) {
        setErrorText("التسجيل قصير جدًا. سجّل رسالة أطول من فضلك.");
        return;
      }
      setRecordingUri(uri);
      setDurationMs(finalDuration);
      setErrorText("");
    } catch (error) {
      setErrorText(readableError(error, "تعذر إيقاف التسجيل."));
    } finally {
      stopping.current = false;
    }
  }, [recorder, recorderState.durationMillis, recorderState.url]);

  useEffect(() => {
    if (
      recorderState.isRecording &&
      recorderState.durationMillis >= MAX_DURATION_MS
    ) {
      void stopRecording();
    }
  }, [recorderState.durationMillis, recorderState.isRecording, stopRecording]);

  useEffect(() => {
    if (visible) return;
    if (recorder.isRecording) void recorder.stop();
    previewPlayer.pause();
    previewPlayer.replace(null);
    void removeLocalRecording(recordingUri);
    setRecordingUri(null);
    setDurationMs(0);
    setErrorText("");
    setPermissionLocked(false);
  }, [visible, recorder, previewPlayer, recordingUri, removeLocalRecording]);

  const startRecording = async () => {
    setErrorText("");
    setPermissionLocked(false);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setPermissionLocked(!permission.canAskAgain);
        setErrorText("لم يُسمح باستخدام الميكروفون. يمكنك تغيير الإذن من إعدادات الجهاز.");
        return;
      }
      await clearPreview();
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: MAX_DURATION_MS / 1000 });
    } catch (error) {
      setErrorText(readableError(error, "تعذر بدء التسجيل."));
    }
  };

  const close = async () => {
    if (busy) return;
    if (recorder.isRecording) {
      await recorder.stop().catch(() => undefined);
      await setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
        allowsRecording: false,
      }).catch(() => undefined);
      await removeLocalRecording(recorder.uri);
    }
    previewPlayer.pause();
    previewPlayer.replace(null);
    await removeLocalRecording(recordingUri);
    onClose();
  };

  const handleSend = async () => {
    if (!recordingUri || busy) return;
    try {
      const contentType: AudioContentType =
        Platform.OS === "web" ? "audio/webm" : "audio/mp4";
      await onSend(recordingUri, durationMs, contentType);
      onClose();
    } catch (error) {
      setErrorText(readableError(error, "تعذر إرسال التسجيل. يمكنك المحاولة مرة أخرى."));
    }
  };

  const openDeviceSettings = () => {
    if (Platform.OS === "web") return;
    void Linking.openSettings().catch(() => {
      Alert.alert("الإعدادات", "افتح إعدادات الجهاز واسمح باستخدام الميكروفون.");
    });
  };

  const elapsedMs = recorderState.isRecording
    ? Math.min(MAX_DURATION_MS, recorderState.durationMillis)
    : durationMs;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={() => void close()}
      statusBarTranslucent={Platform.OS !== "web"}
    >
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 22,
            paddingBottom: insets.bottom + 22,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>رسالة صوتية</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            testID="voice-message-close"
            onPress={() => void close()}
            disabled={busy}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={25} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.card}>
          <Ionicons
            name={recorderState.isRecording ? "radio-button-on" : "mic-outline"}
            size={42}
            color={recorderState.isRecording ? colors.blue : colors.muted}
          />
          <Text style={styles.timer}>{formatDuration(elapsedMs)}</Text>
          <Text style={styles.privacy}>
            لا يبدأ التسجيل إلا بعد ضغطك. استمع إليه أولًا، ولن يُرسل إلا بعد ضغط «إرسال».
            الحد الأقصى دقيقتان.
          </Text>

          {recordingUri && !recorderState.isRecording && (
            <View style={styles.preview}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  previewStatus.playing ? "إيقاف المعاينة" : "معاينة التسجيل"
                }
                testID="voice-message-preview"
                onPress={() => {
                  if (previewStatus.playing) previewPlayer.pause();
                  else previewPlayer.play();
                }}
                style={styles.previewButton}
              >
                <Ionicons
                  name={previewStatus.playing ? "pause" : "play"}
                  size={22}
                  color={colors.blue}
                />
                <Text style={styles.previewText}>
                  {previewStatus.playing ? "إيقاف المعاينة" : "معاينة التسجيل"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="حذف التسجيل وإعادته"
                testID="voice-message-rerecord"
                onPress={() => void clearPreview()}
                disabled={busy}
                style={styles.iconButton}
              >
                <Ionicons name="trash-outline" size={21} color={colors.muted} />
              </Pressable>
            </View>
          )}

          {errorText ? <Text style={styles.error}>{errorText}</Text> : null}

          {permissionLocked && Platform.OS !== "web" && (
            <Pressable
              accessibilityRole="button"
              onPress={openDeviceSettings}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>فتح إعدادات الجهاز</Text>
            </Pressable>
          )}

          {recorderState.isRecording ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إيقاف التسجيل"
              testID="voice-message-stop"
              onPress={() => void stopRecording()}
              style={styles.primaryButton}
            >
              <Ionicons name="stop" size={20} color={colors.text} />
              <Text style={styles.primaryText}>إيقاف التسجيل</Text>
            </Pressable>
          ) : recordingUri ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="إرسال الرسالة الصوتية"
              testID="voice-message-send"
              onPress={() => void handleSend()}
              disabled={busy}
              style={[styles.primaryButton, busy && styles.disabled]}
            >
              {busy ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Ionicons name="send" size={19} color={colors.text} />
              )}
              <Text style={styles.primaryText}>{busy ? "جارٍ الإرسال" : "إرسال"}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="بدء تسجيل الرسالة الصوتية"
              testID="voice-message-record"
              onPress={() => void startRecording()}
              style={styles.primaryButton}
            >
              <Ionicons name="mic" size={21} color={colors.text} />
              <Text style={styles.primaryText}>بدء التسجيل</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", paddingHorizontal: 22, backgroundColor: colors.background },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800" },
  card: { alignItems: "center", gap: 18, padding: 22, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.incoming },
  iconButton: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  timer: { color: colors.text, fontSize: 32, fontWeight: "800", fontVariant: ["tabular-nums"] },
  privacy: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: "center" },
  preview: { width: "100%", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  previewButton: { flexDirection: "row-reverse", alignItems: "center", gap: 8, minHeight: 44 },
  previewText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  error: { color: colors.red, fontSize: 13, lineHeight: 20, textAlign: "center" },
  primaryButton: { width: "100%", minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, backgroundColor: colors.blueDark },
  primaryText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  secondaryButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 12 },
  secondaryText: { color: colors.blue, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});
