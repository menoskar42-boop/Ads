// «كمّل الأرقام ١–١٠» (المالك ٢٠٢٦-١٠-٢٦ — لعبة الحضانة)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { missingLineRounds, ML_GAPS, ML_SAY } from "../js/data/missingLine.js";

test("rounds get harder, every missing number is in the stars, decoys are numbers still in the line", () => {
  for (let k = 0; k < 50; k++) {
    const rounds = missingLineRounds();
    assert.deepEqual(rounds.map((r) => r.gaps.length), ML_GAPS);
    assert.ok(!rounds[0].gaps.includes(1), "أول جولة الواحد باين");
    for (const r of rounds) {
      assert.deepEqual([...r.gaps].sort((a, b) => a - b), r.gaps);
      for (const g of r.gaps) assert.ok(r.bank.includes(g));
      assert.equal(r.bank.length, r.gaps.length + 2);
      assert.equal(new Set(r.bank).size, r.bank.length);
      for (const n of r.bank) assert.ok(n >= 1 && n <= 10);
    }
    for (let i = 1; i < rounds.length; i++) assert.notEqual(rounds[i].gaps.join(), rounds[i - 1].gaps.join());
  }
});

test("Mizo's lines are registered for the prebuilt voices, and the game is in the numbers castle", () => {
  const tts = fs.readFileSync(new URL("../server/tts-games.js", import.meta.url), "utf8");
  assert.match(tts, /Object\.values\(ML_SAY\)/);
  assert.ok(Object.values(ML_SAY).every((t) => typeof t === "string" && t.length > 5));
  const acts = fs.readFileSync(new URL("../js/data/activities.js", import.meta.url), "utf8");
  assert.match(acts, /screen: "missingLine"/);
});
