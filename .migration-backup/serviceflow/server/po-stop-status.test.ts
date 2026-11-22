// المالك ٢٠٢٦-١١-٠٣: خطوط In Nightly PO كانت بتاخد «+إعادة» ومابتتوقّفش، والإيقاف باليد بيشتغل عادى.
// السبب: نص «Real-time PO» فى أى حتة فى الصفحة كان بيدخّل السكربت فى «استنى الـReal-time» ⇒ Nightly ⇒ ريفريش ⇒
// نفس الكلام تانى، لحد المهلة من غير إيقاف. وأول خانة اسمها «Status» مش لازم تكون حالة الـPO.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");
const fn = (name: string) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i > 0, name);
  let depth = 0, j = src.indexOf("{", i);
  for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}" && --depth === 0) break; }
  return src.slice(i, j + 1);
};

test("PO status: first known value next to «PO Status»/«Status», not the first «Status» cell", async () => {
  const { chromium } = await import("playwright");
  // بيئة كلود فيها كروميوم جاهز فى /opt/pw-browsers (نسخة playwright هنا مش بتلاقيه لوحدها)
  const browser = await chromium.launch(existsSync("/opt/pw-browsers/chromium") ? { executablePath: "/opt/pw-browsers/chromium" } : {});
  try {
    const page = await browser.newPage();
    await page.setContent(`<body>
      <table><tr><th>Date</th><th>Status</th><th>Start Time</th></tr><tr><td>2026-10-25</td><td>Completed under Real-time PO</td><td>09:06</td></tr></table>
      <table><tr><td>Status</td><td>In Nightly PO</td></tr></table>
      <div>Choose Action</div></body>`);
    const RE = src.match(/const RE_KNOWN_STATUS = (\/[^\n]+\/i);/)![1];
    const status = await page.evaluate(`(() => { ${fn("findValueByLabel")}\n${fn("findValuesByLabel")}\nconst RE_KNOWN_STATUS = ${RE};\n${fn("findPoStatus")}\nreturn findPoStatus(); })()`);
    // الخانة الأولى «Status» فى جدول التاريخ قيمتها «Start Time» — كانت هى اللى بتتقرا
    assert.equal(status, "In Nightly PO");
  } finally { await browser.close(); }
});

test("stop mode trusts the status: page text «Real-time PO» waits once per line, then stops", () => {
  assert.match(src, /const status = findPoStatus\(\);/);
  assert.match(src, /const stKnown = MODE === "stop" && \(\/not\\s\*started\/i\.test\(status\) \|\| \(\/nightly\/i\.test\(status\) && rtWaited\(\)\)\);/);
  assert.match(src, /if \(RE_RT\.test\(status\) \|\| \(!stKnown && RE_RT\.test\(txt\(\)\)\)\)/);
  assert.match(src, /if \(\/nightly\/i\.test\(status\)\) \{ markRtWaited\(\); reloadPoPage\(/);
  assert.match(src, /sessionStorage\.removeItem\(RT_WAITED_KEY\)/, "بيتمسح مع الرقم اللى بعده");
  assert.match(src, /@version {6}0\.9\.(2[3-9]|[3-9]\d)/);
});
