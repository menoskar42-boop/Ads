// ============================================================================
// server/box-full-inspection.ts
// «بوكس مليان» → طلب مراجعة بيانات البكس على موقع الصيانة.
//
// لما الفنى يرد «بوكس مليان» — من متعذرات OM أو من قسم الطلبات — بنبعت البكس
// لموقع الصيانة عشان:
//   • لو فيه فحص **غير مكتمل** للبكس → يتضاف عليه بند «مراجعة بيانات البكس».
//   • لو مافيش → يتفتح فحص جديد كل بنوده بملاحظات، وفنى الصيانة بيخلّصه بالطريقة
//     المعتادة.
//   • وبنبعت معاه أرقام التليفونات اللى على البكس من بيان التليفونات (لو موجودة)،
//     وفنى الصيانة بيعدّلها/يحذف منها ويضيف عليها.
//   • «تم الفتح بواسطة» = «اسم الفنى-OM» أو «اسم الفنى-طلبات» حسب جهة الفتح —
//     نفس اصطلاح تكت «بوكس معطل» (box-fault-ticket.ts).
//
// الفشل هنا **مايمنعش** تسجيل رد الفنى أبداً — بنرجّع النتيجة وبس.
// ============================================================================
import { pool } from "./db";

const MAINT_BASE = process.env.MAINTENANCE_API_BASE
  || `http://127.0.0.1:${process.env.PORT || 5000}/maintenance`;
// نفس التوكن الافتراضى الموجود فى routes/integration.js بتاع موقع الصيانة
const INTEGRATION_TOKEN = process.env.INTEGRATION_TOKEN || "sf-integration-2026-GHNAT-overlap-Qz7m";

export interface BoxFullInput {
  central: string;
  cabinet: string;
  box: string;
  techName: string;
  source: "OM" | "طلبات";
  /** مرجع للتتبّع: «طلب #123» أو «متعذر 456» */
  refKey?: string;
}

export type BoxFullResult =
  | { ok: true; inspectionId: number; created: boolean; phonesSent: number }
  | { ok: false; reason: string };

// ── توحيد القيم جوّه SQL — نفس منطق shared/cab-norm.ts بالظبط ────────────────
// الباج اللى الحتة دى اتعملت بسببه: المطابقة كانت **حرفية** (btrim = btrim)، والمتعذرات
// بتكتب الكابينة بشرطة مايلة («2/6») وبيان التليفونات بشرطة عادية («2-6») — فنص
// البكسيات كانت بترجع **صفر أرقام**، وفنى الصيانة يستلم فحص من غير أى رقم يراجعه.
// (اتأكد فعلياً: «كابينة 4-6» رجّعت 6 أرقام و«كابينة 2/6» رجّعت 0 فى نفس التشغيلة.)
// sf_ar_norm بتتكفّل بالأرقام العربية وتوحيد الحروف (ة/ه، ى/ي) وحالة الأحرف.
const centralN = (e: string) =>
  `btrim(regexp_replace(regexp_replace(sf_ar_norm(COALESCE(${e}::text, '')), '\\s*-\\s*', '-', 'g'), '\\s+', ' ', 'g'))`;
const cabN = (e: string) =>
  `btrim(regexp_replace(regexp_replace(regexp_replace(sf_ar_norm(COALESCE(${e}::text, '')), '[\\\\/_‐‑‒–—―]', '-', 'g'), '\\s*-\\s*', '-', 'g'), '\\s+', ' ', 'g'))`;
// رقم البكس = الأرقام بس بدون أصفار بادئة («05» = «5») — نفس normBox
const boxN = (e: string) => `(
  CASE WHEN regexp_replace(sf_ar_norm(COALESCE(${e}::text, '')), '[^0-9]', '', 'g') = '' THEN ''
       WHEN ltrim(regexp_replace(sf_ar_norm(COALESCE(${e}::text, '')), '[^0-9]', '', 'g'), '0') = '' THEN '0'
       ELSE ltrim(regexp_replace(sf_ar_norm(COALESCE(${e}::text, '')), '[^0-9]', '', 'g'), '0') END)`;

/**
 * أرقام التليفونات اللى على البكس من **بيان التليفونات** — نفس المصدر اللى كل
 * التقارير بتقرا منه (وبيشمل تصحيحات البيان لأنها بتتكتب فيه).
 * بنرجّع الرقم الكامل مع الترمنال كملاحظة عشان تساعد فنى الصيانة.
 * المطابقة **موحّدة** (سنترال/كابينة/بكس) زى باقى النظام — شوف التعليق فوق.
 */
export async function boxPhones(central: string, cabinet: string, box: string):
  Promise<{ phone: string; notes: string }[]> {
  const { rows } = await pool.query(
    `SELECT COALESCE(pl.full_phone, '88' || pl.tel_no) AS phone,
            COALESCE(NULLIF(btrim(pl.dp_terminal), ''), '') AS terminal
       FROM phone_lines pl
      WHERE ${centralN("pl.central")} = ${centralN("$1")}
        AND ${cabN("pl.cabin_number")} = ${cabN("$2")}
        AND ${boxN("pl.box_number")} = ${boxN("$3")}
        AND ${boxN("$3")} <> ''
      ORDER BY NULLIF(regexp_replace(COALESCE(pl.dp_terminal, ''), '\\D', '', 'g'), '')::int
               NULLS LAST, pl.tel_no
      LIMIT 500`,
    [central, cabinet, box]);
  return rows.map((r: any) => ({
    phone: String(r.phone || "").trim(),
    notes: r.terminal ? `ترمنال ${r.terminal}` : "",
  })).filter((r) => r.phone);
}

/** بيبعت طلب مراجعة بيانات البكس لموقع الصيانة (ومعاه أرقام البكس). */
export async function requestBoxDataReview(input: BoxFullInput): Promise<BoxFullResult> {
  const central = String(input.central || "").trim();
  const cabinet = String(input.cabinet || "").trim();
  const box     = String(input.box || "").trim();
  if (!central || !cabinet || !box) return { ok: false, reason: "بيانات البكس ناقصة" };

  let phones: { phone: string; notes: string }[] = [];
  try { phones = await boxPhones(central, cabinet, box); } catch { /* الأرقام إضافية */ }

  const openedBy = `${String(input.techName || "").trim() || "غير معروف"}-${input.source}`;
  try {
    const res = await fetch(`${MAINT_BASE}/api/integration/box-data-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Integration-Token": INTEGRATION_TOKEN },
      body: JSON.stringify({
        central, cabinet, box, openedBy, origin: input.source,
        originRef: input.refKey || null, phones,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const why = await res.text().catch(() => "");
      return { ok: false, reason: `موقع الصيانة رجّع ${res.status}: ${why.slice(0, 160)}` };
    }
    const j: any = await res.json();
    return { ok: true, inspectionId: j?.inspectionId, created: !!j?.created, phonesSent: phones.length };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "تعذّر الاتصال بموقع الصيانة" };
  }
}

// ── «رد التكرار» (قرار المالك ٢٠٢٦-١٠-٠٤) ────────────────────────────────────
// رقم البكس فى موقع الصيانة (بيتعمل لو مش موجود، بنفس مطابقة موقع الصيانة الموحّدة)
// عشان زرار «افحص البكس» يفتح فورم الفحص على البكس الصح. مابيفتحش فحص.
export async function ensureMaintBox(central: string, cabinet: string, box: string):
  Promise<{ ok: true; boxId: number } | { ok: false; reason: string }> {
  if (!central.trim() || !cabinet.trim() || !box.trim()) return { ok: false, reason: "بيانات البكس ناقصة" };
  try {
    const res = await fetch(`${MAINT_BASE}/api/integration/ensure-box`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Integration-Token": INTEGRATION_TOKEN },
      body: JSON.stringify({ central: central.trim(), cabinet: cabinet.trim(), box: box.trim() }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, reason: `موقع الصيانة رجّع ${res.status}` };
    const j: any = await res.json();
    const boxId = Number(j?.boxId);
    return Number.isInteger(boxId) && boxId > 0 ? { ok: true, boxId } : { ok: false, reason: "رد غير متوقع من موقع الصيانة" };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "تعذّر الاتصال بموقع الصيانة" };
  }
}

export interface BoxInspectionInfo {
  boxId: number | null;
  inspection: { id: number; date: string; by: string | null; badItems: number } | null;
}

// آخر فحص **حقيقى** للبكس (فاحص فتحه — مش اللى اتفتح أوتوماتيك لمراجعة البيانات)،
// والمطابقة موحّدة زى boxPhones. البكس اللى رقمه نصّه بالظبط بيتفضّل لو فيه أكتر من واحد.
export async function latestBoxInspection(central: string, cabinet: string, box: string): Promise<BoxInspectionInfo> {
  try {
    const { rows } = await pool.query(
      `SELECT b.id AS "boxId", i.id, to_char(i.date, 'YYYY-MM-DD') AS date,
              NULLIF(btrim(COALESCE(NULLIF(u.full_name, ''), u.username, '')), '') AS by,
              (SELECT count(*) FROM maintenance.inspection_items ii
                WHERE ii.inspection_id = i.id AND ii.value IN ('bad', 'yes'))::int AS "badItems"
         FROM maintenance.boxes b
         JOIN maintenance.cabinets cb ON cb.id = b.cabinet_id
         JOIN maintenance.exchanges e ON e.id = cb.exchange_id
         LEFT JOIN LATERAL (
           SELECT * FROM maintenance.inspections i
            WHERE i.box_id = b.id AND COALESCE(i.is_archived, 0) = 0 AND COALESCE(i.auto_created, 0) = 0
            ORDER BY i.date DESC NULLS LAST, i.id DESC LIMIT 1
         ) i ON true
         LEFT JOIN maintenance.users u ON u.id = i.inspector_id
        WHERE ${centralN("e.name")} = ${centralN("$1")}
          AND ${cabN("cb.number")} = ${cabN("$2")}
          AND ${boxN("b.number")} = ${boxN("$3")} AND ${boxN("$3")} <> ''
        ORDER BY (btrim(b.number) = btrim($3)) DESC, (i.id IS NOT NULL) DESC, b.id
        LIMIT 1`,
      [central, cabinet, box]);
    const r = rows[0];
    if (!r) return { boxId: null, inspection: null };
    return {
      boxId: Number(r.boxId),
      inspection: r.id ? { id: Number(r.id), date: r.date, by: r.by ?? null, badItems: Number(r.badItems) || 0 } : null,
    };
  } catch {
    return { boxId: null, inspection: null };   // موقع الصيانة مش مركّب
  }
}
