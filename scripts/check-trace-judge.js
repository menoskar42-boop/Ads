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

  /* ── لوحة الكتابة (٢٠٢٦-١٠-١٠): البداية والاتجاه وترتيب الخطوط ─────── */
  // المالك: «بنتى ٤ سنين بتتعلّم الكتابة». التغطية لوحدها بتقبل الحرف مكتوب من
  // تحت لفوق — وده بيبوّظ الخط بعدين. فالحروف اللى ليها خطوط بتتكتب على لوحة
  // بتحكم على كل خط: من نقطته الخضرا، فى اتجاهه، لآخره.
  {
    const S = await import('file://' + path.join(ROOT, 'mykid/js/games/strokeJudge.js'));
    const D = await import('file://' + path.join(ROOT, 'mykid/js/data/strokes.js'));
    const DS = await import('file://' + path.join(ROOT, 'mykid/js/data/datasets.js'));
    const glyphOf = (it) => it.char || it.arDigit || it.name;
    const glyphs = ['arabic', 'english', 'numbers', 'englishNumbers']
      .flatMap((k) => DS.getDataset(k).items.map(glyphOf)).concat(['0', '٠'])
      // والإنجليزى الصغير (small) — المالك ٢٠٢٦-١٠-١٠: «اعملها كابيتال وsmall»
      .concat(DS.getDataset('english').items.map((it) => it.lower));
    const missing = glyphs.filter((g) => !D.strokesFor(g));
    check('كل حرف ورقم بيتكتب فى التطبيق ليه ترتيب خطوط', missing.length === 0, missing.join(' ') || glyphs.length + ' رمز');

    const run = (st, pts) => {
      const t = new S.StrokeTracker(st, 1);
      const d = S.densify(pts, 2);
      let r = t.begin(d[0]);
      for (let i = 1; !r && i < d.length; i++) r = t.move(d[i]);
      return r || t.end();
    };
    const okFwd = [], okRev = [];
    for (const g of glyphs) D.strokesFor(g).forEach((st, i) => {
      if (st.length === 1) return;
      if (run(st, st) !== 'ok') okFwd.push(g + '#' + (i + 1));
      if (run(st, [...st].reverse()) === 'ok') okRev.push(g + '#' + (i + 1));
    });
    check('كتابة كل خط فى اتجاهه بتعدّى', okFwd.length === 0, okFwd.join(' '));
    check('وكتابته **بالعكس** مابتعدّيش أبداً', okRev.length === 0, okRev.join(' '));
    const V = [[50, 10], [50, 90]];
    check('ونص الخط مش كفاية («كمّل لآخر الخط»)', run(V, [[50, 10], [50, 50]]) === 'too-short'
      && /كمّل/.test(S.hintForResult('too-short')));

    const t = raw('mykid/js/games/trace.js');
    check('الحرف اللى ليه خطوط بيروح للوحة الكتابة مش للتغطية',
      /const strokes = isPre \? it\.strokes : strokesFor\(glyph\);\s*if \(strokes\) return renderBoard\(/.test(t));
    const b = raw('mykid/js/games/writeBoard.js');
    check('واللوحة بتحكم بعد رفع الإصبع بس (`end` فى `pointerup`)',
      /function up\(e\) \{[\s\S]*?tracker\.end\(\)/.test(b)
      && !/tracker\.end\(\)/.test((/function down\(e\) \{[\s\S]*?\n  \}/.exec(b) || [''])[0]));
    check('والصباع السريع مابيقفزش فوق الخط (بنملا الفراغ قبل الحكم)',
      /densify\(\[last, p\], 2\)/.test(b));
    // المالك ٢٠٢٦-١٠-١٠: «طريقة رسم الحرف بتظهر أول مرة بس… عاوزها تظهر فى كل مرة»
    check('صباع العرض بيرسم الحرف كل مرة يتفتح (كل المستويات، مش الأول بس)',
      !/if \(level === 1\) setTimeout\(\(\) => board\.demo\(\)/.test(raw('mykid/js/games/trace.js') + raw('mykid/js/games/nameWrite.js'))
      && /setTimeout\(\(\) => board\.demo\(\), 1400\)/.test(raw('mykid/js/games/trace.js')));
    check('وغلطتين على نفس الخط ⇒ اللوحة بتوريه إزاى', /if \(fails >= 2\)[\s\S]{0,200}demo\(\{ only: cur \}\)/.test(b));

    // القلم (استايلس) والكف ساند: المالك ٢٠٢٦-١٠-١٠ «هل فيه طريقة إنه يتكتب باستيكه؟»
    check('القلم: بعد ما قلم حقيقى يلمس، لمس الإيد بيتجاهل',
      /if \(penSeen && e\.pointerType === "touch"\) return true;/.test(b));
    check('والكف العريض بيتجاهل، والكف الساند مابيتقالّوش «ابدأ من النقطة الخضرا»',
      /e\.width >= PALM_PX/.test(b) && /pending\.set\(e\.pointerId/.test(b) && /lastWriteAt < pend\.at/.test(b));

    // مسكة القلم + «القلم بس» (المالك ٢٠٢٦-١٠-١٠: «علشان يبقى زى مسكة القلم للطفل»)
    const G = raw('mykid/js/games/grip.js');
    check('كارت مسكة القلم بيظهر مرة فى اليوم، والعرض بيستنّاه يتقفل',
      /takeGripTipForToday\(\)/.test(G) && /whenGripClosed\(\(\) => \{[\s\S]{0,900}board\.demo\(\)/.test(raw('mykid/js/games/trace.js')));
    check('«القلم بس»: الصباع مابيكتبش، والماوس فاضل شغّال',
      /if \(opts\.penOnly && e\.pointerType === "touch"\)/.test(b));
    check('ولو الجهاز عمره ما قرا قلم ذكى، ولى الأمر بيتقاله يقفل الوضع (مش الطفل يفضل يحاول)',
      /blocked >= 3 && !warned && !Store\.writeSettings\.penSeen/.test(G));

    // اسمها: كل حرف فى اسم عربى أو إنجليزى ليه خطوط (حتى ا إ آ ة ى اللى مش فى الحروف الـ٢٨)
    const names = ['مريم', 'آية', 'هدى', 'إسراء', 'فاطمة', 'سلمى', 'Betty'];
    const lost = names.filter((n) => D.nameLetters(n).length !== [...n].length);
    check('«اكتب اسمك»: كل حروف الأسامى الشائعة بتتكتب', lost.length === 0, lost.join(' '));

    // ورقة الطباعة: نفس الخطوط، والمساعدة بتقلّ سطر ورا سطر
    const W = await import('file://' + path.join(ROOT, 'mykid/js/games/worksheet.js'));
    const plan = W.sheetPlan([{ label: 'ب', strokes: D.strokesFor('ب') }]);
    check('ورقة الطباعة: نموذج ← نقط ← نقطة البداية ← فاضى',
      plan[0].map((r) => r.cells[0]).join(',') === 'model,dots,dots,start,start,blank');

    // «اختار مباشرة» (المالك ٢٠٢٦-١٠-١٠: «مش بقدر افتح حرف إلا لازم ادخل على A ثم التالى»)
    for (const f of ['flashcards.js', 'letterforms.js', 'trace.js']) {
      check(`${f}: فيه شبكة «اختار مباشرة»`, /glyphPicker\(\{/.test(raw('mykid/js/games/' + f)));
    }
  }

  console.log(fail === 0
    ? '\n✅ «كتب الحرف صح» بقت عن كتابة — والشخبطة بتتقال ليه مش بتتكافأ.'
    : `\n⚠️  ${fail} مشكلة.`);
  process.exit(fail === 0 ? 0 : 1);
})();
