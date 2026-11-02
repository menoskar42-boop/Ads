// «توزيع الكباين» (المالك ٢٠٢٦-١١-٠١): الحفظ بيسجّل تغيير الفنى بتاريخه، والشركاء.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";
import { planAssignments, checkPartners, dayBefore, type DbAssignRow } from "./cabinet-assignments";
import { buildAdslReport } from "./cabinet-reassign";

const scryptAsync = promisify(scrypt);
const known = new Set(["W1", "W2", "W3", "W4"]);
const cur: DbAssignRow[] = [
  { id: 1, central: "الغنايم", msanCode: "11-2-26-01", cabinNumber: "1-1", workerCode: "W1" },
  { id: 2, central: "الغنايم", msanCode: "11-2-26-01", cabinNumber: "1-2", workerCode: "W1" },
  { id: 3, central: "الغنايم-العزايزة", msanCode: "11-2-30-01", cabinNumber: "1-1", workerCode: "W2" },
];

test("plan: technician change is flagged (for dated history), plus add / edit / delete", () => {
  const p = planAssignments(cur, [
    { id: 1, central: "الغنايم", msanCode: "11-2-26-01", cabinNumber: "1-1", workerCode: "W3" },   // فنى اتغيّر
    { id: 2, central: "الغنايم", msanCode: "11-2-26-01", cabinNumber: "1-2", workerCode: "W1" },   // زى ما هو
    { central: "الغنايم", msanCode: "11-2-26-05", cabinNumber: "5-1", workerCode: "W2" },           // جديد
  ], known);
  assert.deepEqual(p.errors, []);
  assert.deepEqual(p.updates.map((u) => [u.id, u.workerChanged, u.oldWorker]), [[1, true, "W1"]]);
  assert.equal(p.inserts.length, 1);
  assert.deepEqual(p.deletes, [3]);
});

test("plan: required fields, unknown technician, duplicates, stale ids", () => {
  const p = planAssignments(cur, [
    { central: "", msanCode: "", cabinNumber: "1-1", workerCode: "W1" },
    { central: "الغنايم", msanCode: "x", cabinNumber: "9-9", workerCode: "ZZ" },
    { id: 1, central: "الغنايم", msanCode: "11-2-26-01", cabinNumber: "1-1", workerCode: "W1" },
    { central: "الغنايم", msanCode: "11-2-26-01", cabinNumber: "1-1", workerCode: "W2" },
    { id: 99, central: "الغنايم", msanCode: "", cabinNumber: "7-7", workerCode: "" },
  ], known);
  assert.equal(p.errors.length, 4, p.errors.join("\n"));
});

test("partners: no self, no cabinets for the partner-less tech, no overlapping chains", () => {
  const rows = [{ central: "الغنايم", msanCode: "", cabinNumber: "1-1", workerCode: "W1" }];
  assert.deepEqual(checkPartners([{ techCode: "W4", partnerCode: "W1", from: "2026-11-01" }], rows, known), []);
  assert.equal(checkPartners([{ techCode: "W1", partnerCode: "W2", from: "2026-11-01" }], rows, known).length, 1, "ليه كباين");
  assert.equal(checkPartners([{ techCode: "W4", partnerCode: "W4", from: "2026-11-01" }], rows, known).length, 1);
  assert.equal(checkPartners([{ techCode: "W4", partnerCode: "W1", from: "2026-11-05", to: "2026-11-01" }], rows, known).length, 1);
  assert.equal(checkPartners([
    { techCode: "W4", partnerCode: "W3", from: "2026-11-01" },
    { techCode: "W3", partnerCode: "W2", from: "2026-11-01" },
  ], [], known).length, 1, "الشريك نفسه شغال مع حد تانى");
  assert.equal(dayBefore("2026-11-01"), "2026-10-31");
});

test("a saved technician change splits faults-per-1000 at its date (before = old tech, after = new)", () => {
  // نفس اللى الحفظ بيكتبه: سطر تاريخ (القديم W1) من ١٦ أكتوبر
  const r = buildAdslReport({
    ct: [{ central: "الغنايم", cabin: "1-1", code: "M1", worker: "W3" }],
    history: [{ central: "الغنايم", cabin: "1-1", oldWorker: "W1", date: "2026-10-16" }],
    names: new Map([["W1", "اسلام"], ["W3", "حسن"]]),
    working: new Map([["M1", 100]]),
    daily: new Map([["M1", new Map([["2026-10-05", 2], ["2026-10-20", 3]])]]),
    from: "2026-10-01", to: "2026-10-31",
  });
  const by = Object.fromEntries(r.techs.map((t) => [t.techName, t]));
  assert.equal(by["اسلام"].faultCount, 2);
  assert.equal(by["حسن"].faultCount, 3);
  assert.equal(by["اسلام"].per1000, 20);
  assert.equal(by["حسن"].per1000, 30);
});

test("PUT /api/cabinet-assignments (super admin): saves rows, writes dated history, partners end instead of vanishing", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}_${Date.now()}`;
  const admin = `ca-admin-${sfx}`, tech = `ca-tech-${sfx}`, pass = `pw-${sfx}`;
  const C = `سنترال-تجربة-${sfx}`;
  const W = { a: `ta${sfx}`, b: `tb${sfx}`, p: `tp${sfx}` };
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM cabinet_tech_history WHERE central_name = $1`, [C]);
    await pool.query(`DELETE FROM cabinet_technicians WHERE central_name = $1`, [C]);
    await pool.query(`DELETE FROM tech_partners WHERE tech_code = ANY($1::text[])`, [Object.values(W)]);
    await pool.query(`DELETE FROM technician_names WHERE worker_code = ANY($1::text[])`, [Object.values(W)]);
    await pool.query(`DELETE FROM users WHERE username = ANY($1::text[])`, [[admin, tech]]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $3, 'super_admin'), ($2, $3, 'admin')`, [admin, tech, hash]);
    await pool.query(`INSERT INTO technician_names (worker_code, tech_name) VALUES ($1, 'فنى أ'), ($2, 'فنى ب'), ($3, 'فنى شريك')`, [W.a, W.b, W.p]);
    await pool.query(`INSERT INTO cabinet_technicians (central_name, cabin_code, cabin_number, worker_code) VALUES ($1, 'MS-1', '1-1', $2), ($1, 'MS-1', '1-2', $2)`, [C, W.a]);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const login = async (u: string) => (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: u, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    const cookie = await login(admin);
    const other = await login(tech);
    assert.equal((await fetch(`${base}/api/cabinet-assignments`, { headers: { cookie: other } })).status, 403, "الأدمن العادى لأ");

    const g: any = await (await fetch(`${base}/api/cabinet-assignments`, { headers: { cookie } })).json();
    const mine = g.rows.filter((r: any) => r.central === C);
    assert.equal(mine.length, 2);
    assert.ok(g.techs.some((x: any) => x.code === W.p));
    const others = g.rows.filter((r: any) => r.central !== C);
    // 1-2 ⇒ فنى ب من ٢٠ أكتوبر · كابينة جديدة 2-1 · الشريك يشتغل مع أ
    const body = {
      effectiveDate: "2026-10-20",
      rows: [...others, ...mine.map((r: any) => (r.cabinNumber === "1-2" ? { ...r, workerCode: W.b } : r)),
        { central: C, msanCode: "MS-2", cabinNumber: "2-1", workerCode: W.b }],
      partners: [...g.partners, { techCode: W.p, partnerCode: W.a, from: "2026-10-20" }],
    };
    const put = await fetch(`${base}/api/cabinet-assignments`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body) });
    const pr: any = await put.json();
    assert.equal(put.status, 200, pr.message);
    assert.deepEqual([pr.changed, pr.added, pr.deleted], [1, 1, 0]);
    const hist = (await pool.query(`SELECT cabin_number, old_worker_code, new_worker_code, effective_date::text AS d FROM cabinet_tech_history WHERE central_name = $1`, [C])).rows;
    assert.deepEqual(hist, [{ cabin_number: "1-2", old_worker_code: W.a, new_worker_code: W.b, d: "2026-10-20" }]);
    const now = (await pool.query(`SELECT cabin_number, worker_code FROM cabinet_technicians WHERE central_name = $1 ORDER BY cabin_number`, [C])).rows;
    assert.deepEqual(now.map((r: any) => `${r.cabin_number}:${r.worker_code}`), [`1-1:${W.a}`, `1-2:${W.b}`, `2-1:${W.b}`]);
    // الموقع: الشريك بيشوف خطوط أ
    const { siteWorkerCode } = await import("./cabinet-assignments");
    assert.equal(await siteWorkerCode(pool as any, W.p), W.a);
    // اسم الشريك فى التقارير من تاريخ الشراكة: «أ , الشريك»
    const pair = (await pool.query(`SELECT sf_tech_pair('فنى شريك', '2026-10-25'::date) AS a, sf_tech_pair('فنى أ', '2026-10-25'::date) AS b, sf_tech_pair('فنى أ', '2026-10-19'::date) AS c`)).rows[0];
    assert.deepEqual([pair.a, pair.b, pair.c], ["فنى أ , فنى شريك", "فنى أ , فنى شريك", "فنى أ"]);

    // شيل الشراكة بعدين ⇒ بتخلص يوم قبل تاريخ الحفظ (التاريخ بيفضل)، وتاريخ فى المستقبل مرفوض
    const g2: any = await (await fetch(`${base}/api/cabinet-assignments`, { headers: { cookie } })).json();
    const today = g2.today;
    const put2 = await fetch(`${base}/api/cabinet-assignments`, { method: "PUT", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ effectiveDate: today, rows: g2.rows, partners: g2.partners.filter((p: any) => p.techCode !== W.p) }) });
    assert.equal(put2.status, 200);
    const end = (await pool.query(`SELECT end_date::text AS e FROM tech_partners WHERE tech_code = $1`, [W.p])).rows;
    assert.equal(end.length, 1);
    assert.equal(end[0].e, dayBefore(today));
    const fut = await fetch(`${base}/api/cabinet-assignments`, { method: "PUT", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ effectiveDate: "2999-01-01", rows: g2.rows, partners: [] }) });
    assert.equal(fut.status, 400);
  } finally {
    await cleanup().catch(() => {});
    await new Promise((r) => httpServer.close(() => r(null)));
  }
});
