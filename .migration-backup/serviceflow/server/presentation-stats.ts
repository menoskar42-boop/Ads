/**
 * «أرقام العرض التقديمي» (المالك ٢٠٢٦-١٠-٢٠): اجتماع رئيس القطاعات الجنوبية — كل مدير بيقدّم
 * إدارته. الأرقام دى بتتقرا من **القاعدة الحقيقية من جوّه الموقع** (شِل ريبليت بيوصل لقاعدة تانية)
 * ومتجمّعة لكل سنترال: الخطوط والكباين والبكسيات وMSAN وFTTH والأكونتات والأعطال سنة بسنة.
 *
 * قراية بس — SELECT وبس. كل قسم مستقل: لو استعلام وقع بيتكتب السبب مكانه وباقى الصفحة بتطلع.
 * الأسماء زى ما هى متسجّلة فى كل جدول (مش متحوّلة) عشان مانخمّنش ربط سنترال بسنترال.
 */
import * as XLSX from "xlsx";

type Q = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };

type Section = { title: string; note: string; cols: [string, string][]; rows: any[]; error?: string };

async function section(db: Q, title: string, note: string, cols: [string, string][], sql: string): Promise<Section> {
  try {
    const { rows } = await db.query(sql);
    return { title, note, cols, rows };
  } catch (e: any) {
    return { title, note, cols, rows: [], error: String(e?.message || e) };
  }
}

export async function presentationStats(db: Q): Promise<Section[]> {
  const out: Section[] = [];

  out.push(await section(db, "الخطوط والكباين والبكسيات (ملف الخطوط)",
    "من phone_lines: كل خط مسجّل بالكابينة والبكس. «كباين» و«بكسيات» = المختلف منهم فى الملف.",
    [["central", "السنترال"], ["lines", "خطوط"], ["cabinets", "كباين"], ["boxes", "بكسيات"]],
    `SELECT COALESCE(NULLIF(btrim(central), ''), 'غير محدد') AS central,
            COUNT(DISTINCT full_phone) AS lines,
            COUNT(DISTINCT NULLIF(btrim(cabin_number), '')) AS cabinets,
            COUNT(DISTINCT (btrim(cabin_number), btrim(box_number))) FILTER (WHERE NULLIF(btrim(box_number), '') IS NOT NULL) AS boxes
       FROM phone_lines GROUP BY 1 ORDER BY 2 DESC`));

  out.push(await section(db, "الكباين حسب النوع والسعة (ملف سعات الكباين)",
    "من cabinet_capacity: النوع (نحاس/MSAN…) والسعة الابتدائية والثانوية.",
    [["central", "السنترال"], ["type", "النوع"], ["cabinets", "كباين"], ["primary", "سعة ابتدائى"], ["secondary", "سعة ثانوى"]],
    `SELECT COALESCE(NULLIF(btrim(central_name), ''), 'غير محدد') AS central,
            COALESCE(NULLIF(btrim(cabinet_type), ''), '—') AS type,
            COUNT(*) AS cabinets, COALESCE(SUM(primary_capacity), 0) AS primary,
            COALESCE(SUM(secondary_capacity), 0) AS secondary
       FROM cabinet_capacity GROUP BY 1, 2 ORDER BY 1, 3 DESC`));

  out.push(await section(db, "بورتات MSAN (ملف البورتات)",
    "من phone_ports مربوطة بملف الخطوط عشان السنترال. «وحدات» = أكواد MSAN المختلفة.",
    [["central", "السنترال"], ["ports", "بورتات"], ["units", "وحدات MSAN"], ["firstUpload", "أقدم رفع"], ["lastUpload", "آخر رفع"]],
    `SELECT COALESCE(NULLIF(btrim(pl.central), ''), 'غير مربوط بخط') AS central,
            COUNT(*) AS ports, COUNT(DISTINCT NULLIF(btrim(pp.msan_code), '')) AS units,
            to_char(MIN(pp.uploaded_at), 'YYYY-MM-DD') AS "firstUpload", to_char(MAX(pp.uploaded_at), 'YYYY-MM-DD') AS "lastUpload"
       FROM phone_ports pp
       LEFT JOIN LATERAL (SELECT central FROM phone_lines l WHERE l.full_phone = pp.phone_number LIMIT 1) pl ON TRUE
      GROUP BY 1 ORDER BY 2 DESC`));

  out.push(await section(db, "حالات الصوت والداتا على البورتات",
    "توزيع قيم voice_status و data_status زى ما هى فى الملف — عشان نعرف أنهى قيمة = «شغّال».",
    [["voice", "حالة الصوت"], ["data", "حالة الداتا"], ["ports", "بورتات"]],
    `SELECT COALESCE(NULLIF(btrim(voice_status), ''), '—') AS voice, COALESCE(NULLIF(btrim(data_status), ''), '—') AS data, COUNT(*) AS ports
       FROM phone_ports GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15`));

  out.push(await section(db, "عملاء FTTH (ملف FTTH)",
    "من ftth_subscribers: مجموع عملاء الإنترنت (FBB) والصوت (FV) لكل سنترال.",
    [["main", "السنترال الرئيسى"], ["sub", "الفرعى"], ["units", "وحدات"], ["fbb", "عملاء FBB"], ["fv", "عملاء FV"]],
    `SELECT COALESCE(NULLIF(btrim(main_ex), ''), '—') AS main, COALESCE(NULLIF(btrim(sub_ex), ''), '—') AS sub,
            COUNT(*) AS units, COALESCE(SUM(fbb_subs), 0) AS fbb, COALESCE(SUM(fv_subs), 0) AS fv
       FROM ftth_subscribers GROUP BY 1, 2 ORDER BY 4 DESC`));

  out.push(await section(db, "خطوط ليها رقم أكونت (عملاء داتا مسجّلين)",
    "من line_accounts مربوطة بملف الخطوط.",
    [["central", "السنترال"], ["accounts", "خطوط بأكونت"]],
    `SELECT COALESCE(NULLIF(btrim(pl.central), ''), 'غير مربوط بخط') AS central, COUNT(DISTINCT la.full_phone) AS accounts
       FROM line_accounts la
       LEFT JOIN LATERAL (SELECT central FROM phone_lines l WHERE l.full_phone = la.full_phone LIMIT 1) pl ON TRUE
      WHERE NULLIF(btrim(la.account_no), '') IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC`));

  out.push(await section(db, "الأعطال سنة بسنة: التكرار والإزالة خلال ٤٨ ساعة",
    "من complaint_details. «متكرر» = نفس الرقم كان ليه شكوى فى الـ٣٠ يوم اللى قبلها. «خلال ٤٨ ساعة» من الشكاوى المقفولة.",
    [["central", "السنترال"], ["year", "السنة"], ["complaints", "شكاوى"], ["phones", "أرقام"], ["repeatPct", "تكرار %"], ["closed", "مقفولة"], ["in48Pct", "إزالة ≤ ٤٨ ساعة %"]],
    `WITH c AS (
       SELECT COALESCE(NULLIF(btrim(central_name), ''), NULLIF(btrim(exchange_name), ''), 'غير محدد') AS central,
              regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') AS phone, complain_time, close_time,
              LAG(complain_time) OVER (PARTITION BY regexp_replace(COALESCE(phone_number, ''), '\\D', '', 'g') ORDER BY complain_time) AS prev_time
         FROM complaint_details WHERE complain_time IS NOT NULL)
     SELECT central, to_char(complain_time, 'YYYY') AS year, COUNT(*) AS complaints, COUNT(DISTINCT phone) AS phones,
            ROUND(100.0 * COUNT(*) FILTER (WHERE prev_time IS NOT NULL AND complain_time - prev_time <= interval '30 days') / NULLIF(COUNT(*), 0), 1) AS "repeatPct",
            COUNT(*) FILTER (WHERE close_time IS NOT NULL) AS closed,
            ROUND(100.0 * COUNT(*) FILTER (WHERE close_time IS NOT NULL AND close_time - complain_time <= interval '48 hours')
                  / NULLIF(COUNT(*) FILTER (WHERE close_time IS NOT NULL), 0), 1) AS "in48Pct"
       FROM c GROUP BY 1, 2 ORDER BY 1, 2`));

  out.push(await section(db, "مدى بيانات الأعطال",
    "أقدم وأحدث شكوى فى الملف — الأرقام اللى فوق صح للفترة دى بس.",
    [["first", "أقدم شكوى"], ["last", "أحدث شكوى"], ["rows", "إجمالى"]],
    `SELECT to_char(MIN(complain_time), 'YYYY-MM-DD') AS first, to_char(MAX(complain_time), 'YYYY-MM-DD') AS last, COUNT(*) AS rows
       FROM complaint_details`));

  out.push(await section(db, "أنواع الشكاوى",
    "أكتر أنواع الشكاوى (صوت/داتا…) — عشان نفصل أعطال الداتا.",
    [["type", "النوع"], ["complaints", "شكاوى"]],
    `SELECT COALESCE(NULLIF(btrim(complain_type_name), ''), '—') AS type, COUNT(*) AS complaints
       FROM complaint_details GROUP BY 1 ORDER BY 2 DESC LIMIT 12`));

  return out;
}

// الأرقام من Postgres بتيجى نص (bigint/numeric) — فى الإكسيل لازم تبقى أرقام عشان تتجمع وتترسم
const num = (v: unknown) => (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : (v ?? ""));

/** نفس الأرقام ملف Excel — كل قسم فى شيت لوحده (المالك: «خليها تترفع إكسيل وأنا أبعتهالك»). */
export function presentationStatsXlsx(sections: Section[]): Buffer {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  sections.forEach((s, i) => {
    const rows = s.error ? [["تعذّر", s.error]] : [s.cols.map(([, h]) => h), ...s.rows.map((r) => s.cols.map(([k]) => num(r[k])))];
    const ws = XLSX.utils.aoa_to_sheet([[s.title], [s.note], [], ...rows]);
    ws["!views"] = [{ RTL: true }] as any;
    // اسم الشيت: ٣١ حرف بالكتير ومن غير الرموز الممنوعة، ومايتكررش
    let name = `${i + 1} ${s.title}`.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31).trim();
    while (used.has(name)) name = name.slice(0, 28) + "_" + i;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));

export function renderPresentationStats(sections: Section[]): string {
  const body = sections.map((s) => `<h2>${esc(s.title)}</h2><p class="n">${esc(s.note)}</p>${
    s.error ? `<p class="err">تعذّر: ${esc(s.error)}</p>` : `<div class="t"><table><tr>${s.cols.map(([, h]) => `<th>${esc(h)}</th>`).join("")}</tr>${
      s.rows.map((r) => `<tr>${s.cols.map(([k]) => `<td>${esc(r[k])}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${s.cols.length}">لا يوجد</td></tr>`
    }</table></div>`}`).join("");
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>أرقام العرض التقديمى</title><style>
body{font-family:system-ui,Tahoma,sans-serif;margin:16px;background:#f6f5fa;color:#1d1b2a}
h1{font-size:20px}h2{font-size:16px;margin:24px 0 4px;color:#5b2a86}p.n{color:#5d5870;font-size:13px;margin:2px 0 8px}
p.err{color:#b42318}.t{overflow-x:auto}table{border-collapse:collapse;background:#fff;font-size:13px;min-width:320px}
td,th{border:1px solid #ddd7ea;padding:4px 8px;text-align:right}th{background:#efe9f8}</style></head><body>
<h1>أرقام العرض التقديمى — من قاعدة Service Flow (قراية بس)</h1>
<p><a href="?format=xlsx" style="display:inline-block;background:#5b2a86;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">⬇ تحميل Excel</a></p>
<p class="n">اتحسبت ${esc(new Date().toISOString().slice(0, 16).replace("T", " "))} UTC. الأسماء زى ما هى فى كل ملف.</p>
${body}</body></html>`;
}
