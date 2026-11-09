// المالك ٢٠٢٦-١١-٠٥/٠٦: «حرف C بيتكتب كويس وهو بيقول قربنا» · «p مكتوبة كويس ومش مقبولة» · «راجع كل الحروف
// العربى والإنجليزى … علشان ميحصلش اللى حصل مع حرف الc &ح». الاختبار ده بيكتب كل حرف ورقم زى ما الطفل بيكتبه
// (أعرض · أطول · أضيق · مايل · مهزوز · بزوايا بدل المنحنى) ولازم يعدّى — وبيتأكد إن حروف شبه بعض مابتعدّيش مكان بعض.
// `node --test mykid/tests/child-writing.test.mjs`
import assert from "node:assert/strict";
import { test } from "node:test";
import { scoreDrawing, SCORE_PASS, densify } from "../js/games/strokeJudge.js";
import { strokesFor, strokeModels } from "../js/data/strokes.js";
import { fixMsg, ROUND_MSG } from "../js/data/writingPhrases.js";

const best = (glyph, drawn) => Math.max(...strokeModels(strokesFor(glyph)).map((m) => scoreDrawing(m, drawn).score));

const center = (S) => {
  const p = S.flat(), xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};
const T = (S, f) => { const [cx, cy] = center(S); return S.map((s) => s.map(([x, y]) => f(x - cx, y - cy, cx, cy))); };
const stretch = (S, sx, sy) => T(S, (x, y, cx, cy) => [cx + x * sx, cy + y * sy]);
const rot = (S, deg) => {
  const a = (deg * Math.PI) / 180;
  return T(S, (x, y, cx, cy) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
};
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const shake = (S, a) => S.map((s) => s.map(([x, y]) => [x + (rnd() - 0.5) * 2 * a, y + (rnd() - 0.5) * 2 * a]));
const plen = (s) => { let l = 0; for (let i = 1; i < s.length; i++) l += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return l; };
/** بزوايا: الخط بيتمشى نقط قليلة (كل ~١٤ وحدة نقطة) بخطوط مستقيمة بينها — زى إيد بتكتب بالكراسة. */
const angular = (S) => S.map((s0) => {
  if (s0.length < 2) return s0;
  const s = densify(s0, 1);
  const k = Math.max(5, Math.round(plen(s) / 14) + 1);
  return Array.from({ length: k }, (_, i) => s[Math.round(((s.length - 1) * i) / (k - 1))]);
});
const VARIANTS = {
  "كما هو": (S) => S,
  "أعرض": (S) => stretch(S, 1.45, 1),
  "أطول": (S) => stretch(S, 1, 1.35),
  "أضيق": (S) => stretch(S, 0.7, 1),
  "مايل يمين": (S) => rot(S, 8),
  "مايل شمال": (S) => rot(S, -8),
  "مهزوز": (S) => shake(S, 2),
  "بزوايا": (S) => angular(S),
  "عريض بزوايا": (S) => angular(stretch(S, 1.4, 1.05)),
  "طويل بزوايا": (S) => angular(stretch(S, 0.85, 1.2)),
};
const GLYPHS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", ..."abcdefghijklmnopqrstuvwxyz", ..."0123456789",
  ..."ابتثجحخدذرزسشصضطظعغفقكلمنهوي", ..."٠١٢٣٤٥٦٧٨٩"].filter((g) => strokesFor(g));

test("every letter and digit written the way a child writes it passes", () => {
  assert.ok(GLYPHS.length >= 100, `${GLYPHS.length} glyphs`);
  const fails = [];
  for (const g of GLYPHS) {
    for (const [name, f] of Object.entries(VARIANTS)) {
      const s = best(g, f(strokesFor(g)));
      if (s < SCORE_PASS) fails.push(`${g} ${name} = ${s}`);
    }
  }
  assert.deepEqual(fails, []);
});

// الكتابة الحقيقية من صور المالك (اتنقلت لإحداثيات المربع ٠–١٠٠)
test("the owner's real C (60 · 50 · 54%) and p (61%) now pass", () => {
  const C = [
    [[[70, 26], [31, 20], [17, 32], [13, 48], [21, 66], [41, 76], [67, 84], [79, 78]]],
    [[[76, 26], [47, 29], [34, 38], [33, 54], [39, 65], [56, 69], [77, 68]]],
    [[[74, 29], [46, 31], [29, 41], [27, 56], [33, 69], [53, 73], [79, 68]]],
  ];
  for (const d of C) assert.ok(best("C", d) >= SCORE_PASS, `C ${best("C", d)}`);
  const p = [[[31, 54], [34, 96]], [[30, 55], [38, 44], [51, 46], [59, 56], [59, 68], [44, 78], [40, 72]]];
  assert.ok(best("p", p) >= SCORE_PASS, `p ${best("p", p)}`);
});

test("letters that look alike still don't pass for each other", () => {
  // [المطلوب، اللى اتكتب]
  const pairs = [["b", "d"], ["d", "b"], ["p", "q"], ["q", "p"], ["M", "N"], ["N", "M"], ["m", "n"], ["n", "m"],
    ["n", "h"], ["n", "u"], ["u", "n"], ["6", "9"], ["9", "6"], ["ب", "ن"], ["ح", "ع"], ["ر", "د"]];
  // (معروف من قبل: حرف ناقص خط كامل — F مكان E — بيخصم ١٠ بس، لأن الأطفال ساعات بيوصلوا خطين فى خط واحد)
  const bad = pairs.filter(([want, wrote]) => best(want, strokesFor(wrote)) >= SCORE_PASS)
    .map(([want, wrote]) => `${wrote} passed as ${want} (${best(want, strokesFor(wrote))})`);
  assert.deepEqual(bad, []);
});

test("Mizo's shape hint says «شكل الحرف» (not «الحرف الصغير»), and recall has its own line", () => {
  assert.ok(!ROUND_MSG.fixShape.includes("الصغير"));
  assert.equal(fixMsg("shape"), ROUND_MSG.fixShape);
  assert.equal(fixMsg("shape", false, true), ROUND_MSG.fixShapeRecall);
  assert.ok(!ROUND_MSG.fixShapeRecall.includes("فوق"), "«اكتب من الذاكرة» مفيش حرف فوق");
});
