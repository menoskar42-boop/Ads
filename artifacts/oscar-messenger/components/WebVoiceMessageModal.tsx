import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  baseMessengerAudioContentType,
  chooseWebAudioMimeType,
  webMicrophoneErrorMessage,
  type MessengerAudioContentType,
} from "../lib/web-voice";
import { readableError } from "../lib/format";
import { colors } from "../lib/theme";

const MIN_RECORDING_MS = 500;

export function WebVoiceMessageModal({
  visible,
  busy,
  maxDurationMs,
  maxBytes,
  onClose,
  onSend,
}: {
  visible: boolean;
  busy: boolean;
  maxDurationMs: number;
  maxBytes: number;
  onClose: () => void;
  onSend: (
    uri: string,
    durationMs: number,
    contentType: MessengerAudioContentType,
  ) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const startAtRef = useRef(0);
  const operationRef = useRef(0);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingContentType, setRecordingContentType] =
    useState<MessengerAudioContentType | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [errorText, setErrorText] = useState("");

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const clearRecording = () => {
    previewRef.current?.pause();
    previewRef.current = null;
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    recordingUrlRef.current = null;
    setRecordingUrl(null);
    setRecordingContentType(null);
    setDurationMs(0);
    setElapsedMs(0);
    setPreviewing(false);
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const cancel = () => {
    operationRef.current += 1;
    cancelledRef.current = true;
    clearTimer();
    stopRecording();
    stopTracks();
    clearRecording();
    setRecording(false);
    setErrorText("");
    onClose();
  };

  useEffect(
    () => () => {
      operationRef.current += 1;
      clearTimer();
      stopRecording();
      stopTracks();
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
    },
    [],
  );

  const startRecording = async () => {
    setErrorText("");
    clearRecording();
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorText("المتصفح أو الاتصال الحالي لا يتيح استخدام الميكروفون.");
      return;
    }
    const supportedType =
      typeof MediaRecorder !== "undefined"
        ? chooseSupportedType()
        : null;
    if (!supportedType) {
      setErrorText("المتصفح لا يدعم تسجيل الصوت. جرّب متصفحًا أحدث أو تطبيق الهاتف.");
      return;
    }

    const operation = ++operationRef.current;
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (operation !== operationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: supportedType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      startAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setErrorText("تعذر تسجيل الصوت. جرّب مرة أخرى.");
        clearTimer();
        stopTracks();
        setRecording(false);
      };
      recorder.onstop = () => {
        clearTimer();
        stopTracks();
        recorderRef.current = null;
        setRecording(false);
        if (cancelledRef.current) return;
        const finalDuration = Math.min(maxDurationMs, Date.now() - startAtRef.current);
        const contentType = baseMessengerAudioContentType(
          recorder.mimeType || supportedType,
        );
        if (!contentType) {
          setErrorText("صيغة التسجيل غير مدعومة. جرّب متصفحًا أحدث.");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: contentType });
        chunksRef.current = [];
        if (finalDuration < MIN_RECORDING_MS || blob.size === 0) {
          setErrorText("التسجيل قصير جدًا. سجّل لمدة أطول من فضلك.");
          return;
        }
        if (blob.size > maxBytes) {
          setErrorText("حجم التسجيل أكبر من الحد المسموح. سجّل رسالة أقصر.");
          return;
        }
        const url = URL.createObjectURL(blob);
        recordingUrlRef.current = url;
        setRecordingUrl(url);
        setRecordingContentType(contentType);
        setDurationMs(finalDuration);
        setElapsedMs(finalDuration);
      };
      recorder.start(250);
      setRecording(true);
      timerRef.current = setInterval(() => {
        const elapsed = Math.min(maxDurationMs, Date.now() - startAtRef.current);
        setElapsedMs(elapsed);
        if (elapsed >= maxDurationMs) stopRecording();
      }, 250);
    } catch (error) {
      stopTracks();
      const name = error instanceof DOMException ? error.name : "";
      let microphoneMessage: string | null = null;
      if (name === "NotAllowedError" || name === "SecurityError") {
        let permissionState = "unsupported";
        try {
          const permission = await navigator.permissions?.query({
            name: "microphone" as PermissionName,
          });
          if (permission) permissionState = permission.state;
        } catch {
          // Some browsers do not expose microphone permission queries.
        }
        microphoneMessage = webMicrophoneErrorMessage(
          name,
          permissionState,
          navigator.userAgent,
        );
      } else {
        microphoneMessage = webMicrophoneErrorMessage(
          name,
          "unsupported",
          navigator.userAgent,
        );
      }
      setErrorText(
        microphoneMessage ??
          readableError(error, "تعذر بدء التسجيل. تحقق من إذن الميكروفون وحاول مرة أخرى."),
      );
    }
  };

  const togglePreview = async () => {
    if (!recordingUrl) return;
    if (!previewRef.current) {
      previewRef.current = new Audio(recordingUrl);
      previewRef.current.onended = () => setPreviewing(false);
    }
    const audio = previewRef.current;
    if (audio.paused) {
      try {
        await audio.play();
        setPreviewing(true);
      } catch (error) {
        setErrorText(readableError(error, "تعذر تشغيل معاينة التسجيل."));
      }
    } else {
      audio.pause();
      setPreviewing(false);
    }
  };

  const sendRecording = async () => {
    if (!recordingUrl || busy) return;
    if (!recordingContentType) {
      setErrorText("صيغة التسجيل غير مدعومة. سجّل الرسالة مرة أخرى.");
      return;
    }
    try {
      await onSend(recordingUrl, durationMs, recordingContentType);
      cancel();
    } catch (error) {
      setErrorText(
        readableError(error, "تعذر إرسال التسجيل. تحقق من الاتصال وحاول مرة أخرى."),
      );
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={cancel}
    >
      <View
        style={[
          styles.screen,
          { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 22 },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>رسالة صوتية</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            testID="web-voice-close"
            disabled={busy}
            onPress={cancel}
            style={styles.iconButton}
          >
            <Ionicons name="close" size={25} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.card}>
          <Ionicons
            name={recording ? "radio-button-on" : "mic-outline"}
            size={42}
            color={recording ? colors.blue : colors.muted}
          />
          <Text style={styles.timer}>{formatDuration(recording ? elapsedMs : durationMs)}</Text>
          <Text style={styles.hint}>
            لن يبدأ التسجيل إلا بعد ضغطك. الحد الأقصى دقيقتان.
          </Text>
          {recordingUrl && !recording && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={previewing ? "إيقاف معاينة التسجيل" : "معاينة التسجيل"}
              testID="web-voice-preview"
              onPress={() => void togglePreview()}
              style={styles.previewButton}
            >
              <Ionicons name={previewing ? "pause" : "play"} size={20} color={colors.blue} />
              <Text style={styles.previewText}>
                {previewing ? "إيقاف المعاينة" : "استمع للتسجيل"}
              </Text>
            </Pressable>
          )}
          {!!errorText && <Text style={styles.error}>{errorText}</Text>}
          {recording ? (
            <Pressable
              accessibilityRole="button"
              testID="web-voice-stop"
              onPress={stopRecording}
              style={styles.primaryButton}
            >
              <Ionicons name="stop" size={20} color={colors.text} />
              <Text style={styles.primaryText}>إيقاف التسجيل</Text>
            </Pressable>
          ) : recordingUrl ? (
            <Pressable
              accessibilityRole="button"
              testID="web-voice-send"
              disabled={busy}
              onPress={() => void sendRecording()}
              style={[styles.primaryButton, busy && styles.disabled]}
            >
              {busy ? <ActivityIndicator color={colors.text} /> : <Ionicons name="send" size={19} color={colors.text} />}
              <Text style={styles.primaryText}>{busy ? "جارٍ الإرسال" : "إرسال"}</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              testID="web-voice-record"
              onPress={() => void startRecording()}
              style={styles.primaryButton}
            >
              <Ionicons name="mic" size={21} color={colors.text} />
              <Text style={styles.primaryText}>بدء التسجيل</Text>
            </Pressable>
          )}
          {!recording && (
            <Pressable
              accessibilityRole="button"
              testID="web-voice-cancel"
              disabled={busy}
              onPress={cancel}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>إلغاء</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function chooseSupportedType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return chooseWebAudioMimeType((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
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
  card: { alignItems: "center", gap: 16, padding: 22, borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.incoming },
  iconButton: { minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" },
  timer: { color: colors.text, fontSize: 32, fontWeight: "800", fontVariant: ["tabular-nums"] },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: "center" },
  previewButton: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  previewText: { color: colors.text, fontSize: 14, fontWeight: "700" },
  error: { color: colors.red, fontSize: 13, lineHeight: 20, textAlign: "center" },
  primaryButton: { width: "100%", minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderRadius: 16, backgroundColor: colors.blueDark },
  primaryText: { color: colors.text, fontSize: 15, fontWeight: "800" },
  cancelButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 12 },
  cancelText: { color: colors.muted, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.55 },
});
