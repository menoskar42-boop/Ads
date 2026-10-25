/**
 * صور الشات — من غير ما الصورة تتسحب من القاعدة مع كل تحديث.
 *
 * المشكلة (٢٠٢٦-١٠-٢٥): الصورة بتتخزّن في `group_messages.image_url` كنص
 * base64 (٣٠–٨٠ كيلو للصورة). والشات بيسحب آخر ١٠٠ رسالة كل ٨ ثواني لكل
 * عضو فاتح — فكل صورة في آخر ١٠٠ رسالة كانت بتخرج من القاعدة ٤٥٠ مرة في
 * الساعة لكل عضو. ده اللي خلّص ٣٫٤ جيجا من حصة Supabase المجانية (٥ جيجا
 * في الشهر) في يومين.
 *
 * الحل: تحديث الشات بيرجّع **رابط** للصورة بدل الصورة نفسها
 * (`/api/groups/:code/messages/:id/image`)، والرابط ده:
 *   - المتصفح بيحفظه سنة (الصورة مابتتغيّرش أبداً بعد الإرسال).
 *   - والسيرفر بيحفظ آخر الصور في الذاكرة، فالـ٧٠٠ عضو بيقروها من القاعدة
 *     مرة واحدة مش ٧٠٠ مرة.
 */
import crypto from "node:crypto";
import { r2Configured, r2Delete, r2Get, r2Put } from "./r2";

/** الاسم اللي الاستعلام بيرجّعه بدل الصورة لما تكون base64 جوّه القاعدة (مكتوب حرفياً كمان في استعلام الشات). */
export const INLINE_IMAGE = "data";

/** رابط صورة رسالة — أو الرابط الأصلي لو الصورة مش متخزّنة جوّه القاعدة. */
export function chatImageUrl(groupCode: string, messageId: number, ref: string | null): string | null {
  if (!ref) return null;
  if (ref !== INLINE_IMAGE) return ref;
  return `/api/groups/${encodeURIComponent(groupCode.toUpperCase())}/messages/${messageId}/image`;
}

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** `data:image/jpeg;base64,...` → نوع + بايتات. أي حاجة تانية → null. */
export function parseDataUrl(value: string | null | undefined): { type: string; body: Buffer } | null {
  if (!value) return null;
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([\s\S]*)$/i.exec(value);
  if (!m) return null;
  const type = m[1].toLowerCase();
  if (!ALLOWED_TYPES.has(type)) return null;
  const body = Buffer.from(m[2], "base64");
  return body.length ? { type, body } : null;
}

const MAX_ITEMS = 60;
const MAX_BYTES = 12 * 1024 * 1024;

interface Cached { type: string; body: Buffer }
const cache = new Map<number, Cached>();
let cachedBytes = 0;

export function getCachedImage(id: number): Cached | undefined {
  const hit = cache.get(id);
  if (hit) {
    // الأحدث استخداماً يروح للآخر — والأقدم بيتشال الأول
    cache.delete(id);
    cache.set(id, hit);
  }
  return hit;
}

export function cacheImage(id: number, img: Cached): void {
  dropCachedImage(id);
  cache.set(id, img);
  cachedBytes += img.body.length;
  while (cache.size > MAX_ITEMS || cachedBytes > MAX_BYTES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    dropCachedImage(oldest.value);
  }
}

/** بعد حذف رسالة — الصورة ماتفضلش تترد من الذاكرة. */
export function dropCachedImage(id: number): void {
  const old = cache.get(id);
  if (!old) return;
  cachedBytes -= old.body.length;
  cache.delete(id);
}

/* ── R2 (٢٠٢٦-١٠-٢٥) ────────────────────────────────────────────────────────
 * الصورة الجديدة بتترفع على Cloudflare R2، والقاعدة بتشيل المفتاح بس
 * (`r2:mybible/chat/<group>/<...>.jpg`). الخروج من R2 مجاني، فالصورة مابقتش
 * بتتحسب من حصة Supabase ولا من حجم القاعدة (٥٠٠ ميجا في الباقة المجانية).
 * لو R2 مش مضبوط أو الرفع فشل → الصورة بتتخزّن في القاعدة زي الأول (مابتضيعش).
 * والقديمة بتتنقل في الخلفية (`chat-image-migrate.ts`).
 * `MYBIBLE_CHAT_IMAGES_R2=off` بيوقّف الاتنين. */

export const R2_REF = "r2:";

export function chatImagesOnR2(): boolean {
  return process.env.MYBIBLE_CHAT_IMAGES_R2 !== "off" && r2Configured();
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export function r2KeyFor(groupId: number, type: string): string {
  return `mybible/chat/${groupId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${EXT[type] || "bin"}`;
}

/** القيمة اللي تتكتب في image_url لصورة جديدة: مفتاح R2، أو الصورة نفسها لو R2 مش متاح. */
export async function storeChatImage(dataUrl: string, groupId: number): Promise<string> {
  const img = parseDataUrl(dataUrl);
  if (!img || !chatImagesOnR2()) return dataUrl;
  const key = r2KeyFor(groupId, img.type);
  try {
    await r2Put(key, img.body, img.type);
    return R2_REF + key;
  } catch (err: any) {
    console.error("[chat-images] الرفع على R2 فشل — الصورة اتخزّنت في القاعدة:", err?.message || err);
    return dataUrl;
  }
}

/** الصورة من القيمة المخزّنة (R2 أو base64). null = مش موجودة. */
export async function loadChatImage(stored: string | null | undefined): Promise<Cached | null> {
  if (!stored) return null;
  if (stored.startsWith(R2_REF)) {
    const obj = await r2Get(stored.slice(R2_REF.length));
    return obj && obj.body.length ? { type: obj.type, body: obj.body } : null;
  }
  return parseDataUrl(stored);
}

/** بعد حذف رسالة — الصورة تتمسح من R2 كمان (من غير ما فشلها يوقّف الحذف). */
export function forgetChatImage(stored: string | null | undefined): void {
  if (!stored || !stored.startsWith(R2_REF) || !r2Configured()) return;
  r2Delete(stored.slice(R2_REF.length)).catch((err) => console.error("[chat-images] مسح من R2 فشل:", err?.message || err));
}
