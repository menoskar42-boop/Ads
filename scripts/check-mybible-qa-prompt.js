#!/usr/bin/env node
/**
 * برومبت اختبار mybible لازم يفضل مربوط بالكود.
 *
 * ليه: البرومبت ده بيتبعت لوكيل خارجي (مانوس) بيفتح الموقع **الحي**
 * اللي عليه ٧٠٠ عضو. وفيه حاجتين بيقدموا من غير ما حد ياخد باله:
 *
 *  ١) **الأرقام.** البرومبت بيقول «٧٣ سفر تفاسير» و«٧٢ فصل في
 *     الباسيلي». لو الكود اتغيّر والبرومبت مااتغيّرش، المختبِر هيبلّغ عن
 *     أخطاء مش موجودة، أو — الأسوأ — هيقول «عدّى» على نقص حقيقي لإن
 *     الرقم اللي في إيده غلط.
 *
 *  ٢) **الخطوط الحمرا.** البرومبت بيسمّي الراوتات اللي بتكتب وبتمسح
 *     وبيقول «ماتلمسهاش». راوت جديد بيكتب ومش مكتوب في القايمة معناه
 *     وكيل اختبار ممكن يدوسه ويفضّي جدول. الفحص بيقارن قايمة البرومبت
 *     بكل راوت بيكتب في `routes.ts` — الناقص بيوقّعه.
 *
 * وكمان بيتأكد إن كل رابط API مذكور في البرومبت **موجود فعلاً** — عشان
 * ما نبعتش المختبِر على 404 ويكتبها كباج.
 *
 * الأرقام بتتقاس من الكود نفسه (باستيراد الموديولات الحقيقية حيثما
 * أمكن)، مش من جدول متكتوب بالإيد جوّه الفحص.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYBIBLE = path.join(ROOT, 'mybible');
const DOC = path.join(ROOT, 'docs/MYBIBLE_QA_PROMPT.md');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };
const ok = [];

if (!fs.existsSync(DOC)) { fail('docs/MYBIBLE_QA_PROMPT.md مش موجود'); process.exit(1); }
if (!fs.existsSync(MYBIBLE)) {
  console.log('⏭️  mybible مش موجود هنا — مفيش حاجة تتفحص');
  process.exit(0);
}

const doc = fs.readFileSync(DOC, 'utf8');
const read = (rel) => fs.readFileSync(path.join(MYBIBLE, rel), 'utf8');

/** أرقام عربية-هندية → لاتينية، عشان نقارن. */
const ar2en = (s) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/* ── الأرقام من الكود ─────────────────────────────────────────────────── */
let live;
try {
  const probe = path.join(require('os').tmpdir(), `mybible-facts-${process.pid}.mjs`);
  fs.writeFileSync(probe, `
const out = {};
const tafsir = await import(${JSON.stringify('file://' + path.join(MYBIBLE, 'server/tafsir-service.ts'))});
out.tafsirBooks = tafsir.listAvailableBooks().length;
const cov = tafsir.getTafsirCoverage(true);
out.tafsirPresent = cov.totals.presentChapters;
out.tafsirExpected = cov.totals.expectedChapters;
out.tafsirGaps = cov.books.filter(b => b.missing && b.missing.length)
  .map(b => [b.book, b.missing]);
const agpeya = await import(${JSON.stringify('file://' + path.join(MYBIBLE, 'client/src/lib/agpeya-content.ts'))});
out.agpeyaHours = agpeya.agpeyaHoursFull.length;
const kholagy = await import(${JSON.stringify('file://' + path.join(MYBIBLE, 'client/src/lib/kholagy-data.ts'))});
out.basil = kholagy.basilSections.length;
out.gregory = kholagy.gregorySections.length;
out.cyril = kholagy.cyrilSections.length;
const syn = await import(${JSON.stringify('file://' + path.join(MYBIBLE, 'client/src/lib/synaxarium-content.ts'))});
out.synaxariumMonths = syn.synaxariumMonths.length;
process.stdout.write('@@JSON@@' + JSON.stringify(out));
`, 'utf8');
  const raw = execFileSync(process.execPath, ['--no-warnings', probe],
    { cwd: MYBIBLE, env: { ...process.env, NODE_ENV: 'test' }, maxBuffer: 1 << 26 }).toString('utf8');
  fs.unlinkSync(probe);
  live = JSON.parse(raw.slice(raw.indexOf('@@JSON@@') + 8));
} catch (e) {
  console.error('⚠️  مش قادر أشغّل موديولات mybible (محتاج Node ≥ 22.6):');
  console.error('    ' + String(e.stderr || e.message).split('\n').slice(0, 3).join('\n    '));
  process.exit(1);
}

const routes = read('server/routes.ts');
const app = read('client/src/App.tsx');
const orthodox = read('client/src/pages/Orthodox.tsx');
const deutero = read('server/deutero.ts');
const katameros = read('server/katameros-service.ts');
const sitemapGen = read('server/sitemap-generator.ts');

// ٦٦ سفر: الرقم اللي `/api/health` نفسه بيحكم بيه
const booksExpected = (/books\.length === (\d+)/.exec(routes) || [])[1];
// الأسفار القانونية التانية: عدّ العناصر جوّه DEUTERO_BOOKS
const deuteroBlock = /export const DEUTERO_BOOKS[\s\S]*?\n\];/.exec(deutero);
const deuteroCount = deuteroBlock ? (deuteroBlock[0].match(/\{\s*name:\s*'/g) || []).length : 0;
// تبويبات الأرثوذكسية
const tabsBlock = /ORTHODOX_VALID_TABS = new Set\(\[([\s\S]*?)\]\)/.exec(orthodox);
const tabs = tabsBlock ? (tabsBlock[1].match(/'[^']+'/g) || []).map((t) => t.slice(1, -1)) : [];
// أقسام الأطفال
const kidsRoutes = [...app.matchAll(/path="(\/kids\/[^"]+)"/g)].map((m) => m[1]);
// قراءات اليوم: المفاتيح اللي شكلها قراءة في DailyReadingsCompatibility
const compat = /export interface DailyReadingsCompatibility \{([\s\S]*?)\n\}/.exec(katameros);
const readingKeys = compat
  ? [...compat[1].matchAll(/^\s*(\w+): \{ title: string; slides: string\[\] \};/gm)].map((m) => m[1])
  : [];

/* ── ١) جدول الأرقام في آخر البرومبت ──────────────────────────────────── */
const num = (label) => {
  const re = new RegExp('\\|\\s*' + label + '\\s*\\|\\s*([^|]+?)\\s*\\|');
  const m = re.exec(doc);
  if (!m) { fail(`سطر «${label}» مش موجود في جدول أرقام البرومبت`); return null; }
  return ar2en(m[1]).trim();
};
const expect = (label, actual) => {
  const want = num(label);
  if (want === null) return;
  if (want !== String(actual)) {
    fail(`البرومبت بيقول «${label} = ${want}» والكود بيقول ${actual} — حدّث البرومبت.`);
  } else ok.push(`${label}=${actual}`);
};

expect('أسفار الكتاب', booksExpected);
expect('أسفار قانونية تانية', deuteroCount);
expect('أسفار التفاسير', live.tafsirBooks);
expect('أصحاحات التفاسير', `${live.tafsirPresent} / ${live.tafsirExpected}`);
expect('تبويبات أرثوذكسية', tabs.length);
expect('ساعات الأجبية', live.agpeyaHours);
expect('فصول الباسيلي', live.basil);
expect('فصول الغريغوري', live.gregory);
expect('فصول الكيرلسي', live.cyril);
expect('شهور السنكسار', live.synaxariumMonths);
expect('أقسام الأطفال', kidsRoutes.length);
expect('قراءات اليوم', readingKeys.length);

/* ── ٢) جدول النواقص المعروفة = النواقص الحقيقية ──────────────────────── */
{
  const real = new Map(live.tafsirGaps.map(([b, ch]) => [b, ch.slice().sort((a, x) => a - x)]));
  const table = /\|\s*السفر\s*\|\s*الأصحاحات الناقصة\s*\|([\s\S]*?)\n\s*\n/.exec(doc);
  if (!table) {
    fail('جدول «الأصحاحات الناقصة» مش موجود في البرومبت — من غيره المختبِر '
      + 'هيبلّغ عن ١٨ إصحاح كأخطاء.');
  } else {
    const listed = new Map();
    for (const row of table[1].split('\n')) {
      const m = /^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/.exec(row);
      if (!m || m[1] === '---') continue;
      const nums = ar2en(m[2]).match(/\d+/g);
      if (nums) listed.set(m[1].trim(), nums.map(Number).sort((a, x) => a - x));
    }
    for (const [book, chapters] of real) {
      const got = listed.get(book);
      if (!got) {
        fail(`«${book}» ناقص فيه أصحاحات (${chapters.join('،')}) ومش مكتوب في جدول `
          + 'النواقص المعروفة — المختبِر هيبلّغ عنها كأخطاء.');
      } else if (got.join(',') !== chapters.join(',')) {
        fail(`نواقص «${book}» في البرومبت [${got.join('،')}] والحقيقة `
          + `[${chapters.join('،')}] — حدّث الجدول.`);
      }
    }
    for (const book of listed.keys()) {
      if (!real.has(book)) {
        fail(`«${book}» مكتوب في جدول النواقص وهو **كامل** دلوقتي — `
          + 'شيله، وإلا المختبِر هيعدّي على نقص حقيقي لو رجع.');
      }
    }
    if (!process.exitCode) ok.push(`نواقص=${real.size} سفر`);
  }
}

/* ── ٣) كل رابط API في البرومبت موجود فعلاً ───────────────────────────── */
{
  /* ⚠️ `app.use` بس، من غير `app.use`: الملف فيه
   * `app.use('/api/*', ensureSessionUser)` — ونمط بنجمة زي ده بيطابق **أي**
   * رابط، فكان بيخلّي الفحص ده يعدّي على رابط متهيّأ. فحص مابيقدرش يقع
   * مش فحص. بناخد أفعال HTTP بس، وبنرمي أي نمط فيه نجمة. */
  const served = new Set([
    ...[...routes.matchAll(/app\.(?:get|post|put|patch|delete)\(\s*'([^']+)'/g)].map((m) => m[1]),
    ...[...read('server/index.ts').matchAll(/app\.(?:get|post|put|patch|delete)\(\s*"([^"]+)"/g)].map((m) => m[1]),
  ].filter((p) => !p.includes('*')));
  const mentioned = new Set(
    [...doc.matchAll(/mybible\.oscardevs\.com(\/(?:api|robots|sitemap|llms)[^\s`)]*)/g)]
      .map((m) => m[1].replace(/[.،]$/, '')),
  );
  for (const url of mentioned) {
    const hit = [...served].some((p) => {
      if (p === url) return true;
      const rx = new RegExp('^' + p.replace(/:[^/]+/g, '[^/]+') + '$');
      return rx.test(url);
    });
    if (!hit) fail(`البرومبت بيبعت المختبِر على \`${url}\` وهو مش متسجّل في السيرفر — هيلاقي 404.`);
  }
  if (mentioned.size) ok.push(`${mentioned.size} رابط API متأكَّد`);
}

/* ── ٤) كل راوت بيكتب مكتوب في الخطوط الحمرا ──────────────────────────── */
{
  const redBlock = /# ١\) خطوط حمرا[\s\S]*?\n# ٢\)/.exec(doc);
  if (!redBlock) {
    fail('قسم «خطوط حمرا» مش موجود في البرومبت — من غيره الوكيل ممكن يفضّي جدول.');
  } else {
    const red = redBlock[0];
    const writers = [];
    for (const m of routes.matchAll(/app\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      const [, method, route] = m;
      if (/^\/api\/(seed|fix)\//.test(route) && route !== '/api/seed/verses/status') {
        writers.push(route);
      } else if (/^\/api\/deutero\/import/.test(route)) writers.push(route);
      else if (/^\/api\/push\//.test(route) && method === 'post'
        && !/subscribe|unsubscribe/.test(route)) writers.push(route);
      else if (route === '/api/user/premium' && method === 'post') writers.push(route);
    }
    for (const route of writers) {
      // مغطّى بالاسم الكامل أو بنمط `/api/seed/*`
      const family = route.replace(/^(\/api\/[^/]+\/)[^/]+.*$/, '$1*');
      if (!red.includes(route) && !red.includes(family)) {
        fail(`\`${route}\` بيكتب في القاعدة ومش مكتوب في الخطوط الحمرا — `
          + 'ضيفه في القسم ١ من البرومبت قبل ما تبعته لحد.');
      }
    }
    if (!writers.length) {
      fail('مالقيتش ولا راوت بيكتب في routes.ts — الفحص مش قادر يقيس. '
        + 'يا إما الراوتات اتنقلت يا إما الصيغة اتغيّرت.');
    } else ok.push(`${writers.length} راوت خطر مغطّى`);
  }
}

/* ── ٥) النطاق في البرومبت = النطاق في الكود ─────────────────────────── */
{
  const site = (/const SITE = "([^"]+)"/.exec(sitemapGen) || [])[1];
  if (!site) fail('مش لاقي SITE في sitemap-generator.ts');
  else if (!doc.includes(site.replace(/^https?:\/\//, ''))) {
    fail(`البرومبت مافيهوش نطاق الموقع الحقيقي (${site}).`);
  } else ok.push('النطاق مطابق');
}

if (process.exitCode) process.exit(1);
console.log('✅ برومبت اختبار mybible مربوط بالكود: ' + ok.join(' · '));
