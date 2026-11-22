// شاشة فنى الصيانة «مراجعة البكس ترمنال بترمنال»: القايمة بتجيب البكسيات اللى اتصانت ومالهاش مراجعة «تم الانتهاء»،
// والسعة من dp_inventory بتطابق رغم اختلاف الكتابة (الجنادلة/الجنادله · ٠٥/5). بيشتغل على قاعدة الاختبار بس.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);

test("maintenance terminal-review list SQL + capacity matching", { skip: !process.env.SERVICEFLOW_TEST_DATABASE_URL }, async () => {
  process.env.MAINTENANCE_DATABASE_URL = process.env.SERVICEFLOW_TEST_DATABASE_URL;
  const db = require("./maintenance/app/database.js");
  const { pool } = await import("./db");
  const route = require("./maintenance/app/routes/terminal_review.js");
  // جداول الصيانة (idempotent) — نفس اللى التطبيق بيعمله وهو بيقوم
  const mdb = require("./maintenance/app/database.js");
  void mdb;
  const tag = "ZZTR" + Date.now();
  try {
    // database.js بيبنى جداول الصيانة لوحده أول ما يتحمّل — نستنى لحد ما يخلص (seed المستخدمين آخر خطوة)
    for (let i = 0; i < 100; i++) {
      const t = await db.get(`SELECT to_regclass('maintenance.maintenance_tasks') AS t,
        (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname = 'maintenance' AND tablename = 'users') AS u`);
      if (t.t && t.u) { const c = await db.get(`SELECT COUNT(*)::int AS c FROM users`); if (c.c > 0) break; }
      await new Promise((r) => setTimeout(r, 200));
    }
    const ex = await db.get(`INSERT INTO exchanges (name) VALUES (?) RETURNING id`, [`الجنادلة ${tag}`]);
    const cab = await db.get(`INSERT INTO cabinets (exchange_id, number) VALUES (?, '5') RETURNING id`, [ex.id]);
    const box = await db.get(`INSERT INTO boxes (cabinet_id, number) VALUES (?, '٠٧') RETURNING id`, [cab.id]);
    const u = await db.get(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const uid = u ? u.id : (await db.get(`INSERT INTO users (username, password, role) VALUES (?, 'x', 'technician') RETURNING id`, [tag])).id;
    const insp = await db.get(`INSERT INTO inspections (box_id, inspector_id) VALUES (?, ?) RETURNING id`, [box.id, uid]);
    const mt = await db.get(`INSERT INTO maintenance_tasks (inspection_id, status, completed_at) VALUES (?, 'completed', now()) RETURNING id`, [insp.id]);
    await pool.query(`INSERT INTO dp_inventory (central, cabinet_no, dp_no, capacity) VALUES ($1, '5', '7', 20)`, [`الجنادله ${tag}`]);

    let rows = (await db.all(route._sql.LIST_SQL)).filter((r: any) => r.task_id === mt.id);
    assert.equal(rows.length, 1);
    // السعة من dp_inventory رغم «الجنادلة/الجنادله» و«٠٧/7»
    assert.deepEqual(await route._capacityOf(rows[0]), { capacity: 20, source: "inventory" });
    // مراجعة «تم الانتهاء» على نفس البكس بكتابة مختلفة ⇒ يختفى من القايمة
    await pool.query(`INSERT INTO box_terminal_reviews (central_name, cabin_number, box_number, capacity, status)
                      VALUES ($1, '5', '7', 20, 'done')`, [`الجنادله ${tag}`]);
    rows = (await db.all(route._sql.LIST_SQL)).filter((r: any) => r.task_id === mt.id);
    assert.equal(rows.length, 0);
  } finally {
    await pool.query(`DELETE FROM box_terminal_reviews WHERE central_name LIKE $1`, [`%${tag}`]);
    await pool.query(`DELETE FROM dp_inventory WHERE central LIKE $1`, [`%${tag}`]);
    await db.run(`DELETE FROM maintenance_tasks WHERE inspection_id IN (SELECT i.id FROM inspections i JOIN boxes b ON b.id = i.box_id JOIN cabinets c ON c.id = b.cabinet_id JOIN exchanges e ON e.id = c.exchange_id WHERE e.name LIKE ?)`, [`%${tag}`]);
    await db.run(`DELETE FROM inspections WHERE box_id IN (SELECT b.id FROM boxes b JOIN cabinets c ON c.id = b.cabinet_id JOIN exchanges e ON e.id = c.exchange_id WHERE e.name LIKE ?)`, [`%${tag}`]);
    await db.run(`DELETE FROM exchanges WHERE name LIKE ?`, [`%${tag}`]);
    await db.run(`DELETE FROM users WHERE username = ?`, [tag]);
    await pool.end();
  }
});
