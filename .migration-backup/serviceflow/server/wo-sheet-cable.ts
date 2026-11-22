// السلك المستهلك من شيت WFM («Consumed Cables») — قواعد المالك ٢٠٢٦-١١-٠٢، لأوامر الشغل اللى اتقفلت من ٣-١١-٢٠٢٦:
//   • الكمية أقل من ٥٠ (أو أكتر) ⇒ بتتاخد زى ما هى. أى كمية الفنى دخّلها بإيده لنفس الأمر بتتجاهل.
//   • الكمية = ٥٠ (الرقم اللى بيتكتب لو محدش دخّل) ⇒ أمر شغل «من غير كمية سلك» يظهر للفنى يدخّلها.
//   • فنى الإغلاق مش من الخمسة ⇒ يظهر للفنى يسجّل إنه بتاعه (عشان نعرف تبع مين) — السلك المكتوب مايتغيّرش.
//   • السوبر أدمن بس يعدّل الكمية (work_order_cable_overrides) أو فنى الإغلاق.
// الكمية من الشيت بتتسجّل كإدخال سلك (cable_entries · source='sheet') — فرصيد الفنى والتقارير و«بدون كمية سلك»
// بيمشوا على نفس الحساب من غير ما الفنى يدخّل حاجة.
import type { Pool } from "pg";
import { canonicalTechSql } from "@shared/technicians";

export const SHEET_CABLE_FROM = "2026-11-03";
export const SHEET_CABLE_PLACEHOLDER = 50;

/** يوم الإغلاق بتوقيت القاهرة من ٣-١١ وبعده (شروط الشيت الجديدة) */
export const sheetRulesSql = (w = "w") => `((${w}.close_date AT TIME ZONE 'Africa/Cairo')::date >= DATE '${SHEET_CABLE_FROM}')`;
const overrideSql = (w = "w") =>
  `(SELECT NULLIF(btrim(co.cable_quantity), '') FROM work_order_cable_overrides co
     WHERE co.central_name = ${w}.central_name AND co.work_order_id = ${w}.work_order_id LIMIT 1)`;
const numericSql = (e: string) => `(CASE WHEN btrim(COALESCE(${e}, '')) ~ '^[0-9]+(\\.[0-9]+)?$' THEN btrim(${e})::numeric END)`;

/**
 * الكمية الفعلية من أمر الشغل (نص زى عمود cable_quantity، أو NULL = «لسه من غير كمية»):
 * تعديل السوبر أدمن ← (من ٣-١١: الشيت لو مش ٥٠) ← (قبل ٣-١١: الشيت زى ما كان).
 */
export const sheetCableSql = (w = "w") => `COALESCE(${overrideSql(w)},
  CASE WHEN ${sheetRulesSql(w)} AND ${numericSql(`${w}.cable_quantity`)} = ${SHEET_CABLE_PLACEHOLDER} THEN NULL
       ELSE NULLIF(btrim(COALESCE(${w}.cable_quantity, '')), '') END)`;

/** الكمية بالقاعدة الجديدة لأمر واحد (للاختبار وللتطبيق) */
export function sheetCableFor(o: { closeDay: string; sheet: string | null; override?: string | null }): string | null {
  const ov = String(o.override ?? "").trim();
  if (ov) return ov;
  const s = String(o.sheet ?? "").trim();
  if (!s) return null;
  if (o.closeDay >= SHEET_CABLE_FROM && /^[0-9]+(\.[0-9]+)?$/.test(s) && Number(s) === SHEET_CABLE_PLACEHOLDER) return null;
  return s;
}

const woTypeSql = (w = "w") => `(CASE WHEN trim(${w}.service_type) = 'نقل' THEN 'نقل' ELSE 'تركيب' END)`;
/** فنى أمر الشغل (من الخمسة) — نفس woTechSql فى cable-link.ts */
const woTechSql = (w = "w", o = "o") => `COALESCE(
  ${canonicalTechSql(`(SELECT tn.tech_name FROM technician_names tn WHERE btrim(tn.worker_code) = btrim(COALESCE(${w}.worker_code, ''))
                         AND btrim(COALESCE(${w}.worker_code, '')) <> '' LIMIT 1)`)},
  ${canonicalTechSql(`COALESCE(NULLIF(btrim(${o}.tech_name), ''), btrim(${w}.tech_name))`)})`;

/**
 * أوامر الشغل من ٣-١١ اللى ليها كمية فعلية ⇒ إدخال سلك من الشيت (واحد لكل أمر).
 * - مفيش إدخال للرقم والنوع ⇒ يتضاف (source='sheet') على فنى الأمر لو من الخمسة، وإلا من غير فنى لحد ما حد يسجّله.
 * - فيه إدخال يدوى لنفس الأمر (أو من غير أمر ومن ٣-١١) ⇒ الكمية بتبقى بتاعة الشيت، واليدوى بيتحفظ فى manual_quantity.
 * - إدخال من الشيت والكمية اتغيّرت (تعديل السوبر أدمن) ⇒ يتحدّث.
 * nos تحديد أوامر بعينها (بعد التعديل) — من غيرها كله.
 */
export async function syncSheetCableEntries(pool: Pool, woIds?: number[]): Promise<{ inserted: number; updated: number }> {
  const params: any[] = [];
  let only = "";
  if (woIds?.length) { params.push(woIds); only = `AND w.id = ANY($1::int[])`; }
  const { rows } = await pool.query(
    `SELECT w.id, regexp_replace(w.phone_number, '^88', '') AS local, w.phone_number AS full, ${woTypeSql()} AS type,
            ${sheetCableSql()} AS qty, ${woTechSql()} AS tech,
            (w.close_date AT TIME ZONE 'Africa/Cairo')::date::text AS day
       FROM work_orders w
       LEFT JOIN work_order_tech_overrides o ON o.central_name = w.central_name AND o.work_order_id = w.work_order_id
      WHERE ${sheetRulesSql()} AND (w.close_category IS NULL OR w.close_category = 'Success')
        AND regexp_replace(COALESCE(w.phone_number, ''), '\\D', '', 'g') ~ '^88[0-9]{7}$'
        AND lower(btrim(COALESCE(w.work_order_type_raw, ''))) <> ALL(ARRAY['vas activation/deactivation',
              'fv change phone number availability and validation', 'fixed voice manual survey', 'fvmanualsurvey'])
        AND ${sheetCableSql()} IS NOT NULL ${only}`, params);
  let inserted = 0, updated = 0;
  for (const r of rows) {
    const cur = (await pool.query(
      `SELECT id, cable_quantity, source, wo_ref, stock_date::text AS d, pending_after_wo FROM cable_entries
        WHERE phone_local = $1 AND work_order_type = $2 LIMIT 1`, [r.local, r.type])).rows[0];
    if (!cur) {
      await pool.query(
        `INSERT INTO cable_entries (phone_local, phone_full, work_order_type, cable_quantity, created_by_name, stock_tech_name, stock_date, wo_ref, source)
         VALUES ($1, $2, $3, $4, 'شيت WFM', $5, $6::date, $7, 'sheet')
         ON CONFLICT ON CONSTRAINT cable_entries_phone_type_uniq DO NOTHING`,
        [r.local, r.full, r.type, String(r.qty), r.tech, r.day, r.id]);
      inserted++;
      continue;
    }
    // إدخال لأمر شغل تانى أقدم لنفس الرقم والنوع ⇒ مانلمسهوش
    const sameWo = cur.wo_ref === r.id || (cur.wo_ref == null && (cur.pending_after_wo != null || (cur.d ?? "") >= SHEET_CABLE_FROM));
    if (!sameWo) continue;
    if (cur.source === "sheet" && String(cur.cable_quantity) === String(r.qty) && cur.wo_ref === r.id) continue;
    await pool.query(
      `UPDATE cable_entries SET manual_quantity = CASE WHEN source IS DISTINCT FROM 'sheet' THEN cable_quantity ELSE manual_quantity END,
              cable_quantity = $2, source = 'sheet', wo_ref = $3, pending_after_wo = NULL,
              stock_date = COALESCE(stock_date, $4::date), stock_tech_name = COALESCE(stock_tech_name, $5), updated_at = now()
        WHERE id = $1`, [cur.id, String(r.qty), r.id, r.day, r.tech]);
    updated++;
  }
  return { inserted, updated };
}
