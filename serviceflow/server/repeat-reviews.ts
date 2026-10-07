// ============================================================================
// server/repeat-reviews.ts — «رد التكرار» (قرار المالك ٢٠٢٦-١٠-٠٤)
//
// رد واحد لكل خط مكرر فى كل شهر (لو اتكرر فى شهر تانى = رد تانى). الخطوات بالترتيب،
// وكل خطوة بتتحفظ لوحدها (الفحص بيحصل فى الشارع فلازم يقدر يوقف ويكمّل):
//   ١. بيان الخط: «البيان صح» أو «تصحيح البيان» (نفس «تصحيح بيانات» اللى بيوصل لمسئول
//      البيانات) — الأول عشان البيان الغلط معناه فحص لبكس غلط.
//   ٢. فحص البكس (موقع الصيانة): لازم يكون فيه فحص **تاريخه من أول شكوى فى سلسلة التكرار أو
//      بعدها** (الشكوى السابقة، حتى لو فى الشهر اللى فات)، وإلا «إعادة فحص». تغيير البكس فى خطوة ١ بيلغى الفحص المربوط.
//   ٣. إفادة العميل + إفادة الفنى (كتابة).
//   ٤. التقييم: سبب العطل (كتابة) + يوجد مقصّر؟ + اسمه (الخمس فنيين / فنيين الصيانة / اللحامين).
//      ممكن أكتر من مقصّر (٢٠٢٦-١٠-٠٧) — at_faults، والسوبر أدمن بيضيف/يحذف من «ردود التكرار».
// بيرد: السوبر أدمن والأدمن (مدير السنترال) والشئون الخارجية ومهندس الكوابل. الفنى بيشوف
// الرد قراية بس على خطوطه. التقرير المجمّع للسوبر أدمن بس.
// ============================================================================
import type { Express } from "express";
import type { Pool } from "pg";
import { ROLES } from "@shared/schema";
import { TECHNICIANS } from "@shared/technicians";
import { ensureMaintBox, latestBoxInspection } from "./box-full-inspection";
import { phoneNormSql as sp } from "./phone-norm";
import { type AtFault, atFaultColumns, atFaultNamesFrom, faultTechNames } from "./repeat-at-fault";

export const REPEAT_REVIEW_WRITERS: string[] = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EXTERNAL];
const TEXT_MAX = 2000;

export interface RepeatReviewDeps {
  pool: Pool;
  requireAuth: (req: any, res: any, next: any) => void;
  requireSuperAdmin: (req: any, res: any, next: any) => void;
  lookupPhoneLine: (reqUser: any, phone: string) => Promise<{ line: any; codes: any }>;
  techMsanCodes: (user: any) => Promise<string[] | null>;
  msanInCodesSql: (col: string, p: string) => string;
}

// أسماء بنود فحص البكس — نفس CHECKLIST فى موقع الصيانة (routes/boxes.js)؛ الاختبار بيثبّت التطابق
export const INSPECTION_LABELS: Record<string, string> = {
  connector_fix: "تثبيت الخوصة", box_fix: "تثبيت البوكس", box_cover: "غطاء البوكس",
  box_numbering: "ترقيم البوكس", box_height: "ارتفاع البوكس", branch_path: "الفرعات على الترمنال",
  wire_path: "مسار السلك", electricity_conflict: "تعارض كهرباء", air_conflict: "تعارض هواء",
  overlap: "تخاطي", data_review: "مراجعة بيانات البكس",
};

const shortOf = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^88/, "");
const isMonth = (v: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v ?? ""));
const byName = (req: any) => String(req.user?.fullName || req.user?.username || "").trim() || null;
const canWrite = (req: any) => REPEAT_REVIEW_WRITERS.includes(String(req.user?.role || ""));
const clean = (v: unknown) => String(v ?? "").trim().slice(0, TEXT_MAX);


// الخطوة اللى عليها الرد (للشارة فى الجدول): 0 لسه — 1 البيان — 2 الفحص — 3 الإفادات — 4 التقييم
export const reviewStep = (r: any): number =>
  !r ? 0 : !r.line_status ? 0 : !r.inspection_id ? 1 : !(r.customer_statement && r.tech_statement) ? 2 : !r.cause ? 3 : 4;

// شكاوى الخط من نفس مصدر تقرير «الأعطال المكررة خلال شهر من تاريخه» (التفاصيل المغلقة +
// المتبقى 138/135، غنايم) بتوقيت الشيت. شهر الرد = شهر آخر شكوى فيها، مش شهر أى شكوى تانية.
export const reportComplaintsSql = (phoneExpr: string) => `
  SELECT (cd.complain_time AT TIME ZONE 'UTC') AS d FROM complaint_details cd
   WHERE cd.close_time IS NOT NULL AND cd.exchange_name ILIKE '%غنايم%' AND cd.complain_time IS NOT NULL
     AND ${sp("cd.phone_number")} = ${sp(phoneExpr)}
  UNION ALL
  SELECT (rc.complain_time AT TIME ZONE 'UTC') FROM remaining_complaints rc
   WHERE rc.status_code IN ('138', '135') AND rc.exchange_name ILIKE '%غنايم%' AND rc.complain_time IS NOT NULL
     AND ${sp("rc.phone_number")} = ${sp(phoneExpr)}`;

// تصحيح ردود اتسجّلت على شهر مافيهوش ولا شكوى للخط فى مصدر التقرير (الإصدار القديم كان بيفتح
// الرد من أى صف شكوى فى «إحصائيات التكرار»، فممكن ياخد شهر شكوى تانية — خط آخر شكوى ليه فى 9
// اتسجّل رده على 10). بيتنقل لشهر آخر شكوى قبل ما الرد يتعمل، ولو الشهر ده عليه رد تانى بيتساب.
export const FIX_REVIEW_MONTHS_SQL = `
  UPDATE repeat_reviews r SET month = f.m, updated_at = now()
    FROM (
      SELECT r2.id,
             (SELECT to_char(max(c.d), 'YYYY-MM') FROM (${reportComplaintsSql("r2.phone_short")}) c
               WHERE c.d <= (r2.created_at AT TIME ZONE 'Africa/Cairo')) AS m
        FROM repeat_reviews r2
       WHERE NOT EXISTS (SELECT 1 FROM (${reportComplaintsSql("r2.phone_short")}) c
                          WHERE to_char(c.d, 'YYYY-MM') = r2.month)
    ) f
   WHERE r.id = f.id AND f.m IS NOT NULL AND f.m <> r.month
     AND NOT EXISTS (SELECT 1 FROM repeat_reviews x WHERE x.phone_short = r.phone_short AND x.month = f.m)
  RETURNING r.id, r.phone_short, f.m`;

export function registerRepeatReviews(app: Express, d: RepeatReviewDeps) {
  const { pool, requireAuth, requireSuperAdmin } = d;

  // مرة عند التشغيل — مابيلمسش غير الردود اللى شهرها غلط أكيد (مافيهوش ولا شكوى للخط)
  void pool.query(FIX_REVIEW_MONTHS_SQL)
    .then((r) => { if (r.rowCount) console.log(`[repeat-reviews] اتصحّح شهر ${r.rowCount} رد`, r.rows); })
    .catch((e) => console.error("[repeat-reviews] تصحيح الشهور:", e.message));

  const monthHasComplaint = async (short: string, month: string) =>
    (await pool.query(`SELECT 1 FROM (${reportComplaintsSql("$1")}) c WHERE to_char(c.d, 'YYYY-MM') = $2 LIMIT 1`,
      [short, month])).rowCount! > 0;

  // أول شكوى فى سلسلة التكرار — زى تقرير «الأعطال المكررة خلال شهر من تاريخه»: آخر شكوى
  // للخط فى الشهر، وأول شكوى فى الشهر اللى قبلها لحدها (الشكوى السابقة ممكن تكون فى الشهر
  // اللى فات: 09-04 ← 10-02). الفحص لازم يكون من يومها أو بعده. توقيت الشيت = UTC.
  const firstComplaintDate = async (short: string, month: string): Promise<string | null> => {
    const { rows } = await pool.query(
      `WITH c AS (
         SELECT (complain_time AT TIME ZONE 'UTC') AS d FROM complaint_details
          WHERE ${sp("phone_number")} = ${sp("$1")}
         UNION ALL
         SELECT (complain_time AT TIME ZONE 'UTC') FROM remaining_complaints
          WHERE ${sp("phone_number")} = ${sp("$1")}
         UNION ALL
         SELECT (complaint_time AT TIME ZONE 'UTC') FROM ticket_dsl_current
          WHERE ${sp("phone_number")} = ${sp("$1")}
       ), last AS (
         SELECT max(d) AS d FROM c WHERE d IS NOT NULL AND to_char(d, 'YYYY-MM') = $2
       )
       SELECT to_char(min(c.d), 'YYYY-MM-DD') AS d
         FROM c, last
        WHERE c.d IS NOT NULL AND c.d >= last.d - interval '1 month' AND c.d <= last.d`,
      [short, month]);
    return rows[0]?.d ?? null;
  };

  const getReview = async (short: string, month: string) =>
    (await pool.query(`SELECT * FROM repeat_reviews WHERE phone_short = $1 AND month = $2`, [short, month])).rows[0] || null;

  const ensureReview = async (short: string, month: string, by: string | null) => {
    await pool.query(
      `INSERT INTO repeat_reviews (phone_short, month, created_by, updated_by) VALUES ($1, $2, $3, $3)
       ON CONFLICT (phone_short, month) DO NOTHING`, [short, month, by]);
    return getReview(short, month);
  };

  // الفنى: يشوف الرد على خطوطه بس (نفس قاعدة «بحث برقم التليفون»)
  const techCanRead = async (req: any, short: string) => {
    const { line } = await d.lookupPhoneLine(req.user, short);
    return !!line?.ownedByMe;
  };

  const boxOf = (review: any, line: any) => review?.line_status
    ? { central: review.line_central || "", cabinet: review.line_cabin || "", box: review.line_box || "" }
    : { central: line?.central || "", cabinet: line?.cabinNumber || "", box: line?.boxNumber || "" };

  // ── قايمة حالة الردود للجدول: keys = «رقم|شهر» مفصولة بفاصلة ──────────────────
  app.get("/api/repeat-reviews", requireAuth, async (req: any, res) => {
    try {
      const role = req.user?.role;
      if (!canWrite(req) && role !== ROLES.TECH) return res.status(403).json({ message: "غير مسموح" });
      const keys = String(req.query.keys || "").split(",").slice(0, 1000)
        .map((k) => { const [p, m] = k.split("|"); return { p: shortOf(p), m: String(m || "") }; })
        .filter((k) => k.p.length >= 5 && isMonth(k.m));
      if (!keys.length) return res.json({ data: [] });
      const params: any[] = [keys.map((k) => k.p), keys.map((k) => k.m)];
      let techWhere = "";
      if (role === ROLES.TECH) {
        params.push((await d.techMsanCodes(req.user)) || []);
        techWhere = ` AND EXISTS (
          SELECT 1 FROM phone_ports pp
           WHERE ${sp("pp.phone_number")} = ${sp("r.phone_short")}
             AND ${d.msanInCodesSql("pp.msan_code", `$${params.length}`)})`;
      }
      const { rows } = await pool.query(
        `SELECT r.* FROM repeat_reviews r
           JOIN unnest($1::text[], $2::text[]) AS k(p, m) ON k.p = r.phone_short AND k.m = r.month
          WHERE true${techWhere}`, params);
      res.json({ data: rows.map((r: any) => ({
        phoneShort: r.phone_short, month: r.month, status: r.status, step: reviewStep(r),
      })) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── رد واحد بكل سياقه (بيان الخط + أول شكوى + فحص البكس) ─────────────────────
  app.get("/api/repeat-reviews/one", requireAuth, async (req: any, res) => {
    try {
      const short = shortOf(req.query.phone);
      const month = String(req.query.month || "");
      if (short.length < 5 || !isMonth(month)) return res.status(400).json({ message: "الرقم أو الشهر غير صالح" });
      const writer = canWrite(req);
      if (!writer) {
        if (req.user?.role !== ROLES.TECH || !(await techCanRead(req, short))) {
          return res.status(403).json({ message: "غير مسموح" });
        }
      }
      const review = await getReview(short, month);
      const { line } = await d.lookupPhoneLine(req.user, short);
      const first = await firstComplaintDate(short, month);
      const b = boxOf(review, line);
      const box = await latestBoxInspection(b.central, b.cabinet, b.box);
      const insp = box.inspection;
      res.json({
        canEdit: writer,
        review,
        step: reviewStep(review),
        firstComplaintDate: first,
        line: line ? {
          central: line.central ?? null, cabinNumber: line.cabinNumber ?? null, boxNumber: line.boxNumber ?? null,
          dpTerminal: line.dpTerminal ?? null, techName: line.techName ?? null, subName: line.subName ?? null,
          subAdd: line.subAdd ?? null, mobile: line.mobile ?? null,
        } : null,
        box: { ...b, boxId: box.boxId },
        inspection: insp ? {
          ...insp,
          valid: !!first && insp.date >= first,
          viewUrl: `/maintenance/inspector/${insp.id}`,
        } : null,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── أسماء «المقصّر»: الخمس فنيين + فنيين الصيانة + اللحامين (برنامج الكوابل) ──
  const atFaultOptions = async () => {
    const techs = TECHNICIANS.map((t) => t.fullName);
    const maint = new Set<string>();
    try {
      const { rows } = await pool.query(
        `SELECT btrim(COALESCE(NULLIF(full_name, ''), username)) AS n FROM users
          WHERE role = $1 AND NOT COALESCE(suspended, false)`, [ROLES.MAINTENANCE_TECH]);
      rows.forEach((r: any) => r.n && maint.add(r.n));
    } catch { /* إضافى */ }
    try {
      const { rows } = await pool.query(
        `SELECT btrim(COALESCE(NULLIF(full_name, ''), username)) AS n FROM maintenance.users
          WHERE role = 'technician' AND COALESCE(is_active, 1) = 1`);
      rows.forEach((r: any) => r.n && maint.add(r.n));
    } catch { /* موقع الصيانة مش مركّب */ }
    const splice = new Set<string>();
    try {
      const { rows } = await pool.query(
        `SELECT btrim(name) AS n FROM cfm_users WHERE role = 'splice_tech' AND NOT COALESCE(suspended, false)`);
      rows.forEach((r: any) => r.n && splice.add(r.n));
    } catch { /* إضافى */ }
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "ar"));
    return { techs, maintenance: sort(maint), splice: sort(splice) };
  };
  /** كل اسم لازم يكون من القايمة — بيرجّع القايمة بأنواعها أو رسالة الخطأ. */
  const resolveAtFaults = async (names: string[]): Promise<{ list: AtFault[] } | { error: string }> => {
    const opts = await atFaultOptions();
    const list: AtFault[] = [];
    for (const name of names) {
      const kind = opts.techs.includes(name) ? "tech"
        : opts.maintenance.includes(name) ? "maintenance"
        : opts.splice.includes(name) ? "splice" : null;
      if (!kind) return { error: `«${name}» مش فى قايمة المقصّرين — اختار من القايمة` };
      list.push({ name, kind });
    }
    return { list };
  };
  app.get("/api/repeat-reviews/at-fault-options", requireAuth, async (req: any, res) => {
    if (!canWrite(req)) return res.status(403).json({ message: "غير مسموح" });
    try { res.json(await atFaultOptions()); } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── رابط فحص البكس فى موقع الصيانة (فحص جديد / إعادة فحص) ─────────────────────
  app.post("/api/repeat-reviews/box-link", requireAuth, async (req: any, res) => {
    try {
      if (!canWrite(req)) return res.status(403).json({ message: "غير مسموح" });
      const short = shortOf(req.body?.phone);
      const month = String(req.body?.month || "");
      if (short.length < 5 || !isMonth(month)) return res.status(400).json({ message: "الرقم أو الشهر غير صالح" });
      const review = await getReview(short, month);
      if (!review?.line_status) return res.status(400).json({ message: "أكّد بيان الخط الأول" });
      const r = await ensureMaintBox(review.line_central || "", review.line_cabin || "", review.line_box || "");
      if (!r.ok) return res.status(502).json({ message: r.reason });
      res.json({ createUrl: `/maintenance/inspector/create/${r.boxId}` });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── حفظ خطوة ──────────────────────────────────────────────────────────────────
  app.post("/api/repeat-reviews/step", requireAuth, async (req: any, res) => {
    try {
      if (!canWrite(req)) return res.status(403).json({ message: "غير مسموح" });
      const short = shortOf(req.body?.phone);
      const month = String(req.body?.month || "");
      const step = String(req.body?.step || "");
      if (short.length < 5 || !isMonth(month)) return res.status(400).json({ message: "الرقم أو الشهر غير صالح" });
      const by = byName(req);
      // رد جديد لازم يبقى على شهر فيه شكوى للخط (شهر آخر شكوى فى التقرير) — وإلا الخطاب يطلع بشهر غلط
      if (!(await getReview(short, month)) && !(await monthHasComplaint(short, month))) {
        return res.status(400).json({ message: `الخط ${short} مالوش شكوى فى شهر ${month} — افتح الرد من تقرير «الأعطال المكررة خلال شهر من تاريخه»` });
      }
      let r = await ensureReview(short, month, by);

      if (step === "line") {
        const status = String(req.body?.status || "");
        if (status !== "confirmed" && status !== "corrected") return res.status(400).json({ message: "حالة البيان غير صالحة" });
        const { line } = await d.lookupPhoneLine(req.user, short);
        const central = String(line?.central || "").trim();
        const cabin = String(line?.cabinNumber || "").trim();
        const box = String(line?.boxNumber || "").trim();
        if (!central || !cabin || !box) {
          return res.status(400).json({ message: "بيان الخط ناقص (سنترال/كابينة/بكس) — صحّحه الأول" });
        }
        let correctionId: number | null = null;
        // البيان قبل التصحيح (اللى كان ظاهر فى الشاشة) — للخطاب بس؛ التصحيح نفسه اتطبّق خلاص
        const before = status === "corrected" && req.body?.before && typeof req.body.before === "object"
          ? ["central", "cabinNumber", "boxNumber", "dpTerminal"].map((k) => clean(req.body.before[k]).slice(0, 60) || null)
          : [null, null, null, null];
        if (status === "corrected") {
          const { rows } = await pool.query(
            `SELECT id FROM line_data_corrections
              WHERE phone_full = $1 AND created_at >= now() - interval '1 day'
              ORDER BY created_at DESC, id DESC LIMIT 1`, ["88" + short]);
          if (!rows[0]) return res.status(400).json({ message: "مفيش تصحيح بيان اتبعت للخط ده" });
          correctionId = Number(rows[0].id);
        }
        // البكس اتغيّر → الفحص المربوط كان لبكس تانى: يتشال، والرد يرجع «جارى»
        const boxChanged = !!r.line_status && (r.line_central !== central || r.line_cabin !== cabin || r.line_box !== box);
        await pool.query(
          `UPDATE repeat_reviews SET line_status = $3, line_central = $4, line_cabin = $5, line_box = $6,
                  line_terminal = $7, line_correction_id = $8, line_checked_by = $9, line_checked_at = now(),
                  ${boxChanged ? `inspection_id = NULL, inspection_date = NULL, inspection_by = NULL,
                  inspection_bad_items = NULL, inspection_linked_by = NULL, inspection_linked_at = NULL, status = 'draft',` : ""}
                  line_before_central = $10, line_before_cabin = $11, line_before_box = $12, line_before_terminal = $13,
                  updated_by = $9, updated_at = now()
            WHERE phone_short = $1 AND month = $2`,
          [short, month, status, central, cabin, box, String(line?.dpTerminal || "").trim() || null, correctionId, by, ...before]);
      } else if (step === "inspection") {
        if (!r.line_status) return res.status(400).json({ message: "أكّد بيان الخط الأول" });
        const first = await firstComplaintDate(short, month);
        const info = await latestBoxInspection(r.line_central || "", r.line_cabin || "", r.line_box || "");
        const insp = info.inspection;
        if (!insp) return res.status(400).json({ message: "البكس مش مفحوص — افحصه الأول من موقع الصيانة" });
        if (!first || insp.date < first) {
          return res.status(400).json({ message: `آخر فحص (${insp.date}) قبل أول شكوى فى التكرار (${first ?? "—"}) — اعمل إعادة فحص` });
        }
        await pool.query(
          `UPDATE repeat_reviews SET inspection_id = $3, inspection_date = $4, inspection_by = $5,
                  inspection_bad_items = $6, inspection_linked_by = $7, inspection_linked_at = now(),
                  updated_by = $7, updated_at = now()
            WHERE phone_short = $1 AND month = $2`,
          [short, month, insp.id, insp.date, insp.by, insp.badItems, by]);
      } else if (step === "statements") {
        if (!r.inspection_id) return res.status(400).json({ message: "اربط فحص البكس الأول" });
        const customer = clean(req.body?.customer);
        const tech = clean(req.body?.tech);
        if (!customer || !tech) return res.status(400).json({ message: "إفادة العميل وإفادة الفنى مطلوبين" });
        await pool.query(
          `UPDATE repeat_reviews SET customer_statement = $3, tech_statement = $4, statements_by = $5,
                  statements_at = now(), updated_by = $5, updated_at = now()
            WHERE phone_short = $1 AND month = $2`, [short, month, customer, tech, by]);
      } else if (step === "assessment") {
        if (!(r.customer_statement && r.tech_statement)) return res.status(400).json({ message: "اكتب الإفادات الأول" });
        const cause = clean(req.body?.cause);
        const hasFault = req.body?.hasFault === true;
        if (!cause) return res.status(400).json({ message: "سبب العطل مطلوب" });
        if (req.body?.hasFault !== true && req.body?.hasFault !== false) {
          return res.status(400).json({ message: "حدّد يوجد مقصّر ولا لأ" });
        }
        let list: AtFault[] = [];
        if (hasFault) {
          const names = atFaultNamesFrom(req.body);
          if (!names.length) return res.status(400).json({ message: "اختار اسم المقصّر من القايمة" });
          const r2 = await resolveAtFaults(names);
          if ("error" in r2) return res.status(400).json({ message: r2.error });
          list = r2.list;
        }
        const cols = atFaultColumns(list);
        await pool.query(
          `UPDATE repeat_reviews SET cause = $3, has_fault = $4, at_fault_name = $5, at_fault_kind = $6, at_faults = $8::jsonb,
                  assessed_by = $7, assessed_at = now(), updated_by = $7, updated_at = now()
            WHERE phone_short = $1 AND month = $2`,
          [short, month, cause, hasFault, cols.name, cols.kind, by, list.length ? JSON.stringify(list) : null]);
      } else if (step === "complete") {
        if (reviewStep(r) < 4) return res.status(400).json({ message: "كمّل كل الخطوات الأول" });
        await pool.query(
          `UPDATE repeat_reviews SET status = 'done', completed_by = $3, completed_at = now(),
                  updated_by = $3, updated_at = now()
            WHERE phone_short = $1 AND month = $2`, [short, month, by]);
      } else {
        return res.status(400).json({ message: "خطوة غير معروفة" });
      }
      r = await getReview(short, month);
      res.json({ ok: true, review: r, step: reviewStep(r) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── بيانات خطاب «ردود التكرار» (السوبر أدمن): بنود الفحص اللى محتاجة شغل بأسمائها
  // وملاحظاتها، وملاحظات الفحص العامة، والتصحيح (الجديد + القديم). ids = أرقام الردود.
  app.get("/api/repeat-reviews/letter", requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
      const ids = String(req.query.ids || "").split(",").map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0).slice(0, 500);
      if (!ids.length) return res.json({ data: [] });
      const { rows } = await pool.query(
        `SELECT r.*, c.central AS corr_central, c.cabin_number AS corr_cabin, c.box_number AS corr_box,
                c.dp_terminal AS corr_terminal, c.submitted_by_name AS corr_by,
                (c.created_at AT TIME ZONE 'Africa/Cairo') AS corr_at
           FROM repeat_reviews r
           LEFT JOIN line_data_corrections c ON c.id = r.line_correction_id
          WHERE r.id = ANY($1::int[])
          ORDER BY r.month, r.line_central, r.line_cabin, r.line_box, r.phone_short`, [ids]);
      const inspIds = rows.map((r: any) => r.inspection_id).filter(Boolean);
      const items = new Map<number, any[]>();
      const general = new Map<number, string>();
      if (inspIds.length) {
        try {
          const { rows: it } = await pool.query(
            `SELECT inspection_id, item_key, value, notes, extra_type, extra_distance
               FROM maintenance.inspection_items
              WHERE inspection_id = ANY($1::int[]) AND value IN ('bad', 'yes')
              ORDER BY inspection_id, id`, [inspIds]);
          for (const x of it) {
            const list = items.get(x.inspection_id) || [];
            list.push({ key: x.item_key, label: INSPECTION_LABELS[x.item_key] || x.item_key,
                        notes: x.notes || "", extraType: x.extra_type || "", extraDistance: x.extra_distance });
            items.set(x.inspection_id, list);
          }
          const { rows: g } = await pool.query(
            `SELECT id, general_notes FROM maintenance.inspections WHERE id = ANY($1::int[])`, [inspIds]);
          for (const x of g) if (String(x.general_notes || "").trim()) general.set(x.id, String(x.general_notes).trim());
        } catch { /* موقع الصيانة مش مركّب */ }
      }
      res.json({ data: rows.map((r: any) => ({
        ...r,
        inspection_items: r.inspection_id ? (items.get(r.inspection_id) || []) : [],
        inspection_general_notes: r.inspection_id ? (general.get(r.inspection_id) || "") : "",
      })) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── تعليق السوبر أدمن على رد (٢٠٢٦-١٠-٠٦) ─────────────────────────────────────
  // بيوصل إشعار (جرس + نافذة عند الدخول) للى يخصّهم الرد بس:
  //   · الشئون الخارجية ومهندس الكوابل: users.role = 'external'
  //   · مدير السنترال: users.role = 'admin' وحسابه فى الكوابل external_affairs (الأدمن العادى لأ)
  //   · الفنى: فنى كابينة الخط (cabinet_technicians) + الفنى المقصّر لو اتحدد بالاسم
  // باقى المستخدمين مابيتعملهمش صف إشعار أصلاً، فمابيشوفوهوش فى الجرس.
  // ── السوبر أدمن بيضيف/يحذف مقصّر وهو بيعلّق على تقرير الشئون الخارجية (٢٠٢٦-١٠-٠٧) ──
  // القايمة كلها بتتبعت (مش إضافة واحد): فاضية = «لا يوجد مقصّر». بيتسجّل مين عدّل وإمتى.
  app.put("/api/repeat-reviews/:id/at-fault", requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id, 10) || 0;
      const rv = (await pool.query(`SELECT id, cause FROM repeat_reviews WHERE id = $1`, [id])).rows[0];
      if (!rv) return res.status(404).json({ message: "الرد مش موجود" });
      if (!rv.cause) return res.status(400).json({ message: "الرد لسه ماوصلش لخطوة التقييم" });
      const r2 = await resolveAtFaults(atFaultNamesFrom(req.body));
      if ("error" in r2) return res.status(400).json({ message: r2.error });
      const cols = atFaultColumns(r2.list);
      const by = byName(req);
      await pool.query(
        `UPDATE repeat_reviews SET has_fault = $2, at_fault_name = $3, at_fault_kind = $4, at_faults = $5::jsonb,
                at_fault_edited_by = $6, at_fault_edited_at = now(), updated_by = $6, updated_at = now()
          WHERE id = $1`,
        [id, r2.list.length > 0, cols.name, cols.kind, r2.list.length ? JSON.stringify(r2.list) : null, by]);
      res.json({ ok: true, review: (await pool.query(`SELECT * FROM repeat_reviews WHERE id = $1`, [id])).rows[0] });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/repeat-reviews/:id/comments", requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, body, created_by, notified_count, (created_at AT TIME ZONE 'Africa/Cairo') AS created_local
           FROM repeat_review_comments WHERE review_id = $1 ORDER BY created_at DESC`, [parseInt(req.params.id, 10) || 0]);
      res.json({ data: rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/repeat-reviews/:id/comments", requireAuth, requireSuperAdmin, async (req: any, res) => {
    const id = parseInt(req.params.id, 10) || 0;
    const body = String((req.body || {}).body || "").trim().slice(0, 1000);
    if (!body) return res.status(400).json({ message: "اكتب التعليق" });
    const by = String(req.user?.fullName || req.user?.username || "").trim() || null;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const rv = (await client.query(`SELECT * FROM repeat_reviews WHERE id = $1`, [id])).rows[0];
      if (!rv) { await client.query("ROLLBACK"); return res.status(404).json({ message: "الرد مش موجود" }); }
      const { rows: targets } = await client.query(
        `SELECT DISTINCT u.id FROM users u
           LEFT JOIN cfm_users c ON c.id::text = u.cfm_user_id::text
          WHERE COALESCE(u.suspended, false) = false AND (
                u.role = 'external'
             OR (u.role = 'admin' AND c.role = 'external_affairs')
             OR (u.role = 'tech' AND u.worker_code IS NOT NULL AND (
                  u.worker_code IN (SELECT ct.worker_code FROM cabinet_technicians ct
                                     WHERE ct.central_name = $1 AND ct.cabin_number = $2)
               OR u.worker_code IN (SELECT tn.worker_code FROM technician_names tn
                                     WHERE tn.tech_name = ANY($3::text[])))))`,
        // كل الفنيين المقصّرين (ممكن أكتر من واحد — at_faults)، والردود القديمة من at_fault_name
        [rv.line_central, rv.line_cabin, faultTechNames(rv)]);
      const message = `💬 تعليق الإدارة على رد تكرار الخط ${rv.phone_short} (شهر ${rv.month}): ${body}`;
      for (const t of targets) {
        await client.query(`INSERT INTO notifications (user_id, type, message) VALUES ($1, 'repeat_comment', $2)`, [t.id, message]);
      }
      await client.query(
        `INSERT INTO repeat_review_comments (review_id, body, created_by, created_by_id, notified_count)
         VALUES ($1, $2, $3, $4, $5)`, [id, body, by, req.user?.id ?? null, targets.length]);
      await client.query("COMMIT");
      res.json({ ok: true, notified: targets.length });
    } catch (e: any) {
      await client.query("ROLLBACK").catch(() => {});
      res.status(500).json({ message: e.message });
    } finally { client.release(); }
  });

  // ── تقرير «ردود التكرار» — للسوبر أدمن (PDF/Excel من الشاشة) ─────────────────
  app.get("/api/repeat-reviews/report", requireAuth, requireSuperAdmin, async (req: any, res) => {
    try {
      const from = String(req.query.from || "");
      const to = String(req.query.to || "");
      const params: any[] = [];
      const conds: string[] = [];
      if (isMonth(from)) { params.push(from); conds.push(`r.month >= $${params.length}`); }
      if (isMonth(to)) { params.push(to); conds.push(`r.month <= $${params.length}`); }
      const { rows } = await pool.query(
        `SELECT r.*, (r.completed_at AT TIME ZONE 'Africa/Cairo') AS completed_local,
                (SELECT COUNT(*)::int FROM repeat_review_comments c WHERE c.review_id = r.id) AS comment_count,
                (r.updated_at AT TIME ZONE 'Africa/Cairo') AS updated_local
           FROM repeat_reviews r ${conds.length ? "WHERE " + conds.join(" AND ") : ""}
          ORDER BY r.month DESC, r.status DESC, r.line_central, r.line_cabin, r.line_box, r.phone_short`, params);
      res.json({ data: rows.map((r: any) => ({ ...r, step: reviewStep(r) })) });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
