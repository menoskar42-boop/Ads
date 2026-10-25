/**
 * Cloudflare R2 لصور الشات — من غير أي مكتبة خارجية (نفس طريقة
 * `serviceflow/server/maintenance/app/utils/r2.js`: توقيع AWS SigV4 بـ`crypto`
 * و`fetch` المدمجين). نفس الباكِت ونفس الأسرار بتاعة صور صيانة Service Flow —
 * mybible بيورثهم من مشروع `sf` (server.js بيدّيله process.env كله).
 *
 *   R2_ACCOUNT_ID · R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET · R2_ENDPOINT (اختياري)
 *
 * لو أي سرّ ناقص → `r2Configured()` = false والصور بتفضل في القاعدة زي الأول.
 * الخروج من R2 مجاني — فقراية الصورة من هنا مابتتحسبش من حصة Supabase.
 */
import crypto from "node:crypto";

const SERVICE = "s3";
const REGION = process.env.R2_REGION || "auto";
const TIMEOUT_MS = Number(process.env.R2_TIMEOUT_MS || 20000);

function cfg() {
  const accountId = process.env.R2_ACCOUNT_ID || "";
  return {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    bucket: process.env.R2_BUCKET || "",
    endpoint: (process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "")).replace(/\/+$/, ""),
  };
}

export function r2Configured(): boolean {
  const c = cfg();
  return Boolean(c.accessKeyId && c.secretAccessKey && c.bucket && c.endpoint);
}

const sha256hex = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const hmac = (key: crypto.BinaryLike, s: string) => crypto.createHmac("sha256", key).update(s, "utf8").digest();
const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

/** قلب التوقيع — دالة نقيّة عشان تتاخد بالاختبار مقابل مثال AWS الرسمي. */
export function buildAuth(o: {
  method: string; host: string; pathname: string; query?: string; headers: Record<string, string>;
  payloadHash: string; amzDate: string; region: string; accessKeyId: string; secretAccessKey: string;
}): string {
  const all: Record<string, string> = { host: o.host, ...o.headers };
  const lower = new Map(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, " ")]));
  const names = [...lower.keys()].sort();
  const canonicalRequest = [
    o.method, o.pathname, o.query || "",
    names.map((n) => `${n}:${lower.get(n)}\n`).join(""),
    names.join(";"), o.payloadHash,
  ].join("\n");
  const dateStamp = o.amzDate.slice(0, 8);
  const scope = `${dateStamp}/${o.region}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", o.amzDate, scope, sha256hex(Buffer.from(canonicalRequest, "utf8"))].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${o.secretAccessKey}`, dateStamp), o.region), SERVICE), "aws4_request");
  const signature = crypto.createHmac("sha256", key).update(stringToSign, "utf8").digest("hex");
  return `AWS4-HMAC-SHA256 Credential=${o.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${signature}`;
}

async function send(method: string, key: string, body?: Buffer, extra: Record<string, string> = {}) {
  const c = cfg();
  if (!r2Configured()) throw new Error("R2 غير مضبوط: أسرار ناقصة");
  const url = new URL(`${c.endpoint}/${c.bucket}/${encodeKey(key)}`);
  const payload = body && body.length ? body : Buffer.alloc(0);
  const payloadHash = sha256hex(payload);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const headers: Record<string, string> = { "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...extra };
  const authorization = buildAuth({
    method, host: url.host, pathname: url.pathname, headers, payloadHash, amzDate,
    region: REGION, accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey,
  });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { method, headers: { ...headers, Authorization: authorization }, body: body && body.length ? body : undefined, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function r2Put(key: string, body: Buffer, contentType: string): Promise<void> {
  const res = await send("PUT", key, body, { "content-type": contentType, "content-length": String(body.length) });
  if (!res.ok) throw new Error(`R2 PUT ${key} رجّع ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
}

/** null لو مش موجود. */
export async function r2Get(key: string): Promise<{ body: Buffer; type: string } | null> {
  const res = await send("GET", key);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 GET ${key} رجّع ${res.status}`);
  return { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") || "application/octet-stream" };
}

export async function r2Delete(key: string): Promise<void> {
  const res = await send("DELETE", key);
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${key} رجّع ${res.status}`);
}

export const sha256 = sha256hex;
