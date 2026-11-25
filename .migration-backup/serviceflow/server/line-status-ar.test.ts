// ASSIA المرحلة ٢ (المالك ٢٠٢٦-١١-١١): تقرير حالة الخط بالعربى السهل للفنى + الزرار فى بحث برقم التليفون والأعطال الحالية.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lineStatusAr, labelAr } from "../shared/line-status-ar";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("plain Arabic summary: stability, loop, margin, diagnostics, XELT", () => {
  const ar = lineStatusAr({
    summary: { ok: true, panels: [{ rows: [["Stability", "VERY UNSTABLE"], ["Estimated Loop Length", "655 meters"]] }] },
    operational: { ok: true, panels: [{ rows: [["Margin (dB)", "8.1"], ["Margin (dB)", "2.4"], ["Attenuation (dB)", "55.5"]] }] },
    diagnostics: { ok: true, panels: [{ rows: [["High Power Noise", "✓1 ✗1"], ["Bridged Tap", "✓0 ✗2"]] }] },
    xelt: { ok: true, panels: [{ text: "Historical SELT data not available" }], history: false },
    counters: { ok: false, error: "ماقدرتش أفتح الصفحة" },
  });
  assert.equal(ar.level, "bad");
  assert.equal(ar.headline, "الخط فيه مشكلة واضحة");
  const by = (l: string) => ar.items.find((i) => i.label === l)!;
  assert.equal(by("ثبات الخط").value, "مش ثابت خالص");
  assert.equal(by("طول الخط التقريبى").value, "655 متر");
  assert.equal(by("هامش الإشارة").level, "bad");          // 2.4 dB
  assert.equal(by("التوهين").level, "bad");               // 55.5 dB
  assert.match(by("التشخيص لقى").value, /شوشرة قوية/);
  assert.doesNotMatch(by("التشخيص لقى").value, /Bridged/); // ✓0 = مااتلقاش
  assert.match(by("XELT").note!, /Perform XELT/);
  assert.ok(ar.items.some((i) => i.value === "ماتقرتش"));
  assert.ok(ar.tables.length >= 3);
  assert.equal(labelAr("Stability:"), "ثبات الخط");
  assert.equal(labelAr("Something New"), "Something New"); // مش فى القاموس ⇒ زى ما هو
});

test("stable line with good margin reads «الخط كويس»", () => {
  const ar = lineStatusAr({ summary: { panels: [{ rows: [["Stability", "Stable"]] }] }, operational: { panels: [{ rows: [["Margin (dB)", "12"]] }] } });
  assert.equal(ar.level, "ok");
  assert.equal(ar.headline, "الخط كويس");
});

test("real-shaped diagnostic CPE issue is a customer-side fault and metadata rows are excluded", () => {
  const ar = lineStatusAr({
    diagnostics: { panels: [
      { title: "Diagnostics Analysis", rows: [["CPE Interoperability Issue", "DetectedVDSL 35VDSL 35b support Issue"]] },
      { title: "Diagnostics Analysis Control", rows: [["Filter dates with data", "✓2 ✗0"], ["Collection Date", "2026-11-24"]] },
      { title: "Diagnostics Analysis Flags", rows: [["Date", "✓1"], ["History Check", "✓1"], ["CPE Vendor ID", "✓1"], ["High Power Noise", "✓1 ✗0"]] },
      { title: "Vendor Information", rows: [["CPE Serial Number", "SANITIZED"], ["CPE Vendor ID", "SANITIZED"], ["CPE Firmware Version Number", "SANITIZED"], ["Other Info", "SANITIZED"]] },
    ] },
  });
  const item = ar.items.find((entry) => entry.label === "التشخيص لقى")!;
  assert.equal(item.level, "bad");
  assert.match(item.value, /عند المشترك \(الراوتر أو السلك جوّه البيت\)/);
  assert.match(item.value, /فى الشبكة \(كابل\/بكس\/وصلات\)/);
  assert.match(item.note!, /راجع الراوتر/);
  assert.doesNotMatch(item.value, /التاريخ|Filter dates|History|Serial|Vendor|Firmware|Other Info/);
  assert.equal(labelAr("CPE Serial Number"), "رقم الراوتر (Serial)");
  assert.equal(labelAr("CPE Vendor ID"), "الشركة المصنعة للراوتر");
  assert.equal(labelAr("CPE Firmware Version Number"), "إصدار برنامج الراوتر");
  assert.equal(labelAr("Vendor Information"), "معلومات الشركة المصنّعة");
});

test("date, filter and history rows alone never become diagnostic faults", () => {
  const ar = lineStatusAr({
    diagnostics: { panels: [
      { title: "Diagnostics Analysis Control", rows: [["Filter dates with data", "✓2 ✗0"], ["Collection Date", "2026-11-24"]] },
      { title: "Diagnostics Analysis Flags", rows: [["Date", "✓1"], ["Show history", "✓1"]] },
    ] },
  });
  const diagnosis = ar.items.find((entry) => entry.label === "التشخيص")!;
  assert.equal(diagnosis.value, "مفيش مشكلة تشخيصية واضحة");
  assert.equal(ar.items.some((entry) => entry.label === "التشخيص لقى"), false);
});

test("XELT is summarized from structured rows with fault type, distance and last date", () => {
  const ar = lineStatusAr({
    xelt: { history: true, panels: [
      { title: "XELT Analysis", rows: [["History Check", "1. 2026-11-21 01:09:28"], ["Analysis Type", "MELT + DSLAM"], ["Number of Faults", "1"], ["Fault 1", "Bad Splice or End of Loop (severe)"]] },
      { title: "XELT Comparison", rows: [["Line Type", "VDSL"], ["Fault #1 Distance", "1082 meters"], ["Number of Faults", "1"]] },
    ] },
  });
  const xelt = ar.items.find((entry) => entry.label === "XELT")!;
  assert.equal(xelt.level, "bad");
  assert.match(xelt.value, /فى الشبكة \(كابل\/بكس\/وصلات\)/);
  assert.match(xelt.value, /عدد الأعطال: 1/);
  assert.match(xelt.value, /نوع الخط: VDSL/);
  assert.match(xelt.value, /لحام أو وصلة سيئة \(Bad Splice or End of Loop/);
  assert.match(xelt.value, /عند العطل 1: 1082 متر/);
  assert.match(xelt.value, /2026-11-21 01:09:28/);
  assert.match(xelt.note!, /اكشف على الكابل/);
});

test("XELT without detected faults is a warning, not a fault", () => {
  const ar = lineStatusAr({ xelt: { history: true, panels: [{ rows: [["Number of Faults", "0"], ["Fault 1", "No Fault Detected"]] }] } });
  const xelt = ar.items.find((entry) => entry.label === "XELT")!;
  assert.equal(xelt.level, "warn");
  assert.doesNotMatch(xelt.value, /عند المشترك|فى الشبكة/);
});

test("wired: latest endpoint (not for sales) + button in phone lookup and current faults", () => {
  const routes = read("./routes.ts");
  assert.match(routes, /app\.get\("\/api\/line-status\/latest", requireAuth/);
  assert.match(routes, /ROLES\.SALES \|\| req\.user\?\.role === ROLES\.SALES_ADMIN\) return res\.status\(403\)/);
  assert.match(read("../client/src/components/PhoneLookupReport.tsx"), /<LineStatusButton account=\{line\.accountNo\}/);
  assert.match(read("../client/src/components/CurrentFaultsReport.tsx"), /<LineStatusButton account=\{f\.accountNo\} phone=\{f\.phoneShort\} compact \/>/);
  const btn = read("../client/src/components/LineStatusButton.tsx");
  assert.match(btn, /آخر مرة اتسحب التقرير/);
  assert.match(btn, /noReal: true, loop: true/);   // نفس «تحديث حالة الخط (ASSIA)» — من غير Real ولا Perform XELT
});
