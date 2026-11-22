// المالك ٢٠٢٦-١٠-٢٩ (١٠:٥١م): «مفيش حاجة شغالة فى الطابور كله» — جهاز التنفيذ فى Edge كان «🌙 بيخلّص الطابور قبل
// الإيقاف (3689)» على نسخة قديمة من إعدادات الإيقاف (المالك كان قفلها من Chrome)، والـ3689 دول خطوط الجسر اللى
// جهاز التنفيذ مابياخدهاش أصلاً، والجسر واقف «مستنى — فيه إيقاف عاجل» اتضاف بعد بداية الفترة. الاختبار ده على
// Postgres حقيقى (SERVICEFLOW_TEST_DATABASE_URL) بيتأكد من التلات تصليحات:
//   ١) السحبة فى الفترة بترجّع الإعدادات الحالية فى هيدر X-SF-Night-Pause.
//   ٢) العدد وهو بيخلّص الطابور مابيحسبش شغل الجسر.
//   ٣) الجسر مابيستناش عاجل اتضاف بعد بداية الفترة — وبالنهار لسه بيستنى العاجل زى الأول.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";

const scryptAsync = promisify(scrypt);

test("night drain: settings header, honest pending count, bridge not blocked by in-window urgent work", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) {
    t.skip("DATABASE_URL is not configured for PostgreSQL integration tests");
    return;
  }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const suffix = `${process.pid}_${Date.now()}`;
  const user = `night-drain-${suffix}`, pass = `pw-${suffix}`, batch = `night-drain-batch-${suffix}`;
  const SETTINGS = ["exec_lanes_bridge", "exec_lanes_night_pause_executor", "exec_lanes_night_start", "exec_lanes_night_end"];
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  let base = "";
  const cleanup = async () => {
    await pool.query(`DELETE FROM exec_jobs WHERE batch_id = $1`, [batch]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
    await pool.query(`DELETE FROM app_settings WHERE key = ANY($1::text[])`, [SETTINGS]);
  };
  const post = async (path: string, headers: Record<string, string>, body: Record<string, unknown> = {}) => {
    const r = await fetch(`${base}${path}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(r.status, 200, `${path}: ${r.status}`);
    return { json: await r.json() as any, headers: r.headers };
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = await scryptAsync(pass, salt, 64) as Buffer;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, `${hash.toString("hex")}.${salt}`]);
    // المالك قفل «جهاز التنفيذ يقف» وخلّى الفترة ٢٣:٣٠ ← ٠٦:٥٠، والجسر مفتوح
    for (const [k, v] of [["exec_lanes_bridge", "1"], ["exec_lanes_night_pause_executor", "0"], ["exec_lanes_night_start", "23:30"], ["exec_lanes_night_end", "06:50"]]) {
      await pool.query(`INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
                        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [k, v]);
    }
    const windowStart = new Date(Date.now() - 30 * 60 * 1000);   // «بداية الفترة» اللى جهاز التنفيذ شايلها
    const ins = async (type: string, priority: number, note: string, createdAt: Date) => {
      const { rows } = await pool.query(
        `INSERT INTO exec_jobs (type, accounts, status, requested_by, batch_id, site, priority, note, created_at)
         VALUES ($1, '["1"]'::jsonb, 'pending', $2, $3, '10.42.187.101', $4, $5, $6) RETURNING id`,
        [type, user, batch, priority, note, createdAt.toISOString()]);
      return Number(rows[0].id);
    };
    const bridgeJob = await ins("measure", 0, "قياس بدون Real", new Date(windowStart.getTime() - 60 * 60 * 1000));
    await ins("stop", 2, "تحتاج إيقاف PO +إعادة1", new Date());   // عاجل اتضاف جوّه الفترة

    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const addr = httpServer.address();
    assert.ok(addr && typeof addr !== "string");
    base = `http://127.0.0.1:${addr.port}`;
    const login = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) });
    assert.equal(login.status, 200);
    const cookie = { cookie: login.headers.get("set-cookie")!.split(";")[0] };

    await post("/api/exec-queue/heartbeat", cookie, { device: "edge-test" });     // جهاز التنفيذ مفتوح
    const { json: tk } = await post("/api/exec-queue/bridge/token", cookie);
    const bridge = { "x-bridge-token": tk.token };

    // ١) سحبة وهو بيخلّص الطابور ⇒ الإعدادات الحالية فى الهيدر، ومفيش مهمة (العاجل جوّه الفترة، وشغل الجسر للجسر)
    const drain = await post("/api/exec-queue/claim", cookie, { device: "edge-test", caps: ["stop-lanes"], before: windowStart.toISOString() });
    assert.equal(drain.json, null);
    const np = JSON.parse(drain.headers.get("x-sf-night-pause") || "null");
    assert.deepEqual({ executor: np?.executor, start: np?.start, end: np?.end }, { executor: false, start: "23:30", end: "06:50" });
    // بالنهار (من غير before) مفيش هيدر
    const day0 = await fetch(`${base}/api/exec-queue/pending`, { headers: cookie });
    assert.equal(day0.headers.get("x-sf-night-pause"), null);

    // ٢) العدد وهو بيخلّص: شغل الجسر مش محسوب ⇒ صفر (قبل كده ١ — خط الجسر)
    const pend = await fetch(`${base}/api/exec-queue/pending?before=${encodeURIComponent(windowStart.toISOString())}`, { headers: cookie });
    assert.equal((await pend.json() as any).pending, 0);

    // ٣) الجسر: بيحجز خطه ويبدأ — مايستناش العاجل اللى اتضاف جوّه الفترة
    const { json: lease } = await post("/api/exec-queue/bridge/lease", bridge, { device: "PC-test" });
    assert.deepEqual(lease.jobs.map((j: any) => Number(j.id)), [bridgeJob]);
    const { json: start } = await post("/api/exec-queue/bridge/start", bridge, { device: "PC-test", ids: [bridgeJob] });
    assert.equal(start.ok, true, `الجسر لازم يبدأ: ${JSON.stringify(start)}`);

    // وبالنهار (جهاز التنفيذ بيسحب من غير before) الجسر لسه بيدّى العاجل الأولوية زى الأول
    await pool.query(`UPDATE exec_jobs SET status = 'pending', claimed_at = NULL, executed_by = NULL WHERE id = $1`, [bridgeJob]);
    // سحبة بالنهار (من غير before) — من غير ما تاخد العاجل: بنوقّفه لحظة السحبة ونرجّعه
    await pool.query(`UPDATE exec_jobs SET paused_at = now() WHERE batch_id = $1 AND type = 'stop'`, [batch]);
    await post("/api/exec-queue/claim", cookie, { device: "edge-test", caps: ["stop-lanes"] });
    await pool.query(`UPDATE exec_jobs SET paused_at = NULL WHERE batch_id = $1 AND type = 'stop'`, [batch]);
    const { json: dayStart } = await post("/api/exec-queue/bridge/start", bridge, { device: "PC-test", ids: [bridgeJob] });
    assert.equal(dayStart.ok, false, "بالنهار العاجل الأول");
    assert.equal(dayStart.wait, true);
  } finally {
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});
