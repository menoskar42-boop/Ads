// نقل كباين بين الفنيين **من تاريخ معيّن** + تاريخ التوزيع (المالك ٢٠٢٦-١٠-٠٧).
//
// قبل كده التوزيع كان جدول واحد (cabinet_technicians) بيتبدّل كله مع رفع الشيت، ومفيش
// تاريخ: أى تقرير عن فترة فاتت كان بيحسب أعطالها على الفنى الحالى. دلوقتى:
//   • cabinet_tech_changes — نقل مجدول (كابينة ← فنى، من لحظة effective_at). بيتطبّق لوحده.
//   • cabinet_tech_history — سجل اللى اتطبّق: الكابينة كانت مع مين وبقت مع مين ومن يوم إيه.
//   • «الأعطال فى الألف» بتتحسب على الفنى اللى كان ماسك الكابينة **يوم العطل**: الفترة
//     قبل النقل (والشهور اللى فاتت) على التوزيع القديم، وبعده على الجديد.
import type { Express } from "express";
import type { Pool } from "pg";
import { normCab } from "@shared/cab-norm";
import { canonicalTechSql } from "@shared/technicians";

/* أول نقل: من الأحد ١١ أكتوبر ٢٠٢٦ (١٢ بالليل بتوقيت القاهرة). الأرقام بصيغة النظام:
 * كابل-كابينة. «*» = كل كباين السنترال. التأكيد من المالك فى الشات ٢٠٢٦-١٠-٠٧. */
export const SEED_BATCH = "2026-10-11-islam";
export const SEED_EFFECTIVE_LOCAL = "2026-10-11 00:00";
export const SEED_CHANGES: { central: string; cabin: string; tech: string }[] = [
  { central: "الغنايم-دير الجنادله", cabin: "1-2", tech: "اسلام" },     // بدل سامى
  { central: "الغنايم-العزايزة", cabin: "*", tech: "حسن" },
  { central: "الغنايم", cabin: "1-8", tech: "حسن" },
  { central: "الغنايم", cabin: "7-1", tech: "محمد" },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((c) => ({ central: "الغنايم", cabin: `2-${c}`, tech: "محمد" })),
];

/* ───────────── حساب «الأعطال فى الألف» على التوزيع اللى كان ساعتها ───────────── */
export interface CtRow { central: string; cabin: string; code: string; worker: string | null }
export interface HistRow { central: string; cabin: string; oldWorker: string | null; date: string } // date = YYYY-MM-DD أول يوم للتوزيع الجديد
export interface AdslRow { centralName: string; cabinNumber: string; msanCode: string; techName: string; workingAdsl: number; faultCount: number }

const DAY = 86_400_000;
const dayNum = (d: string) => Math.floor(Date.parse(d + "T00:00:00Z") / DAY);
const dayStr = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const keyOf = (central: string, cabin: string) => `${central}|${normCab(cabin)}`;

/** الفنى (كود العامل) اللى كان ماسك الكابينة يوم d: أول نقل بعد d ⇒ اللى كان قبله، وإلا الحالى. */
export function workerAt(row: CtRow, history: HistRow[], d: string): string | null {
  const k = keyOf(row.central, row.cabin);
  const later = history.filter((h) => keyOf(h.central, h.cabin) === k && h.date > d).sort((a, b) => a.date.localeCompare(b.date));
  return later.length ? later[0].oldWorker : row.worker;
}

/** «حسن … , محمد …» ⇒ كل فنى لوحده (الاسم المجمّع جاى من كود MSAN مشترك أو كود عامل بأكتر من اسم). */
export const splitNames = (raw: string | null | undefined): string[] =>
  [...new Set(String(raw ?? "").split(/\s*[,،]\s*/).map((n) => n.trim()).filter(Boolean))];

export interface TechAdsl {
  techName: string;
  /** الشغال دلوقتى (التوزيع الأخير فى الفترة) — مش متقسّم على الأيام */
  workingAdsl: number;
  /** أعطال الفترة اللى اتحسبت عليه (كل عطل على الفنى اللى كان ماسك الكابينة يومها) */
  faultCount: number;
  /** أعطال فى الألف للفترة = مجموع (أعطال الجزء × ١٠٠٠ ÷ شغال الجزء) لكل جزء من الفترة */
  per1000: number;
  segments: { from: string; to: string; days: number; working: number; faults: number }[];
}

/**
 * المالك ٢٠٢٦-١٠-١٢ («عدد الأعطال فى الألف محتاج تظبيط»):
 *   • لكل كابينة: صف واحد بالفنى **الحالى** والشغال **كامل** وأعطال الفترة — معدّل الكابينة
 *     مالوش دعوة بمين ماسكها (قبل كده كانت بتتقسم صفين بشغال متقسّم على الأيام: دير الجنادله
 *     1-2 طلعت 68 شغال).
 *   • لكل فنى: كل جزء من الفترة بحسابه — من أولها لحد آخر يوم قبل النقل على **الشغال القديم
 *     والأعطال القديمة**، ومن يوم النقل على **الشغال الجديد والأعطال الجديدة** — والمعدّل =
 *     مجموع الأجزاء (يعنى المعدّل الشهرى = متوسط معدّلات الأجزاء موزون بعدد أيامها). «الشغال»
 *     اللى بيظهر = شغاله دلوقتى. كود MSAN عليه أكتر من فنى بيتقسم بينهم بالتساوى (مفيش صف مجمّع).
 */
export function buildAdslReport(args: {
  ct: CtRow[]; history: HistRow[]; names: Map<string, string>;
  working: Map<string, number>; daily: Map<string, Map<string, number>>; from: string; to: string;
}): { rows: AdslRow[]; techs: TechAdsl[] } {
  const { ct, history, names, working, daily, from, to } = args;
  const f = dayNum(from), t = dayNum(to);
  const byCode = new Map<string, CtRow[]>();
  for (const r of ct) { const l = byCode.get(r.code) || []; l.push(r); byCode.set(r.code, l); }
  const keysAll = new Set(ct.map((r) => keyOf(r.central, r.cabin)));
  const cuts = [...new Set(history.filter((h) => keysAll.has(keyOf(h.central, h.cabin)) && dayNum(h.date) > f && dayNum(h.date) <= t)
    .map((h) => dayNum(h.date)))].sort((a, b) => a - b);
  const bounds = [f, ...cuts, t + 1];
  const faultsIn = (code: string, s: number, e: number) => {
    let n = 0;
    for (const [d, c] of daily.get(code) || []) { const x = dayNum(d); if (x >= s && x <= e) n += c; }
    return n;
  };
  // الفنيين اللى كانوا ماسكين كباين الـMSAN ده يوم d (كل اسم لوحده)
  const holders = (rows: CtRow[], d: string) => [...new Set(rows.flatMap((r) => {
    const w = workerAt(r, history, d);
    return splitNames((w && names.get(w)) || "");
  }))].sort();

  const rows: AdslRow[] = [];
  const acc = new Map<string, { segs: { working: number; faults: number }[] }>();
  const segCount = bounds.length - 1;
  for (const [code, list] of byCode) {
    const total = working.get(code) || 0;
    const current = [...new Set(list.flatMap((r) => splitNames((r.worker && names.get(r.worker)) || "")))].sort();
    rows.push({
      centralName: list.map((r) => r.central).sort()[0],
      cabinNumber: [...new Set(list.map((r) => r.cabin))].sort().join(" , "),
      msanCode: code,
      techName: current.length ? current.join(" , ") : "غير معروف",
      workingAdsl: total,
      faultCount: faultsIn(code, f, t),
    });
    for (let i = 0; i < segCount; i++) {
      const s = bounds[i], e = bounds[i + 1] - 1;
      const hs = holders(list, dayStr(s));
      const who = hs.length ? hs : ["غير معروف"];
      const fl = faultsIn(code, s, e);
      for (const h of who) {
        const a = acc.get(h) ?? { segs: Array.from({ length: segCount }, () => ({ working: 0, faults: 0 })) };
        a.segs[i].working += total / who.length;
        a.segs[i].faults += fl / who.length;
        acc.set(h, a);
      }
    }
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const techs: TechAdsl[] = [...acc.entries()].map(([techName, a]) => {
    const segments = a.segs.map((g, i) => ({
      from: dayStr(bounds[i]), to: dayStr(bounds[i + 1] - 1), days: bounds[i + 1] - bounds[i],
      working: Math.round(g.working), faults: r2(g.faults),
    }));
    const per1000 = a.segs.reduce((sum, g) => sum + (g.working > 0 ? (g.faults * 1000) / g.working : 0), 0);
    return {
      techName,
      workingAdsl: Math.round(a.segs[segCount - 1].working),
      faultCount: r2(a.segs.reduce((sum, g) => sum + g.faults, 0)),
      per1000: r2(per1000),
      segments,
    };
  });
  rows.sort((a, b) => a.centralName.localeCompare(b.centralName, "ar") || a.cabinNumber.localeCompare(b.cabinNumber, "ar", { numeric: true }));
  techs.sort((a, b) => a.techName.localeCompare(b.techName, "ar"));
  return { rows, techs };
}

/* ───────────── تطبيق النقل المجدول ───────────── */
export async function applyDueReassignments(pool: Pool): Promise<{ applied: number; batches: string[] }> {
  const client = await pool.connect();
  const batches = new Set<string>();
  let applied = 0;
  try {
    await client.query("BEGIN");
    const due = await client.query(
      `SELECT * FROM cabinet_tech_changes WHERE status = 'pending' AND effective_at <= now()
        ORDER BY id FOR UPDATE SKIP LOCKED`);
    for (const ch of due.rows) {
      const codes = await client.query(
        `SELECT DISTINCT worker_code FROM technician_names WHERE ${canonicalTechSql("tech_name")} = $1 AND COALESCE(worker_code,'') <> ''`,
        [ch.new_tech_name]);
      if (codes.rows.length !== 1) {
        await client.query(`UPDATE cabinet_tech_changes SET status='failed', applied_at=now(), note=$2 WHERE id=$1`,
          [ch.id, codes.rows.length ? `أكتر من كود للفنى ${ch.new_tech_name}` : `مفيش كود عامل للفنى ${ch.new_tech_name} فى أسماء الفنيين`]);
        continue;
      }
      const newCode = String(codes.rows[0].worker_code);
      const rows = (await client.query(`SELECT id, cabin_number, cabin_code, worker_code FROM cabinet_technicians WHERE central_name = $1`, [ch.central_name])).rows
        .filter((r: any) => ch.cabin_number === "*" || normCab(r.cabin_number) === normCab(ch.cabin_number));
      if (!rows.length) {
        await client.query(`UPDATE cabinet_tech_changes SET status='failed', applied_at=now(), note='الكابينة مش موجودة فى فنيى الكباين' WHERE id=$1`, [ch.id]);
        continue;
      }
      for (const r of rows) {
        if (String(r.worker_code || "") === newCode) continue;
        await client.query(
          `INSERT INTO cabinet_tech_history (change_id, central_name, cabin_number, cabin_code, old_worker_code, new_worker_code, effective_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7::date)`,
          [ch.id, ch.central_name, r.cabin_number, r.cabin_code, r.worker_code, newCode, ch.effective_date]);
        await client.query(`UPDATE cabinet_technicians SET worker_code = $2 WHERE id = $1`, [r.id, newCode]);
      }
      await client.query(`UPDATE cabinet_tech_changes SET status='applied', applied_at=now(), new_worker_code=$2, rows_changed=$3,
                          old_worker_code=$4 WHERE id=$1`,
        [ch.id, newCode, rows.length, [...new Set(rows.map((r: any) => r.worker_code || "—"))].join(",")]);
      applied++;
      batches.add(ch.batch);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally { client.release(); }
  return { applied, batches: [...batches] };
}

/** بعد التطبيق: إشعار للسوبر أدمن بالتوزيع النهائى للفنيين اللى اتأثروا (عشان أى كابينة فاضلة تبان). */
export async function notifyBatch(pool: Pool, batch: string): Promise<void> {
  const ch = await pool.query(`SELECT status, central_name, cabin_number, new_tech_name, note FROM cabinet_tech_changes WHERE batch=$1 ORDER BY id`, [batch]);
  const techs = new Set<string>(ch.rows.map((r: any) => r.new_tech_name));
  const hist = await pool.query(
    `SELECT DISTINCT ${canonicalTechSql("tn.tech_name")} AS name FROM cabinet_tech_history h
       JOIN cabinet_tech_changes c ON c.id = h.change_id JOIN technician_names tn ON tn.worker_code = h.old_worker_code
      WHERE c.batch = $1`, [batch]);
  for (const r of hist.rows) if (r.name) techs.add(r.name);
  const lines: string[] = [];
  for (const name of techs) {
    const cabs = await pool.query(
      `SELECT DISTINCT ct.central_name, ct.cabin_number FROM cabinet_technicians ct
         JOIN technician_names tn ON tn.worker_code = ct.worker_code
        WHERE ${canonicalTechSql("tn.tech_name")} = $1 ORDER BY 1, 2`, [name]);
    lines.push(`${name}: ${cabs.rows.map((r: any) => `${r.central_name.replace(/^الغنايم-?/, "") || "الغنايم"} ${r.cabin_number}`).join("، ") || "ولا كابينة"}`);
  }
  const failed = ch.rows.filter((r: any) => r.status === "failed");
  const msg = `اتطبّق توزيع الكباين الجديد (${batch.slice(0, 10)}). ` + lines.join(" — ") +
    (failed.length ? ` ⚠️ ماتطبّقش: ${failed.map((r: any) => `${r.central_name} ${r.cabin_number} (${r.note})`).join("، ")}` : "");
  const admins = await pool.query(`SELECT id FROM users WHERE role = 'super_admin' AND COALESCE(suspended,false) = false`);
  for (const a of admins.rows) await pool.query(`INSERT INTO notifications (user_id, type, message) VALUES ($1, 'cabinet_reassign', $2)`, [a.id, msg]);
}

export function registerCabinetReassign(app: Express, deps: { pool: Pool; requireAuth: any; requireAdmin: any }): void {
  const { pool, requireAuth, requireAdmin } = deps;
  // ⚠️ مش مربوط بـ SF_SCHEDULERS: النقل لازم يحصل فى ميعاده حتى لو المهام المجدولة مقفولة فى
  // النسخة دى. التطبيق نفسه آمن لو اتنادى من أكتر من مكان (FOR UPDATE SKIP LOCKED + status).
  const tick = async () => {
    try {
      const r = await applyDueReassignments(pool);
      for (const b of r.batches) await notifyBatch(pool, b).catch((e) => console.error("[cabinet-reassign] notify:", e?.message));
      if (r.applied) console.log(`[cabinet-reassign] اتطبّق ${r.applied} نقل (${r.batches.join(", ")})`);
    } catch (e: any) { console.error("[cabinet-reassign] apply:", e?.message); }
  };
  // المالك ٢٠٢٦-١٠-١٢ («تكلفة قاعدة البيانات كتير»): كان بيسأل القاعدة **كل دقيقة** للأبد — والقاعدة
  // (Neon) بتنام بعد ٥ دقايق من غير استعلام، فمكانتش بتنام خالص من يوم ما الميزة نزلت. النقل
  // بيتضاف عند الإقلاع بس (seed فى db.ts)، فبنسأل مرة عند الإقلاع ونظبط مؤقّت واحد على ميعاد
  // أقرب نقل مستنى (وبحد أقصى ٦ ساعات نعيد الحساب). مفيش نقل مستنى ⇒ مفيش مؤقّت خالص.
  const MAX_WAIT = 6 * 60 * 60 * 1000;
  const scheduleNext = async () => {
    try {
      const { rows } = await pool.query(
        `SELECT EXTRACT(EPOCH FROM (MIN(effective_at) - now())) * 1000 AS ms
           FROM cabinet_tech_changes WHERE status = 'pending'`);
      const ms = rows[0]?.ms;
      if (ms == null) return;
      setTimeout(() => { void tick().then(scheduleNext); },
        Math.min(MAX_WAIT, Math.max(1_000, Number(ms) + 1_000))).unref?.();
    } catch (e: any) { console.error("[cabinet-reassign] schedule:", e?.message); }
  };
  setTimeout(() => { void tick().then(scheduleNext); }, 20_000).unref?.();

  app.get("/api/cabinet-reassignments", requireAuth, requireAdmin, async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, batch, central_name AS "central", cabin_number AS "cabin", new_tech_name AS "tech", status, note,
                (effective_at AT TIME ZONE 'Africa/Cairo') AS "effectiveAt", applied_at AS "appliedAt", rows_changed AS "rowsChanged"
           FROM cabinet_tech_changes ORDER BY effective_at DESC, id`);
      res.json({ data: rows });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}

/** لـ /api/reports/cabinet-adsl-faults: يجيب البيانات ويبنى الصفوف بالتوزيع اللى كان ساعتها. */
export async function cabinetAdslFaultsByHistory(pool: Pool, opts: { where: string; params: any[]; from: string; to: string; today?: string }): Promise<{ rows: AdslRow[]; techs: TechAdsl[] }> {
  const ct = (await pool.query(
    `SELECT DISTINCT ct.central_name, ct.cabin_number, ct.cabin_code, ct.worker_code
       FROM cabinet_technicians ct LEFT JOIN technician_names tn ON tn.worker_code = ct.worker_code
     ${opts.where}`, opts.params)).rows
    .map((r: any) => ({ central: r.central_name, cabin: r.cabin_number, code: r.cabin_code, worker: r.worker_code })) as CtRow[];
  if (!ct.length) return { rows: [], techs: [] };
  const codes = [...new Set(ct.map((r) => r.code))];
  const names = new Map<string, string>(
    // زى التقرير القديم: كل أسماء الكود (string_agg DISTINCT)
    (await pool.query(`SELECT worker_code, string_agg(DISTINCT tech_name, ' , ' ORDER BY tech_name) AS tech_name FROM technician_names GROUP BY worker_code`)).rows
      .map((r: any) => [String(r.worker_code), r.tech_name]));
  const history = (await pool.query(
    `SELECT central_name, cabin_number, old_worker_code, effective_date::text AS d FROM cabinet_tech_history
      WHERE effective_date > $1::date ORDER BY effective_date`, [opts.from])).rows
    .map((r: any) => ({ central: r.central_name, cabin: r.cabin_number, oldWorker: r.old_worker_code, date: r.d })) as HistRow[];
  const working = new Map<string, number>(
    (await pool.query(`SELECT msan_gpon_code, COALESCE(SUM(fbb_subs),0)::int AS n FROM ftth_subscribers WHERE msan_gpon_code = ANY($1::text[]) GROUP BY 1`, [codes])).rows
      .map((r: any) => [r.msan_gpon_code, Number(r.n)]));
  const daily = new Map<string, Map<string, number>>();
  const dq = await pool.query(
    // كل بلاغ مرة واحدة (زى UNION فى التقرير القديم) — على أول يوم ظهر فيه
    `SELECT msan_id, d::text AS d, COUNT(*)::int AS n FROM (
       SELECT msan_id, complain_no, MIN(d) AS d FROM (
         SELECT cd.msan_id, cd.complain_no, (cd.complain_time AT TIME ZONE 'UTC')::date AS d FROM complaint_details cd
          WHERE cd.msan_id = ANY($1::text[]) AND (cd.complain_time AT TIME ZONE 'UTC')::date BETWEEN $2::date AND $3::date
         UNION ALL
         SELECT rc.msan_id, rc.complain_no, (rc.complain_time AT TIME ZONE 'UTC')::date FROM remaining_complaints rc
          WHERE rc.msan_id = ANY($1::text[]) AND (rc.complain_time AT TIME ZONE 'UTC')::date BETWEEN $2::date AND $3::date
       ) u GROUP BY msan_id, complain_no
     ) x GROUP BY msan_id, d`, [codes, opts.from, opts.to]);
  for (const r of dq.rows) {
    const m = daily.get(r.msan_id) || new Map<string, number>();
    m.set(r.d, (m.get(r.d) || 0) + Number(r.n));
    daily.set(r.msan_id, m);
  }
  const span = adslSpan(opts.from, opts.to, [...daily.values()].flatMap((m) => [...m.keys()]), opts.today);
  return buildAdslReport({ ct, history, names, working, daily, from: span.from, to: span.to });
}

/**
 * الأيام اللى «الشغال» بيتقسم عليها لو فيه نقل جوّه الفترة: من أول الفترة (ولو مفيش تاريخ
 * بداية ⇒ أول يوم فيه عطل) لحد النهارده (القاهرة) مش لآخر الفترة — فى نص الشهر الأيام اللى
 * لسه ماجتش ماتتحسبش على الفنى الجديد كأنها أيام من غير أعطال.
 */
export function adslSpan(from: string, to: string, faultDays: string[], today = cairoToday()): { from: string; to: string } {
  let f = from;
  if (f < "2000-01-01") f = faultDays.length ? faultDays.reduce((a, b) => (b < a ? b : a)) : today;
  const t = to > today && today >= f ? today : to;
  return { from: f, to: t < f ? f : t };
}
export const cairoToday = (now = new Date()) => now.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });

/**
 * بعد رفع شيت فنيى الكباين (بيبدّل الجدول كله): لو الشيت لسه بالتوزيع القديم يرجّع
 * كابينة اتنقلت لفنيها القديم من غير ما حد ياخد باله. ماينفعش نفرض النقل على الشيت
 * (يمكن المالك بيغيّر عن قصد)، فبنقول بس: الكباين دى فى الشيت مع غير اللى اتنقلت له.
 */
export async function reassignConflicts(pool: Pool | { query: Pool["query"] }): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (h.central_name, h.cabin_number) h.central_name, h.cabin_number, h.new_worker_code, c.new_tech_name
       FROM cabinet_tech_history h JOIN cabinet_tech_changes c ON c.id = h.change_id
      ORDER BY h.central_name, h.cabin_number, h.effective_date DESC, h.id DESC`);
  if (!rows.length) return [];
  const ct = (await pool.query(`SELECT central_name, cabin_number, worker_code FROM cabinet_technicians`)).rows;
  const out: string[] = [];
  for (const h of rows as any[]) {
    const cur = ct.filter((r: any) => r.central_name === h.central_name && normCab(r.cabin_number) === normCab(h.cabin_number));
    if (cur.some((r: any) => String(r.worker_code || "") !== String(h.new_worker_code || "")))
      out.push(`${h.central_name} ${h.cabin_number} (المفروض ${h.new_tech_name})`);
  }
  return out;
}
