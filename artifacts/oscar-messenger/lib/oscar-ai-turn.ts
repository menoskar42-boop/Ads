import { apiUrl } from "./api";
import { readOscarAiTtsProvider, type OscarAiTtsProvider } from "./oscar-ai-preferences";

// Oscar AI «بالأدوار» helpers (owner 2026-11-27, option أ): one Flash-Lite request per turn returns
// what the user said + the reply, and the phone reads the reply with its own voice.

export type TurnContent = { role: "user" | "model"; parts: Array<Record<string, unknown>> };

export const TURN_HISTORY_MAX = 12;

/** Body framing the server expects: 4-byte big-endian JSON length, the JSON, then the audio. */
export async function frameTurnBody(context: Record<string, unknown>, audio: Blob): Promise<Blob> {
  const json = new TextEncoder().encode(JSON.stringify(context));
  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint32(0, json.length, false);
  return new Blob([head, json, audio], { type: "application/octet-stream" });
}

/** Last turns only, starting with a plain user text turn (never an orphan tool response). */
export function trimTurnHistory(history: TurnContent[], max = TURN_HISTORY_MAX): TurnContent[] {
  let trimmed = history.slice(-max);
  while (
    trimmed.length &&
    (trimmed[0].role !== "user" || !trimmed[0].parts.some((part) => typeof part.text === "string"))
  ) {
    trimmed = trimmed.slice(1);
  }
  return trimmed;
}

type VoiceLike = { lang: string; name: string; localService?: boolean };

/** An Arabic voice, Egyptian first, then any Arabic; null ⇒ the browser default for «ar-EG». */
export function pickArabicVoice<T extends VoiceLike>(voices: T[]): T | null {
  const arabic = voices.filter((voice) => voice.lang?.toLowerCase().startsWith("ar"));
  return (
    arabic.find((voice) => voice.lang.toLowerCase() === "ar-eg") ??
    arabic.find((voice) => voice.localService) ??
    arabic[0] ??
    null
  );
}

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window &&
    typeof (window as Window & { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance === "function";
}

/** iPhone only speaks after a first utterance inside a tap: call this from the tap. */
export function primeSpeech(): void {
  if (!canSpeak()) return;
  try {
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speaking is optional: the reply is also shown as text.
  }
}

/** Reads the reply aloud; resolves when done, stopped, or after a safety timeout. */
export function speakReply(text: string): Promise<"spoken" | "unavailable"> {
  if (!text.trim()) return Promise.resolve("spoken");
  if (!canSpeak()) return Promise.resolve("unavailable");
  return new Promise((resolve) => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ar-EG";
      const voice = pickArabicVoice(synth.getVoices());
      if (voice) utterance.voice = voice;
      let done = false;
      const finish = (result: "spoken" | "unavailable") => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(result);
      };
      // Some browsers never fire onend; ~90 ms per character plus slack.
      const timer = setTimeout(() => finish("spoken"), Math.min(60_000, 3_000 + text.length * 90));
      utterance.onend = () => finish("spoken");
      utterance.onerror = (event) => finish(
        (event as SpeechSynthesisErrorEvent).error === "interrupted" ||
        (event as SpeechSynthesisErrorEvent).error === "canceled" ? "spoken" : "unavailable",
      );
      synth.speak(utterance);
    } catch {
      resolve("unavailable");
    }
  });
}

export function stopSpeaking(): void {
  if (!canSpeak()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Nothing is speaking.
  }
}

/** Playback settings are independent from Gemini's microphone transcription and reasoning. */
export type OscarAiSpeechOptions = {
  provider?: OscarAiTtsProvider;
  getToken?: () => Promise<string | null>;
  voice?: "female" | "male" | string;
  audioContext?: AudioContext | null;
};

export type OscarAiSpeechOutput = {
  readonly provider: OscarAiTtsProvider;
  prime(): void;
  speak(text: string, options?: OscarAiSpeechOptions): Promise<"spoken" | "unavailable">;
  stop(): void;
};

let activeSource: AudioBufferSourceNode | null = null;
let finishActivePlayback: (() => void) | null = null;

function stopGeminiPlayback(): void {
  const source = activeSource;
  activeSource = null;
  finishActivePlayback?.();
  finishActivePlayback = null;
  if (source) {
    source.onended = null;
    try { source.stop(); } catch { /* already stopped */ }
    try { source.disconnect(); } catch { /* already disconnected */ }
  }
}

async function speakWithGemini(
  text: string,
  options: OscarAiSpeechOptions,
): Promise<"spoken" | "unavailable"> {
  const context = options.audioContext;
  if (!context || context.state === "closed" || !options.getToken) return "unavailable";
  try {
    const token = await options.getToken();
    if (!token) return "unavailable";
    const response = await fetch(apiUrl("/api/messenger/ai/tts"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text.slice(0, 1_200),
        voice: options.voice === "male" ? "male" : "female",
      }),
    });
    if (!response.ok) return "unavailable";
    const audioData = await response.arrayBuffer();
    if (!audioData.byteLength || context.state === "closed") return "unavailable";
    if (context.state !== "running") await context.resume();
    const buffer = await context.decodeAudioData(audioData);
    stopGeminiPlayback();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    activeSource = source;
    return await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (activeSource === source) activeSource = null;
        if (finishActivePlayback === finish) finishActivePlayback = null;
        try { source.disconnect(); } catch { /* already disconnected */ }
        resolve("spoken");
      };
      const timer = setTimeout(finish, Math.max(5_000, buffer.duration * 1_000 + 3_000));
      finishActivePlayback = finish;
      source.onended = finish;
      source.start();
    });
  } catch {
    return "unavailable";
  }
}

/** One provider boundary for Turn-Based playback. Gemini credentials remain server-side. */
export const oscarAiSpeechOutput: OscarAiSpeechOutput = {
  get provider() { return readOscarAiTtsProvider(); },
  prime: primeSpeech,
  speak(text, options = {}) {
    const provider = options.provider ?? readOscarAiTtsProvider();
    if (provider === "gemini-tts") {
      stopSpeaking();
      return speakWithGemini(text, options);
    }
    stopGeminiPlayback();
    return speakReply(text);
  },
  stop() {
    stopSpeaking();
    stopGeminiPlayback();
  },
};
