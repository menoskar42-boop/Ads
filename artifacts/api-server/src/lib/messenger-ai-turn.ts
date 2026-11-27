// Oscar AI «بالأدوار» (turn-based, cheaper than Gemini Live). Owner's choice 2026-11-27, option (أ):
// one Flash-Lite request per turn takes the recorded audio and returns BOTH what the user said
// (shown on screen so they can check it was understood) and the reply. The phone speaks the
// reply with its own voice (Web Speech API) — no cloud TTS. After a tool runs (send/schedule a
// message), a text-only follow-up request (respondTurn) writes the confirmation.
// The API key stays on the server and is never logged or returned.
import { buildGeminiLiveSetup, type GeminiLiveOptions } from "./messenger-ai-live.ts";

export const GEMINI_TURN_MODEL = process.env.GEMINI_TURN_MODEL?.trim() || "gemini-3.5-flash-lite";
export const TURN_MAX_AUDIO_BYTES = 3 * 1024 * 1024;
export const TURN_MAX_CONTEXT_BYTES = 64 * 1024;
// Free tier on the owner's AI Studio (2026-11-27): ~15 RPM · 500 RPD for Flash-Lite ⇒ cap per user.
export const TURN_DAILY_LIMIT =
  Number.parseInt(process.env.GEMINI_TURN_DAILY_LIMIT ?? "", 10) > 0
    ? Number.parseInt(process.env.GEMINI_TURN_DAILY_LIMIT ?? "", 10)
    : 150;

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const AUDIO_TYPES = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg", "audio/aac"]);
const BUSY_ERROR = "Gemini مشغول دلوقتى (حد الطلبات). استنى دقيقة وجرّب.";
const REPLY_ERROR = "Oscar AI ماقدرش يرد. جرّب تانى.";

type Fetcher = typeof fetch;
export type Usage = Map<string, { day: string; turns: number }>;
const defaultUsage: Usage = new Map();

export type TurnFailure = { ok: false; status: number; error: string };
export type TurnReply = {
  ok: true;
  transcript: string;
  reply: string;
  modelContent: unknown;
  functionCalls: unknown[];
};

export function reserveTurn(
  userId: string,
  usage: Usage = defaultUsage,
  now = Date.now(),
  limit = TURN_DAILY_LIMIT,
): TurnFailure | null {
  const day = new Date(now).toISOString().slice(0, 10);
  const current = usage.get(userId);
  const turns = current?.day === day ? current.turns : 0;
  if (turns >= limit) {
    return { ok: false, status: 429, error: "استهلكت أدوار Oscar AI المتاحة لليوم." };
  }
  usage.set(userId, { day, turns: turns + 1 });
  return null;
}

export function baseAudioType(contentType: unknown): string | null {
  const base = String(contentType ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
  return AUDIO_TYPES.has(base) ? base : null;
}

/**
 * Request body framing (no multipart parser in the app): 4-byte big-endian length N, then N bytes
 * of UTF-8 JSON { mimeType, history, voice, location }, then the audio bytes.
 */
export function parseTurnUpload(body: Buffer):
  | { ok: true; context: Record<string, unknown>; audio: Buffer }
  | TurnFailure {
  const invalid: TurnFailure = { ok: false, status: 400, error: "التسجيل وصل ناقص. جرّب تانى." };
  if (body.length < 5) return invalid;
  const length = body.readUInt32BE(0);
  if (length < 2 || length > TURN_MAX_CONTEXT_BYTES || 4 + length >= body.length) return invalid;
  try {
    const context = JSON.parse(body.subarray(4, 4 + length).toString("utf8"));
    if (!context || typeof context !== "object" || Array.isArray(context)) return invalid;
    return { ok: true, context, audio: body.subarray(4 + length) };
  } catch {
    return invalid;
  }
}

async function callGemini(
  apiKey: string,
  body: unknown,
  fetcher: Fetcher,
): Promise<{ status: number; payload: any | null }> {
  const response = await fetcher(`${API_BASE}/${encodeURIComponent(GEMINI_TURN_MODEL)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!response.ok) return { status: response.status, payload: null };
  return { status: response.status, payload: await response.json() };
}

function allText(parts: any[]): string {
  return parts
    .filter((part) => part?.thought !== true)
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

/** «<transcript>…</transcript><reply>…</reply>» ⇒ both; untagged text counts as the reply. */
export function parseTaggedReply(text: string): { transcript: string; reply: string } {
  const transcript = /<transcript>([\s\S]*?)(?:<\/transcript>|$)/i.exec(text)?.[1]?.trim() ?? "";
  const tagged = /<reply>([\s\S]*?)(?:<\/reply>|$)/i.exec(text)?.[1];
  const reply = (tagged ?? text.replace(/<transcript>[\s\S]*?(?:<\/transcript>|$)/i, ""))
    .replace(/<\/?(?:reply|transcript)>/gi, "")
    .trim();
  return { transcript: transcript.slice(0, 2_000), reply: reply.slice(0, 1_500) };
}

const TAG_RULE =
  " كل رسالة من المستخدم تسجيل صوتى. رد دايماً بالشكل ده بالظبط:" +
  " <transcript>كلام المستخدم بالحرف زى ما اتقال (عامية مصرية، والإنجليزى زى ما هو)</transcript><reply>ردك</reply>." +
  " لو مفيش كلام مفهوم: transcript فاضى والرد «ماسمعتكش كويس، قول تانى». ولو هتندّه أداة اكتب transcript برضه.";

export function buildTurnRequest(
  contents: unknown[],
  options: GeminiLiveOptions,
  search: boolean,
  withAudio: boolean,
) {
  const live = buildGeminiLiveSetup({ ...options, messageMode: "text", search });
  return {
    systemInstruction: {
      parts: [{
        text: live.systemInstruction.parts[0].text +
          " ردودك هتتقرا بصوت الموبايل، فخليها قصيرة (جملة أو اتنين) ومن غير رموز أو قوايم أو روابط." +
          (search ? "" : " مفيش بحث جوجل دلوقتى: لو اتسألت عن معلومة بتتغيّر (الطقس أو الأخبار) قول إنك مش متأكد منها.") +
          (withAudio ? TAG_RULE : ""),
      }],
    },
    contents,
    tools: live.tools,
    generationConfig: { temperature: 0.5, maxOutputTokens: 800 },
  };
}

// Gemini 3 adds a thoughtSignature to function-call parts and expects it back unchanged.
const PART_KEYS = new Set(["text", "functionCall", "functionResponse", "thoughtSignature", "thought"]);

/** Earlier turns sent back by the client: text and tool parts only, never audio or files. */
export function cleanContents(raw: unknown, allowEmpty = false): unknown[] | null {
  if (!Array.isArray(raw) || raw.length > 24 || (!allowEmpty && raw.length === 0)) return null;
  if (JSON.stringify(raw).length > 60_000) return null;
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const { role, parts } = item as { role?: unknown; parts?: unknown };
    if ((role !== "user" && role !== "model") || !Array.isArray(parts) || !parts.length) return null;
    for (const part of parts) {
      if (!part || typeof part !== "object") return null;
      if (Object.keys(part as object).some((key) => !PART_KEYS.has(key))) return null;
    }
  }
  return raw;
}

function historyPart(part: any) {
  if (typeof part?.text !== "string") return part;
  // History keeps the reply only (no transcript/tags) so later turns stay short.
  const { reply } = parseTaggedReply(part.text);
  return { ...part, text: reply || "." };
}

async function runTurn(
  apiKey: string,
  contents: unknown[],
  options: GeminiLiveOptions,
  withAudio: boolean,
  fetcher: Fetcher,
): Promise<TurnReply | TurnFailure> {
  // Search on by default (the owner asks «الحرارة كام»). If the model refuses search together with
  // functions in one request (400), retry once without search. Never retry a 429.
  const searchOn = process.env.GEMINI_TURN_SEARCH !== "off";
  let result = await callGemini(apiKey, buildTurnRequest(contents, options, searchOn, withAudio), fetcher);
  if (!result.payload && searchOn && result.status === 400) {
    result = await callGemini(apiKey, buildTurnRequest(contents, options, false, withAudio), fetcher);
  }
  if (result.status === 429) return { ok: false, status: 429, error: BUSY_ERROR };
  const content = result.payload?.candidates?.[0]?.content;
  if (!content || !Array.isArray(content.parts)) return { ok: false, status: 502, error: REPLY_ERROR };
  const functionCalls = content.parts
    .map((part: any) => part?.functionCall)
    .filter((call: any) => call && typeof call.name === "string");
  const { transcript, reply } = parseTaggedReply(allText(content.parts));
  const modelParts = content.parts.filter((part: any) => part?.thought !== true).map(historyPart);
  return {
    ok: true,
    transcript,
    reply,
    modelContent: { role: "model", parts: modelParts.length ? modelParts : [{ text: "." }] },
    functionCalls,
  };
}

/** One request: the audio turn ⇒ what the user said + the reply (or a tool call). */
export async function listenAndRespond(
  apiKey: string | undefined,
  audio: Buffer,
  mimeType: string,
  rawHistory: unknown,
  options: GeminiLiveOptions,
  fetcher: Fetcher = fetch,
): Promise<TurnReply | TurnFailure> {
  if (!apiKey?.trim()) return { ok: false, status: 503, error: "Oscar AI مش متاح" };
  if (!audio.length || audio.length > TURN_MAX_AUDIO_BYTES) {
    return { ok: false, status: 400, error: "التسجيل فاضى أو أطول من اللازم." };
  }
  const history = cleanContents(rawHistory ?? [], true);
  if (!history) return { ok: false, status: 400, error: "بيانات المحادثة غير صحيحة." };
  try {
    return await runTurn(apiKey, [
      ...history,
      { role: "user", parts: [{ inline_data: { mime_type: mimeType, data: audio.toString("base64") } }] },
    ], options, true, fetcher);
  } catch {
    return { ok: false, status: 502, error: REPLY_ERROR };
  }
}

/** Text-only follow-up after a tool ran (contents end with the functionResponse). */
export async function respondTurn(
  apiKey: string | undefined,
  rawContents: unknown,
  options: GeminiLiveOptions,
  fetcher: Fetcher = fetch,
): Promise<TurnReply | TurnFailure> {
  if (!apiKey?.trim()) return { ok: false, status: 503, error: "Oscar AI مش متاح" };
  const contents = cleanContents(rawContents);
  if (!contents) return { ok: false, status: 400, error: "بيانات المحادثة غير صحيحة." };
  try {
    return await runTurn(apiKey, contents, options, false, fetcher);
  } catch {
    return { ok: false, status: 502, error: REPLY_ERROR };
  }
}
