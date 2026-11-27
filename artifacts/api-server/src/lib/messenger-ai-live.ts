// The model can be changed from the GEMINI_LIVE_MODEL env var without a code change.
export const GEMINI_LIVE_MODEL = process.env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.8-live";
export const GEMINI_LIVE_SESSION_MINUTES = 5;
// Free Gemini key (no billing): the daily cap only protects the free quota. Override with GEMINI_LIVE_DAILY_MINUTES.
export const GEMINI_LIVE_DAILY_MINUTES =
  Number.parseInt(process.env.GEMINI_LIVE_DAILY_MINUTES ?? "", 10) > 0
    ? Number.parseInt(process.env.GEMINI_LIVE_DAILY_MINUTES ?? "", 10)
    : 30;

type DailyUsage = { day: string; minutes: number; openSessionAt?: number };
type UsageLedger = Map<string, DailyUsage>;

export type GeminiLiveOptions = {
  voice?: "female" | "male";
  /** How «ابعت رسالة لفلان» is sent: the user's own recorded voice, or text written by Gemini. */
  messageMode?: "voice" | "text";
  location?: { lat: number; lng: number } | null;
  /** Google Search grounding; defaults to GEMINI_LIVE_SEARCH (on unless "off"). */
  search?: boolean;
};

// Gemini Live prebuilt voices: Kore (female, default) · Charon (male).
const LIVE_VOICES = { female: "Kore", male: "Charon" } as const;
const BASE_INSTRUCTION = "أنت Oscar AI، مساعد بالعامية المصرية. ردودك قصيرة وواضحة. لا تحفظ أو تطلب حفظ المحادثة.";

/** The Live session setup, built once on the server and used by both the token and the client. */
export function buildGeminiLiveSetup(options: GeminiLiveOptions = {}) {
  const voiceName = LIVE_VOICES[options.voice === "male" ? "male" : "female"];
  const location = options.location;
  const where = location
    ? ` المستخدم موجود تقريباً عند خط عرض ${location.lat.toFixed(2)} وخط طول ${location.lng.toFixed(2)}. ` +
      "استخدم ده لأسئلة الطقس والأماكن القريبة والمواعيد من غير ما تسأله عن مكانه، وماتقولوش الإحداثيات."
    : "";
  const today = new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo", dateStyle: "full", timeStyle: "short" });
  const isoNow = new Date().toISOString();
  const searchEnabled = options.search ?? process.env.GEMINI_LIVE_SEARCH !== "off";
  const voiceMessages = options.messageMode !== "text";
  const messageTool = voiceMessages
    ? {
        name: "record_voice_message",
        description: "يسجّل رسالة صوتية بصوت المستخدم نفسه ويبعتها لجهة اتصال فى Oscar Messenger.",
        parameters: {
          type: "OBJECT",
          properties: { contact_name: { type: "STRING", description: "اسم الشخص زى ما المستخدم قاله" } },
          required: ["contact_name"],
        },
      }
    : {
        name: "send_message",
        description: "يبعت رسالة نصية لجهة اتصال فى Oscar Messenger.",
        parameters: {
          type: "OBJECT",
          properties: {
            contact_name: { type: "STRING", description: "اسم الشخص زى ما المستخدم قاله" },
            text: { type: "STRING", description: "نص الرسالة بالظبط" },
          },
          required: ["contact_name", "text"],
        },
      };
  const messageRule = voiceMessages
    ? " لما المستخدم يطلب يبعت رسالة لحد: قوله «اتكلم بعد الصفارة» وندّه record_voice_message بالاسم بس. التطبيق بيسجّل صوته هو ويبعته."
    : " لما المستخدم يطلب يبعت رسالة لحد: اكتب النص، اقراه عليه، واستنى موافقته الصريحة («أيوه» أو «ابعت») قبل ما تندّه send_message.";
  const scheduleTool = {
    name: "schedule_message",
    description: "يجدول رسالة نصية تتبعت لجهة اتصال فى Oscar Messenger فى ميعاد معيّن.",
    parameters: {
      type: "OBJECT",
      properties: {
        contact_name: { type: "STRING", description: "اسم الشخص زى ما المستخدم قاله" },
        text: { type: "STRING", description: "نص الرسالة بالظبط" },
        send_at: {
          type: "STRING",
          description: "ميعاد الإرسال ISO 8601 بتوقيت القاهرة مع الإزاحة، مثلاً 2026-11-27T19:00:00+02:00",
        },
      },
      required: ["contact_name", "text", "send_at"],
    },
  };
  const scheduleRule =
    ` لو المستخدم طلب رسالة تتبعت فى ميعاد (بكره الساعة ٧ مثلاً): احسب الميعاد من الوقت الحالى (UTC ${isoNow})،` +
    " اقراله النص والميعاد بالكلام واستنى موافقته الصريحة، وبعدين ندّه schedule_message. الجدولة دايماً رسالة مكتوبة.";
  return {
    model: `models/${GEMINI_LIVE_MODEL}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    },
    systemInstruction: {
      parts: [{ text: `${BASE_INSTRUCTION} النهارده ${today} بتوقيت القاهرة.${where}` +
        (searchEnabled ? " لأى معلومة بتتغيّر (الطقس، الأخبار، الأسعار) دوّر بـGoogle Search قبل ما ترد." : "") +
        messageRule +
        scheduleRule +
        " لو الأداة رجعت خطأ أو أكتر من اسم، قوله واسأله يختار." }],
    },
    inputAudioTranscription: {},
    tools: [
      ...(searchEnabled ? [{ googleSearch: {} }] : []),
      { functionDeclarations: [messageTool, scheduleTool] },
    ],
  };
}

export function parseGeminiLiveOptions(body: unknown): GeminiLiveOptions {
  const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const voice = input.voice === "male" ? "male" : "female";
  const messageMode = input.messageMode === "text" ? "text" : "voice";
  const raw = input.location && typeof input.location === "object"
    ? (input.location as Record<string, unknown>)
    : null;
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  const location =
    raw && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 }
      : null;
  return { voice, location, messageMode };
}

export type GeminiLiveTokenResult =
  | { ok: true; token: string; model: string; setup: ReturnType<typeof buildGeminiLiveSetup> }
  | { ok: false; status: 429 | 503; error: string };

export async function createGeminiLiveToken(
  userId: string,
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch,
  ledger: UsageLedger = defaultLedger,
  now = Date.now(),
  options: GeminiLiveOptions = {},
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
  ledger.set(userId, { day, minutes: minutes + GEMINI_LIVE_SESSION_MINUTES, openSessionAt: now });
  const setup = buildGeminiLiveSetup(options);

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
          bidiGenerateContentSetup: setup,
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
    return { ok: true, token: payload.name, model: GEMINI_LIVE_MODEL, setup };
  } catch {
    ledger.set(userId, { day, minutes });
    return { ok: false, status: 503, error: "Oscar AI مش متاح" };
  }
}

const defaultLedger: UsageLedger = new Map();

/**
 * A token reserves a whole session up front. When the session ends early (closed after a
 * few seconds, no speech, connection error) the unused minutes go back, so failed tries
 * do not use up the day. At least one minute is always counted.
 */
export function endGeminiLiveSession(
  userId: string,
  ledger: UsageLedger = defaultLedger,
  now = Date.now(),
): { refundedMinutes: number } {
  const usage = ledger.get(userId);
  if (!usage || usage.openSessionAt === undefined) return { refundedMinutes: 0 };
  const usedMinutes = Math.min(
    GEMINI_LIVE_SESSION_MINUTES,
    Math.max(1, Math.ceil((now - usage.openSessionAt) / 60_000)),
  );
  const refundedMinutes = GEMINI_LIVE_SESSION_MINUTES - usedMinutes;
  ledger.set(userId, {
    day: usage.day,
    minutes: Math.max(0, usage.minutes - refundedMinutes),
  });
  return { refundedMinutes };
}
