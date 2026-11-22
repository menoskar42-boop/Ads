import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readDateFrom } from "./read-date";

// ٢٠٢٦-١٠-٠٧: قراءات درس مار مرقس وقت ما القاعدة واقعة — تتحفظ على الموبايل بوقتها
// وتتسجّل بيومها الحقيقى لما الخدمة ترجع.

const NOW = Date.parse("2026-10-20T12:00:00Z");

test("the server takes the reading's real day — only within the last month, never the future", () => {
  assert.deepEqual(readDateFrom("2026-10-08T19:30:00Z", NOW).date, "2026-10-08");
  assert.equal(readDateFrom("2026-10-08T19:30:00Z", NOW).late, true);
  assert.equal(readDateFrom("2026-10-20T09:00:00Z", NOW).late, false);
  // مستقبل / أقدم من ٣١ يوم / مش تاريخ / مفيش ⇒ النهارده زى الأول
  for (const bad of ["2026-10-21T12:00:00Z", "2026-09-01T00:00:00Z", "مش تاريخ", undefined, 12345]) {
    const r = readDateFrom(bad as any, NOW);
    assert.equal(r.date, "2026-10-20", String(bad));
    assert.equal(r.late, false);
  }
});

test("both reading endpoints use the real day, and a late replay never moves an earlier completion", () => {
  const g = readFileSync(new URL("./group-routes.ts", import.meta.url), "utf8");
  const reading = g.slice(g.indexOf("app.post('/api/groups/:code/reading'"), g.indexOf("app.put('/api/groups/:code/auto-reading'"));
  assert.match(reading, /const date = readDateFrom\(req\.body\.readAt\)\.date;/);
  const assign = g.slice(g.indexOf("app.post('/api/groups/:code/assignments/:assignmentId/read'"), g.indexOf("admin-report'"));
  assert.match(assign, /const rd = readDateFrom\(req\.body\.readAt\);/);
  assert.doesNotMatch(assign, /new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/);
  assert.match(assign, /completed_date = CASE WHEN \$6::boolean AND completed THEN completed_date ELSE \$4 END/);
  assert.match(assign, /true,\$10::timestamptz,\$10::timestamptz,\$9,NOW\(\)/);
});

test("phone queue: server down ⇒ saved with its time; back up ⇒ sent and removed; bad ⇒ dropped", async () => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  let status = 500;
  const sent: any[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    const body = JSON.parse(init.body);
    if (status === 0) throw new TypeError("network");
    if (status < 300) sent.push({ url, body });
    return { ok: status < 300, status, json: async () => (status < 300 ? { log: {} } : { error: "x" }) };
  };
  const { postReading, flushReadingQueue, pendingReadings } = await import("../client/src/lib/reading-queue");

  const r1 = await postReading("/api/groups/MARK/reading", { userName: "مينا", book: "مرقس", chapter: 1, timeSpent: 90 });
  assert.equal(r1.queued, true, "٥٠٠ ⇒ اتحفظت (قبل كده كانت بتضيع)");
  status = 0;
  const r2 = await postReading("/api/groups/MARK/reading", { userName: "مينا", book: "مرقس", chapter: 2, timeSpent: 80 });
  assert.equal(r2.queued, true, "نت قاطع ⇒ اتحفظت");
  await postReading("/api/groups/MARK/reading", { userName: "مينا", book: "مرقس", chapter: 2, timeSpent: 80 });
  assert.equal(pendingReadings(), 2, "نفس الإصحاح فى نفس اليوم مايتكرّرش");

  status = 503;
  assert.deepEqual(await flushReadingQueue(), { sent: 0, left: 2 }, "لسه واقف ⇒ مفيش حاجة تتمسح");

  status = 200;
  assert.deepEqual(await flushReadingQueue(), { sent: 2, left: 0 });
  assert.equal(sent.length, 2);
  assert.ok(sent.every((x) => typeof x.body.readAt === "string" && x.body.readAt.length >= 20), "كل قراءة بوقتها الحقيقى");
  assert.deepEqual(sent.map((x) => x.body.chapter), [1, 2], "بالترتيب");

  status = 500;
  await postReading("/api/groups/MARK/reading", { userName: "مينا", book: "مرقس", chapter: 3, timeSpent: 70 });
  status = 404;   // المجموعة اتمسحت مثلاً ⇒ مانفضلش نحاول للأبد
  assert.deepEqual(await flushReadingQueue(), { sent: 0, left: 0 });
});
