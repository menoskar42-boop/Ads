// المالك ٢٠٢٦-١١-١١: «تحفظ تقدّم الطفل فى حرف معين فى كراسة الحروف أو الإنجليزى أو الأرقام … نطلع وندخل تانى تلاقى
// واقفين عند نفس المرحلة ميبدأش من الأول». `node --test mykid/tests/page-resume.test.mjs`
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { Store } = await import("../js/core/storage.js");

test("the step reached inside a page is saved and comes back, and is cleared when the page is done", () => {
  const steps = [{ kind: "video", video: { id: "x" } }, { kind: "write", n: 6, level: 1 }, { kind: "game", game: "count" }, { kind: "write", n: 6, level: 3 }];
  const res = { writes: [100], writeFails: 0, games: {}, acts: {}, skipped: [], expectedWrites: 2, expectedGames: ["count"] };
  assert.equal(Store.pageResume("num:6"), null);
  Store.savePageResume("num:6", steps, 2, res);
  const r = Store.pageResume("num:6");
  assert.equal(r.idx, 2); assert.deepEqual(r.steps, steps); assert.deepEqual(r.res.writes, [100]);
  // اتخزّن فعلاً (بعد ما التطبيق يتقفل ويتفتح)
  assert.ok([...mem.values()].some((v) => v.includes('"num:6"')));
  Store.clearPageResume("num:6");
  assert.equal(Store.pageResume("num:6"), null);
});

test("nothing is saved for steps that can't be stored, at the first step, or when old", () => {
  Store.savePageResume("ar:b", [{ kind: "x", f: () => 1 }, { kind: "y" }], 1, null);
  assert.equal(Store.pageResume("ar:b"), null, "دالة جوّه الخطوة ⇒ يبدأ من الأول زى الأول");
  Store.savePageResume("ar:b", [{ kind: "x" }, { kind: "y" }], 0, null);
  assert.equal(Store.pageResume("ar:b"), null, "أول خطوة = مفيش حاجة تتحفظ");
  Store.savePageResume("en:A", [{ kind: "x" }, { kind: "y" }], 1, null);
  Store.state.pageResume["en:A"].at = Date.now() - 15 * 86400000;
  assert.equal(Store.pageResume("en:A"), null, "أقدم من ١٤ يوم");
});

test("the three books restore on open, save after each step, and clear on finish", () => {
  for (const [f, pfx] of [["letterbook", "ar"], ["englishbook", "en"], ["workbook", "num"]]) {
    const s = readFileSync(new URL(`../js/games/${f}.js`, import.meta.url), "utf8");
    assert.ok(s.includes(`"${pfx}:" + cur.id`), f);
    assert.match(s, /const saved = resumeKey\(\) && Store\.pageResume\(resumeKey\(\)\);/, f);
    assert.match(s, /if \(resumeKey\(\)\) Store\.savePageResume\(resumeKey\(\), steps, idx, res\);/, f);
    assert.match(s, /function finishPage\(\) \{\n    if \(resumeKey\(\)\) Store\.clearPageResume\(resumeKey\(\)\);/, f);
  }
});
