// «توزيع الكباين» — كل فنى وكباينه، يتعدّل من السوبر أدمن بس (المالك ٢٠٢٦-١١-٠١).
//
// الجدول نفسه هو cabinet_technicians (اللى كل التقارير والموقع بيقروا منه): سطر لكل كابينة نحاس
// (كابينة الامسان اللى عليها كابينتين نحاس = سطرين بنفس كود الامسان). الحفظ بيقارن باللى فى القاعدة:
//   • الفنى اتغيّر ⇒ سطر فى cabinet_tech_history بتاريخ التغيير (القديم ← الجديد) — «الأعطال فى الألف»
//     بتحسب الفترة قبل التاريخ على القديم وبعده على الجديد (cabinet-reassign.ts: workerAt/buildAdslReport).
//   • سطر جديد ⇒ يتضاف · سطر اتشال ⇒ يتمسح · السنترال/الكود/الرقم ⇒ يتعدّل.
// والشركاء (tech_partners): فنى مالوش كباين بيشتغل مع فنى تانى من تاريخ ⇒ نتايجهم واحدة.
import type { Express } from "express";
import type { Pool } from "pg";
import { normCab } from "@shared/cab-norm";

export interface AssignRow { id?: number | null; central: string; msanCode: string; cabinNumber: string; workerCode: string }
export interface DbAssignRow { id: number; central: string; msanCode: string; cabinNumber: string; workerCode: string }
export interface PartnerRow { id?: number | null; techCode: string; partnerCode: string; from: string; to?: string | null; note?: string | null }

const clean = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z"));
export const dayBefore = (d: string) => new Date(Date.parse(d + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10);

export interface AssignPlan {
  inserts: AssignRow[];
  updates: { id: number; row: AssignRow; workerChanged: boolean; oldWorker: string }[];
  deletes: number[];
  errors: string[];
}

/** اللى اتبعت من الجدول ⇐ اللى فى القاعدة: إيه يتضاف/يتعدّل/يتمسح، وإيه غلط (من غير ما نلمس القاعدة). */
export function planAssignments(current: DbAssignRow[], incoming: AssignRow[], knownWorkers: Set<string>): AssignPlan {
  const byId = new Map(current.map((r) => [r.id, r]));
  const seen = new Set<number>();
  const keys = new Map<string, number>();
  const plan: AssignPlan = { inserts: [], updates: [], deletes: [], errors: [] };
  incoming.forEach((raw, i) => {
    const row: AssignRow = { id: raw.id ?? null, central: clean(raw.central), msanCode: clean(raw.msanCode), cabinNumber: clean(raw.cabinNumber), workerCode: clean(raw.workerCode) };
    const line = `سطر ${i + 1}`;
    if (!row.central || !row.cabinNumber) { plan.errors.push(`${line}: السنترال ورقم الكابينة النحاس مطلوبين`); return; }
    if (row.workerCode && !knownWorkers.has(row.workerCode)) { plan.errors.push(`${line}: الفنى مش فى أسماء الفنيين`); return; }
    const k = `${row.central}|${normCab(row.cabinNumber)}|${row.msanCode}`;
    if (keys.has(k)) { plan.errors.push(`${line}: نفس السنترال والكابينة والامسان متكررين (سطر ${keys.get(k)! + 1})`); return; }
    keys.set(k, i);
    if (row.id != null) {
      const cur = byId.get(Number(row.id));
      if (!cur) { plan.errors.push(`${line}: السطر ده اتمسح أو اتغيّر من مكان تانى — اقفل الجدول وافتحه تانى`); return; }
      seen.add(cur.id);
      const workerChanged = (cur.workerCode || "") !== row.workerCode;
      if (workerChanged || cur.central !== row.central || (cur.msanCode || "") !== row.msanCode || cur.cabinNumber !== row.cabinNumber) {
        plan.updates.push({ id: cur.id, row, workerChanged, oldWorker: cur.workerCode || "" });
      }
    } else {
      plan.inserts.push(row);
    }
  });
  for (const r of current) if (!seen.has(r.id)) plan.deletes.push(r.id);
  return plan;
}

/** الشركاء: فنى مش شريك لنفسه، ومالوش كباين، ومش شريك لاتنين فى نفس الوقت. */
export function checkPartners(partners: PartnerRow[], rowsAfter: AssignRow[], knownWorkers: Set<string>): string[] {
  const errs: string[] = [];
  const withCabins = new Set(rowsAfter.map((r) => r.workerCode).filter(Boolean));
  const overlap = (a: PartnerRow, b: PartnerRow) => a.from <= (b.to || "9999-12-31") && b.from <= (a.to || "9999-12-31");
  partners.forEach((p, i) => {
    const line = `شريك ${i + 1}`;
    if (!knownWorkers.has(p.techCode) || !knownWorkers.has(p.partnerCode)) return void errs.push(`${line}: اختار الفنيين من القايمة`);
    if (p.techCode === p.partnerCode) return void errs.push(`${line}: الفنى مايشتغلش مع نفسه`);
    if (!isDate(p.from) || (p.to && !isDate(p.to)) || (p.to && p.to < p.from)) return void errs.push(`${line}: التاريخ غلط`);
    if (withCabins.has(p.techCode)) errs.push(`${line}: الفنى ده ليه كباين فى الجدول — الشراكة للفنى اللى مالوش كباين`);
    if (partners.some((q, j) => j !== i && q.techCode === p.partnerCode && overlap(p, q))) errs.push(`${line}: الشريك نفسه شغال مع فنى تانى فى نفس الفترة`);
    if (partners.some((q, j) => j < i && q.techCode === p.techCode && overlap(p, q))) errs.push(`${line}: الفنى ده شغال مع حد تانى فى نفس الفترة`);
  });
  return errs;
}

export const cairoToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** كود الفنى اللى الموقع بيعرض خطوطه: الفنى نفسه، أو شريكه لو شغالين مع بعض النهارده. */
const partnerCache = new Map<string, { code: string; at: number }>();
export async function siteWorkerCode(pool: Pool, workerCode: string): Promise<string> {
  const wc = String(workerCode || "").trim();
  if (!wc) return wc;
  const hit = partnerCache.get(wc);
  if (hit && Date.now() - hit.at < 60_000) return hit.code;
  let code = wc;
  try {
    const { rows } = await pool.query(
      `SELECT partner_code FROM tech_partners
        WHERE tech_code = $1 AND effective_date <= (now() AT TIME ZONE 'Africa/Cairo')::date
          AND (end_date IS NULL OR end_date >= (now() AT TIME ZONE 'Africa/Cairo')::date)
        ORDER BY id LIMIT 1`, [wc]);
    if (rows[0]?.partner_code) code = String(rows[0].partner_code);
  } catch { /* الجدول لسه مااتعملش ⇒ الفنى نفسه */ }
  partnerCache.set(wc, { code, at: Date.now() });
  return code;
}
export const clearPartnerCache = () => partnerCache.clear();

export function registerCabinetAssignments(app: Express, deps: { pool: Pool; requireAuth: any; requireSuperAdmin: any }): void {
  const { pool, requireAuth, requireSuperAdmin } = deps;

  const techList = async () => (await pool.query(
    `SELECT worker_code AS code, MIN(tech_name) AS name FROM technician_names
      WHERE COALESCE(btrim(worker_code), '') <> '' GROUP BY worker_code ORDER BY MIN(tech_name)`)).rows
    .map((r: any) => ({ code: String(r.code).trim(), name: r.name }));

  app.get("/api/cabinet-assignments", requireAuth, requireSuperAdmin, async (_req, res) => {
    try {
      const rows = (await pool.query(
        `SELECT ct.id, ct.central_name AS central, COALESCE(ct.cabin_code, '') AS "msanCode", ct.cabin_number AS "cabinNumber",
                COALESCE(btrim(ct.worker_code), '') AS "workerCode"
           FROM cabinet_technicians ct ORDER BY ct.central_name, ct.cabin_code NULLS LAST, ct.cabin_number, ct.id`)).rows;
      const partners = (await pool.query(
        `SELECT id, tech_code AS "techCode", partner_code AS "partnerCode", effective_date::text AS "from", end_date::text AS "to", note
           FROM tech_partners ORDER BY effective_date DESC, id DESC`)).rows;
      const history = (await pool.query(
        `SELECT h.central_name AS central, h.cabin_number AS "cabinNumber", h.cabin_code AS "msanCode",
                h.old_worker_code AS "oldCode", h.new_worker_code AS "newCode", h.effective_date::text AS date
           FROM cabinet_tech_history h ORDER BY h.effective_date DESC, h.id DESC LIMIT 60`)).rows;
      res.json({ rows, techs: await techList(), partners, history, today: cairoToday() });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/cabinet-assignments", requireAuth, requireSuperAdmin, async (req: any, res) => {
    const effectiveDate = String(req.body?.effectiveDate || cairoToday());
    const today = cairoToday();
    if (!isDate(effectiveDate) || effectiveDate > today) return res.status(400).json({ message: "تاريخ التغيير لازم يكون النهارده أو قبله" });
    const incoming: AssignRow[] = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const partnersIn: PartnerRow[] = (Array.isArray(req.body?.partners) ? req.body.partners : [])
      .map((p: any) => ({ id: p.id ?? null, techCode: clean(p.techCode), partnerCode: clean(p.partnerCode), from: clean(p.from), to: clean(p.to) || null, note: clean(p.note) || null }));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('cabinet-assignments'))`);
      const current = (await client.query(
        `SELECT id, central_name AS central, COALESCE(cabin_code, '') AS "msanCode", cabin_number AS "cabinNumber", COALESCE(btrim(worker_code), '') AS "workerCode"
           FROM cabinet_technicians`)).rows as DbAssignRow[];
      const known = new Set((await techList()).map((t) => t.code));
      const plan = planAssignments(current, incoming, known);
      const errors = [...plan.errors, ...checkPartners(partnersIn, incoming.map((r) => ({ ...r, workerCode: clean(r.workerCode) })), known)];
      if (errors.length) { await client.query("ROLLBACK"); return res.status(400).json({ message: errors.slice(0, 8).join(" · "), errors }); }

      const userId = req.user?.id ?? null;
      for (const u of plan.updates) {
        if (u.workerChanged) {
          await client.query(
            `INSERT INTO cabinet_tech_history (central_name, cabin_number, cabin_code, old_worker_code, new_worker_code, effective_date, changed_by_id)
             VALUES ($1, $2, $3, $4, $5, $6::date, $7)`,
            [u.row.central, u.row.cabinNumber, u.row.msanCode || null, u.oldWorker || null, u.row.workerCode || null, effectiveDate, userId]);
        }
        await client.query(
          `UPDATE cabinet_technicians SET central_name = $2, cabin_code = NULLIF($3, ''), cabin_number = $4, worker_code = NULLIF($5, '') WHERE id = $1`,
          [u.id, u.row.central, u.row.msanCode, u.row.cabinNumber, u.row.workerCode]);
      }
      for (const r of plan.inserts) {
        await client.query(
          `INSERT INTO cabinet_technicians (central_name, cabin_code, cabin_number, worker_code, uploaded_by_id) VALUES ($1, NULLIF($2, ''), $3, NULLIF($4, ''), $5)`,
          [r.central, r.msanCode, r.cabinNumber, r.workerCode, userId]);
      }
      if (plan.deletes.length) await client.query(`DELETE FROM cabinet_technicians WHERE id = ANY($1::int[])`, [plan.deletes]);

      // الشركاء: اللى اتشال من الجدول وكان بدأ ⇒ بيخلص يوم قبل تاريخ التغيير (التاريخ بيفضل)، واللى لسه مابدأش ⇒ يتمسح
      const oldPartners = (await client.query(`SELECT id, effective_date::text AS "from", end_date::text AS "to" FROM tech_partners`)).rows;
      const keepIds = new Set(partnersIn.filter((p) => p.id != null).map((p) => Number(p.id)));
      for (const op of oldPartners) {
        if (keepIds.has(op.id)) continue;
        if (op.from < effectiveDate) {
          if (!op.to || op.to >= effectiveDate) await client.query(`UPDATE tech_partners SET end_date = $2::date WHERE id = $1`, [op.id, dayBefore(effectiveDate)]);
        } else await client.query(`DELETE FROM tech_partners WHERE id = $1`, [op.id]);
      }
      for (const p of partnersIn) {
        if (p.id != null && oldPartners.some((o: any) => o.id === Number(p.id))) {
          await client.query(`UPDATE tech_partners SET tech_code = $2, partner_code = $3, effective_date = $4::date, end_date = $5::date, note = $6 WHERE id = $1`,
            [p.id, p.techCode, p.partnerCode, p.from, p.to, p.note]);
        } else {
          await client.query(`INSERT INTO tech_partners (tech_code, partner_code, effective_date, end_date, note, created_by_id) VALUES ($1, $2, $3::date, $4::date, $5, $6)`,
            [p.techCode, p.partnerCode, p.from, p.to, p.note, userId]);
        }
      }
      await client.query("COMMIT");
      clearPartnerCache();
      res.json({ ok: true, changed: plan.updates.filter((u) => u.workerChanged).length, updated: plan.updates.length, added: plan.inserts.length, deleted: plan.deletes.length });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ message: e.message });
    } finally { client.release(); }
  });
}
