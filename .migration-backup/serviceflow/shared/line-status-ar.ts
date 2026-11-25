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
type Page = { ok?: boolean; error?: string; panels?: Panel[]; history?: boolean | null; performed?: string };
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

/** نتيجة «Perform XELT» اللى السكربت بعتها (DZS ≥10.41.0) */
export const XELT_PERFORMED_AR: Record<string, string> = {
  done: "اتعمل والنتيجة اتقرت",
  had_history: "كان فيه بيانات قديمة خلاص (ماتضغطش)",
  no_button: "مالقيناش زرار Perform XELT فى الشاشة",
  timeout: "اتضغط بس النتيجة ماظهرتش فى ٨ دقايق",
  error: "حصل خطأ وقت الاختبار",
};

/** القاموس: الكلمة بالإنجليزى (من غير حالة حروف) ⇒ عربى سهل. البحث بالجملة كلها الأول، وبعدين بأول كلمة مطابقة. */
const DICT: [RegExp, string][] = [
  [/^CPE Serial Number$/i, "رقم الراوتر (Serial)"],
  [/^Serial Number$/i, "رقم الراوتر (Serial)"],
  [/^CPE Vendor ID$/i, "الشركة المصنعة للراوتر"],
  [/^Vendor ID$/i, "الشركة المصنعة للراوتر"],
  [/^CPE Firmware Version(?: Number)?$/i, "إصدار برنامج الراوتر"],
  [/^Firmware Version(?: Number)?$/i, "إصدار برنامج الراوتر"],
  [/^CPE Interoperability Issue$/i, "توافق الراوتر"],
  [/^CPE\b/i, "معلومات الراوتر"],
  [/^Vendor Information$/i, "معلومات الشركة المصنّعة"],
  [/^(vendor id|vendor name|manufacturer)$/i, "الشركة المصنّعة"],
  [/^(other info|hardware version|software version|firmware version|product class|model name|mac address)$/i, "معلومات الجهاز"],
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

const SUBSCRIBER_LOCATION = "عند المشترك (الراوتر أو السلك جوّه البيت)";
const NETWORK_LOCATION = "فى الشبكة (كابل/بكس/وصلات)";

function diagnosticLocation(label: string, value: string): { location: string; note: string } {
  const evidence = `${label} ${value}`;
  if (/cpe|modem|in.?home|inside wiring|customer|interoperability/i.test(evidence)) {
    return { location: SUBSCRIBER_LOCATION, note: "راجع الراوتر وتوصيلاته والسلك داخل البيت." };
  }
  if (/splice|joint|contact|bridged tap|open|cut|short|ground|earth|leak|noise|crosstalk|rfi|attenuation|unbalanced|dsl.?am|loop|cable|pair/i.test(evidence)) {
    return { location: NETWORK_LOCATION, note: "اكشف على الكابل والبكس والوصلات، وراجع المسافة المسجلة." };
  }
  return { location: "مكان العطل محتاج تحديد", note: "راجع تفاصيل التشخيص وحدد مكان العطل قبل الإصلاح." };
}

function isDiagnosticMetadata(label: string, panelTitle: string): boolean {
  const ar = labelAr(label);
  return /vendor information/i.test(panelTitle)
    || ar === "التاريخ"
    || (/^CPE\b/i.test(label) && !/^CPE Interoperability Issue$/i.test(label))
    || /date|time|filter|history|serial number|vendor id|firmware version|collection date/i.test(label)
    || /^(other info|manufacturer|vendor name)$/i.test(label);
}

function diagnosticFindings(page: Page | undefined): { text: string; note: string }[] {
  const out: { text: string; note: string }[] = [];
  for (const panel of page?.panels || []) for (const row of panel.rows || []) {
    if (!Array.isArray(row) || !norm(row[0]) || isDiagnosticMetadata(norm(row[0]), norm(panel.title || ""))) continue;
    const label = norm(row[0]);
    if (/^stability$/i.test(label)) continue;
    const cells = row.slice(1).map(norm).filter(Boolean);
    const value = cells.join(" ");
    let detected = false;
    if (/^CPE Interoperability Issue$/i.test(label)) {
      detected = /detected/i.test(value) && !/not detected/i.test(value);
    } else {
      const match = value.match(/✓\s*(\d+)/);
      detected = !!match && Number(match[1]) > 0;
    }
    if (!detected) continue;
    const place = diagnosticLocation(label, value);
    const translated = labelAr(label);
    const labelText = translated === label ? label : `${translated} (${label})`;
    out.push({ text: `${place.location}: ${labelText}`, note: place.note });
  }
  return out;
}

function xeltStructuredSummary(page: Page): { value: string; note: string; level: Level } | null {
  const panels = page.panels || [];
  const rows = panels.flatMap((panel) => panel.rows || []).filter((row) => Array.isArray(row) && norm(row[0]));
  const valueFor = (re: RegExp) => {
    for (const row of rows) {
      if (!re.test(norm(row[0]))) continue;
      const value = norm(row.slice(1).find((cell) => norm(cell) && !/^n\/?a$/i.test(norm(cell))) || "");
      if (value) return value;
    }
    return "";
  };
  const numberRaw = valueFor(/^Number of Faults$/i);
  const numberOfFaults = num(numberRaw);
  const lineType = valueFor(/^Line Type$/i);
  const analysisType = valueFor(/^Analysis Type$/i);
  const firstFaultValue = (row: Row) => norm(row.slice(1).find((cell) => norm(cell) && !/^n\/?a$/i.test(norm(cell)) && !/no fault detected/i.test(norm(cell))) || "");
  const faults = rows
    .filter((row) => /^Fault\s+\d+$/i.test(norm(row[0])))
    .map(firstFaultValue)
    .filter(Boolean);
  const distances = rows
    .filter((row) => /^Fault\s+#?\d+\s+Distance$/i.test(norm(row[0])))
    .map((row) => ({ label: norm(row[0]), value: norm(row.slice(1).find((cell) => norm(cell)) || "") }))
    .filter((item) => item.value && !/^n\/?a$/i.test(item.value));
  const history = valueFor(/^History Check$/i);
  const date = history.match(/\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/);
  if (!numberRaw && !lineType && !analysisType && !faults.length && !distances.length && !date) return null;

  const detected = (numberOfFaults != null && numberOfFaults > 0) || faults.length > 0;
  const faultText = faults.map((fault) => {
    const translated = labelAr(fault);
    return translated === fault ? fault : `${translated} (${fault})`;
  }).join(" · ");
  const place = detected ? diagnosticLocation(faultText || "XELT fault", faultText) : null;
  const parts = [
    numberRaw && `عدد الأعطال: ${numberRaw}`,
    lineType && `نوع الخط: ${lineType}`,
    !lineType && analysisType && `نوع التحليل: ${analysisType}`,
    faults.length && `العطل: ${faultText}`,
    distances.length && `المسافة: ${distances.map((item) => `عند العطل ${item.label.match(/\d+/)?.[0] || ""}: ${item.value.replace(/meters?/i, "متر")}`).join(" · ")}`,
    date && `آخر XELT: ${date[0]}`,
  ].filter(Boolean);
  return {
    value: [place?.location, ...parts].filter(Boolean).join(" · "),
    note: place?.note || "مافيش عطل ظاهر فى XELT؛ راجع باقى نتائج الخط.",
    level: detected ? "bad" : "warn",
  };
}

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
  // ٦) التشخيص: نستبعد صفوف التاريخ والفلاتر ومعلومات الراوتر، ونلخّص الأعطال الفعلية بمكانها.
  const findings = diagnosticFindings(dg);
  if (dg && (dg.panels || []).length) {
    items.push(findings.length
      ? { label: "التشخيص لقى", value: findings.map((finding) => finding.text).join(" · "), note: [...new Set(findings.map((finding) => finding.note))].join(" · "), level: "bad" }
      : { label: "التشخيص", value: "مفيش مشكلة تشخيصية واضحة", note: "راجع القراءات لو العطل لسه قائم.", level: "warn" });
  }
  // ٧) XELT
  const x = pages.xelt;
  if (x) {
    const perf = XELT_PERFORMED_AR[String(x.performed || "")];
    if (perf) items.push({ label: "Perform XELT", value: perf, level: x.performed === "done" || x.performed === "had_history" ? "ok" : "warn" });
    if (x.history === false) items.push({ label: "XELT", value: "مفيش بيانات قديمة للخط", note: "محتاج Perform XELT (بيتعمل لوحده للأعطال الجديدة)", level: "info" });
    else {
      const summary = xeltStructuredSummary(x);
      if (summary) items.push({ label: "XELT", ...summary });
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
