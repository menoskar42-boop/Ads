// «خلّى القاعدة تنام» (المالك ٢٠٢٦-١٠-١٣): الجلسة والمستخدم من الذاكرة بدل القاعدة مع كل طلب.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QuietSessionStore, cachedUser, forgetUsers, watchPool, SESSION_TOUCH_EVERY_MS } from "./db-quiet";

function fakeInner() {
  const rows = new Map<string, string>();
  const calls = { get: 0, set: 0, touch: 0, destroy: 0, prune: 0 };
  return {
    calls, rows,
    get(sid: string, cb: any) { calls.get++; const v = rows.get(sid); cb(null, v ? JSON.parse(v) : null); },
    set(sid: string, s: any, cb: any) { calls.set++; rows.set(sid, JSON.stringify(s)); cb(null); },
    touch(_sid: string, _s: any, cb: any) { calls.touch++; cb(null); },
    destroy(sid: string, cb: any) { calls.destroy++; rows.delete(sid); cb?.(null); },
    pruneSessions() { calls.prune++; },
  };
}
const sess = (days = 7) => ({ cookie: { expires: new Date(Date.now() + days * 864e5).toISOString(), originalMaxAge: days * 864e5 }, passport: { user: 7 } }) as any;
const get = (st: QuietSessionStore, sid: string) => new Promise<any>((r) => st.get(sid, (_e, s) => r(s)));

test("الجلسة: أول قراية من القاعدة، وبعدها من الذاكرة — والتمديد مايكتبش مع كل طلب", async () => {
  const inner = fakeInner();
  inner.rows.set("a", JSON.stringify(sess()));
  const st = new QuietSessionStore(inner);
  for (let i = 0; i < 50; i++) {
    const s = await get(st, "a");
    assert.equal(s.passport.user, 7);
    await new Promise<void>((r) => st.touch("a", s, () => r()));
  }
  assert.equal(inner.calls.get, 1, "قراية واحدة من القاعدة لـ٥٠ طلب");
  assert.equal(inner.calls.touch, 0, "مفيش تمديد فى القاعدة قبل ٦ ساعات");
  assert.ok(SESSION_TOUCH_EVERY_MS >= 60 * 60 * 1000);
});

test("تسجيل الدخول/الخروج بيكتب فى القاعدة فوراً، والخروج بيمسح الذاكرة", async () => {
  const inner = fakeInner();
  const st = new QuietSessionStore(inner);
  await new Promise<void>((r) => st.set("b", sess(), () => r()));
  assert.equal(inner.calls.set, 1);
  assert.equal((await get(st, "b")).passport.user, 7);
  assert.equal(inner.calls.get, 0, "اتقرت من الذاكرة بعد الحفظ");
  await new Promise<void>((r) => st.destroy("b", () => r()));
  assert.equal(await get(st, "b"), null);
});

test("جلسة منتهية فى الذاكرة مابتتقبلش", async () => {
  const inner = fakeInner();
  const st = new QuietSessionStore(inner);
  await new Promise<void>((r) => st.set("c", sess(-1), () => r()));
  inner.rows.delete("c");
  assert.equal(await get(st, "c"), null);
});

test("التنضيف: مرة فى اليوم، وبس لما القاعدة صاحية", () => {
  const inner = fakeInner();
  const st = new QuietSessionStore(inner);
  st.maybePrune();
  assert.equal(inner.calls.prune, 0, "مش أول ما السيرفر يقوم");
});

test("المستخدم من الذاكرة، وأى كتابة فى users بتمسحها", async () => {
  forgetUsers();
  let loads = 0;
  const load = async (id: number) => { loads++; return { id, role: "tech" }; };
  for (let i = 0; i < 20; i++) await cachedUser(5, load);
  assert.equal(loads, 1);
  // pool وهمى: watchPool بيلفّ client.query
  const handlers: any[] = [];
  const pool: any = { on: (_ev: string, h: any) => handlers.push(h) };
  watchPool(pool);
  const client: any = { query: (_t: any) => Promise.resolve({ rows: [] }) };
  handlers[0](client);
  await client.query("SELECT 1");
  await cachedUser(5, load);
  assert.equal(loads, 1, "القراية مابتمسحش");
  await client.query({ text: 'update "users" set "role" = $1 where "id" = $2' });
  await cachedUser(5, load);
  assert.equal(loads, 2, "تعديل المستخدم (drizzle) بيمسح الذاكرة");
  await client.query("UPDATE users SET mobile = $1 WHERE username = $2");
  await cachedUser(5, load);
  assert.equal(loads, 3);
});

test("موصّل فى السيرفر: الجلسة والمستخدم والتنضيف", () => {
  const r = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
  const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  assert.match(r, /pruneSessionInterval: false/);
  assert.match(r, /new QuietSessionStore\(new PgSession\(/);
  assert.match(r, /cachedUser\(id, \(i\) => storage\.getUser\(i\)\)/);
  assert.match(r, /quietSessions\?\.maybePrune\(\)/);
  assert.match(db, /watchPool\(archivePool\);/);
});
