#!/usr/bin/env node
/**
 * كل زرار «اطلب النظام» في الصفحة الرئيسية يطلع زرار — مش نص شفاف.
 *
 * ── اللي كان بيحصل ─────────────────────────────────────────────────────
 *
 * `.service-cta` الأساسي كان `border: none` **وبلا خلفية**. والألوان كلها
 * كانت في قواعد قطاعية: `.service-card.gym .service-cta` وإخواتها.
 *
 * النتيجة إن الكارت اللي مالوش قاعدة قطاعية بيطلع زراره شفاف تماماً —
 * نص أزرق صغير جنب زرار مليان في الكارت اللي جنبه بالظبط. والمالك شافها
 * في الموقع المنشور: «اطلب نظام الجيم» زرار، و«اطلب نظام المطاعم» نص.
 *
 * الحالة دي كانت في **تسعة كروت من خمستاشر**: `clinic` و`orders` (ليهم
 * لون كارت بس مالهمش قاعدة CTA) وسبعة كروت مالهمش كلاس قطاعي أصلاً.
 *
 * ── والإصلاح مش «أضيف تسع قواعد» ───────────────────────────────────────
 *
 * إضافة قاعدة لكل كارت بتصلّح النهارده وبتسيب الغلط ممكن بكرة: أول كارت
 * جديد يتضاف من غير قاعدة بيرجع شفاف. الإصلاح إن **الافتراضي يبقى صح**،
 * والقاعدة القطاعية تبقى تحسين فوقه مش شرط لوجوده.
 *
 * الفحص ده بيحرس الاتنين: الافتراضي موجود، وكل كارت له كلاس قطاعي معروف.
 *
 * Usage: node scripts/check-card-theme.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

/** شيل تعليقات CSS — التعليق اللي بيشرح الغلط مالوش ذنب. */
const css = read('public/css/landing.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
const home = read('src/views/home.ejs');

// ── ١) الافتراضي زرار كامل ─────────────────────────────────────────────
//
// دي القاعدة اللي الفحص اتكتب عشانها.

const baseRule = /\.service-cta\s*\{([^}]*)\}/.exec(css);
check('`.service-cta` الأساسي موجود', !!baseRule, 'مش لاقيه في `landing.css`.');
if (baseRule) {
  const body = baseRule[1];
  check('وفيه خلفية', /background\s*:/.test(body),
    'من غير خلفية الزرار بيطلع نص شفاف في أي كارت مالوش قاعدة قطاعية.');
  check('وفيه لون نص', /(^|[;\s])color\s*:/.test(body),
    'اللون بييجي من القاعدة القطاعية بس — والكارت اللي مالوش قاعدة بيورث لون الصفحة.');
  check('و**مش** `border: none`', !/border\s*:\s*none/.test(body),
    '`border: none` هي بالظبط اللي كانت بتخلّي الزرار يختفي كشكل. '
    + 'خلّيه حد بلون خفيف عشان يفضل زرار حتى من غير تخصيص.');
  check('وفيه حالة hover افتراضية', /\.service-cta:hover\s*\{/.test(css),
    'من غير hover افتراضي، الكارت اللي مالوش قاعدة زراره ميّت عند اللمس.');
}

// ── ٢) كل كارت في الصفحة له كلاس قطاعي ─────────────────────────────────
//
// مش شرط عشان يشتغل (الافتراضي بيغطّي)، بس كارت من غير كلاس معناه إنه
// بيطلع بلون عام وسط كروت كل واحدة بلونها — وده بيبان.

/* بنعدّ **الكروت اللي فيها زرار** بس.
 *
 * في الصفحة كمان تلات كروت «ليه تختارنا» (شوف النظام · الموقع ملكك ·
 * اتكلم مع اللي بناه) — دول مالهمش زرار ولا قطاع، والكلاس القطاعي عليهم
 * مالوش معنى. أول نسخة من الفحص ده كانت بتبلّغ عنهم، وده إنذار كاذب —
 * والفحص اللي بيبلّغ عن غلط مش موجود بيتقفل بعد تلات مرات. */
const cardBlocks = [];
for (const m of home.matchAll(/class="service-card([^"]*)"/g)) {
  const end = home.indexOf('class="service-card', m.index + 10);
  const block = home.slice(m.index, end === -1 ? m.index + 4000 : end);
  cardBlocks.push({
    classes: m[1].split(/\s+/).filter((c) => c && c !== 'reveal'),
    hasCta: /class="service-cta"/.test(block),
  });
}
const cards = cardBlocks.filter((c) => c.hasCta).map((c) => c.classes);
const bare = cards.filter((c) => c.length === 0).length;
check(`كل كارت نظام (${cards.length}) له كلاس قطاعي`, bare === 0,
  `${bare} كارت فيه زرار وبـ\`class="service-card reveal"\` بس. `
  + 'الافتراضي هيغطّيهم شكلياً، بس هيطلعوا كلهم بنفس اللون وسط كروت ملوّنة.');

// ── ٣) والكلاس اللي في الصفحة له قاعدة في الـCSS ───────────────────────

const themed = new Set(
  [...css.matchAll(/\.service-card\.([a-z-]+)\s+\.service-cta\s*\{/g)].map((m) => m[1]));
const used = [...new Set(cards.flat())];
const unstyled = used.filter((c) => !themed.has(c));
check(`كل كلاس مستخدم له قاعدة CTA (${used.length} كلاس)`, unstyled.length === 0,
  `«${unstyled.join('، ')}» مستخدمين في الصفحة ومالهمش قاعدة — `
  + 'زرارهم هيطلع بالافتراضي وسط كروت بألوانها. دي بالظبط حالة '
  + '`clinic` و`orders` اللي المالك شافها.');

// ── ٤) وكل قاعدة قطاعية فيها التلاتة ───────────────────────────────────

const missing = [];
for (const t of themed) {
  const r = new RegExp(`\\.service-card\\.${t}\\s+\\.service-cta\\s*\\{([^}]*)\\}`).exec(css);
  if (!r) continue;
  const has = ['background', 'color', 'border'].filter((k) => new RegExp(`${k}\\s*:`).test(r[1]));
  if (has.length < 3) missing.push(`${t} (${has.join('+') || 'ولا حاجة'})`);
}
check('وكل قاعدة قطاعية فيها خلفية ولون وحد', missing.length === 0,
  `ناقص: ${missing.join(' · ')} — القاعدة الناقصة بتورث من الافتراضي `
  + 'فبيطلع خليط بين لونين.');

process.exit(failed ? 1 : 0);
