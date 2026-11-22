#!/usr/bin/env node
/**
 * نقل الأسفار القانونية الثانية من ملف قسم أرثوذوكسيات لملفات الاستيراد.
 *
 * ── ليه النقل ده لازم ───────────────────────────────────────────────────
 *
 * النص موجود في `client/src/lib/apocrypha-content.ts` — ملف ثابت في
 * الواجهة. يعني هو **جزيرة معزولة**: البحث مابيوصلهوش، وخطط القراءة
 * مابتقدرش تشاور عليه، وقراءات جروبات مدارس الأحد مابتسحبش منه — لأن
 * كل دول بيقروا من `bible_books`/`bible_verses`.
 *
 * السكريبت ده **بينقل ومابيكتبش**: بيقرا الملف بمترجم حقيقي ويطلّع نفس
 * الآيات في صيغة الاستيراد. مفيش سطر نص بيتكتب هنا.
 *
 * ── ⚠️ والمصدر ─────────────────────────────────────────────────────────
 *
 * ترويسة الملف الأصلي بتقول «المصدر: البستانية-فاندايك (1865)». ودي
 * **ماينفعش تتنقل زي ما هي**: فان دايك ١٨٦٥ استبعدت الأسفار القانونية
 * الثانية — وده السبب إن الموقع كله ٦٦ سفر. فالنسبة دي مستحيلة، والنقل
 * بيسجّل الحقيقة: النص من محتوى الموقع، ومصدره الأصلي **محتاج تحقّق**.
 *
 * نقل نسبة غلط أسوأ من نقل نص بلا نسبة — التانية بتقول «ماعرفش»،
 * والأولى بتقول حاجة مش صحيحة بثقة.
 *
 * Usage: node scripts/build-deutero-from-apocrypha.js [--write]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'mybible/client/src/lib/apocrypha-content.ts');
const OUT = path.join(ROOT, 'mybible/data/deutero');

let esbuild = null;
for (const p of ['esbuild', '/tmp/tsx-tool/node_modules/esbuild']) {
  try { esbuild = require(p); break; } catch (_) {}
}
if (!esbuild) {
  console.error('❌ esbuild مطلوب. شغّل: (mkdir -p /tmp/tsx-tool && cd /tmp/tsx-tool && npm i esbuild)');
  process.exit(1);
}

// أسماء قسم أرثوذوكسيات ↔ أسماء `DEUTERO_BOOKS` في السيرفر.
const NAME_MAP = {
  'طوبيا': 'طوبيا',
  'يهوديت': 'يهوديت',
  'حكمة سليمان': 'الحكمة',
  'يشوع بن سيراخ': 'يشوع بن سيراخ',
  'باروخ': 'باروخ',
  'المكابيين الأول': 'المكابيين الأول',
  'المكابيين الثاني': 'المكابيين الثاني',
  'المكابيين الثالث': 'المكابيين الثالث',
  'المزمور 151': 'المزمور ١٥١',
  'صلاة منسى': 'صلاة منسى',
};

const SOURCE_NOTE =
  'منقول من محتوى قسم أرثوذوكسيات في الموقع (apocrypha-content.ts). '
  + '⚠️ الملف الأصلي بينسب النص لفان دايك ١٨٦٥ — وفان دايك ماترجمتش '
  + 'الأسفار القانونية الثانية، فالنسبة دي غير صحيحة والمصدر الحقيقي '
  + 'محتاج تحقّق قبل الاعتماد عليه.';

const code = esbuild.transformSync(fs.readFileSync(SRC, 'utf8'), { loader: 'ts', format: 'cjs' }).code;
const m = { exports: {} };
new Function('module', 'exports', 'require', code)(m, m.exports, require);
const books = m.exports.apocryphaBooks || [];

const write = process.argv.includes('--write');
if (write) fs.mkdirSync(OUT, { recursive: true });

let totalCh = 0, totalV = 0;
console.log('السفر                | إصحاحات | آيات  | الملف');
for (const b of books) {
  const name = NAME_MAP[b.name];
  if (!name) { console.log(`⚠️  «${b.name}» مالوش اسم مقابل — اتخطّى`); continue; }
  const chapters = (b.chapters || [])
    .filter((c) => c && Array.isArray(c.verses) && c.verses.length)
    .map((c) => ({
      chapter: c.chapter,
      verses: c.verses
        .filter((v) => v && v.verse && String(v.text || '').trim())
        .map((v) => ({ verse: v.verse, text: String(v.text).trim() })),
    }))
    .filter((c) => c.verses.length);
  if (!chapters.length) { console.log(`⚠️  «${b.name}» مفيش آيات — اتخطّى`); continue; }

  const verses = chapters.reduce((n, c) => n + c.verses.length, 0);
  totalCh += chapters.length; totalV += verses;
  const file = name + '.json';
  const payload = { book: name, source: SOURCE_NOTE, chapters };
  // الأسفار المختلَف على قانونيتها بتحتاج إقرار — السكريبت مابيدّهوش.
  if (write) fs.writeFileSync(path.join(OUT, file), JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(name.padEnd(20), '|', String(chapters.length).padStart(7), '|',
    String(verses).padStart(5), '|', write ? file : '(معاينة)');
}
console.log(`\n${totalCh} إصحاح · ${totalV} آية` + (write ? ` → ${OUT}` : ' — شغّل بـ--write عشان تتكتب'));
