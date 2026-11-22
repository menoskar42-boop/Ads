// «المواقع المشغولة الآن» (المالك ٢٠٢٦-١١-٠٤: «ظاهر إن اللى شغّال إيقاف لكن الجهاز بينفّذ قياس»): كل نوع شغّال لوحده
// ومين بينفّذه، واللى الجسر حاجزه — بدل اسم واحد متجمّع من مهام مختلفة.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";

const scryptAsync = promisify(scrypt);

test("sites: stop by the executor and no-Real by the bridge both show, with who runs them", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}${Date.now()}`.slice(-7);
  const site = `test-site-${sfx}`, sa = `sk-${sfx}`, pass = `pw-${sfx}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM exec_jobs WHERE site = $1`, [site]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [sa]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [sa, hash]);
    const ins = (type: string, note: string, status: string, by: string | null, lease = false) => pool.query(
      `INSERT INTO exec_jobs (type, accounts, status, note, site, executed_by, claimed_at, bridge_lease_until, batch_id)
       VALUES ($1, '["1"]'::jsonb, $2, $3, $4, $5, CASE WHEN $2 = 'claimed' THEN now() END, CASE WHEN $6 THEN now() + interval '1 hour' END, 'b' || $1)`,
      [type, status, note, site, by, lease]);
    await ins("stop", "تحتاج إيقاف PO (تشغيل يومى ٩ ص)", "claimed", "جهاز مكتب · تاب 1");
    await ins("measure", "خطوط لها أكونت — قياس بدون Real", "claimed", "جسر Tampermonkey · مكتب");
    for (let i = 0; i < 3; i++) await ins("measure", "خطوط لها أكونت — قياس بدون Real", "pending", null, true);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: sa, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    const j: any = await (await fetch(`${base}/api/exec-queue/sites`, { headers: { cookie } })).json();
    const row = j.data.find((r: any) => r.site === site);
    assert.ok(row, JSON.stringify(j.data.map((r: any) => r.site)));
    const k = row.kinds.map((x: any) => `${x.type}/${x.mode}/${x.bridge}/${x.n}`).sort();
    assert.deepEqual(k, ["measure/noreal/true/1", "stop/null/false/1"]);
    assert.deepEqual(row.bridgeHeld.map((h: any) => `${h.type}/${h.mode}/${h.n}`), ["measure/noreal/3"]);
    assert.equal(row.running, 2);
  } finally {
    await cleanup().catch(() => {});
    await new Promise<void>((r) => httpServer.close(() => r()));
  }
});
