#!/usr/bin/env node
/**
 * «فيه إيه لسه مافيهوش تقرير؟» و«الورم ده كام سنتي؟»
 *
 * ── تلات قواعد ───────────────────────────────────────────────────────────
 *
 * ١) **الحالة محسوبة من التقارير، مش من عمود.** فيه `rad_studies.status`
 *    بيتكتب فيه 'analyzed' بعد أول مسودة — وبيفضل مكتوب حتى بعد ما المسودة
 *    تتمسح. قايمة الشغل بتحسب الحالة كل مرة من عدد التقارير والمعتمَد منها،
 *    فالمسودة اللي اتمسحت بترجع الدراسة «مستنية» لوحدها.
 *
 * ٢) **«مش قادرين نتأكد» حالة رابعة.** قراءة فشلت مابتتقالش «مفيش شغل» — دي
 *    أسوأ إجابة ممكنة على سؤال بيتسأل عشان محدش ينسى مريض.
 *
 * ٣) **مفيش مليمترات من غير PixelSpacing.** أداة القياس بتحوّل البكسل
 *    لمليمتر من مقياس البكسل اللي في الملف. الملف اللي مافيهوش المقياس ده
 *    بترجع المسافة **بالبكسل** ومكتوب ليه — رقم بالمليمتر جنب ورم رقم
 *    بيتبني عليه قرار.
 *
 *   node scripts/check-rad-worklist.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const W = require('../src/radiology/worklist');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── ١. الحالة ─────────────────────────────────────────────────────────── */
{
  check('دراسة من غير تقارير = مستنية', W.stateOf({ reports: 0, approved: 0 }) === 'waiting');
  check('وبمسودة = مسودة', W.stateOf({ reports: 2, approved: 0 }) === 'draft');
  check('وبمعتمَد = معتمَدة', W.stateOf({ reports: 2, approved: 1 }) === 'approved');
  // اللي البند ده موجود عشانه: القراءة اللي مااتقرتش مش «مفيش تقارير».
  check('وقراءة فشلت = مش معروف', W.stateOf(null) === 'unknown');
  check('والرقم اللي مش رقم = مش معروف', W.stateOf({ reports: 'x', approved: 0 }) === 'unknown');
  check('والمسودة اللي اتمسحت بترجع الدراسة مستنية',
    W.stateOf({ reports: 0, approved: 0 }) === 'waiting');
}

/* ── ٢. العُمر ─────────────────────────────────────────────────────────── */
{
  check('بقالها كام يوم بيتحسب', W.ageDays('2026-08-10T00:00:00Z', '2026-08-19T00:00:00Z') === 9);
  check('واللي اترفعت النهاردة = صفر', W.ageDays('2026-08-19T01:00:00Z', '2026-08-19T09:00:00Z') === 0);
  // صفر يوم و«مش عارفين التاريخ» مش نفس الحاجة، والصفحة بتفرّق بينهم.
  check('والتاريخ المش مقروء = null مش صفر', W.ageDays('مش تاريخ', '2026-08-19') === null);
  check('والفاضي = null', W.ageDays(null) === null);
}

/* ── ٣. العدّادات ──────────────────────────────────────────────────────── */
{
  const t = W.tally([
    { reports: 0, approved: 0 }, { reports: 1, approved: 0 },
    { reports: 1, approved: 1 }, null,
  ].map((r) => ({ state: W.stateOf(r) })));
  check('العدّادات محسوبة من نفس الصفوف',
    t.waiting === 1 && t.draft === 1 && t.approved === 1 && t.unknown === 1 && t.all === 4);
}

/* ── ٤. القياس: مفيش مليمتر من غير مقياس ───────────────────────────────── */
{
  // بنشغّل ملف العارض الحقيقي في صندوق فيه `window` بس — الحسبة اللي
  // بتتفحص هي اللي في المتصفح، مش نسخة منها في الفحص.
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(raw('public/js/rad-viewer.js'), sandbox);
  const dist = sandbox.window.OncoViewer && sandbox.window.OncoViewer.distanceOf;
  check('دالة المسافة مكشوفة للفحص', typeof dist === 'function');

  if (typeof dist === 'function') {
    const mm = dist({ x: 0, y: 0 }, { x: 3, y: 4 }, [2, 2]);
    check('المسافة بالمليمتر لما المقياس موجود',
      mm.unit === 'mm' && mm.known === true && Math.abs(mm.value - 10) < 1e-9, mm.value);
    // مقياس غير متساوي: الصفوف مع y والأعمدة مع x — عكسهم بيدّي رقم غلط.
    const an = dist({ x: 0, y: 0 }, { x: 10, y: 0 }, [1, 0.5]);
    check('والعرض بيتحسب بمقياس العمود', Math.abs(an.value - 5) < 1e-9, an.value);
    const av = dist({ x: 0, y: 0 }, { x: 0, y: 10 }, [1, 0.5]);
    check('والارتفاع بمقياس الصف', Math.abs(av.value - 10) < 1e-9, av.value);

    const px = dist({ x: 0, y: 0 }, { x: 3, y: 4 }, null);
    check('ومن غير مقياس بترجع بالبكسل مش بالمليمتر',
      px.unit === 'px' && px.known === false && Math.abs(px.value - 5) < 1e-9);
    check('والمقياس البايظ مابيتصدّقش',
      dist({ x: 0, y: 0 }, { x: 3, y: 4 }, [0, 0]).unit === 'px');
  }

  const viewer = raw('public/js/rad-viewer.js');
  check('والعارض بيقرا PixelSpacing من (0028,0030)', /e === 0x0030/.test(viewer) && /spacing/.test(viewer));
  check('والشاشة بتقول السبب مش الوحدة بس', /PixelSpacing/.test(viewer) && /بكسل/.test(viewer));
  check('والقياس بيوقف تغيير الإضاءة عشان مايتلغبطوش',
    /if \(measuring\) return;/.test(viewer));
  check('وشريط المصغّرات بيتخطّى الشريحة اللي مش قادر يفكّها',
    /if \(!d \|\| d\.error\) return;/.test(viewer));
}

/* ── ٥. الوصل ──────────────────────────────────────────────────────────── */
{
  const route = code('src/routes/radiology.js');
  check('فيه صفحة لقايمة الشغل', /router\.get\('\/worklist'/.test(route));
  check('والقراءة اللي تفشل بتبعت list: null مش قايمة فاضية',
    /list: null/.test(route));
  const mod = code('src/radiology/worklist.js');
  check('والترتيب الأقدم الأول', /ORDER BY s\.created_at ASC/.test(mod));
  check('والحالة من التقارير مش من عمود status',
    /COUNT\(r\.approved_at\)/.test(mod) && !/s\.status/.test(mod));
  check('والدراسات مقيّدة بالطبيب', /WHERE s\.doctor_id = \$1/.test(mod));

  const view = raw('src/views/radiology/worklist.ejs');
  check('والصفحة بتفرّق بين «مفيش» و«مش قادرين نقرا»', /list === null/.test(view));
  check('وبتفرّق بين «النهاردة» و«التاريخ مش مقروء»',
    /s\.age === null/.test(view) && /s\.age === 0/.test(view));
  check('وبتقول الصور مضغوطة في القايمة كمان', /s\.compression/.test(view));

  const study = raw('src/views/radiology/study.ejs');
  check('وصفحة الدراسة فيها زرار القياس وشريط المصغّرات',
    /data-measure-btn/.test(study) && /data-thumbs/.test(study));
  const nav = raw('src/views/radiology/_layout_top.ejs');
  check('والقايمة موصولة في الهيدر', /\/radiology\/worklist/.test(nav));
}

console.log(fail === 0
  ? '\n✅ قايمة الشغل بتتحسب من التقارير، والقياس مابيدّيش مليمتر من غير مقياس بكسل.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
