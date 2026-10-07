// المخزن المحلى للسلك فى سنترال الغنايم (المالك ٢٠٢٦-١٠-٠٧).
//
// الدورة:
//   ١. المخزن الفرعى بيصرف للمخزن المحلى (وارد) — برقم/أرقام إذن الصرف وتاريخ. وفيه رصيد افتتاحى.
//   ٢. المخزن المحلى بيصرف للفنى (منصرف) — بأمر إفراج: رقمه وتاريخه والكمية والفنى المستلم.
//   ٣. الفنى بيسجّل اللى استخدمه فى «استكمال البيانات» (cable_entries) — وده بيتخصم من رصيده هو.
//   ٤. المخزن المحلى بيطبع بيان التركيبات/الصيانة بالكميات ويطلب بيه استعواض من الفرعى.
//
// نوعين سلك منفصلين تماماً: «تركيبات ونقل» و«صيانة» — كل رصيد محسوب لكل نوع لوحده.
// مين يسجّل الحركات: مسئول البيانات والسوبر أدمن. والفنيين بيبدأوا من صفر.
// الاستخدام بيتخصم من الفنى اللى سجّله، ولو اتسجّل من حساب مش فنى ⇒ من فنى الإغلاق،
// ولو فنى الإغلاق مش من الخمسة ⇒ لازم يتختار الفنى. الرصيد ممكن يبقى بالسالب (بيظهر بالأحمر
// وبيوصل إشعار) — الحفظ مايتمنعش عشان الشغل مايقفش.
import type { Express } from "express";
import type { Pool } from "pg";
import { ROLES } from "@shared/schema";
import { TECHNICIANS, matchTechnician } from "@shared/technicians";
import { phoneNormSql as sp } from "./phone-norm";

export type CableType = "install" | "maint";
export const CABLE_TYPE_LABEL: Record<CableType, string> = { install: "تركيبات ونقل", maint: "صيانة" };
export const MOVE_KINDS = ["opening", "receipt", "issue"] as const;
export type MoveKind = typeof MOVE_KINDS[number];
export const MOVE_KIND_LABEL: Record<MoveKind, string> = { opening: "رصيد افتتاحى", receipt: "وارد من المخزن الفرعى", issue: "صرف لفنى" };
export const STORE_TECHS = TECHNICIANS.map((t) => t.name);

/** نوع امر الشغل فى استكمال البيانات ⇒ نوع السلك. */
export const cableTypeOf = (workOrderType: string): CableType => (String(workOrderType).trim() === "صيانة" ? "maint" : "install");
/** نفس التحويل جوّه SQL. */
export const cableTypeSql = (expr: string) => `(CASE WHEN btrim(${expr}) = 'صيانة' THEN 'maint' ELSE 'install' END)`;

export const canRecordMoves = (role?: string) => role === ROLES.DATA_MANAGER || role === ROLES.SUPER_ADMIN;
// المشاهدة (المالك ٢٠٢٦-١٠-٠٧): + الأدمن والشئون الخارجية/مهندس الكوابل (external) — تقارير بس من غير تعديل
export const canViewStore = (role?: string) => canRecordMoves(role) || role === ROLES.ADMIN || role === ROLES.EXTERNAL;

const num = (v: unknown) => Math.round(Number(v || 0) * 100) / 100;
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const cairoToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/** تحقّق من حركة قبل ما تتسجّل — بيرجّع رسالة الخطأ أو null. */
export function validateMove(b: any): string | null {
  if (!MOVE_KINDS.includes(b?.kind)) return "نوع الحركة غير معروف";
  if (b.cableType !== "install" && b.cableType !== "maint") return "اختار نوع السلك (تركيبات ونقل / صيانة)";
  const q = Number(b.qty);
  if (!/^\d+(\.\d+)?$/.test(String(b.qty ?? "").trim()) || !(q > 0)) return "الكمية لازم تبقى رقم أكبر من صفر (بالمتر)";
  if (!isDate(b.moveDate)) return "التاريخ غير صالح";
  if (b.moveDate > cairoToday()) return "التاريخ فى المستقبل";
  const ref = String(b.refNo ?? "").trim();
  if (b.kind === "issue") {
    if (!STORE_TECHS.includes(b.techName)) return "اختار الفنى المستلم";
    if (!ref) return "اكتب رقم أمر الإفراج";
  }
  if (b.kind === "receipt" && !ref) return "اكتب رقم/أرقام أذونات الصرف";
  return null;
}

/* ───────────── الأرصدة ───────────── */
/** أول يوم للمخزن: أقدم حركة. الاستخدام اللى اتسجّل قبله مابيتخصمش من حد. */
export async function storeStart(pool: Pool): Promise<string | null> {
  const r = await pool.query(`SELECT min(move_date)::text AS d FROM local_store_moves WHERE deleted_at IS NULL`);
  return r.rows[0]?.d ?? null;
}

/**
 * الاستخدام اللى بيتخصم (المالك ٢٠٢٦-١٠-٠٧): فيه سلك اتسجّل قبل كده من الفنيين — ده مايتحسبش.
 * بيتحسب بس الشغل اللى تاريخه (stock_date = تاريخ إغلاق أمر الشغل، أو إغلاق العطل للصيانة)
 * يوم أول صرف للفنى ده من النوع ده **أو بعده**.
 */
const FIRST_ISSUE = `(SELECT tech_name, cable_type, min(move_date) AS first_issue FROM local_store_moves
                       WHERE deleted_at IS NULL AND kind = 'issue' GROUP BY 1, 2)`;
const USAGE_FROM = `cable_entries ce JOIN ${FIRST_ISSUE} fi
                      ON fi.tech_name = ce.stock_tech_name AND fi.cable_type = ${cableTypeSql("ce.work_order_type")}`;
const USAGE_COND = `ce.stock_date >= fi.first_issue`;

export interface TechBalance { tech: string; type: CableType; issued: number; used: number; balance: number }
export interface StoreSummary {
  startDate: string | null;
  store: Record<CableType, { opening: number; received: number; issued: number; balance: number; lastReceipt: string | null }>;
  techs: TechBalance[];
  /** شغل بعد أول صرف ومش معروف يتخصم من مين (فنى الإغلاق مش من الخمسة) — محتاج يتحدّد */
  unassigned: Record<CableType, number>;
}

export async function storeSummary(pool: Pool): Promise<StoreSummary> {
  const startDate = await storeStart(pool);
  const store: StoreSummary["store"] = {
    install: { opening: 0, received: 0, issued: 0, balance: 0, lastReceipt: null },
    maint: { opening: 0, received: 0, issued: 0, balance: 0, lastReceipt: null },
  };
  const mv = await pool.query(
    `SELECT cable_type, kind, SUM(qty)::float AS q, max(move_date)::text AS last
       FROM local_store_moves WHERE deleted_at IS NULL GROUP BY 1, 2`);
  for (const r of mv.rows) {
    const s = store[r.cable_type as CableType];
    if (!s) continue;
    if (r.kind === "opening") s.opening = num(r.q);
    else if (r.kind === "receipt") { s.received = num(r.q); s.lastReceipt = r.last; }
    else if (r.kind === "issue") s.issued = num(r.q);
  }
  for (const t of ["install", "maint"] as CableType[]) store[t].balance = num(store[t].opening + store[t].received - store[t].issued);

  const issued = await pool.query(
    `SELECT tech_name, cable_type, SUM(qty)::float AS q FROM local_store_moves
      WHERE deleted_at IS NULL AND kind = 'issue' GROUP BY 1, 2`);
  const used = await pool.query(
    `SELECT ce.stock_tech_name AS tech_name, ${cableTypeSql("ce.work_order_type")} AS cable_type,
            SUM(NULLIF(ce.cable_quantity, '')::numeric)::float AS q
       FROM ${USAGE_FROM} WHERE ${USAGE_COND} GROUP BY 1, 2`);
  const unassigned: Record<CableType, number> = { install: 0, maint: 0 };
  for (const r of (await pool.query(
    `SELECT ${cableTypeSql("ce.work_order_type")} AS cable_type, count(*)::int AS n FROM cable_entries ce
      WHERE ce.stock_tech_name IS NULL AND ce.stock_date >= (SELECT min(f.first_issue) FROM ${FIRST_ISSUE} f
                                                               WHERE f.cable_type = ${cableTypeSql("ce.work_order_type")})
      GROUP BY 1`)).rows) unassigned[r.cable_type as CableType] = r.n;
  const map = new Map<string, TechBalance>();
  const get = (tech: string, type: CableType) => {
    const k = `${tech}|${type}`;
    if (!map.has(k)) map.set(k, { tech, type, issued: 0, used: 0, balance: 0 });
    return map.get(k)!;
  };
  for (const tech of STORE_TECHS) for (const type of ["install", "maint"] as CableType[]) get(tech, type);
  for (const r of issued.rows) get(r.tech_name, r.cable_type).issued = num(r.q);
  for (const r of used.rows) get(r.tech_name, r.cable_type).used = num(r.q);
  for (const b of map.values()) b.balance = num(b.issued - b.used);
  const order = (t: string) => { const i = STORE_TECHS.indexOf(t); return i < 0 ? 99 : i; };
  const techs = [...map.values()].sort((a, b) => order(a.tech) - order(b.tech) || a.tech.localeCompare(b.tech, "ar") || a.type.localeCompare(b.type));
  return { startDate, store, techs, unassigned };
}

/** دفتر وارد ومنصرف للمخزن المحلى (نوع واحد) — برصيد قبل الفترة ورصيد جارى بعد كل حركة. */
export function buildLedger(moves: { id: number; kind: MoveKind; qty: number; moveDate: string; [k: string]: any }[], from: string, to: string) {
  const sorted = [...moves].sort((a, b) => a.moveDate.localeCompare(b.moveDate) || a.id - b.id);
  const sign = (m: { kind: MoveKind }) => (m.kind === "issue" ? -1 : 1);
  let before = 0;
  for (const m of sorted) if (m.moveDate < from) before += sign(m) * m.qty;
  let running = before, totalIn = 0, totalOut = 0;
  const rows = sorted.filter((m) => m.moveDate >= from && m.moveDate <= to).map((m) => {
    const inQ = m.kind === "issue" ? 0 : m.qty, outQ = m.kind === "issue" ? m.qty : 0;
    running += inQ - outQ; totalIn += inQ; totalOut += outQ;
    return { ...m, in: num(inQ), out: num(outQ), balance: num(running) };
  });
  return { openingBalance: num(before), rows, totalIn: num(totalIn), totalOut: num(totalOut), closingBalance: num(running) };
}

/* ───────────── مين يتخصم منه الاستخدام ───────────── */
/**
 * فنى الإغلاق للرقم: تركيب/نقل ⇒ آخر أمر شغل ناجح بنفس الرقم والنوع؛ صيانة ⇒ آخر عطل مقفول
 * على الرقم. بيرجّع الاسم المختصر لو من الخمسة، وإلا null (ومعاه الاسم الخام للرسالة).
 */
export async function closingTech(pool: Pool, phoneLocal: string, workOrderType: string): Promise<{ tech: string | null; raw: string | null }> {
  if (cableTypeOf(workOrderType) === "install") {
    const type = String(workOrderType).trim() === "نقل" ? "نقل" : "تركيب";
    const r = await pool.query(
      `SELECT COALESCE(NULLIF(btrim(o.tech_name), ''),
                       (SELECT tn.tech_name FROM technician_names tn WHERE btrim(tn.worker_code) = btrim(COALESCE(w.worker_code, ''))
                          AND btrim(COALESCE(w.worker_code, '')) <> '' ORDER BY tn.id DESC LIMIT 1),
                       w.tech_name) AS name
         FROM work_orders w
         LEFT JOIN work_order_tech_overrides o ON o.central_name = w.central_name AND o.work_order_id = w.work_order_id
        WHERE ${sp("w.phone_number")} = ${sp("$1")}
          AND (CASE WHEN trim(w.service_type) = 'نقل' THEN 'نقل' ELSE 'تركيب' END) = $2
          AND (w.close_category IS NULL OR w.close_category = 'Success')
        ORDER BY w.close_date DESC NULLS LAST LIMIT 1`, [phoneLocal, type]);
    const raw = r.rows[0]?.name ?? null;
    return { tech: matchTechnician(raw), raw };
  }
  const r = await pool.query(
    `SELECT COALESCE((SELECT mcb.tech_name FROM manual_close_by mcb WHERE mcb.complain_no = cd.complain_no LIMIT 1),
                     (SELECT tn.tech_name FROM technician_names tn WHERE tn.worker_code = cd.close_by LIMIT 1),
                     cd.close_by) AS name
       FROM complaint_details cd
      WHERE ${sp("cd.phone_number")} = ${sp("$1")} AND cd.close_time IS NOT NULL
      ORDER BY cd.close_time DESC LIMIT 1`, [phoneLocal]);
  const raw = r.rows[0]?.name ?? null;
  return { tech: matchTechnician(raw), raw };
}

/**
 * تاريخ الشغل اللى السلك اتصرف فيه: تركيب/نقل ⇒ تاريخ إغلاق آخر أمر شغل ناجح بنفس الرقم والنوع
 * (قبل وقت التسجيل)، صيانة ⇒ تاريخ إغلاق آخر عطل على الرقم. مفيش ⇒ يوم التسجيل نفسه.
 */
export async function workDate(pool: Pool, phoneLocal: string, workOrderType: string, at: Date = new Date()): Promise<string> {
  let d: string | null = null;
  if (cableTypeOf(workOrderType) === "install") {
    const type = String(workOrderType).trim() === "نقل" ? "نقل" : "تركيب";
    d = (await pool.query(
      `SELECT max((w.close_date AT TIME ZONE 'Africa/Cairo')::date)::text AS d FROM work_orders w
        WHERE ${sp("w.phone_number")} = ${sp("$1")}
          AND (CASE WHEN trim(w.service_type) = 'نقل' THEN 'نقل' ELSE 'تركيب' END) = $2
          AND (w.close_category IS NULL OR w.close_category = 'Success') AND w.close_date <= $3`,
      [phoneLocal, type, at])).rows[0]?.d ?? null;
  } else {
    d = (await pool.query(
      `SELECT max((cd.close_time AT TIME ZONE 'Africa/Cairo')::date)::text AS d FROM complaint_details cd
        WHERE ${sp("cd.phone_number")} = ${sp("$1")} AND cd.close_time IS NOT NULL AND cd.close_time <= $2`,
      [phoneLocal, at])).rows[0]?.d ?? null;
  }
  return d ?? cairoToday(at);
}

/**
 * الإدخالات اللى اتسجّلت قبل ما المخزن يتعمل (أو وهو شغّال من غير تاريخ): نحدّد لها الفنى
 * وتاريخ الشغل — والقاعدة (تاريخ الشغل ≥ أول صرف للفنى) هى اللى بتقرّر تتحسب ولا لأ.
 * مرة واحدة لكل إدخال (stock_date بيتملى حتى لو الفنى فضل مش معروف).
 */
export async function backfillStock(pool: Pool, limit = 5000): Promise<{ done: number; withTech: number }> {
  const { rows } = await pool.query(
    `SELECT ce.id, ce.phone_local, ce.work_order_type, ce.created_at, ce.stock_tech_name,
            u.role, u.username,
            (SELECT tn.tech_name FROM technician_names tn WHERE btrim(tn.worker_code) = btrim(COALESCE(u.worker_code, ''))
               AND btrim(COALESCE(u.worker_code, '')) <> '' ORDER BY tn.id DESC LIMIT 1) AS self_name
       FROM cable_entries ce LEFT JOIN users u ON u.id = ce.created_by_id
      WHERE ce.stock_date IS NULL AND ce.created_at > now() - interval '180 days'
      ORDER BY ce.id LIMIT $1`, [limit]);
  let withTech = 0;
  for (const r of rows) {
    let tech: string | null = r.stock_tech_name;
    if (!tech && r.role === ROLES.TECH) tech = matchTechnician(r.self_name) || matchTechnician(r.username);
    if (!tech) tech = (await closingTech(pool, r.phone_local, r.work_order_type)).tech;
    const d = await workDate(pool, r.phone_local, r.work_order_type, r.created_at);
    await pool.query(`UPDATE cable_entries SET stock_date = $2::date, stock_tech_name = COALESCE(stock_tech_name, $3) WHERE id = $1`, [r.id, d, tech]);
    if (tech) withTech++;
  }
  return { done: rows.length, withTech };
}

/**
 * الفنى اللى الكمية تتخصم من رصيده. الفنى بيتخصم منه هو؛ غيره ⇒ فنى الإغلاق؛ ولو مش من
 * الخمسة ⇒ اللى اتختار فى الطلب (chosen). needTech = لازم يختار قبل الحفظ.
 */
export async function resolveStockTech(pool: Pool, args: {
  role: string; selfTechName: string | null; username: string; phoneLocal: string; workOrderType: string; chosen?: string;
}): Promise<{ tech: string | null; needTech: boolean; closerRaw?: string | null }> {
  if (args.role === ROLES.TECH) {
    const me = matchTechnician(args.selfTechName) || matchTechnician(args.username);
    if (me) return { tech: me, needTech: false };
  }
  // المخزن لسه مابدأش ⇒ مانعطّلش الإدخال بسؤال مالوش لازمة
  const started = await storeStart(pool);
  const closer = await closingTech(pool, args.phoneLocal, args.workOrderType);
  if (closer.tech) return { tech: closer.tech, needTech: false };
  const chosen = args.chosen && STORE_TECHS.includes(args.chosen) ? args.chosen : null;
  if (chosen) return { tech: chosen, needTech: false };
  return { tech: null, needTech: !!started, closerRaw: closer.raw };
}

/**
 * بعد استخدام: لو رصيد الفنى من النوع ده **لسه نازل تحت الصفر** بالكمية دى ⇒ إشعار للسوبر أدمن
 * ومسئول البيانات. مرة واحدة عند العبور — مش مع كل إدخال وهو بالسالب.
 */
export async function notifyIfNegative(pool: Pool, tech: string, type: CableType, justUsed: number): Promise<number | null> {
  const s = await storeSummary(pool);
  if (!s.startDate) return null;
  const b = s.techs.find((x) => x.tech === tech && x.type === type);
  if (!b || b.balance >= 0 || b.balance + justUsed < 0) return b ? b.balance : null;
  const msg = `رصيد سلك ${CABLE_TYPE_LABEL[type]} عند الفنى ${tech} بقى بالسالب: ${b.balance} متر (مستلم ${b.issued} — مستخدم ${b.used}). محتاج أمر إفراج.`;
  const users = await pool.query(`SELECT id FROM users WHERE role IN ('super_admin', 'data_manager') AND COALESCE(suspended, false) = false`);
  for (const u of users.rows) await pool.query(`INSERT INTO notifications (user_id, type, message) VALUES ($1, 'local_store_negative', $2)`, [u.id, msg]);
  return b.balance;
}

/* ───────────── الراوتس ───────────── */
export function registerLocalStore(app: Express, deps: { pool: Pool; requireAuth: any; selfTechName: (user: any) => Promise<string | null> }): void {
  const { pool, requireAuth } = deps;
  let backfilling = false;
  const runBackfill = () => {
    if (backfilling) return;
    backfilling = true;
    backfillStock(pool)
      .then((r) => { if (r.done) console.log(`[local-store] تاريخ الشغل والفنى لـ ${r.done} إدخال (${r.withTech} بفنى)`); })
      .catch((e) => console.error("[local-store] backfill:", e?.message))
      .finally(() => { backfilling = false; });
  };
  setTimeout(runBackfill, 30_000).unref?.();
  const viewer = (req: any, res: any, next: any) => (canViewStore(req.user?.role) ? next() : res.status(403).json({ message: "المخزن المحلى: مسئول البيانات والإدارة والشئون الخارجية بس" }));
  const recorder = (req: any, res: any, next: any) => (canRecordMoves(req.user?.role) ? next() : res.status(403).json({ message: "تسجيل حركات المخزن: مسئول البيانات والسوبر أدمن بس" }));

  app.get("/api/local-store/summary", requireAuth, viewer, async (req: any, res) => {
    try { res.json({ ...(await storeSummary(pool)), techNames: STORE_TECHS, canRecord: canRecordMoves(req.user?.role) }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // رصيد الفنى نفسه — بيظهر له فى استكمال البيانات
  app.get("/api/local-store/my-balance", requireAuth, async (req: any, res) => {
    try {
      const me = matchTechnician(await deps.selfTechName(req.user)) || matchTechnician(req.user?.username);
      const s = await storeSummary(pool);
      if (!me || !s.startDate) return res.json({ tech: me, started: !!s.startDate, balances: [] });
      res.json({ tech: me, started: true, balances: s.techs.filter((b) => b.tech === me) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/local-store/moves", requireAuth, viewer, async (req, res) => {
    try {
      const { type = "install", from = "1900-01-01", to = "2999-12-31" } = req.query as Record<string, string>;
      const { rows } = await pool.query(
        `SELECT id, kind, cable_type AS "cableType", qty::float AS qty, move_date::text AS "moveDate", ref_no AS "refNo",
                tech_name AS "techName", note, created_by_name AS "createdByName", created_at AS "createdAt"
           FROM local_store_moves WHERE deleted_at IS NULL AND cable_type = $1 ORDER BY move_date, id`, [type]);
      res.json(buildLedger(rows, isDate(from) ? from : "1900-01-01", isDate(to) ? to : "2999-12-31"));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/local-store/moves", requireAuth, recorder, async (req: any, res) => {
    const b = { ...req.body, moveDate: req.body?.moveDate || cairoToday() };
    const err = validateMove(b);
    if (err) return res.status(400).json({ message: err });
    try {
      // الصرف لفنى مايتعدّاش رصيد المخزن (ده رصيد فعلى على الرف، مش زى استخدام الفنى)
      if (b.kind === "issue") {
        const s = await storeSummary(pool);
        const avail = s.store[b.cableType as CableType].balance;
        if (Number(b.qty) > avail) return res.status(400).json({ message: `رصيد المخزن المحلى من سلك ${CABLE_TYPE_LABEL[b.cableType as CableType]} ${avail} متر بس` });
      }
      const { rows } = await pool.query(
        `INSERT INTO local_store_moves (kind, cable_type, qty, move_date, ref_no, tech_name, note, created_by_id, created_by_name)
         VALUES ($1, $2, $3::numeric, $4::date, $5, $6, $7, $8, $9) RETURNING id`,
        [b.kind, b.cableType, String(b.qty).trim(), b.moveDate, String(b.refNo ?? "").trim() || null,
         b.kind === "issue" ? b.techName : null, String(b.note ?? "").trim() || null, req.user.id, req.user.username]);
      if (b.kind === "issue") runBackfill();
      res.json({ ok: true, id: rows[0].id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // شغل مالوش فنى معروف ⇒ مسئول البيانات بيحدّد يتخصم من مين
  app.post("/api/local-store/entries/:id/tech", requireAuth, recorder, async (req: any, res) => {
    const id = Number(req.params.id);
    const tech = String(req.body?.tech ?? "");
    if (!Number.isInteger(id) || !STORE_TECHS.includes(tech)) return res.status(400).json({ message: "اختار الفنى" });
    await pool.query(`UPDATE cable_entries SET stock_tech_name = $2 WHERE id = $1 AND stock_tech_name IS NULL`, [id, tech]);
    res.json({ ok: true });
  });

  // إلغاء حركة اتسجّلت غلط — بتفضل فى القاعدة (مين ألغاها وإمتى) بس مابتدخلش فى أى رصيد
  app.delete("/api/local-store/moves/:id", requireAuth, recorder, async (req: any, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ message: "معرّف غير صالح" });
    await pool.query(`UPDATE local_store_moves SET deleted_at = now(), deleted_by_name = $2 WHERE id = $1 AND deleted_at IS NULL`, [id, req.user.username]);
    res.json({ ok: true });
  });

  // بيان الاستخدام: كل تركيب/صيانة بكمية السلك — للاستعواض من المخزن الفرعى ولتفاصيل الفنى
  app.get("/api/local-store/usage", requireAuth, viewer, async (req, res) => {
    try {
      const { type = "install", from = "", to = "", tech = "" } = req.query as Record<string, string>;
      const params: any[] = [type];
      const dateConds: string[] = [];
      if (isDate(from)) { params.push(from); dateConds.push(`ce.stock_date >= $${params.length}::date`); }
      if (isDate(to)) { params.push(to); dateConds.push(`ce.stock_date <= $${params.length}::date`); }
      let sql: string;
      if (tech === "__none__") {
        // بعد أول صرف (لأى فنى من النوع ده) ومش معروف يتخصم من مين
        sql = `SELECT ce.id, ce.phone_full AS "phone", ce.work_order_type AS "workOrderType",
                      NULLIF(ce.cable_quantity, '')::float AS qty, NULL AS "tech", ce.stock_date::text AS "date", ce.created_by_name AS "enteredBy"
                 FROM cable_entries ce
                WHERE ce.stock_tech_name IS NULL AND ${cableTypeSql("ce.work_order_type")} = $1
                  AND ce.stock_date >= (SELECT min(f.first_issue) FROM ${FIRST_ISSUE} f WHERE f.cable_type = $1)
                  ${dateConds.map((c) => "AND " + c).join(" ")}
                ORDER BY ce.stock_date, ce.id`;
      } else {
        if (tech) { params.push(tech); dateConds.push(`ce.stock_tech_name = $${params.length}`); }
        sql = `SELECT ce.id, ce.phone_full AS "phone", ce.work_order_type AS "workOrderType",
                      NULLIF(ce.cable_quantity, '')::float AS qty, ce.stock_tech_name AS "tech", ce.stock_date::text AS "date", ce.created_by_name AS "enteredBy"
                 FROM ${USAGE_FROM}
                WHERE ${USAGE_COND} AND fi.cable_type = $1 ${dateConds.map((c) => "AND " + c).join(" ")}
                ORDER BY ce.stock_date, ce.id`;
      }
      const { rows } = await pool.query(sql, params);
      res.json({ rows, total: num(rows.reduce((s: number, r: any) => s + (Number(r.qty) || 0), 0)) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}

