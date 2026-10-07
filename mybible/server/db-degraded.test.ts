import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import test from "node:test";
import express from "express";
import session from "express-session";
import signature from "cookie-signature";
import { isDbUnavailable, isReadRequest } from "./db-availability";
import { _resetSnapshotForTest, snapshotBooks, snapshotVerses, verifySnapshotBooks, verifySnapshotVerses } from "./bible-snapshot";
import { buildSnapshot, parseCsv } from "../script/build-bible-snapshot";

// ٢٠٢٦-١٠-٠٧: Supabase وقف الطلبات. القراءة لازم تكمّل، وهوية العضو (الكوكى) ماتتلمسش.

test("only real availability errors count as 'database down'", () => {
  assert.equal(isDbUnavailable(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })), true);
  assert.equal(isDbUnavailable(new Error("timeout exceeded when trying to connect")), true);
  assert.equal(isDbUnavailable(new Error("Connection terminated unexpectedly")), true);
  assert.equal(isDbUnavailable(Object.assign(new Error("x"), { code: "57P01" })), true);
  assert.equal(isDbUnavailable(new Error("wrapped", { cause: new Error("connection refused") })), true);
  // غلطة استعلام حقيقية لازم تفضل غلطة
  assert.equal(isDbUnavailable(Object.assign(new Error('relation "users" does not exist'), { code: "42P01" })), false);
  assert.equal(isDbUnavailable(null), false);
  assert.equal(isReadRequest("GET"), true);
  assert.equal(isReadRequest("POST"), false);
});

test("member with a cookie: the page still opens, and NO new cookie is sent", async () => {
  // نفس اللف اللى فى index.ts، مع store بيرمى زى القاعدة الواقعة
  const store = new session.MemoryStore();
  store.get = (_sid: string, cb: (err: any) => void) => cb(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
  const secret = "s".repeat(32);
  const mw = session({ store, secret, resave: false, saveUninitialized: false });
  const app = express();
  app.use((req, res, next) => {
    mw(req, res, (err?: any) => {
      if (err && isReadRequest(req.method) && isDbUnavailable(err) && !(req as any).session) return next();
      next(err);
    });
  });
  app.get("/api/tafsir/x", (req, res) => res.json({ ok: true, hasSession: !!(req as any).session }));
  app.post("/api/groups/x/reading", (_req, res) => res.json({ ok: true }));
  app.use((err: any, _req: any, res: any, _next: any) => res.status(500).json({ error: err.message }));
  const srv = app.listen(0);
  const port = (srv.address() as any).port;
  try {
    // كوكى عضو حقيقى (موقّع بنفس السر) — عشان express-session يروح يقراه من القاعدة فعلاً
    const cookie = "connect.sid=" + encodeURIComponent("s:" + signature.sign("member-sid-123", secret));
    const r = await fetch(`http://127.0.0.1:${port}/api/tafsir/x`, { headers: { cookie } });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, hasSession: false });
    assert.equal(r.headers.get("set-cookie"), null, "هوية العضو: مفيش كوكى جديد");
    // الكتابة لازم تفضل بتفشل (مانسجّلش قراءة باسم مجهول)
    const w = await fetch(`http://127.0.0.1:${port}/api/groups/x/reading`, { method: "POST", headers: { cookie } });
    assert.equal(w.status, 500);
  } finally { srv.close(); }
});

test("Bible text falls back to the exported snapshot with the database's exact ids", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-"));
  const books = path.join(dir, "b.csv"), verses = path.join(dir, "v.csv");
  fs.writeFileSync(books, "id,name,testament,book_order,chapters_count\n7,التكوين,old,1,1\n12,متى,new,40,1\n");
  fs.writeFileSync(verses, 'id,book_id,chapter,verse,text\n900,7,1,2,"وكانت الأرض خربة, وخالية"\n899,7,1,1,"فى البدء خلق الله ""السماوات"" والأرض"\n5000,12,1,1,كتاب ميلاد\n');
  const { books: b, verses: v } = buildSnapshot(books, verses);
  const file = path.join(dir, "bible.json.gz");
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({ books: b, verses: v })));
  _resetSnapshotForTest(file);
  assert.deepEqual(snapshotBooks()!.map((x) => [x.id, x.name]), [[7, "التكوين"], [12, "متى"]]);
  const gen = snapshotVerses(7)!;
  assert.deepEqual(gen.map((x) => [x.id, x.verse]), [[899, 1], [900, 2]]);   // مترتّبة بالآية
  assert.equal(gen[0].text, 'فى البدء خلق الله "السماوات" والأرض');
  assert.equal(gen[1].text, "وكانت الأرض خربة, وخالية");
  _resetSnapshotForTest(path.join(dir, "missing.json.gz"));
  assert.equal(snapshotBooks(), null, "من غير ملف: كل حاجة زى الأول");
});

test("the snapshot builder rejects broken exports", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-"));
  const books = path.join(dir, "b.csv"), verses = path.join(dir, "v.csv");
  fs.writeFileSync(books, "id,name,testament,book_order,chapters_count\n7,التكوين,old,1,50\n8,الخروج,old,2,40\n");
  fs.writeFileSync(verses, "id,book_id,chapter,verse,text\n1,7,1,1,نص\n");
  assert.throws(() => buildSnapshot(books, verses), /أسفار من غير آيات/);
  fs.writeFileSync(verses, "id,book_id,chapter,verse,text\n1,7,1,1,نص\n1,8,1,1,نص\n");
  assert.throws(() => buildSnapshot(books, verses), /مكرر/);
  // إصحاحات ناقصة (تصدير اتقطع فى نص سفر)
  fs.writeFileSync(books, "id,name,testament,book_order,chapters_count\n7,التكوين,old,1,50\n");
  fs.writeFileSync(verses, "id,book_id,chapter,verse,text\n1,7,1,1,نص\n");
  assert.throws(() => buildSnapshot(books, verses), /ناقصة إصحاحات: التكوين \(1\/50\)/);
  assert.deepEqual(parseCsv('a,"b\nc",d\n'), [["a", "b\nc", "d"]]);
});

test("the snapshot switches itself off if the live database ever disagrees with it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-"));
  const file = path.join(dir, "bible.json.gz");
  fs.writeFileSync(file, zlib.gzipSync(JSON.stringify({
    books: [{ id: 1, name: "التكوين", testament: "old", bookOrder: 1, chaptersCount: 1 }],
    verses: [[10, 1, 1, 1, "أ"], [11, 1, 1, 2, "ب"]],
  })));
  _resetSnapshotForTest(file);
  verifySnapshotBooks([{ id: 1, name: "التكوين" }, { id: 67, name: "طوبيا" }]);   // سفر زيادة فى القاعدة: مش اختلاف
  verifySnapshotVerses(1, [{ id: 10, chapter: 1, verse: 1 }, { id: 11, chapter: 1, verse: 2 }]);
  assert.ok(snapshotBooks(), "مطابق ⇒ شغّال");
  verifySnapshotVerses(1, [{ id: 10, chapter: 1, verse: 1 }, { id: 99, chapter: 1, verse: 2 }]);
  assert.equal(snapshotBooks(), null, "id مختلف ⇒ اتوقف");
  assert.equal(snapshotVerses(1), null);
  _resetSnapshotForTest(file);
  verifySnapshotBooks([{ id: 1, name: "الخروج" }]);
  assert.equal(snapshotBooks(), null, "سفر باسم تانى ⇒ اتوقف");
});

test("the committed snapshot is the database export: 66 books, 31,102 verses, original ids", () => {
  _resetSnapshotForTest(path.join(process.cwd(), "data", "bible-snapshot", "bible.json.gz"));
  const books = snapshotBooks()!;
  assert.equal(books.length, 66);
  assert.deepEqual([books[0].id, books[0].name, books[65].name], [1, "التكوين", "رؤيا يوحنا"]);
  let total = 0;
  for (const b of books) total += snapshotVerses(b.id)!.length;
  assert.equal(total, 31102);
  assert.equal(snapshotVerses(1)![0].id, 1);
  assert.match(snapshotVerses(1)![0].text, /فِي ٱلْبَدْءِ/);
});
