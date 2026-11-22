// ===== سبّورة المعلّم: الحرف بيتكتب خط خط بترتيبه واتجاهه =====
//
// المالك ٢٠٢٦-١٠-١٠: «اتجاهات الكتابة مطبّقها على الكابيتال بس — عاوزها على الصغير كمان».
// السبّورة كانت بتكشف الحرف من فوق لتحت (من غير اتجاه لأى حالة). دلوقتى كل خط بيترسم
// بترتيبه من نقطته الخضرا، وعليه سهم ورقمه — نفس خطوط لوحة الكتابة (`strokes.js`).
// فى الإنجليزى الكابيتال الأول وبعده الصغير (A ثم a).
import { strokesFor, startMarks } from "../data/strokes.js";
import { densify, cumulative } from "./strokeJudge.js";

const r1 = (n) => Math.round(n * 10) / 10;
const pathD = (st, dx, dy) => st.map(([x, y], i) => (i ? "L" : "M") + r1(x + dx) + " " + r1(y + dy)).join("");

function arrowAt(st, dx) {
  const d = densify(st, 1);
  const cum = cumulative(d);
  const len = cum[cum.length - 1];
  if (len < 14) return null;
  let i = cum.findIndex((c) => c >= len * 0.5);
  if (i < 1) i = 1;
  const a = d[i - 1], b = d[Math.min(i + 1, d.length - 1)];
  return { x: d[i][0] + dx, y: d[i][1], deg: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, len };
}

/** null لو حرف من الحروف مالوش خطوط (السبّورة بترجع للحرف المكتوب). */
export function strokeAnimSvg(glyphs) {
  const sets = glyphs.map((g) => strokesFor(g));
  if (!sets.length || sets.some((s) => !s)) return null;
  const W = 100 * sets.length;
  let guide = "", ink = "", marks = "";
  let t = 0.25;
  sets.forEach((strokes, gi) => {
    const dx = gi * 100;
    // الكابيتال والأرقام قاعدتهم ٨٥ والصغير ٨٠ فى strokes.js — بننزّل الصغير ٥ عشان
    // الاتنين يقعدوا على نفس السطر جنب بعض
    const dy = /^[a-z]$/.test(glyphs[gi]) ? 5 : 0;
    const marksAt = startMarks(strokes);
    strokes.forEach((st, si) => {
      const n = si + 1;
      const many = strokes.length > 1;
      if (st.length === 1) {
        const [x, y] = st[0];
        guide += `<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="4" class="sa-guide-dot"/>`;
        ink += `<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="4.6" class="sa-dot" style="animation-delay:${t.toFixed(2)}s"/>`;
        t += 0.45;
        return;
      }
      const d = pathD(st, dx, dy);
      const ar = arrowAt(st, 0);
      const dur = Math.max(0.5, Math.min(1.4, (ar ? ar.len : 20) * 0.012));
      guide += `<path d="${d}" class="sa-guide"/>`;
      ink += `<path d="${d}" pathLength="1" class="sa-ink" style="animation-delay:${t.toFixed(2)}s;animation-duration:${dur.toFixed(2)}s"/>`;
      const [sx, sy] = marksAt[si];
      marks += `<g class="sa-mark" style="animation-delay:${t.toFixed(2)}s">` +
        `<circle cx="${r1(sx + dx)}" cy="${r1(sy + dy)}" r="5.2" class="sa-start"/>` +
        (many ? `<text x="${r1(sx + dx)}" y="${r1(sy + dy) + 2.5}" class="sa-num">${n}</text>` : "") +
        (ar ? `<polygon points="4.5,0 -3.5,-4.2 -1,0 -3.5,4.2" class="sa-arrow" transform="translate(${r1(ar.x + dx)} ${r1(ar.y + dy)}) rotate(${r1(ar.deg)})"/>` : "") +
        `</g>`;
      t += dur + 0.25;
    });
    t += 0.35; // وقفة بين الكابيتال والصغير
  });
  // الإنجليزى على سطر الكراسة: السطر (٨٥) ونص السطر (٥٠) للصغير بعد ما نزل ٥
  const latin = glyphs.every((g) => /^[A-Za-z0-9]+$/.test(g));
  const lines = latin
    ? `<line x1="2" x2="${W - 2}" y1="85" y2="85" class="sa-line"/><line x1="2" x2="${W - 2}" y1="50" y2="50" class="sa-line sa-mid"/>`
    : "";
  return `<svg class="lesson-strokes" viewBox="0 -2 ${W} 106" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<g>${lines}</g><g>${guide}</g><g>${ink}</g><g>${marks}</g></svg>`;
}
