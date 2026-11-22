#!/usr/bin/env node
/**
 * قراءات القطمارس: المزمور والإنجيل بييجوا من قسم «الإنجيل»، والسنكسار
 * له مفتاحه.
 *
 * الغلط اللي الفحص ده اتعمل عشانه: `toDailyReadingsCompatibility` كانت
 * بتاخد المزمور والإنجيل من قسم **السنكسار**. والسنكسار سيرة قديس —
 * روابطه مش `view=today_bible`، فـ`parseDayLinks` ما بيسجّل منه ولا
 * قراءة. النتيجة إن شاشة القداس كانت بتعرض المزمور والإنجيل **فاضيين**
 * وهي بتقول `exact: true` يعني «دي قراءة النهارده». والاختبار اللي كان
 * مكتوب معاها كان بيحط المزمور والإنجيل تحت السنكسار في الـfixture —
 * فكان بيختبر نفسه ويعدّي.
 *
 * وكمان: الواجهة بتعرّف ست قراءات في `DailyReadingSlides` والسيرفر كان
 * بيبعت خمسة — `synaxar` ناقص خالص.
 *
 * الفحص ده **بينفّذ الدالة الحقيقية** على صفحة بالشكل الواقعي، ما
 * بيدوّرش على نص في الكود. لو حد رجّع القراءة من السنكسار تاني،
 * المزمور والإنجيل هيرجعوا فاضيين والفحص هيقع.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVICE = path.join(ROOT, 'mybible/server/katameros-service.ts');
const MAP = path.join(ROOT, 'mybible/client/src/lib/liturgy-map.ts');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

if (!fs.existsSync(SERVICE)) {
  console.log('⏭️  katameros-service.ts مش موجود — مفيش حاجة تتفحص');
  process.exit(0);
}

/* لازم esbuild: الملف TypeScript، وتحويله بـregex اتكسر مرتين قبل كده في
 * المشروع ده. من غير مترجم حقيقي الفحص **بيقول إنه مش قادر يقيس** بدل
 * ما يعدّي أخضر على غير أساس. */
function esbuildBin() {
  for (const p of [
    path.join(ROOT, 'node_modules/.bin/esbuild'),
    path.join(ROOT, 'mybible/node_modules/.bin/esbuild'),
    '/tmp/tsx-tool/node_modules/.bin/esbuild',
  ]) if (fs.existsSync(p)) return p;
  return null;
}

const bin = esbuildBin();
if (!bin) {
  console.error('⚠️  esbuild مش متسطّب — الفحص ده مش قادر يقيس سلوك الدالة.');
  console.error('    ثبّته (npm i -D esbuild) وشغّل تاني. مش هعدّيه أخضر.');
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'katameros-'));
const out = path.join(tmp, 'svc.mjs');
execFileSync(bin, [SERVICE, '--format=esm', `--outfile=${out}`, '--log-level=error']);

/* صفحة قطمارس بالشكل الحقيقي: السنكسار بيوصّل لصفحة السيرة (مش
 * today_bible)، والمزمور والإنجيل الاتنين تحت عنوان «الإنجيل». */
const link = (ref, id) => `<a href="?view=today_bible&id=${id}">${ref}</a>`;
const HTML = [
  '<p>قراءات اليوم</p>',
  '<p>البولس</p>',      link('عبرانيين ١١: ٣٢-٤٠', 'p1'),
  '<p>الكاثوليكون</p>', link('يعقوب ١: ١-١٢', 'c1'),
  '<p>الإبركسيس</p>',   link('أعمال ٩: ١-١٠', 'x1'),
  '<p>السنكسار</p>',    '<a href="?view=synaxarium&id=s1">استشهاد القديس مرقس</a>',
  '<p>الإنجيل</p>',     link('مزمور ١١٦: ١٥', 'g0'), link('يوحنا ١٢: ٢٤-٢٦', 'g1'),
].join('\n');

(async () => {
  const svc = await import('file://' + out);
  const parsed = svc.parseDayLinks(HTML);

  const day = {
    date: '2026-08-31', sourcePageUrl: 'u', sourceIndexUrl: 'i', title: 'يوم',
    readings: parsed.readings.map((r) => ({
      ...r, verses: [{ chapter: 1, verse: 1, text: 'نص' }], status: 'ok',
    })),
  };
  const body = svc.toDailyReadingsCompatibility(day);

  // ١) المزمور والإنجيل لازم يوصلوا بنص، مش فاضيين
  for (const [key, expected] of [['psalm', 'مزمور ١١٦: ١٥'], ['gospel', 'يوحنا ١٢: ٢٤-٢٦']]) {
    if (!body[key] || body[key].slides.length !== 1) {
      fail(`«${key}» طلع فاضي على شاشة القداس — الأغلب رجع يتقرا من السنكسار.`);
    } else if (body[key].title !== expected) {
      fail(`«${key}» عنوانه ${JSON.stringify(body[key].title)} والمفروض ${JSON.stringify(expected)}.`);
    }
  }

  // ٢) رابط السنكسار مش قراءة كتابية — ما يتسجّلش كواحدة
  if (parsed.readings.some((r) => /synaxarium/.test(r.sourceUrl))) {
    fail('رابط سيرة السنكسار اتسجّل كقراءة كتابية.');
  }

  // ٣) عقد السيرفر والواجهة لازم يتطابقوا في مفاتيح القراءات
  const clientKeys = (() => {
    const src = fs.readFileSync(MAP, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    /* لحد قوس القفل اللي في أول السطر — مش أول `}` يقابله. كل حقل جوّه
     * الواجهة شكله `pauline: { title: string; slides: string[] };`،
     * فأول `}` هو قفل الكائن الداخلي، والنسخة الأولى وقفت عنده ورجعت
     * مفتاح واحد بس وعدّت خضرا. */
    const block = src.match(/interface\s+DailyReadingSlides\s*\{([\s\S]*?)\n\}/);
    return block ? [...block[1].matchAll(/^\s*(\w+)\s*:/gm)].map((m) => m[1]) : [];
  })();
  if (!clientKeys.length) fail('ما قدرتش أقرا DailyReadingSlides من liturgy-map.ts.');
  const missing = clientKeys.filter((k) => !(k in body));
  if (missing.length) {
    fail(`الواجهة بتستنى ${clientKeys.join('/')} والسيرفر مش باعت: ${missing.join('، ')}.`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  if (!process.exitCode) {
    console.log(`✅ قراءات القطمارس: المزمور والإنجيل من قسم «الإنجيل»، و${clientKeys.length} مفاتيح متطابقة مع الواجهة`);
  }
})().catch((e) => { fail(e.message); });
