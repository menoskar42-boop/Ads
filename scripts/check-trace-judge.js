#!/usr/bin/env node
/**
 * «برافو! كتبت الحرف صح» — على شخبطة.
 *
 * لعبة رسم الحرف كانت بتحكم بسطر واحد:
 *
 *     covered / maskTotal >= 0.62
 *
 * يعني «قد إيه من الحرف اتغطّى». ومافيش أي قياس لـ«قد إيه من اللي الطفل
 * رسمه وقع **بره** الحرف». فالطفل اللي بيشخبط على المربّع كله بفرشاة ٢٦
 * بكسل بيغطّي ١٠٠٪ من القناع، والتطبيق بيقول لأهله **«برافو! كتب الحرف صح»**.
 *
 * دي مش مكافأة زيادة — دي معلومة غلط بتوصل لأب بيتابع ابنه، وطفل بيتعلّم إن
 * الشخبطة والكتابة نفس الحاجة.
 *
 * ── التلاتة اللي الفحص ده بيمسكهم ───────────────────────────────────────
 *
 * ١) **الحكم شرطين مش شرط.** تغطية (قد إيه من الحرف اتكتب) **و**دقّة (قد
 *    إيه من رسم الطفل وقع جوّه الحرف). الدقّة هي اللي بتفرّق بين اللي اتبع
 *    الشكل واللي دهن المربّع.
 *
 * ٢) **تلات إجابات مش اتنين.** «صح» · «خرجت بره الخط، امسح» · «كمّل».
 *    قبل كده كان فيه «صح» وسكوت — واللي شخبط واللي لسه مكمّلش كانوا بياخدوا
 *    نفس السكوت، وهما محتاجين كلام مختلف تماماً.
 *
 * ٣) **الحكم مابيتاخدش والإيد لسه على الشاشة.** `checkCoverage` كانت
 *    بتتنادى في `pointerdown` كمان، فالحرف بيتحكم عليه «صح» وسط أول ضغطة —
 *    والطفل بيتعلّم إن نصّ الحرف كفاية.
 *
 * والحكم نفسه مفصول في `traceJudge.js` عشان الفحص ده **يشغّله بأرقام
 * حقيقية**، مش يقرا الملف ويفترض إنه بيعمل اللي مكتوب فيه.
 *
 *   node scripts/check-trace-judge.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

(async () => {
  const J = await import('file://' + path.join(ROOT, 'mykid/js/games/traceJudge.js'));
  const { judge, hintFor, THRESHOLD, PRECISION } = J;

  /* ── ١. الشخبطة مابتعديش ────────────────────────────────────────────── */
  {
    // غطّى الحرف كله، بس ٩ أعشار رسمه بره — ده دهن المربّع.
    const scribble = judge(1000, 9000, 1000);
    check('الشخبطة اللي بتغطّي الحرف كله **مابتعديش**',
      scribble.ok === false, 'تغطية ' + scribble.coverage.toFixed(2) + ' · دقّة ' + scribble.precision.toFixed(2));
    check('والتتبّع النضيف بيعدّي', judge(700, 900, 1000).ok === true);
    check('والتغطية لوحدها مش كافية',
      judge(1000, 3000, 1000).coverage >= THRESHOLD && judge(1000, 3000, 1000).ok === false);
    check('والدقّة لوحدها مش كافية (رسم نضيف بس ناقص)',
      judge(300, 310, 1000).precision >= PRECISION && judge(300, 310, 1000).ok === false);
  }

  /* ── ٢. القسمة على صفر ─────────────────────────────────────────────── */
  {
    check('مافيش رسم = مافيش دقّة (مش «مية بالمية»)',
      judge(0, 0, 1000).precision === 0 && judge(0, 0, 1000).ok === false);
    check('والقناع الفاضي مابياخدش حكم أصلاً',
      judge(0, 500, 0).ok === false);
    check('ومفيش NaN بيتسرّب من أي حالة',
      [judge(0, 0, 0), judge(1, 0, 0), judge(0, 1, 0)]
        .every((m) => Number.isFinite(m.coverage) && Number.isFinite(m.precision)));
  }

  /* ── ٣. تلات إجابات ────────────────────────────────────────────────── */
  {
    const scribble = hintFor(judge(1000, 9000, 1000));
    const partial = hintFor(judge(500, 600, 1000));
    check('اللي شخبط بيتقاله يمسح ويرجع على الخط',
      typeof scribble === 'string' && /بره الحرف/.test(scribble));
    check('واللي لسه مكمّلش بيتقاله يكمّل',
      typeof partial === 'string' && /كمّل/.test(partial));
    check('**والجملتين مختلفتين**', scribble !== partial);
    check('واللي خلّص مابيتقالش له حاجة (الاحتفال بيتكلّم)',
      hintFor(judge(700, 900, 1000)) === null);
    check('والرسم القليل أوي مابيتنقّرش عليه',
      hintFor(judge(20, 25, 1000)) === null);
  }

  /* ── ٤. الوصل باللعبة ──────────────────────────────────────────────── */
  {
    const t = raw('mykid/js/games/trace.js');
    check('اللعبة بتستعمل نفس الحكم مش حسبة تانية',
      /import \{ judge, hintFor \} from "\.\/traceJudge\.js"/.test(t)
      && /return judge\(covered, drawn, maskTotal\)/.test(t));
    check('وبتعدّ اللي رسمه الطفل مش اللي جوّه الحرف بس',
      /drawn\+\+/.test(t) && /if \(maskData\[p\] > 40\) covered\+\+/.test(t));
    check('ومفيش عتبة تانية متصلّبة في اللعبة',
      !/>= *0\.\d/.test(t));

    // الحكم مايتاخدش والإيد على الشاشة.
    const startFn = /function start\(e\) \{[\s\S]*?\n    \}/.exec(t);
    check('و`checkCoverage` مش بتتنادى وقت الضغط',
      startFn && !/checkCoverage\(\)/.test(startFn[0]));
    const endFn = /function end\(\) \{[\s\S]*?\n    \}/.exec(t);
    check('وبتتنادى بعد رفع الإصبع', endFn && /checkCoverage\(\)/.test(endFn[0]));
    check('والتلميح بيتقال بعد الرفع كمان', endFn && /hintAfterStroke\(\)/.test(endFn[0]));
    check('و«امسح» بيمسح التلميح معاه (مايفضلش معلّق على رسمة اتشالت)',
      /clearRect\(0, 0, RES, RES\); hint\.textContent = ""/.test(t));
  }

  console.log(fail === 0
    ? '\n✅ «كتب الحرف صح» بقت عن كتابة — والشخبطة بتتقال ليه مش بتتكافأ.'
    : `\n⚠️  ${fail} مشكلة.`);
  process.exit(fail === 0 ? 0 : 1);
})();
