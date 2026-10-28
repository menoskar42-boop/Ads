import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { waitForDatabase } from "./boot-wait";

// المالك ٢٠٢٦-١٠-٢٥: Oracle ماردّش كام دقيقة ⇒ الموقع وقع ومارجعش غير بنشر جديد
test("boot waits for the database instead of crashing, gives up after maxMs", async () => {
  let calls = 0;
  const logs: string[] = [];
  const quiet = { log: (m: string) => logs.push(m), sleep: async () => {} };
  // بتفشل ٣ مرات وبعدين تردّ ⇒ الإقلاع بيكمّل
  const n = await waitForDatabase(async () => { if (++calls < 4) throw new Error("Connection terminated due to connection timeout"); }, quiet);
  assert.equal(n, 4);
  assert.equal(logs.length, 4);
  assert.match(logs[3], /ردّت بعد 4 محاولة/);
  // ماردّتش خالص ⇒ آخر خطأ بيترمى (BOOT FAILED زى الأول) بعد المهلة
  let t = 0;
  const realNow = Date.now;
  Date.now = () => t;
  try {
    await assert.rejects(
      waitForDatabase(async () => { throw new Error("down"); }, { ...quiet, maxMs: 60_000, everyMs: 10_000, sleep: async (ms: number) => { t += ms; } }),
      /down/,
    );
  } finally { Date.now = realNow; }
  // بيتنادى قبل أى استعلام تانى وقت الإقلاع
  const idx = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.ok(idx.indexOf("waitForDatabase(() => pool") > 0 && idx.indexOf("waitForDatabase(() => pool") < idx.indexOf("checkDbIdentity(pool)"));
});
