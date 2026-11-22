// شهادة تقدير الفنى (المالك ٢٠٢٦-١١-٠٥): نفس نص النموذج + الشهر والمركز وتاريخ التحرير صح، والاسم متأمّن.
import assert from "node:assert/strict";
import test from "node:test";
import { certificateHtml, defaultIssued, issuedLabel, rankLabel } from "../client/src/lib/tech-certificate";

test("tech certificate: template text, month, rank, issue date, one page per tech", () => {
  assert.equal(defaultIssued("2026-07"), "2026-08-01", "يوليو ⇒ تحريراً ١ أغسطس زى النموذج");
  assert.equal(defaultIssued("2026-12"), "2027-01-01");
  assert.equal(issuedLabel("2026-08-01"), "1 أغسطس 2026");
  assert.equal(rankLabel(1), "الأول");
  assert.equal(rankLabel(2), "الثاني");
  const html = certificateHtml(
    [{ name: "محمد عبد المجيد محمد رشدى", rank: 1 }, { name: "حسن <b>عبد الفتاح</b>", rank: 2 }],
    { month: "2026-07", logoUrl: "https://x/we-logo.png" });
  assert.equal(html.match(/class="cert"/g)?.length, 2, "كل فنى صفحة");
  assert.match(html, /<strong>المركز الأول<\/strong>/);
  assert.match(html, /<strong>المركز الثاني<\/strong>/);
  assert.match(html, /شهر <strong>يوليو 2026<\/strong>/);
  assert.match(html, /تحريراً في 1 أغسطس 2026/);
  assert.match(html, /تتشرف إدارة تشغيل الشبكة وعمليات العملاء بالغنايم بمنح هذه الشهادة إلى/);
  assert.match(html, /رئيس قسم الشئون الخارجية بالغنايم/);
  assert.match(html, /مدير تشغيل الشبكة وعمليات العملاء لسنترال الغنايم/);
  assert.ok(html.includes("حسن &lt;b&gt;عبد الفتاح&lt;/b&gt;") && !html.includes("<b>عبد"), "الاسم مايتحقنش HTML");
  assert.match(html, /@page \{ size: 11in 8\.5in; margin: 0; \}/, "Letter بالعرض زى النموذج");
});
