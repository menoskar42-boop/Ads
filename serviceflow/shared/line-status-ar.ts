// تقرير «حالة الخط (ASSIA)» بالعربى السهل للفنى (المالك ٢٠٢٦-١١-١١: «التوصيف عاوزه بالعامية المصرية أو بالعربية سهلة
// الفهم … اللى هيشوفه فنى مايعرفش إنجليزى»). بياخد الصفحات اللى سكربت القياس قراها (server/line-status.ts) ويطلّع:
//   • خلاصة: جمل قصيرة ملوّنة (كويس / خلّى بالك / مشكلة) — الثبات، المسافة، الهامش، التوهين، السرعة، التشخيص، XELT.
//   • جداول كل صفحة زى ما هى، واللابل مترجم جنبه الأصل (لو مش فى القاموس بيفضل الإنجليزى).
// دالة صافية (من غير قاعدة ولا React) — بتتختبر فى server/line-status-ar.test.ts.

export type Level = "ok" | "warn" | "bad" | "info";
export interface SummaryItem { label: string; value: string; note?: string; level: Level }
export interface ArTable { page: string; title: string; rows: { label: string; original: string; values: string[] }[]; text?: string }
export interface LineStatusAr { headline: string; level: Level; items: SummaryItem[]; tables: ArTable[] }

type Row = string[];
type Panel = { title?: string; rows?: Row[]; text?: string };
type Page = { ok?: boolean; error?: string; panels?: Panel[]; history?: boolean | null };
type Pages = Record<string, Page | undefined>;

export const PAGE_AR: Record<string, string> = {
  summary: "ملخّص الخط (Line Summary)",
  operational: "البيانات التشغيلية (Operational Data)",
  counters: "عدّادات الأداء (Performance Counters)",
  diagnostics: "التشخيص (Diagnostic Analysis)",
  recommendation: "توصية الخدمة (Service Recommendation)",
  xelt: "اختبار الخط من غير مشترك (XELT)",
  attributes: "سجل القيم (Attributes/Counters)",
};

/** القاموس: الكلمة بالإنجليزى (من غير حالة حروف) ⇒ عربى سهل. البحث بالجملة كلها الأول، وبعدين بأول كلمة مطابقة. */
const DICT: [RegExp, string][] = [
  [/^collection date/i, "تاريخ القراءة"],
  [/^stability/i, "ثبات الخط"],
  [/^estimated loop length/i, "طول الخط التقريبى (من السنترال)"],
  [/^loop length/i, "طول الخط"],
  [/^line ?id/i, "رقم الخط"],
  [/^profile|service profile/i, "البروفايل (السرعة المتعاقد عليها)"],
  [/^(margin|snr margin|noise margin)/i, "هامش الإشارة (كل ما يقل الخط يضعف)"],
  [/attenuation/i, "التوهين (ضعف الإشارة من طول/حالة السلك)"],
  [/attainable|max(imum)? rate/i, "أقصى سرعة الخط يقدر عليها"],
  [/actual rate|current rate|net data rate|^rate/i, "السرعة الحالية"],
  [/output power|tx power|transmit power/i, "قوة الإرسال"],
  [/^upstream/i, "الرفع (Upload)"],
  [/^downstream/i, "التنزيل (Download)"],
  [/retrain|line init|initialization|resync/i, "مرات فصل وتوصيل الخط"],
  [/^ses|severely errored/i, "ثوانى فيها أخطاء كتير"],
  [/^es$|errored seconds/i, "ثوانى فيها أخطاء"],
  [/^uas|unavailable seconds/i, "ثوانى الخط كان فيها فاصل"],
  [/^cv|crc|code violation/i, "أخطاء البيانات (CRC)"],
  [/^fec/i, "أخطاء اتصلّحت لوحدها (FEC)"],
  [/high power noise/i, "شوشرة قوية على الخط"],
  [/impulse noise|rein|shine/i, "شوشرة متقطعة (كهربا/موتور قريب)"],
  [/crosstalk|xtalk/i, "تداخل من خطوط جنبه فى نفس الكابل"],
  [/radio|rfi|am interference/i, "تداخل راديو"],
  [/bridged tap/i, "فرع زيادة على الخط (Bridged Tap)"],
  [/bad splice|bad joint|bad contact|high resistance/i, "لحام أو وصلة سيئة"],
  [/open|cut/i, "قطع فى الخط"],
  [/short/i, "قصر (Short) فى الخط"],
  [/ground|earth|leak/i, "تسريب للأرض (رطوبة/مية)"],
  [/low margin/i, "هامش قليل"],
  [/high attenuation/i, "توهين عالى"],
  [/unbalanced|imbalance/i, "عدم اتزان فى الزوج"],
  [/modem|cpe|in.?home|inside wiring/i, "مشكلة عند المشترك (الراوتر أو السلك جوّه البيت)"],
  [/recommend/i, "التوصية"],
  [/status/i, "الحالة"],
  [/date|time/i, "التاريخ"],
];
export function labelAr(en: string): string {
  const s = String(en || "").replace(/\s+/g, " ").trim().replace(/[:：]+$/, "");
  for (const [re, ar] of DICT) if (re.test(s)) return ar;
  return s;
}

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const num = (s: unknown): number | null => { const m = String(s ?? "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
function find(page: Page | undefined, re: RegExp): Row | null {
  for (const p of page?.panels || []) for (const r of p.rows || []) if (Array.isArray(r) && re.test(norm(r[0]))) return r;
  return null;
}
function findAll(page: Page | undefined, re: RegExp): Row[] {
  const out: Row[] = [];
  for (const p of page?.panels || []) for (const r of p.rows || []) if (Array.isArray(r) && re.test(norm(r[0]))) out.push(r);
  return out;
}
const firstVal = (r: Row | null) => (r ? norm(r.slice(1).find((c) => norm(c)) ?? "") : "");

export function lineStatusAr(pages: Pages): LineStatusAr {
  const items: SummaryItem[] = [];
  const sum = pages.summary, op = pages.operational, dg = pages.diagnostics;

  // ١) الثبات
  const stab = firstVal(find(sum, /^stability/i)) || firstVal(find(dg, /^stability/i));
  if (stab) {
    const s = stab.toUpperCase();
    if (/VERY UNSTABLE/.test(s)) items.push({ label: "ثبات الخط", value: "مش ثابت خالص", note: "الخط بيفصل أو بيقع كتير — محتاج كشف على السلك والوصلات", level: "bad" });
    else if (/UNSTABLE/.test(s)) items.push({ label: "ثبات الخط", value: "مش ثابت", note: "فيه فصل أو تذبذب — راجع الوصلات والبكس", level: "warn" });
    else if (/STABLE/.test(s)) items.push({ label: "ثبات الخط", value: "ثابت", level: "ok" });
    else items.push({ label: "ثبات الخط", value: stab, level: "info" });
  }
  // ٢) المسافة
  const loop = firstVal(find(sum, /^estimated loop length/i));
  if (loop) items.push({ label: "طول الخط التقريبى", value: loop.replace(/meters?/i, "متر"), level: "info" });
  // ٣) الهامش (التنزيل أول قيمة، الرفع التانية — زى ما بيظهروا فى الجدول)
  const margins = findAll(op, /^(snr )?margin/i).map((r) => num(firstVal(r))).filter((x): x is number => x != null);
  if (margins.length) {
    const low = Math.min(...margins);
    items.push({
      label: "هامش الإشارة", value: margins.map((m) => `${m} dB`).join(" / "),
      note: low < 3 ? "قليل جداً — الخط ممكن يفصل أى وقت" : low < 6 ? "قليل — الخط ضعيف" : "كويس",
      level: low < 3 ? "bad" : low < 6 ? "warn" : "ok",
    });
  }
  // ٤) التوهين
  const att = findAll(op, /attenuation/i).map((r) => num(firstVal(r))).filter((x): x is number => x != null);
  if (att.length) {
    const hi = Math.max(...att);
    items.push({ label: "التوهين", value: att.map((a) => `${a} dB`).join(" / "),
      note: hi > 50 ? "عالى — الخط طويل أو فيه مشكلة فى السلك" : hi > 35 ? "متوسط" : "كويس", level: hi > 50 ? "bad" : hi > 35 ? "warn" : "ok" });
  }
  // ٥) السرعة
  const rate = firstVal(find(op, /actual rate|current rate|net data rate/i)), att2 = firstVal(find(op, /attainable|max(imum)? rate/i));
  if (rate || att2) items.push({ label: "السرعة", value: [rate && `الحالية ${rate}`, att2 && `أقصى ممكن ${att2}`].filter(Boolean).join(" · "), level: "info" });
  // ٦) التشخيص: أى علامة فيها ✓ (اتلقت) — بالاسم العربى
  const flags: string[] = [];
  for (const p of dg?.panels || []) for (const r of p.rows || []) {
    if (!Array.isArray(r) || !r[0] || /stability/i.test(r[0])) continue;
    const cells = r.slice(1).join(" ");
    const hit = cells.match(/✓\s*(\d+)/);
    if (hit && Number(hit[1]) > 0) flags.push(labelAr(r[0]) + (labelAr(r[0]) === norm(r[0]) ? "" : ` (${norm(r[0])})`));
  }
  if (dg && (dg.panels || []).length) {
    items.push(flags.length
      ? { label: "التشخيص لقى", value: flags.join(" · "), level: "warn" }
      : { label: "التشخيص", value: "مفيش مشاكل ظاهرة", level: "ok" });
  }
  // ٧) XELT
  const x = pages.xelt;
  if (x) {
    if (x.history === false) items.push({ label: "XELT", value: "مفيش بيانات قديمة للخط", note: "محتاج Perform XELT (بيتعمل لوحده فى المهام العاجلة)", level: "info" });
    else {
      const t = norm((x.panels || []).map((p) => p.text || "").join(" "));
      if (t) items.push({ label: "XELT", value: t.slice(0, 300), level: "info" });
    }
  }
  // ٨) التوصية
  const rec = norm((pages.recommendation?.panels || []).map((p) => [p.text || "", ...(p.rows || []).map((r) => r.join(" "))].join(" ")).join(" "));
  if (rec) items.push({ label: "توصية السيستم", value: rec.slice(0, 400), level: "info" });

  // صفحات ماتقرتش
  for (const [k, p] of Object.entries(pages)) if (p && p.ok === false) items.push({ label: PAGE_AR[k] || k, value: "ماتقرتش", note: p.error || "", level: "info" });

  const level: Level = items.some((i) => i.level === "bad") ? "bad" : items.some((i) => i.level === "warn") ? "warn" : items.length ? "ok" : "info";
  const headline = level === "bad" ? "الخط فيه مشكلة واضحة" : level === "warn" ? "الخط محتاج متابعة" : level === "ok" ? "الخط كويس" : "مفيش قراءات كفاية";

  const tables: ArTable[] = [];
  for (const k of Object.keys(PAGE_AR)) {
    const p = pages[k];
    if (!p) continue;
    for (const pn of p.panels || []) {
      const rows = (pn.rows || []).filter((r) => Array.isArray(r) && norm(r[0])).map((r) => ({ label: labelAr(r[0]), original: norm(r[0]), values: r.slice(1).map(norm) }));
      if (rows.length || pn.text) tables.push({ page: PAGE_AR[k], title: norm(pn.title) ? `${labelAr(norm(pn.title))}${labelAr(norm(pn.title)) === norm(pn.title) ? "" : ` (${norm(pn.title)})`}` : "", rows, text: pn.text ? norm(pn.text) : undefined });
    }
  }
  return { headline, level, items, tables };
}
