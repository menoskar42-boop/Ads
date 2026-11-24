// السلك المستهلك من شيت WFM («Consumed Cables») — قواعد المالك ٢٠٢٦-١١-٠٢، لأوامر الشغل اللى اتقفلت من ٣-١١-٢٠٢٦:
//   • أقل من ٥٠م ⇒ كمية الشيت هى المعتمدة، والتسجيل اليدوى مرفوض.
//   • ٥٠م أو أكتر ⇒ تظهر للمراجعة، والتسجيل اليدوى يكتب override بكمية الفنى.
//   • فنى الإغلاق مش من الخمسة ⇒ يظهر للفنى يسجّل إنه بتاعه (عشان نعرف تبع مين) — السلك المكتوب مايتغيّرش.
//   • السوبر أدمن بس يعدّل الكمية (work_order_cable_overrides) أو فنى الإغلاق.
// الكمية من الشيت بتتسجّل كإدخال سلك (cable_entries · source='sheet') — فرصيد الفنى والتقارير و«بدون كمية سلك»
// بيمشوا على نفس الحساب من غير ما الفنى يدخّل حاجة.
import type { Pool } from "pg";
import { canonicalTechSql } from "@shared/technicians";
import { phoneNormSql as sp } from "./phone-norm";

export const SHEET_CABLE_FROM = "2026-11-03";
export const SHEET_CABLE_PLACEHOLDER = 50;

/** التسجيل اليدوى لتركيب/نقل مسموح فقط لما كمية WFM الخام ٥٠ م أو أكتر. */
export function decideManualCableQuantity(sheetRaw: string | null | undefined, manual: string): {
  allowed: boolean; countedQuantity: string | null; reason: "manual" | "sheet_below_50" | "sheet_unavailable" | "manual_invalid";
} {
  const raw = String(sheetRaw ?? "").trim();
  const qty = String(manual ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)))
    return { allowed: false, countedQuantity: null, reason: "sheet_unavailable" };
  if (Number(raw) < SHEET_CABLE_PLACEHOLDER)
    return { allowed: false, countedQuantity: raw, reason: "sheet_below_50" };
  if (!/^\d+(\.\d+)?$/.test(qty) || !Number.isFinite(Number(qty)))
    return { allowed: false, countedQuantity: raw, reason: "manual_invalid" };
  return { allowed: true, countedQuantity: qty, reason: "manual" };
}

/** يوم الإغلاق بتوقيت القاهرة من ٣-١١ وبعده (شروط الشيت الجديدة) */
export const sheetRulesSql = (w = "w") => `((${w}.close_date AT TIME ZONE 'Africa/Cairo')::date >= DATE '${SHEET_CABLE_FROM}')`;
const overrideSql = (w = "w") =>
  `(SELECT NULLIF(btrim(co.cable_quantity), '') FROM work_order_cable_overrides co
     WHERE co.central_name = ${w}.central_name AND co.work_order_id = ${w}.work_order_id LIMIT 1)`;
const numericSql = (e: string) => `(CASE WHEN btrim(COALESCE(${e}, '')) ~ '^[0-9]+(\\.[0-9]+)?$' THEN btrim(${e})::numeric END)`;

/** الكمية من عمود الشيت الصحيح، مع الرجوع للصف الخام للأوامر المستوردة قبل إصلاح اختيار العمود. */
export const sheetRawCableSql = (w = "w") => `COALESCE(
  NULLIF(btrim(COALESCE(${w}.cable_quantity, '')), ''),
  NULLIF(btrim(COALESCE(${w}.raw_data->>'Consumed Cables', '')), '')
)`;

/**
 * الكمية الفعلية من أمر الشغل (نص زى عمود cable_quantity، أو NULL = «لسه من غير كمية»):
 * تعديل السوبر أدمن ← (من ٣-١١: الشيت لو مش ٥٠) ← (قبل ٣-١١: الشيت زى ما كان).
 */
export const sheetCableSql = (w = "w") => `COALESCE(${overrideSql(w)},
  CASE WHEN ${sheetRulesSql(w)} AND ${numericSql(sheetRawCableSql(w))} = ${SHEET_CABLE_PLACEHOLDER} THEN NULL
       ELSE ${sheetRawCableSql(w)} END)`;

/**
 * للمراجعة (المالك ٢٠٢٦-١١-٢٣: «50م او اكثر يظهر للمراجعه او التعديل» · «الخمسين بالظبط تظهر للتأكيد او التعديل»):
 * من ٣-١١، الشيت ٥٠ أو أكتر ومحدش راجعه لسه ⇒ يظهر فى «بدون كمية سلك»، والفنى (أو السوبر أدمن) يأكّد/يعدّل
 * = PUT /api/work-orders/:id/cable. أكتر من ٥٠ محسوبة لحد ما يراجعها؛ الـ٥٠ بالظبط مش محسوبة لحد ما تتأكّد (sheetCableSql).
 * ce = alias إدخال السلك فى نفس الاستعلام (اختيارى): الـ٥٠ اللى الفنى دخّل كميتها بالطريقة القديمة ماترجعش تظهر.
 */
export const sheetReviewSql = (w = "w", ce?: string) => `(${sheetRulesSql(w)} AND ${overrideSql(w)} IS NULL
  AND ${numericSql(sheetRawCableSql(w))} >= ${SHEET_CABLE_PLACEHOLDER}${ce ? `
  AND (${numericSql(sheetRawCableSql(w))} > ${SHEET_CABLE_PLACEHOLDER} OR ${ce}.cable_quantity IS NULL)` : ""})`;

/** نفس sheetReviewSql لأمر واحد (للاختبار) */
export function sheetNeedsReview(o: { closeDay: string; sheet: string | null; override?: string | null }): boolean {
  if (String(o.override ?? "").trim()) return false;
  const s = String(o.sheet ?? "").trim();
  return o.closeDay >= SHEET_CABLE_FROM && /^[0-9]+(\.[0-9]+)?$/.test(s) && Number(s) >= SHEET_CABLE_PLACEHOLDER;
}

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
 * - فيه إدخال يدوى لنفس الأمر (أو إدخال قديم من ٣-١١) ⇒ يتحدّث نفس الصف؛ الكمية اليدوية القديمة تحفظ فى manual_quantity.
 * - إدخال من الشيت والكمية اتغيّرت (تعديل السوبر أدمن) ⇒ يتحدّث.
 * nos تحديد أوامر بعينها (بعد التعديل) — من غيرها كله.
 */
export async function syncSheetCableEntries(pool: Pick<Pool, "query">, woIds?: number[]): Promise<{ inserted: number; updated: number }> {
  const params: any[] = [];
  let only = "";
  if (woIds?.length) { params.push(woIds); only = `AND w.id = ANY($1::int[])`; }
  const { rows } = await pool.query(
    `SELECT w.id, ${sp("w.phone_number")} AS local, '88' || ${sp("w.phone_number")} AS full, ${woTypeSql()} AS type,
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
    let cur = (await pool.query(
      `SELECT id, cable_quantity, source, wo_ref, work_order_type AS entry_type,
              stock_date::text AS d, pending_after_wo, stock_tech_name FROM cable_entries
        WHERE wo_ref = $1 ORDER BY id LIMIT 1`, [r.id])).rows[0];
    // إدخال يدوى غير مربوط لا يُعتمد إلا لو نفس اليوم ونفس الفني؛ رقم الخط وحده لا يثبت أنه نفس أمر الشغل.
    if (!cur) cur = (await pool.query(
      `SELECT id, cable_quantity, source, wo_ref, work_order_type AS entry_type,
              stock_date::text AS d, pending_after_wo, stock_tech_name FROM cable_entries
        WHERE work_order_type = $2 AND wo_ref IS NULL AND pending_after_wo IS NULL
          AND ${sp("phone_local")} = ${sp("$1")} AND stock_date = $3::date
          AND stock_tech_name IS NOT DISTINCT FROM $4
        ORDER BY id LIMIT 1`, [r.local, r.type, r.day, r.tech])).rows[0];
    if (!cur) {
      const ins = await pool.query(
        `INSERT INTO cable_entries (phone_local, phone_full, work_order_type, cable_quantity, created_by_name, stock_tech_name, stock_date, wo_ref, source)
         VALUES ($1, $2, $3, $4, 'شيت WFM', $5, $6::date, $7, 'sheet')
         ON CONFLICT ON CONSTRAINT cable_entries_phone_type_uniq DO NOTHING RETURNING id`,
        [r.local, r.full, r.type, String(r.qty), r.tech, r.day, r.id]);
      if (ins.rowCount) inserted++;
      else console.warn(`[sheet-cable] تعذر إضافة أمر الشغل ${r.id}: رقم الخط والنوع مستخدمان في إدخال أمر آخر`);
      continue;
    }
    if (String(cur.wo_ref ?? "") === String(r.id) && cur.entry_type !== r.type) {
      console.warn(`[sheet-cable] أمر الشغل ${r.id} له إدخال بنوع مختلف؛ لن يُنشأ صف ثانٍ`);
      continue;
    }
    // إدخال لأمر شغل تانى أقدم لنفس الرقم والنوع ⇒ مانلمسهوش
    const sameWo = String(cur.wo_ref ?? "") === String(r.id) || (
      cur.wo_ref == null && cur.pending_after_wo == null && cur.d === r.day && cur.stock_tech_name === r.tech
    );
    if (!sameWo) continue;
    if (cur.source === "sheet" && String(cur.cable_quantity) === String(r.qty) && String(cur.wo_ref) === String(r.id)) continue;
    const upd = await pool.query(
      `UPDATE cable_entries SET manual_quantity = CASE WHEN source IS DISTINCT FROM 'sheet' THEN cable_quantity ELSE manual_quantity END,
              cable_quantity = $2, source = 'sheet', wo_ref = $3, pending_after_wo = NULL,
              stock_date = COALESCE(stock_date, $4::date), stock_tech_name = COALESCE(stock_tech_name, $5), updated_at = now()
        WHERE id = $1`, [cur.id, String(r.qty), r.id, r.day, r.tech]);
    if (upd.rowCount) updated++;
  }
  return { inserted, updated };
}
