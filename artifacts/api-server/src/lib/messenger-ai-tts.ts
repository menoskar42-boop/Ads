// Server-side Gemini 3.8 Flash-Lite TTS. The API key never leaves this module.
export const GEMINI_TTS_MODEL =
  process.env.GEMINI_TTS_MODEL?.trim() || "gemini-3.8-flash-lite-tts";
export const TTS_MAX_TEXT_CHARS = 1_200;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type SpeechFailure = { ok: false; status: number; error: string };
export type SpeechResult =
  | { ok: true; audio: Buffer; mimeType: string }
  | SpeechFailure;

type Fetcher = typeof fetch;

/** Gemini commonly returns raw 16-bit PCM (audio/L16), which browsers cannot decode as a file.
 * Wrap it in a minimal WAV container so Web Audio can decode it reliably.
 */
export function pcmToWav(pcm: Buffer, sampleRate = 24_000, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function normalizeAudio(audio: Buffer, mimeType: string): { audio: Buffer; mimeType: string } {
  if (/^audio\/(?:l16|pcm)\b/i.test(mimeType)) {
    const rate = /rate=(\d+)/i.exec(mimeType)?.[1];
    return { audio: pcmToWav(audio, rate ? Number(rate) : 24_000), mimeType: "audio/wav" };
  }
  return { audio, mimeType };
}

export async function synthesizeGeminiSpeech(
  apiKey: string | undefined,
  rawText: string,
  voice: "female" | "male" = "female",
  fetcher: Fetcher = fetch,
): Promise<SpeechResult> {
  const text = rawText.trim();
  if (!apiKey?.trim()) {
    return { ok: false, status: 503, error: "Oscar AI مش متاح" };
  }
  if (!text || text.length > TTS_MAX_TEXT_CHARS) {
    return { ok: false, status: 400, error: "النص فاضي أو أطول من اللازم." };
  }

  try {
    const response = await fetcher(
      `${API_BASE}/${encodeURIComponent(GEMINI_TTS_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voice === "male" ? "Charon" : "Kore",
                },
              },
            },
          },
        }),
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        status: response.status === 429 ? 429 : 502,
        error: response.status === 429
          ? "Gemini مشغول دلوقتى. استنى دقيقة وجرّب."
          : "تعذر إنشاء الصوت من Gemini.",
      };
    }
    const payload = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { data?: unknown; mimeType?: unknown };
          }>;
        };
      }>;
    };
    const audioPart = payload.candidates?.[0]?.content?.parts?.find(
      (part) => typeof part.inlineData?.data === "string",
    )?.inlineData;
    if (!audioPart || typeof audioPart.data !== "string") {
      return { ok: false, status: 502, error: "Gemini لم يرجع ملف صوت صالح." };
    }
    const audio = Buffer.from(audioPart.data, "base64");
    if (!audio.length || audio.length > 4 * 1024 * 1024) {
      return { ok: false, status: 502, error: "ملف الصوت الناتج غير صالح أو كبير." };
    }
    const sourceMimeType = typeof audioPart.mimeType === "string" &&
      audioPart.mimeType.startsWith("audio/")
      ? audioPart.mimeType
      : "audio/wav";
    const normalized = normalizeAudio(audio, sourceMimeType);
    return { ok: true, ...normalized };
  } catch {
    return { ok: false, status: 502, error: "تعذر الاتصال بخدمة الصوت من Gemini." };
  }
}
