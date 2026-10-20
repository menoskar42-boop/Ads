/**
 * «العرض التقديمى» ← صور خطة الصيانة من برنامج الصيانة نفسه (المالك ٢٠٢٦-١٠-٢٠):
 * «خلينى أحدد رقم بكس وكابينة بسنترال معين وانت تجيب الصور الخاصة بيهم قبل وبعد، وأنا أختار … والحد ٨».
 *
 * جداول الصيانة فى نفس قاعدة Service Flow بسكيما maintenance (exchanges ← cabinets ← boxes ← photos).
 * الصورة نفسها يا إما على R2 (storage_key) يا إما فى عمود data القديم. هنا قراية بس من الصيانة —
 * والصورة اللى المالك بيختارها بتتنسخ (مصغّرة JPEG) لصور العرض فى app_settings، فالعرض مايتأثرش لو
 * الصورة اتمسحت من الصيانة بعد كده.
 */
import { createRequire } from "module";

type Q = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

const SCHEMA = (process.env.MAINTENANCE_DB_SCHEMA || "maintenance").replace(/[^a-zA-Z0-9_]/g, "") || "maintenance";
const T = (name: string) => `${SCHEMA}.${name}`;

// نفس طريقة routes.ts مع d1-hierarchy.js: CommonJS غير مبنْدَل جنب ملف الدخول (server/ فى dev، dist/ فى prod)
const requireCjs = createRequire(typeof __filename !== "undefined" ? __filename : `${process.cwd()}/server/routes.ts`);
let r2: any = null;
function r2Client() {
  if (!r2) r2 = requireCjs("./maintenance/app/utils/r2.js");
  return r2;
}

export const MAX_DECK_PHOTOS = 8;

/** السنترالات اللى فيها صور */
export async function maintExchanges(db: Q) {
  const { rows } = await db.query(`
    SELECT e.id, e.name, COUNT(p.id)::int AS photos
      FROM ${T("exchanges")} e JOIN ${T("cabinets")} c ON c.exchange_id = e.id
      JOIN ${T("boxes")} b ON b.cabinet_id = c.id JOIN ${T("photos")} p ON p.box_id = b.id AND COALESCE(p.media_type, 'photo') = 'photo'
     GROUP BY e.id, e.name ORDER BY e.name`);
  return rows;
}

/** كباين السنترال اللى فيها صور */
export async function maintCabinets(db: Q, exchangeId: number) {
  const { rows } = await db.query(`
    SELECT c.id, c.number, COUNT(p.id)::int AS photos
      FROM ${T("cabinets")} c JOIN ${T("boxes")} b ON b.cabinet_id = c.id
      JOIN ${T("photos")} p ON p.box_id = b.id AND COALESCE(p.media_type, 'photo') = 'photo'
     WHERE c.exchange_id = $1
     GROUP BY c.id, c.number ORDER BY c.number`, [exchangeId]);
  return rows;
}

/** بكسيات الكابينة اللى فيها صور، بعدد قبل/بعد */
export async function maintBoxes(db: Q, cabinetId: number) {
  const { rows } = await db.query(`
    SELECT b.id, b.number,
           COUNT(p.id) FILTER (WHERE p.photo_type = 'before')::int AS before,
           COUNT(p.id) FILTER (WHERE p.photo_type = 'after')::int AS after
      FROM ${T("boxes")} b JOIN ${T("photos")} p ON p.box_id = b.id AND COALESCE(p.media_type, 'photo') = 'photo'
     WHERE b.cabinet_id = $1
     GROUP BY b.id, b.number ORDER BY b.number`, [cabinetId]);
  return rows;
}

/** صور البكس (صور بس — من غير الفيديوهات) */
export async function maintPhotos(db: Q, boxId: number) {
  const { rows } = await db.query(`
    SELECT p.id, p.photo_type AS type, COALESCE(p.taken_at, p.uploaded_at) AS at
      FROM ${T("photos")} p
     WHERE p.box_id = $1 AND COALESCE(p.media_type, 'photo') = 'photo'
     ORDER BY p.photo_type DESC, COALESCE(p.taken_at, p.uploaded_at)`, [boxId]);
  return rows.map((r: any) => ({ id: Number(r.id), type: r.type === "after" ? "after" : "before", at: r.at }));
}

/** بايتات الصورة الأصلية: من R2 لو ليها storage_key، وإلا من عمود data */
export async function maintPhotoBytes(db: Q, photoId: number): Promise<Buffer | null> {
  const { rows } = await db.query(
    `SELECT data, storage_key FROM ${T("photos")} WHERE id = $1 AND COALESCE(media_type, 'photo') = 'photo'`, [photoId]);
  const p = rows[0];
  if (!p) return null;
  if (p.storage_key) {
    const c = r2Client();
    if (c.isConfigured()) {
      const obj = await c.getObject(p.storage_key);
      if (obj?.body?.length) return obj.body;
    }
  }
  return p.data ? Buffer.from(p.data) : null;
}
