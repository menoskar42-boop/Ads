// «صور الحروف» و«اكتب من الذاكرة» (المالك ٢٠٢٦-١٠-٢٦)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { picturesFor, starredLetters, pickableLetters, picRounds, writePlan, recallPhrases } from "../js/data/letterRecall.js";

const bare = (w) => w.replace(/[ً-ْ]/g, "");

test("ل has the pictures from the owner's book page (لسان · ليمون · لعبة · لؤلؤ · لبن · لحم)", () => {
  const ws = picturesFor("ar", "ل").map((p) => p.w);
  for (const w of ["لسان", "ليمون", "لعبة", "لؤلؤ", "لبن", "لحم"]) assert.ok(ws.includes(w), w);
});

test("every picture really starts with its letter, and every letter has at least 2", () => {
  for (const lang of ["ar", "en"]) {
    const letters = pickableLetters(lang);
    assert.ok(letters.length >= (lang === "ar" ? 28 : 20), `${lang}: ${letters.length}`);
    for (const ch of letters) {
      const pics = picturesFor(lang, ch);
      assert.ok(pics.length >= 2, `${lang} ${ch}`);
      for (const p of pics) {
        const first = lang === "ar" ? bare(p.w)[0] : p.w[0].toUpperCase();
        assert.ok(first === ch || (/[أإآا]/.test(first) && /[أإآا]/.test(ch)), `${ch}: ${p.w}`);
        assert.ok(p.e && p.e !== "❓", `${ch}: ${p.w} من غير صورة`);
      }
    }
  }
});

test("starred letters come from the book pages the child finished", () => {
  assert.deepEqual(starredLetters("ar", { "Lل": true, "Lم": true, prep: true, R1: true }), ["م", "ل"]);
  assert.deepEqual(starredLetters("en", { "u1-M": true, "u1-words": true }), ["M"]);
  assert.deepEqual(pickableLetters("ar", ["ل", "م"]).slice(0, 2), ["ل", "م"], "حروف النجمة الأول");
});

test("rounds: the right answer is always among the options, and one round is not the chosen letter", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let k = 0; k < 30; k++) {
    const rs = picRounds("ar", "ل", ["ب", "ل", "م"], rnd);
    assert.equal(rs.length, 6);
    assert.ok(rs.some((r) => r.ch !== "ل"), "الإجابة مش ل كل مرة");
    for (const r of rs) {
      if (r.kind === "letter") { assert.ok(r.options.includes(r.ch)); assert.equal(new Set(r.options).size, 3); }
      else { assert.equal(r.options.filter((o) => o.ch === r.ch).length, 1); }
    }
  }
  assert.ok(picRounds("en", null, ["M", "A", "S"], rnd).every((r) => ["M", "A", "S"].includes(r.ch)));
});

test("write from memory: starred letters only, English alternates capital and small", () => {
  const plan = writePlan("en", ["M", "A", "S"], () => 0.5);
  assert.deepEqual(plan.map((p) => p.glyph).sort(), ["A", "M", "s"].sort().map((g) => g).sort());
  assert.equal(writePlan("ar", [], () => 0.5).length, 0);
  assert.equal(writePlan("ar", ["ل"], () => 0.5)[0].say, "اكتب حرف لام");
});

test("the letter is never shown while the child writes from memory", () => {
  const src = fs.readFileSync(new URL("../js/games/letterRecall.js", import.meta.url), "utf8");
  const wb = fs.readFileSync(new URL("../js/games/writeBoard.js", import.meta.url), "utf8");
  assert.match(src, /hideModel: true/);
  assert.doesNotMatch(src, /`🔊 \$\{t\.say\}`/, "الجملة فيها الحرف — مايتكتبش");
  assert.match(wb, /if \(opts\.hideModel\) mini\.style\.visibility = "hidden";/);
});

test("every spoken phrase is registered for the prebuilt voices", () => {
  const { ar, en } = recallPhrases();
  assert.ok(ar.includes("كلمة لؤلؤ بتبدأ بحرف إيه؟"));
  assert.ok(en.includes("What letter does apple start with?"));
  assert.ok(en.includes("Write small m") && ar.includes("اكتب حرف لام"));
  const tts = fs.readFileSync(new URL("../server/tts-games.js", import.meta.url), "utf8");
  assert.match(tts, /recallPhrases\(\)/);
});
