// The model can be changed from the GEMINI_LIVE_MODEL env var without a code change.
export const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.8-live";
export const GEMINI_LIVE_SESSION_MINUTES = 5;
export const GEMINI_LIVE_DAILY_MINUTES = 15;

type DailyUsage = { day: string; minutes: number };
type UsageLedger = Map<string, DailyUsage>;

export type GeminiLiveTokenResult =
  | { ok: true; token: string; model: string }
  | { ok: false; status: 429 | 503; error: string };

export async function createGeminiLiveToken(
  userId: string,
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
  ledger: UsageLedger = defaultLedger,
  now = Date.now(),
): Promise<GeminiLiveTokenResult> {
  if (!apiKey?.trim()) {
    return { ok: false, status: 503, error: "Oscar AI مش متاح" };
  }

  const day = new Date(now).toISOString().slice(0, 10);
  const usage = ledger.get(userId);
  const minutes = usage?.day === day ? usage.minutes : 0;
  if (minutes + GEMINI_LIVE_SESSION_MINUTES > GEMINI_LIVE_DAILY_MINUTES) {
    return {
      ok: false,
      status: 429,
      error: "استهلكت وقت Oscar AI المتاح لليوم.",
    };
  }
  ledger.set(userId, { day, minutes: minutes + GEMINI_LIVE_SESSION_MINUTES });

  try {
    const response = await fetcher(
      "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(now + GEMINI_LIVE_SESSION_MINUTES * 60_000).toISOString(),
          newSessionExpireTime: new Date(now + 60_000).toISOString(),
          bidiGenerateContentSetup: {
            model: `models/${GEMINI_LIVE_MODEL}`,
            generationConfig: { responseModalities: ["AUDIO"] },
            systemInstruction: {
              parts: [{ text: "أنت Oscar AI، مساعد بالعامية المصرية. أجب بإيجاز وبوضوح." }],
            },
            inputAudioTranscription: {},
          },
        }),
      },
    );
    if (!response.ok) {
      ledger.set(userId, { day, minutes });
      return { ok: false, status: 503, error: "Oscar AI مش متاح" };
    }
    const payload = (await response.json()) as { name?: unknown };
    if (typeof payload.name !== "string" || !payload.name) {
      ledger.set(userId, { day, minutes });
      return { ok: false, status: 503, error: "Oscar AI مش متاح" };
    }
    return { ok: true, token: payload.name, model: GEMINI_LIVE_MODEL };
  } catch {
    ledger.set(userId, { day, minutes });
    return { ok: false, status: 503, error: "Oscar AI مش متاح" };
  }
}

const defaultLedger: UsageLedger = new Map();
