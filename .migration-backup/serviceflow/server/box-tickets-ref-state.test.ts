// «متعذرات على بكسيات معطلة تم إصلاحها» — حالة المرجع جنب رقمه (المالك ٢٠٢٦-١١-١٣):
// متعذر OM ⇒ «لسه فى المتعذرات الحالية» / «تم فكه» (بالمسلسل زى «متعذرات تم فكها»)،
// طلب ⇒ «يمكن التنفيذ» (بتاريخه) / «لسه مااخدش يمكن التنفيذ». بيشغّل نفس الاستعلام اللى فى routes.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const block = src.slice(src.indexOf('app.get("/api/box-tickets/repaired"'));
const sql = (block.match(/pool\.query\(\s*`([\s\S]*?)`/) || [])[1]
  .replace('${conds.join(" AND ")}', "t.status = 'closed' AND b.ref_key LIKE 'ZZT %'")
  .replace("ORDER BY t.closed_at DESC NULLS LAST", "ORDER BY b.ref_key");

test("repaired box tickets: the SQL carries the reference state", () => {
  assert.match(sql, /AS "refState"/);
  assert.match(sql, /AS "refStateAt"/);
});

test("repaired box tickets: OM serial still current / released, order feasible / not", { skip: !process.env.SERVICEFLOW_TEST_DATABASE_URL }, async () => {
  const { pool } = await import("./db");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL session_replication_role = replica"); // من غير FKs (سنترال/كابل/نوع عطل)
    // المراجع بتتعلّم بـ «ZZT» فى آخرها عشان الاستعلام يجيب صفوف الاختبار بس
    const sql2 = sql.replace("b.ref_key LIKE 'ZZT %'", "b.ref_key LIKE '%ZZT%'");
    const mkTicket = async (n: string) => (await c.query(
      `INSERT INTO tickets (ticket_number, central_department, central_id, cable_id, cabinet, box, fault_type_id, created_by, status, closed_at)
       VALUES ($1,'x','c1','k1','1','1','f1','u1','closed', now()) RETURNING id`, [n])).rows[0].id;
    const o1 = (await c.query(`INSERT INTO orders (customer_name, customer_phone, customer_address, sales_id, sales_name, status, tech_response_at)
       VALUES ('a','1','x',1,'s','feasible', '2026-11-10 10:00+02') RETURNING id`)).rows[0].id;
    const o2 = (await c.query(`INSERT INTO orders (customer_name, customer_phone, customer_address, sales_id, sales_name, status)
       VALUES ('b','2','x',1,'s','not_feasible') RETURNING id`)).rows[0].id;
    await c.query(`INSERT INTO ftth_orders_current (service_order_id, serial_number) VALUES ('SO1','SNZZT1')`);
    const add = async (ref: string, n: string) => c.query(
      `INSERT INTO box_fault_tickets (source, ref_key, ticket_id, ticket_number) VALUES ('x',$1,$2,$3)`, [ref, await mkTicket(n), n]);
    await add("متعذر SNZZT1", "T-ZZT-1");
    await add("متعذر SNZZT2", "T-ZZT-2");
    // طلبات: ref_key «طلب #id» — بنعلّمها بالتكت ونفلتر بيه
    await c.query(`INSERT INTO box_fault_tickets (source, ref_key, ticket_id, ticket_number) VALUES ('x',$1,$2,'T-ZZT-3')`, [`طلب #${o1}`, await mkTicket("T-ZZT-3")]);
    await c.query(`INSERT INTO box_fault_tickets (source, ref_key, ticket_id, ticket_number) VALUES ('x',$1,$2,'T-ZZT-4')`, [`طلب #${o2}`, await mkTicket("T-ZZT-4")]);
    const q = sql2.replace("b.ref_key LIKE '%ZZT%'", "b.ticket_number LIKE 'T-ZZT-%'");
    const { rows } = await c.query(q);
    const by = Object.fromEntries(rows.map((r: any) => [r.ticketNumber, r]));
    assert.equal(by["T-ZZT-1"].refState, "لسه فى المتعذرات الحالية");
    assert.equal(by["T-ZZT-2"].refState, "تم فكه");
    assert.equal(by["T-ZZT-3"].refState, "يمكن التنفيذ");
    assert.ok(by["T-ZZT-3"].refStateAt);
    assert.equal(by["T-ZZT-4"].refState, "لسه مااخدش يمكن التنفيذ");
    assert.equal(by["T-ZZT-4"].refStateAt, null);
  } finally {
    await c.query("ROLLBACK");
    c.release();
    await pool.end();
  }
});
