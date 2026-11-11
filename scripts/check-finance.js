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
  'src/finance/signals.js', 'src/finance/sim.js', 'src/finance/trade.js', 'src/finance/yahoo.js', 'finance-web/sw.js',
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
check('no real trade execution: «نعم» only writes the demo portfolio, nothing talks to a broker',
  !all.some(([f, s]) => !f.endsWith('.md') && /https?:\/\/[^\s'"]*thndr|@(?:match|connect)\s+\S*thndr|placeOrder|executeTrade|execute_trade/i.test(s))
    && !/INSERT INTO egx\.(?!sim_|recs|settings|push_subs|quotes|candles|levels|alerts|disclosures|watchlist)/.test(read('src/finance/trade.js'))
    && /egx\.sim_orders/.test(read('src/finance/trade.js')),
  'التنفيذ الحقيقى بإيد المالك من تطبيق Thndr. الموقع مابيكلّمش أى شركة سمسرة، و«نعم» بتكتب فى محفظة الديمو بس.');
check('ingest needs the key; every page and owner API needs login; Yes/No needs login or the signed token',
  /post\('\/api\/ingest\/quotes', needKey/.test(site) && /post\('\/api\/ingest\/candles', needKey/.test(site)
    && /post\('\/api\/ingest\/disclosures', needKey/.test(site) && /post\('\/api\/watchlist', needOwner/.test(site)
    && /get\('\/api\/state', needOwner/.test(site) && /get\('\/api\/sim', needOwner/.test(site) && /reanalyze', needOwner/.test(site)
    && /if \(!isOwner\(req\) && !tokenOk\) return fail\(res, 401/.test(site) && /if \(!sessionOk\(req\)\) return res\.redirect\(302, '\/login/.test(site)
    && /timingSafeEqual/.test(site) && /HttpOnly; SameSite=Lax/.test(site),
  'الموقع شخصى: كل صفحة وكل API بالدخول، والإدخال بالمفتاح، و«نعم/لا» من الإشعار بتوكن موقّع.');
check('AI only for disclosures (once each, capped per day); signals are rules (cost)',
  /FINANCE_AI_DAILY_CAP \|\| 30/.test(site) && /async function analyzeDisclosure/.test(read('src/finance/analysis.js'))
    && !/analysis|fetch\(/.test(read('src/finance/signals.js')) && !/analysis/.test(read('src/finance/trade.js')),
  'طلب المالك: أقل اعتماد على الذكاء الاصطناعى. الترشيحات بقواعد، والتحليل للإفصاحات بس بحد ٣٠ فى اليوم.');
check('mounted by host before body parsers, boot not blocked, slug reserved',
  server.indexOf("startsWith('finance.')") > 0 && server.indexOf("startsWith('finance.')") < server.indexOf('app.use(express.json(')
    && /financeSite\.start\(\)\.catch/.test(server) && /'finance'/.test(read('src/lib/reserved_slugs.js')),
  'finance لازم يتوجّه بالـhost قبل الـparsers، والقاعدة ماتأخرش الإقلاع، والاسم محجوز.');
check('userscripts only read open pages, no captcha bypass, back off on 429',
  /@match        https:\/\/finance\.yahoo\.com\/\*/.test(read('finance-web/userscripts/yahoo-feeder.user.js'))
    && /429/.test(read('finance-web/userscripts/yahoo-feeder.user.js'))
    && /دوّر بنفسك/.test(read('finance-web/userscripts/egx-disclosures.user.js')) && /عشان لو البحث رجّع فاضى/.test(read('finance-web/userscripts/egx-disclosures.user.js'))
    && !all.some(([, s]) => /captcha.*(solve|bypass)|2captcha|anticaptcha/i.test(s)),
  'السكربتات بتقرا الصفحة المفتوحة بس، ومفيش تخطّى لأى حماية.');
check('EGX prices script: watchlist only, tagged egx, polite pace, Yahoo pauses while it feeds',
  (() => { const u = read('finance-web/userscripts/egx-disclosures.user.js'), t = read('src/finance/trade.js');
    return /@match        https:\/\/www\.egx\.com\.eg\/ar\/prices\.aspx\*/.test(u) && /ingest\/quotes\?source=egx/.test(u)
      && /rows\.filter\(function \(r\) \{ return taken\[r\.isin\]; \}\)/.test(u) && /\/api\/watchlist\/isin/.test(u) && /setTimeout\(loop, 2 \* 60000\)/.test(u) && /await sleep\(1200\)/.test(u)
      && /source='egx' AND fetched_ts > \$1/.test(t) && !/egxLive &&/.test(t.replace('!egxLive &&', '')); })(),
  'سكربت الأسعار بيبعت أسهم القايمة بس كل دقيقتين، وكود كل سهم بيتحفظ على السيرفر مرة واحدة (وصفحات الشركات واحدة كل ثانية ونص)، وYahoo بيقف طول ما أسعار البورصة بتوصل.');
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
