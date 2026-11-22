// إيقاف PO مابيتعادش مرتين (المالك ٢٠٢٦-١٠-٣١: «ايقاف الpo بيرجع منه نسبه كبيره بعد ايرو»). على Postgres حقيقى:
// الإيقاف اللى اتقفل (timeout/tab_closed) ليه إعادته هو فى /done وbridge/report (stopRetryFor: «+إعادة» لحد ٣)،
// فـ«إعادة تنفيذ بعد إيرور» (requeueErroredJobs) مابتعيدهوش تانى؛ بتعيد بس «stopped» — ولو الإيقاف اتسجّل للرقم
// (line_po_events) مابتعيدهوش خالص. القياس زى ما هو.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";

const scryptAsync = promisify(scrypt);

test("errored PO stops are retried once, by their own retry path only", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const suffix = `${process.pid}_${Date.now()}`;
  const user = `stop-requeue-${suffix}`, pass = `pw-${suffix}`, batch = `stop-requeue-${suffix}`;
  const n = Date.now() % 1e7;
  const acc = { timeout: `81${n}`, stopped: `82${n}`, recorded: `83${n}`, measure: `84${n}` };
  const accs = Object.values(acc);
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM line_po_events WHERE account_no = ANY($1::text[])`, [accs]);
    await pool.query(`DELETE FROM exec_jobs WHERE batch_id IN ($1, $1 || '-r1')`, [batch]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = await scryptAsync(pass, salt, 64) as Buffer;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, `${hash.toString("hex")}.${salt}`]);
    const done = async (type: string, a: string, result: string) => {
      await pool.query(
        `INSERT INTO exec_jobs (type, accounts, status, requested_by, batch_id, site, priority, note, created_at, claimed_at, done_at, result)
         VALUES ($1, $2::jsonb, 'done', $3, $4, '10.42.187.101', 0, 'تحتاج إيقاف PO (تشغيل يومى ٩ ص)',
                 now() - interval '1 hour', now() - interval '15 minutes', now() - interval '5 minutes', $5)`,
        [type, JSON.stringify([a]), user, batch, result]);
    };
    await done("stop", acc.timeout, "timeout");     // بيتعاد من stopRetryFor (+إعادة) ⇒ مش هنا
    await done("stop", acc.stopped, "stopped");     // stopRetryFor مابيعيدهوش ⇒ هنا
    await done("stop", acc.recorded, "stopped");    // اتسجّل إيقافه بعد ما اتسحب ⇒ مفيش إعادة
    await done("measure", acc.measure, "timeout");  // القياس زى ما هو
    await pool.query(
      `INSERT INTO line_po_events (account_no, last_stop_at) VALUES ($1, now() - interval '10 minutes')
       ON CONFLICT (account_no) DO UPDATE SET last_stop_at = EXCLUDED.last_stop_at`, [acc.recorded]);

    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const addr = httpServer.address(); assert.ok(addr && typeof addr !== "string");
    const base = `http://127.0.0.1:${addr.port}`;
    const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    // السحبة بتشغّل requeueErroredJobs قبل ما تسحب
    const r = await fetch(`${base}/api/exec-queue/claim`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ device: "edge-test" }) });
    assert.equal(r.status, 200, await r.text());

    const { rows } = await pool.query(
      `SELECT type, accounts->>0 AS acc, note FROM exec_jobs WHERE batch_id = $1 || '-r1' ORDER BY id`, [batch]);
    const got = rows.map((x: any) => `${x.type}:${x.acc}`).sort();
    assert.deepEqual(got, [`measure:${acc.measure}`, `stop:${acc.stopped}`].sort(),
      "الإيقاف اللى اتقفل (timeout) واللى اتسجّل مابيتعادوش هنا");
    assert.ok(rows.every((x: any) => x.note.includes("إعادة تنفيذ بعد إيرور")));
  } finally {
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
    await pool.end().catch(() => {});
  }
});
