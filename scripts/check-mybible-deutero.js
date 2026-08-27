#!/usr/bin/env node
/**
 * الأسفار القانونية الثانية: الاستيراد بيصلّح ومابيكرّرش، والنص مالوش مصدر
 * جوّه الكود.
 *
 * ── الخط الأحمر اللي الفحص ده بيحرسه ───────────────────────────────────
 *
 * ده كتاب مقدّس بيقراه ~٧٠٠ عضو في درس كتاب مار مرقس. الغلطة هنا مش باج.
 * فالفحص بيتأكد من حاجتين قبل أي حاجة تانية:
 *
 *   ١. **مفيش نص مقدّس مكتوب في الكود.** لو حد (أو نموذج) كتب آيات في
 *      `deutero.ts` بدل ما يجيبها من مصدر، الفحص بيقع. النص جاي من
 *      ملفات `data/deutero/` وبس.
 *   ٢. **كل ملف لازم يقول مصدره.** نص مقدّس بلا مصدر معروف مايتنشرش.
 *
 * Usage: node scripts/check-mybible-deutero.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MB = path.join(ROOT, 'mybible');
const has = (p) => fs.existsSync(path.join(MB, p));
const read = (p) => fs.readFileSync(path.join(MB, p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

if (!has('server/deutero.ts')) {
  console.log('⏭️  mybible/server/deutero.ts مش موجود — الفحص ده يخصّه.');
  process.exit(0);
}
const src = code('server/deutero.ts');

// ── ١) مفيش نص مقدّس مكتوب في الكود ────────────────────────────────────
//
// أي نص عربي طويل جوّه ملف الاستيراد = آيات متكتبة بالإيد. أسماء الأسفار
// قصيرة (أطولهم «يشوع بن سيراخ» = ١٥ حرف)، فالحد ٤٠ بيسيبهم ويمسك الآيات.
const arabicLiterals = [...src.matchAll(/'([^']*[ء-ي][^']*)'/g)]
  .map((m) => m[1]).filter((t) => t.replace(/[^ء-ي]/g, '').length > 40);
check('مفيش نص مقدّس مكتوب في الكود',
  arabicLiterals.length === 0,
  `فيه ${arabicLiterals.length} نص عربي طويل في deutero.ts — أول واحد: `
  + `«${(arabicLiterals[0] || '').slice(0, 60)}…». النص المقدّس بيتجاب من مصدر، `
  + 'مايتكتبش في الكود.');

// ── ٢) المصدر إلزامي ───────────────────────────────────────────────────
check('الاستيراد بيرفض ملف بلا `source`',
  /!data\.source/.test(src) && /return \{ ok: false/.test(src),
  'نص مقدّس من غير مصدر معروف مايتنشرش.');

// ── ٣) الاستيراد بيصلّح ومابيكرّرش ─────────────────────────────────────
//
// من غير المسح قبل الكتابة، تشغيلين = آيات مكرّرة في نفس الإصحاح.
check('الآيات بتتمسح قبل ما تتكتب', /delete\(schema\.bibleVerses\)/.test(src),
  'تشغيل الاستيراد مرتين هيدّي آيات مكرّرة، والتصحيح هيضيف نسخة تانية جنب الغلط.');
check('والمسح محصور في إصحاحات الملف',
  /inArray\(schema\.bibleVerses\.chapter, chapterNums\)/.test(src),
  'مسح السفر كله عشان ملف فيه إصحاح واحد بيضيّع الباقي.');

// ── ٤) التصنيف اللي بيخلّيه ظاهر في الواجهة ────────────────────────────
//
// `client/src/lib/api.ts` بيجيب `/books/old` و`/books/new` بس. أي تصنيف
// تالت = سفر متخزّن صح ومش ظاهر خالص — وده أسوأ من إنه مش موجود، لأن
// محدّش بيدوّر على سبب لحاجة شكلها ناقصة.
check("الأسفار بتتخزّن بـ testament: 'old'", /testament: 'old'/.test(src),
  'الواجهة بتجيب old/new بس — أي تصنيف تاني معناه سفر موجود ومش باين.');
check('والسفر الموجود بتصنيف غلط بيتصحّح',
  /book\.testament !== 'old'/.test(src) && /\.update\(schema\.bibleBooks\)/.test(src),
  'ده بالظبط سبب «فيه إصحاح موجود والموقع مش وارّيه».');
const api = has('client/src/lib/api.ts') ? read('client/src/lib/api.ts') : '';
check('والواجهة لسه بتجيب old/new بس (الافتراض لسه صح)',
  !api || /getByTestament: \(testament: 'old' \| 'new'\)/.test(api),
  'الواجهة اتغيّرت — راجع التصنيف في deutero.ts.');

// ── ٥) راوت الكتابة بمفتاح ─────────────────────────────────────────────
const routes = has('server/routes.ts') ? code('server/routes.ts') : '';
check('راوت الاستيراد بمفتاح', /MYBIBLE_SEED_KEY/.test(routes),
  'راوت بيكتب نص مقدّس من غير مفتاح ماينفعش — حتى لو اللي جنبه كده.');
check('والمفتاح الناقص بيقفل مش بيفتح',
  /if \(!want\) return false/.test(routes),
  'إعداد ناقص بيفتح باب أسوأ من إعداد غلط.');
check('والمقارنة بزمن ثابت', /timingSafeEqual/.test(routes),
  'مقارنة عادية بتسرّب المفتاح حرف حرف.');

// ── ٦) الملفات الموجودة سليمة ──────────────────────────────────────────
const dir = path.join(MB, 'data', 'deutero');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
const names = [...src.matchAll(/name: '([^']+)'/g)].map((m) => m[1]);
let bad = [];
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!d.book || !names.includes(d.book)) bad.push(f + ': سفر مش معرّف');
    else if (!d.source || !String(d.source).trim()) bad.push(f + ': بلا مصدر');
    else if (!Array.isArray(d.chapters) || !d.chapters.length) bad.push(f + ': بلا إصحاحات');
    else {
      for (const c of d.chapters) {
        if (!c.chapter || !Array.isArray(c.verses) || !c.verses.length) { bad.push(f + `: إصحاح ${c.chapter} فاضي`); break; }
        if (c.verses.some((v) => !v.verse || !String(v.text || '').trim())) { bad.push(f + `: آية ناقصة في ${c.chapter}`); break; }
      }
    }
  } catch (e) { bad.push(f + ': JSON مكسور'); }
}
check(`ملفات النص سليمة (${files.length} ملف)`, bad.length === 0, bad.join(' | '));

console.log(failed ? `\n❌ ${failed} مشكلة` : '\n✅ استيراد الأسفار القانونية الثانية سليم');
process.exit(failed ? 1 : 0);
