import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiUrl } from "../lib/api";
import {
  hasOscarAiGoogleConsent,
  OSCAR_AI_WAKE_CHANGE_EVENT,
  readOscarAiWakeEnabled,
  saveOscarAiGoogleConsent,
} from "../lib/oscar-ai-preferences";
import { hasOscarWake, isOscarAiExitPhrase, isOscarWakeOnly } from "../lib/oscar-ai-wake";
import { colors } from "../lib/theme";

const DRIVE_VOICE_ORIGIN = "https://drive.oscardevs.com";
const MAX_SESSION_MS = 5 * 60_000;
const SILENCE_END_MS = 8_000;
const INPUT_RATE = 16_000;
const OUTPUT_RATE = 24_000;
const SYSTEM_INSTRUCTION =
  "أنت Oscar AI، مساعد بالعامية المصرية. ردودك قصيرة وواضحة. لا تحفظ أو تطلب حفظ المحادثة.";

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionConstructor = new () => RecognitionLike;
type LiveResponse = { token: string; model: string };


const liveTextDecoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;

/** Gemini Live frames arrive as text or as binary (ArrayBuffer) JSON. */
export function parseLiveMessage(data: unknown): any | null {
  try {
    if (typeof data === "string") return JSON.parse(data);
    if (data instanceof ArrayBuffer && liveTextDecoder) {
      return JSON.parse(liveTextDecoder.decode(new Uint8Array(data)));
    }
    if (ArrayBuffer.isView(data) && liveTextDecoder) {
      return JSON.parse(liveTextDecoder.decode(data as ArrayBufferView));
    }
  } catch {
    // Not a JSON frame.
  }
  return null;
}

export function OscarAiAssistant({ getToken }: { getToken: () => Promise<string | null> }) {
  const [wakeEnabled, setWakeEnabled] = useState(false);
  const [active, setActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [error, setError] = useState("");
  const pendingStart = useRef(false);
  const recognition = useRef<RecognitionLike | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const source = useRef<MediaStreamAudioSourceNode | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heardReply = useRef(false);
  const sessionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextPlaybackAt = useRef(0);
  const startRef = useRef<() => void>(() => undefined);
  const stopRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const syncWakePreference = () => setWakeEnabled(readOscarAiWakeEnabled());
    syncWakePreference();
    window.addEventListener(OSCAR_AI_WAKE_CHANGE_EVENT, syncWakePreference);
    return () => window.removeEventListener(OSCAR_AI_WAKE_CHANGE_EVENT, syncWakePreference);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const updateVisibility = () => setPageVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
  }, []);

  const stopSession = useCallback(() => {
    clearSilenceTimer();
    if (sessionTimer.current) clearTimeout(sessionTimer.current);
    sessionTimer.current = null;
    processor.current?.disconnect();
    source.current?.disconnect();
    processor.current = null;
    source.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    socket.current?.close();
    socket.current = null;
    const audioContext = context.current;
    context.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
    nextPlaybackAt.current = 0;
    setConnecting(false);
    setActive(false);
  }, [clearSilenceTimer]);

  const armSilenceEnd = useCallback(() => {
    clearSilenceTimer();
    silenceTimer.current = setTimeout(() => {
      // Say why the session ended instead of silently returning to the button.
      if (!heardReply.current) setError("Oscar AI ماسمعش كلام لمدة ٨ ثوانى فقفل. اتكلم أول ما يقول «بيسمع».");
      stopRef.current();
    }, SILENCE_END_MS);
  }, [clearSilenceTimer]);

  const startSession = useCallback(async () => {
    setError("");
    heardReply.current = false;
    setConnecting(true);
    setActive(true);
    try {
      const authToken = await getToken();
      if (!authToken) throw new Error("انتهت جلسة الدخول. سجّل دخولك من جديد.");
      const tokenResponse = await fetch(apiUrl("/api/messenger/ai/live-session"), {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const tokenPayload = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok) {
        throw new Error(
          typeof tokenPayload?.error === "string" ? tokenPayload.error : "Oscar AI مش متاح",
        );
      }
      const live = tokenPayload as LiveResponse;
      if (!live.token || !live.model) throw new Error("تعذر بدء جلسة Oscar AI.");

      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.current = media;
      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("الصوت المباشر غير مدعوم في هذا المتصفح.");
      const audioContext = new AudioContextCtor();
      context.current = audioContext;
      await audioContext.resume();

      const liveSocket = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(live.token)}`,
      );
      socket.current = liveSocket;
      // Gemini Live sends its JSON in binary frames; read them as bytes, not "[object Blob]".
      liveSocket.binaryType = "arraybuffer";
      liveSocket.onopen = () => {
        liveSocket.send(JSON.stringify({
          setup: {
            model: `models/${live.model}`,
            generationConfig: { responseModalities: ["AUDIO"] },
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            inputAudioTranscription: {},
          },
        }));
      };
      liveSocket.onerror = () => {
        setError("انقطع اتصال Oscar AI. جرّب مرة تانية.");
        stopRef.current();
      };
      liveSocket.onclose = (event) => {
        if (socket.current !== liveSocket) return;
        // Closed by Gemini, not by us: show the code so the cause can be diagnosed.
        const reason = String(event.reason || "").slice(0, 160);
        setError(`Gemini قفل الاتصال (كود ${event.code}${reason ? `: ${reason}` : ""}).`);
        stopRef.current();
      };
      liveSocket.onmessage = (event) => {
        const message = parseLiveMessage(event.data);
        if (!message) return;
        if (message.setupComplete) {
          setConnecting(false);
          armSilenceEnd();
          const micSource = audioContext.createMediaStreamSource(media);
          const micProcessor = audioContext.createScriptProcessor(4096, 1, 1);
          source.current = micSource;
          processor.current = micProcessor;
          micProcessor.onaudioprocess = (audioEvent) => {
            const input = audioEvent.inputBuffer.getChannelData(0);
            let energy = 0;
            for (let index = 0; index < input.length; index += 1) {
              energy += input[index] * input[index];
            }
            if (Math.sqrt(energy / input.length) > 0.012) clearSilenceTimer();
            if (liveSocket.readyState !== WebSocket.OPEN) return;
            const pcm = toPcm16(resample(input, audioContext.sampleRate, INPUT_RATE));
            liveSocket.send(JSON.stringify({
              realtimeInput: {
                audio: {
                  mimeType: `audio/pcm;rate=${INPUT_RATE}`,
                  data: bytesToBase64(pcm),
                },
              },
            }));
            const output = audioEvent.outputBuffer.getChannelData(0);
            output.fill(0);
          };
          micSource.connect(micProcessor);
          micProcessor.connect(audioContext.destination);
        }

        const inputText = message.serverContent?.inputTranscription?.text;
        if (typeof inputText === "string" && isOscarAiExitPhrase(inputText)) {
          stopRef.current();
          return;
        }
        if (message.voiceActivity?.type === "ACTIVITY_START") clearSilenceTimer();
        const parts = message.serverContent?.modelTurn?.parts ?? [];
        for (const part of parts) {
          const data = part.inlineData?.data;
          if (typeof data === "string" && context.current) {
            heardReply.current = true;
            playPcm(data, context.current, nextPlaybackAt);
          }
        }
        if (message.serverContent?.turnComplete) armSilenceEnd();
        if (message.serverContent?.interrupted) {
          clearSilenceTimer();
          armSilenceEnd();
        }
      };
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("تأخر اتصال Gemini Live.")), 12_000);
        const onSetup = (event: MessageEvent) => {
          try {
            if (parseLiveMessage(event.data)?.setupComplete) {
              clearTimeout(timeout);
              liveSocket.removeEventListener("message", onSetup);
              resolve();
            }
          } catch {
            // Other Live messages are handled by the main listener.
          }
        };
        liveSocket.addEventListener("message", onSetup);
        liveSocket.addEventListener("error", () => {
          clearTimeout(timeout);
          reject(new Error("تعذر فتح اتصال Gemini Live."));
        }, { once: true });
      });
      setConnecting(false);
      sessionTimer.current = setTimeout(() => stopRef.current(), MAX_SESSION_MS);
      armSilenceEnd();
    } catch (startError) {
      const message =
        startError instanceof Error && startError.message
          ? startError.message
          : "تعذر بدء Oscar AI.";
      setError(message);
      stopRef.current();
    }
  }, [armSilenceEnd, clearSilenceTimer, getToken]);

  const beginSession = useCallback(() => {
    if (!hasOscarAiGoogleConsent()) {
      pendingStart.current = true;
      setActive(true);
      setConsentVisible(true);
      return;
    }
    void playOscarHello()
      .then(() => startSession())
      .catch((playError) => {
        setError(playError instanceof Error ? playError.message : "تعذر تشغيل الرد الصوتي.");
        setActive(false);
      });
  }, [startSession]);

  startRef.current = beginSession;
  stopRef.current = stopSession;

  useEffect(() => {
    if (Platform.OS !== "web" || !wakeEnabled || active || !pageVisible) return;
    const page = window as Window & {
      SpeechRecognition?: RecognitionConstructor;
      webkitSpeechRecognition?: RecognitionConstructor;
    };
    const Recognition = page.SpeechRecognition || page.webkitSpeechRecognition;
    if (!Recognition) return;

    const detector = new Recognition();
    let disposed = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    detector.continuous = true;
    detector.interimResults = true;
    detector.lang = "ar-EG";
    recognition.current = detector;
    detector.onresult = (event) => {
      const heard = Array.from(event.results)
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript ?? "");
      if (heard.some((text) => isOscarWakeOnly(text) && hasOscarWake(text))) {
        disposed = true;
        detector.stop();
        startRef.current();
      }
    };
    detector.onerror = () => {
      if (!disposed) setError("تعذر تشغيل النداء الصوتي في هذا المتصفح.");
    };
    detector.onend = () => {
      if (!disposed && wakeEnabled && !active && pageVisible) {
        restartTimer = setTimeout(() => {
          try { detector.start(); } catch { /* browser may still be closing the prior session */ }
        }, 500);
      }
    };
    try {
      detector.start();
    } catch {
      setError("تعذر تشغيل النداء الصوتي في هذا المتصفح.");
    }
    const onPageHide = () => stopRef.current();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      disposed = true;
      if (restartTimer) clearTimeout(restartTimer);
      window.removeEventListener("pagehide", onPageHide);
      detector.stop();
      if (recognition.current === detector) recognition.current = null;
    };
  }, [active, pageVisible, wakeEnabled]);

  useEffect(() => {
    if (!pageVisible && active) stopSession();
  }, [active, pageVisible, stopSession]);

  const acceptConsent = () => {
    saveOscarAiGoogleConsent();
    setConsentVisible(false);
    if (pendingStart.current) {
      pendingStart.current = false;
      void playOscarHello()
        .then(() => startSession())
        .catch((playError) => {
          setError(playError instanceof Error ? playError.message : "تعذر تشغيل الرد الصوتي.");
          setActive(false);
        });
    } else {
      setActive(false);
    }
  };

  const declineConsent = () => {
    pendingStart.current = false;
    setConsentVisible(false);
    setActive(false);
  };

  if (Platform.OS !== "web") return null;
  return (
    <View style={styles.wrap}>
      {active ? (
        <View style={styles.activeRow}>
          <View style={styles.activeCopy}>
            <Text style={styles.title}>{connecting ? "بيفتح Oscar AI…" : "بيسمع"}</Text>
            <Text style={styles.subtitle}>الجلسة مؤقتة ولا تُحفظ المحادثة</Text>
          </View>
          {connecting && <ActivityIndicator color={colors.blue} />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إنهاء Oscar AI"
            onPress={stopSession}
            style={styles.endButton}
          >
            <Text style={styles.endText}>إنهاء</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={beginSession}
          style={({ pressed }) => [styles.startButton, pressed && styles.pressed]}
        >
          <Text style={styles.startText}>اتكلم مع Oscar AI</Text>
        </Pressable>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Modal
        visible={consentVisible}
        transparent
        animationType="fade"
        onRequestClose={declineConsent}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>قبل ما تبدأ</Text>
            <Text style={styles.subtitle}>
              Oscar AI تجريبي وبيستخدم Gemini من جوجل؛ كلامك بيتبعت لجوجل وممكن يستخدموه لتحسين خدماتهم.
            </Text>
            <Pressable accessibilityRole="button" onPress={acceptConsent} style={styles.acceptButton}>
              <Text style={styles.acceptText}>موافق</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={declineConsent} style={styles.cancelButton}>
              <Text style={styles.subtitle}>إلغاء</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

async function playOscarHello(): Promise<void> {
  // Existing "أيوه، سامعك" entry in drive-web/voice/male/manifest.json.
  const audio = new Audio(
    `${DRIVE_VOICE_ORIGIN}/voice/male/3c2a4bcd46dac795339647e8d2028af3.mp3`,
  );
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("تعذر تشغيل مقطع «أيوه»."));
    void audio.play().catch(() => reject(new Error("اسمح بتشغيل الصوت ثم حاول مرة تانية.")));
  });
}

function resample(input: Float32Array, sourceRate: number, targetRate: number): Float32Array {
  if (sourceRate === targetRate) return input;
  const outputLength = Math.floor(input.length * targetRate / sourceRate);
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;
  for (let index = 0; index < outputLength; index += 1) {
    output[index] = input[Math.min(Math.floor(index * ratio), input.length - 1)] ?? 0;
  }
  return output;
}

function toPcm16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, input[index]));
    output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function bytesToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function playPcm(
  base64: string,
  audioContext: AudioContext,
  nextAt: { current: number },
): void {
  const binary = atob(base64);
  const sampleCount = Math.floor(binary.length / 2);
  const audioBuffer = audioContext.createBuffer(1, sampleCount, OUTPUT_RATE);
  const channel = audioBuffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = (binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8));
    channel[index] = (sample & 0x8000 ? sample - 0x10000 : sample) / 0x8000;
  }
  const player = audioContext.createBufferSource();
  player.buffer = audioBuffer;
  player.connect(audioContext.destination);
  const startAt = Math.max(audioContext.currentTime, nextAt.current);
  player.start(startAt);
  nextAt.current = startAt + audioBuffer.duration;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12, gap: 8 },
  startButton: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: colors.blue },
  startText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
  activeRow: { minHeight: 58, flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 11, borderRadius: 15, borderWidth: 1, borderColor: colors.blue, backgroundColor: colors.surface },
  activeCopy: { flex: 1, alignItems: "flex-end", gap: 2 },
  title: { color: colors.text, textAlign: "right", fontSize: 15, fontWeight: "800" },
  subtitle: { color: colors.muted, textAlign: "right", fontSize: 13, lineHeight: 20 },
  endButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#3A2029" },
  endText: { color: "#FF968E", fontWeight: "800" },
  error: { color: colors.red, fontSize: 13, textAlign: "right" },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#000000B8" },
  modalCard: { width: "100%", maxWidth: 440, alignSelf: "center", borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 14 },
  acceptButton: { minHeight: 46, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: colors.blue },
  acceptText: { color: "#FFFFFF", fontWeight: "800" },
  cancelButton: { minHeight: 40, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.82 },
});
