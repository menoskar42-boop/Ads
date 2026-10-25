import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { speedDropOf, SPEED_ZERO_SCORE } from "./speed-drop";

// المالك ٢٠٢٦-١٠-٢٥: «أى خط الاسكور بتاعه ١٠١ ده معناه إن السرعة أصبحت ٠ فيدخل برده فى التقريرين»
test("score 101 = speed 0 → 100% drop, in both speed-drop reports", () => {
  assert.equal(SPEED_ZERO_SCORE, 101);
  assert.deepEqual(speedDropOf({ firstSpeed: "20000", lastSpeed: "N/A", lastScore: 101 }), { firstKbps: 20000, lastKbps: 0, dropPct: 100 });
  // الاسكور جاى نص من القاعدة أحياناً
  assert.equal(speedDropOf({ firstSpeed: "20000", lastSpeed: "", lastScore: "101" }).dropPct, 100);
  // من غير ١٠١: زى الأول — السرعة المقروءة، والمجهولة مالهاش نسبة
  assert.equal(speedDropOf({ firstSpeed: "20000", lastSpeed: "14000", lastScore: 40 }).dropPct, 30);
  assert.equal(speedDropOf({ firstSpeed: "20000", lastSpeed: "N/A", lastScore: 100 }).dropPct, null);
  assert.equal(speedDropOf({ firstSpeed: "20000", lastSpeed: "N/A", lastScore: 102 }).dropPct, null, "١٠١ بالظبط");
  // قياس المقارنة نفسه صفر (كان ١٠١ من أسبوع) ⇒ مفيش انخفاض يتحسب
  assert.equal(speedDropOf({ firstSpeed: "N/A", lastSpeed: "N/A", lastScore: 101 }).dropPct, null);

  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  for (const ep of ["/api/reports/regularized-speed-drop", "/api/reports/weekly-speed-drop"]) {
    const start = routes.indexOf(`app.get("${ep}"`);
    assert.ok(start > 0, ep);
    const body = routes.slice(start, routes.indexOf("app.get(", start + 10));
    assert.match(body, /\.\.\.speedDropOf\(r\)/, ep);
    assert.doesNotMatch(body, /speedKbps\(r\.lastSpeed\)/, `${ep}: الحساب من مكان واحد`);
  }
});
