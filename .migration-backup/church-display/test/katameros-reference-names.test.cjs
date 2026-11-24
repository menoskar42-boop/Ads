const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const appDir = path.join(__dirname, "..", "app");
require(path.join(appDir, "data", "katameros-data.js"));
const engine = require(path.join(appDir, "katameros-engine.js"));

test("numbered books use their full Arabic MyBible names in references", () => {
  const cases = [
    [9, "صموئيل الأول"], [10, "صموئيل الثاني"],
    [11, "الملوك الأول"], [12, "الملوك الثاني"],
    [13, "أخبار الأيام الأول"], [14, "أخبار الأيام الثاني"],
    [46, "كورنثوس الأولى"], [47, "كورنثوس الثانية"],
    [52, "تسالونيكي الأولى"], [53, "تسالونيكي الثانية"],
    [54, "تيموثاوس الأولى"], [55, "تيموثاوس الثانية"],
    [60, "بطرس الأولى"], [61, "بطرس الثانية"],
    [62, "يوحنا الأولى"], [63, "يوحنا الثانية"], [64, "يوحنا الثالثة"],
    [70, "المكابيين الأول"],
  ];

  for (const [bookId, fullName] of cases) {
    assert.match(engine.formatReference(`${bookId}.1:1`), new RegExp(`^${fullName} `));
  }
  assert.equal(engine.formatReference("60.4:12-19"), "بطرس الأولى ٤: ١٢-١٩");
});
