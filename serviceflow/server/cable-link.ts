// ربط كمية سلك التركيب/النقل اليدوية بأمر الشغل (المالك ٢٠٢٦-١٠-٠٨).
//
// الفنى بيدخّل كمية السلك لرقم تركيب/نقل حتى لو أمر الشغل لسه ماظهرش — الحفظ مايتمنعش.
// لكن الخصم من المخزن المحلى مابيحصلش غير لما أمر الشغل يظهر فعلاً (عشان مايتسجّلش تركيب
// وهمى بكمية سلك مش موجودة على الطبيعة):
//   • فيه أمر شغل ناجح ظاهر بالفعل للرقم ده ومالوش سلك ⇒ الإدخال بيتربط بيه على طول.
//   • مفيش ⇒ الإدخال «مستنى أمر الشغل» (pending_after_wo = آخر id فى work_orders وقت الحفظ):
//     مابيتخصمش ومابيتربطش بأى أمر شغل قديم — بيتربط بس بأمر شغل **ييجى بعد كده**
//     (id أكبر). فأمر الشغل اللى كان ظاهر قبل كده وله سلك، السلك بتاعه مابيتغيرش.
//   • مستنى ومفيش أمر شغل ظهر خلال ٧ أيام من تاريخه ⇒ بيتمسح، وصاحبه بيوصله إشعار.
// الإدخالات القديمة (قبل الربط) wo_ref و pending_after_wo فاضيين ⇒ بتتربط بالرقم والنوع زى الأول.
import type { Pool } from "pg";
import { ROLES } from "@shared/schema";
import { canonicalTechSql, matchTechnician } from "@shared/technicians";
import { phoneNormSql as sp } from "./phone-norm";
import { closingTech, notifyIfNegative, cableTypeOf } from "./local-store";

/** الإدخال اليدوى بيستنى أمر الشغل كام يوم قبل ما يتمسح. */
export const PENDING_DAYS = 7;
/** أمر شغل «ظاهر بالفعل» يتربط بيه الإدخال على طول — آخر كام يوم (غير كده = قديم مالوش دعوة). */
export const OPEN_WO_DAYS = 45;

export const isInstallType = (t: string) => cableTypeOf(t) === "install";
const woTypeSql = (w = "w") => `(CASE WHEN trim(${w}.service_type) = 'نقل' THEN 'نقل' ELSE 'تركيب' END)`;
const successSql = (w = "w") => `(${w}.close_category IS NULL OR ${w}.close_category = 'Success')`;

/**
 * شرط الربط فى أى LEFT JOIN بين work_orders w و cable_entries ce (فوق شرط الرقم والنوع):
 * المستنى مابيتربطش بحاجة، والمربوط بيتربط بأمر الشغل بتاعه بس.
 */
export const CE_LINK_COND = `ce.pending_after_wo IS NULL AND (ce.wo_ref IS NULL OR ce.wo_ref = w.id)`;

/**
 * أمر الشغل اللى الإدخال الجديد يتربط بيه دلوقتى: المحدد (woRef من صف «أوامر شغل بدون كمية سلك»)،
 * وإلا آخر أمر شغل ناجح بنفس الرقم والنوع خلال آخر OPEN_WO_DAYS يوم **ومالوش سلك** فى الملف.
 */
export async function findOpenWorkOrder(pool: Pool, phoneLocal: string, type: string, woRef?: number | null):
  Promise<{ id: number; closeDate: string } | null> {
  const params: any[] = [phoneLocal, type];
  let extra = `AND NULLIF(btrim(COALESCE(w.cable_quantity, '')), '') IS NULL
               AND w.close_date >= now() - interval '${OPEN_WO_DAYS} days'`;
  if (woRef) { params.push(woRef); extra = `AND w.id = $3`; }
  const r = await pool.query(
    `SELECT w.id, (w.close_date AT TIME ZONE 'Africa/Cairo')::date::text AS d FROM work_orders w
      WHERE ${sp("w.phone_number")} = ${sp("$1")} AND ${woTypeSql()} = $2 AND ${successSql()} ${extra}
      ORDER BY w.close_date DESC NULLS LAST LIMIT 1`, params);
  return r.rows[0] ? { id: r.rows[0].id, closeDate: r.rows[0].d } : null;
}

/**
 * فنى أمر الشغل (واحد من الخمسة) — بكود العامل الأول، وإلا الاسم (التعديل اليدوى أو الشيت).
 * NULL = اسم مش معروف ⇒ مالوش صاحب، والفنى اللى سجّل السلك هو اللى بيتكتب عليه.
 */
const woTechSql = (w = "w", o = "o") => `COALESCE(
  ${canonicalTechSql(`(SELECT tn.tech_name FROM technician_names tn WHERE btrim(tn.worker_code) = btrim(COALESCE(${w}.worker_code, ''))
                         AND btrim(COALESCE(${w}.worker_code, '')) <> '' LIMIT 1)`)},
  ${canonicalTechSql(`COALESCE(NULLIF(btrim(${o}.tech_name), ''), btrim(${w}.tech_name))`)})`;

export async function workOrderTech(pool: Pool, woId: number): Promise<string | null> {
  const r = await pool.query(
    `SELECT ${woTechSql()} AS t FROM work_orders w
       LEFT JOIN work_order_tech_overrides o ON o.central_name = w.central_name AND o.work_order_id = w.work_order_id
      WHERE w.id = $1`, [woId]);
  return r.rows[0]?.t ?? null;
}

/**
 * المالك ٢٠٢٦-١٠-٠٨: الفنى اللى سجّل السلك وأمر الشغل طلع **باسم فنى تانى من الخمسة** ⇒ الكمية
 * ماتتعتمدش. الفنى مش معروف (مش من الخمسة) أو اللى سجّل مش فنى ⇒ مفيش مقارنة.
 */
export const foreignWorkOrder = (enteredBy: string | null, woTech: string | null): boolean =>
  !!enteredBy && !!woTech && enteredBy !== woTech;

/** الإدخال اللى أمر شغله طلع لفنى تانى: يتمسح، والفنى والسوبر أدمن يوصلهم إشعار. */
async function rejectForeign(pool: Pool, r: { id: number; phone_local: string; work_order_type: string; cable_quantity: string; created_by_id: number | null }, me: string, woTech: string) {
  const del = await pool.query(`DELETE FROM cable_entries WHERE id = $1 RETURNING id`, [r.id]);
  if (!del.rowCount) return false;
  const msg = `كمية السلك ${r.cable_quantity} متر اللى ${me} سجّلها للرقم 88-${r.phone_local} (${r.work_order_type}) مااتعتمدتش — أمر الشغل طلع باسم الفنى ${woTech}.`;
  const to = new Set<number>();
  if (r.created_by_id) to.add(r.created_by_id);
  for (const u of (await pool.query(`SELECT id FROM users WHERE role = 'super_admin' AND COALESCE(suspended, false) = false`)).rows) to.add(u.id);
  for (const id of to) await pool.query(`INSERT INTO notifications (user_id, type, message) VALUES ($1, 'cable_entry_foreign', $2)`, [id, msg]).catch(() => undefined);
  return true;
}

/** آخر id فى work_orders — أى أمر شغل id بتاعه أكبر منه ظهر بعد الحفظ. */
export async function lastWorkOrderId(pool: Pool): Promise<number> {
  return Number((await pool.query(`SELECT COALESCE(max(id), 0)::int AS m FROM work_orders`)).rows[0]?.m ?? 0);
}

/**
 * الإدخالات المستنية: لو ظهر لها أمر شغل جديد ⇒ تتربط بيه (تاريخ الشغل = تاريخ إغلاقه، والفنى
 * = الفنى اللى سجّل لو من الخمسة، وإلا فنى الإغلاق) وتتخصم. onLinked بيكمّل الباقى (اسم الفنى على أمر الشغل).
 */
export async function linkPendingEntries(pool: Pool, onLinked?: (e: { entryId: number; woId: number; createdById: number | null }) => Promise<void>):
  Promise<number> {
  const { rows } = await pool.query(
    `SELECT ce.id, ce.phone_local, ce.work_order_type, ce.cable_quantity, ce.stock_tech_name, ce.created_by_id,
            w.id AS wo_id, (w.close_date AT TIME ZONE 'Africa/Cairo')::date::text AS d, w.wo_tech,
            u.role, u.username,
            (SELECT tn.tech_name FROM technician_names tn WHERE btrim(tn.worker_code) = btrim(COALESCE(u.worker_code, ''))
               AND btrim(COALESCE(u.worker_code, '')) <> '' ORDER BY tn.id DESC LIMIT 1) AS self_name
       FROM cable_entries ce
       JOIN LATERAL (
         SELECT w.id, w.close_date, ${woTechSql()} AS wo_tech FROM work_orders w
           LEFT JOIN work_order_tech_overrides o ON o.central_name = w.central_name AND o.work_order_id = w.work_order_id
          WHERE w.id > ce.pending_after_wo
            AND ${sp("w.phone_number")} = ${sp("ce.phone_local")}
            AND ${woTypeSql()} = ce.work_order_type AND ${successSql()}
          ORDER BY w.id LIMIT 1) w ON true
       LEFT JOIN users u ON u.id = ce.created_by_id
      WHERE ce.pending_after_wo IS NOT NULL`);
  let linked = 0;
  for (const r of rows) {
    const me = r.role === ROLES.TECH ? (matchTechnician(r.self_name) || matchTechnician(r.username)) : null;
    if (foreignWorkOrder(me, r.wo_tech)) { await rejectForeign(pool, r, me!, r.wo_tech); continue; }
    let tech: string | null = r.stock_tech_name;
    if (!tech && me) tech = me;
    if (!tech) tech = (await closingTech(pool, r.phone_local, r.work_order_type)).tech;
    const u = await pool.query(
      `UPDATE cable_entries SET wo_ref = $2, pending_after_wo = NULL, stock_date = $3::date,
              stock_tech_name = COALESCE(stock_tech_name, $4)
        WHERE id = $1 AND pending_after_wo IS NOT NULL`, [r.id, r.wo_id, r.d, tech]);
    if (!u.rowCount) continue;
    linked++;
    if (tech) await notifyIfNegative(pool, tech, "install", Number(r.cable_quantity) || 0).catch(() => null);
    if (onLinked) await onLinked({ entryId: r.id, woId: r.wo_id, createdById: r.created_by_id }).catch(() => undefined);
  }
  return linked;
}

/** المستنى أكتر من PENDING_DAYS يوم من غير أمر شغل ⇒ يتمسح، وصاحبه يوصله إشعار. */
export async function expirePendingEntries(pool: Pool): Promise<number> {
  const { rows } = await pool.query(
    `DELETE FROM cable_entries
      WHERE pending_after_wo IS NOT NULL AND created_at < now() - interval '${PENDING_DAYS} days'
      RETURNING phone_full, work_order_type, cable_quantity, created_by_id`);
  for (const r of rows) {
    if (!r.created_by_id) continue;
    await pool.query(`INSERT INTO notifications (user_id, type, message) VALUES ($1, 'cable_entry_expired', $2)`,
      [r.created_by_id, `اتمسح إدخال السلك ${r.cable_quantity} متر للرقم ${r.phone_full} (${r.work_order_type}) — أمر الشغل ماظهرش خلال ${PENDING_DAYS} أيام من تاريخ الإدخال.`])
      .catch(() => undefined);
  }
  return rows.length;
}

/**
 * الإدخالات اليدوية اللى اتسجّلت قبل الربط (آخر PENDING_DAYS يوم) — كانت بتاخد تاريخ النهارده
 * وتتخصم حتى من غير أمر شغل. القاعدة الجديدة عليها هى كمان: فيه أمر شغل ناجح بنفس الرقم والنوع
 * (من OPEN_WO_DAYS يوم قبل الإدخال لحد دلوقتى) ⇒ تتربط بيه، مفيش ⇒ «مستنى» ومابتتخصمش.
 */
export async function adoptRecentEntries(pool: Pool): Promise<{ linked: number; pending: number }> {
  const floor = await lastWorkOrderId(pool);
  const { rows } = await pool.query(
    `SELECT ce.id, ce.phone_local, ce.work_order_type, ce.cable_quantity, ce.created_by_id,
            w.id AS wo_id, (w.close_date AT TIME ZONE 'Africa/Cairo')::date::text AS d, w.wo_tech, u.role, u.username,
            (SELECT tn.tech_name FROM technician_names tn WHERE btrim(tn.worker_code) = btrim(COALESCE(u.worker_code, ''))
               AND btrim(COALESCE(u.worker_code, '')) <> '' ORDER BY tn.id DESC LIMIT 1) AS self_name
       FROM cable_entries ce
       LEFT JOIN users u ON u.id = ce.created_by_id
       LEFT JOIN LATERAL (
         SELECT w.id, w.close_date, ${woTechSql()} AS wo_tech FROM work_orders w
           LEFT JOIN work_order_tech_overrides o ON o.central_name = w.central_name AND o.work_order_id = w.work_order_id
          WHERE ${sp("w.phone_number")} = ${sp("ce.phone_local")}
            AND ${woTypeSql()} = ce.work_order_type AND ${successSql()}
            AND w.close_date >= ce.created_at - interval '${OPEN_WO_DAYS} days'
          ORDER BY w.close_date DESC NULLS LAST LIMIT 1) w ON true
      WHERE ce.wo_ref IS NULL AND ce.pending_after_wo IS NULL
        AND btrim(ce.work_order_type) IN ('تركيب', 'نقل')
        AND ce.created_at > now() - interval '${PENDING_DAYS} days'`);
  let linked = 0, pending = 0;
  for (const r of rows) {
    const me = r.role === ROLES.TECH ? (matchTechnician(r.self_name) || matchTechnician(r.username)) : null;
    if (r.wo_id && foreignWorkOrder(me, r.wo_tech)) { await rejectForeign(pool, r, me!, r.wo_tech); continue; }
    if (r.wo_id) {
      await pool.query(`UPDATE cable_entries SET wo_ref = $2, stock_date = $3::date WHERE id = $1 AND wo_ref IS NULL`, [r.id, r.wo_id, r.d]);
      linked++;
    } else {
      await pool.query(`UPDATE cable_entries SET pending_after_wo = $2, stock_date = NULL WHERE id = $1 AND pending_after_wo IS NULL`, [r.id, floor]);
      pending++;
    }
  }
  return { linked, pending };
}

let running = false;
/** ربط + مسح — بعد رفع ملف أوامر الشغل وكل نص ساعة. */
export async function runCableLinker(pool: Pool, onLinked?: Parameters<typeof linkPendingEntries>[1]): Promise<{ linked: number; expired: number }> {
  if (running) return { linked: 0, expired: 0 };
  running = true;
  try {
    const adopted = await adoptRecentEntries(pool);
    if (adopted.linked || adopted.pending) console.log(`[cable-link] إدخالات قبل الربط: ${adopted.linked} اتربطت بأمر شغل و${adopted.pending} بقت مستنية`);
    const linked = await linkPendingEntries(pool, onLinked);
    const expired = await expirePendingEntries(pool);
    if (linked || expired) console.log(`[cable-link] اتربط ${linked} إدخال بأمر شغل، واتمسح ${expired} إدخال عدّى ${PENDING_DAYS} أيام`);
    return { linked, expired };
  } finally { running = false; }
}
