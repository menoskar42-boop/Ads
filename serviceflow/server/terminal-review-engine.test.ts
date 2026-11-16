// منطق «مراجعة البكس ترمنال بترمنال» — حالات قرارات المالك (docs/SF_BOX_TERMINAL_REVIEW_PLAN.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { reviewTerminals, terminalNo, type TerminalState } from "../shared/terminal-review";

const st = (m: Record<number, TerminalState>) => m;

test("terminal numbers: Arabic digits, padding, prefixes", () => {
  assert.equal(terminalNo("٠٧"), 7);
  assert.equal(terminalNo("T 3"), 3);
  assert.equal(terminalNo(""), null);
  assert.equal(terminalNo("0"), null);
});

test("one hot terminal without a line + one line on a dead terminal ⇒ the line moves there", () => {
  const r = reviewTerminals(10, st({ 1: "hot", 2: "hot", 3: "none" }), [
    { phone: "a", terminal: "1" }, { phone: "b", terminal: "3" },
  ]);
  assert.deepEqual(r.moves, [{ phone: "b", from: "3", to: 2, reason: "hot" }]);
  assert.equal(r.countDiff, 0);
  assert.deepEqual(r.hotWithoutLine, []);
  assert.deepEqual(r.leftoverOnNone, []);
});

test("lines with no/out-of-range terminal are used first, then dead terminals, and wire only when nothing else", () => {
  const r = reviewTerminals(10, st({ 1: "hot", 2: "hot", 3: "hot", 4: "wire", 5: "none" }), [
    { phone: "x", terminal: "" }, { phone: "y", terminal: "5" }, { phone: "w", terminal: "4" },
  ]);
  assert.deepEqual(r.moves.map((m) => [m.phone, m.to]), [["x", 1], ["y", 2], ["w", 3]]);
  assert.deepEqual(r.onWire, []);
});

test("a line on «wire» stays when a dead-terminal line can fill the hot one (decision 4)", () => {
  const r = reviewTerminals(10, st({ 1: "hot", 2: "wire", 3: "none" }), [
    { phone: "w", terminal: "2" }, { phone: "n", terminal: "3" },
  ]);
  assert.deepEqual(r.moves.map((m) => m.phone), ["n"]);
  assert.deepEqual(r.onWire.map((l) => l.phone), ["w"]);
});

test("equal counts: leftovers on dead terminals go to empty «wire» terminals (decision 5)", () => {
  // الفنى: ٢ حرارة (١ و٢) · البيانات: ٢ خطوط، واحد على ١ وواحد على ٥ (لا سلك) — و٢ عليه خط قبل كده؟ لأ
  const r = reviewTerminals(10, st({ 1: "hot", 2: "hot", 3: "wire", 5: "none", 6: "none" }), [
    { phone: "a", terminal: "1" }, { phone: "b", terminal: "2" }, { phone: "c", terminal: "6" },
  ]);
  // ٣ خطوط و٢ حرارة ⇒ مش متساوى ⇒ c يفضل فرق
  assert.equal(r.countDiff, 1);
  assert.deepEqual(r.leftoverOnNone.map((l) => l.phone), ["c"]);
  const eq = reviewTerminals(10, st({ 1: "hot", 2: "hot", 3: "wire", 5: "none" }), [
    { phone: "a", terminal: "1" }, { phone: "b", terminal: "2" },
  ]);
  assert.deepEqual(eq.moves, []);
  // متساوى وفيه خط زيادة على «لا سلك» بعد ملء الحرارة
  const eq2 = reviewTerminals(10, st({ 1: "hot", 2: "hot", 3: "wire", 4: "none" }), [
    { phone: "a", terminal: "1" }, { phone: "b", terminal: "4" },
  ]);
  assert.deepEqual(eq2.moves.map((m) => [m.phone, m.to]), [["b", 2]]);
});

test("count differences are reported for the area technician", () => {
  const r = reviewTerminals(10, st({ 1: "hot", 2: "hot", 3: "hot" }), [{ phone: "a", terminal: "1" }]);
  assert.equal(r.countDiff, -2);
  assert.deepEqual(r.hotWithoutLine, [2, 3]);
});
