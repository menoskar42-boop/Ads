// «أنا عضو 372» من أوله لآخره على Postgres حقيقى (بيتخطّى لو مفيش MYBIBLE_TEST_DATABASE_URL):
//   MYBIBLE_TEST_DATABASE_URL=postgres://… npx tsx --test server/member-claim-db.test.ts
// الجداول من shared/schema.ts (npx drizzle-kit push على القاعدة دى الأول).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const URL = process.env.MYBIBLE_TEST_DATABASE_URL;
if (URL) process.env.DATABASE_URL = URL;
let base = "", server: any, pool: any;
const code = "CLAIMT";

before(async () => {
  if (!URL) return;
  const express = (await import("express")).default;
  const { registerGroupRoutes } = await import("./group-routes");
  pool = (await import("./db-pool")).dbPool;
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  registerGroupRoutes(app);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
});

async function seed() {
  await pool.query(`DELETE FROM group_messages; DELETE FROM group_reading_logs; DELETE FROM group_members; DELETE FROM group_guest_tokens; DELETE FROM group_push_subscriptions; DELETE FROM reading_groups`);
  const { rows: [g] } = await pool.query(
    `INSERT INTO reading_groups (name, group_code, leader_name, leader_key, guest_access_enabled) VALUES ('درس مار مرقس', $1, 'القائد', 'leader-k', true) RETURNING id`, [code]);
  const add = (name: string, key: string, joined: string, phone: string | null = null) => pool.query(
    `INSERT INTO group_members (group_id, user_name, member_key, phone, joined_at) VALUES ($1, $2, $3, $4, $5)`, [g.id, name, key, phone, joined]);
  await add("عضو 372", "k372", "2026-09-01");
  await add("عضو 1001", "k1001", "2026-10-31");
  await add("عضو 50", "k50", "2026-08-01", "01111111111");
  await pool.query(`INSERT INTO group_guest_tokens (token, group_id, group_code, member_number, member_key) VALUES
    ('tok372', $1, $2, 372, 'k372'), ('tok1001', $1, $2, 1001, 'k1001')`, [g.id, code]);
  // قرايات القديمة والجديدة (يوحنا ٣ مقرى فى الاتنين — يتحسب مرة)
  const read = (name: string, book: string, ch: number) => pool.query(
    `INSERT INTO group_reading_logs (group_id, user_name, book, chapter, date) VALUES ($1, $2, $3, $4, '2026-10-31')`, [g.id, name, book, ch]);
  await read("عضو 372", "يوحنا", 1); await read("عضو 372", "يوحنا", 2); await read("عضو 372", "يوحنا", 3);
  await read("عضو 1001", "يوحنا", 3); await read("عضو 1001", "يوحنا", 4);
  return g.id;
}
const post = (body: any) => fetch(`${base}/api/groups/${code}/messages`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const q = async (sql: string, p: any[] = []) => (await pool.query(sql, p)).rows;

test("«انا عضو372» from عضو 1001 merges readings into عضو 372, the browser gets 372 back, and the system replies", { skip: !URL }, async () => {
  const gid = await seed();
  const res = await post({ userName: "عضو 1001", memberKey: "k1001", message: " انا عضو372 " });
  assert.equal(res.status, 200);
  const d: any = await res.json();
  assert.deepEqual([d.claim.ok, d.claim.userName, d.claim.memberKey], [true, "عضو 372", "k372"]);
  // القرايات: ١ ٢ ٣ ٤ على 372 (٣ مرة واحدة)، ومفيش حاجة باسم 1001
  const reads = await q(`SELECT user_name, chapter FROM group_reading_logs WHERE group_id = $1 ORDER BY chapter`, [gid]);
  assert.deepEqual(reads.map((r: any) => `${r.user_name}:${r.chapter}`), ["عضو 372:1", "عضو 372:2", "عضو 372:3", "عضو 372:4"]);
  // العضوية الجديدة اتشالت، وتوكن المتصفح الجديد بيشاور على 372 (فالدخول التلقائى يرجّعه 372)
  assert.deepEqual((await q(`SELECT user_name FROM group_members WHERE group_id = $1 ORDER BY user_name`, [gid])).map((r: any) => r.user_name), ["عضو 372", "عضو 50"]);
  assert.equal((await q(`SELECT member_key FROM group_guest_tokens WHERE token = 'tok1001'`))[0].member_key, "k372");
  const join = await fetch(`${base}/api/groups/${code}/guest-join`, { method: "POST", headers: { cookie: `mbg_guest=${encodeURIComponent(JSON.stringify({ [code]: "tok1001" }))}` } });
  assert.equal(((await join.json()) as any).userName, "عضو 372");
  // الرسالتين: رسالة العضو برقمه الجديد قدام الكل، ورد النظام عليها «تم الدمج»
  const msgs = await q(`SELECT id, user_name, message, reply_to_id, reply_to_user_name FROM group_messages WHERE group_id = $1 ORDER BY id`, [gid]);
  assert.equal(msgs.length, 2);
  assert.deepEqual([msgs[0].user_name, msgs[0].message], ["عضو 1001", "انا عضو372"]);
  assert.equal(msgs[1].user_name, "النظام");
  assert.match(msgs[1].message, /^تم الدمج/);
  assert.deepEqual([msgs[1].reply_to_id, msgs[1].reply_to_user_name], [msgs[0].id, "عضو 1001"]);
});

test("refusals: registered target, extra letters, no key, and nobody can post as «النظام»", { skip: !URL }, async () => {
  const gid = await seed();
  // عضو 50 ليه رقم ⇒ رفض ورد من النظام بالسبب، ومفيش دمج
  const r1: any = await (await post({ userName: "عضو 1001", memberKey: "k1001", message: "أنا عضو 50" })).json();
  assert.equal(r1.claim.ok, false);
  assert.equal(r1.claim.reason, "registered-target");
  assert.equal((await q(`SELECT count(*)::int AS n FROM group_members WHERE group_id = $1`, [gid]))[0].n, 3);
  // حرف زيادة ⇒ رسالة عادية خالص (من غير رد النظام)
  const r2: any = await (await post({ userName: "عضو 1001", memberKey: "k1001", message: "انا عضو 372." })).json();
  assert.equal(r2.claim, undefined);
  // من غير مفتاح ⇒ رسالة عادية
  const r3: any = await (await post({ userName: "عضو 1001", message: "انا عضو 372" })).json();
  assert.equal(r3.claim, undefined);
  assert.equal((await q(`SELECT count(*)::int AS n FROM group_reading_logs WHERE user_name = 'عضو 1001'`))[0].n, 2, "القرايات زى ما هى");
  // «النظام» محجوز
  assert.equal((await post({ userName: "النظام", message: "تم الدمج" })).status, 403);
  const sys = await q(`SELECT count(*)::int AS n FROM group_messages WHERE user_name = 'النظام'`);
  assert.equal(sys[0].n, 1, "رد النظام على الرفض بس");
});
