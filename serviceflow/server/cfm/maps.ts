// ============================================================================
// server/cfm/maps.ts — «الخرائط» فى برنامج الكوابل (المالك ٢٠٢٦-١١-١٢)
// خريطة الشبكة الثانوية: صورتها + جداول التفريغ (shared/cfm-maps/types.ts). كل مستخدمى الكوابل يشوفوا،
// والأدمن ومهندس الكوابل والمشرف يعدّلوا الجداول ويضيفوا صور. خريطة الغنايم 6.7 بتتسجّل أول مرة من الكود.
// ============================================================================
import type { Express, Request, Response, NextFunction } from "express";
import { readFile } from "fs/promises";
import { timingSafeEqual } from "crypto";
import { r2Client } from "../presentation-maint-photos";
import { join } from "path";
import { pool } from "../db";
import { GHANAYEM_6_7, GHANAYEM_6_7_KEY } from "@shared/cfm-maps/ghanayem-6-7";
import type { CableMapData } from "@shared/cfm-maps/types";
import { DWG_SEED_MAPS } from "./maps-seed-list";

type Mw = (req: Request, res: Response, next: NextFunction) => void;
export const MAP_EDITOR_ROLES = ["admin", "cable_engineer", "supervisor"];
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const userOf = (req: any) => req.session?.cfmUser || null;
const canEdit = (req: any) => MAP_EDITOR_ROLES.includes(String(userOf(req)?.role || ""));

/** التفريغ اللى جاى من الشاشة: نفس الشكل، والقوايم قوايم، وحجم معقول (مش أى JSON) */
export function cleanMapData(raw: any): CableMapData | null {
  if (!raw || typeof raw !== "object" || !raw.meta || typeof raw.meta !== "object") return null;
  const arr = (v: any) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, 2000) : []);
  const data: CableMapData = {
    meta: raw.meta,
    segments: arr(raw.segments),
    boxes: arr(raw.boxes),
    spares: arr(raw.spares),
    markers: arr(raw.markers),
    notes: Array.isArray(raw.notes) ? raw.notes.map((x: any) => String(x).slice(0, 2000)).slice(0, 200) : [],
  };
  if (JSON.stringify(data).length > 2_000_000) return null;
  return data;
}

async function seedDwgMaps(): Promise<void> {
  const keys = DWG_SEED_MAPS.map((m) => m.key);
  const have = new Set((await pool.query(`SELECT map_key FROM cfm_maps WHERE map_key = ANY($1)`, [keys])).rows.map((r: any) => r.map_key));
  for (const m of DWG_SEED_MAPS) {
    if (have.has(m.key)) continue;
    const data: CableMapData = { meta: { central: m.central, cabinet: m.cabinet, title: m.title }, segments: [], boxes: [], spares: [], markers: [], notes: [] };
    const ins = await pool.query(
      `INSERT INTO cfm_maps (map_key, central, cabinet, title, data, updated_by)
       VALUES ($1, $2, $3, $4, $5, 'صورة من ملف الأوتوكاد') ON CONFLICT (map_key) DO NOTHING RETURNING id`,
      [m.key, m.central, m.cabinet, m.title, JSON.stringify(data)]);
    const id = ins.rows[0]?.id;
    if (!id) continue;
    for (const img of m.images) {
      try {
        const bytes = await readFile(join(process.cwd(), "server/cfm/maps-seed", img.file));
        await pool.query(`INSERT INTO cfm_map_images (map_id, caption, mime, bytes, uploaded_by) VALUES ($1, $2, 'image/webp', $3, 'ملفات الأوتوكاد')`,
          [id, img.caption, bytes]);
      } catch (e) {
        console.warn(`[cfm maps] صورة ${img.file} ماتقرتش:`, (e as Error).message);
      }
    }
  }
}

/**
 * تصحيح الغنايم 6.7 (المالك ٢٠٢٦-١١-١٩ «ايوه صلح»): وصلة 22 ← بكس 27 = ١٢ م (ملف الأوتوكاد) مش ١٨ (القراية من الصورة).
 * الخريطة فى القاعدة من ١٢ نوفمبر، فالتصحيح بيتعمل عليها مرة واحدة — لو حد عدّل الطول لرقم تانى مابنلمسوش.
 */
export async function patchGhanayem67(): Promise<boolean> {
  const r = (await pool.query(`SELECT id, data FROM cfm_maps WHERE map_key = $1`, [GHANAYEM_6_7_KEY])).rows[0];
  const segs: any[] = Array.isArray(r?.data?.segments) ? r.data.segments : [];
  const s = segs.find((x) => x && x.from === "J22" && x.to === "B27" && Number(x.lengthM) === 18);
  if (!r || !s) return false;
  s.lengthM = 12;
  s.notes = [s.notes, "١٢ م من ملف الأوتوكاد Scd6.7.dwg (الصورة كانت اتقرت ١٨) — المالك ٢٠٢٦-١١-١٩"].filter(Boolean).join(" · ");
  await pool.query(`UPDATE cfm_maps SET data = $2, updated_by = 'تصحيح من ملف الأوتوكاد', updated_at = now() WHERE id = $1`, [r.id, JSON.stringify(r.data)]);
  return true;
}

/** خريطة الغنايم 6.7 (اتفرّغت من صورة المالك) — بتتسجّل مرة واحدة بس، والتعديلات بعد كده فى القاعدة */
export async function seedCfmMaps(): Promise<void> {
  await seedDwgMaps();
  const ex = await pool.query(`SELECT id FROM cfm_maps WHERE map_key = $1`, [GHANAYEM_6_7_KEY]);
  if (ex.rowCount) { await patchGhanayem67(); return; }
  const ins = await pool.query(
    `INSERT INTO cfm_maps (map_key, central, cabinet, title, data, updated_by)
     VALUES ($1, $2, $3, $4, $5, 'تفريغ أولى من الصورة') ON CONFLICT (map_key) DO NOTHING RETURNING id`,
    [GHANAYEM_6_7_KEY, GHANAYEM_6_7.meta.central, GHANAYEM_6_7.meta.cabinet, GHANAYEM_6_7.meta.title, JSON.stringify(GHANAYEM_6_7)]);
  const id = ins.rows[0]?.id;
  if (!id) return;
  try {
    const bytes = await readFile(join(process.cwd(), "server/cfm/maps-seed/ghanayem-6-7.jpg"));
    await pool.query(`INSERT INTO cfm_map_images (map_id, caption, mime, bytes, uploaded_by) VALUES ($1, $2, 'image/jpeg', $3, 'المالك')`,
      [id, "صورة الخريطة كاملة (موبايل)", bytes]);
  } catch (e) {
    console.warn("[cfm maps] صورة الغنايم 6.7 ماتقرتش:", (e as Error).message);
  }
}

export function registerCfmMapRoutes(app: Express, requireAuth: Mw) {
  let seeded: Promise<void> | null = null;
  const ensureSeed = () => (seeded ||= seedCfmMaps().catch((e) => { seeded = null; console.error("[cfm maps] seed:", e.message); }));

  app.get("/api/cfm/maps", requireAuth, async (_req, res) => {
    try {
      await ensureSeed();
      const { rows } = await pool.query(
        `SELECT m.id, m.map_key AS "mapKey", m.central, m.cabinet, m.title, m.updated_at AS "updatedAt", m.updated_by AS "updatedBy",
                jsonb_array_length(COALESCE(m.data->'boxes', '[]'::jsonb)) AS boxes,
                jsonb_array_length(COALESCE(m.data->'segments', '[]'::jsonb)) AS segments,
                (SELECT COALESCE(jsonb_agg(DISTINCT b->>'box'), '[]'::jsonb) FROM jsonb_array_elements(
                   CASE WHEN jsonb_typeof(m.data->'boxes') = 'array' THEN m.data->'boxes' ELSE '[]'::jsonb END) b
                  WHERE COALESCE(b->>'box', '') <> '') AS "boxList",
                (SELECT count(*)::int FROM cfm_map_images i WHERE i.map_id = m.id) AS images
           FROM cfm_maps m ORDER BY m.central, m.cabinet, m.id`);
      res.json({ items: rows });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/cfm/maps/:id", requireAuth, async (req: any, res) => {
    try {
      const id = Number(req.params.id);
      const m = (await pool.query(`SELECT id, map_key AS "mapKey", central, cabinet, title, data, updated_at AS "updatedAt", updated_by AS "updatedBy"
                                     FROM cfm_maps WHERE id = $1`, [id])).rows[0];
      if (!m) return res.status(404).json({ error: "الخريطة مش موجودة" });
      const images = (await pool.query(`SELECT id, caption, mime, octet_length(bytes) AS size, created_at AS "createdAt"
                                          FROM cfm_map_images WHERE map_id = $1
                                          ORDER BY (COALESCE(caption, '') LIKE 'مرجع%') , id`, [id])).rows;   // الكهربى الأول، والمراجع (المساحى) بعده
      res.json({ ...m, images, canEdit: canEdit(req) });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.get("/api/cfm/maps/:id/images/:imageId", requireAuth, async (req, res) => {
    try {
      const r = (await pool.query(`SELECT mime, bytes, storage_key FROM cfm_map_images WHERE id = $1 AND map_id = $2`,
        [Number(req.params.imageId), Number(req.params.id)])).rows[0];
      if (!r) return res.status(404).end();
      let bytes: Buffer | null = r.bytes ? Buffer.from(r.bytes) : null;
      if (!bytes && r.storage_key) {
        const c = r2Client();
        if (!c.isConfigured()) return res.status(503).json({ error: "تخزين R2 مش متظبط" });
        const obj = await c.getObject(r.storage_key);
        bytes = obj?.body?.length ? obj.body : null;
      }
      if (!bytes) return res.status(404).end();
      res.setHeader("Content-Type", r.mime);
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.end(bytes);
    } catch { res.status(500).end(); }
  });

  // حفظ الجداول بعد التعديل (الأدمن · مهندس الكوابل · المشرف)
  app.put("/api/cfm/maps/:id", requireAuth, async (req: any, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: "التعديل للأدمن ومهندس الكوابل والمشرف بس" });
    const data = cleanMapData(req.body?.data);
    if (!data) return res.status(400).json({ error: "بيانات الخريطة مش سليمة" });
    try {
      const r = await pool.query(
        `UPDATE cfm_maps SET data = $2, central = $3, cabinet = $4, title = $5, updated_by = $6, updated_at = now() WHERE id = $1 RETURNING id`,
        [Number(req.params.id), JSON.stringify(data), data.meta.central || null, data.meta.cabinet || null, data.meta.title || null,
          userOf(req)?.name || userOf(req)?.username || null]);
      if (!r.rowCount) return res.status(404).json({ error: "الخريطة مش موجودة" });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // خريطة جديدة فاضية (تتملى من الشاشة) — نفس صلاحية التعديل
  app.post("/api/cfm/maps", requireAuth, async (req: any, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: "للأدمن ومهندس الكوابل والمشرف بس" });
    const central = String(req.body?.central || "").trim().slice(0, 100);
    const cabinet = String(req.body?.cabinet || "").trim().slice(0, 50);
    if (!central || !cabinet) return res.status(400).json({ error: "اكتب السنترال ورقم الكابينة" });
    const data: CableMapData = { meta: { central, cabinet }, segments: [], boxes: [], spares: [], markers: [], notes: [] };
    try {
      const r = await pool.query(`INSERT INTO cfm_maps (central, cabinet, title, data, updated_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [central, cabinet, `كابينة ${cabinet}`, JSON.stringify(data), userOf(req)?.name || null]);
      res.json({ ok: true, id: r.rows[0].id });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  /**
   * استيراد خرايط الأوتوكاد كصور على R2 (المالك ٢٠٢٦-١١-١٩: «صور برده بجوار الكهربى ويتخزنوا فى r2» · «خرايط الغنايم: خلص كله»).
   * المستودع عام، فالصور مابتعدّيش على GitHub: كلود بيبعتها هنا مباشرة بتوكن (سرّ CFM_MAP_IMPORT_TOKEN فى ريبليت).
   * من غير السرّ ده المسار مقفول (404). صورة واحدة لكل طلب؛ نفس الاسم (name) بيستبدل القديمة. الخريطة بتتعمل لو مش موجودة
   * (map_key) — والتفريغ بتاعها مابيتلمسش.
   */
  app.post("/api/cfm/maps/import", async (req: any, res) => {
    const want = String(process.env.CFM_MAP_IMPORT_TOKEN || "");
    const got = String(req.get("x-cfm-import-token") || "");
    if (want.length < 24 || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return res.status(404).end();
    const b = req.body || {};
    const key = String(b.key || "").trim();
    const name = String(b.name || "").trim();
    if (!/^[a-z0-9][a-z0-9.\-]{1,80}$/i.test(key) || !/^[a-z0-9][a-z0-9.\-_]{1,80}$/i.test(name)) return res.status(400).json({ error: "key/name" });
    const mime = String(b.mime || "image/webp");
    if (!IMAGE_MIMES.has(mime)) return res.status(400).json({ error: "mime" });
    const bytes = Buffer.from(String(b.base64 || ""), "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: "size" });
    const c = r2Client();
    if (!c.isConfigured()) return res.status(503).json({ error: "تخزين R2 مش متظبط" });
    try {
      const central = String(b.central || "").slice(0, 100), cabinet = String(b.cabinet || "").slice(0, 50), title = String(b.title || "").slice(0, 300);
      let id = (await pool.query(`SELECT id FROM cfm_maps WHERE map_key = $1`, [key])).rows[0]?.id;
      if (!id) {
        const data: CableMapData = { meta: { central, cabinet, title }, segments: [], boxes: [], spares: [], markers: [], notes: [] };
        id = (await pool.query(
          `INSERT INTO cfm_maps (map_key, central, cabinet, title, data, updated_by) VALUES ($1, $2, $3, $4, $5, 'صورة من ملف الأوتوكاد')
           ON CONFLICT (map_key) DO UPDATE SET map_key = EXCLUDED.map_key RETURNING id`,
          [key, central || null, cabinet || null, title || null, JSON.stringify(data)])).rows[0].id;
      }
      // ٢٠٢٦-١١-١٩ (المالك: «الخريطة الكهربية لازم يبقى فيها كابينة وبكس»): مع صورة الكهربى بييجى تفريغ الكابينة والبكسيات من
      // نص ملف الأوتوكاد — بيتحط بس على خريطة مالهاش تفريغ بإيد (مفيش كابلات، واللى عدّلها آخر مرة الاستيراد نفسه أو مفيش بكسيات).
      const incoming = b.data && typeof b.data === "object" ? cleanMapData(b.data) : null;
      if (incoming && incoming.boxes.length) {
        const cur = (await pool.query(`SELECT data, updated_by FROM cfm_maps WHERE id = $1`, [id])).rows[0];
        const segs = Array.isArray(cur?.data?.segments) ? cur.data.segments.length : 0;
        const curBoxes = Array.isArray(cur?.data?.boxes) ? cur.data.boxes.length : 0;
        const auto = ["صورة من ملف الأوتوكاد", "تفريغ آلى من ملف الأوتوكاد"].includes(String(cur?.updated_by || ""));
        // التفريغ الآلى نفسه بيتحدّث لما نرفع نسخة أحسن منه — اللى اتعدّل بإيد (updated_by مش الاستيراد) مابيتلمسش
        if (auto || (!segs && !curBoxes)) {
          const data = { ...incoming, meta: { ...(cur?.data?.meta || {}), ...incoming.meta } };
          await pool.query(`UPDATE cfm_maps SET data = $2, central = COALESCE(NULLIF($3, ''), central), cabinet = COALESCE(NULLIF($4, ''), cabinet),
                             updated_by = 'تفريغ آلى من ملف الأوتوكاد', updated_at = now() WHERE id = $1`,
            [id, JSON.stringify(data), data.meta.central || "", data.meta.cabinet || ""]);
        }
      }
      const storageKey = `cfm-maps/${key}/${name}`;
      await c.putObject(storageKey, bytes, mime);
      const caption = String(b.caption || "").slice(0, 300) || null;
      await pool.query(`DELETE FROM cfm_map_images WHERE map_id = $1 AND (storage_key = $2 OR (storage_key IS NULL AND caption = $3))`, [id, storageKey, caption]);
      const r = await pool.query(`INSERT INTO cfm_map_images (map_id, caption, mime, bytes, storage_key, uploaded_by) VALUES ($1, $2, $3, NULL, $4, 'ملفات الأوتوكاد') RETURNING id`,
        [id, caption, mime, storageKey]);
      res.json({ ok: true, mapId: id, imageId: r.rows[0].id, size: bytes.length });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  // صورة للخريطة (أجزاء الخريطة اللى المالك بيصوّرها) — base64 فى JSON
  app.post("/api/cfm/maps/:id/images", requireAuth, async (req: any, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: "للأدمن ومهندس الكوابل والمشرف بس" });
    const mime = String(req.body?.mime || "");
    if (!IMAGE_MIMES.has(mime)) return res.status(400).json({ error: "الصورة لازم JPG أو PNG أو WEBP" });
    const bytes = Buffer.from(String(req.body?.base64 || ""), "base64");
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: "حجم الصورة مش مناسب (لحد ١٢ ميجا)" });
    try {
      const r = await pool.query(`INSERT INTO cfm_map_images (map_id, caption, mime, bytes, uploaded_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [Number(req.params.id), String(req.body?.caption || "").slice(0, 200) || null, mime, bytes, userOf(req)?.name || null]);
      res.json({ ok: true, id: r.rows[0].id });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  app.delete("/api/cfm/maps/:id/images/:imageId", requireAuth, async (req: any, res) => {
    if (!canEdit(req)) return res.status(403).json({ error: "للأدمن ومهندس الكوابل والمشرف بس" });
    try {
      const gone = await pool.query(`DELETE FROM cfm_map_images WHERE id = $1 AND map_id = $2 RETURNING storage_key`, [Number(req.params.imageId), Number(req.params.id)]);
      const sk = gone.rows[0]?.storage_key;
      if (sk) { try { const c = r2Client(); if (c.isConfigured()) await c.deleteObject(sk); } catch {} }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });
}
