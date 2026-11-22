import assert from "node:assert/strict";
import test from "node:test";
import session from "express-session";
import { cacheSessionReads } from "./session-cache";

// ٢٠٢٦-١٠-٢٥: الجلسة بتتقري من القاعدة مرة واحدة مش مع كل طلب — ومحتواها نفسه
test("session reads hit the store once, writes go through and refresh the cache", async () => {
  const inner = new session.MemoryStore();
  let reads = 0, touches = 0;
  const realGet = inner.get.bind(inner);
  inner.get = (sid, cb) => { reads++; realGet(sid, cb); };
  const realTouch = inner.touch.bind(inner);
  inner.touch = (sid, sess, cb) => { touches++; realTouch(sid, sess, cb); };
  const store = cacheSessionReads(inner);
  const p = <T>(fn: (cb: (err: any, v?: T) => void) => void) => new Promise<T | undefined>((ok, ko) => fn((e, v) => (e ? ko(e) : ok(v))));

  const sess: any = { cookie: { originalMaxAge: 1000, expires: new Date(Date.now() + 1e9).toISOString() }, userId: "u1" };
  await p((cb) => store.set("a", sess, cb));
  const first: any = await p((cb) => store.get("a", cb));
  const second: any = await p((cb) => store.get("a", cb));
  assert.equal(first.userId, "u1");
  assert.equal(second.userId, "u1");
  assert.equal(reads, 0, "بعد set القراية من الذاكرة");
  first.userId = "changed";
  assert.equal(((await p((cb) => store.get("a", cb))) as any).userId, "u1", "كل قراية نسخة جديدة");

  await p((cb) => store.get("missing", cb));
  await p((cb) => store.get("missing", cb));
  assert.equal(reads, 1, "جلسة مش موجودة بتتسأل مرة");

  await p((cb) => store.set("missing", { ...sess, userId: "u2" }, cb));
  assert.equal(((await p((cb) => store.get("missing", cb))) as any).userId, "u2", "set بيحدّث الذاكرة");

  await p((cb) => store.destroy("a", cb));
  assert.ok((await p((cb) => store.get("a", cb))) == null, "destroy بيشيلها");

  await p((cb) => store.touch!("missing", sess, cb as any));
  await p((cb) => store.touch!("missing", sess, cb as any));
  assert.equal(touches, 1, "touch مرة كل كام ساعة");
});
