#!/usr/bin/env node
/**
 * The page that takes the money, that nobody could find.
 *
 * Payment settings lived at `/accounting/payments` and NOTHING linked to them.
 * A gym, a workshop, a nursery, a furniture showroom — every panel that sells
 * something — had no route to that screen and no sign that their gateway had
 * never been configured. The answer to "why is nobody paying online?" was one
 * page away and invisible.
 *
 * This is the revenue bottleneck in the backlog, and the fix is deliberately
 * boring: ONE partial with the entry point in it, ONE middleware that knows
 * whether the merchant can take money, included by every panel. A sector added
 * next year shows the chip by existing.
 *
 * Two judgements worth keeping:
 *
 *   · **"ready" is any way to be paid** — a gateway, a payment link, cash on
 *     delivery, a wallet number, InstaPay, a bank transfer. Demanding a gateway
 *     would nag the many merchants who take cash on purpose.
 *   · **a failed read is not a "no"** — telling a merchant who HAS set payments
 *     up that they have not is worse than saying nothing, so the unknown state
 *     is its own state.
 *
 *   node scripts/check-pay-reach.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const P = require('../src/middleware/pay_status');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── What counts as "can take money" ───────────────────────────────────── */
{
  check('بوابة دفع = جاهز', P.readyFrom({ gateway: 'paymob' }) === true);
  check('ولينك دفع كمان', P.readyFrom({ gateway: 'none', payment_link: 'https://pay.me/x' }) === true);
  // The judgement that matters: cash-only merchants are not "not ready".
  check('والدفع عند الاستلام جاهز برضه', P.readyFrom({ gateway: 'none', cod_enabled: true }) === true);
  check('والمحفظة وإنستاباي والتحويل',
    P.readyFrom({ wallet_number: '01001234567' }) === true
    && P.readyFrom({ instapay_handle: 'x@instapay' }) === true
    && P.readyFrom({ bank_details: 'بنك مصر…' }) === true);
  check('وطريقة مخصّصة', P.readyFrom({ custom_methods: ['فودافون كاش'] }) === true);
  check('ومفيش ولا طريقة = مش جاهز',
    P.readyFrom({ gateway: 'none', cod_enabled: false }) === false && P.readyFrom(null) === false);
}

/* ── One place says it, three states ───────────────────────────────────── */
{
  const tpl = fs.readFileSync(path.join(ROOT, 'src/views/partials/pay_link.ejs'), 'utf8');
  const render = (payReady) => ejs.render(tpl, { payReady, payLink: '/accounting/payments' });
  const { t } = require('../src/i18n/strings');
  const say = (payReady, lang) => ejs.render(tpl, { payReady, payLink: '/accounting/payments', t: (k) => t(k, lang) });
  check('الجاهز بيشوف «طرق الدفع»', /طرق الدفع/.test(render(true)) && /emerald/.test(render(true)));
  check('واللي مش جاهز بيشوف نداء واضح', /فعّل استلام الفلوس/.test(render(false)) && /amber/.test(render(false)));
  check('واللي مش معروف مابيتقالوش إنه ناقص', !/فعّل استلام/.test(render(null)));
  // The panels render in both languages: an Arabic chip on an English screen is
  // the bug this project just spent an item removing from the customer pages.
  check('والشريحة بتتكلم لغة الزائر',
    /Payment methods/.test(say(true, 'en')) && /Set up getting paid/.test(say(false, 'en')));
  check('ومفيش حرف عربي في النسخة الإنجليزية',
    !/[؀-ۿ]/.test(say(true, 'en').replace(/<[^>]*>/g, ' ').replace('💳', '')),
    say(true, 'en').replace(/\s+/g, ' ').slice(0, 80));
  check('والتلاتة بيوديّوا لنفس الصفحة', [true, false, null].every((s) => /href="\/accounting\/payments"/.test(render(s))));
  check('والقالب مابينفجرش من غير متغيرات', !!ejs.render(tpl, {}));
}

/* ── Every panel that sells reaches it ─────────────────────────────────── */
{
  const PANELS = [
    'gym_admin/_layout_top.ejs', 'furniture_admin/head.ejs', 'workshop_admin/head.ejs',
    'nursery_admin/head.ejs', 'hall_admin/head.ejs', 'nutrition_admin/head.ejs',
    'qastly_admin/head.ejs', 'clinic_admin/head.ejs', 'food_admin/nav.ejs',
    'pharmacy_admin/nav.ejs', 'company/_layout_top.ejs',
  ];
  const missing = PANELS.filter((rel) => !fs.readFileSync(path.join(ROOT, 'src/views', rel), 'utf8').includes("include('../partials/pay_link')"));
  check('كل لوحة قطاع فيها المدخل', missing.length === 0, missing.join(' · ') || PANELS.length + ' لوحة');

  // The point of a shared partial: the wording lives once.
  const strays = [];
  for (const rel of PANELS) {
    const src = fs.readFileSync(path.join(ROOT, 'src/views', rel), 'utf8');
    if (/فعّل استلام الفلوس/.test(src)) strays.push(rel);
  }
  check('والصياغة في ملف واحد مش متكررة', strays.length === 0, strays.join(' · ') || 'شريحة واحدة');
}

/* ── Answered once for the whole app ───────────────────────────────────── */
{
  const nl = (m) => m.replace(/[^\n]/g, ' ');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, nl)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
  check('الحالة بتتحسب مرة واحدة على التطبيق كله',
    /app\.use\(require\('\.\/src\/middleware\/pay_status'\)\.middleware\(\)\)/.test(srv));
  {
    const iPay = srv.indexOf('pay_status');
    const iCompany = srv.indexOf("app.use('/company', companyRouter)");
    check('وقبل لوحات القطاعات', iPay > -1 && iCompany > iPay, `pay@${iPay} company@${iCompany}`);
  }
  const acct = fs.readFileSync(path.join(ROOT, 'src/routes/accounting.js'), 'utf8');
  check('والحفظ بيمسح الكاش فوراً', /pay_status'\)\.forget\(req\.company\.id\)/.test(acct));
  check('وفشل الحفظ بيتقال (مابقاش صامت)', /err=save/.test(acct));
  const view = fs.readFileSync(path.join(ROOT, 'src/views/accounting/payments.ejs'), 'utf8');
  check('والصفحة بتعرض الفشل', /saveError/.test(view));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني تاجر ممكن يفضل شهور من غير ما يعرف إنه مش مستلم فلوس.`
  : '\nكل لوحة بتبيع فيها مدخل لاستلام الفلوس، وبيقول لو لسه مش مظبوط.');
process.exit(fail ? 1 : 0);
