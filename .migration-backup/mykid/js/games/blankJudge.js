// ===== الحكم على «كتب الحرف فى المربع الفاضى» — «كمّل الكلمة بإيدك» المستوى ٣ (المالك ٢٠٢٦-١٠-٣١) =====
//
// فى المستويين ١ و٢ الحرف (أو محيطه) ظاهر فى مكانه، فالحكم زى `traceJudge`: الرسم فوق الحرف بالظبط.
// فى المستوى ٣ المربع فاضى زى ورقة الامتحان، والطفل بيكتب الحرف فى أى حتة وبأى حجم — فالرسم مستحيل يقع
// فوق الحرف المخفى بالبكسل. هنا بنقيس **الشكل** مش المكان:
//   ١. المستطيل اللى حوالين رسم الطفل، والمستطيل اللى حوالين الحرف.
//   ٢. كل واحد بيتقسّم لنفس الشبكة (أعمدة × صفوف حسب شكل الحرف) — كل خانة فيها رسم ولا لأ.
//   ٣. التغطية = خانات الحرف اللى الطفل رسم فيها · الدقة = خانات الطفل اللى جوّه الحرف (بسماحية خانة).
// ونفس المقارنة على كل أشكال الحرف (بـ ـبـ ـب ب) — لو الشكل الصح ماعدّاش وشكل تانى عدّى، ميزو بيقوله
// «ده شكل تانى للحرف» بدل «غلط».
//
// دوال صافية (من غير DOM) — بتتقاس فى node: tests/blank-write.test.mjs.
'use strict';

// اتظبطت على حروف حقيقية فى Chromium (٢٠٢٦-١٠-٣١): الشكل الصح بخط مهزوز ومكان وحجم تانى بيعدّى ٢٤٨/٢٤٩،
// الشكل الغلط بيعدّى ٧٥/٢١٣ (والباقى ميزو بيقول «ده شكل تانى» فى ١٣٨)، ودايرة عشوائية ٣/٨٣.
// الشبكة ١٦ وحدودها ٠٫٦ كانت بتعدّى الدايرة ٥٠ مرة والشكل الغلط ١٩٢.
export let FIT_COVERAGE = 0.7;
export let FIT_PRECISION = 0.75;
export let GRID_N = 28;
/** للقياس بس (tests/ وصفحة التجربة): تغيير الشبكة والحدود. */
export function _tune(o) { if (o.N) GRID_N = o.N; if (o.cov) FIT_COVERAGE = o.cov; if (o.prec) FIT_PRECISION = o.prec; }
/** أقل رسم يتحكم عليه (نسبة من مساحة اللوحة) — نقطة أو خربشة صغيرة مش حرف. */
export const MIN_INK = 0.004;

/** المستطيل حوالين البكسلات اللى alpha بتاعها > thr، أو null لو فاضى. alpha = Uint8 بطول W*H. */
export function bboxOf(alpha, W, H, thr = 40) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (alpha[row + x] > thr) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return n ? { x0, y0, x1, y1, n } : null;
}

/** شبكة cols×rows على المستطيل box: كل خانة true لو فيها بكسل واحد على الأقل. */
export function gridOf(alpha, W, H, box, cols, rows, thr = 40) {
  const g = new Uint8Array(cols * rows);
  const bw = Math.max(1, box.x1 - box.x0 + 1), bh = Math.max(1, box.y1 - box.y0 + 1);
  for (let y = box.y0; y <= box.y1; y++) {
    const r = Math.min(rows - 1, Math.floor(((y - box.y0) * rows) / bh));
    for (let x = box.x0; x <= box.x1; x++) {
      if (alpha[y * W + x] <= thr) continue;
      const c = Math.min(cols - 1, Math.floor(((x - box.x0) * cols) / bw));
      g[r * cols + c] = 1;
    }
  }
  return g;
}

/** توسيع الشبكة خانة فى كل اتجاه (سماحية: الخط مش لازم يقع فى نفس الخانة بالظبط). */
export function dilate(g, cols, rows) {
  const out = new Uint8Array(g.length);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (!g[r * cols + c]) continue;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out[rr * cols + cc] = 1;
    }
  }
  return out;
}

/** أبعاد الشبكة من شكل الحرف: GRID_N خانة على الضلع الأطول، والتانى بالنسبة (٥ على الأقل). */
export function gridSize(box, N = GRID_N) {
  const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;
  return bw >= bh ? { cols: N, rows: Math.max(5, Math.round((N * bh) / bw)) } : { rows: N, cols: Math.max(5, Math.round((N * bw) / bh)) };
}

/**
 * رسم الطفل (draw) قدّام قناع الحرف (mask) — الاتنين alpha بنفس الأبعاد W×H.
 * @returns { coverage, precision, score, ok, empty }
 */
export function fitJudge(draw, mask, W, H) {
  const mb = bboxOf(mask, W, H);
  const db = bboxOf(draw, W, H);
  if (!mb) return { coverage: 0, precision: 0, score: 0, ok: false, empty: false };   // الحرف نفسه مارسمش: مفيش حكم
  if (!db || db.n < W * H * MIN_INK) return { coverage: 0, precision: 0, score: 0, ok: false, empty: true };
  const { cols, rows } = gridSize(mb);
  const gm = gridOf(mask, W, H, mb, cols, rows);
  const gd = gridOf(draw, W, H, db, cols, rows);
  const gmW = dilate(gm, cols, rows), gdW = dilate(gd, cols, rows);
  let m = 0, d = 0, covered = 0, inside = 0;
  for (let i = 0; i < gm.length; i++) {
    if (gm[i]) { m++; if (gdW[i]) covered++; }
    if (gd[i]) { d++; if (gmW[i]) inside++; }
  }
  const coverage = m ? covered / m : 0;
  const precision = d ? inside / d : 0;
  // شكل الطفل لازم يبقى قريب من شكل الحرف فى الطول والعرض (حرف عريض مايتكتبش خط واقف)
  const ra = (mb.x1 - mb.x0 + 1) / (mb.y1 - mb.y0 + 1), rd = (db.x1 - db.x0 + 1) / (db.y1 - db.y0 + 1);
  const aspectOk = Math.max(ra, rd) / Math.min(ra, rd) <= 2.6;
  return { coverage, precision, score: (coverage + precision) / 2, ok: aspectOk && coverage >= FIT_COVERAGE && precision >= FIT_PRECISION, empty: false };
}

/**
 * نفس الرسم قدّام كل أشكال الحرف: target = رقم الشكل الصح فى masks.
 * @returns { ok, best, results, wrongShape } — wrongShape = رقم شكل تانى عدّى والصح ماعدّاش.
 */
export function judgeShapes(draw, masks, target, W, H) {
  const results = masks.map((m) => fitJudge(draw, m, W, H));
  const t = results[target];
  let best = target;
  results.forEach((r, i) => { if (r.score > results[best].score) best = i; });
  const wrongShape = !t.ok && best !== target && results[best].ok && results[best].score - t.score >= 0.08 ? best : -1;
  return { ok: t.ok, best, results, wrongShape, empty: t.empty };
}
