// المالك ٢٠٢٦-١١-٠٣: «القياس فيه إعادة كتير» — طابور جهاز التنفيذ كان فيه قياسات اتجرّبت ٤–٦ مرات وأقدمها من ١٠ دقايق.
// الطلب اللى بيقع جوّه /api/case-138/measurements كان مابيردّش خالص (من غير try/catch) ⇒ منع التكرار بيقول «لسه
// بتتسجّل» (425) ١٠ دقايق. ونسخة القاعدة الحالية (اتصال واحد) كانت فى طريق الرد وفى سؤال تقدّم جهاز التنفيذ.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";

const scryptAsync = promisify(scrypt);

test("source: current-DB copy is off the reply path; executor progress reads the main DB; index for it", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const h = routes.slice(routes.indexOf('app.post("/api/case-138/measurements"'), routes.indexOf('app.options("/api/po-events/ingest"'));
  assert.match(h, /syncCurrentDzsMeasurementSoon\(measurementValues\);/);
  assert.doesNotMatch(h, /await syncCurrentDzsMeasurement\(/);
  assert.match(h, /return res\.status\(500\)\.json\(\{ message: e\?\.message \|\| "تعذّر تسجيل القياس", inserted \}\);/);
  assert.doesNotMatch(routes, /type === "measure" \? currentPool : pool/);
  assert.equal((routes.match(/AND uploaded_at >= \$2 AND source = 'dzs'`/g) || []).length, 2);
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.match(db, /CREATE INDEX CONCURRENTLY IF NOT EXISTS case_138_account_uploaded_idx ON case_138 \(account_no, uploaded_at\)/);
});

test("POST /api/case-138/measurements: a DB error answers 500 (not a hung request); a good one counts as executor progress", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}_${Date.now()}`;
  const user = `mi-${sfx}`, pass = `pw-${sfx}`, acc = `7${String(Date.now()).slice(-8)}`, batch = `mi-${sfx}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM case_138 WHERE account_no = $1`, [acc]);
    await pool.query(`DELETE FROM exec_jobs WHERE batch_id = $1`, [batch]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, hash]);
    const { rows: j } = await pool.query(
      `INSERT INTO exec_jobs (type, accounts, status, requested_by, batch_id, site, priority, claimed_at)
       VALUES ('measure', $1::jsonb, 'claimed', $2, $3, 'mi-site', 1, now() - interval '1 minute') RETURNING id`,
      [JSON.stringify([acc]), user, batch]);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const post = (items: any[]) => fetch(`${base}/api/case-138/measurements`, {
      method: "POST", headers: { "content-type": "application/json", "x-dzs-token": "sf-dzs-138-ingest-2026" },
      body: JSON.stringify({ items }), signal: AbortSignal.timeout(15_000),
    });
    // اسكور أكبر من integer ⇒ خطأ من القاعدة — لازم رد مش طلب معلّق
    const bad = await post([{ accountNo: acc, fullPhone: `88${acc.slice(-7)}`, score: "99999999999", currentSpeed: "1", maxSpeed: "2" }]);
    assert.equal(bad.status, 500);
    const good = await post([{ accountNo: acc, fullPhone: `88${acc.slice(-7)}`, score: "12", currentSpeed: "4096", maxSpeed: "8192" }]);
    assert.equal(good.status, 200);
    assert.deepEqual(await good.json(), { inserted: 1 });
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) }))
      .headers.get("set-cookie")!.split(";")[0];
    const chk: any = await (await fetch(`${base}/api/exec-queue/job-check?jobId=${j[0].id}`, { headers: { cookie } })).json();
    assert.deepEqual([chk.active, chk.measured, chk.total], [true, 1, 1], "التقدّم من القاعدة الأساسية");
  } finally {
    await cleanup().catch(() => {});
    await new Promise((r) => httpServer.close(() => r(null)));
  }
});
