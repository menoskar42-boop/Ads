import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// قياس Real من «بحث برقم التليفون» = «A recent fix (past 24h)»، وباقى التقارير «No fix».
// المالك ٢٠٢٦-١٠-٠٨: كان بيضغط No fix — المصدر ماكانش بيتبعت مع المهمة.
const lookup = readFileSync(new URL("../client/src/components/PhoneLookupReport.tsx", import.meta.url), "utf8");
const executor = readFileSync(new URL("../client/src/components/ExecutorButton.tsx", import.meta.url), "utf8");
const queue = readFileSync(new URL("../client/src/lib/exec-queue.ts", import.meta.url), "utf8");

test("the Real measure from phone lookup carries its source explicitly, so the executor picks «recent fix»", () => {
  const fn = lookup.slice(lookup.indexOf("const measureDZS = async"), lookup.indexOf("const measureNoReal = async"));
  assert.match(fn, /enqueueIfExecutorActive\("measure", \[acc\], PHONE_LOOKUP_SOURCE\)/);
  // التشغيل المحلى كمان
  assert.match(fn, /buildDZSUrl\(\[acc\]\) \+ "&sf_fix=recent"/);
  // جهاز التنفيذ بيقرّر من الـ note
  assert.match(executor, /const fixRecent = String\(note \|\| ""\)\.includes\(PHONE_LOOKUP_SOURCE\)/);
  assert.match(queue, /return opts\?\.fixRecent \? "&sf_fix=recent" : "";/);
});
