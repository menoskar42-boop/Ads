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
    const mimeType = typeof audioPart.mimeType === "string" &&
      audioPart.mimeType.startsWith("audio/")
      ? audioPart.mimeType
      : "audio/wav";
    return { ok: true, audio, mimeType };
  } catch {
    return { ok: false, status: 502, error: "تعذر الاتصال بخدمة الصوت من Gemini." };
  }
}
