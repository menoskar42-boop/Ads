#!/usr/bin/env node
// حارس finance.oscardevs.com (EGX Swing): أداة شخصية للمالك.
// noindex ومن غير إعلانات ومش فى السايت ماب · مفيش تنفيذ صفقات ولا ربط بسمسرة · التنبيه على كل صفحة ·
// المفتاح مطلوب لكل إدخال · الاسم محجوز للمتاجر · الحسابات عليها اختبارات · من غير شرطة طويلة (طلب المالك).
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let bad = 0;
const check = (name, ok, why) => { console.log((ok ? '✅ ' : '❌ ') + name + (ok ? '' : '\n   ' + why)); if (!ok) bad++; };

const site = read('src/routes/finance_site.js');
const app = read('finance-web/app.js');
const server = read('server.js');
const files = ['src/routes/finance_site.js', 'src/finance/levels.js', 'src/finance/store.js', 'src/finance/analysis.js',
  'finance-web/app.js', 'finance-web/style.css', 'finance-web/userscripts/yahoo-feeder.user.js', 'finance-web/userscripts/egx-disclosures.user.js',
  'docs/FINANCE_EGX.md'];
const all = files.map((f) => [f, read(f)]);

check('noindex on every response, robots disallow, no ads',
  /X-Robots-Tag', 'noindex, nofollow'/.test(site) && /Disallow: \//.test(site) && /showAds = false/.test(site)
    && !all.some(([, s]) => /adsbygoogle|pagead2\.googlesyndication/.test(s)),
  'الموقع أداة شخصية: مايتأرشفش ومافيهوش إعلانات.');
check('not in sitemap or llms.txt',
  !/finance\.oscardevs\.com/.test(read('src/routes/index.js')) && !(fs.existsSync(path.join(root, 'public/llms.txt')) && /finance\.oscardevs/.test(read('public/llms.txt'))),
  'finance مايدخلش السايت ماب ولا llms.txt.');
check('disclaimer on every page (Arabic and English)',
  /ليست نصيحة استثمار/.test(site) && /not investment advice/.test(site) && /\$\{DISCLAIMER_AR\}/.test(site) && /\$\{DISCLAIMER_EN\}/.test(site),
  'كل صفحة لازم تقول: تقديرات فنية فقط وليست نصيحة استثمار، والبيانات متأخرة.');
check('no trade execution and no broker anywhere',
  !all.some(([, s]) => /thndr|placeOrder|place_order|\/order|executeTrade|execute_trade/i.test(s.replace(/مفيش تنفيذ صفقات ولا أى ربط بشركة سمسرة/g, ''))),
  'ممنوع أى زرار أو API بينفّذ صفقة أو يتكلم مع شركة سمسرة. التذكرة للعرض والنسخ بس.');
check('every ingest/edit route needs the key',
  /post\('\/api\/ingest\/quotes', needKey/.test(site) && /post\('\/api\/ingest\/candles', needKey/.test(site)
    && /post\('\/api\/ingest\/disclosures', needKey/.test(site) && /post\('\/api\/watchlist', needKey/.test(site)
    && /reanalyze', needKey/.test(site) && /timingSafeEqual/.test(site),
  'أى إدخال أو تعديل لازم X-API-Key = FINANCE_INGEST_KEY.');
check('AI capped per day and in one swappable function',
  /FINANCE_AI_DAILY_CAP \|\| 50/.test(site) && /async function analyzeDisclosure/.test(read('src/finance/analysis.js')),
  'التحليل بحد ٥٠ فى اليوم، والمزوّد كله فى analysis.js.');
check('mounted by host before body parsers, boot not blocked, slug reserved',
  server.indexOf("startsWith('finance.')") > 0 && server.indexOf("startsWith('finance.')") < server.indexOf('app.use(express.json(')
    && /financeSite\.start\(\)\.catch/.test(server) && /'finance'/.test(read('src/lib/reserved_slugs.js')),
  'finance لازم يتوجّه بالـhost قبل الـparsers، والقاعدة ماتأخرش الإقلاع، والاسم محجوز.');
check('userscripts only read open pages, no captcha bypass, back off on 429',
  /@match        https:\/\/finance\.yahoo\.com\/\*/.test(read('finance-web/userscripts/yahoo-feeder.user.js'))
    && /429/.test(read('finance-web/userscripts/yahoo-feeder.user.js'))
    && /افتح الصفحة بنفسك/.test(read('finance-web/userscripts/egx-disclosures.user.js'))
    && !all.some(([, s]) => /captcha.*(solve|bypass)|2captcha|anticaptcha/i.test(s)),
  'السكربتات بتقرا الصفحة المفتوحة بس، ومفيش تخطّى لأى حماية.');
check('own schema (Service Flow tables untouched)',
  /CREATE SCHEMA IF NOT EXISTS egx/.test(read('src/finance/store.js')) && !/CREATE TABLE IF NOT EXISTS (?!egx\.)/.test(read('src/finance/store.js')),
  'كل جداول finance فى schema egx بس.');
check('tests exist for the math and the API',
  fs.existsSync(path.join(root, 'test/finance.test.js')) && fs.existsSync(path.join(root, 'test/finance_api.test.js')),
  'test/finance.test.js و test/finance_api.test.js');
check('no em dash or en dash in finance files (owner request)',
  !all.some(([, s]) => /[–—]/.test(s)),
  'ممنوع الشرطة الطويلة فى ملفات finance: ' + all.filter(([, s]) => /[–—]/.test(s)).map(([f]) => f).join(', '));
check('no secrets in code', !all.some(([, s]) => /sk-[A-Za-z0-9]{20,}|postgres(ql)?:\/\/[^\s'"]*:[^\s'"@]+@/.test(s)), 'مفيش مفاتيح ولا روابط قاعدة فيها باسورد.');

if (bad) { console.error(`\n${bad} check(s) failed`); process.exit(1); }
console.log('\nfinance: all checks passed');
