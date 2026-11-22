// المرحلة التانية للجسر (المالك ٢٠٢٦-١٠-٣٠: «خلّى باقى الباتشات المؤجّلة على جهاز تنفيذ تمبر منكى») على Postgres حقيقى:
// إيقاف PO المؤجّل (أولوية ٠) بيروح للجسر بس — جهاز التنفيذ بياخد العاجل —، والجسر بيعرف إنه خلص من line_po_events،
// ولو اتقفل من غير ما يتسجّل السيرفر بيجدول إعادة بعد ١٠ دقايق (زى /done بتاع جهاز التنفيذ). «+قياس» بيفضل لجهاز التنفيذ.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";

const scryptAsync = promisify(scrypt);

test("bridge phase two: deferred PO stop goes to the bridge, finishes from line_po_events, retries when not recorded", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const suffix = `${process.pid}_${Date.now()}`;
  const user = `bridge-stop-${suffix}`, pass = `pw-${suffix}`, batch = `bridge-stop-batch-${suffix}`;
  const accs = [`91${Date.now() % 1e7}`, `92${Date.now() % 1e7}`, `93${Date.now() % 1e7}`, `94${Date.now() % 1e7}`];
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  let base = "";
  const cleanup = async () => {
    await pool.query(`DELETE FROM exec_followups WHERE account = ANY($1::text[])`, [accs]);
    await pool.query(`DELETE FROM line_po_events WHERE account_no = ANY($1::text[])`, [accs]);
    await pool.query(`DELETE FROM exec_jobs WHERE batch_id = $1`, [batch]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
    await pool.query(`DELETE FROM app_settings WHERE key = 'exec_lanes_bridge'`);
  };
  const post = async (path: string, headers: Record<string, string>, body: Record<string, unknown> = {}) => {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(r.status, 200, `${path}: ${r.status}`);
    return await r.json() as any;
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = await scryptAsync(pass, salt, 64) as Buffer;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, `${hash.toString("hex")}.${salt}`]);
    await pool.query(`INSERT INTO app_settings (key, value, updated_at) VALUES ('exec_lanes_bridge', '1', now())
                      ON CONFLICT (key) DO UPDATE SET value = '1', updated_at = now()`);
    const ins = async (acc: string, priority: number, note: string) => {
      const { rows } = await pool.query(
        `INSERT INTO exec_jobs (type, accounts, status, requested_by, batch_id, site, priority, note, created_at)
         VALUES ('stop', $1::jsonb, 'pending', $2, $3, '10.42.187.101', $4, $5, now() - interval '1 hour') RETURNING id`,
        [JSON.stringify([acc]), user, batch, priority, note]);
      return Number(rows[0].id);
    };
    const daily1 = await ins(accs[0], 0, "تحتاج إيقاف PO (تشغيل يومى ٩ ص)");
    const daily2 = await ins(accs[1], 0, "تحتاج إيقاف PO (تشغيل يومى ٩ ص)");
    const urgent = await ins(accs[2], 2, "تحتاج إيقاف PO");
    const chain = await ins(accs[3], 0, "تحتاج إيقاف PO +قياس");

    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const addr = httpServer.address(); assert.ok(addr && typeof addr !== "string");
    base = `http://127.0.0.1:${addr.port}`;
    const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) });
    assert.equal(login.status, 200);
    const cookie = { cookie: login.headers.get("set-cookie")!.split(";")[0] };
    const bridge = { "x-bridge-token": (await post("/api/exec-queue/bridge/token", cookie)).token };

    // جسر قديم (≤2.0.0، مابيقولش stops) مايخدش إيقاف — كان بيفتحه صفحة قياس ويقول خلص (المالك ٢٠٢٦-١١-٠٤)
    const old = await post("/api/exec-queue/bridge/lease", bridge, { device: "PC-old" });
    assert.deepEqual(old.jobs, [], "الجسر القديم مالوش إيقاف");
    // الجسر: بيحجز الاتنين المؤجّلين ونوعهم «stop»
    let lease = await post("/api/exec-queue/bridge/lease", bridge, { device: "PC-test", stops: true });
    assert.deepEqual(lease.jobs.map((j: any) => [Number(j.id), j.type]).sort(), [[daily1, "stop"], [daily2, "stop"]].sort());
    // نفس الجهاز لو رجع لنسخة قديمة ⇒ حجز الإيقاف بيتفكّ ومابياخدهوش
    lease = await post("/api/exec-queue/bridge/lease", bridge, { device: "PC-test" });
    assert.deepEqual(lease.jobs, []);
    const held = (await pool.query(`SELECT count(*)::int AS n FROM exec_jobs WHERE id = ANY($1::bigint[]) AND bridge_device IS NOT NULL`, [[daily1, daily2]])).rows[0].n;
    assert.equal(held, 0, "الحجز اتفكّ");
    lease = await post("/api/exec-queue/bridge/lease", bridge, { device: "PC-test", stops: true });
    assert.equal(lease.jobs.length, 2);

    // جهاز التنفيذ: العاجل بس — والإيقاف المؤجّل مايتسحبش (الجسر مفتوح)
    const claimed: number[] = [];
    for (let i = 0; i < 4; i++) {
      const job = await post("/api/exec-queue/claim", cookie, { device: "edge-test", caps: ["stop-lanes"] });
      if (!job) break;
      claimed.push(Number(job.id));
    }
    assert.ok(claimed.includes(urgent), "العاجل لجهاز التنفيذ");
    assert.ok(claimed.includes(chain), "«+قياس» لجهاز التنفيذ (المتابعة بتتعمل من /done)");
    assert.ok(!claimed.includes(daily1) && !claimed.includes(daily2), "المؤجّل مش لجهاز التنفيذ");
    for (const id of claimed) await post(`/api/exec-queue/${id}/done`, cookie, { result: "done" });

    const start = await post("/api/exec-queue/bridge/start", bridge, { device: "PC-test", ids: [daily1] });
    assert.equal(start.ok, true, JSON.stringify(start));
    const since = start.now;

    // «خلص؟» من line_po_events — قبل الإيقاف لأ، وبعده آه
    let pr = await post("/api/exec-queue/bridge/progress", bridge, { device: "PC-test", chunks: [{ marker: start.marker, ids: [daily1, daily2], since }] });
    assert.deepEqual(pr.measured, []);
    await pool.query(`INSERT INTO line_po_events (account_no, last_stop_at) VALUES ($1, now())
                      ON CONFLICT (account_no) DO UPDATE SET last_stop_at = now()`, [accs[0]]);
    pr = await post("/api/exec-queue/bridge/progress", bridge, { device: "PC-test", chunks: [{ marker: start.marker, ids: [daily1, daily2], since }] });
    assert.deepEqual(pr.measured, [daily1]);

    // التقرير: الأول done (مفيش إعادة)، التانى timeout من غير إيقاف متسجّل ⇒ إعادة بعد ١٠ دقايق «+إعادة1»
    await post("/api/exec-queue/bridge/report", bridge, { device: "PC-test", done: [{ id: daily1, result: "done" }, { id: daily2, result: "timeout" }] });
    const { rows: fu } = await pool.query(
      `SELECT account, note, source_job_id, run_at > now() + interval '9 minutes' AS later FROM exec_followups WHERE account = ANY($1::text[])`,
      [[accs[0], accs[1]]]);   // accs[3] («+قياس») عمله جهاز التنفيذ ⇒ قياس بعده — دى متابعة تانية صحيحة
    assert.equal(fu.length, 1, JSON.stringify(fu) + JSON.stringify((await pool.query(`SELECT account, note, source_job_id FROM exec_followups WHERE account = ANY($1::text[])`, [accs])).rows));
    assert.equal(fu[0].account, accs[1]);
    assert.equal(Number(fu[0].source_job_id), daily2);
    assert.match(fu[0].note, /\+إعادة1$/);
    assert.equal(fu[0].later, true);
  } finally {
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});

test("bridge 'done' on a stop with no recorded stop ⇒ retry; one-time repair of old-bridge false stops", async (t) => {
  const { readFileSync } = await import("node:fs");
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  assert.match(routes, /const rt = stopRetryFor\(\{ type: j\.type, note: j\.note, result: "timeout" \}, st\.length > 0\);/);
  assert.match(routes, /const REPAIR_BRIDGE_STOPS_KEY = "repair_bridge_false_stops_20261104";/);
  assert.match(routes, /const runExecFollowups = async \(\) => \{\s*await repairBridgeFalseStops\(\);/);
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}${Date.now()}`.slice(-7);
  const accFalse = `RF${sfx}`, accReal = `RS${sfx}`, batch = `rp-batch-${sfx}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM exec_followups WHERE account = ANY($1::text[])`, [[accFalse, accReal]]);
    await pool.query(`DELETE FROM exec_jobs WHERE type = 'stop' AND status = 'done' AND result = 'done' AND executed_by LIKE 'جسر%' AND batch_id LIKE 'rp-batch-%'`);
    await pool.query(`DELETE FROM exec_jobs WHERE batch_id = $1 OR (type = 'stop' AND accounts->>0 = ANY($2::text[]))`, [batch, [accFalse, accReal]]);
    await pool.query(`DELETE FROM line_po_events WHERE account_no = ANY($1::text[])`, [[accFalse, accReal]]);
    await pool.query(`DELETE FROM app_settings WHERE key = 'repair_bridge_false_stops_20261104'`);
  };
  try {
    await cleanup();
    const ins = (acc: string) => pool.query(
      `INSERT INTO exec_jobs (type, accounts, status, result, batch_id, executed_by, claimed_at, done_at, note, bridge_device)
       VALUES ('stop', $1::jsonb, 'done', 'done', $2, 'جسر Tampermonkey · PC', now() - interval '2 hours', now() - interval '1 hour', 'تحتاج إيقاف PO (تشغيل يومى ٩ ص)', 'جسر Tampermonkey · PC')
       RETURNING id`,
      [JSON.stringify([acc]), batch]);
    await ins(accFalse); await ins(accReal);
    // الطلب اتعمل الساعة ٩ (من ٣ ساعات) — والإيقاف المتسجّل بعده بيتحسب
    await pool.query(`UPDATE exec_jobs SET created_at = now() - interval '3 hours' WHERE batch_id = $1`, [batch]);
    await pool.query(`INSERT INTO line_po_events (account_no, last_stop_at) VALUES ($1, now() - interval '90 minutes')`, [accReal]);
    const user = `rp-sa-${sfx}`, pass = `pw-${sfx}`;
    const salt = randomBytes(16).toString("hex");
    const hash = await scryptAsync(pass, salt, 64) as Buffer;
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, `${hash.toString("hex")}.${salt}`]);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    // نبضة جهاز التنفيذ بتشغّل المتابعات ⇒ الإصلاح
    await fetch(`${base}/api/exec-queue/heartbeat`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ device: "rp-test" }) });
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
    for (let i = 0; i < 40; i++) {
      const n = (await pool.query(`SELECT count(*)::int AS n FROM exec_followups WHERE account = ANY($1::text[])`, [[accFalse, accReal]])).rows[0].n;
      const flag = (await pool.query(`SELECT 1 FROM app_settings WHERE key = 'repair_bridge_false_stops_20261104'`)).rows.length;
      if (flag && n) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const fu = (await pool.query(`SELECT account, note FROM exec_followups WHERE account = ANY($1::text[])`, [[accFalse, accReal]])).rows;
    assert.deepEqual(fu.map((r: any) => r.account), [accFalse], "اللى اتوقّف فعلاً مالوش إعادة");
    assert.match(fu[0].note, /\+إعادة1$/);
  } finally {
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});
