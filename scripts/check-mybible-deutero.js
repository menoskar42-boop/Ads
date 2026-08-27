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

/* ── ١) مفيش نص مقدّس مكتوب في الكود ───────────────────────────────────
 *
 * ── الحارس ده اتعدّل بعد إنذار كاذب ────────────────────────────────────
 *
 * أول نسخة كانت بتفشّل أي نص عربي أطول من ٤٠ حرف. ده مسك **ملاحظات
 * تحريرية** («وارد في قوايم قبطية وبيغيب في طبعات») وحسبها آيات. وحارس
 * بيفشّل شغل صح أسوأ من حارس مش موجود — بيعلّم إن الأحمر مالوش معنى.
 *
 * والطول مش العلامة الصح أصلاً: آية قصيرة ممكن تعدّي تحت أي حد. العلامة
 * الحقيقية إن **الآية بتتحط في حقل `text`** — ده المكان الوحيد اللي
 * نص الكتاب بيروح له. فالقاعدة بقت: `text:` مايتسندش لنص مكتوب أبداً.
 *
 * والحد الطويل باقي كشبكة تانية للكتل الكبيرة (فقرة كاملة أو إصحاح
 * ملزوق)، بس مرفوع لـ١٥٠ عشان الملاحظات تعدّي. */
const textAssign = [...src.matchAll(/\btext\s*:\s*['"`]([^'"`]{2,})['"`]/g)].map((m) => m[1]);
check('مفيش نص متسنَد لحقل `text` في الكود',
  textAssign.length === 0,
  `فيه ${textAssign.length} قيمة مكتوبة في \`text\` — أول واحدة: `
  + `«${(textAssign[0] || '').slice(0, 50)}…». ده الحقل اللي نص الكتاب بيروح له، `
  + 'والنص بيتجاب من مصدر مايتكتبش في الكود.');

const bigBlobs = [...src.matchAll(/['"`]([^'"`]*[ء-ي][^'"`]*)['"`]/g)]
  .map((m) => m[1]).filter((t) => t.replace(/[^ء-ي]/g, '').length > 150);
check('ومفيش كتلة نص عربي كبيرة', bigBlobs.length === 0,
  `فيه ${bigBlobs.length} كتلة أطول من ١٥٠ حرف عربي — أول واحدة: `
  + `«${(bigBlobs[0] || '').slice(0, 50)}…».`);

// ── ٢) المصدر إلزامي ───────────────────────────────────────────────────
check('الاستيراد بيرفض ملف بلا `source`',
  /!data\.source/.test(src) && /return \{ ok: false/.test(src),
  'نص مقدّس من غير مصدر معروف مايتنشرش.');

/* ── ٢-ب) السفر المختلَف عليه مايتنشرش بضغطة ──────────────────────────
 *
 * ورود سفر في القانون **مسألة كنسية مش قرار برمجي**. القايمة فيها أسفار
 * واردة في قوايم قبطية وبتغيب في طبعات (المكابيين الثالث · صلاة منسى ·
 * المزمور ١٥١)، والاستيراد بيطلب إقرار صريح فيها عشان اللي بيضيفها يكون
 * واخد باله إنه بيقرّر حاجة مش تقنية. */
check('السفر المحتاج مراجعة كنسية بيطلب إقرار صريح',
  /needsChurchReview && \(data as any\)\.confirmedByChurch !== true/.test(src),
  'من غير البوّابة دي، سفر مختلَف على قانونيته بينزل على موقع كنسي بضغطة.');
check('وفيه أسفار متعلّمة إنها محتاجة مراجعة',
  (src.match(/needsChurchReview: true/g) || []).length > 0,
  'القايمة كلها متأكّدة؟ راجع — فيه أسفار بتختلف من طبعة لطبعة.');

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

/* ── ٧) النسختين مايفترقوش ──────────────────────────────────────────────
 *
 * النص عايش في مكانين: `apocrypha-content.ts` (اللي قسم أرثوذوكسيات
 * بيعرض منه) وملفات `data/deutero/*.json` (اللي بتتستورد للقاعدة عشان
 * البحث وخطط القراءة وقراءات الجروبات توصلها).
 *
 * نسختين بالإيد بيفترقوا: حد يصلّح غلطة مطبعية في واحدة، والتانية تفضل
 * بالغلط. عشان كده الـJSON **مولَّد** من الـTS بسكريبت، والفحص ده بيعيد
 * التوليد ويقارن — لو فيه فرق، يبقى حد عدّل نسخة من غير التانية.
 *
 * المصدر الوحيد للتحرير هو `apocrypha-content.ts`. */
{
  const { execFileSync } = require('child_process');
  const dir = path.join(MB, 'data', 'deutero');
  const before = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')) : []) {
    before[f] = fs.readFileSync(path.join(dir, f), 'utf8');
  }
  let regenerated = true;
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-deutero-from-apocrypha.js'), '--write'],
      { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) { regenerated = false; }

  if (!regenerated) {
    check('الـJSON بيتولّد من المصدر', false,
      'سكريبت التوليد وقع — يمكن esbuild مش منزّل. من غيره الفحص مش قادر '
      + 'يتأكد إن النسختين متطابقين.');
  } else {
    const after = fs.readdirSync(dir).filter((x) => x.endsWith('.json'));
    const drifted = after.filter((f) => before[f] !== fs.readFileSync(path.join(dir, f), 'utf8'));
    const added = after.filter((f) => !(f in before));
    check('ملفات الاستيراد متطابقة مع مصدرها',
      drifted.length === 0 && added.length === 0,
      [...drifted.map((f) => f + ': اتغيّر'), ...added.map((f) => f + ': جديد')].join(' | ')
      + ' — عدّل `apocrypha-content.ts` وشغّل '
      + '`node scripts/build-deutero-from-apocrypha.js --write`.');
  }
}

/* ── ٨) والنسبة الغلط ماتتنقلش ─────────────────────────────────────────
 *
 * ترويسة `apocrypha-content.ts` بتنسب النص لفان دايك ١٨٦٥ — وفان دايك
 * استبعدت الأسفار دي (وده سبب إن الموقع ٦٦ سفر). النسبة دي غير صحيحة،
 * وملفات الاستيراد ماينفعش تنقلها كأنها حقيقة. */
{
  const dir = path.join(MB, 'data', 'deutero');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.json')) : [];
  const bad = files.filter((f) => {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const src = String(d.source || '');
      // ينفع يذكر فان دايك — بس **كتنبيه** إن النسبة دي غلط، مش كإسناد.
      return /فان\s*دايك|فاندايك/.test(src) && !/غير صحيحة|محتاج تحقّق/.test(src);
    } catch (_) { return true; }
  });
  check('مفيش ملف بينسب النص لفان دايك كإسناد', bad.length === 0,
    bad.join('، ') + ' — فان دايك ماترجمتش الأسفار دي، ونقل النسبة دي '
    + 'بيخلّي غلط الملف الأصلي حقيقة في القاعدة.');
}

/* ── ٩) الاستيراد من رابط: SSRF ومسار الفحوص ──────────────────────────
 *
 * الراوت بيخلّي السيرفر يجيب رابط بياخده من المستخدم. من غير حراسة، حد
 * يبعت عنوان داخلي والسيرفر يجيبهوله. والمفتاح مش حماية كافية لوحده:
 * المفتاح ممكن يتسرّب، والطبقتين مع بعض.
 *
 * والأهم: الرابط **مايلفّش حول الفحوص**. الاستيراد من رابط بيكتب ملف
 * الأول وبيعدّي على نفس المسار — فالمصدر يفضل إلزامي، وبوّابة المراجعة
 * الكنسية تفضل شغّالة، والمسح يفضل محصور في إصحاحات الملف. */
{
  const hasUrl = /importDeuteroFromUrl/.test(src);
  if (hasUrl) {
    check('الاستيراد من رابط https بس', /u\.protocol !== 'https:'/.test(src),
      'http بيسمح باعتراض النص في الطريق — ده نص مقدّس بيتنشر لـ٧٠٠ عضو.');
    check('والعناوين الداخلية ممنوعة', /PRIVATE_HOST/.test(src) && /127\\\./.test(src),
      'من غير المنع، الراوت بيبقى بوّابة لجلب أي حاجة من شبكة السيرفر (SSRF).');
    check('وفيه حد أقصى لحجم الرد', /8 \* 1024 \* 1024|maxBytes|body\.length >/.test(src),
      'رد ضخم بيقفل الذاكرة.');
    check('والمصدر إلزامي في الاستيراد من رابط',
      /!source \|\| !String\(source\)\.trim\(\)/.test(src),
      'الرابط مش مصدر — لازم اسم الترجمة/الطبعة.');
    check('والرابط بيعدّي على نفس مسار الفحوص',
      /writeFileSync[\s\S]{0,200}importDeuteroFromFile\(file\)/.test(src),
      'مسار تاني للاستيراد معناه بوّابات بتتلفّ — المصدر والمراجعة والمسح المحصور.');
    check('ومابيخترعش ترقيم آيات',
      /if \(!n \|\| !t\) return \{ error/.test(src),
      'آية بلا رقم أو نص لازم ترفض — التخمين هنا بيغيّر نص مقدّس.');
  } else {
    console.log('⏭️  الاستيراد من رابط مش متعمول — فحوصه اتخطّت.');
  }
}

console.log(failed ? `\n❌ ${failed} مشكلة` : '\n✅ استيراد الأسفار القانونية الثانية سليم');
process.exit(failed ? 1 : 0);
