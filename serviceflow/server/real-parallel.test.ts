// المالك ٢٠٢٦-١١-٠٣: «جرّبت قياس Real وقياسات كتير بدون Real وإيقاف PO فى نفس الوقت واشتغل كويس — مفيش داعى توقّف
// بدون Real أو الإيقاف عشان تفتح Real، أهم حاجة مايبقاش فيه قياسين Real أو أكتر مع بعض».
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";

const scryptAsync = promisify(scrypt);

test("PostgreSQL claims: Real runs beside no-Real and PO stop, one Real at a time, raise still alone", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}_${Date.now()}`;
  const user = `rp-${sfx}`, pass = `pw-${sfx}`, batch = `rp-batch-${sfx}`, site = `rp-site-${sfx}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  // مهام تانية مستنية فى القاعدة (من اختبارات تانية) ماتتسحبش بدالنا — بتتوقّف مؤقتاً وترجع زى ما كانت
  let parked: number[] = [];
  const cleanup = async () => {
    if (parked.length) { await pool.query(`UPDATE exec_jobs SET paused_at = NULL WHERE id = ANY($1::int[])`, [parked]); parked = []; }
    await pool.query(`DELETE FROM exec_jobs WHERE batch_id = $1`, [batch]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, hash]);
    const ids: Record<string, number> = {};
    // أولوية ٢ (مش مؤجّلة ⇒ مش للجسر) — الترتيب بوقت الإضافة
    const add = async (key: string, type: string, note: string | null, sec: number) => {
      const { rows } = await pool.query(
        `INSERT INTO exec_jobs (type, accounts, status, requested_by, batch_id, site, priority, queue_order, created_at, note)
         VALUES ($1, $2::jsonb, 'pending', $3, $4, $5, 2, 0, $6, $7) RETURNING id`,
        [type, JSON.stringify([`acc-${key}-${sfx}`]), user, batch, site, `2020-01-01T00:00:0${sec}Z`, note]);
      ids[key] = rows[0].id;
    };
    await add("N1", "measure", "بدون Real", 1);
    await add("P1", "stop", null, 2);
    await add("R1", "measure", null, 3);
    await add("R2", "measure", null, 4);
    await add("X1", "raise", null, 5);
    await add("N2", "measure", "بدون Real", 6);

    parked = (await pool.query(`UPDATE exec_jobs SET paused_at = now() WHERE status = 'pending' AND paused_at IS NULL
                                  AND batch_id IS DISTINCT FROM $1 RETURNING id`, [batch])).rows.map((r: any) => r.id);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) }))
      .headers.get("set-cookie")!.split(";")[0];
    const claim = async () => {
      const r = await fetch(`${base}/api/exec-queue/claim`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ device: "rp-test", caps: ["stop-lanes"] }) });
      assert.equal(r.status, 200);
      const j: any = await r.json();
      const key = j && Object.keys(ids).find((k) => ids[k] === j.id);
      return key || (j ? `other:${j.id}` : null);
    };
    const done = async (k: string) => {
      const r = await fetch(`${base}/api/exec-queue/${ids[k]}/done`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ result: "done" }) });
      assert.equal(r.status, 200, `done ${k}`);
    };

    assert.equal(await claim(), "N1");
    assert.equal(await claim(), "P1");
    assert.equal(await claim(), "R1", "Real بيتفتح وبدون Real والإيقاف شغّالين");
    assert.equal(await claim(), null, "Real تانى لأ — ولا «بدون Real» اللى رفع السرعة قدّامه");
    await done("R1");
    assert.equal(await claim(), "R2", "بعد ما الأول يخلص");
    await done("R2"); await done("N1"); await done("P1");
    assert.equal(await claim(), "X1", "رفع السرعة لما الموقع يفضى");
    assert.equal(await claim(), null, "رفع السرعة لوحده");
    await done("X1");
    assert.equal(await claim(), "N2");
  } finally {
    await cleanup().catch(() => {});
    await new Promise((r) => httpServer.close(() => r(null)));
  }
});

test("executor: Real opens in the usual measure tab with its own script keys (lane 80); no-Real tabs are separate; no preempting each other", async () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const chk = routes.slice(routes.indexOf('app.get("/api/exec-queue/job-check"'), routes.indexOf('app.get("/api/exec-queue/:id/preempt"'));
  assert.match(chk, /AND NOT \(\(\$3::boolean OR \$4::boolean\) AND \(\$\{sharedGroup\("exec_jobs"\)\} OR \$\{isRealJob\("exec_jobs"\)\}\)\s+AND NOT \(\$4::boolean AND \$\{isRealJob\("exec_jobs"\)\}\)\)/);
  assert.match(routes, /AND NOT \$\{coRunnable\("e", "j2"\)\}\)\)/, "المُنقِذ مايرجّعش Real شغّال جنب بدون Real");
  const exe = readFileSync(new URL("../client/src/components/ExecutorButton.tsx", import.meta.url), "utf8");
  assert.match(exe, /if \(isReal\) lane = REAL_MEASURE_LANE;/);
  assert.match(exe, /isReal \? `\$\{site\}#R`/);
  const store = new Map<string, string>();
  const calls: any[][] = [];
  (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) };
  (globalThis as any).window = { open: (...a: any[]) => { calls.push(a); return { closed: false }; } };
  const q = await import("../client/src/lib/exec-queue");
  q.executeBatch("measure", ["111"], { noReal: false, lane: q.REAL_MEASURE_LANE });
  q.executeBatch("measure", ["222"], { noReal: true, lane: 1 });
  q.executeBatch("measure", ["333"], {});
  assert.match(String(calls[0][0]), /#sf_accounts=111&sf_lane=80$/);
  assert.equal(calls[0][1], "dzs_measure", "Real فى نفس تاب القياس زى ما هو (المالك: «علشان يبقى مميز»)");
  assert.equal(calls[1][1], "dzs_measure_1", "«بدون Real» الأول تاب لوحده — Real مايفتحش فوقه");
  assert.match(String(calls[1][0]), /sf_mode=noreal$/);
  assert.equal(calls[2][1], "dzs_measure", "القياس اليدوى زى ما هو");
  assert.doesNotMatch(String(calls[2][0]), /sf_lane/);
});

test("userscripts: measure tabs no longer clear the shared PO flag; PO runs only in its own tab", () => {
  const m = readFileSync(new URL("../dzs-expresse-v10.user.js", import.meta.url), "utf8");
  const po = readFileSync(new URL("../dzs-profile-optimization.user.js", import.meta.url), "utf8");
  const guard = m.slice(m.indexOf('if (/[#&]sf_accounts=/.test(location.hash)) { try {'), m.indexOf("DZS measure paused"));
  assert.doesNotMatch(guard, /PO_ACTIVE/);
  assert.match(guard, /sessionStorage\.getItem\("PO_TAB"\) === "1"/);
  assert.match(m, /@version {6}10\.36\.0/);
  assert.match(po, /if \(!hasPoHash && !\(isPoTab && localStorage\.getItem\(PO_ACTIVE_KEY\) === "1"\)\) return;/);
  assert.match(po, /@version {6}0\.9\.25/);
});
