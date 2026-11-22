// زرارين فى الإعدادات (المالك ٢٠٢٦-١١-٠٤)، الاتنين مفتوحين افتراضياً:
// ١) «Real يشتغل مع إيقاف PO وبدون Real فى نفس الوقت» — لو اتقفل Real بياخد الموقع لوحده زى الأول.
// ٢) «إعادة بعد 102 و 104» — لو اتقفلت مفيش إعادة جديدة، واللى متجدولة مابتتنفّذش.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const settings = read("../client/src/components/ExecLanesSettingsButton.tsx");
const routes = read("./routes.ts");
const scryptAsync = promisify(scrypt);

test("settings: two toggles, both on by default", () => {
  assert.match(settings, /data-testid="toggle-real-parallel"/);
  assert.match(settings, /data-testid="toggle-retry-102"/);
  assert.match(settings, /setRealParallel\(data\.realParallel !== false\)/);
  assert.match(settings, /setRetry102\(data\.retry102 !== false\)/);
  assert.match(routes, /realParallel: true, retry102: true, retry102Min: RETRY_102_AFTER_MIN \};/);
  assert.match(settings, /data-testid=\{?"?retry-102-min|"retry-102-min"/);
  assert.match(routes, /SELECT 1 FROM exec_jobs WHERE type = 'measure' AND status IN \('pending', 'claimed'\) AND accounts @> \$3::jsonb\s*AND POSITION\('\$\{AUTO_MEASURE_NOREAL_MARK\}' IN COALESCE\(note, ''\)\) = 0/);
  assert.match(routes, /if \(!retry102On\) \{ await tx\.query\(`UPDATE exec_followups SET enqueued_at = now\(\) WHERE id = \$1`/);
});

test("API: Real beside stop/no-Real only while the toggle is on; 102/104 retry only while its toggle is on", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}_${Date.now()}`;
  const user = `rs-${sfx}`, pass = `pw-${sfx}`, batch = `rs-batch-${sfx}`, site = `rs-site-${sfx}`;
  const acc102 = `RS${sfx}`.slice(0, 16);
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  let parked: number[] = [];
  const cleanup = async () => {
    if (parked.length) { await pool.query(`UPDATE exec_jobs SET paused_at = NULL WHERE id = ANY($1::int[])`, [parked]); parked = []; }
    await pool.query(`DELETE FROM exec_jobs WHERE batch_id = $1`, [batch]);
    await pool.query(`DELETE FROM exec_followups WHERE account = $1`, [acc102]);
    await pool.query(`DELETE FROM case_138 WHERE account_no = $1`, [acc102]);
    await pool.query(`DELETE FROM app_settings WHERE key = ANY($1::text[])`, [["exec_lanes_real_parallel", "exec_lanes_retry_102", "exec_lanes_retry_102_min"]]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, hash]);
    const ids: Record<string, number> = {};
    const add = async (key: string, type: string, note: string | null, sec: number) => {
      const { rows } = await pool.query(
        `INSERT INTO exec_jobs (type, accounts, status, requested_by, batch_id, site, priority, queue_order, created_at, note)
         VALUES ($1, $2::jsonb, 'pending', $3, $4, $5, 2, 0, $6, $7) RETURNING id`,
        [type, JSON.stringify([`acc-${key}-${sfx}`]), user, batch, site, `2020-01-01T00:00:0${sec}Z`, note]);
      ids[key] = rows[0].id;
    };
    await add("N1", "measure", "بدون Real", 1);
    await add("R1", "measure", null, 2);
    await add("N2", "measure", "بدون Real", 3);
    parked = (await pool.query(`UPDATE exec_jobs SET paused_at = now() WHERE status = 'pending' AND paused_at IS NULL
                                  AND batch_id IS DISTINCT FROM $1 RETURNING id`, [batch])).rows.map((r: any) => r.id);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) }))
      .headers.get("set-cookie")!.split(";")[0];
    const lanes = async () => (await (await fetch(`${base}/api/exec-queue/lanes`, { headers: { cookie } })).json()) as any;
    const put = (body: object) => fetch(`${base}/api/exec-queue/lanes`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
    const claim = async () => {
      const r = await fetch(`${base}/api/exec-queue/claim`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ device: "rs-test", caps: ["stop-lanes"] }) });
      const j: any = await r.json();
      return (j && Object.keys(ids).find((k) => ids[k] === j.id)) || (j ? `other:${j.id}` : null);
    };
    const done = (k: string) => fetch(`${base}/api/exec-queue/${ids[k]}/done`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ result: "done" }) });

    let l = await lanes();
    assert.deepEqual([l.realParallel, l.retry102], [true, true], "الاتنين مفتوحين افتراضياً");
    assert.equal((await put({ realParallel: "no" })).status, 400);
    assert.equal((await put({ realParallel: false, retry102: false })).status, 200);
    l = await lanes();
    assert.deepEqual([l.realParallel, l.retry102], [false, false]);

    // مقفول: «بدون Real» شغّال ⇒ Real بيستنى، و«بدون Real» اللى بعده بيستنى Real (مابيعدّيهوش)
    assert.equal(await claim(), "N1");
    assert.equal(await claim(), null, "Real مايتفتحش جنب «بدون Real»");
    await done("N1");
    assert.equal(await claim(), "R1", "الموقع فضى ⇒ Real");
    assert.equal(await claim(), null, "Real لوحده");
    await done("R1");
    assert.equal(await claim(), "N2");

    // 102 من Real والزرار مقفول ⇒ مفيش إعادة
    const TOKEN = process.env.DZS_INGEST_TOKEN || "sf-dzs-138-ingest-2026";
    const meas = () => fetch(`${base}/api/case-138/measurements`, { method: "POST", headers: { "content-type": "application/json", "x-dzs-token": TOKEN },
      body: JSON.stringify({ items: [{ accountNo: acc102, score: "102", measureMode: "real" }] }) });
    assert.equal((await meas()).status, 200);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM exec_followups WHERE account = $1`, [acc102])).rows[0].n, 0);
    assert.equal((await put({ retry102Min: 0 })).status, 400);
    assert.equal((await put({ retry102: true, retry102Min: 7 })).status, 200);
    assert.equal((await lanes()).retry102Min, 7);
    await meas();
    const fu = (await pool.query(`SELECT EXTRACT(EPOCH FROM (run_at - created_at)) AS secs FROM exec_followups WHERE account = $1`, [acc102])).rows;
    assert.equal(fu.length, 1, "اتفتح ⇒ إعادة");
    assert.ok(Math.abs(Number(fu[0].secs) - 420) < 5, `بعد ٧ دقايق: ${fu[0].secs}`);

    // فيه قياس Real للخط مستنى فى الطابور ⇒ مفيش إعادة؛ «بدون Real» مستنى مايمنعهاش (المالك ٢٠٢٦-١١-٠٤)
    await pool.query(`DELETE FROM exec_followups WHERE account = $1`, [acc102]);
    const q = (note: string) => pool.query(
      `INSERT INTO exec_jobs (type, accounts, status, requested_by, batch_id, site, note) VALUES ('measure', $1::jsonb, 'pending', $2, $3, $4, $5) RETURNING id`,
      [JSON.stringify([acc102]), user, batch, `${site}-q`, note]);
    const noRealJob = (await q("خطوط لها أكونت — قياس بدون Real")).rows[0].id;
    await meas();
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM exec_followups WHERE account = $1`, [acc102])).rows[0].n, 1, "بدون Real مستنى ⇒ الإعادة تتعمل");
    await pool.query(`DELETE FROM exec_followups WHERE account = $1`, [acc102]);
    await pool.query(`DELETE FROM exec_jobs WHERE id = $1`, [noRealJob]);
    await q("بحث برقم التليفون");
    await meas();
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM exec_followups WHERE account = $1`, [acc102])).rows[0].n, 0, "Real مستنى ⇒ مفيش إعادة");
  } finally {
    await cleanup().catch(() => {});
    await new Promise((r) => httpServer.close(() => r(null)));
  }
});
