// المالك ٢٠٢٦-١١-٠٨: «اليوم السبت ٧-١١ السنكسار فاضى ليه»
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { localSynaxarium } from "./orthodox-service";
import { getKatamerosPlan } from "./katameros-local";

test("Saturday 7 Nov 2026 = 28 Babah, and our own data has its Synaxarium titles", () => {
  const { coptic } = getKatamerosPlan("2026-11-07");
  assert.deepEqual([coptic.month, coptic.day], [2, 28]);
  const s = localSynaxarium(coptic.month, coptic.day);
  assert.equal(s.source, "local");
  assert.ok(s.entries.length >= 1);
  assert.match(s.entries[0].title, /مركيانوس ومركوريوس/);
});

test("every Coptic day has at least one local Synaxarium title (fallback never empty)", () => {
  for (let m = 1; m <= 13; m++) for (let d = 1; d <= (m === 13 ? 5 : 30); d++) {
    assert.ok(localSynaxarium(m, d).entries.length >= 1, `${m}-${d}`);
  }
});

test("the route falls back to local data and computes 'today' in Cairo time, with a short cache", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /synaxariumWithFallback\(month, day\)/);
  assert.match(routes, /todaySynaxariumCairo\(\)/);
  assert.match(routes, /max-age=600/);
});
