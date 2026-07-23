// كاش عام لردود Groq — مشترك بين كل المستخدمين لأن الناتج يعتمد على المدخل فقط.
// دائم (بدون TTL) لأن المحتوى ثابت. أي فشل في الكاش يجب ألا يكسر الـendpoint.
import pg from "pg";
import crypto from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
// Swallow idle-client errors (Neon auto-suspend) so they don't crash the process.
pool.on('error', (err) => console.error('[pg] ai-cache idle client error (recovered):', err.message));

// تطبيع المدخل العربي: حروف صغيرة + إزالة التشكيل/التطويل + توحيد الألف/الياء/
// التاء المربوطة + إزالة الترقيم + دمج المسافات.
export function normalizeInput(s: string): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "")   // تشكيل
    .replace(/ـ/g, "")                   // تطويل
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")         // إزالة الترقيم (يُبقي الحروف والأرقام)
    .replace(/\s+/g, " ")
    .trim();
}

function computeKey(inputParts: (string | number | null | undefined)[]): string {
  const joined = inputParts.map(p => normalizeInput(String(p ?? ""))).join("");
  return crypto.createHash("sha256").update(joined).digest("hex");
}

// اختياري: طبقة ذاكرة LRU صغيرة فوق الـDB لتسريع التكرارات الحارّة
const mem = new Map<string, any>();
const MEM_MAX = 500;
function memGet(k: string) {
  if (!mem.has(k)) return undefined;
  const v = mem.get(k);
  mem.delete(k); mem.set(k, v); // تحديث ترتيب الاستخدام
  return v;
}
function memSet(k: string, v: any) {
  if (mem.has(k)) mem.delete(k);
  mem.set(k, v);
  if (mem.size > MEM_MAX) mem.delete(mem.keys().next().value as string);
}

/** يرجّع الرد المخزّن (ويزوّد hits) أو null. لا يرمي أبداً. */
export async function getCached(kind: string, inputParts: (string | number | null | undefined)[]): Promise<any | null> {
  try {
    const ckey = computeKey(inputParts);
    const memKey = kind + ":" + ckey;
    const cached = memGet(memKey);
    if (cached !== undefined) return cached;

    const r = await pool.query(
      `UPDATE ai_response_cache SET hits = hits + 1 WHERE kind = $1 AND ckey = $2 RETURNING response`,
      [kind, ckey]
    );
    if (r.rows.length > 0) {
      const resp = r.rows[0].response;
      memSet(memKey, resp);
      return resp;
    }
    return null;
  } catch (err) {
    console.error("[ai-cache] getCached error (continuing without cache):", err);
    return null;
  }
}

/** upsert idempotent للرد. لا يرمي أبداً. */
export async function putCached(kind: string, inputParts: (string | number | null | undefined)[], response: any): Promise<void> {
  try {
    const ckey = computeKey(inputParts);
    await pool.query(
      `INSERT INTO ai_response_cache (kind, ckey, response)
       VALUES ($1, $2, $3)
       ON CONFLICT (kind, ckey) DO UPDATE SET response = EXCLUDED.response`,
      [kind, ckey, JSON.stringify(response)]
    );
    memSet(kind + ":" + ckey, response);
  } catch (err) {
    console.error("[ai-cache] putCached error (ignored):", err);
  }
}
