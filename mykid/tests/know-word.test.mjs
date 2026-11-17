// «أعرف الكلمة» (خطة ١٣/١٤/١٨ — موافقة المالك ٢٠٢٦-١١-١٧): الحساب من غير شاشة
import test from "node:test";
import assert from "node:assert/strict";
import { wordPool, allPictures, planRounds, recordAnswer, wordStatus, knowSummary, kwKey, buildable } from "../js/data/knowWord.js";
import { weeklyReport } from "../js/data/weeklyReport.js";

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test("الكلمات = صور حروف النجمة بس، من غير تكرار", () => {
  const ar = wordPool("ar", ["ب", "ت"]);
  assert.ok(ar.length >= 4);
  assert.ok(ar.every((p) => ["ب", "ت"].includes(p.ch)));
  assert.equal(new Set(ar.map((p) => p.w)).size, ar.length);
  const en = wordPool("en", ["M", "A"]);
  assert.ok(en.some((p) => p.w === "mom" && p.img === "book/en/mom.webp"), "صورة الكتاب");
  assert.deepEqual(wordPool("ar", []), []);
});

test("الكلمة «اتعرفت» بعد صح فى اسمع وشوف فى يومين مختلفين، والغلط بيرجّعها ضعيفة لحد صح مرتين", () => {
  let r = recordAnswer(null, "hear", true, "2026-11-17");
  assert.equal(wordStatus(r), "learning");
  r = recordAnswer(r, "see", true, "2026-11-17");
  assert.equal(wordStatus(r), "learning", "نفس اليوم مايكفيش");
  r = recordAnswer(r, "hear", true, "2026-11-18");
  assert.equal(wordStatus(r), "known");
  r = recordAnswer(r, "see", false, "2026-11-19");
  assert.equal(wordStatus(r), "weak");
  r = recordAnswer(r, "see", true, "2026-11-19");
  assert.equal(wordStatus(r), "weak");
  r = recordAnswer(r, "hear", true, "2026-11-20");
  assert.equal(wordStatus(r), "known");
  assert.equal(wordStatus(undefined), "new");
});

test("الجلسة: ٨ جولات · الضعيف الأول · ٤ صور فى اسمع و٣ أصوات فى شوف · التركيب بحروف الكلمة", () => {
  const pool = wordPool("ar", ["ب", "ت", "س"]);
  const weakWord = pool[pool.length - 1];
  const stats = { [kwKey("ar", weakWord.w)]: { hear: ["2026-11-10"], see: [], build: [], miss: 1, streak: 0, lastWrong: "2026-11-16" } };
  const rounds = planRounds("ar", pool, stats, seq([0.3, 0.7, 0.1, 0.9, 0.5]), 8, allPictures("ar"));
  assert.equal(rounds.length, 8);
  assert.equal(rounds[0].target.w, weakWord.w, "الضعيف أول واحد");
  for (const r of rounds) {
    if (r.kind === "hear") { assert.equal(r.options.length, 4); assert.equal(new Set(r.options.map((o) => o.e)).size, 4, "صور مختلفة"); }
    if (r.kind === "see") assert.equal(r.options.length, 3);
    if (r.kind !== "build") assert.ok(r.options.includes(r.target));
    if (r.kind === "build") { assert.ok(buildable(r.target.w)); assert.deepEqual([...r.tiles].sort(), [...r.target.w].sort()); }
  }
  assert.ok(rounds.some((r) => r.kind === "build") && rounds.some((r) => r.kind === "see"));
});

test("حرف نجمة واحد: الاختيارات الغلط بتيجى من باقى الحروف", () => {
  const pool = wordPool("en", ["M"]);
  const rounds = planRounds("en", pool, {}, Math.random, 8, allPictures("en"));
  assert.equal(rounds.length, 8);
  assert.ok(rounds.filter((r) => r.kind === "hear").every((r) => r.options.length === 4));
});

test("تقرير ولى الأمر: كلمات عرفها وكلمات لسه بيلخبط فيها", () => {
  const stats = {
    "ar:سمكة": { hear: ["2026-11-16"], see: ["2026-11-17"], streak: 2 },
    "ar:بطة": { hear: [], see: [], miss: 2, streak: 0, lastWrong: "2026-11-17" },
  };
  const s = knowSummary(stats);
  assert.deepEqual(s, { known: ["سمكة"], weak: ["بطة"] });
  const rep = weeklyReport({ now: new Date("2026-11-17T12:00:00"), words: s });
  assert.ok(rep.strengths.some((x) => x.includes("عرف اسم 1 كلمة") && x.includes("سمكة")));
  assert.ok(rep.needs.some((x) => x.includes("بيلخبط فى اسمها") && x.includes("بطة")));
});
