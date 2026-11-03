// «إعادة بعد 102 و 104» (المالك ٢٠٢٦-١١-٠٣): قياس Real طلع 102 أو 104 ⇒ بعد ٥ دقايق قياس Real تانى فى باتش جديد
// بالاسم ده، إلا لو أى حد قاس الخط فى الخمس دقايق دول. مرة واحدة بس (الإعادة اللى تطلع 102/104 تانى مابتتعادش).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";
import { retry102For, RETRY_102_MARK, RETRY_102_AFTER_MIN } from "./exec-followups";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

test("only a Real reading of 102 or 104 asks for a re-measure", () => {
  for (const s of [102, 104, "102", " 104 "]) assert.equal(retry102For("real", s), true, String(s));
  assert.equal(retry102For(undefined, 102), true, "القياس من غير نوع = Real");
  for (const s of [101, 103, 105, 100, "", null, "abc"]) assert.equal(retry102For("real", s), false, String(s));
  assert.equal(retry102For("noreal", 102), false, "بدون Real مالوش إعادة");
  assert.equal(RETRY_102_MARK, "إعادة بعد 102 و 104");
  assert.equal(RETRY_102_AFTER_MIN, 5);
});

test("runner: skips lines measured meanwhile or already queued, groups the rest into one new Real batch", () => {
  const run = routes.slice(routes.indexOf("const runExecFollowups = async"), routes.indexOf('app.post("/api/exec-queue/heartbeat"'));
  assert.match(run, /if \(f\.type === "measure" && f\.note === RETRY_102_MARK\) \{/);
  assert.match(run, /FROM case_138 WHERE account_no = \$1 AND uploaded_at > \$2 AND source = 'dzs'/);
  assert.match(run, /FROM exec_jobs WHERE type = 'measure' AND status IN \('pending', 'claimed'\) AND accounts @> \$3::jsonb/);
  assert.match(run, /retry102Batch = retry102Batch \|\| "r102"/);
  // Real: الملاحظة مافيهاش «بدون Real»
  assert.doesNotMatch(RETRY_102_MARK, /بدون Real/);
});

test("API: a Real 102/104 schedules one re-measure in 5 minutes; no-Real, other scores and repeats don't", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}${Date.now()}`.slice(-6);
  const A = { a: `R1${sfx}`, b: `R2${sfx}`, c: `R3${sfx}`, d: `R4${sfx}` };
  const accs = Object.values(A);
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM exec_followups WHERE account = ANY($1::text[])`, [accs]);
    await pool.query(`DELETE FROM case_138 WHERE account_no = ANY($1::text[])`, [accs]);
  };
  try {
    await cleanup();
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const TOKEN = process.env.DZS_INGEST_TOKEN || "sf-dzs-138-ingest-2026";
    const meas = (accountNo: string, score: string, measureMode = "real") => fetch(`${base}/api/case-138/measurements`, {
      method: "POST", headers: { "content-type": "application/json", "x-dzs-token": TOKEN },
      body: JSON.stringify({ items: [{ accountNo, score, measureMode }] }) });
    for (const [acc, sc, mode] of [[A.a, "102", "real"], [A.b, "104", "real"], [A.c, "102", "noreal"], [A.d, "101", "real"]]) {
      assert.equal((await meas(acc, sc, mode)).status, 200);
    }
    const fu = (await pool.query(
      `SELECT account, note, requested_by, EXTRACT(EPOCH FROM (run_at - created_at)) AS secs FROM exec_followups WHERE account = ANY($1::text[]) ORDER BY account`, [accs])).rows;
    assert.deepEqual(fu.map((r: any) => r.account), [A.a, A.b]);
    for (const r of fu) {
      assert.equal(r.note, RETRY_102_MARK);
      assert.equal(r.requested_by, "auto");
      assert.ok(Math.abs(Number(r.secs) - 300) < 5, String(r.secs));
    }
    // الإعادة نفسها طلعت 102 تانى ⇒ مفيش تالتة
    await meas(A.a, "102");
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM exec_followups WHERE account = $1`, [A.a])).rows[0].n, 1);
    // نفس استعلام «حد قاسه فى الخمس دقايق؟» بتاع الـrunner: القياس اللى بعد الجدولة بيتشاف
    const f = (await pool.query(`SELECT created_at FROM exec_followups WHERE account = $1`, [A.a])).rows[0];
    const seen = await pool.query(
      `SELECT 1 FROM case_138 WHERE account_no = $1 AND uploaded_at > $2 AND source = 'dzs'
       UNION ALL
       SELECT 1 FROM exec_jobs WHERE type = 'measure' AND status IN ('pending', 'claimed') AND accounts @> $3::jsonb
       LIMIT 1`, [A.a, f.created_at, JSON.stringify([A.a])]);
    assert.equal(seen.rows.length, 1, "القياس التانى (102) اتعمل بعد الجدولة ⇒ الإعادة هتتشال");
    const notSeen = await pool.query(
      `SELECT 1 FROM case_138 WHERE account_no = $1 AND uploaded_at > $2 AND source = 'dzs' LIMIT 1`, [A.b, new Date(Date.now() + 1000)]);
    assert.equal(notSeen.rows.length, 0);
  } finally {
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});
