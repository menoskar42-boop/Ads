#!/usr/bin/env node
/**
 * كل حقل إدخال في النماذج العامة له label **مرتبط** — مش مجرد نص جنبه.
 *
 * ── الفرق بين «فيه label» و«الـlabel مرتبط» ────────────────────────────
 *
 * النماذج كانت فيها `<label>` فوق كل حقل، وشكلها سليم تماماً للي بيبصّ.
 * بس الـ`<label>` مكانش فيه `for` والحقل مكانش فيه `id`، والـlabel كان
 * **أخ** للحقل مش أب. يعني الربط الدلالي صفر:
 *
 *     · قارئ الشاشة بيقول «حقل نص فاضي» — من غير ما يقول إيه
 *     · الضغط على النص مابيحطّش المؤشر في الحقل
 *     · الإدخال بالصوت مابيعرفش يوصل للحقل باسمه
 *
 * مسكها فحص خارجي على تسع صفحات (`BUG-A11Y-007`). ودي غلطة بتعدّي من
 * المراجعة البصرية دايماً، لأن الصفحة **بتبان مظبوطة**.
 *
 * ── الفحص بيرندر بمتصفح حقيقي ──────────────────────────────────────────
 *
 * بنسأل المتصفح نفسه: `label[for=<id>]` موجود؟ ولا الحقل جوّه `<label>`؟
 * ولا عليه `aria-label`؟ التلاتة مقبولين — وده أدق من ريجيكس على النص،
 * لأن الربط بيعتمد على شجرة الصفحة مش على شكل الكود.
 *
 * Usage: node scripts/check-form-labels.js
 */
'use strict';
const path = require('path');
const ejs = require('ejs');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://oscardevs.com';

/* الكروم اللي في البيئة دي. `playwright` بيدوّر على نسخة تانية افتراضياً
 * وبيقع بـ«Executable doesn't exist»، والمسار ده هو الموجود فعلاً. */
const CHROME = process.env.CHROME_PATH
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const PAGES = [
  ['legal/contact.ejs', 'نموذج التواصل'],
  ['apply/form.ejs', 'نموذج التقديم'],
  // فحص QA خارجي فضل يبلّغ عن الصفحة دي بعد ما الاتنين فوق اتصلّحوا.
  ['company/login.ejs', 'بوابة الدخول'],
];

/** الحقول اللي مالهاش label بالتصميم. */
const EXEMPT = new Set([
  'website', // مصيدة السبام — مخفية عن الناس عمداً
]);

function locals() {
  return {
    siteOrigin: SITE,
    facts: require('../src/lib/company_facts').facts(),
    canonicalUrl: SITE + '/ar/contact',
    assetVersion: '1',
    ads: { enabled: false, publisherId: '', slots: {} },
    showAds: false,
    lang: 'ar', dir: 'rtl', t: (k) => k,
    termsVersion: '1.3',
    pricing: require('../src/lib/pricing'),
    canonicalCompanyUrl: () => SITE,
    jsonLd: (o) => JSON.stringify(o),
    error: null, values: {}, sent: false, csrfToken: 'x',
  };
}

(async () => {
  let failed = 0;
  const browser = await chromium.launch({ executablePath: CHROME });
  for (const [file, label] of PAGES) {
    let html;
    try {
      html = await ejs.renderFile(path.join(ROOT, 'src/views', file), locals(),
        { root: path.join(ROOT, 'src/views') });
    } catch (e) {
      console.log(`❌ ${label} مااترندرش: ${e.message.split('\n')[0]}`);
      failed += 1;
      continue;
    }
    const page = await browser.newPage();
    await page.setContent(html);
    const r = await page.evaluate((exempt) => {
      const fields = [...document.querySelectorAll('input:not([type=hidden]),textarea,select')];
      const bad = [];
      for (const f of fields) {
        if (exempt.includes(f.name)) continue;
        const byFor = f.id && document.querySelector(`label[for="${CSS.escape(f.id)}"]`);
        const wrapped = f.closest('label');
        const aria = f.getAttribute('aria-label') || f.getAttribute('aria-labelledby');
        if (!byFor && !wrapped && !aria) bad.push(f.name || f.type);
      }
      return { total: fields.length, bad };
    }, [...EXEMPT]);
    /* ⚠️ ومعرّف مكرّر على نفس الحقل.
     *
     * حصلت فعلاً: الربط الآلي حطّ `id="apply-preferred_slug"` على حقل
     * كان عنده `id="slugInput"` خلاص. المتصفح بياخد الأول ويرمي التاني،
     * فالجافاسكريبت اللي بيدوّر على `slugInput` (فحص توفّر الاسم) وقع في
     * صمت — الـlabel اتظبط والميزة اتكسرت. */
    const dupIds = await page.evaluate(() => {
      const seen = {};
      const bad = [];
      for (const el of document.querySelectorAll('[id]')) {
        if (seen[el.id]) bad.push(el.id);
        seen[el.id] = true;
      }
      return bad;
    });
    if (dupIds.length) {
      console.log(`❌ ${label} — معرّف مكرّر: ${dupIds.join('، ')}`);
      failed += 1;
    }
    await page.close();

    const ok = r.bad.length === 0;
    console.log(`${ok ? '✅' : '❌'} ${label} — ${r.total} حقل`
      + (ok ? ' · كلهم مرتبطين بـlabel' : ` · بلا ربط: ${r.bad.join('، ')}`));
    if (!ok) {
      console.log('   الحقل من غير label مرتبط بيتقرا «حقل نص فاضي» في قارئ '
        + 'الشاشة، والضغط على اسمه مابيحطّش المؤشر فيه. ضيف `for`/`id` أو '
        + 'لُف الحقل جوّه الـ`<label>`.');
      failed += 1;
    }
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('❌ الفحص وقع:', e.message); process.exit(1); });
