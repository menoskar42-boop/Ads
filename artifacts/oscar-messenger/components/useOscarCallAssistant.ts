import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "../lib/api";
import { frameTurnBody } from "../lib/oscar-ai-turn";
import { baseMessengerAudioContentType, chooseWebAudioMimeType } from "../lib/web-voice";

export type OscarCallStatus = "off" | "listening" | "thinking" | "speaking" | "error";

type Options = { getToken: () => Promise<string | null> };

const SPEECH_RMS = 0.006;
const END_SILENCE_MS = 850;
const NO_SPEECH_MS = 12_000;
const MAX_TURN_MS = 12_000;

export function useOscarCallAssistant({ getToken }: Options) {
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<OscarCallStatus>("off");
  const [remoteTrack, setRemoteTrack] = useState<MediaStreamTrack | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const enabledRef = useRef(false);
  const speakingRef = useRef(false);

  const prepare = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") return false;
    try {
      if (!contextRef.current || contextRef.current.state === "closed") {
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        contextRef.current = context;
        destinationRef.current = destination;
      }
      await contextRef.current.resume();
      return contextRef.current.state === "running" && !!destinationRef.current?.stream.getAudioTracks()[0];
    } catch {
      return false;
    }
  }, []);

  const outgoingStream = useCallback(() => destinationRef.current?.stream ?? null, []);

  const stop = useCallback(() => {
    enabledRef.current = false;
    setEnabled(false);
    speakingRef.current = false;
    try { sourceRef.current?.stop(); } catch { /* already stopped */ }
    sourceRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setStatus("off");
  }, []);

  const dispose = useCallback(() => {
    stop();
    remoteTrack && setRemoteTrack(null);
    destinationRef.current?.stream.getTracks().forEach((track) => track.stop());
    destinationRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }, [remoteTrack, stop]);

  const start = useCallback(async () => {
    if (!await prepare()) {
      setStatus("error");
      return;
    }
    enabledRef.current = true;
    setEnabled(true);
    setStatus("listening");
  }, [prepare]);

  const speak = useCallback(async (text: string) => {
    const context = contextRef.current;
    const destination = destinationRef.current;
    if (!context || !destination || !text.trim()) return;
    const token = await getToken();
    if (!token) throw new Error("انتهت جلسة الدخول.");
    const response = await fetch(apiUrl("/api/messenger/ai/tts"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text.slice(0, 900), voice: "female" }),
    });
    if (!response.ok) throw new Error("تعذر إنشاء صوت أوسكار.");
    const audio = await context.decodeAudioData(await response.arrayBuffer());
    await context.resume();
    const source = context.createBufferSource();
    source.buffer = audio;
    source.connect(destination);
    sourceRef.current = source;
    speakingRef.current = true;
    await new Promise<void>((resolve) => {
      source.onended = () => {
        source.disconnect();
        sourceRef.current = null;
        speakingRef.current = false;
        resolve();
      };
      source.start();
    });
  }, [getToken]);

  useEffect(() => {
    if (!enabled || !remoteTrack || !contextRef.current) return;
    const context = contextRef.current;
    const stream = new MediaStream([remoteTrack]);
    const input = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    input.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let cancelled = false;
    let recorder: MediaRecorder | null = null;

    const recordTurn = () => new Promise<Blob | null>((resolve) => {
      const mimeType = chooseWebAudioMimeType((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) {
        resolve(null);
        return;
      }
      const chunks: Blob[] = [];
      const startedAt = Date.now();
      let lastVoiceAt = startedAt;
      let heardVoice = false;
      recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const check = setInterval(() => {
        if (cancelled || speakingRef.current) {
          if (recorder?.state === "recording") recorder.stop();
          return;
        }
        const now = Date.now();
        analyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (let index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index];
        if (Math.sqrt(energy / samples.length) > SPEECH_RMS) {
          heardVoice = true;
          lastVoiceAt = now;
        }
        if (
          (heardVoice && now - lastVoiceAt >= END_SILENCE_MS) ||
          (!heardVoice && now - startedAt >= NO_SPEECH_MS) ||
          now - startedAt >= MAX_TURN_MS
        ) {
          if (recorder?.state === "recording") recorder.stop();
        }
      }, 100);
      recorder.onstop = () => {
        clearInterval(check);
        recorderRef.current = null;
        if (cancelled || !heardVoice || !chunks.length) {
          resolve(null);
          return;
        }
        resolve(new Blob(chunks, {
          type: baseMessengerAudioContentType(mimeType) ?? "audio/webm",
        }));
      };
      recorder.start(250);
    });

    const processTurn = async (audio: Blob) => {
      const token = await getToken();
      if (!token) throw new Error("انتهت جلسة الدخول.");
      const contentType = audio.type || "audio/webm";
      const upload = await fetch(apiUrl("/api/messenger/ai/call-turn"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: await frameTurnBody({ mimeType: contentType, history: [] }, audio),
      });
      const result = await upload.json().catch(() => ({}));
      if (!upload.ok) throw new Error(typeof result?.error === "string" ? result.error : "تعذر فهم كلام الطرف الآخر.");
      const reply = typeof result?.reply === "string" ? result.reply.trim() : "";
      if (!reply || cancelled || !enabledRef.current) return;
      setStatus("speaking");
      await speak(reply);
    };

    const loop = async () => {
      while (!cancelled && enabledRef.current) {
        if (speakingRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          continue;
        }
        setStatus("listening");
        const audio = await recordTurn();
        if (cancelled || !enabledRef.current) break;
        if (!audio || audio.size < 1_000) continue;
        try {
          setStatus("thinking");
          await processTurn(audio);
        } catch {
          if (!cancelled && enabledRef.current) {
            setStatus("error");
            await new Promise((resolve) => setTimeout(resolve, 1_500));
          }
        }
      }
    };
    void loop();

    return () => {
      cancelled = true;
      if (recorder?.state === "recording") recorder.stop();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      input.disconnect();
      analyser.disconnect();
    };
  }, [enabled, getToken, remoteTrack, speak]);

  return {
    enabled,
    status,
    start,
    stop,
    dispose,
    prepare,
    outgoingStream,
    setRemoteTrack,
  };
}
