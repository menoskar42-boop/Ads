// المالك ٢٠٢٦-١١-٠٢: خطوط «انخفاض السرعة خلال أسبوع» اللى ليها شكوى ومالهاش موبايل ⇒ «أرقام لها شكاوى بدون
// رقم موبايل» كعاجل: بتظهر فى الأول، حتى لو شكواها قديمة برّه المدة، ومن غير ما تتكرر لو الشكوى جوّه المدة.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";

const scryptAsync = promisify(scrypt);

test("the report reuses the weekly speed-drop calculation (one source for both)", () => {
  const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const ep = routes.slice(routes.indexOf('app.get("/api/reports/weekly-speed-drop"'));
  assert.match(ep.slice(0, 600), /const data = await weeklySpeedDropRows\(days, minDrop\)/);
  const nm = routes.slice(routes.indexOf('app.get("/api/phone-lines/no-mobile-complaints"'), routes.indexOf('app.post("/api/line-mobile-checked"'));
  assert.match(nm, /await urgentSpeedDropRows\(\)/);
  assert.match(nm, /ORDER BY e\.urgent DESC/);
  const ui = readFileSync(new URL("../client/src/components/NoMobileComplaintsReport.tsx", import.meta.url), "utf8");
  assert.match(ui, /"عاجل": urgentText\(row\)/, "Excel");
  assert.match(ui, /columns: \["#", "المصدر", "عاجل"/, "PDF");
});

test("GET /api/phone-lines/no-mobile-complaints: speed-drop lines with a complaint come first as urgent", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}_${Date.now()}`;
  const user = `nmu-${sfx}`, pass = `pw-${sfx}`;
  const rnd = () => String(Math.floor(1_000_000 + Math.random() * 8_999_999));
  // A: انخفاض + شكوى قديمة (برّه المدة) · B: انخفاض + شكوى جوّه المدة · C: انخفاض من غير شكوى · D: شكوى بس
  const P = { a: rnd(), b: rnd(), c: rnd(), d: rnd() };
  const full = (p: string) => `88${p}`;
  const tk = { a: `T-A-${sfx}`, b: `T-B-${sfx}`, d: `T-D-${sfx}` };
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    const fps = Object.values(P).map(full);
    await pool.query(`DELETE FROM case_138 WHERE full_phone = ANY($1::text[])`, [fps]);
    await pool.query(`DELETE FROM phone_ports WHERE phone_number = ANY($1::text[])`, [fps]);
    await pool.query(`DELETE FROM complaint_details WHERE complain_no = ANY($1::text[])`, [Object.values(tk)]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = `${((await scryptAsync(pass, salt, 64)) as Buffer).toString("hex")}.${salt}`;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'super_admin')`, [user, hash]);
    for (const p of [P.a, P.b, P.c]) {
      await pool.query(`INSERT INTO phone_ports (phone_number, frame) VALUES ($1, 'F1')`, [full(p)]);
      await pool.query(
        `INSERT INTO case_138 (full_phone, current_speed, score, measure_mode, measured_at, account_no)
         VALUES ($1, '8192', 20, 'noreal', now() - interval '9 days', $2), ($1, '2048', 30, 'noreal', now() - interval '1 day', $2)`,
        [full(p), `acc-${p}`]);
    }
    await pool.query(
      `INSERT INTO complaint_details (complain_no, phone_number, exchange_name, cabinet_no, complain_type_name, complain_time, close_time)
       VALUES ($1, $2, 'الغنايم', '1-1', 'ADSL', now() - interval '200 days', now() - interval '199 days'),
              ($3, $4, 'الغنايم', '1-1', 'ADSL', now() - interval '5 days', now() - interval '4 days'),
              ($5, $6, 'الغنايم', '1-1', 'ADSL', now() - interval '3 days', now() - interval '2 days')`,
      [tk.a, P.a, tk.b, P.b, tk.d, P.d]);

    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) }))
      .headers.get("set-cookie")!.split(";")[0];

    // نفس التقرير الأسبوعى: التلاتة نزلوا ٧٥٪، واتنين بس ليهم شكوى
    const wk: any = await (await fetch(`${base}/api/reports/weekly-speed-drop`, { headers: { cookie } })).json();
    const mine = wk.data.filter((r: any) => [P.a, P.b, P.c].includes(r.phone));
    assert.deepEqual(mine.map((r: any) => [r.phone, r.dropPct, r.hasComplaint]).sort(),
      [[P.a, 75, true], [P.b, 75, true], [P.c, 75, false]].sort());

    const from = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const res = await fetch(`${base}/api/phone-lines/no-mobile-complaints?limit=20000&dateFrom=${from}`, { headers: { cookie } });
    const body: any = await res.json();
    assert.equal(res.status, 200, body.message);
    const rows = body.data.filter((r: any) => Object.values(P).includes(r.phoneShort));
    const byPhone = new Map(rows.map((r: any) => [r.phoneShort, r]));
    assert.equal(rows.filter((r: any) => r.phoneShort === P.b).length, 1, "B: صف واحد (مش مكرر)");
    const a: any = byPhone.get(P.a), b: any = byPhone.get(P.b), d: any = byPhone.get(P.d);
    assert.ok(a, "A: شكواه برّه المدة بس عاجل ⇒ بيظهر");
    assert.equal(a.source, "انخفاض السرعة");
    assert.equal(a.ticketId, tk.a);
    assert.equal(a.urgent, true);
    assert.equal(a.dropPct, 75);
    assert.equal(b.source, "تفاصيل");
    assert.equal(b.urgent, true);
    assert.ok(!byPhone.has(P.c), "C: مالوش شكوى ⇒ مش فى التقرير");
    assert.equal(d.urgent, false);
    // العاجل فى الأول
    const firstNonUrgent = body.data.findIndex((r: any) => !r.urgent);
    const lastUrgent = body.data.map((r: any) => r.urgent).lastIndexOf(true);
    assert.ok(firstNonUrgent === -1 || lastUrgent < firstNonUrgent, "كل العاجل قبل الباقى");
    assert.ok(body.urgentTotal >= 2);

    const only: any = await (await fetch(`${base}/api/phone-lines/no-mobile-complaints?limit=20000&dateFrom=${from}&urgentOnly=1`, { headers: { cookie } })).json();
    assert.ok(only.data.every((r: any) => r.urgent));
    assert.ok(only.data.some((r: any) => r.phoneShort === P.a) && !only.data.some((r: any) => r.phoneShort === P.d));
  } finally {
    await cleanup().catch(() => {});
    await new Promise((r) => httpServer.close(() => r(null)));
  }
});
