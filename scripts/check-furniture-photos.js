#!/usr/bin/env node
/**
 * A catalogue of identical chair icons.
 *
 * The showroom page reads `furniture_products.image_path` for every piece, and
 * nothing in the admin ever wrote it — there was no photo field, no upload, no
 * form. So a workshop could fill in its whole catalogue and the page it was
 * built for showed the same grey placeholder for every item, forever. The page
 * was not broken; it was waiting for a column nobody could fill.
 *
 * ── The shape of the fix worth checking ─────────────────────────────────────
 *
 * The master screen serves five entities from one declaration, and the honest
 * way to give ONE of them a photo is to declare that it has one — not to bury
 * `if (entity === 'products')` inside the loop that draws all five. So the flag
 * is on the entity, the routes refuse anything that does not declare it, and a
 * row that does not belong to this workshop is not written and is not reported
 * as saved.
 *
 *   node scripts/check-furniture-photos.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { ENTITIES, ENTITY_KEYS } = require('../src/furniture/master');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/furniture_master.js'), 'utf8'));
const view = fs.readFileSync(path.join(ROOT, 'src/views/furniture_admin/master.ejs'), 'utf8');
const page = fs.readFileSync(path.join(ROOT, 'src/views/tenant_furniture.ejs'), 'utf8');

/* ── The column the page was waiting for now gets written ──────────────── */
{
  check('صفحة المعرض بتقرا صورة المنتج', /p\.image_path/.test(page));
  check('واللوحة بقت بتكتبها',
    /UPDATE \$\{req\.spec\.table\} SET image_path=\$1 WHERE id=\$2 AND company_id=\$3 RETURNING id/.test(route)
    || /SET image_path=\$1 WHERE id=\$2 AND company_id=\$3 RETURNING id/.test(route));
  check('وفيه طريقة تشيلها', /SET image_path=NULL WHERE id=\$1 AND company_id=\$2/.test(route));
  check('وفورم الرفع في الصفحة', /enctype="multipart\/form-data"/.test(view) && /image_file/.test(view));
  const schema = fs.readFileSync(path.join(ROOT, 'src/furniture/schema.js'), 'utf8');
  check('والعمود موجود في السكيمة', /image_path\s+TEXT/.test(schema));
}

/* ── Declared, not special-cased ───────────────────────────────────────── */
{
  check('المنتجات بس هي اللي بتعلن إنها بصورة', ENTITIES.products.image === true);
  const others = ENTITY_KEYS.filter((k) => k !== 'products' && ENTITIES[k].image);
  check('وباقي الكيانات لأ', others.length === 0, others.join(' · ') || ENTITY_KEYS.length + ' كيان');
  check('والراوت بيرفض اللي مايعلنش', (route.match(/if \(!req\.spec\.image\)/g) || []).length >= 2,
    (route.match(/if \(!req\.spec\.image\)/g) || []).length + ' موضع');
  check('والصفحة بتعرض العمود بالإعلان مش بالاسم',
    /if \(spec\.image\)/.test(view) && !/entity === 'products'/.test(view));
}

/* ── A save that did not happen is not reported as saved ───────────────── */
{
  const img = route.slice(route.indexOf("router.post('/:entity/:id/image'"));
  const body = img.slice(0, img.indexOf("router.post('/:entity/:id/image/delete'"));
  check('صف مش بتاع الورشة مابيتكتبش', /RETURNING id/.test(body) && /if \(!done\.rows\.length\)/.test(body));
  check('وبيقول إنه مااتحفظش', /err=save/.test(body));
  check('ورفع فاشل بيقول سببه', /err=image/.test(body));
  check('والملف بيعدّي على حارس الرفع', /uploads\.guard\(/.test(route));
  check('وصور بس', /imageMimeRegex\.test\(file\.mimetype\)/.test(route));
  check('وحجم محدود', /fileSize: 6 \* 1024 \* 1024/.test(route));
  check('والضغط مابيوقّعش الرفع', /catch \(e\) \{ \/\* keep the original \*\//.test(
    fs.readFileSync(path.join(ROOT, 'src/routes/furniture_master.js'), 'utf8')));
}

/* ── Words ─────────────────────────────────────────────────────────────── */
{
  const keys = ['fn2.m.photo', 'fn2.m.upload', 'fn2.m.err.image'];
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل نص موجود (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }
}

console.log(fail === 0 ? '\n✅ الكتالوج بقى يقدر يشيل صور، والمعرض بيعرضها.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
