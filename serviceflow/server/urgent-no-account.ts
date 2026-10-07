// «أرقام بدون أكونت عاجل» — المصادر الإضافية (قرار المالك ٢٠٢٦-١٠-٠٦):
//
//  ١) current  — أى خط فى الأعطال الحالية (ticket_dsl_current المفتوحة، سنترالات غنايم)
//                حالته 160 أو 173 ومالوش أكونت.
//  ٢) score103 — كل خطوط تقرير «اسكور 103»: ليها أكونت بس آخر قياس رجع 103 — يعنى
//                الأكونت غالباً غلط. الأكونت القديم بيظهر وقدامه تعديل وزرار حذف الأكونت.
//                نفس خطوط تقرير «اسكور 103» بالظبط (مفيش استبعاد زيادة).
//  ٣) newInstall — تركيب جديد من تقرير أوامر الشغل (work_orders) عدّى على إنشائه
//                يومين **مش أقل**، ولسه مالوش أكونت. فترة التقرير (من/إلى) على تاريخ الإنشاء.
//
// «بدون أكونت» = مفيش صف فى line_accounts، والمُعلَّم يدوياً (lines_no_account) مستبعد —
// نفس قاعدة باقى المصادر عشان زرار «ليس له رقم أكونت» يخفى الصف.
import type { Express } from "express";
import type { Pool } from "pg";
import { phoneNormSql as sp } from "./phone-norm";

const LINE_COLS = `pl.tel_no AS "telNo", pl.central, pl.cabin_number AS "cabinNumber",
       pl.box_number AS "boxNumber", pl.idu_no AS "iduNo", pl.odu_no AS "oduNo", pl.dp_terminal AS "dpTerminal"`;

const notMarked = (full: string) =>
  `NOT EXISTS (SELECT 1 FROM lines_no_account na WHERE na.full_phone = ${full})`;
const noAccount = (full: string) =>
  `NOT EXISTS (SELECT 1 FROM line_accounts la WHERE la.full_phone = ${full})`;

export const CURRENT_160_173_SQL = `
  SELECT DISTINCT ON (k.full_phone)
         k.full_phone AS "fullPhone", ${LINE_COLS},
         t.ticket_id AS "ticketNumber",
         COALESCE(NULLIF(t.status_code, ''), t.complain_type_name) AS "faultType"
    FROM ticket_dsl_current t
    LEFT JOIN LATERAL (
      SELECT * FROM phone_lines p WHERE p.tel_no = ${sp("t.phone_number")} ORDER BY p.id LIMIT 1
    ) pl ON true
    CROSS JOIN LATERAL (SELECT COALESCE(pl.full_phone, '88' || ${sp("t.phone_number")}) AS full_phone) k
   WHERE t.close_date IS NULL
     AND t.central_name ILIKE '%غنايم%'
     AND (t.status_code ~ '^(160|173)' OR t.complain_type_name ~ '^(160|173)')
     AND ${sp("t.phone_number")} <> ''
     AND ${noAccount("k.full_phone")}
     AND ${notMarked("k.full_phone")}
   ORDER BY k.full_phone, t.complaint_time DESC NULLS LAST`;

export const SCORE_103_SQL = `
  SELECT la.full_phone AS "fullPhone", ${LINE_COLS},
         la.account_no AS "oldAccount",
         'اسكور ' || c138p.score AS "faultType"
    FROM line_accounts la
    JOIN LATERAL (
      SELECT c.score, c.uploaded_at FROM case_138 c
       WHERE c.full_phone = la.full_phone ORDER BY c.id DESC LIMIT 1
    ) c138p ON true
    LEFT JOIN phone_lines pl ON pl.full_phone = la.full_phone
   WHERE c138p.score = 103
     AND la.account_no IS NOT NULL AND la.account_no <> ''
     -- ⚠️ المالك (٢٠٢٦-١٠-٠٧): «بدون أكونت عاجل» لازم يبقى ≥ تقرير «اسكور 103». كان فيه
     -- استبعاد للخط اللى أكونته اتعدّل بعد آخر قياس — فالتقريرين اختلفوا (١١٥ مقابل أقل).
     -- دلوقتى نفس شرط تقرير «اسكور 103» بالظبط: الخط بيخرج من الاتنين مع بعض لما يتقاس
     -- تانى ويطلع اسكور غير 103، أو لما الأكونت يتمسح.
  `;

export const NEW_INSTALL_SQL = `
  SELECT DISTINCT ON (k.full_phone)
         k.full_phone AS "fullPhone", ${LINE_COLS},
         w.work_order_id::text AS "ticketNumber",
         'تركيب جديد ' || to_char(COALESCE(w.creation_date, w.close_date) AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD') AS "faultType"
    FROM work_orders w
    CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(w.phone_number, ''), '\\D', '', 'g') AS full_phone) k
    LEFT JOIN phone_lines pl ON pl.full_phone = k.full_phone
   WHERE btrim(w.service_type) = 'تركيب جديد'
     AND (w.close_category IS NULL OR w.close_category = 'Success')
     AND k.full_phone ~ '^88[0-9]{7}$'
     -- عدّى يومين على الإنشاء — مش قبل كده (الأكونت بياخد وقت لحد ما يتسجّل)
     AND COALESCE(w.creation_date, w.close_date) <= now() - interval '2 days'
     AND (COALESCE(w.creation_date, w.close_date) AT TIME ZONE 'Africa/Cairo')::date BETWEEN $1::date AND $2::date
     AND ${noAccount("k.full_phone")}
     AND ${notMarked("k.full_phone")}
   ORDER BY k.full_phone, COALESCE(w.creation_date, w.close_date) DESC`;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function registerUrgentNoAccount(app: Express, deps: { pool: Pool; requireAuth: any }) {
  const { pool, requireAuth } = deps;

  app.get("/api/reports/urgent-no-account-extra", requireAuth, async (req, res) => {
    const q = req.query as Record<string, string>;
    const today = new Date().toISOString().slice(0, 10);
    const from = ISO_DATE.test(q.dateFrom || "") ? q.dateFrom : `${new Date().getFullYear() - 1}-01-01`;
    const to = ISO_DATE.test(q.dateTo || "") ? q.dateTo : today;
    try {
      const [current, score103, newInstalls] = await Promise.all([
        pool.query(CURRENT_160_173_SQL),
        pool.query(SCORE_103_SQL),
        pool.query(NEW_INSTALL_SQL, [from, to]),
      ]);
      res.json({ current: current.rows, score103: score103.rows, newInstalls: newInstalls.rows });
    } catch (err: any) {
      console.error("urgent-no-account-extra failed:", err?.message);
      res.status(500).json({ message: "تعذّر تحميل المصادر الإضافية لتقرير بدون أكونت عاجل" });
    }
  });
}
