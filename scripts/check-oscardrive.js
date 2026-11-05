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
check('no external libraries (works on car screens without Google services)', !/^\s*dependencies\s*\{/m.test(gradle),
  'شاشات العربيات الصينى كتير منها مافيهاش خدمات جوجل — مفيش AndroidX/Play Services.');

process.exit(failed ? 1 : 0);
