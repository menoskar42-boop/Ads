#!/usr/bin/env node
/**
 * Oscar Drive (المالك ٢٠٢٦-١١-٠٥): تطبيق أندرويد واحد لشاشة العربية، والـAPK بيتحمّل من «من أعمالنا».
 *
 * الفحص ده بيمسك:
 *   • زرار التحميل يختفى من «من أعمالنا» أو يلينك على GitHub مباشرة (لينكنا الثابت هو اللى بيتحكّم).
 *   • لينك التحميل يبقى مفهرس (noindex) أو يدخل السايت‌ماب — ده تحويل لملف مش صفحة.
 *   • الـrelease يبقى «latest» (لينك NeuroPilot /releases/latest/download/neuropilot.apk يقع فى صمت).
 *   • التطبيق ياخد إذن مش محتاجه: إرسال SMS (الطوارئ بتفتح الرسايل والسواق بيدوس إرسال) · الكاميرا
 *     (كاميرا الرجوع بتفضل للشاشة) · الميكروفون (التعرّف على الكلام برنامج الشاشة) — أو مكتبة خارجية.
 *
 * Usage: node scripts/check-oscardrive.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const page = read('src/views/legal/our_work.ejs');
check('«من أعمالنا» has the Oscar Drive download card',
  /<a id="oscar-drive" href="\/apps\/oscar-drive\/download" rel="nofollow"/.test(page) && /حمّل التطبيق \(APK\)/.test(page),
  'المالك طلب التحميل من صفحة «من أعمالنا» — الكارت والزرار لازم يفضلوا.');
check('the page never links GitHub directly', !/releases\/download\/oscardrive-latest/.test(page),
  'اللينك المباشر لـGitHub بيوقع على صفحة خطأ لو النسخة بتتبني — استخدم /apps/oscar-drive/download.');

const legal = read('src/routes/legal.js');
const route = (legal.match(/router\.get\('\/apps\/oscar-drive\/download'[\s\S]*?\n\}\);/) || [''])[0];
check('the download route exists', !!route, 'مفيش راوت /apps/oscar-drive/download فى src/routes/legal.js.');
check('the download route is noindex', /res\.set\('X-Robots-Tag', 'noindex, nofollow'\)/.test(route),
  'التحويل لملف APK مايتفهرسش.');
check('it points at the oscardrive-latest pre-release asset',
  /releases\/download\/oscardrive-latest\/oscar-drive\.apk/.test(legal), 'اسم التاج/الملف لازم يطابق الـworkflow.');
check('a missing build gets a message, not GitHub\'s 404', /res\.status\(503\)/.test(route), 'النسخة لسه بتتبني = رسالة واضحة.');

const sitemapSrc = legal.slice(legal.indexOf("router.get('/sitemap.xml'"));
check('the download link is not in the sitemap or llms.txt', !/oscar-drive\/download/.test(sitemapSrc),
  'لينك تحميل ملف مايدخلش السايت‌ماب ولا llms.txt.');

const wf = read('.github/workflows/oscardrive-apk.yml');
check('the APK release is a pre-release that never becomes "latest"',
  /prerelease: true/.test(wf) && /make_latest: false/.test(wf) && /tag_name: oscardrive-latest/.test(wf) && /files: oscar-drive\.apk/.test(wf),
  'release عادى جديد بياخد مكان NeuroPilot فى /releases/latest.');
check('the logic tests run before the build',
  wf.indexOf('working-directory: oscardrive-android/logic-test') > 0
  && wf.indexOf('working-directory: oscardrive-android/logic-test') < wf.indexOf('gradle assembleDebug'),
  'منطق الرحلة/ذاكرة الطريق/الاستراحة لازم يتختبر قبل ما APK يتنشر.');

const manifest = read('oscardrive-android/app/src/main/AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '');
for (const p of ['SEND_SMS', 'CAMERA', 'RECORD_AUDIO', 'READ_CONTACTS', 'SYSTEM_ALERT_WINDOW']) {
  check(`no ${p} permission`, !manifest.includes(`android.permission.${p}`), `${p} مش محتاجينه — إذن زيادة = شاشة تخوّف السواق.`);
}
check('landscape UI', /android:screenOrientation="sensorLandscape"/.test(manifest), 'التطبيق معمول لشاشة التابلوه بالعرض.');

const gradle = read('oscardrive-android/app/build.gradle.kts');
const deps = ((gradle.match(/^dependencies\s*\{([\s\S]*?)^\}/m) || [])[1] || '')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
const allowed = (l) => /^implementation\("com\.google\.android\.libraries\.navigation:navigation:[\d.]+"\)$/.test(l)
  || /^coreLibraryDesugaring\("com\.android\.tools:desugar_jdk_libs_nio:[\d.]+"\)$/.test(l);
check('the only library is Google\'s Navigation SDK (everything else works without Google services)',
  deps.every(allowed), 'مكتبة جديدة: ' + deps.filter((l) => !allowed(l)).join(' | '));
check('Google Play target API (36) and signing from secrets, never from the repo',
  /targetSdk = 36/.test(gradle) && /System\.getenv\("ODRIVE_KEYSTORE_FILE"\)/.test(gradle) && !/storePassword = "/.test(gradle),
  'جوجل بلاى بيطلب targetSdk 36 للتطبيقات الجديدة، والباسوردات تيجى من أسرار GitHub بس.');
check('the Maps key comes from a secret', /System\.getenv\("MAPS_API_KEY"\)/.test(gradle) && !/AIza[0-9A-Za-z_-]{20,}/.test(gradle + read('oscardrive-android/app/src/main/AndroidManifest.xml')),
  'مفتاح خرايط جوجل مايتكتبش فى الكود — سرّ MAPS_API_KEY.');
check('the Play bundle (AAB) is not attached to the public release', !/files:[^\n]*\.aab/.test(wf),
  'الـAAB بيترفع على جوجل بلاى — مكانه artifacts الـrun بس.');

const nav = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/NavActivity.kt');
check('in-app navigation falls back to the maps app and caps at the free 1000/month',
  /fun fallback\(/.test(nav) && /FREE_PER_MONTH = 1000/.test(nav) && /navUsedThisMonth\(month\(\)\) >= FREE_PER_MONTH/.test(nav),
  'أى مشكلة أو عدّى المجانى ⇒ تطبيق الخرائط (من غير فلوس).');

const priv = (legal.match(/router\.get\('\/oscar-drive\/privacy'[\s\S]*?\n\}\);/) || [''])[0];
check('the privacy policy page exists, noindex and without ads',
  /res\.locals\.showAds = false/.test(priv) && /noindex/.test(priv) && /noindex/.test(read('src/views/legal/oscar_drive_privacy.ejs')),
  'جوجل بلاى بيطلب لينك سياسة خصوصية — والصفحة دى مش محتوى للبحث ولا للإعلانات.');
check('the privacy page is not in the sitemap', !/oscar-drive\/privacy/.test(sitemapSrc), 'noindex والسايت‌ماب مايجتمعوش.');
check('the app links its privacy policy', /oscardevs\.com\/oscar-drive\/privacy/.test(read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/MainActivity.kt')),
  'جوجل بلاى عايز السياسة جوه التطبيق كمان.');

process.exit(failed ? 1 : 0);
