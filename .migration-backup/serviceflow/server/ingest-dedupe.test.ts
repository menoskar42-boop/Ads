// النتيجة ماتتسجّلش مرتين (server/ingest-dedupe.ts): السكربتات بتعيد إرسال النتيجة بنفس الرقم
// (?sf_eid=…) لو الرد ضاع أو التاب اتقفل — والسيرفر لازم يسجّلها مرة واحدة بس.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { ingestDedupe } from "./ingest-dedupe";

/** جدول sf_ingest_events فى الذاكرة — بيفهم الجمل الأربعة اللى الـmiddleware بيبعتها بس. */
function fakeDb() {
  const rows = new Map<string, { status: string; at: number }>();
  let fail = false;
  const query = async (text: string, params: any[] = []) => {
    if (fail) throw new Error("db down");
    const [eid] = params;
    if (/ON CONFLICT \(event_id\) DO NOTHING/.test(text)) {
      if (rows.has(eid)) return { rows: [] };
      rows.set(eid, { status: "processing", at: clock }); return { rows: [{ event_id: eid }] };
    }
    if (/^SELECT status/.test(text.trim())) { const r = rows.get(eid); return { rows: r ? [{ status: r.status, at: r.at }] : [] }; }
    if (/DO UPDATE SET status = 'processing'/.test(text)) { rows.set(eid, { status: "processing", at: clock }); return { rows: [] }; }
    if (/SET status = 'done'/.test(text)) { const r = rows.get(eid); if (r) r.status = "done"; return { rows: [] }; }
    if (/^DELETE FROM sf_ingest_events WHERE event_id/.test(text.trim())) { rows.delete(eid); return { rows: [] }; }
    return { rows: [] };   // التنضيف الدورى
  };
  let clock = 1_000_000;
  return { rows, query, setFail: (v: boolean) => { fail = v; }, tick: (ms: number) => { clock += ms; }, now: () => clock };
}

function call(mw: any, eid: string | null, method = "POST") {
  return new Promise<{ passed: boolean; status?: number; body?: any; headers: Record<string, string>; res: any }>((resolve) => {
    const res: any = new EventEmitter();
    const headers: Record<string, string> = {};
    res.statusCode = 200;
    res.setHeader = (k: string, v: string) => { headers[k.toLowerCase()] = v; };
    res.status = (s: number) => { res.statusCode = s; return res; };
    res.json = (body: any) => resolve({ passed: false, status: res.statusCode, body, headers, res });
    const req: any = { method, path: "/api/case-138/measurements", query: eid ? { sf_eid: eid } : {} };
    mw(req, res, () => resolve({ passed: true, headers, res }));
  });
}
const finish = async (res: any, status: number) => { res.statusCode = status; res.emit("finish"); await new Promise((r) => setImmediate(r)); };

test("first delivery passes; a resend after it was saved is answered without running again", async () => {
  const db = fakeDb(); const mw = ingestDedupe(db.query, db.now);
  const a = await call(mw, "abc123xyz");
  assert.equal(a.passed, true, "أول مرة ⇒ للمسار");
  await finish(a.res, 200);
  assert.equal(db.rows.get("abc123xyz")?.status, "done");
  const b = await call(mw, "abc123xyz");
  assert.equal(b.passed, false, "تانى مرة ⇒ المسار مايشتغلش");
  assert.equal(b.status, 200);
  assert.deepEqual(b.body, { ok: true, duplicate: true });
  assert.equal(b.headers["access-control-allow-origin"], "*", "من غير CORS سكربت الصفحة هيفتكرها فشلت ويعيدها للأبد");
});

test("resend while the first is still being saved → 425 (kept, retried later); a stale one is taken over", async () => {
  const db = fakeDb(); const mw = ingestDedupe(db.query, db.now);
  const a = await call(mw, "inflight1");
  assert.equal(a.passed, true);
  const b = await call(mw, "inflight1");
  assert.equal(b.status, 425);
  db.tick(11 * 60 * 1000);   // الأولى ماتت فى النص
  const c = await call(mw, "inflight1");
  assert.equal(c.passed, true, "بعد ١٠ دقايق المحاولة الجديدة تاخد مكانها");
});

test("a failed save frees the number so the next try runs; DB trouble never blocks a result", async () => {
  const db = fakeDb(); const mw = ingestDedupe(db.query, db.now);
  const a = await call(mw, "fail01");
  await finish(a.res, 500);
  assert.equal(db.rows.has("fail01"), false);
  assert.equal((await call(mw, "fail01")).passed, true);
  db.setFail(true);
  assert.equal((await call(mw, "dbdown1")).passed, true, "جدول الأرقام واقع ⇒ النتيجة تعدّى عادى");
});

test("only POST /api with a valid number is touched", async () => {
  const db = fakeDb(); const mw = ingestDedupe(db.query, db.now);
  assert.equal((await call(mw, null)).passed, true);
  assert.equal((await call(mw, "abc123xyz", "GET")).passed, true);
  assert.equal((await call(mw, "bad id!")).passed, true);
  assert.equal(db.rows.size, 0);
});
