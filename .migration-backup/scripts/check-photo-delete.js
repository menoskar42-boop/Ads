#!/usr/bin/env node
/**
 * check-photo-delete — حذف صورة الصيانة للسوبر أدمن بس، ومابيسيبش ملف يتيم.
 *
 * تلات حاجات لو اتكسروا محدّش هياخد باله:
 *
 *   ١. **الصلاحية بـsf_role مش بـrole.** السوبر أدمن بتاع Service-Flow بيدخل
 *      الصيانة بدور «admin» عادى (SF_ROLE_TO_MAINT)، فأى شرط على user.role
 *      هيدّى الحذف لكل أدمن — والمالك قال السوبر أدمن بس.
 *   ٢. **الصف قبل الملف.** لو الملف اتمسح الأول والقاعدة فشلت، الصفحة هتعرض
 *      صورة مكسورة بتشاور على حاجة مش موجودة.
 *   ٣. **المسح من R2 كمان.** حذف البوكس كان بيمسح من القرص بس، فالصور اللى على
 *      R2 كانت بتفضل هناك للأبد.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'serviceflow/server/maintenance/app');
const errors = [];
const read = (rel) => { const f = path.join(APP, rel); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };

const boxes = read('routes/boxes.js');
const view = read('views/boxes/detail.ejs');
const photo = read('utils/photo.js');
if (!boxes || !view || !photo) {
  console.log('❌ check-photo-delete: ملفات ناقصة'); process.exit(1);
}

// ── ١. الـroute ─────────────────────────────────────────────────────────
const route = (boxes.match(/router\.post\('\/photos\/:photoId\/delete'[\s\S]*?\n\}\);/) || [])[0];
if (!route) {
  errors.push("routes/boxes.js: مفيش route حذف الصورة (POST /photos/:photoId/delete).");
} else {
  if (!/sf_role[^\n]*!==\s*'super_admin'/.test(route)) {
    errors.push("route الحذف لازم يرفض أى حد sf_role بتاعه مش 'super_admin' — السوبر أدمن والأدمن العادى الاتنين role='admin' جوّه الصيانة.");
  }
  if (/user\.role\s*[!=]==\s*'admin'|requireRole\('admin'\)/.test(route)) {
    errors.push("route الحذف بيتحقق من role='admin' — ده بيدّى الحذف لكل أدمن مش للسوبر أدمن بس.");
  }
  const iDel = route.indexOf('DELETE FROM photos');
  const iRm = route.indexOf('removeMediaFiles(');
  if (iDel < 0) errors.push('route الحذف مابيمسحش الصف من القاعدة.');
  if (iRm < 0) errors.push('route الحذف مابيمسحش الملف (قرص/R2) — هيفضل يتيم.');
  if (iDel > -1 && iRm > -1 && iRm < iDel) {
    errors.push('route الحذف بيمسح الملف **قبل** الصف — لو القاعدة فشلت هتفضل صورة مكسورة فى الصفحة.');
  }
  if (!/SELECT[^']*storage_key[^']*FROM photos/.test(route)) {
    errors.push('route الحذف مابيجيبش storage_key — مش هيعرف يمسح من R2.');
  }
}

// ── ٢. حذف البوكس بيمسح من R2 ─────────────────────────────────────────
const cascade = (boxes.match(/async function cascadeDeleteBox[\s\S]*?\n\}/) || [])[0] || '';
if (!/removeMediaFiles\(/.test(cascade)) {
  errors.push('cascadeDeleteBox مابيستخدمش removeMediaFiles — صور البوكس اللى على R2 هتفضل يتيمة.');
}
if (!/SELECT filename, storage_key FROM photos/.test(cascade)) {
  errors.push('cascadeDeleteBox مابيجيبش storage_key.');
}

// ── ٣. الـhelper بيمسح من R2 فعلاً ──────────────────────────────────────
if (!/async function removeMediaFiles[\s\S]*?r2\.deleteObject/.test(photo)) {
  errors.push('utils/photo.js: removeMediaFiles مابيمسحش من R2.');
}

// ── ٤. الزرار فى الشاشة للسوبر أدمن بس ─────────────────────────────────
const buttons = view.split('\n').filter((l) => /class="[^"]*del-photo-btn/.test(l));
if (buttons.length !== 4) {
  errors.push(`views/boxes/detail.ejs: زرار الحذف موجود فى ${buttons.length} كارت — المفروض ٤ (قبل/بعد × قابل للرفع/عرض بس).`);
}
for (const l of buttons) {
  const i = l.indexOf('del-photo-btn');
  const before = l.slice(0, i);
  const guard = before.lastIndexOf("user.sf_role === 'super_admin'");
  if (guard < 0) errors.push('views/boxes/detail.ejs: زرار حذف ظاهر من غير شرط sf_role === super_admin.');
}
if (!/confirm\(/.test((view.match(/\.del-photo-btn'\)\.forEach[\s\S]*?\n  \}\);/) || [''])[0])) {
  errors.push('زرار الحذف لازم يسأل confirm() — الحذف مابيترجعش.');
}

if (errors.length) {
  console.log('❌ check-photo-delete:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-photo-delete: الحذف للسوبر أدمن بس، الصف قبل الملف، وبيمسح من القرص وR2.');
