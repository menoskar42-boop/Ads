#!/usr/bin/env node
/**
 * روابط «شاهد نموذج حي» لازم تفتح فعلاً.
 *
 * ليه الفحص ده موجود:
 *   كل ما نضيف نوع نشاط جديد، بنحط كارت في الصفحة الرئيسية فيه لينك
 *   «شاهد نموذج حي» بيشاور على سلَج (مثلاً nutrition.oscardevs.com). لكن
 *   الشركة التجريبية نفسها لازم تتعمل في قاعدة البيانات بسكربت منفصل —
 *   ولو السكربت ما اتشغّلش على الإنتاج، اللينك بيدّي 404:
 *
 *       «مفيش شركة بالاسم nutrition. ممكن تكون اتشطبت أو غير مفعّلة.»
 *
 *   ده حصل أكتر من مرة (nutrition, furniture, workshop, hall, nursery,
 *   installments كلهم وقعوا مع بعض). الكود بيبان سليم لأن اللينك مكتوب صح —
 *   الناقص بيانات مش كود، وعشان كده مفيش فحص كان بيمسكه.
 *
 * بيفحص تلات حاجات:
 *   ١) كل سلَج معلَن في الواجهة له سكربت إنشاء، أو مسجَّل في MANUAL_DEMOS.
 *      من غير قاعدة بيانات، وبيمسك «ضفت كارت ونسيت السكربت».
 *   ٢) لو DATABASE_URL متظبّط: الشركة موجودة و is_active = true.
 *   ٣) مع --http: بيجيب الروابط زي ما الزائر بيعمل.
 *
 * ⚠️ (٢) وحده مش كفاية وده اتثبت بالتجربة: قال «١٢ لينك سليم» وستة منهم كانوا
 * بيدّوا 404، لأن الـShell بيوصل لقاعدة بيانات غير اللي الـdeployment بيقرا
 * منها. استعلام ناجح مش دليل على موقع شغّال. (٣) هو الوحيد اللي بيثبت ده.
 *
 *   node scripts/check-demo-links.js
 *   node scripts/check-demo-links.js --http
 *   SITE_ORIGIN=https://staging.example node scripts/check-demo-links.js --http
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIEWS = path.join(ROOT, 'src', 'views');

/**
 * نماذج اتعملت بالإيد في قاعدة البيانات من زمان ومالهاش سكربت إنشاء.
 * موجودة على الإنتاج بس مش قابلة لإعادة الإنشاء من الكود — فلو اتمسحت
 * يوم، محدش هيقدر يرجّعها من غير ما يبنيها من الأول.
 */
const MANUAL_DEMOS = new Set(['petra', 'delta', 'pharmacy', 'orders', 'gym']);

/** السلَجات المعلَنة في القوالب: canonicalCompanyUrl('نص-ثابت'). */
function advertisedSlugs() {
  const found = new Map(); // slug -> ["home.ejs:96", ...]
  for (const file of fs.readdirSync(VIEWS)) {
    if (!file.endsWith('.ejs')) continue;
    const lines = fs.readFileSync(path.join(VIEWS, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      const re = /canonicalCompanyUrl\(\s*'([a-z0-9-]+)'\s*\)/g;
      let m;
      while ((m = re.exec(line))) {
        if (!found.has(m[1])) found.set(m[1], []);
        found.get(m[1]).push(`${file}:${i + 1}`);
      }
    });
  }
  return found;
}

/** السلَجات اللي ليها سكربت إنشاء، من الافتراضي المكتوب جوّه. */
function seededSlugs() {
  const found = new Map(); // slug -> script name
  const dir = path.join(ROOT, 'scripts');
  for (const file of fs.readdirSync(dir)) {
    if (!/^enable-demo-.*\.js$/.test(file)) continue;
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    // النمطين المستخدمين: const SLUG = 'x'  |  const slug = arg('slug', 'x')
    const m = /\bSLUG\s*=\s*'([^']+)'/.exec(src)
           || /\bslug\s*=\s*arg\(\s*'slug'\s*,\s*'([^']+)'\s*\)/.exec(src);
    if (m) found.set(m[1], file);
  }
  return found;
}

async function checkDatabase(slugs) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      'SELECT slug, is_active, page_type FROM companies WHERE slug = ANY($1)',
      [[...slugs]]
    );
    const byslug = new Map(rows.map((r) => [r.slug, r]));
    const problems = [];
    for (const slug of slugs) {
      const row = byslug.get(slug);
      if (!row) problems.push({ slug, why: 'مفيش شركة بالسلَج ده في قاعدة البيانات' });
      else if (!row.is_active) problems.push({ slug, why: 'الشركة موجودة بس is_active = false' });
    }
    return problems;
  } finally {
    await pool.end();
  }
}

/**
 * الفحص الوحيد اللي مايتخدعش: بنجيب الرابط زي ما الزائر بيعمل.
 *
 * ليه ده مهم: النسخة اللي بتسأل قاعدة البيانات قالت «١٢ لينك سليم» وستة منهم
 * كانوا بيدّوا 404 — لأن الـShell بيوصل لقاعدة بيانات غير اللي الـdeployment
 * بيقرا منها، فالشركات كانت متعمولة في المكان الغلط. الاستعلام كان بيعدّي
 * والموقع بيفشل. الـHTTP بيقيس اللي بيحصل فعلاً.
 */
async function checkOverHttp(slugs, origin) {
  const u = new URL(origin);
  // نأخذ البروتوكول والمنفذ من origin عشان الفحص يشتغل على staging أو محلي كمان
  const host = u.host.replace(/^www\./, '');
  const problems = [];

  for (const slug of slugs) {
    // ١) صفحة العميل على الساب دومين
    const pub = `${u.protocol}//${slug}.${host}/`;
    try {
      const r = await fetch(pub, { redirect: 'manual' });
      if (r.status !== 200) {
        problems.push({ slug, url: pub, why: `رجّع ${r.status} بدل 200` });
      }
    } catch (e) {
      problems.push({ slug, url: pub, why: 'تعذّر الوصول: ' + e.message });
    }

    // ٢) لوحة العرض. المفروض تحويل للوحة — التحويل لـ?demo=unavailable معناه
    //    إن الشركة مش موجودة في قاعدة البيانات اللي الموقع شغّال عليها.
    const demo = `${origin.replace(/\/$/, '')}/demo/${slug}`;
    try {
      const r = await fetch(demo, { redirect: 'manual' });
      const loc = r.headers.get('location') || '';
      if (r.status < 300 || r.status >= 400) {
        problems.push({ slug, url: demo, why: `رجّع ${r.status} بدل تحويل` });
      } else if (/demo=unavailable/.test(loc)) {
        problems.push({ slug, url: demo, why: 'الشركة مش موجودة في قاعدة بيانات الموقع الحي' });
      }
    } catch (e) {
      problems.push({ slug, url: demo, why: 'تعذّر الوصول: ' + e.message });
    }
  }
  return problems;
}

async function main() {
  const advertised = advertisedSlugs();
  const seeders = seededSlugs();
  let failed = false;

  if (advertised.size === 0) {
    console.error('❌ مفيش أي لينك نموذج في القوالب — الفحص نفسه غالباً باظ');
    process.exit(1);
  }

  // ── ١) كل سلَج معلَن له طريقة إنشاء معروفة
  const orphans = [...advertised.keys()]
    .filter((s) => !seeders.has(s) && !MANUAL_DEMOS.has(s));
  if (orphans.length) {
    failed = true;
    console.error('❌ سلَجات معلَنة في الواجهة ومالهاش سكربت إنشاء:');
    for (const s of orphans) {
      console.error(`   · ${s}  (${advertised.get(s).join('، ')})`);
      console.error(`     اعمل scripts/enable-demo-${s}.js، أو ضيفه لـMANUAL_DEMOS لو متعمول بالإيد`);
    }
  }

  // ── ٢) الفحص الحقيقي: الشركة موجودة ومفعّلة
  if (!process.env.DATABASE_URL) {
    console.log('ℹ️  DATABASE_URL مش متظبّط — اتفحص الكود بس.');
    console.log('   عشان تتأكد إن اللينكات مش هتدّي 404، شغّله على السيرفر:');
    console.log('   DATABASE_URL=... node scripts/check-demo-links.js');
  } else {
    const problems = await checkDatabase([...advertised.keys()]);
    if (problems.length) {
      failed = true;
      console.error('❌ لينكات «شاهد نموذج حي» هتدّي 404:');
      for (const p of problems) {
        const where = advertised.get(p.slug).join('، ');
        const fix = seeders.has(p.slug)
          ? `node scripts/${seeders.get(p.slug)}`
          : 'متعمول بالإيد — لازم تتعمل من لوحة الأدمن';
        console.error(`   · ${p.slug}: ${p.why}`);
        console.error(`     معلَن في: ${where}`);
        console.error(`     الحل: ${fix}`);
      }
    }
  }

  // ── ٣) الفحص الحاسم: هات الروابط زي ما الزائر بيعمل
  const origin = process.argv.includes('--http')
    ? (process.env.SITE_ORIGIN || 'https://oscardevs.com')
    : null;
  if (!origin) {
    console.log('ℹ️  عايز تتأكد إن اللينكات بتفتح فعلاً؟ شغّل: node scripts/check-demo-links.js --http');
    console.log('   ده بيجيبها بالـHTTP — الفحص الوحيد اللي مايتخدعش لو قاعدة');
    console.log('   البيانات اللي بتشوفها غير اللي الموقع المنشور بيقرا منها.');
  } else {
    const problems = await checkOverHttp([...advertised.keys()], origin);
    if (problems.length) {
      failed = true;
      console.error(`❌ روابط مش شغّالة على ${origin}:`);
      for (const p of problems) console.error(`   · ${p.url}\n     ${p.why}`);
    } else {
      console.log(`✅ كل الروابط بتفتح فعلاً على ${origin}`);
    }
  }

  if (failed) process.exit(1);
  const mode = origin ? 'HTTP حقيقي'
    : process.env.DATABASE_URL ? 'قاعدة بيانات (مش دليل على الموقع الحي)' : 'كود فقط';
  console.log(`✅ ${advertised.size} لينك نموذج سليم (${mode})`);
}

main().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
