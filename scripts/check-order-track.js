#!/usr/bin/env node
/**
 * «الأوضة وصلت فين؟» و«مين قال إنها اتسلّمت؟»
 *
 * السؤال الأول كان بيتجاوب عليه بمكالمة للورشة وواحدة للسواق. والتاني ماكانش
 * ليه إجابة أصلاً: زرار «تم» كان بيقفل الرحلة، وخلاص — مين ضغط ومين استلم
 * ماكانوش متسجّلين، فالخلاف بعد أسبوع بين المعرض والعميل مالوش مرجع.
 *
 * ── التلاتة اللي الفحص ده موجود عشانهم ───────────────────────────────────
 *
 * ١) **الخطوة اللي مش متتبّعة مش «خلصت».** الطلب اللي مالوش أوامر تصنيع
 *    أصلاً مايتقالش عنه «التصنيع تم» — بيتقال «المعرض مابيسجّلش الخطوة دي».
 *    ودي مش تفصيلة: العميل بيقرا الصفحة دي بدل ما يتصل.
 *
 * ٢) **الكود بيتقارن جوّه جملة الكتابة.** كود غلط مابيقفلش الرحلة، وكود صح
 *    مابيتستعملش مرتين — الشرط في الـWHERE مش في `if` قبل الـUPDATE.
 *
 * ٣) **«العميل أكّد» غير «الورشة أقرّت».** الاتنين مسموحين، بس متسجّلين
 *    باسمهم، والعميل بيشوف الفرق على صفحته. الادعاء إن العميل أكّد وهو
 *    ما أكّدش أسوأ من إننا نقول اللي حصل.
 *
 * وكمان: الرابط هو الإثبات، فلازم يكون عشوائي بجد، والصفحة `noindex` ومن غير
 * إعلانات، والتوكن الغلط بيشوف نفس الكارت — مش 404 بيقول «ده موجود بس».
 *
 *   node scripts/check-order-track.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const T = require('../src/furniture/tracking');
const { strings } = require('../src/i18n/strings');

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

/* ── ١. الخطوات: «مش متتبّع» مش «خلص» ────────────────────────────────────── */
{
  const sale = { sale_date: '2026-08-01', total: 1000, paid: 100 };
  const bare = T.timelineFor({ sale, production: [], deliveries: [] });
  const making = bare.find((s) => s.key === 'making');
  check('الطلب اللي مالوش أوامر تصنيع = «مش متتبّع»', making.state === 'untracked');
  check('ومش «خلص» ولا «دلوقتي»', making.state !== 'done' && making.state !== 'now');
  check('والتسليم اللي مافيش عليه رحلة = لسه',
    bare.find((s) => s.key === 'delivery').state === 'todo');

  const half = T.timelineFor({
    sale,
    production: [{ status: 'done', done_at: '2026-08-05' }, { status: 'in_progress' }],
    deliveries: [],
  });
  const m2 = half.find((s) => s.key === 'making');
  check('واللي نصّه خلص بيقول شغّال وبيقول كام من كام',
    m2.state === 'now' && m2.ready === 1 && m2.of === 2);

  const doneAll = T.timelineFor({
    sale,
    production: [{ status: 'done', done_at: '2026-08-05' }, { status: 'cancelled' }],
    deliveries: [{ status: 'done', done_at: '2026-08-09', receipt_method: 'code' }],
  });
  check('والأمر الملغي مابيمنعش «خلص»',
    doneAll.find((s) => s.key === 'making').state === 'done');
  check('والتسليم المتأكّد بالكود بيتقال إنه متأكّد',
    doneAll.find((s) => s.key === 'delivery').confirmed === true);

  const declared = T.timelineFor({
    sale, production: [], deliveries: [{ status: 'done', done_at: '2026-08-09', receipt_method: 'declared' }],
  });
  check('واللي الورشة أقرّت بيه مابيتقالش إن العميل أكّده',
    declared.find((s) => s.key === 'delivery').confirmed === false);

  const failedTrip = T.timelineFor({
    sale, production: [], deliveries: [{ status: 'failed', scheduled_date: '2026-08-02' },
      { status: 'scheduled', scheduled_date: '2026-08-20' }],
  });
  const d3 = failedTrip.find((s) => s.key === 'delivery');
  check('والرحلة اللي فشلت مابتختفيش من الصفحة', d3.failed === 1);
  check('والميعاد الجاي هو اللي بيتعرض', d3.date === '2026-08-20');
}

/* ── ٢. الفلوس ──────────────────────────────────────────────────────────── */
{
  const m = T.moneyFor({ total: 1000, paid: 1200 });
  check('المتبقّي مابينزلش تحت الصفر', m.due === 0);
  check('والمدفوع بيتعرض زي ما هو', m.paid === 1200);
}

/* ── ٣. الكود والتوكن: عشوائيين بجد ─────────────────────────────────────── */
{
  const mod = code('src/furniture/tracking.js');
  check('التوكن من crypto مش Math.random', /crypto\.randomBytes\(32\)/.test(mod) && !/Math\.random/.test(mod));
  check('وكود الاستلام من randomInt من غير %', /crypto\.randomInt\(0, 1000000\)/.test(mod) && !/%\s*1000000/.test(mod));
  const codes = new Set();
  for (let i = 0; i < 200; i++) codes.add(T.newReceiptCode());
  check('والكود دايماً ٦ أرقام', [...codes].every((c) => T.CODE_RE.test(c)));
  check('ومش بيطلع نفس الكود كل مرة', codes.size > 150, codes.size + ' كود مختلف');
  check('والتوكن ٦٤ حرف hex', T.TOKEN_RE.test(T.newToken()));
  check('والأرقام العربية بتتقرا في الكود', T.normalizeCode('٤٠٨٢١٥') === '408215');
  check('والكود بيتعرض للرحلة الشغّالة بس',
    T.activeCodeOf([{ id: 1, status: 'done', receipt_code: '111111', receipt_confirmed_at: 'x' }]) === null);
  check('وبيتعرض للرحلة اللي لسه مااتأكدتش',
    (T.activeCodeOf([{ id: 2, status: 'out', receipt_code: '222222', receipt_confirmed_at: null }]) || {}).code === '222222');
}

/* ── ٤. التأكيد جوّه جملة الكتابة ───────────────────────────────────────── */
{
  const del = code('src/furniture/delivery.js');
  check('الكود شرط في الـUPDATE نفسه', /AND receipt_code = \$5/.test(del));
  check('والتأكيد مرة واحدة (شرط NULL في نفس الجملة)',
    /receipt_confirmed_at IS NULL\$\{codeCond\}/.test(del) || /receipt_confirmed_at IS NULL/.test(del));
  check('والحالة بتتقفل في نفس الكتابة مش في جملة تانية',
    /SET receipt_confirmed_at = now\(\)[\s\S]{0,240}?status = 'done'/.test(del));
  check('والرفض بيقول السبب من قاموس السيرفر',
    /why: row\.receipt_confirmed_at \? 'already' : 'wrong_code'/.test(del));
  check('وبوابة الفلوس لسه شغّالة على التسليم',
    /dispatchCheck\(job, opts\.policy/.test(del) && /why: 'unpaid'/.test(del));
  check('وكود الرحلة بيتولد مرة واحدة (COALESCE مش SET)',
    /SET receipt_code = COALESCE\(receipt_code, \$3\)/.test(del));

  const route = code('src/routes/furniture_delivery.js');
  check('والراوت بيمرّر «إقرار الورشة» صراحةً',
    /method: b\.method === 'declared' \? 'declared' : 'code'/.test(route));
  check('وبيسجّل مين أقرّ', /actorOf\(req/.test(route));
  check('وأسباب الرفض من قايمة السيرفر',
    /DELIVERY_ERRORS\.includes\(req\.query\.err\)/.test(route)
    && /'wrong_code'/.test(route) && /'already'/.test(route));

  const view = raw('src/views/furniture_admin/delivery.ejs');
  check('والشاشة بتفرّق بين تأكيد العميل وإقرار الورشة',
    /fn2\.dl\.rc\.by_code/.test(view) && /fn2\.dl\.rc\.by_shop/.test(view));
  check('و«سلّمت من غير كود» بتسأل الأول', /fn2\.dl\.rc\.declare_ask/.test(view));
  check('ومفيش زرار «تم» عادي جنبها',
    !/\['out','done','failed'\]/.test(view));
}

/* ── ٥. الصفحة العامة: الرابط هو الإثبات ────────────────────────────────── */
{
  const route = code('src/routes/furniture_track.js');
  check('التوكن بيتفحص شكله قبل أي استعلام', /T\.TOKEN_RE\.test\(token\)/.test(route));
  check('والتوكن الغلط بيشوف نفس الكارت مش 404',
    /return page\(res, \{\}\)/.test(route) && !/status\(404\)/.test(route));
  check('ومفيش إعلانات على الصفحة', /showAds = false/.test(route));
  check('وفيه حدّ لعدد الفتحات', /rateLimit\(\{ name: 'furniture-track'/.test(route));
  // كل استعلام بعد التوكن مقيّد بشركة الفاتورة اللي التوكن دلّ عليها — التوكن
  // بيقول «الطلب ده»، مش «كل طلبات المنصّة».
  check('والاستعلامات كلها مقيّدة بشركة الفاتورة',
    (route.match(/company_id=\$\d/g) || []).length >= 3
    && (route.match(/sale\.company_id/g) || []).length >= 3);

  const view = raw('src/views/furniture_track.ejs');
  check('والصفحة noindex', /name="robots" content="noindex/.test(view));
  check('ومفيش referrer بيسرّب التوكن', /name="referrer" content="no-referrer"/.test(view));
  // بالتاج نفسه مش بالكلمة: الملف بيشرح ليه مفيش canonical، والشرح مش تاج.
  check('ومفيش canonical فيه توكن', !/rel=["']canonical/.test(view));
  check('وبتتكلم بلغة الزائر مش عربي متصلّب',
    /<html lang="<%= lang %>"/.test(view) && /t\('fnt\./.test(view));

  const server = code('server.js');
  check('والراوت متركّب قبل راوتر المستأجر',
    server.indexOf("app.use('/track'") > -1
    && server.indexOf("app.use('/track'") < server.indexOf('tenantRouter(req, res, next)'));
}

/* ── ٦. التوكن بيتعمل مرة واحدة وبقرار التاجر ───────────────────────────── */
{
  const sales = code('src/routes/furniture_sales.js');
  check('اللينك بيتعمل بضغطة من التاجر مش مع كل فتحة صفحة',
    /router\.post\('\/:id\(\\\\d\+\)\/track'/.test(sales));
  check('والتوكن بيفضل هو هو (COALESCE)',
    /SET track_token = COALESCE\(track_token, \$3\)/.test(sales));
  check('واللينك بيتبني من أصل الموقع مش من الطلب',
    /res\.locals\.siteOrigin \|\| ''\) \+ '\/track\/'/.test(sales));

  const detail = raw('src/views/furniture_admin/sale_detail.ejs');
  check('والواتساب بضغطة من التاجر ومكتوب كده', /wa\.me\//.test(detail) && /fn2\.tk\.wa/.test(detail));
  check('والصفحة بتقول إن اللينك ده زي كلمة السر', /fn2\.tk\.note/.test(detail));
}

/* ── ٧. الكلام باللغتين ─────────────────────────────────────────────────── */
{
  const keys = ['fnt.title', 'fnt.untracked', 'fnt.declared', 'fnt.code', 'fnt.step.making',
    'fn2.tk.title', 'fn2.tk.note', 'fn2.dl.rc.by_code', 'fn2.dl.rc.by_shop',
    'fn2.dl.err.wrong_code', 'fn2.dl.err.already'];
  const missing = keys.filter((k) => !strings.ar[k] || !strings.en[k]);
  check('كل المفاتيح بالعربي والإنجليزي', missing.length === 0, missing.join(', ') || 'تمام');
  check('و«العميل أكّد» غير «الورشة أقرّت» في الكلام نفسه',
    strings.ar['fn2.dl.rc.by_code'] !== strings.ar['fn2.dl.rc.by_shop']
    && strings.en['fn2.dl.rc.by_code'] !== strings.en['fn2.dl.rc.by_shop']);
}

console.log(fail === 0
  ? '\n✅ العميل بيتابع طلبه من غير مكالمة، و«اتسلّم» ليها إثبات أو ليها اسم.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
