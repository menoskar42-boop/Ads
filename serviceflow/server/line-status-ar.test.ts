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
