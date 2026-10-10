// الحكم على الخط: البداية + الاتجاه + لآخره — `node --test mykid/tests/stroke-judge.test.mjs`
import assert from "node:assert/strict";
import { test } from "node:test";
import { StrokeTracker, densify, hintForResult } from "../js/games/strokeJudge.js";

/** صباع بيمشى على نقط الخط (كل وحدة) — مع إزاحة اختيارية (رعشة إيد). */
function drive(t, path, { jitter = 0, step = 2 } = {}) {
  const pts = densify(path, step);
  let r = t.begin([pts[0][0] + jitter, pts[0][1]]);
  if (r) return r;
  for (let i = 1; i < pts.length; i++) {
    r = t.move([pts[i][0] + (i % 2 ? jitter : -jitter), pts[i][1]]);
    if (r) return r;
  }
  return t.end();
}

const VERT = [[50, 10], [50, 90]];
const circle = (cx, cy, r, n = 48) =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = -Math.PI / 2 - (i / n) * 2 * Math.PI; // من فوق، عكس عقارب الساعة
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

test("a vertical line written top→bottom is ok", () => {
  assert.equal(drive(new StrokeTracker(VERT), VERT), "ok");
});

test("hand tremor within tolerance is still ok", () => {
  assert.equal(drive(new StrokeTracker(VERT), VERT, { jitter: 5 }), "ok");
});

test("starting far from the green dot is wrong-start", () => {
  const t = new StrokeTracker(VERT);
  assert.equal(t.begin([50, 90]), "wrong-start");
});

test("writing bottom→top is caught (starts at the wrong end)", () => {
  assert.equal(drive(new StrokeTracker(VERT), [[50, 90], [50, 10]]), "wrong-start");
});

test("going down then back up is backwards", () => {
  const t = new StrokeTracker(VERT);
  assert.equal(drive(t, [[50, 10], [50, 60], [50, 30]]), "backwards");
});

test("leaving the line is off-path — but one stray reading is not", () => {
  const t = new StrokeTracker(VERT);
  t.begin([50, 10]);
  for (let y = 11; y <= 40; y++) assert.equal(t.move([50, y]), null);
  assert.equal(t.move([80, 41]), null, "قراية واحدة بعيدة = رعشة");
  assert.equal(t.move([50, 42]), null);
  let r = null;
  for (let k = 0; k < 6 && !r; k++) r = t.move([85, 45 + k]);
  assert.equal(r, "off-path");
});

test("lifting the finger halfway is too-short", () => {
  assert.equal(drive(new StrokeTracker(VERT), [[50, 10], [50, 50]]), "too-short");
});

test("a circle does not count as finished on touching its own end", () => {
  const C = circle(50, 50, 30);
  const t = new StrokeTracker(C);
  t.begin(C[0]);
  // نزل شوية وبعدين قفز لآخر الدايرة (اللى هو جنب أولها)
  for (let i = 1; i <= 4; i++) t.move(C[i]);
  t.move(C[C.length - 2]);
  assert.ok(t.fraction < 0.3, `fraction ${t.fraction}`);
  assert.notEqual(t.end(), "ok");
});

test("a full circle in the right direction is ok", () => {
  const C = circle(50, 50, 30);
  assert.equal(drive(new StrokeTracker(C), C), "ok");
});

test("a circle in the opposite direction fails", () => {
  const C = circle(50, 50, 30);
  const rev = [C[0], ...C.slice(1).reverse()];
  assert.notEqual(drive(new StrokeTracker(C), rev), "ok");
});

test("a dot is a tap near its place", () => {
  assert.equal(new StrokeTracker([[40, 80]]).begin([45, 84]), "ok");
  assert.equal(new StrokeTracker([[40, 80]]).begin([70, 80]), "wrong-start");
});

test("level 3 (blank box) is more forgiving than level 1", () => {
  const p = [56, 22];
  assert.equal(new StrokeTracker(VERT, 1).begin([50 + 14, 10]), "wrong-start");
  assert.equal(new StrokeTracker(VERT, 3).begin([50 + 14, 10]), null);
  assert.equal(new StrokeTracker(VERT, 3).begin(p), null);
});

test("every failure has a hint for Mizo", () => {
  for (const r of ["wrong-start", "off-path", "backwards", "too-short"]) assert.ok(hintForResult(r, false));
  assert.match(hintForResult("wrong-start", true), /النقطة/);
  assert.equal(hintForResult("ok", false), "");
});

// ---------- كل حرف/رقم حقيقى فى التطبيق ----------
import { strokesFor, PREWRITING } from "../js/data/strokes.js";
import { getDataset } from "../js/data/datasets.js";

const glyphOf = (it) => it.char || it.arDigit || it.name;

test("every traceable letter and number has strokes", () => {
  const missing = [];
  for (const key of ["arabic", "english", "numbers", "englishNumbers"]) {
    for (const it of getDataset(key).items) if (!strokesFor(glyphOf(it))) missing.push(`${key}:${glyphOf(it)}`);
  }
  for (const z of ["0", "٠"]) if (!strokesFor(z)) missing.push(z);
  assert.deepEqual(missing, []);
});

test("following each stroke's own path is judged ok — on every level", () => {
  const all = [
    ...["arabic", "english", "numbers", "englishNumbers"].flatMap((k) => getDataset(k).items.map((it) => glyphOf(it))),
    "0", "٠",
  ].map((g) => [g, strokesFor(g)]);
  for (const p of PREWRITING) all.push([p.id, p.strokes]);
  const bad = [];
  for (const [g, strokes] of all) {
    strokes.forEach((st, i) => {
      for (const lvl of [1, 2, 3]) {
        const r = st.length === 1 ? new StrokeTracker(st, lvl).begin(st[0]) : drive(new StrokeTracker(st, lvl), st, { step: 3 });
        if (r !== "ok") bad.push(`${g}#${i + 1}@${lvl}=${r}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test("strokes stay inside the writing box", () => {
  for (const g of ["ي", "ن", "ج", "أ", "Q", "١٥", "20"]) {
    for (const st of strokesFor(g)) for (const [x, y] of st) {
      assert.ok(x >= 2 && x <= 98 && y >= 2 && y <= 98, `${g}: ${x},${y}`);
    }
  }
});

test("writing any stroke in reverse is never accepted", () => {
  const glyphs = ["arabic", "english", "numbers"].flatMap((k) => getDataset(k).items.map((it) => glyphOf(it)));
  const ok = [];
  for (const g of glyphs) strokesFor(g).forEach((st, i) => {
    if (st.length === 1) return;
    const rev = [...st].reverse();
    if (drive(new StrokeTracker(st, 3), rev, { step: 3 }) === "ok") ok.push(`${g}#${i + 1}`);
  });
  assert.deepEqual(ok, []);
});
