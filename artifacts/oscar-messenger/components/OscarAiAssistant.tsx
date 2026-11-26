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
import {
  createMessengerScheduledMessage,
  listMessengerConversations,
  sendMessengerMessage,
} from "@workspace/api-client-react";
import { apiUrl } from "../lib/api";
import { matchContacts } from "../lib/oscar-ai-messages";
import { baseMessengerAudioContentType, chooseWebAudioMimeType } from "../lib/web-voice";
import {
  hasOscarAiGoogleConsent,
  OSCAR_AI_WAKE_CHANGE_EVENT,
  readOscarAiMessageMode,
  readOscarAiShareLocation,
  readOscarAiVoice,
  readOscarAiWakeEnabled,
  saveOscarAiGoogleConsent,
  type OscarAiVoice,
} from "../lib/oscar-ai-preferences";
import { hasOscarWake, isOscarAiExitPhrase, isOscarWakeOnly } from "../lib/oscar-ai-wake";
import { colors } from "../lib/theme";

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
type LiveResponse = { token: string; model: string; setup?: Record<string, unknown> };


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
  // While a voice message is being recorded the mic goes to the recorder, not to Gemini.
  const recording = useRef<{ lastVoiceAt: number; heardVoice: boolean; startedAt: number } | null>(null);
  const [recordingFor, setRecordingFor] = useState("");
  const cancelRecording = useRef<(() => void) | null>(null);
  const primedContext = useRef<AudioContext | null>(null);
  /** Create and resume the AudioContext inside the tap itself (iOS needs the user gesture). */
  const primeAudio = useCallback(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!primedContext.current || primedContext.current.state === "closed") {
        primedContext.current = new AudioContextCtor();
      }
      void primedContext.current.resume().catch(() => undefined);
    } catch {
      primedContext.current = null;
    }
  }, []);
  // Set while a session holds reserved minutes; ending it gives the unused minutes back.
  const liveSessionAuth = useRef<string | null>(null);
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
    cancelRecording.current?.();
    clearSilenceTimer();
    const reservedBy = liveSessionAuth.current;
    liveSessionAuth.current = null;
    if (reservedBy) {
      void fetch(apiUrl("/api/messenger/ai/live-session/end"), {
        method: "POST",
        headers: { Authorization: `Bearer ${reservedBy}` },
        keepalive: true,
      }).catch(() => undefined);
    }
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
      if (recording.current) return; // recording a voice message: the recorder decides when to stop
      // Say why the session ended instead of silently returning to the button.
      if (!heardReply.current) setError("Oscar AI ماسمعش كلام لمدة ٨ ثوانى فقفل. اتكلم أول ما يقول «بيسمع».");
      stopRef.current();
    }, SILENCE_END_MS);
  }, [clearSilenceTimer]);

  /**
   * «ابعت رسالة لفلان» (owner 2026-11-26): sent from the user's own account as the user.
   * Text written by Gemini carries a small «اتكتبت بـOscar AI» note; a voice message is the
   * user's own recorded voice (recorded here, never sent to Gemini).
   */
  const recordVoiceMessage = useCallback(async (contactName: string): Promise<{ blob: Blob; durationMs: number } | null> => {
    const media = stream.current;
    const mimeType = typeof MediaRecorder !== "undefined"
      ? chooseWebAudioMimeType((type) => MediaRecorder.isTypeSupported(type))
      : null;
    if (!media || !mimeType) throw new Error("التسجيل مش مدعوم فى المتصفح ده.");
    // Let Oscar finish «اتكلم بعد الصفارة» so his voice is not recorded into the message.
    const playing = context.current;
    if (playing) {
      const remainingMs = Math.max(0, (nextPlaybackAt.current - playing.currentTime) * 1_000);
      if (remainingMs) await new Promise((resolve) => setTimeout(resolve, Math.min(remainingMs + 200, 8_000)));
    }
    await playBeep(context.current);
    const recorder = new MediaRecorder(media, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    const startedAt = Date.now();
    recording.current = { lastVoiceAt: startedAt, heardVoice: false, startedAt };
    setRecordingFor(contactName);
    let cancelled = false;
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const state = recording.current;
        const now = Date.now();
        // Stop after 1.5 s of silence once speech started, 6 s with no speech, or 60 s total.
        if (!state || cancelled ||
          (state.heardVoice && now - state.lastVoiceAt > 1_500) ||
          (!state.heardVoice && now - startedAt > 6_000) ||
          now - startedAt > 60_000) {
          clearInterval(check);
          if (recorder.state !== "inactive") recorder.stop();
        }
      }, 200);
      cancelRecording.current = () => {
        cancelled = true;
      };
      recorder.onstop = () => resolve();
      recorder.start(250);
    });
    const heardVoice = recording.current?.heardVoice ?? false;
    recording.current = null;
    cancelRecording.current = null;
    setRecordingFor("");
    if (cancelled || !heardVoice) return null;
    return {
      blob: new Blob(chunks, { type: baseMessengerAudioContentType(mimeType) ?? "audio/webm" }),
      durationMs: Math.min(120_000, Math.max(1, Date.now() - startedAt)),
    };
  }, []);

  const runMessageTool = useCallback(async (name: unknown, args: Record<string, unknown>) => {
    try {
      const said = typeof args.contact_name === "string" ? args.contact_name : "";
      const { conversations } = await listMessengerConversations();
      const matches = matchContacts(conversations, said);
      if (!matches.length) return { error: `مش لاقى حد اسمه «${said}» فى محادثاتك.` };
      if (matches.length > 1) {
        return { error: "فيه أكتر من حد بالاسم ده — اسأل المستخدم يختار.", options: matches.map((match) => match.name) };
      }
      const contact = matches[0];
      if (name === "send_message") {
        const text = typeof args.text === "string" ? args.text.trim() : "";
        if (!text) return { error: "نص الرسالة فاضى." };
        await sendMessengerMessage(contact.conversationId, {
          body: `${text.slice(0, 3_900)}\n\n✍️ اتكتبت بـOscar AI`,
          clientMessageId: `oscar-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        });
        return { result: "sent", to: contact.name };
      }
      if (name === "schedule_message") {
        const text = typeof args.text === "string" ? args.text.trim() : "";
        const sendAt = new Date(typeof args.send_at === "string" ? args.send_at : "");
        if (!text) return { error: "نص الرسالة فاضى." };
        if (Number.isNaN(sendAt.getTime()) || sendAt.getTime() < Date.now() + 60_000) {
          return { error: "الميعاد لازم يكون بعد دقيقة على الأقل من دلوقتى." };
        }
        await createMessengerScheduledMessage(contact.conversationId, {
          body: `${text.slice(0, 3_900)}\n\n✍️ اتكتبت بـOscar AI`,
          scheduledAt: sendAt.toISOString(),
          clientScheduleId: `oscar-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        });
        return {
          result: "scheduled",
          to: contact.name,
          at: sendAt.toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" }),
        };
      }
      if (name === "record_voice_message") {
        const recorded = await recordVoiceMessage(contact.name);
        if (!recorded) return { result: "cancelled", to: contact.name, note: "ماتسجّلش كلام أو المستخدم لغى." };
        const authToken = await getToken();
        if (!authToken) return { error: "انتهت جلسة الدخول." };
        const contentType = baseMessengerAudioContentType(recorded.blob.type) ?? "audio/webm";
        const upload = await fetch(
          apiUrl(`/api/messenger/conversations/${encodeURIComponent(contact.conversationId)}/audio-messages?durationMs=${recorded.durationMs}`),
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${authToken}`,
              "Content-Type": contentType,
              "X-Client-Message-Id": `oscar-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            },
            body: recorded.blob,
          },
        );
        if (!upload.ok) return { error: "تعذر رفع الرسالة الصوتية." };
        return { result: "sent", to: contact.name };
      }
      return { error: "أداة مش معروفة." };
    } catch (toolError) {
      return { error: toolError instanceof Error ? toolError.message : "تعذر إرسال الرسالة." };
    }
  }, [getToken, recordVoiceMessage]);

  const startSession = useCallback(async () => {
    setError("");
    heardReply.current = false;
    setConnecting(true);
    setActive(true);
    try {
      const authToken = await getToken();
      if (!authToken) throw new Error("انتهت جلسة الدخول. سجّل دخولك من جديد.");
      const location = readOscarAiShareLocation() ? await approximateLocation() : null;
      const tokenResponse = await fetch(apiUrl("/api/messenger/ai/live-session"), {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ voice: readOscarAiVoice(), location, messageMode: readOscarAiMessageMode() }),
      });
      const tokenPayload = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok) {
        throw new Error(
          typeof tokenPayload?.error === "string" ? tokenPayload.error : "Oscar AI مش متاح",
        );
      }
      const live = tokenPayload as LiveResponse;
      liveSessionAuth.current = authToken;
      if (!live.token || !live.model) throw new Error("تعذر بدء جلسة Oscar AI.");

      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.current = media;
      const AudioContextCtor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("الصوت المباشر غير مدعوم في هذا المتصفح.");
      // iPhone: an AudioContext made after the awaits above stays suspended, so the mic was
      // never read. Use the one unlocked during the tap (primeAudio) when there is one.
      const primed = primedContext.current;
      primedContext.current = null;
      const audioContext =
        primed && primed.state !== "closed" ? primed : new AudioContextCtor();
      context.current = audioContext;
      await audioContext.resume().catch(() => undefined);
      if (audioContext.state !== "running") {
        throw new Error("الآيفون مافتحش الصوت — اضغط «اتكلم مع Oscar AI» تانى.");
      }

      const liveSocket = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(live.token)}`,
      );
      socket.current = liveSocket;
      // Gemini Live sends its JSON in binary frames; read them as bytes, not "[object Blob]".
      liveSocket.binaryType = "arraybuffer";
      liveSocket.onopen = () => {
        // The server builds the setup (voice · approximate location · date · search) and locks
        // the same setup into the token; older servers do not send one.
        liveSocket.send(JSON.stringify({
          setup: live.setup ?? {
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
            const speaking = Math.sqrt(energy / input.length) > 0.012;
            if (speaking) clearSilenceTimer();
            const takingMessage = recording.current;
            if (takingMessage) {
              if (speaking) {
                takingMessage.lastVoiceAt = Date.now();
                takingMessage.heardVoice = true;
              }
              audioEvent.outputBuffer.getChannelData(0).fill(0);
              return;
            }
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

        const functionCalls = message.toolCall?.functionCalls;
        if (Array.isArray(functionCalls) && functionCalls.length) {
          clearSilenceTimer();
          void (async () => {
            const functionResponses = [];
            for (const call of functionCalls) {
              const response = await runMessageTool(call?.name, call?.args ?? {});
              functionResponses.push({ id: call?.id, name: call?.name, response });
            }
            if (liveSocket.readyState === WebSocket.OPEN) {
              liveSocket.send(JSON.stringify({ toolResponse: { functionResponses } }));
            }
            armSilenceEnd();
          })();
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
  }, [armSilenceEnd, clearSilenceTimer, getToken, runMessageTool]);

  // Starting by voice («أوسكار») has no tap, so unlock audio on the first touch anywhere in
  // the app (iPhone and Android Chrome both block audio until a user gesture). The unlocked
  // context is suspended again right away and resumed when a session starts.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const unlock = () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("touchend", unlock, true);
      if (primedContext.current?.state === "running") return;
      primeAudio();
      const primed = primedContext.current;
      if (primed) {
        void primed.resume()
          .then(() => (socket.current ? undefined : primed.suspend()))
          .catch(() => undefined);
      }
    };
    // Installed Android app (Chrome lets home-screen apps play sound without a tap): try to
    // unlock as soon as the app opens. iPhone always needs one touch; the listeners stay for it.
    primeAudio();
    const opened = primedContext.current;
    if (opened) {
      void opened.resume()
        .then(() => {
          if (opened.state === "running") {
            document.removeEventListener("pointerdown", unlock, true);
            document.removeEventListener("touchend", unlock, true);
            if (!socket.current) void opened.suspend().catch(() => undefined);
          }
        })
        .catch(() => undefined);
    }
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("touchend", unlock, true);
    return () => {
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("touchend", unlock, true);
    };
  }, [primeAudio]);

  const beginSession = useCallback(() => {
    primeAudio();
    if (!hasOscarAiGoogleConsent()) {
      pendingStart.current = true;
      setActive(true);
      setConsentVisible(true);
      return;
    }
    void playOscarHello(readOscarAiVoice())
      .then(() => startSession())
      .catch((playError) => {
        setError(playError instanceof Error ? playError.message : "تعذر تشغيل الرد الصوتي.");
        setActive(false);
      });
  }, [primeAudio, startSession]);

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

  // Load the recorded «أيوه، سامعك» once when the app opens, so it plays without a delay.
  useEffect(() => {
    if (Platform.OS === "web" && typeof Audio !== "undefined") helloClip(readOscarAiVoice());
  }, []);

  // Keep the screen on while Oscar AI is listening: a sleeping screen hides the page and
  // ends the session (owner: «الشاشه نامت و لما فتحت لقيت أوسكار هام»).
  useEffect(() => {
    if (!active || Platform.OS !== "web" || typeof navigator === "undefined") return;
    const wakeLockApi = (navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    }).wakeLock;
    if (!wakeLockApi) return;
    let lock: { release: () => Promise<void> } | null = null;
    let stopped = false;
    void wakeLockApi.request("screen").then((acquired) => {
      if (stopped) void acquired.release().catch(() => undefined);
      else lock = acquired;
    }).catch(() => undefined);
    return () => {
      stopped = true;
      if (lock) void lock.release().catch(() => undefined);
    };
  }, [active]);

  const acceptConsent = () => {
    primeAudio();
    saveOscarAiGoogleConsent();
    setConsentVisible(false);
    if (pendingStart.current) {
      pendingStart.current = false;
      void playOscarHello(readOscarAiVoice())
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
            <Text style={styles.title}>
              {connecting ? "بيفتح Oscar AI…" : recordingFor ? `🎙️ بيسجّل رسالة لـ${recordingFor} — اتكلم` : "بيسمع"}
            </Text>
            <Text style={styles.subtitle}>
              {recordingFor ? "بيتبعت لوحده لما تسكت ثانية ونص" : "الجلسة مؤقتة ولا تُحفظ المحادثة"}
            </Text>
          </View>
          {connecting && <ActivityIndicator color={colors.blue} />}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="إنهاء Oscar AI"
            onPress={() => (recordingFor ? cancelRecording.current?.() : stopSession())}
            style={styles.endButton}
          >
            <Text style={styles.endText}>{recordingFor ? "إلغاء الرسالة" : "إنهاء"}</Text>
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

// «أيوه، سامعك» is a recorded clip (copied from drive-web/voice/<male|female>) shipped with the
// app itself, so it plays at once from the app/service-worker cache instead of another site.
const HELLO_CLIPS: Record<OscarAiVoice, string> = {
  male: "/oscar-messenger/voice/oscar-hello-male.mp3",
  female: "/oscar-messenger/voice/oscar-hello-female.mp3",
};
const helloAudio: Partial<Record<OscarAiVoice, HTMLAudioElement>> = {};
function helloClip(voice: OscarAiVoice): HTMLAudioElement {
  const cached = helloAudio[voice];
  if (cached) return cached;
  const audio = new Audio(HELLO_CLIPS[voice]);
  audio.preload = "auto";
  helloAudio[voice] = audio;
  return audio;
}

/** Approximate position (~1 km) for weather/nearby questions; null if refused or slow. */
function approximateLocation(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4_000);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        resolve({
          lat: Math.round(position.coords.latitude * 100) / 100,
          lng: Math.round(position.coords.longitude * 100) / 100,
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 4_000 },
    );
  });
}

/** Short «بيب» before recording a voice message. */
async function playBeep(audioContext: AudioContext | null): Promise<void> {
  if (!audioContext || audioContext.state !== "running") return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = 880;
  gain.gain.value = 0.08;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.2);
  await new Promise((resolve) => setTimeout(resolve, 300));
}

async function playOscarHello(voice: OscarAiVoice): Promise<void> {
  const audio = helloClip(voice);
  audio.currentTime = 0;
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
