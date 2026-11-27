import { useCallback, useRef, useState } from "react";
import { apiUrl } from "../lib/api";
import { isOscarAiExitPhrase } from "../lib/oscar-ai-wake";
import {
  frameTurnBody,
  oscarAiSpeechOutput,
  trimTurnHistory,
  type TurnContent,
} from "../lib/oscar-ai-turn";
import { baseMessengerAudioContentType, chooseWebAudioMimeType } from "../lib/web-voice";

// Oscar AI «بالأدوار» (owner 2026-11-27, option أ): record one turn ⇒ one Flash-Lite request that
// returns what the user said (shown on screen) + the reply ⇒ the phone reads it ⇒ listen again.
// Gemini Live stays the default; this runs only when the setting is «بالأدوار».

export type TurnPhase = "idle" | "starting" | "listening" | "thinking" | "speaking";

const MAX_SESSION_MS = 10 * 60_000;
// Lower threshold to avoid dropping quiet speech and laptop microphones.
const SPEECH_RMS = 0.0015;
const END_OF_TURN_SILENCE_MS = 1_200;
const NO_SPEECH_END_MS = 15_000;
const MAX_TURN_MS = 30_000;
const MAX_TOOL_ROUNDS = 2;

type TurnResult = {
  transcript?: string;
  reply?: string;
  modelContent?: TurnContent;
  functionCalls?: Array<{ name?: string; args?: Record<string, unknown> }>;
};

type Session = {
  cancelled: boolean;
  abort: AbortController | null;
  stopListening: (() => void) | null;
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  history: TurnContent[];
};

class EndSession extends Error {}

export function useOscarAiTurn(options: {
  getToken: () => Promise<string | null>;
  runMessageTool: (name: unknown, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  /** The AudioContext unlocked during the tap (iPhone), used to hear when the user stops talking. */
  takeAudioContext: () => AudioContext | null;
  getSessionOptions: () => Promise<{ voice: string; location: { lat: number; lng: number } | null }>;
  onEnd: (message?: string) => void;
}) {
  const { getToken, runMessageTool, takeAudioContext, getSessionOptions, onEnd } = options;
  const [phase, setPhase] = useState<TurnPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [notice, setNotice] = useState("");
  const session = useRef<Session | null>(null);

  const stop = useCallback(() => {
    const current = session.current;
    session.current = null;
    oscarAiSpeechOutput.stop();
    if (current) {
      current.cancelled = true;
      current.abort?.abort();
      current.stopListening?.();
      current.stream?.getTracks().forEach((track) => track.stop());
      const audioContext = current.audioContext;
      if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => undefined);
    }
    setPhase("idle");
  }, []);

  /** «قاطع»: stop reading the reply and listen again. */
  const interrupt = useCallback(() => {
    oscarAiSpeechOutput.stop();
  }, []);

  const post = useCallback(async (current: Session, path: string, body: Blob | string, json: boolean) => {
    const authToken = await getToken();
    if (!authToken) throw new EndSession("انتهت جلسة الدخول. سجّل دخولك من جديد.");
    const abort = new AbortController();
    current.abort = abort;
    const timeout = setTimeout(() => abort.abort(), 30_000);
    try {
      const response = await fetch(apiUrl(path), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": json ? "application/json" : "application/octet-stream",
        },
        body,
        signal: abort.signal,
      });
      const payload = await response.json().catch(() => ({}));
      const error = typeof payload?.error === "string" ? payload.error : "Oscar AI ماقدرش يرد. جرّب تانى.";
      // Out of turns, busy, or not configured: end with the reason. Other failures: try the next turn.
      if (response.status === 429 || response.status === 503 || response.status === 401) throw new EndSession(error);
      if (!response.ok) return { error } as TurnResult & { error: string };
      return payload as TurnResult;
    } catch (error) {
      if (error instanceof EndSession) throw error;
      if (current.cancelled) throw new EndSession();
      return { error: "النت بطىء أو مقطوع — قول تانى." } as TurnResult & { error: string };
    } finally {
      clearTimeout(timeout);
      current.abort = null;
    }
  }, [getToken]);

  /** Records until the user stops talking. null ⇒ no speech at all. */
  const listen = useCallback((current: Session, analyser: AnalyserNode | null, mimeType: string) =>
    new Promise<Blob | null>((resolve) => {
      const stream = current.stream;
      if (!stream) {
        resolve(null);
        return;
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      let lastVoiceAt = startedAt;
      let heardVoice = !analyser; // no level meter ⇒ keep the whole turn and let Gemini decide
      const samples = analyser ? new Float32Array(analyser.fftSize) : null;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const check = setInterval(() => {
        const now = Date.now();
        if (analyser && samples) {
          analyser.getFloatTimeDomainData(samples);
          let energy = 0;
          for (let index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index];
          if (Math.sqrt(energy / samples.length) > SPEECH_RMS) {
            heardVoice = true;
            lastVoiceAt = now;
          }
        }
        const finished = analyser
          ? (heardVoice && now - lastVoiceAt > END_OF_TURN_SILENCE_MS) ||
            (!heardVoice && now - startedAt > NO_SPEECH_END_MS) ||
            now - startedAt > MAX_TURN_MS
          : now - startedAt > 6_000;
        if (finished || current.cancelled) current.stopListening?.();
      }, 100);
      current.stopListening = () => {
        clearInterval(check);
        current.stopListening = null;
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.onstop = () => {
        clearInterval(check);
        if (current.cancelled || !chunks.length) {
          resolve(null);
          return;
        }
        resolve(new Blob(chunks, { type: baseMessengerAudioContentType(mimeType) ?? "audio/webm" }));
      };
      recorder.start(250);
    }), []);

  const start = useCallback(async () => {
    stop();
    const current: Session = {
      cancelled: false,
      abort: null,
      stopListening: null,
      stream: null,
      audioContext: null,
      history: [],
    };
    session.current = current;
    setTranscript("");
    setReply("");
    setNotice("");
    setPhase("starting");
    const startedAt = Date.now();
    let endMessage: string | undefined;
    try {
      const mimeType = typeof MediaRecorder !== "undefined"
        ? chooseWebAudioMimeType((type) => MediaRecorder.isTypeSupported(type))
        : null;
      if (!mimeType) throw new EndSession("التسجيل مش مدعوم فى المتصفح ده.");
      const audioContext = takeAudioContext();
      current.audioContext = audioContext;
      try {
        current.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        throw new EndSession("Oscar AI محتاج إذن المايك. اسمح بيه من إعدادات المتصفح وجرّب تانى.");
      }
      if (current.cancelled) return;
      let analyser: AnalyserNode | null = null;
      if (audioContext) {
        await audioContext.resume().catch(() => undefined);
        if (audioContext.state === "running") {
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 2048;
          // Keep the analyser graph active without playing microphone audio through the speakers.
          const silentMonitor = audioContext.createGain();
          silentMonitor.gain.value = 0;
          const microphoneSource = audioContext.createMediaStreamSource(current.stream);
          microphoneSource.connect(analyser);
          analyser.connect(silentMonitor);
          silentMonitor.connect(audioContext.destination);
        }
      }
      const sessionOptions = await getSessionOptions();
      const contentType = baseMessengerAudioContentType(mimeType) ?? "audio/webm";

      while (!current.cancelled) {
        if (Date.now() - startedAt > MAX_SESSION_MS) {
          throw new EndSession("الجلسة خلصت (١٠ دقايق). اضغط «اتكلم مع Oscar AI» لو عايز تكمّل.");
        }
        setPhase("listening");
        const audio = await listen(current, analyser, mimeType);
        if (current.cancelled) return;
        if (!audio) {
          setNotice("ماسمعتش كلام واضح. اتكلم تاني، وأنا لسه معاك.");
          continue;
        }

        setPhase("thinking");
        setNotice("");
        const history = trimTurnHistory(current.history);
        let result = await post(current, "/api/messenger/ai/turn", await frameTurnBody({
          mimeType: contentType,
          history,
          ...sessionOptions,
        }, audio), false);
        if (current.cancelled) return;
        if ("error" in result) {
          setNotice(String(result.error));
          continue;
        }
        const said = (result.transcript ?? "").trim();
        setTranscript(said || "(ماتفهمش)");
        // «خلاص» / «شكراً» alone ends; a longer request that happens to contain «شكراً» does not.
        if (said && said.split(/\s+/).length <= 3 && isOscarAiExitPhrase(said)) throw new EndSession();
        current.history = [...history, { role: "user", parts: [{ text: said || "…" }] }];
        if (result.modelContent) current.history.push(result.modelContent);

        // Tools (send / schedule a message). The model was told to get an explicit «ابعت» first.
        for (let round = 0; round < MAX_TOOL_ROUNDS && result.functionCalls?.length; round += 1) {
          const responses = [];
          for (const call of result.functionCalls) {
            const response = await runMessageTool(call?.name, call?.args ?? {});
            responses.push({ functionResponse: { name: call?.name, response } });
          }
          if (current.cancelled) return;
          current.history.push({ role: "user", parts: responses });
          result = await post(current, "/api/messenger/ai/turn/follow-up", JSON.stringify({
            contents: current.history,
            ...sessionOptions,
          }), true);
          if (current.cancelled) return;
          if ("error" in result) {
            setNotice(String(result.error));
            break;
          }
          if (result.modelContent) current.history.push(result.modelContent);
        }

        const answer = ("error" in result ? "" : result.reply ?? "").trim();
        setReply(answer);
        if (answer) {
          setPhase("speaking");
          const spoken = await oscarAiSpeechOutput.speak(answer, {
            getToken,
            voice: sessionOptions.voice,
            audioContext: current.audioContext,
          });
          if (spoken === "unavailable") {
            setNotice(oscarAiSpeechOutput.provider === "gemini-tts"
              ? "تعذر تشغيل صوت Gemini TTS. الرد مكتوب قدامك، وتقدر تغيّر المحرك من الإعدادات."
              : "المتصفح مش قادر ينطق بالعربى. الرد مكتوب قدامك، وتقدر تختار Gemini TTS من الإعدادات.");
          }
        }
        current.history = trimTurnHistory(current.history);
      }
    } catch (error) {
      if (error instanceof EndSession) endMessage = error.message || undefined;
      else endMessage = error instanceof Error && error.message ? error.message : "تعذر بدء Oscar AI.";
    }
    if (session.current === current) {
      stop();
      onEnd(endMessage);
    }
  }, [getSessionOptions, getToken, listen, onEnd, post, runMessageTool, stop, takeAudioContext]);

  return { phase, transcript, reply, notice, start, stop, interrupt };
}
