#!/usr/bin/env node
/**
 * IndexNow بيتبعت تلقائياً — وبعناوين نهائية مش بتتحوّل.
 *
 * ── الدليل اللي الفحص ده اتكتب بعده ────────────────────────────────────
 *
 * بيانات Bing Webmaster الحقيقية (٢٦-٠٨-٢٠٢٦) أظهرت **صفر URL مرسلة
 * خلال آخر اتناشر ساعة**. الوحدة `src/lib/indexnow.js` موجودة من زمان
 * وشغّالة تماماً — بس **محدّش بينده عليها** غير رابط أدمن يدوي.
 *
 * وفي نفس اللقطة: Google فاهرس **صفحة واحدة** من ٤٧٦، وBing فاهرس ٥١.
 * الفرق ده بيقول إن المحتوى سليم والمشكلة في الاكتشاف — وIndexNow هي
 * بالظبط قناة الاكتشاف اللي Bing وYandex بيسمعوها.
 *
 * ── والغلطة التانية: العناوين كانت بتتحوّل ─────────────────────────────
 *
 * الرابط اليدوي كان بيبني `SITE_ORIGIN + '/about'` بإيده — يعني بعد
 * تقسيم اللغة بيبلّغ محرّكات البحث بعناوين بترد ٣٠١. تبليغ محرّك بعنوان
 * بيتحوّل بيضيّع الغرض من التبليغ. وكان ناقص صفحات الخدمات والخليج كمان.
 *
 * Usage: node scripts/check-indexnow.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const langRoutes = require('../src/lib/lang_routes');
const indexnow = require('../src/lib/indexnow');
const SITE = 'https://oscardevs.com';

// ── ١) العناوين نهائية — مفيش واحد بيتحوّل ─────────────────────────────

const urls = langRoutes.publicUrls(SITE);
check(`قايمة التبليغ فيها ${urls.length} عنوان`, urls.length > 50,
  'القايمة صغيرة أوي — يمكن مش بتقرا من المصدر الواحد.');

const bare = urls.filter((u) => !/^https:\/\/[^/]+\/(ar|en)(\/|$)/.test(u));
check('كل العناوين عليها prefix اللغة', bare.length === 0,
  `${bare.length} عنوان بلا prefix: ${bare.slice(0, 3).join('، ')}. `
  + 'تبليغ محرّك بعنوان بيتحوّل ٣٠١ بيضيّع الغرض من التبليغ.');

check('وفيها صفحات الخدمات', urls.some((u) => u.includes('crm-development-egypt')),
  'القايمة المكتوبة بالإيد كانت ناقصة الخدمات.');
check('وصفحات الخليج الإنجليزية', urls.some((u) => u.includes('/en/sa/')),
  'ناقصة كمان.');
check('ومفيش تكرار', new Set(urls).size === urls.length,
  'عنوان متبعوت مرتين بيتحسب ضجيج عند IndexNow.');

// ── ٢) والرابط اليدوي بيقرا من نفس المصدر ──────────────────────────────

const legal = code(read('src/routes/legal.js'));
check('الرابط اليدوي بيقرا من `publicUrls`', /langRoutes\.publicUrls\(SITE_ORIGIN\)/.test(legal),
  'قايمة تانية مكتوبة بالإيد بتفترق عن السايت‌ماب أول ما تتضاف صفحة.');
check('ومفيش قايمة مكتوبة بالإيد فاضلة',
  !/SITE_ORIGIN \+ '\/about'/.test(legal),
  'لسه فيه بناء عنوان بالإيد.');

// ── ٣) والإرسال تلقائي عند النشر ───────────────────────────────────────
//
// دي القاعدة اللي الفحص اتكتب عشانها.

const server = code(read('server.js'));
check('`submitOnce` بتتنده عند الإقلاع', /indexnow\.submitOnce\(pool, urls/.test(server),
  'من غيرها التكامل بيفضل يدوي — وبيانات Bing أثبتت إنه مابيتستخدمش.');
check('وبتاخد القايمة من `publicUrls`', /langRoutes\.publicUrls\(/.test(server),
  'قايمة تانية معناها عناوين بتتحوّل.');

// ── ٤) ومش بيبعت مع كل إقلاع ───────────────────────────────────────────

const inSrc = code(read('src/lib/indexnow.js'));
check('`submitOnce` بتقارن ببصمة محفوظة', /url_hash/.test(inSrc) && /createHash\('sha256'\)/.test(inSrc),
  'الإرسال مع كل إقلاع ضجيج — الخادم بيقوم تاني لأسباب مالهاش علاقة بالمحتوى.');
check('والبصمة في قاعدة البيانات مش في ملف',
  /CREATE TABLE IF NOT EXISTS seo_pings/.test(inSrc) && !/writeFileSync/.test(inSrc),
  'الحاوية مؤقتة — الملف بيتمسح مع كل نشر فكل إقلاع يبان كأنه تغيير.');
check('والبصمة بتتسجّل **بعد** نجاح الإرسال بس',
  /if \(r\.status >= 200 && r\.status < 300\)[\s\S]{0,200}INSERT INTO seo_pings/.test(inSrc),
  'لو اتسجّلت قبل النجاح، الفشل بيتقفل عليه ومابيتحاولش تاني.');
check('والفشل مابيرميش استثناء', /catch \(e\) \{\s*return \{ status: -1/.test(inSrc),
  'الاستثناء هنا بيوقّف سلسلة الإقلاع.');

// ── ٥) والمفتاح مخدوم للتحقّق ──────────────────────────────────────────

check('مفتاح IndexNow مخدوم على `/<key>.txt`',
  /router\.get\('\/' \+ INDEXNOW_KEY \+ '\.txt'/.test(legal),
  'IndexNow بترفض الإرسال لو المفتاح مش متحقّق منه على الدومين.');
check('والمفتاح مش سر', /المفتاح NOT|is NOT a secret|مش سر/.test(read('src/lib/indexnow.js')),
  'مكتوب في الوحدة إنه منشور عمداً — عشان محدّش يحاول يخبّيه.');

process.exit(failed ? 1 : 0);
