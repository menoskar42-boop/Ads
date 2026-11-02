// استبعاد شكوى من حساب الفنيين (المالك ٢٠٢٦-١١-٠١): اتقفلت من التابلت عادى ⇒ مش على فنى الإغلاق ولا فنى المنطقة،
// والإدارة بتعدّها. السوبر أدمن بس.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";

const scryptAsync = promisify(scrypt);

test("excluded complaint: off every technician (closer and area) in removal/repetition, still in management totals", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}_${Date.now()}`;
  const admin = `ex-sa-${sfx}`, plain = `ex-ad-${sfx}`, pass = `pw-${sfx}`;
  const C = "الغنايم-استبعاد";
  const W = { closer: `c${sfx}`, area: `a${sfx}` };
  const N = { closer: `قافل${sfx}`, area: `منطقة${sfx}` };
  const no = [`X1${sfx}`, `X2${sfx}`, `X3${sfx}`];
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM complaint_tech_exclusions WHERE complain_no = ANY($1::text[])`, [no]);
    await pool.query(`DELETE FROM complaint_details WHERE complain_no = ANY($1::text[])`, [no]);
    await pool.query(`DELETE FROM cabinet_technicians WHERE central_name = $1`, [C]);
    await pool.query(`DELETE FROM technician_names WHERE worker_code = ANY($1::text[])`, [Object.values(W)]);
    await pool.query(`DELETE FROM users WHERE username = ANY($1::text[])`, [[admin, plain]]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $3, 'super_admin'), ($2, $3, 'admin')`, [admin, plain, hash]);
    await pool.query(`INSERT INTO technician_names (worker_code, tech_name) VALUES ($1, $3), ($2, $4)`, [W.closer, W.area, N.closer, N.area]);
    await pool.query(`INSERT INTO cabinet_technicians (central_name, cabin_number, worker_code) VALUES ($1, '8-8', $2)`, [C, W.area]);
    // X1: قفلها «قافل» · X2: مالهاش فنى إغلاق (فنى المنطقة) · X3: نفس رقم X1 بعده بيومين (تكرار على «قافل»)
    await pool.query(
      `INSERT INTO complaint_details (complain_no, exchange_name, complain_time, close_time, close_by, cabinet_no, phone_number) VALUES
         ($1, $4, '2026-10-10 08:00+00', '2026-10-11 12:00+00', $5, '8-8', '1888001'),
         ($2, $4, '2026-10-12 08:00+00', '2026-10-13 12:00+00', NULL, '8-8', '1888002'),
         ($3, $4, '2026-10-14 08:00+00', '2026-10-14 09:00+00', $5, '8-8', '1888001')`, [no[0], no[1], no[2], C, W.closer]);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const login = async (u: string) => (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: u, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    const sa = await login(admin), ad = await login(plain);
    const q = `dateFrom=2026-10-01&dateTo=2026-10-31&central=${encodeURIComponent(C)}`;
    const get = async (path: string) => (await fetch(`${base}${path}?${q}`, { headers: { cookie: sa } })).json() as any;
    const byTech = (d: any, f: string) => Object.fromEntries((d.byTechOnly || []).map((r: any) => [r.techName, Number(r[f])]));
    const exclude = (cookie: string, complainNo: string, excluded = true) => fetch(`${base}/api/complaint-exclusions`,
      { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ complainNo, excluded }) });

    assert.deepEqual(byTech(await get("/api/reports/combined-stats"), "total"), { [N.closer]: 2, [N.area]: 1 });
    assert.equal((await exclude(ad, no[0])).status, 403, "الأدمن العادى لأ — السوبر أدمن بس");
    assert.equal((await exclude(sa, no[0])).status, 200);
    assert.equal((await exclude(sa, no[1])).status, 200);
    const rem: any = await get("/api/reports/combined-stats");
    assert.deepEqual(byTech(rem, "total"), { [N.closer]: 1, "مستبعد من الفنيين": 2 }, "لا فنى الإغلاق ولا فنى المنطقة");
    assert.equal(Number(rem.overall.total), 3, "الإدارة: كل الشكاوى");
    // التكرار: أول شكوى للرقم مستبعدة ⇒ التكرار مش على «قافل»
    const rep: any = await get("/api/reports/repetition-combined");
    assert.equal(byTech(rep, "repCharges")[N.closer] ?? 0, 0);
    assert.equal(Number(rep.overall.repCharges), 1, "الإدارة: التكرار محسوب");
    // شاشة المتجاوز ٢٤ ساعة: الشارة ظاهرة
    const b24: any[] = await (await fetch(`${base}/api/reports/removal-beyond24?tab=details&dateFrom=2026-10-01&dateTo=2026-10-31`, { headers: { cookie: sa } })).json();
    const row = b24.find((r) => r.complainNo === no[0]);
    assert.ok(row, "X1 عدّت ٢٤ ساعة");
    assert.equal(row.techExcluded, true);
    // إلغاء الاستبعاد ⇒ يرجع زى الأول
    await exclude(sa, no[0], false); await exclude(sa, no[1], false);
    assert.deepEqual(byTech(await get("/api/reports/combined-stats"), "total"), { [N.closer]: 2, [N.area]: 1 });
  } finally {
    await cleanup().catch(() => {});
    await new Promise((r) => httpServer.close(() => r(null)));
  }
});
