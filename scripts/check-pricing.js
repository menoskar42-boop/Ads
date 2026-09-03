#!/usr/bin/env node
/**
 * A price is a promise. This one is made in more than one place.
 *
 * The twelve service cards on the home page carry the real numbers as markup.
 * Sector landing pages, their JSON-LD offers, and the facts page all state the
 * same numbers again. One had already drifted before anyone noticed: the
 * car-workshop landing page advertised 199 ج/شهر in its structured data — the
 * clinic's price — while a workshop actually costs 139. Structured data is what
 * a search engine and an assistant quote, so the wrong number is the one that
 * gets repeated.
 *
 * src/lib/pricing.js is now the source. This asserts every other place agrees
 * with it, and that no landing page invents a price of its own.
 *
 *   node scripts/check-pricing.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { PRICES } = require('../src/lib/pricing');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The home page's cards are the customer-facing original ────────────── */
const home = fs.readFileSync(path.join(ROOT, 'src/views/home.ejs'), 'utf8');
const cards = home.split('<div class="service-card').slice(1);
const fromHome = {};
for (const card of cards) {
  const type = /apply\?type=(\w+)/.exec(card);
  if (!type) continue;
  const opts = [...card.matchAll(/price-tier">([^<]*)<\/span>\s*<span class="price-value">([\d,]+)<small>([^<]*)<\/small>/g)];
  const row = {};
  for (const [, tier, value, unit] of opts) {
    const n = parseInt(value.replace(/,/g, ''), 10);
    if (/شهري/.test(tier) || /شهر/.test(unit)) row.monthly = n;
    else row.buy = n;
  }
  if (row.buy || row.monthly) fromHome[type[1]] = row;
}

check('every system in the table has a card on the home page',
  Object.keys(PRICES).every((t) => fromHome[t]),
  Object.keys(PRICES).filter((t) => !fromHome[t]).join(', ') || `${Object.keys(fromHome).length} كارت`);

const drift = [];
for (const [type, p] of Object.entries(PRICES)) {
  const h = fromHome[type];
  if (!h) continue;
  if (h.buy !== p.buy) drift.push(`${type}: شراء ${h.buy} في الرئيسية و${p.buy} في pricing.js`);
  if (h.monthly !== p.monthly) drift.push(`${type}: شهري ${h.monthly} في الرئيسية و${p.monthly} في pricing.js`);
}
check('the home page and pricing.js agree on every number', drift.length === 0, drift.join(' | '));

/* ── Landing pages must not carry a price of their own ─────────────────── */
// A number typed into a landing page cannot be kept in step with anything. The
// pages read priceLine()/PRICES instead, so this looks for stray literals.
const landingDir = path.join(ROOT, 'src/views/landing');
const strays = [];
for (const f of fs.readdirSync(landingDir).filter((x) => x.endsWith('.ejs'))) {
  const src = fs.readFileSync(path.join(landingDir, f), 'utf8');
  // Any 2–4 digit number next to a currency marker that is not interpolated.
  for (const m of src.matchAll(/(?<!<%[=-]?[^%]{0,80})["'>\s]([0-9]{2,4})\s*(?:ج|EGP|جنيه)/g)) {
    strays.push(`${f}: ${m[1]}`);
  }
  // A JSON-LD offer with a hardcoded price is the exact shape that drifted.
  for (const m of src.matchAll(/"price"\s*:\s*"?(\d+)/g)) strays.push(`${f}: offer ${m[1]}`);
}
check('no landing page hardcodes a price', strays.length === 0, strays.join(', '));

/* ── And the pages that quote prices in prose use the shared line ──────── */
{
  const facts = fs.readFileSync(path.join(ROOT, 'src/views/legal/company_facts.ejs'), 'utf8');
  check('the facts page states real prices rather than "ask us"',
    /PRICES|arabicNumber/.test(facts));
}

/* ── `llms.txt` — الملف اللي محرّكات الإجابة بتقتبس منه ────────────────
 *
 * قياس الجيو (٢٠٢٦-٠٨-٢٥) طلّع صفر ذكر لـOscarDevs في أربع أسئلة سوقية.
 * السعر أكتر حقيقة بيستشهد بيها محرّك الإجابة — فلو الرقم هنا غلط، هو
 * الرقم اللي هيتكرّر في كل إجابة، مش الصح اللي على الصفحة.
 *
 * والفحص **بينفّذ الراوت فعلاً** ويقرا مخرَجه، مش بيدوّر على نص في
 * `legal.js`. مطابقة النص كانت هتعدّي على كود بيبني السطر صح ومابيطبعوش،
 * وعلى نظام اتشال من القايمة. */
{
  let body = null, why = null;
  try {
    const router = require('../src/routes/legal');
    const layer = router.stack.find((l) => l.route && l.route.path === '/llms.txt');
    if (!layer) throw new Error('مالقيتش راوت /llms.txt');
    const res = { setHeader() {}, send(b) { body = b; } };
    layer.route.stack[0].handle({ query: {}, headers: {}, get() {} }, res, () => {});
    if (!body) throw new Error('الراوت ما بعتش رد');
  } catch (e) {
    why = e.message;
  }

  if (why) {
    /* مش بنعدّيه أخضر. فحص مش قادر يقيس لازم يقول كده. */
    check('llms.txt: قدرت أنفّذ الراوت وأقرا مخرَجه', false, why);
  } else {
    const businessTypes = require('../src/lib/business_types');
    const { arabicNumber } = require('../src/lib/pricing');
    /* **قسم الأسعار بس.** قسم «الأنظمة الجاهزة» فوقه فيه سطور بتبدأ بنفس
     * الاسم بالظبط (`- **متجر إلكتروني**: منتجات وسلة…`)، فالبحث في الملف
     * كله كان بيلاقي سطر المميزات ويقول «مفيش سعر ولا رابط» وهما موجودين
     * تحت. وقع فعلاً أول تشغيل. */
    const priceBlock = (body.split('## الأسعار')[1] || '').split('\n## ')[0];
    const missing = [], wrong = [];
    for (const type of Object.keys(PRICES)) {
      const label = businessTypes.labelOf(type);
      const line = priceBlock.split('\n').find((l) => l.startsWith(`- **${label}**`));
      if (!line) { missing.push(label); continue; }
      const monthly = arabicNumber(PRICES[type].monthly);
      const buy = arabicNumber(PRICES[type].buy);
      if (!line.includes(monthly + ' ج/شهر') || !line.includes(buy + ' ج')) {
        wrong.push(`${label}: المفروض ${monthly}/${buy}`);
      }
      if (!/https:\/\/[^\s]+/.test(line)) wrong.push(`${label}: مفيش رابط`);
    }
    check('llms.txt: كل نظام مسعّر موجود فيه', missing.length === 0, missing.join('، '));
    check('llms.txt: وأسعاره مطابقة لـpricing.js ومعاه رابط', wrong.length === 0, wrong.join(' | '));

    check(`llms.txt: بيقول إن أول ${arabicNumber(require('../src/lib/pricing').FREE_MONTHS)} شهور مجانية وإن العملة جنيه`,
      /مجاني بالكامل أول/.test(body) && /الجنيه المصري|EGP/.test(body));

    /* الخدمات المخصّصة **مالهاش سعر** — القاعدة في
     * `docs/SOCIAL_POSTS_PROMPT.md`: «متكتبش سعر ولا رقم تقريبي»، لأن
     * سعرها بيتحدّد بعد وثيقة نطاق مكتوبة. لو ظهر رقم في القسم ده، أي
     * محرّك إجابة هيقتبسه كسعر ثابت. */
    const servicesBlock = body.split('## خدمات التطوير المخصّص')[1] || '';
    /* من غير `\b`. حدود الكلمة في JS مبنية على ASCII، و«ج» مش حرف كلمة
     * عندها — فـ`ج\b` **مابيطابقش أبداً**، حتى في «٥٠٠٠ ج». النسخة الأولى
     * كانت كده: فحص مايقدرش يقع، ضوء أخضر مالوش معنى. اتكشف لما جرّبت
     * أحطّ سعر في قسم الخدمات عمداً والفحص عدّى. */
    const servicesPriced = /[٠-٩0-9][٠-٩0-9٬,]*\s*ج(?![\u0600-\u06FF])/.test(servicesBlock);
    check('llms.txt: خدمات التطوير المخصّص بلا سعر', !servicesPriced,
      servicesPriced ? 'ظهر رقم بالجنيه في قسم الخدمات — سعرها بيتحدّد بعد وثيقة نطاق مكتوبة.' : '');
  }
}

console.log(fail
  ? `\n${fail} مشكلة في الأسعار — دي أرقام العميل بيقرر عليها وبيتحاسب بيها.`
  : `\nالأسعار متسقة عبر ${Object.keys(PRICES).length} نظام.`);
process.exit(fail ? 1 : 0);
