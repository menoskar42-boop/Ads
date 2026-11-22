// المالك ٢٠٢٦-١١-٠٥: «متعذرات تم فكها (مستهدف 112)» — شيت المستهدف بيترفع جوه التقرير ويستبدل الجدول،
// والتقرير = مسلسلات الغنايم (نفس شرط OM) اللى مش موجودة فى المتعذرات الحالية، من غير تكرار، ومعاها
// وقت الفك التقريبى (أول رفعة OM اختفى فيها — ولو رجع واختفى تانى ⇒ الأحدث). على Postgres حقيقى.
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { randomBytes, scrypt } from "node:crypto";
import express from "express";
import { createServer } from "node:http";
import test from "node:test";
import * as XLSX from "xlsx";

const scryptAsync = promisify(scrypt);
const HEAD = ["Service Order ID", "Customer Order ID", "Customer Name", "FCC Exchange", "Serial Number", "Service Name", "Order Create Time"];

function xlsx(sheets: Record<string, any[][]>): Blob {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return new Blob([XLSX.write(wb, { type: "buffer", bookType: "xlsx" })]);
}

test("om target 112: replace on upload, Ghanaim only, no duplicates, approximate removal time (latest wins)", async (t) => {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes("no-db.invalid")) { t.skip("DATABASE_URL is not configured for PostgreSQL integration tests"); return; }
  const [{ pool }, { registerRoutes }] = await Promise.all([import("./db"), import("./routes")]);
  const sfx = `${process.pid}${Date.now()}`;
  const user = `t112-${sfx}`, pass = `pw-${sfx}`;
  const S = (n: number) => `T112${sfx}${n}`;          // مسلسلات
  const SO = (n: number) => `SO${sfx}${n}`;
  const row = (n: number, fcc = "GHNAT", svc = "FV Survey", so = SO(n)) => [so, `CO${n}`, `عميل ${n}`, fcc, S(n), svc, "2025-03-01 10:00:00"];
  const app = express(); app.use(express.json());
  const httpServer = createServer(app);
  const cleanup = async () => {
    await pool.query(`TRUNCATE om_target_112`);
    await pool.query(`TRUNCATE ftth_orders_current`);
    await pool.query(`DELETE FROM ftth_orders WHERE service_order_id LIKE $1`, [`SO${sfx}%`]);
    await pool.query(`DELETE FROM ftth_orders_soy WHERE service_order_id LIKE $1`, [`SO${sfx}%`]);
    await pool.query(`DELETE FROM users WHERE username = $1`, [user]);
  };
  try {
    await cleanup();
    const salt = randomBytes(16).toString("hex");
    const hash = (await scryptAsync(pass, salt, 64)) as Buffer;
    await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, 'admin')`, [user, `${hash.toString("hex")}.${salt}`]);
    await registerRoutes(httpServer, app);
    await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(httpServer.address() as any).port}`;
    const cookie = (await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: user, password: pass }) })).headers.get("set-cookie")!.split(";")[0];
    const upload = async (path: string, file: Blob) => {
      const fd = new FormData(); fd.append("file", file, "f.xlsx");
      const r = await fetch(`${base}${path}`, { method: "POST", body: fd, headers: { cookie } });
      return { status: r.status, json: (await r.json()) as any };
    };
    const om = (ns: number[]) => upload("/api/ftth-orders/import", xlsx({ Order: [HEAD, ...ns.map((n) => row(n))] }));
    const report = async () => (await (await fetch(`${base}/api/ftth-orders?bucket=target112`, { headers: { cookie } })).json()) as any[];
    const summary = async () => (await (await fetch(`${base}/api/om-target-112/summary`, { headers: { cookie } })).json()) as any;
    const bySerial = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.serialNumber, r]));

    // المتعذرات الحالية فيها ٢ و٣
    assert.equal((await om([2, 3])).status, 200);

    // الشيت: بياناته فى «Abnormal» (أول ورقة «سنترالات»)، و١ متكرر، و٤ مش غنايم، و٥ مش FV Survey
    const target = xlsx({
      "سنترالات": [["كود fcc", "السنترال"], ["GHNAT", "الغنايم"]],
      Abnormal: [HEAD, row(1), row(1, "GHNAT", "FV Survey", SO(11)), row(2), row(3, "AMZAT"), row(4, "ASYAT"), row(5, "GHNAT", "Other")],
    });
    const up = await upload("/api/om-target-112/import", target);
    assert.equal(up.status, 200, JSON.stringify(up.json));
    assert.equal(up.json.inserted, 3, "غنايم + FV Survey بس ومن غير تكرار مسلسل");
    assert.equal(up.json.gone, 1);
    let rep = await report();
    assert.deepEqual(rep.map((r) => r.serialNumber), [S(1)], "اللى مش فى الحالى بس");
    assert.equal(rep[0].goneBeforeUpload, true, "كان مفكوك قبل رفع الشيت");
    assert.ok(rep[0].goneAt);
    assert.deepEqual([(await summary()).total, (await summary()).gone], [3, 1]);

    // رفعة OM من غير ٢ ⇒ ٢ اتفك دلوقتى (مش قبل الشيت)، و١ وقته زى ما هو
    const g1 = (await pool.query(`SELECT gone_at FROM om_target_112 WHERE serial_number = $1`, [S(1)])).rows[0].gone_at;
    await om([3]);
    rep = await report();
    assert.deepEqual(rep.map((r) => r.serialNumber).sort(), [S(1), S(2)].sort());
    assert.equal(bySerial(rep)[S(2)].goneBeforeUpload, false);
    assert.equal((await pool.query(`SELECT gone_at FROM om_target_112 WHERE serial_number = $1`, [S(1)])).rows[0].gone_at.getTime(), g1.getTime(),
      "وقت فك ١ مايتغيرش مع كل رفعة");
    const g2 = (await pool.query(`SELECT gone_at FROM om_target_112 WHERE serial_number = $1`, [S(2)])).rows[0].gone_at;

    // ٢ رجع ⇒ مايظهرش، وبعدين اختفى تانى ⇒ وقت الفك الأحدث
    await om([2, 3]);
    assert.deepEqual((await report()).map((r) => r.serialNumber), [S(1)]);
    await new Promise((r) => setTimeout(r, 20));
    await om([3]);
    const g2b = (await pool.query(`SELECT gone_at FROM om_target_112 WHERE serial_number = $1`, [S(2)])).rows[0].gone_at;
    assert.ok(g2b.getTime() > g2.getTime(), "لو ليه وقتين ⇒ الأحدث");
    rep = await report();
    assert.equal(new Set(rep.map((r) => r.serialNumber)).size, rep.length, "مفيش مسلسل متكرر فى التقرير");

    // ملف مافيهوش غنايم ⇒ ٤٠٠ والجدول زى ما هو
    const bad = await upload("/api/om-target-112/import", xlsx({ Abnormal: [HEAD, row(4, "ASYAT")] }));
    assert.equal(bad.status, 400);
    assert.equal((await summary()).total, 3);

    // رفعة تانية للشيت ⇒ بتستبدل الجدول كله
    const up2 = await upload("/api/om-target-112/import", xlsx({ Abnormal: [HEAD, row(3, "AMZAT"), row(6, "NGOAT")] }));
    assert.equal(up2.json.inserted, 2);
    assert.deepEqual((await report()).map((r) => r.serialNumber), [S(6)]);
    assert.equal((await summary()).total, 2);
  } finally {
    await cleanup().catch(() => {});
    await new Promise((r) => httpServer.close(() => r(null)));
  }
});
