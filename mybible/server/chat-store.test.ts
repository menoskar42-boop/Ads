import assert from "node:assert/strict";
import test from "node:test";
import { chatAppend, chatDrop, chatPatch, chatRemove, getChat, groupIdByCode } from "./chat-store";

// ٢٠٢٦-١٠-٢٥: الشات بيتقري من القاعدة مرة لكل مجموعة، وكل كتابة بتتحدّث فى الذاكرة
const msg = (id: number, extra: object = {}) => ({ id, userName: "a", message: `m${id}`, imageUrl: null, reactions: [], isPinned: false, ...extra });

test("chat loads once and every write updates the in-memory copy", async () => {
  let loads = 0;
  const load = async () => { loads++; return [msg(1), msg(2)]; };
  const [a, b] = await Promise.all([getChat(7, load), getChat(7, load)]);
  assert.equal(loads, 1, "طلبين فى نفس اللحظة = تحميل واحد");
  assert.deepEqual(a, b);

  chatAppend(7, msg(3));
  chatPatch(7, 1, { isPinned: true });
  chatRemove(7, 2);
  const now = await getChat(7, load);
  assert.equal(loads, 1, "من غير تحميل تانى");
  assert.deepEqual(now.map((m) => m.id), [1, 3]);
  assert.equal(now[0].isPinned, true);

  chatDrop(7);
  await getChat(7, load);
  assert.equal(loads, 2, "بعد المسح بيحمّل من القاعدة");
});

test("a write during loading never leaves a stale copy", async () => {
  let release!: (v: any) => void;
  let loads = 0;
  const slow = () => { loads++; return new Promise<any>((r) => { release = r; }); };
  const p = getChat(9, slow);
  chatAppend(9, msg(5)); // وقت التحميل ⇒ النسخة بتتمسح
  release([msg(4)]);
  await p;
  await getChat(9, async () => { loads++; return [msg(4), msg(5)]; });
  assert.equal(loads, 2, "التحميل القديم ماتحفظش");
});

test("group code → id is remembered, missing groups are not", async () => {
  let q = 0;
  assert.equal(await groupIdByCode("abc", async () => { q++; return 3; }), 3);
  assert.equal(await groupIdByCode("ABC", async () => { q++; return 3; }), 3);
  assert.equal(q, 1);
  assert.equal(await groupIdByCode("zzz", async () => { q++; return null; }), null);
  assert.equal(await groupIdByCode("zzz", async () => { q++; return null; }), null);
  assert.equal(q, 3, "مجموعة مش موجودة بتتسأل كل مرة");
});
