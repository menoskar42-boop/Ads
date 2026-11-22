// السلك من شيت WFM (المالك ٢٠٢٦-١١-٠٢): من ٣-١١ أقل من ٥٠ زى ما هو، ٥٠ = الفنى يدخّل، فنى إغلاق مش من الخمسة = يسجّل
// إنه بتاعه من غير ما السلك يتغيّر، والسوبر أدمن بس يعدّل الكمية وفنى الإغلاق.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";
import { sheetCableFor } from "./wo-sheet-cable";

const scryptAsync = promisify(scrypt);

test("the rule for one work order", () => {
  assert.equal(sheetCableFor({ closeDay: "2026-11-03", sheet: "30" }), "30");
  assert.equal(sheetCableFor({ closeDay: "2026-11-03", sheet: "0" }), "0", "صفر زى ما هو");
  assert.equal(sheetCableFor({ closeDay: "2026-11-03", sheet: "50" }), null, "٥٠ = لسه من غير كمية");
  assert.equal(sheetCableFor({ closeDay: "2026-11-02", sheet: "50" }), "50", "قبل ٣-١١ زى الأول");
  assert.equal(sheetCableFor({ closeDay: "2026-11-05", sheet: "50", override: "42" }), "42", "تعديل السوبر أدمن بيغلب");
  assert.equal(sheetCableFor({ closeDay: "2026-11-05", sheet: "" }), null);
});

test("sheet cable on Postgres: entries, the no-cable list, claim, and super-admin edits", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }, { syncSheetCableEntries }] = await Promise.all([import("./db"), import("./routes"), import("./wo-sheet-cable")]);
  const sfx = `${process.pid}_${Date.now()}`;
  const sa = `wc-sa-${sfx}`, ad = `wc-ad-${sfx}`, tech = `wc-t-${sfx}`, pass = `pw-${sfx}`;
  const C = `سنترال-سلك-${sfx}`;
  const WH = `WH${sfx}`;
  const n = 1000000 + (Date.now() % 900000);
  const ph = (k: number) => `88${String(n + k).slice(-7)}`;
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`DELETE FROM cable_entries WHERE phone_full = ANY($1::text[])`, [[1, 2, 3, 4].map(ph)]);
    await pool.query(`DELETE FROM work_order_cable_overrides WHERE central_name = $1`, [C]);
    await pool.query(`DELETE FROM work_order_tech_overrides WHERE central_name = $1`, [C]);
    await pool.query(`DELETE FROM work_orders WHERE central_name = $1`, [C]);
    await pool.query(`DELETE FROM technician_names WHERE worker_code = $1`, [WH]);
    await pool.query(`DELETE FROM users WHERE username = ANY($1::text[])`, [[sa, ad, tech]]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $3, 'super_admin'), ($2, $3, 'admin')`, [sa, ad, hash]);
    await pool.query(`INSERT INTO users (username, password, role, worker_code) VALUES ($1, $2, 'tech', $3)`, [tech, hash, WH]);
    await pool.query(`INSERT INTO technician_names (worker_code, tech_name) VALUES ($1, 'حسن')`, [WH]);
    const wo = (k: number, day: string, qty: string, techName: string) => pool.query(
      `INSERT INTO work_orders (central_name, work_order_id, phone_number, service_type, close_date, cable_quantity, tech_name, close_category, work_order_type_raw)
       VALUES ($1, $2, $3, 'تركيب', ($4::date + time '12:00') AT TIME ZONE 'Africa/Cairo', $5, $6, 'Success', 'Fixed Voice Installation MSAN') RETURNING id`,
      [C, n + k, ph(k), day, qty, techName]).then((r) => r.rows[0].id as number);
    const A = await wo(1, "2026-11-03", "30", "حسن عبد الفتاح حموده");   // من الخمسة ⇒ يتخصم من حسن
    const B = await wo(2, "2026-11-04", "50", "حسن عبد الفتاح حموده");   // ٥٠ ⇒ الفنى يدخّل
    const Cw = await wo(3, "2026-11-04", "20", "مقاول برة");             // فنى مش من الخمسة ⇒ يسجّل إنه بتاعه
    await wo(4, "2026-11-01", "50", "حسن عبد الفتاح حموده");             // قبل ٣-١١ ⇒ زى الأول
    // إدخال يدوى قديم على A بـ٤٥ ⇒ الشيت بيغلب
    await pool.query(`INSERT INTO cable_entries (phone_local, phone_full, work_order_type, cable_quantity, created_by_name, stock_tech_name, stock_date, wo_ref)
                      VALUES ($1, $2, 'تركيب', '45', 'فنى', 'حسن', '2026-11-03', $3)`, [ph(1).slice(2), ph(1), A]);
    const s1 = await syncSheetCableEntries(pool as any);
    assert.ok(s1.inserted >= 1 && s1.updated >= 1);
    const entry = async (k: number) => (await pool.query(`SELECT cable_quantity, source, stock_tech_name, manual_quantity FROM cable_entries WHERE phone_full = $1`, [ph(k)])).rows[0];
    assert.deepEqual(await entry(1), { cable_quantity: "30", source: "sheet", stock_tech_name: "حسن", manual_quantity: "45" });
    assert.equal(await entry(2), undefined, "٥٠ ⇒ مفيش إدخال");
    assert.deepEqual(await entry(3), { cable_quantity: "20", source: "sheet", stock_tech_name: null, manual_quantity: null });
    assert.equal(await entry(4), undefined, "قبل ٣-١١ مابيتعملش إدخال من الشيت");

    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const login = async (u: string) => (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: u, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    const cS = await login(sa), cA = await login(ad), cT = await login(tech);
    const list = async (cookie: string) => ((await (await fetch(`${base}/api/reports/work-orders-no-cable?dateFrom=2026-10-25&dateTo=2026-11-30`, { headers: { cookie } })).json()) as any[])
      .filter((r) => r.centralName === C);
    const rows = await list(cS);
    const byPhone = Object.fromEntries(rows.map((r) => [r.phoneNumber, r]));
    assert.ok(byPhone[ph(2)] && !byPhone[ph(2)].claimOnly, "٥٠ ⇒ ظاهر من غير كمية");
    assert.ok(byPhone[ph(3)]?.claimOnly, "فنى مش من الخمسة ⇒ «سجّل إنه بتاعك»");
    assert.equal(byPhone[ph(3)].sheetCable, "20");
    assert.ok(!byPhone[ph(1)], "٣٠ من الشيت ⇒ مش ظاهر");
    assert.ok(!byPhone[ph(4)], "قبل ٣-١١ والـ٥٠ كمية زى الأول");

    // الفنى يسجّل C ⇒ اسمه على الأمر والسلك (٢٠) بيتخصم منه ومابيتغيّرش
    const cl = await fetch(`${base}/api/work-orders/${Cw}/claim`, { method: "POST", headers: { cookie: cT } });
    assert.equal(cl.status, 200, JSON.stringify(await cl.clone().json()));
    assert.deepEqual(await entry(3), { cable_quantity: "20", source: "sheet", stock_tech_name: "حسن", manual_quantity: null });
    assert.ok(!(await list(cT)).some((r) => r.phoneNumber === ph(3)), "اتسجّل ⇒ اختفى");

    // تعديل الكمية: الأدمن العادى لأ، السوبر أدمن آه (B ⇒ ٤٠ ⇒ إدخال من الشيت)
    const put = (cookie: string, id: number, q: string) => fetch(`${base}/api/work-orders/${id}/cable`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ cableQuantity: q }) });
    assert.equal((await put(cA, B, "40")).status, 403);
    assert.equal((await put(cS, B, "40")).status, 200);
    assert.equal((await entry(2))?.cable_quantity, "40");
    // تعديل فنى الإغلاق: السوبر أدمن بس — حتى لو على واحد من الخمسة
    const wt = (cookie: string) => fetch(`${base}/api/work-order-tech`, { method: "PUT", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ centralName: C, workOrderId: n + 1, techName: "اسلام" }) });
    assert.equal((await wt(cA)).status, 403);
    assert.equal((await wt(cS)).status, 200);
    assert.equal((await entry(1)).stock_tech_name, "اسلام", "السلك اتنقل لرصيد الفنى الجديد");
  } finally {
    await cleanup().catch(() => {});
    await new Promise((r) => httpServer.close(() => r(null)));
  }
});
