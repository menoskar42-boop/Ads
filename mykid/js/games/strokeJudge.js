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
