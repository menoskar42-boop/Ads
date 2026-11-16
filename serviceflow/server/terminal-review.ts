// «مراجعة البكس ترمنال بترمنال» — جزء Service-Flow (docs/SF_BOX_TERMINAL_REVIEW_PLAN.md، المالك ٢٠٢٦-١١-١٢).
// فنى الصيانة بيسجّل حالة كل ترمنال على موقع الصيانة (server/maintenance/app/routes/terminal_review.js). هنا:
//  • المعالجة بعد «تم الانتهاء»: مقارنة بخطوط البكس اللى ليها فريم، والنقل التلقائى ⇒ «تصحيح البيانات»
//    (line_data_corrections, source = 'terminal_review') + سجل النقل.
//  • التقرير: إحصائيات للكل (ماعدا المبيعات وأدمن المبيعات)، والتفصيلى لفنى المنطقة (كل فيما يخصه) والسوبر أدمن.
//  • فرق العدد: فنى المنطقة يأكّد (الفروق ⇒ تصحيح البيانات) أو يلغى (السوبر أدمن يقرّر: مراجعة تانية أو كلام فنى المنطقة).
import type { Express } from "express";
import type { Pool } from "pg";
import { ROLES } from "@shared/schema";
import { reviewTerminals, terminalNo, type TerminalState } from "@shared/terminal-review";

interface Deps {
  pool: Pool;
  requireAuth: (req: any, res: any, next: any) => void;
  applyLineCorrections: (phones: string[] | null) => Promise<number>;
}

// نفس توحيد الكتابة اللى فى موقع الصيانة (الجنادلة/الجنادله · 2/1 = 2-1 · ٠٧ = 7)
export const CENTRAL_N = (e: string) => `btrim(regexp_replace(regexp_replace(
  translate(lower(COALESCE(${e}, '')), 'أإآٱةى', 'ااااهي'), '\\s*-\\s*', '-', 'g'), '\\s+', ' ', 'g'))`;
export const CAB_N = (e: string) => `btrim(regexp_replace(regexp_replace(
  translate(COALESCE(${e}, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'),
  '[\\\\/_‐‑‒–—―]', '-', 'g'), '\\s*-\\s*', '-', 'g'))`;
export const BOX_N = (e: string) => `ltrim(btrim(translate(COALESCE(${e}, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789')), '0')`;

/** خطوط البكس فى البيانات الفنية اللى ليها فريم على الإمسان (r = صف المراجعة) */
export const BOX_LINES_SQL = (r: string) => `
  SELECT pl.full_phone AS phone, pl.dp_terminal AS terminal
    FROM phone_lines pl
   WHERE ${CENTRAL_N("pl.central")} = ${CENTRAL_N(`${r}.central_name`)}
     AND ${CAB_N("pl.cabin_number")} = ${CAB_N(`${r}.cabin_number`)}
     AND ${BOX_N("pl.box_number")} = ${BOX_N(`${r}.box_number`)}
     AND EXISTS (SELECT 1 FROM phone_ports pf WHERE pf.phone_number = pl.full_phone
                  AND COALESCE(btrim(pf.frame::text), '') <> '')`;

const AREA_OWNER_SQL = (r: string, wc: string) => `EXISTS (SELECT 1 FROM cabinet_technicians ct
   WHERE btrim(ct.worker_code) = ${wc}
     AND ${CENTRAL_N("ct.central_name")} = ${CENTRAL_N(`${r}.central_name`)}
     AND ${CAB_N("ct.cabin_number")} = ${CAB_N(`${r}.cabin_number`)})`;

async function loadReview(pool: Pool, id: number) {
  const { rows } = await pool.query(`SELECT * FROM box_terminal_reviews WHERE id = $1`, [id]);
  if (!rows[0]) return null;
  const { rows: items } = await pool.query(`SELECT terminal, state FROM box_terminal_review_items WHERE review_id = $1`, [id]);
  const states: Record<number, TerminalState> = {};
  for (const it of items) states[Number(it.terminal)] = it.state as TerminalState;
  const { rows: lines } = await pool.query(`SELECT x.* FROM box_terminal_reviews r, LATERAL (${BOX_LINES_SQL("r")}) x
                                             WHERE r.id = $1 ORDER BY x.phone`, [id]);
  return { review: rows[0], states, lines: lines.map((l: any) => ({ phone: String(l.phone), terminal: l.terminal == null ? null : String(l.terminal) })) };
}

/** بعد «تم الانتهاء»: المقارنة والنقل ⇒ تصحيح البيانات + السجل. مرة واحدة لكل مراجعة. */
export async function processTerminalReview(d: Deps, id: number): Promise<{ moved: number } | null> {
  const { pool } = d;
  // قفل المراجعة (عشان مايتعالجش مرتين من موقع الصيانة والتقرير فى نفس الوقت)
  const { rows: claim } = await pool.query(
    `UPDATE box_terminal_reviews SET processed_at = now()
      WHERE id = $1 AND status = 'done' AND processed_at IS NULL RETURNING id`, [id]);
  if (!claim.length) return null;
  try {
    const x = await loadReview(pool, id);
    if (!x) return null;
    const r = x.review;
    const res = reviewTerminals(Number(r.capacity), x.states, x.lines);
    const by = `مراجعة فنى الصيانة — ${String(r.reviewed_by || "").trim() || "غير معروف"}`;
    const phones: string[] = [];
    for (const m of res.moves) {
      const local = m.phone.replace(/^88/, "");
      const { rows: c } = await pool.query(
        `INSERT INTO line_data_corrections
           (phone_local, phone_full, central, cabin_number, box_number, dp_terminal, submitted_by_name, source, from_terminal)
         SELECT $1, $2, pl.central, pl.cabin_number, pl.box_number, $3, $4, 'terminal_review', $5
           FROM phone_lines pl WHERE pl.full_phone = $2
         RETURNING id`,
        [local, m.phone, String(m.to), by, m.from]);
      await pool.query(
        `INSERT INTO box_terminal_review_moves (review_id, phone_full, from_terminal, to_terminal, correction_id)
         VALUES ($1, $2, $3, $4, $5)`, [id, m.phone, m.from, String(m.to), c[0]?.id ?? null]);
      phones.push(m.phone);
    }
    // «السيستم يعدّل رقم الترمنال من نفسه» — فى بيان التليفونات فوراً (وفنى البيانات يعدّله فى السيستم الرسمى)
    if (phones.length) await d.applyLineCorrections(phones);
    await pool.query(`UPDATE box_terminal_reviews SET data_lines = $2, tech_hot = $3 WHERE id = $1`,
      [id, res.dataLines, res.techHot]);
    return { moved: res.moves.length };
  } catch (e) {
    // ترجع تتعالج تانى بعدين
    await pool.query(`UPDATE box_terminal_reviews SET processed_at = NULL WHERE id = $1`, [id]).catch(() => {});
    throw e;
  }
}

async function processPending(d: Deps) {
  const { rows } = await d.pool.query(
    `SELECT id FROM box_terminal_reviews WHERE status = 'done' AND processed_at IS NULL ORDER BY id LIMIT 50`);
  for (const r of rows) await processTerminalReview(d, Number(r.id)).catch((e) => console.error("[terminal-review]", e?.message));
}

export function registerTerminalReview(app: Express, d: Deps) {
  const { pool, requireAuth } = d;
  // موقع الصيانة بيشتغل فى نفس العملية — بينادى المعالجة أول ما الفنى يضغط «تم الانتهاء»
  (globalThis as any).__sfProcessTerminalReview = (id: number) => processTerminalReview(d, Number(id));

  const canStats = (role: string) => role !== ROLES.SALES && role !== ROLES.SALES_ADMIN;
  const isSuper = (u: any) => u?.role === ROLES.SUPER_ADMIN;
  const wc = (u: any) => String(u?.workerCode || "").trim();

  // GET /api/terminal-reviews — الإحصائيات: كل مراجعة «تم الانتهاء» بعدد الفنى قصاد البيانات **دلوقتى**
  app.get("/api/terminal-reviews", requireAuth, async (req: any, res) => {
    if (!canStats(req.user?.role)) return res.status(403).json({ message: "غير مسموح" });
    try {
      await processPending(d);
      const { rows } = await pool.query(
        `SELECT r.id, r.central_name AS central, r.cabin_number AS cabinet, r.box_number AS box, r.capacity,
                r.reviewed_by AS "reviewedBy", r.done_at AS "doneAt", r.tech_hot AS "techHot",
                (SELECT COUNT(*)::int FROM (${BOX_LINES_SQL("r")}) bl) AS "dataLines",
                (SELECT COUNT(*)::int FROM box_terminal_review_moves m WHERE m.review_id = r.id) AS moves,
                r.area_decision AS "areaDecision", r.area_decided_by AS "areaDecidedBy", r.area_decided_at AS "areaDecidedAt",
                r.super_decision AS "superDecision", r.super_decided_by AS "superDecidedBy",
                ${isSuper(req.user) ? "true" : wc(req.user) ? AREA_OWNER_SQL("r", "$1") : "false"} AS "canDetail"
           FROM box_terminal_reviews r
          WHERE r.status = 'done'
          ORDER BY r.done_at DESC NULLS LAST LIMIT 2000`,
        !isSuper(req.user) && wc(req.user) ? [wc(req.user)] : []);
      res.json({ data: rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  const canDetail = async (u: any, id: number) => {
    if (isSuper(u)) return true;
    if (u?.role !== ROLES.TECH || !wc(u)) return false;
    const { rows } = await pool.query(`SELECT 1 FROM box_terminal_reviews r WHERE r.id = $1 AND ${AREA_OWNER_SQL("r", "$2")}`, [id, wc(u)]);
    return rows.length > 0;
  };

  // GET /api/terminal-reviews/:id — التفصيلى (فنى المنطقة/السوبر أدمن): كل ترمنال قصاد البيانات دلوقتى، والخطوط
  // بالاسم والعنوان وآخر قياس، وسجل النقل
  app.get("/api/terminal-reviews/:id", requireAuth, async (req: any, res) => {
    const id = Number(req.params.id);
    if (!(await canDetail(req.user, id))) return res.status(403).json({ message: "التفصيلى لفنى المنطقة والسوبر أدمن بس" });
    try {
      const x = await loadReview(pool, id);
      if (!x) return res.status(404).json({ message: "مش موجودة" });
      const result = reviewTerminals(Number(x.review.capacity), x.states, x.lines);
      const phones = x.lines.map((l) => l.phone);
      const { rows: info } = await pool.query(
        `SELECT p.phone, si.sub_name AS "subName", si.sub_add AS "subAdd",
                (c.uploaded_at AT TIME ZONE 'Africa/Cairo') AS "lastMeasAt", c.score AS "lastScore"
           FROM unnest($1::text[]) p(phone)
           LEFT JOIN line_subscriber_info si ON si.phone_number = p.phone
           LEFT JOIN LATERAL (SELECT uploaded_at, score FROM case_138 WHERE full_phone = p.phone ORDER BY id DESC LIMIT 1) c ON true`,
        [phones]);
      const byPhone = new Map(info.map((r: any) => [String(r.phone), r]));
      const terminals = Array.from({ length: Number(x.review.capacity) }, (_, i) => {
        const t = i + 1;
        return {
          terminal: t, state: x.states[t] || null,
          lines: x.lines.filter((l) => terminalNo(l.terminal) === t).map((l) => ({ phone: l.phone, ...(byPhone.get(l.phone) || {}) })),
        };
      });
      const outside = x.lines.filter((l) => { const t = terminalNo(l.terminal); return t == null || t > Number(x.review.capacity); })
        .map((l) => ({ phone: l.phone, terminal: l.terminal, ...(byPhone.get(l.phone) || {}) }));
      const { rows: moves } = await pool.query(
        `SELECT phone_full AS phone, from_terminal AS "from", to_terminal AS "to", created_at AS "at"
           FROM box_terminal_review_moves WHERE review_id = $1 ORDER BY id`, [id]);
      const r = x.review;
      // قرار ٦: فنى المنطقة أكّد فرق العدد والبيانات فيها خط على «سلك بدون حرارة» ⇒ عطل محتمل (للسوبر أدمن)
      const possibleFaults = r.area_decision === "confirmed" && isSuper(req.user) ? result.onWire : [];
      res.json({
        review: {
          id: r.id, central: r.central_name, cabinet: r.cabin_number, box: r.box_number, capacity: r.capacity,
          reviewedBy: r.reviewed_by, doneAt: r.done_at, areaDecision: r.area_decision, areaDecidedBy: r.area_decided_by,
          superDecision: r.super_decision,
        },
        techHot: result.techHot, dataLines: result.dataLines, countDiff: result.countDiff,
        terminals, outside, moves, hotWithoutLine: result.hotWithoutLine,
        leftoverOnNone: result.leftoverOnNone, possibleFaults,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/terminal-reviews/:id/area-decision {decision: confirmed|cancelled} — فرق العدد
  app.post("/api/terminal-reviews/:id/area-decision", requireAuth, async (req: any, res) => {
    const id = Number(req.params.id);
    const decision = String(req.body?.decision || "");
    if (!["confirmed", "cancelled"].includes(decision)) return res.status(400).json({ message: "قرار غير معروف" });
    if (!(await canDetail(req.user, id))) return res.status(403).json({ message: "لفنى المنطقة والسوبر أدمن بس" });
    try {
      const x = await loadReview(pool, id);
      if (!x || x.review.status !== "done") return res.status(404).json({ message: "مش موجودة" });
      const result = reviewTerminals(Number(x.review.capacity), x.states, x.lines);
      if (result.countDiff === 0) return res.status(400).json({ message: "مفيش فرق فى العدد" });
      const by = String(req.user?.fullName || req.user?.username || "").trim();
      await pool.query(
        `UPDATE box_terminal_reviews SET area_decision = $2, area_decided_by = $3, area_decided_at = now(),
                super_decision = NULL, super_decided_by = NULL, super_decided_at = NULL WHERE id = $1`, [id, decision, by]);
      let sent = 0;
      if (decision === "confirmed") {
        // «تأكيد» ⇒ الفروق تروح لتصحيح البيانات: الخطوط اللى على ترمنال مفيش عليه سلك ولا حرارة عند فنى الصيانة
        for (const l of result.leftoverOnNone) {
          const { rowCount } = await pool.query(
            `INSERT INTO line_data_corrections
               (phone_local, phone_full, central, cabin_number, box_number, dp_terminal, submitted_by_name, source, from_terminal)
             SELECT $1, $2, pl.central, pl.cabin_number, pl.box_number, NULL, $3, 'terminal_review_diff', $4
               FROM phone_lines pl WHERE pl.full_phone = $2
                AND NOT EXISTS (SELECT 1 FROM line_data_corrections c WHERE c.phone_full = $2
                                 AND c.source = 'terminal_review_diff' AND c.resolved_at IS NULL)`,
            [l.phone.replace(/^88/, ""), l.phone, `فرق عدد أكّده فنى المنطقة — ${by}`, l.terminal]);
          sent += rowCount ?? 0;
        }
      }
      res.json({ ok: true, sent });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // POST /api/terminal-reviews/:id/super-decision {decision: re_review|accept_area} — لما فنى المنطقة يلغى
  app.post("/api/terminal-reviews/:id/super-decision", requireAuth, async (req: any, res) => {
    if (!isSuper(req.user)) return res.status(403).json({ message: "للسوبر أدمن بس" });
    const id = Number(req.params.id);
    const decision = String(req.body?.decision || "");
    if (!["re_review", "accept_area"].includes(decision)) return res.status(400).json({ message: "قرار غير معروف" });
    try {
      const by = String(req.user?.fullName || req.user?.username || "").trim();
      const { rows } = await pool.query(
        `UPDATE box_terminal_reviews SET super_decision = $2, super_decided_by = $3, super_decided_at = now(),
                status = CASE WHEN $2 = 're_review' THEN 'superseded' ELSE status END
          WHERE id = $1 AND area_decision = 'cancelled' RETURNING id`, [id, decision, by]);
      if (!rows.length) return res.status(400).json({ message: "القرار ده بعد ما فنى المنطقة يلغى بس" });
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
