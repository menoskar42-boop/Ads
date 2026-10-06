import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// «بدون Real» واقف على 10.42.187.101:8081/expresse/login-page?sessionExpired=true
// («can't reach this page») — المالك ٢٠٢٦-١٠-٠٦. Edge بيمسح اسم التاب مع النقلة للأصل
// التانى، فـ window.open(url, الاسم) كان بيفتح تاب جديد والقديم يفضل معلّق.
const ex = readFileSync(new URL("../client/src/components/ExecutorButton.tsx", import.meta.url), "utf8");
const q = readFileSync(new URL("../client/src/lib/exec-queue.ts", import.meta.url), "utf8");

test("the one-minute refresh navigates the same stuck tab by reference, not by tab name", () => {
  const block = ex.slice(ex.indexOf("if (noReal && !reopened"), ex.indexOf("if (noReal && !reopened") + 2200);
  assert.match(block, /win\.location\.href = "about:blank";/);
  assert.match(block, /win\.location\.href = measureBatchUrl\(accs, \{ fixRecent, noReal, lane \}\); moved = true;/);
  // لو المرجع مابقاش صالح: نقفل القديم الأول وبعدين نفتح
  assert.match(block, /if \(!moved\) \{\s*closeWin\(\);\s*win = executeBatch\("measure"[^\n]*\n\s*if \(!win\) \{ setPopupBlocked\(true\); return POPUP_BLOCKED; \}/);
  assert.match(q, /export function measureBatchUrl\(/);
  assert.match(q, /return window\.open\(measureBatchUrl\(accs, opts\), measureTabName/);
});
