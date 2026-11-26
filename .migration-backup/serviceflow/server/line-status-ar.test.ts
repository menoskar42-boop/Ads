// ASSIA المرحلة ٢ (المالك ٢٠٢٦-١١-١١): تقرير حالة الخط بالعربى السهل للفنى + الزرار فى بحث برقم التليفون والأعطال الحالية.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lineStatusAr, labelAr, xeltFaultDistances } from "../shared/line-status-ar";

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
  assert.equal(ar.level, "bad");
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
  assert.equal(diagnosis.note, "التشخيص مالقاش مشكلة");
  assert.equal(diagnosis.level, "ok");
  assert.equal(ar.items.some((entry) => entry.label === "التشخيص لقى"), false);
});

test("stable line with clear diagnostics and zero-fault XELT is green", () => {
  const ar = lineStatusAr({
    summary: { panels: [{ rows: [["Stability", "STABLE"]] }] },
    diagnostics: { panels: [{ rows: [["Filter dates with data", "✓2 ✗0"]] }] },
    xelt: { panels: [{ rows: [["Number of Faults", "0"], ["Fault 1", "No Fault Detected"]] }] },
  });
  assert.equal(ar.headline, "الخط كويس");
  assert.equal(ar.level, "ok");
  assert.equal(ar.items.find((entry) => entry.label === "التشخيص")?.level, "ok");
  assert.equal(ar.items.find((entry) => entry.label === "XELT")?.note, "XELT مالقاش عطل");
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

test("XELT without detected faults is OK, not a fault", () => {
  const ar = lineStatusAr({ xelt: { history: true, panels: [{ rows: [["Number of Faults", "0"], ["Fault 1", "No Fault Detected"]] }] } });
  const xelt = ar.items.find((entry) => entry.label === "XELT")!;
  assert.equal(xelt.level, "ok");
  assert.doesNotMatch(xelt.value, /عند المشترك|فى الشبكة/);
});

test("text-only XELT reports no fault as OK", () => {
  const ar = lineStatusAr({ xelt: { panels: [{ text: "No Fault Detected" }] } });
  const xelt = ar.items.find((entry) => entry.label === "XELT")!;
  assert.equal(xelt.value, "No Fault Detected");
  assert.equal(xelt.level, "ok");
});

test("text-only XELT reports detected fault terms as bad", () => {
  const ar = lineStatusAr({ xelt: { panels: [{ text: "Fault detected on the line; open circuit observed." }] } });
  const xelt = ar.items.find((entry) => entry.label === "XELT")!;
  assert.equal(xelt.level, "bad");
});

test("ordinary text-only XELT content is informational and capped at 300 characters", () => {
  const text = `Measurement complete: ${"details ".repeat(60)}`;
  const ar = lineStatusAr({ xelt: { panels: [{ text }] } });
  const xelt = ar.items.find((entry) => entry.label === "XELT")!;
  assert.equal(xelt.level, "info");
  assert.equal(xelt.value.length, 300);
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

test("XELT distance helper parses meters, kilometer conversion and associated fault metadata", () => {
  const result = xeltFaultDistances({
    xelt: { panels: [{ rows: [
      ["Number of Faults", "2"],
      ["Fault 1", "Open"],
      ["Fault #1 Distance", "350 meters"],
      ["Fault 2", "Bad Splice"],
      ["Fault 2 Distance", "0.35 km"],
      ["History Check", "1. 2026-11-21 01:09:28"],
    ] }] },
  });
  assert.deepEqual(result, {
    numberOfFaults: 2,
    faults: ["Open", "Bad Splice"],
    distances: [
      { n: 1, raw: "350 meters", meters: 350 },
      { n: 2, raw: "0.35 km", meters: 350 },
    ],
    xeltDate: "2026-11-21 01:09:28",
  });
});

test("XELT distance helper ignores N/A and returns null without a usable distance", () => {
  assert.equal(xeltFaultDistances({
    xelt: { panels: [{ rows: [["Fault 1", "Open"], ["Fault 1 Distance", "N/A"]] }] },
  }), null);
  assert.equal(xeltFaultDistances({
    xelt: { panels: [{ rows: [["Number of Faults", "1"], ["Fault 1", "Open"]] }] },
  }), null);
  const unknownUnit = xeltFaultDistances({
    xelt: { panels: [{ rows: [["Fault 1 Distance", "about 350 units"]] }] },
  });
  assert.deepEqual(unknownUnit?.distances, [{ n: 1, raw: "about 350 units", meters: null }]);
});

test("XELT distance report is wired into the protected endpoint and measurements dashboard", () => {
  const routes = read("./routes.ts");
  assert.match(routes, /app\.get\("\/api\/reports\/xelt-distances", requireAuth/);
  assert.match(routes, /DISTINCT ON \(COALESCE\(r\.account_no, r\.full_phone\)\)/);
  assert.match(routes, /xeltFaultDistances\(row\.pages\)/);
  assert.match(routes, /line_status_reports r/);
  assert.match(routes, /ROLES\.SALES_ADMIN/);
  assert.match(routes, /cabinet_technicians ct/);
  const dashboard = read("../client/src/pages/dashboard.tsx");
  assert.match(dashboard, /\{ id: "xelt-distances",\s+label: "تقارير XELT" \}/);
  assert.match(dashboard, /reportTab === "xelt-distances" && <XeltDistanceReport \/>/);
  const component = read("../client/src/components/XeltDistanceReport.tsx");
  assert.match(component, /<LineStatusButton account=\{row\.accountNo\} phone=\{row\.phone\} compact \/>/);
  assert.match(component, /handleExportExcel/);
  assert.match(component, /handleExportPDF/);
  assert.match(component, /تصدير Excel/);
  assert.match(component, /تصدير PDF/);
});
