import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// المالك ٢٠٢٦-١٠-٠٧: النت قطع، والحارس عمل ريفريش لصفحة جهاز التنفيذ والنت لسه قاطع، فنزلت
// على «can't reach this page» ومفيش كود يرجّعها. أى ريفريش تلقائى لازم يستنى السيرفر يرد.
const ex = readFileSync(new URL("../client/src/components/ExecutorButton.tsx", import.meta.url), "utf8");
const q = readFileSync(new URL("../client/src/lib/exec-queue.ts", import.meta.url), "utf8");

test("the executor never reloads blindly — every auto-reload waits for /api/health", () => {
  const code = ex.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert.doesNotMatch(code, /window\.location\.reload\(\)/);
  assert.equal(code.match(/reloadWhenReachable\(/g)?.length, 5);
  assert.match(q, /const r = await fetch\(`\/api\/health\?t=\$\{Date\.now\(\)\}`, \{ cache: "no-store"/);
  assert.match(q, /if \(navigator\.onLine !== false && await serverReachable\(\)\) \{\s*try \{ window\.location\.reload\(\); \} catch \{\}/);
});
