#!/usr/bin/env node
/**
 * كل متجر على المنصّة كان بيدّي خصم ١٪ من غير ما يعرف.
 *
 * «نقطة لكل جنيه، و١٠٠ نقطة بجنيه» كانت مكتوبة جوّه راوت الطلب. يعني كل
 * تاجر بيدّي ١٪ على كل بيعة — ماختارهاش، ومش شايفها في أي شاشة، ومش قادر
 * يغيّرها. وأسوأ من كده: **زرار قفل الميزة كان بيخفي الخانة من الشاشة بس**
 * — الكتابة تفضل بتدّي وتصرف نقاط زي ما هي.
 *
 * ── الخمسة اللي الفحص ده بيمسكهم ────────────────────────────────────────
 *
 * ١) **القفل بيقفل على السيرفر.** الميزة اللي التاجر قفلها مابتصرفش ولا
 *    بتكسب نقاط وقت كتابة الطلب — مش بس بتختفي من الشاشة.
 *
 * ٢) **المعدّل إعداد، مش رقم في الكود.** والافتراضي هو اللي كان شغّال
 *    بالظبط (١ · ١٠٠ · ١٠٠٪) عشان مافيش متجر يصحى يلاقي معدّله اتغيّر.
 *
 * ٣) **النقاط على البضاعة مش على الشحن.** الشحن فلوس بتروح للمندوب.
 *
 * ٤) **رصيد المحفظة مابيقللش النقاط.** المحفظة طريقة دفع مش خصم — اللي
 *    بيدفع من رصيده كان بياخد نقط أقل على نفس الشراء.
 *
 * ٥) **الشاشة بتقول نفس أرقام الحسبة.** «كل ١٠٠ نقطة = ١ ج» كانت متكتوبة في
 *    القالب، فالتاجر اللي بيغيّر معدّله كان العميل بيقرا رقم غير اللي هيتحسب.
 *
 *   node scripts/check-shop-loyalty.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const L = require('../src/shop/loyalty');

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

const ON = L.settingsFrom({}, true);

/* ── ١. الافتراضي = اللي كان شغّال ─────────────────────────────────────── */
{
  check('الافتراضي هو نفس اللي كان متصلّب في الكود',
    ON.earnPer === 1 && ON.redeemPer === 100 && ON.maxPercent === 100);
  check('والقفل جاي من مكان واحد (`company_features`) مش مفتاح تاني',
    L.settingsFrom({}, false).enabled === false && L.settingsFrom({}, true).enabled === true);
  check('والإعداد البايظ بيرجع لافتراضي معقول',
    L.settingsFrom({ loyalty_earn_per: 'كتير', loyalty_redeem_per: 0 }, true).earnPer === 1
    && L.settingsFrom({ loyalty_redeem_per: 0 }, true).redeemPer === 1);
  check('و«مفيش كسب» (صفر) إجابة مقبولة مش غلطة',
    L.settingsFrom({ loyalty_earn_per: 0 }, true).earnPer === 0
    && L.earnFor(500, L.settingsFrom({ loyalty_earn_per: 0 }, true)) === 0);
}

/* ── ٢. الكسب ──────────────────────────────────────────────────────────── */
{
  check('نقطة لكل وحدة عملة على البضاعة', L.earnFor(250.9, ON) === 250);
  check('والميزة المقفولة مابتكسبش', L.earnFor(250, L.settingsFrom({}, false)) === 0);
  check('والمعدّل المضاعف بيتحسب',
    L.earnFor(100, L.settingsFrom({ loyalty_earn_per: 2 }, true)) === 200);
  check('والمبلغ السالب أو المش مقروء مابيكسبش',
    L.earnFor(-5, ON) === 0 && L.earnFor('x', ON) === 0 && L.earnFor(null, ON) === 0);
}

/* ── ٣. الصرف: تلات سقوف ───────────────────────────────────────────────── */
{
  check('الصرف محدود برصيد العميل',
    L.redeemFor(10000, 450, 999, ON).points === 400, JSON.stringify(L.redeemFor(10000, 450, 999, ON)));
  check('ومحدود بالمبلغ المستحق',
    L.redeemFor(10000, 100000, 7, ON).discount === 7);
  check('ومحدود بسقف التاجر',
    L.redeemFor(10000, 100000, 100, L.settingsFrom({ loyalty_max_percent: 20 }, true)).discount === 20);
  check('والنقاط المتخصومة هي مقابل الخصم بالظبط (الباقي بيفضل للعميل)',
    L.redeemFor(450, 450, 999, ON).points === 400);
  check('واللي مايكفيش لوحدة كاملة مابيتاخدش',
    L.redeemFor(99, 99, 999, ON).points === 0 && L.redeemFor(99, 99, 999, ON).discount === 0);
  check('والميزة المقفولة مابتصرفش',
    L.redeemFor(1000, 1000, 999, L.settingsFrom({}, false)).points === 0);
  check('وسقف صفر بالمية معناه مفيش صرف',
    L.redeemFor(1000, 1000, 999, L.settingsFrom({ loyalty_max_percent: 0 }, true)).points === 0);
  check('والطلب اللي مستحقّه صفر مابيتصرفش عليه',
    L.redeemFor(1000, 1000, 0, ON).points === 0);
}

/* ── ٤. الوصل بالطلب ──────────────────────────────────────────────────── */
{
  const shop = code('src/routes/shop.js');
  check('الكتابة بتقرا حالة الميزة قبل ما تصرف',
    /const loyaltyCfg = loyalty\.settingsFrom\(company, feat\.loyalty\)/.test(shop)
    && /if \(customerId && loyaltyCfg\.enabled\)/.test(shop));
  check('والصرف من نفس الوحدة مش حسبة تانية في الراوت',
    /loyalty\.redeemFor\(req\.body\.redeem_points, cust && cust\.loyalty_points, afterDiscount, loyaltyCfg\)/.test(shop));
  check('ومفيش «١٠٠» متصلّبة في حسبة النقاط',
    !/usablePoints \/ 100/.test(shop) && !/Math\.floor\(afterDiscount\) \* 100/.test(shop));
  check('والرصيد مقفول للتعديل وقت الصرف (FOR UPDATE)',
    /SELECT loyalty_points FROM customers WHERE id=\$1 FOR UPDATE/.test(shop));

  check('والكسب على البضاعة مش على الإجمالي اللي فيه شحن',
    /const pointsEarned = customerId \? loyalty\.earnFor\(Math\.max\(0, goodsTotal - pointsDiscount\), loyaltyCfg\) : 0/.test(shop));
  check('ومفيش كسب على `finalTotal` (اللي بينقص برصيد المحفظة)',
    !/Math\.floor\(finalTotal\)/.test(shop));
  check('و«ثمن البضاعة» متعرّف قبل ما الشحن يتضاف',
    /const goodsTotal = afterDiscount;[\s\S]*const orderTotal = \+\(afterDiscount \+ shipCost\)/.test(shop));
  check('والمحفظة كمان بتتقفل على السيرفر مش على الشاشة بس',
    /if \(customerId && feat\.gift_cards !== false && String\(req\.body\.use_wallet\) === '1'\)/.test(shop));
  check('وصفحة الدفع مابتعرضش نقاط لمتجر قافل الميزة',
    /customerPoints: feat\.loyalty === false \? 0 : customerPoints/.test(shop));
}

/* ── ٥. الشاشات ───────────────────────────────────────────────────────── */
{
  const co = raw('src/views/shop/checkout.ejs');
  check('صفحة الدفع بتقرا المعدّل من الإعداد مش من القالب',
    /_lp\.redeemPer/.test(co) && !/كل 100 نقطة = 1 ج/.test(co));
  check('وبتقول سقف النسبة لما يكون أقل من الكل',
    /_lp\.maxPercent < 100/.test(co));

  const feats = raw('src/views/company/features.ejs');
  check('والتاجر بيشوف معدّله ويقدر يغيّره',
    /name="loyalty_earn_per"/.test(feats) && /name="loyalty_redeem_per"/.test(feats)
    && /name="loyalty_max_percent"/.test(feats));
  check('والشاشة بتقول الخصم ده كام بالمية بالظبط',
    /_l\.earnPer \/ _l\.redeemPer\) \* 100/.test(feats));
  check('ولما الميزة تكون مقفولة بتقول إن الأرقام مش شغّالة',
    /!_l\.enabled/.test(feats));

  const company = code('src/routes/company.js');
  check('والحفظ بيمرّ على نفس المقصّ',
    /loyaltyRules\.settingsFrom\(\{[\s\S]*?\}, true\)/.test(company)
    && /UPDATE companies SET loyalty_earn_per=\$1, loyalty_redeem_per=\$2, loyalty_max_percent=\$3 WHERE id=\$4/.test(company));

  const server = raw('server.js');
  check('والأعمدة افتراضيها اللي كان شغّال',
    /loyalty_earn_per NUMERIC\(6,2\) NOT NULL DEFAULT 1/.test(server)
    && /loyalty_redeem_per INTEGER NOT NULL DEFAULT 100/.test(server)
    && /loyalty_max_percent NUMERIC\(5,2\) NOT NULL DEFAULT 100/.test(server));
}

console.log(fail === 0
  ? '\n✅ الولاء بقى معدّل التاجر — والقفل بيقفل الكتابة مش الشاشة.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
