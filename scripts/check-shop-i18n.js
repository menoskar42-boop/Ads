#!/usr/bin/env node
/**
 * المتجر كان بيتكلّم عربي مهما كانت لغة الزائر.
 *
 * الترجمة كانت موجودة — `t()` شغّالة، وصفحات حساب العميل اتعملت (البند ٥١) —
 * بس واجهة المتجر نفسها كان فيها **١٧٠ جملة مكتوبة عربي في القالب**: شريط
 * العروض، والهيرو، والفلترة، وشريط الثقة، والفوتر، وصفحة المنتج بتقييماتها
 * وأسئلتها، وصفحة الدفع بملخّصها. يعني التاجر اللي بيبيع لزبون إنجليزي كان
 * الزبون بيقرا نص صفحة بلغة مايعرفهاش.
 *
 * ── القاعدة اللي الفحص ده بيفرضها ────────────────────────────────────────
 *
 * **مفيش جملة عربية مكتوبة في قوالب المتجر.** كل كلام الزائر من القاموس.
 *
 * والفحص بيقرا **القوالب نفسها** ويدوّر على حروف عربية بره التعليقات — يعني
 * أي جملة جديدة تتكتب بالعربي في القالب بتوقّفه، من غير ما حد يفتكر يزوّد
 * سطر في ليستة.
 *
 * والاستثناء الوحيد المسموح: رمز العملة الافتراضي (`ج`) — لأن ده رمز مش
 * جملة، والمتجر بيحطّ عملته هو مكانه.
 *
 *   node scripts/check-shop-i18n.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

// قوالب الزائر في المتجر — الصفحة الرئيسية والمنتج والسلة والدفع والمقارنة
// وصفحة الهبوط وصفحة النجاح.
const VIEWS = [
  'src/views/tenant_shop.ejs',
  'src/views/shop/product.ejs',
  'src/views/shop/cart.ejs',
  'src/views/shop/checkout.ejs',
  'src/views/shop/compare.ejs',
  'src/views/shop/landing.ejs',
  'src/views/shop/success.ejs',
  'src/views/shop/pay_return.ejs',
];

// رمز العملة الافتراضي: رمز مش جملة، والمتجر بيحطّ عملته مكانه.
const ALLOWED = new Set(['ج']);

/** النص من غير التعليقات (EJS · HTML · JS) — التعليق بالعربي مطلوب هنا. */
function visible(src) {
  const nl = (m) => m.replace(/[^\n]/g, ' ');
  return src
    .replace(/<%#[\s\S]*?%>/g, nl)
    .replace(/<!--[\s\S]*?-->/g, nl)
    .replace(/\/\*[\s\S]*?\*\//g, nl)
    .replace(/(^|[^:'"])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
}

/* ── ١. مفيش عربي في القوالب ──────────────────────────────────────────── */
{
  const dirty = [];
  for (const rel of VIEWS) {
    const src = visible(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const hits = (src.match(/[ء-ي][ء-ي\sـ]*/g) || [])
      .map((x) => x.trim()).filter((x) => x && !ALLOWED.has(x));
    if (hits.length) dirty.push(rel + ': ' + [...new Set(hits)].slice(0, 4).join(' · '));
  }
  check('مفيش جملة عربية مكتوبة في قوالب المتجر', dirty.length === 0, dirty.join(' | ') || 'نضيفة');
}

/* ── ٢. المفاتيح موجودة باللغتين ──────────────────────────────────────── */
{
  // المفاتيح اللي القوالب بتستعملها فعلاً — محسوبة من القوالب، مش ليستة
  // بتتكتب بالإيد وتقدم.
  const used = new Set();
  for (const rel of VIEWS) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    (src.match(/t\('(sf\.[a-z0-9_.]+)'\)/g) || []).forEach((m) => {
      used.add(/t\('([^']+)'\)/.exec(m)[1]);
    });
  }
  check('القوالب بتستعمل مفاتيح المتجر', used.size >= 100, used.size + ' مفتاح');
  const missingAr = [...used].filter((k) => !strings.ar[k]);
  const missingEn = [...used].filter((k) => !strings.en[k]);
  check('وكلها موجودة بالعربي', missingAr.length === 0, missingAr.slice(0, 6).join(', ') || 'تمام');
  check('وكلها موجودة بالإنجليزي', missingEn.length === 0, missingEn.slice(0, 6).join(', ') || 'تمام');

  // ترجمة إنجليزية = نفس النص العربي معناها إن المفتاح اتضاف ومااتترجمش.
  const same = [...used].filter((k) => strings.ar[k] && strings.ar[k] === strings.en[k]
    && /[ء-ي]/.test(strings.ar[k]));
  check('ومفيش مفتاح «إنجليزيه» عربي', same.length === 0, same.slice(0, 6).join(', ') || 'تمام');
}

/* ── ٣. الأرقام والعملة بلغة الزائر ───────────────────────────────────── */
{
  const bad = [];
  for (const rel of VIEWS) {
    const src = visible(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    // `toLocaleString('ar-EG')` بيطبع أرقام عربية للزائر الإنجليزي.
    if (/toLocaleString\('ar-EG'\)/.test(src)) bad.push(rel);
  }
  check('ومفيش تنسيق أرقام متثبّت على العربي', bad.length === 0, bad.join(', ') || 'تمام');
}

/* ── ٤. والنص اللي جوّه <script> بيعدّي على الدالة الآمنة ─────────────── */
{
  const raw = [];
  for (const rel of VIEWS) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (/<%-\s*JSON\.stringify\(/.test(src)) raw.push(rel);
  }
  check('والترجمة اللي جوّه سكربت بتعدّي على `jsonLd`', raw.length === 0, raw.join(', ') || 'تمام');
}

console.log(fail === 0
  ? '\n✅ المتجر بيتكلّم لغة الزائر — مفيش جملة عربية متصلّبة في القوالب.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
