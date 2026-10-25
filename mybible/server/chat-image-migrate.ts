/**
 * نقل صور الشات القديمة من القاعدة لـ R2 — في الخلفية، صورة صورة.
 *
 * ليه جوّه التطبيق ومش سكربت؟ Shell بتاع ريبليت بيوصل لقاعدة غير اللي الموقع
 * بيقرا منها (docs/HANDOVER.md)، فالنقل لازم يتعمل من العملية نفسها.
 *
 * لكل صورة: تتقري من القاعدة → تترفع على R2 → **تتقري تاني من R2 وتتقارن
 * (sha256)** → وبعدها بس image_url يتغيّر لمفتاح R2، وبشرط إن الصورة في
 * القاعدة لسه هي نفسها (md5). لو أي خطوة فشلت الصورة بتفضل في القاعدة زي ما هي.
 * لو الرسالة اتمسحت وقت النقل، النسخة اللي على R2 بتتمسح.
 *
 * مابيشتغلش غير لو R2 مضبوط و`MYBIBLE_CHAT_IMAGES_R2` مش `off`.
 */
import crypto from "node:crypto";
import { dbPool } from "./db-pool";
import { R2_REF, chatImagesOnR2, parseDataUrl, r2KeyFor } from "./chat-images";
import { r2Delete, r2Get, r2Put, sha256 } from "./r2";

const START_DELAY_MS = 2 * 60_000;   // بعد ما الموقع يقوم ويهدى
const PAUSE_MS = 3_000;               // بين كل صورة والتانية — من غير ضغط على القاعدة
const RETRY_MS = 30 * 60_000;         // لو حصل عطل، نحاول تاني بعد نص ساعة

export interface MigrateDeps {
  next(afterId: number): Promise<{ id: number; groupId: number } | null>;
  read(id: number): Promise<string | null>;
  swap(id: number, key: string, md5: string): Promise<boolean>;
  put(key: string, body: Buffer, type: string): Promise<void>;
  get(key: string): Promise<{ body: Buffer } | null>;
  del(key: string): Promise<void>;
  sleep(ms: number): Promise<void>;
}

export const dbDeps: MigrateDeps = {
  async next(afterId) {
    // من غير عمود الصورة — رقم الرسالة بس
    const { rows } = await dbPool.query(
      `SELECT id, group_id FROM group_messages WHERE id > $1 AND left(image_url, 5) = 'data:' ORDER BY id LIMIT 1`,
      [afterId],
    );
    return rows[0] ? { id: Number(rows[0].id), groupId: Number(rows[0].group_id) } : null;
  },
  async read(id) {
    const { rows } = await dbPool.query(
      `SELECT image_url FROM group_messages WHERE id = $1 AND left(image_url, 5) = 'data:'`, [id]);
    return rows[0]?.image_url ?? null;
  },
  async swap(id, key, md5) {
    const r = await dbPool.query(
      `UPDATE group_messages SET image_url = $1 WHERE id = $2 AND md5(image_url) = $3`, [R2_REF + key, id, md5]);
    return (r.rowCount ?? 0) === 1;
  },
  put: r2Put,
  get: r2Get,
  del: r2Delete,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** بينقل كل الصور اللي في القاعدة. بيرجّع الأعداد. بيرمي لو القاعدة أو R2 وقعوا. */
export async function migrateChatImages(d: MigrateDeps = dbDeps): Promise<{ moved: number; skipped: number }> {
  let cursor = 0, moved = 0, skipped = 0;
  for (;;) {
    const row = await d.next(cursor);
    if (!row) break;
    cursor = row.id;
    const stored = await d.read(row.id);
    const img = parseDataUrl(stored);
    if (!stored || !img) { skipped++; continue; } // مش صورة صالحة — تفضل زي ما هي
    const key = r2KeyFor(row.groupId, img.type);
    await d.put(key, img.body, img.type);
    const back = await d.get(key);
    if (!back || sha256(back.body) !== sha256(img.body)) {
      await d.del(key).catch(() => {});
      throw new Error(`صورة الرسالة ${row.id}: النسخة على R2 مش مطابقة — النقل اتوقف`);
    }
    const md5 = crypto.createHash("md5").update(stored, "utf8").digest("hex");
    if (await d.swap(row.id, key, md5)) moved++;
    else { skipped++; await d.del(key).catch(() => {}); } // اتمسحت أو اتغيّرت وقت النقل
    await d.sleep(PAUSE_MS);
  }
  return { moved, skipped };
}

export function scheduleChatImageMigration(): void {
  if (!chatImagesOnR2()) return;
  const run = async () => {
    try {
      const { moved, skipped } = await migrateChatImages();
      if (moved || skipped) console.log(`[chat-images] نقل الصور القديمة لـ R2: ${moved} اتنقلت، ${skipped} اتسابت`);
    } catch (err: any) {
      console.error("[chat-images] نقل الصور لـ R2 وقف — هيحاول تاني بعد نص ساعة:", err?.message || err);
      setTimeout(run, RETRY_MS).unref();
    }
  };
  setTimeout(run, START_DELAY_MS).unref();
}
