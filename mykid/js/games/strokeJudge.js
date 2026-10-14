// ===== الحكم على «كتب الخط صح»: نقطة البداية + الاتجاه + لآخر الخط =====
//
// المالك ٢٠٢٦-١٠-١٠ (بنته ٤ سنين بتتعلّم الكتابة): الحكم القديم (`traceJudge.js`)
// بيقيس «غطّى الحرف ولا لأ» بس — فالحرف ممكن يترسم من تحت لفوق أو بالعكس ويتقال
// «برافو». وده بيبوّظ الخط بعدين. هنا كل خط ليه:
//   • نقطة بداية — لازم الصباع ينزل عندها.
//   • اتجاه — التقدّم على الخط لازم يزيد (مش يرجع لورا).
//   • نهاية — لازم يكمّل لآخره قبل ما يرفع صباعه.
//   • ومايخرجش بعيد عن الخط.
//
// Kotlin-free / DOM-free: دوال صافية بتتقاس فى node (`mykid/tests/stroke-judge.test.mjs`).
// الإحداثيات من ٠ لـ١٠٠ (مربع الكتابة)، y لتحت.

/** سماحية كل مستوى (بوحدات المربع ١٠٠). المستوى ٣ = مربع فاضى ⇒ سماحية أوسع. */
export const LEVELS = {
  1: { start: 12, off: 10, back: 8 },
  2: { start: 13, off: 12, back: 9 },
  3: { start: 16, off: 15, back: 10 },
};
/** النقطة (زى نقط ب/ت) بتتلمس بس — دايرة حوالين مكانها. */
export const DOT_RADIUS = 11;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** نقط متساوية المسافات (كل `step` وحدة) — عشان «التقدّم» يبقى بالطول مش بعدد النقط. */
export function densify(points, step = 1) {
  if (points.length < 2) return points.map((p) => [p[0], p[1]]);
  const out = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const d = dist(a, b);
    const n = Math.max(1, Math.round(d / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * (k / n), a[1] + (b[1] - a[1]) * (k / n)]);
  }
  return out;
}

/** طول تراكمى لكل نقطة. */
export function cumulative(pts) {
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]));
  return s;
}

/**
 * أقرب نقطة على الخط — بس فى «شبّاك» حوالين التقدّم الحالى. من غيره الدايرة (O / ٠ / ه)
 * والـ٨ كانوا بيتحسبوا خلصانين أول ما الصباع يلمس آخرهم (اللى هو نفس أولهم).
 */
export function projectLocal(pts, cum, p, fromLen, toLen) {
  let best = { d: Infinity, s: 0 };
  for (let i = 1; i < pts.length; i++) {
    if (cum[i] < fromLen || cum[i - 1] > toLen) continue;
    const a = pts[i - 1], b = pts[i];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy || 1e-9;
    let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = [a[0] + vx * t, a[1] + vy * t];
    const d = dist(p, q);
    if (d < best.d) best = { d, s: cum[i - 1] + (cum[i] - cum[i - 1]) * t };
  }
  return best;
}

/**
 * خط واحد. الاستخدام: begin(p) → move(p)… → end().
 * النتايج: 'ok' · 'wrong-start' · 'off-path' · 'backwards' · 'too-short'.
 */
export class StrokeTracker {
  constructor(stroke, level = 1) {
    this.tol = LEVELS[level] || LEVELS[1];
    this.isDot = stroke.length === 1;
    this.pts = this.isDot ? stroke : densify(stroke, 1);
    this.cum = cumulative(this.pts);
    this.len = this.cum[this.cum.length - 1];
    this.progress = 0;
    this.result = null;
    this.offRun = 0;
  }

  get start() { return this.pts[0]; }

  /** نسبة اللى اتكتب من الخط (للرسم والتشجيع). */
  get fraction() { return this.isDot ? (this.result === "ok" ? 1 : 0) : Math.min(1, this.progress / (this.len || 1)); }

  begin(p) {
    this.progress = 0;
    this.offRun = 0;
    this.result = null;
    if (this.isDot) {
      this.result = dist(p, this.pts[0]) <= DOT_RADIUS ? "ok" : "wrong-start";
      return this.result;
    }
    if (dist(p, this.pts[0]) > this.tol.start) { this.result = "wrong-start"; return this.result; }
    return null;
  }

  /** بيرجع null طول ما الخط ماشى، أو نتيجة نهائية لو خرج بعيد أو رجع لورا. */
  move(p) {
    if (this.result) return this.result;
    if (this.isDot) return null;
    const pr = projectLocal(this.pts, this.cum, p, this.progress - this.tol.back - 4, this.progress + 22);
    if (pr.d > this.tol.off) {
      // قراية واحدة بعيدة (رعشة إيد) مش خروج — لازم كذا قراية ورا بعض
      if (++this.offRun >= 4) this.result = "off-path";
      return this.result;
    }
    this.offRun = 0;
    if (pr.s < this.progress - this.tol.back) { this.result = "backwards"; return this.result; }
    if (pr.s > this.progress) this.progress = pr.s;
    return null;
  }

  end() {
    if (this.result) return this.result;
    if (this.isDot) return (this.result = "wrong-start");
    const need = Math.max(0, this.len - Math.min(8, this.len * 0.12));
    this.result = this.progress >= need ? "ok" : "too-short";
    return this.result;
  }
}

/** جملة ميزو لكل نتيجة (بالمذكّر — Speech بيأنّث لوحده للبنت). */
export function hintForResult(r, isDot) {
  switch (r) {
    case "wrong-start": return isDot ? "حط النقطة مكان الدايرة الخضرا" : "ابدأ من النقطة الخضرا";
    case "off-path": return "امشي على الخط بالراحة";
    case "backwards": return "امشي فى اتجاه السهم";
    case "too-short": return "كمّل لآخر الخط";
    // الشكل اترسم كله بس من آخره لأوله (writeBoard بيتابعه بالعكس)
    case "reversed": return "الشكل صح، بس الاتجاه غلط. ابدأ من النقطة الخضرا وامشي مع السهم";
    default: return "";
  }
}

// ===== «لوحده»: الحرف كله يتكتب من غير وقفة، والحكم فى الآخر بنسبة =====
// المالك ٢٠٢٦-١٠-١٣: «ميزو بيشدّ أوى إن الحرف يتكتب بنفس الميل والزوايا … يشوفه صح ولا غلط
// بنسبة … ميوقفوش فى وسط ما هو بيكتب الحرف». فهنا مفيش حكم خط بخط: بنقارن **شكل** اللى
// اتكتب كله بشكل الحرف بعد ما نوحّد المقاس والمكان (حرف صغير أو فى ركن المربع = نفس الحرف)،
// والميل الخفيف بيخصم شوية بس. الخط بالمقلوب بيخصم كتير (الاتجاه مهم للخط بعدين)، وعدد الخطوط شوية.

/** النسبة اللى فوقها الكتابة «صح» (٠–١٠٠). */
export const SCORE_PASS = 70;
/** خط مكتوب بالمقلوب (من آخره لأوله) بيخصم كده — الشكل صح بس الاتجاه لأ ⇒ مابيعدّيش. */
export const REV_PENALTY = 35;

function normalizeSets(sets) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sets) for (const [x, y] of s) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const sc = Math.max(x1 - x0, y1 - y0, 1e-6), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return sets.map((s) => s.map(([x, y]) => [(x - cx) / sc, (y - cy) / sc]));
}
function meanMin(A, B) {
  let sum = 0;
  for (const a of A) {
    let m = Infinity;
    for (const b of B) { const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2; if (d < m) m = d; }
    sum += Math.sqrt(m);
  }
  return A.length ? sum / A.length : 1;
}

const pathLen = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
/** `n` نقطة على مسافات متساوية بطول الخط (نقطة واحدة ⇒ نفسها `n` مرة). */
function resample(p, n) {
  if (p.length < 2) return Array.from({ length: n }, () => p[0]);
  const cum = cumulative(p), L = cum[cum.length - 1] || 1e-9, out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (j < p.length - 1 && cum[j] < s) j++;
    const t = Math.max(0, Math.min(1, (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1e-9)));
    out.push([p[j - 1][0] + (p[j][0] - p[j - 1][0]) * t, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * t]);
  }
  return out;
}

/**
 * نسبة قرب اللى اتكتب (`drawn`: خطوط، كل خط نقط) من الحرف (`model`) — من ٠ لـ١٠٠.
 * بيرجّع { score, shape, reversed, countDiff }.
 */
export function scoreDrawing(model, drawn) {
  const strokes = (drawn || []).filter((s) => s && s.length);
  if (!strokes.length) return { score: 0, shape: 0, reversed: 0, countDiff: model.length };
  const dens = (s) => (s.length === 1 ? s : densify(s, 1.5));
  const nm = normalizeSets(model.map(dens));
  const nd = normalizeSets(strokes.map(dens));
  const M = nm.flat(), D = nd.flat();
  const chamfer = (meanMin(D, M) + meanMin(M, D)) / 2;
  // بالترتيب: كل خط قصاد خطه (نفس العدد) نقطة بنقطة — بيفرّق 3 عن 8 وM عن N
  // (اللى شكلهم «مغطّى» بس الحركة مختلفة)
  let ordered = chamfer, revPairs = 0;
  if (nm.length === nd.length) {
    let sum = 0, wsum = 0;
    for (let i = 0; i < nm.length; i++) {
      const a = resample(nm[i], 32), b = resample(nd[i], 32);
      const w = Math.max(0.05, pathLen(nm[i]));
      let t = 0, tr = 0;
      for (let k = 0; k < 32; k++) {
        t += Math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]);
        tr += Math.hypot(a[k][0] - b[31 - k][0], a[k][1] - b[31 - k][1]);
      }
      // الخط صح بس بالمقلوب ⇒ الشكل بيتحسب، والاتجاه بيخصم تحت
      if (tr < t * 0.6) { t = tr; revPairs++; }
      sum += (t / 32) * w; wsum += w;
    }
    ordered = sum / wsum;
  }
  const d = 0.5 * chamfer + 0.5 * ordered;
  // d≈٠.٠٣ لحرف مكتوب كويس بإيد طفل، و≈٠.٢ لشكل تانى خالص
  const shape = Math.max(0, Math.min(100, Math.round(100 * (1 - (d - 0.035) / 0.17))));
  const reversed = revPairs;
  const countDiff = Math.abs(model.length - strokes.length);
  const score = Math.max(0, Math.min(100, shape - REV_PENALTY * reversed - 10 * countDiff));
  const issue = writingIssue(model, strokes, nm, nd, reversed, shape);
  return { score, shape, reversed, countDiff, issue };
}

// ===== ليه النسبة قليلة؟ (المالك ٢٠٢٦-١٠-١٤: «ميزو يوضّح للطفل سبب المشكلة بطريقة لطيفة») =====
// أهم سبب واحد بس — الطفل الصغير مابيقدرش يصلّح حاجتين مع بعض.
const bbox = (sets) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of sets) for (const [x, y] of s) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { w: x1 - x0, h: y1 - y0 };
};
const isDotLike = (s) => s.length === 1 || pathLen(s) < 6;
function writingIssue(model, drawn, nm, nd, reversed, shape = 100) {
  const db = bbox(drawn), mb = bbox(model);
  if (Math.max(db.w, db.h) < 22 && Math.max(mb.w, mb.h) >= 40) return "tiny";
  const mDots = model.filter((s) => s.length === 1).length;
  const dDots = drawn.filter(isDotLike).length;
  if (drawn.length < model.length) {
    // «فاضل النقط بس» لما الجسم نفسه قريب — غير كده الشكل كله محتاج يتظبط
    if (mDots > dDots && model.length - mDots <= drawn.length - dDots) return shape >= 55 ? "missing-dots" : "shape";
    return "missing";
  }
  if (drawn.length > model.length) return "extra";
  if (reversed > 0) return "reversed";
  // النقط: تحت الحرف ولا فوقه (بالنسبة لنص جسم الحرف)
  const bodyY = (sets, strokes) => {
    const ys = sets.filter((_, i) => !isDotLike(strokes[i])).flat().map((p) => p[1]);
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
  };
  const my = bodyY(nm, model), dy = bodyY(nd, drawn);
  for (let i = 0; i < model.length; i++) {
    if (model[i].length !== 1 || !nd[i]) continue;
    const mBelow = nm[i][0][1] > my, dBelow = nd[i][0][1] > dy;
    if (mBelow !== dBelow) return (mBelow ? "dot-below" : "dot-above") + (mDots > 1 ? "s" : "");
  }
  // بدأ من مكان تانى (الخط الأول)
  if (shape >= 35 && model[0].length > 1 && Math.hypot(nd[0][0][0] - nm[0][0][0], nd[0][0][1] - nm[0][0][1]) > 0.35) return "start";
  // ممطوط أو مضغوط: نسبة العرض للطول بعيدة عن الحرف
  if (mb.w >= 8 && mb.h >= 8 && db.w >= 4 && db.h >= 4) {
    const r = (db.w / db.h) / (mb.w / mb.h);
    if (r > 1.8) return "too-wide";
    if (r < 0.55) return "too-tall";
  }
  return "shape";
}
