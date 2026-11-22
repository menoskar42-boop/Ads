#!/usr/bin/env node
/**
 * Oscar Drive (المالك ٢٠٢٦-١١-٠٥): تطبيق أندرويد واحد لشاشة العربية، والـAPK بيتحمّل من «من أعمالنا».
 *
 * الفحص ده بيمسك:
 *   • زرار التحميل يختفى من «من أعمالنا» أو يلينك على GitHub مباشرة (لينكنا الثابت هو اللى بيتحكّم).
 *   • لينك التحميل يبقى مفهرس (noindex) أو يدخل السايت‌ماب — ده تحويل لملف مش صفحة.
 *   • الـrelease يبقى «latest» (لينك NeuroPilot /releases/latest/download/neuropilot.apk يقع فى صمت).
 *   • التطبيق ياخد إذن مش محتاجه: إرسال SMS (الطوارئ بتفتح الرسايل والسواق بيدوس إرسال) · الميكروفون
 *     (التعرّف على الكلام برنامج الشاشة) — أو مكتبة خارجية. الكاميرا مسموحة لتسجيل «الحماية» بس (المالك ٢٠٢٦-١١-٠٥).
 *   • drive.oscardevs.com (صفحة صاحب العربية + API الشاشة) يتفهرس أو يتحط فيه إعلانات.
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
// SYSTEM_ALERT_WINDOW اتشال من هنا بموافقة المالك (٢٠٢٦-١١-٢٠): زرار «⬅️ Oscar» فوق الخرايط الخارجية بس، واختيارى — شوف الفحص بتاعه تحت
for (const p of ['SEND_SMS', 'READ_CONTACTS', 'ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE_MICROPHONE']) {
  check(`no ${p} permission`, !manifest.includes(`android.permission.${p}`), `${p} مش محتاجينه — إذن زيادة = شاشة تخوّف السواق.`);
}
check('landscape UI', /android:screenOrientation="sensorLandscape"/.test(manifest), 'التطبيق معمول لشاشة التابلوه بالعرض.');

const gradle = read('oscardrive-android/app/build.gradle.kts');
const deps = ((gradle.match(/^dependencies\s*\{([\s\S]*?)^\}/m) || [])[1] || '')
  .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));
const allowed = (l) => /^implementation\("com\.google\.android\.libraries\.navigation:navigation:[\d.]+"\)$/.test(l)
  || /^coreLibraryDesugaring\("com\.android\.tools:desugar_jdk_libs_nio:[\d.]+"\)$/.test(l)
  // التعرّف على الكلام من غير نت (المالك ٢٠٢٦-١١-٠٩) — مفتوح المصدر، على الجهاز، من غير خدمات جوجل ولا AI سحابى
  || /^implementation\("com\.alphacephei:vosk-android:[\d.]+"\)$/.test(l)
  || /^implementation\("net\.java\.dev\.jna:jna:[\d.]+@aar"\)$/.test(l)
  // QR «اربطها بـQR» (المالك ٢٠٢٦-١١-١٨) — رسم الـQR بس (zxing core: Java، من غير native ولا نت ولا خدمات جوجل)
  || /^implementation\("com\.google\.zxing:core:[\d.]+"\)$/.test(l);
check('only Google\'s Navigation SDK + the offline speech engine + QR drawing (everything else works without Google services)',
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

// برومبت الإكستنشن (docs/OSCAR_DRIVE_SETUP_PROMPT.md) لازم يطابق الكود: أسامى الأسرار، الحزمة، والـworkflow.
const setup = read('docs/OSCAR_DRIVE_SETUP_PROMPT.md');
const usedSecrets = [...new Set([...wf.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))];
check('the setup prompt names every secret the build reads', usedSecrets.length > 0 && usedSecrets.every((n) => setup.includes(n)),
  'سرّ فى الـworkflow مش فى البرومبت: ' + usedSecrets.filter((n) => !setup.includes(n)).join(', '));
check('the setup prompt uses the app package and the real workflow',
  setup.includes('com.oscardevs.oscardrive') && setup.includes('actions/workflows/oscardrive-apk.yml')
  && /-name oscardrive/.test(read('scripts/oscar-drive-key.sh')) && /ODRIVE_KEY_ALIAS ← اكتب: oscardrive/.test(setup),
  'اسم الحزمة/الـworkflow/الـalias فى البرومبت لازم يطابق التطبيق.');
check('the setup prompt never makes a second key and never prints secrets',
  /bash scripts\/oscar-drive-key\.sh/.test(setup) && /if \[ -e "\$DIR\/upload\.p12" \]; then\s*echo "STOP/.test(read('scripts/oscar-drive-key.sh'))
  && !/cat [^\n]*(PASSWORD|KEYSTORE_B64)/.test(setup) && !/[\u0600-\u06FF]/.test(read('scripts/oscar-drive-key.sh')),
  'مفتاح جديد = التطبيق المتنزّل مايتحدّثش، والسرّ مايتطبعش.');
check('the build signs a PKCS12 key (what openssl makes)', /storeType = "pkcs12"/.test(gradle), 'المفتاح من openssl نوعه PKCS12.');

// ── Oscar Security: drive.oscardevs.com ──
const site = read('src/routes/drive_site.js');
check('drive site: every response is noindex with no ads',
  /router\.use\(\(req, res, next\) => \{\s*res\.locals\.showAds = false;\s*res\.set\('X-Robots-Tag', 'noindex, nofollow'\);/.test(site),
  'صفحة خاصة بصاحب العربية — مش محتوى للبحث ولا للإعلانات.');
check('drive site ends in its own 404', /router\.use\(\(req, res\) => \{\s*res\.status\(404\)/.test(site), 'مسار مش موجود مايعدّيش لـOscarDevs.');
const server = read('server.js');
check('drive.oscardevs.com is host-routed before the OscarDevs pipeline',
  /if \(!host\.startsWith\('drive\.'\)\) return next\(\);\s*return driveSite\.router\(req, res, next\);/.test(server)
  && server.indexOf("startsWith('drive.')") < server.indexOf('app.use(i18nMiddleware);'),
  'من غيره drive.oscardevs.com يبقى متجر اسمه drive.');
check('"drive" is a reserved store name', /'drive'/.test(read('src/lib/reserved_slugs.js')), 'تاجر ياخد drive = صفحة الحماية تختفى.');
check('the owner page is noindex', /<meta name="robots" content="noindex, nofollow">/.test(read('drive-web/index.html')), 'noindex فى الصفحة نفسها كمان.');
check('device and owner tokens are stored hashed', /token_hash/.test(read('src/drive/schema.js')) && !/\btoken\s+TEXT/.test(read('src/drive/schema.js')),
  'توكن الشاشة/الموبايل يتخزّن هاش بس — تسريب القاعدة مايدّيش دخول.');
check('pairing is rate-limited and one-time', /od-pair/.test(site) && /SET pair_code = NULL, pair_expires = NULL WHERE pair_code = \$1 AND pair_expires > now\(\)/.test(read('src/drive/store.js')),
  'كود ٦ أرقام من غير حد للمحاولات = أى حد يخمّنه.');
const privacy = read('src/views/legal/oscar_drive_privacy.ejs');
check('privacy policy discloses tracking upload and camera', /drive\.oscardevs\.com/.test(privacy) && /الكاميرا/.test(privacy),
  'التطبيق بقى بيبعت المكان (لو الحماية شغّالة) وبيسجّل كاميرا — السياسة لازم تقول كده.');
// المرحلة ٤: ملخّص العربية (الركنات · العدّاد · الصيانة · البنزين) بيروح مع مزامنة الحماية بس، منضّف على السيرفر، ومعلن عنه
{
  const guard = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/Guard.kt');
  const store = read('src/drive/store.js');
  check('car summary rides the opt-in security sync, is sanitized server-side, and is disclosed',
    /CarReport\.json\(app\)/.test(guard) && /if \(!on \|\| syncing\) return/.test(guard) && /L\.cleanReport\(body\.report/.test(store)
      && /ملخّص العربية عشان صفحة الموبايل/.test(privacy) && /car summary for the phone page/.test(privacy),
    'أى بيانات زيادة بتتبعت لازم تبقى مع الحماية المفعّلة بس ومتنضّفة ومكتوبة فى السياسة.');
}
// المرحلة ٥: قراية الرسايل مقفولة افتراضياً ومابتتحفظش · واتساب مابيتبعتش لوحده · الطقس بمكان متقرّب · مفيش QUERY_ALL_PACKAGES · معلن عنه
{
  const prefsKt = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/Prefs.kt');
  const reader = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/NotifyReader.kt');
  const assistant = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/logic/Assistant.kt');
  check('assistant: message reading off by default and never stored; WhatsApp opens pre-filled (you press Send); weather location rounded; disclosed',
    /"read_notifs", false/.test(prefsKt) && !/Db\.|getSharedPreferences|HttpURLConnection/.test(reader)
      && !/QUERY_ALL_PACKAGES/.test(manifest) && /latitude=\$\{"%\.2f"/.test(assistant)
      && /Open-Meteo/.test(privacy) && /الوصول للإشعارات/.test(privacy) && /بتدوس إرسال/.test(privacy),
    'المساعد لازم يفضل محلى، والرسايل مابتتبعتش لوحدها، وكل ده مكتوب فى السياسة.');
}
{
  const prefsKt = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/Prefs.kt');
  const main = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/MainActivity.kt');
  const places = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/logic/Places.kt');
  check('places: «nearest …» uses the free maps search unless Places API is turned on (off by default) and under the monthly cap; disclosed',
    /"places_api", false/.test(prefsKt) && /Nearby\.allowed\(prefs\.placesApiOn, prefs\.placesUsedThisMonth\(month\), prefs\.placesCap\)/.test(main)
      && /prefs\.countPlaces\(month\)/.test(main) && /fun allowed\(enabled: Boolean, usedThisMonth: Int, cap: Int\): Boolean = enabled && cap > 0 && usedThisMonth < cap/.test(places)
      && /X-Goog-FieldMask", "places\.displayName,places\.location"/.test(main)
      && /Google Places API/.test(privacy) && /Places API/.test(privacy),
    'Places API عليه فلوس بعد الحصة المجانية: لازم يفضل مقفول افتراضياً وبحد شهرى وبأقل حقول، ومكتوب فى السياسة.');
}
{
  const svc = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/DriveService.kt');
  const spk = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/Speaker.kt');
  const drv = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/logic/Driving.kt');
  check('driving behaviour: scored silently, shown after the trip; safety alerts always speak; other speech waits for calls; disclosed',
    /harsh\.onFix\(now, kmh, acc\)/.test(svc) && !/Speaker\.say\([^)]*(harsh|HarshType|DrivingScore)/.test(svc)
      && /Speaker\.say\(text, beep = true, kind = com\.oscardevs\.oscardrive\.logic\.SpeechKind\.SAFETY\)/.test(svc)
      && /Speaker\.say\(msg, beep = true, kind = com\.oscardevs\.oscardrive\.logic\.SpeechKind\.SAFETY\)/.test(svc)
      && /!inCall \|\| kind == SpeechKind\.SAFETY/.test(drv) && /fun flushWaiting/.test(spk) && /Speaker\.flushWaiting\(\)/.test(svc)
      && /سلوك القيادة/.test(privacy) && /Driving behaviour/.test(privacy),
    'الدرجة مابتتقالش وإنت سايق، وتنبيهات الأمان مابتستناش مكالمة، والباقى بيستنى — ومكتوب فى السياسة.');
}
check('security is opt-in on the screen', /get\(\) = sp\.getBoolean\("sec_on", false\)/.test(read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/Prefs.kt')),
  'التتبّع للسيرفر لازم يبقى مقفول لحد ما السواق يشغّله.');

// ── Oscar Voice + Personality ──
const linesJson = JSON.parse(read('oscardrive-android/app/src/main/assets/oscar_lines.json'));
const main = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/MainActivity.kt')
  + read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/DriveService.kt')
  + read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/Guard.kt')
  + read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/NavActivity.kt');
const used = [...new Set([...main.matchAll(/oscar\("([a-z_]+)"|Oscar\.say\("([a-z_]+)"/g)].map((m) => m[1] || m[2]))];
const missingLines = used.filter((id) => !linesJson.lines[id]);
check('every Oscar line the app says exists in oscar_lines.json (AR + EN)',
  missingLines.length === 0 && Object.values(linesJson.lines).every((v) => v.ar && v.ar.length && v.en && v.en.length),
  'جملة ناقصة: ' + missingLines.join(', '));
check('voice commands need no AI at runtime', !/openai|anthropic|gemini/i.test(read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/logic/VoiceEngine.kt')
  + read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/WakeListener.kt')), 'الأوامر قواعد ثابتة — مفيش نموذج ذكاء اصطناعى.');
// المالك ٢٠٢٦-١١-٠٦: «خلى الافتراضى ان السماعه مفتوحه و ممكن اقفلها» — مفتوح افتراضياً بشرط: إذن صريح، علامة ظاهرة، والسياسة بتقول كده
{
  const prefsKt = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/Prefs.kt');
  const mainKt = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/MainActivity.kt');
  check('"Hey Oscar" is on by default, with a visible listening sign and a way off',
    /get\(\) = sp\.getBoolean\("v_wake", true\)/.test(prefsKt) && /🎙️ سامعك/.test(mainKt) && /prefs\.voiceWake = false/.test(mainKt),
    'الاستماع مفتوح افتراضياً لازم يبان إنه شغّال ويتقفل لو الإذن اترفض.');
}
// «أوسكار يسمع من غير نت» (Vosk): النموذج من alphacephei بس، الصوت مابيتبعتش، وفيه فحص رامات قبل التشغيل، والسياسة بتقول كده
{
  const ears = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/OfflineEars.kt');
  const urls = ears.match(/https?:\/\/[^"]+/g) || [];
  check('offline speech: models only from alphacephei, RAM checked, nothing uploaded, disclosed',
    urls.length > 0 && urls.every((u) => u.startsWith('https://alphacephei.com/vosk/models/')) && /freeRamMb\(app\)/.test(ears)
      && !/getOutputStream|doOutput|POST/.test(ears) && /alphacephei\.com/.test(privacy),
    'محرّك الصوت جوّه التطبيق لازم يفضل على الجهاز ومعلن عنه فى السياسة.');
}
// «الفهم الذكى» (المالك ٢٠٢٦-١١-٠٧): من غير AI، ولو مش متأكد بيسأل قبل ما ينفّذ، والكلمات اللى اتعلّمها بتتمسح
{
  const words = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/logic/EgyptWords.kt');
  const mainKt = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/MainActivity.kt');
  check('smart voice: fixed rules, asks before acting on a guess, learned words can be removed',
    !/openai|anthropic|gemini|http/i.test(words) && /if \(!u\.sure\) \{ askGuess\(u\); return \}/.test(mainKt) && /prefs\.removeLearned/.test(mainKt),
    'التخمين لازم يتأكد من السواق قبل التنفيذ.');
}
check('privacy policy discloses the microphone', /الميكروفون بيتطلب مع أول تشغيل عشان «يا أوسكار»/.test(privacy) && /مابيسجّلش صوت ولا بيبعته/.test(privacy), 'إذن الميكروفون لازم يتقال فى السياسة.');
// المالك ٢٠٢٦-١١-٠٩: صوت أوسكار جوّه الـAPK ويتركّب لوحده (من غير زرار ولا نت).
{
  const gradle = read('oscardrive-android/app/build.gradle.kts');
  const oscar = read('oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/Oscar.kt');
  const voiceOk = ['male', 'female'].every((v) => fs.existsSync(path.join(ROOT, 'drive-web/voice', v, 'manifest.json')));
  check('Oscar voice is bundled in the APK and installed on first launch',
    voiceOk && /from\(rootProject\.file\("\.\.\/drive-web\/voice"\)\)/.test(gradle) && /dependsOn\(copyOscarVoice\)/.test(gradle)
      && /assets\.open\("voice\/\$voice\/manifest\.json"\)/.test(oscar) && /ensureBundled\(\)\n    \}/.test(oscar)
      && /'drive-web\/voice\/\*\*'/.test(wf),
    'ملفات drive-web/voice لازم تتبنى جوّه الـAPK وتتنقل أول ما التطبيق يفتح.');
}
{
  const vjs = read('src/drive/voice.js');
  check('ElevenLabs voices are separate folders (old voices kept) and the key is a secret only',
    /'el-male': 'FXJhBZJ1DJMO0U4ZPSur'/.test(vjs) && /'el-female': 'xPcC3nehhziQaOrIeAwv'/.test(vjs) && /process\.env\.ELEVENLABS_API_KEY/.test(vjs)
      && ['male', 'female'].every((v) => fs.existsSync(path.join(ROOT, 'drive-web/voice', v, 'manifest.json'))),
    'أصوات ElevenLabs فى el-male/el-female والقديمة مابتتمسحش لحد ما المالك يقرّر (٢٠٢٦-١١-١٨)، والمفتاح سرّ فى ريبليت بس.');
}
{
  const A = 'oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/';
  const ears = read(A + 'ScreenEars.kt'), mapA = read(A + 'MapActivity.kt'), navA = read(A + 'NavActivity.kt'), mainA = read(A + 'MainActivity.kt');
  const app = read('drive-web/app.js'), road = read('drive-web/road.js');
  check('«أوسكار» always listening while the app is open (screen: main + map + nav · phone page: auto-start)',
    /ScreenEars\.sink = \{/.test(mainA) && [mapA, navA].every((x) => /ears = ScreenEars\.start\(this\)/.test(x) && /ScreenEars\.stop\(this, ears\)/.test(x))
      && /p\.voiceWake/.test(ears) && /get\(\) = sp\.getBoolean\("v_wake", true\)/.test(read(A + 'Prefs.kt'))
      && /function autoVoice\(\)/.test(app) && /localStorage\.getItem\(VOICE_KEY\) !== '0'/.test(app) && /RD\.wakeOnly\(a\)/.test(app)
      && /function wakeOnly\(/.test(road) && /WAKE_WINDOW_MS = 8000/.test(road),
    'المالك ٢٠٢٦-١١-١٩: طول ما التطبيق مفتوح أوسكار بيسمع (والخريطة/الملاحة كمان)، و«أوسكار» لوحده ⇒ ينتبه ٨ ثوانى — على الشاشة والموبايل.');
}
check('custom voice lines are rate-limited', /od-voice', windowMs: 24 \* 60 \* 60000, max: 20/.test(site), 'كل جملة = نداء مدفوع للذكاء الاصطناعى.');
{
  // المالك ٢٠٢٦-١١-٢٠: «📸 صوّر الطريق» ساعات بتطلع لقطة من التطبيق نفسه، وساعات مابتطلعش صورة خالص
  const A = 'oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/';
  const cam = read(A + 'CamRecorder.kt'), mainA = read(A + 'MainActivity.kt'), app = read('drive-web/app.js');
  const snapSrc = cam.slice(cam.indexOf('fun snap('), cam.indexOf('private fun trim'));
  check('road photo = a YUV frame from the camera itself, never a JPEG stream or a screen capture',
    /ImageFormat\.YUV_420_888, 2\)/.test(snapSrc) && !/ImageFormat\.JPEG/.test(snapSrc) && /YuvJpeg\.encode\(img, 80\)/.test(snapSrc)
      && /YuvJpeg\.isDark\(img\)/.test(snapSrc) && !/PixelCopy|drawToBitmap|getDrawingCache|MediaProjection/.test(cam + read(A + 'Shots.kt')),
    'كاميرات الشاشة كتير مابتبعتش JPEG ورا بعض (كانت بتستنى ٨ ثوانى وتفشل)، والإطار الأسود مايتاخدش.');
  check('the road camera is chosen by its picture (some «back» cameras mirror the screen)',
    /Prefs\(ctx\)\.roadCam\.takeIf \{ it\.isNotEmpty\(\) && it in ids \}/.test(cam) && /private fun chooseRoadCam\(\)/.test(mainA)
      && /Guard\.cam\.snap\(id\)/.test(mainA) && /chooseRoadCam\(\) \}/.test(mainA),
    'الشاشة فيها ٦–٧ كاميرات «خلفية» وبعضها بينقل الشاشة نفسها ⇒ الصورة كانت بتطلع لقطة من التطبيق.');
  check('phone page: a camera stopped in the background is reopened and the shot waits for a real frame',
    /getVideoTracks\(\)\.some\(\(t\) => t\.readyState === 'live'\)/.test(app) && /v\.readyState < 2/.test(app),
    'الآيفون بيقفل الكاميرا فى الخلفية والـstream بيفضل «ended» ⇒ كل صورة بعدها كانت بتفشل.');
}
{
  // المالك ٢٠٢٦-١١-٢٠: «سجّل مطب» / «صوّر الطريق» ⇒ المكان والصورة ساعة ما اتقال (مش بعد ما الجملة تتفهم)، والأمر المتكرر مرة واحدة
  const A = 'oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/';
  const mainA = read(A + 'MainActivity.kt'), wl = read(A + 'WakeListener.kt'), app = read('drive-web/app.js');
  check('voice road events: immediate provisional capture (partial results) + one run per repeated command — screen and phone',
    /EXTRA_PARTIAL_RESULTS/.test(wl) && /onPartial\?\.invoke\(l\)/.test(wl) && /"road\.shot" -> if \(!provisionalConfirm\(id\)\) snapRoad/.test(mainA)
      && /"road\.bump" -> if \(!provisionalConfirm\(id\)\)/.test(mainA) && /repeatGuard\.allow\(/.test(mainA) && /prov\.discard\(\)/.test(mainA)
      && /rec\.interimResults = true/.test(app) && /RD\.provBegin\(voiceProv/.test(app) && /RD\.provTake\(voiceProv, cmd/.test(app) && /RD\.repeatOk\(voiceRepeat/.test(app),
    'على ٦٠ كم/س ثانيتين = ٣٣ متر: المطب كان بيتسجّل بعد مكانه. والنتيجة المكرّرة من برنامج التعرّف كانت بتسجّل مرتين.');
}
{
  // قرار المالك ٢٠٢٦-١١-٢٠: الخريطة الخارجية ⇒ زرار «⬅️ Oscar» عائم فوقها (صلاحية «الظهور فوق التطبيقات» للحالة دى بس)
  const A = 'oscardrive-android/app/src/main/java/com/oscardevs/oscardrive/';
  const bb = read(A + 'BackBubble.kt'), mainA = read(A + 'MainActivity.kt'), nav = read(A + 'NavActivity.kt'), mapA = read(A + 'MapActivity.kt');
  const man = read('oscardrive-android/app/src/main/AndroidManifest.xml');
  check('external maps get a floating «⬅️ Oscar» back button (overlay permission, optional), hidden when you come back',
    /android\.permission\.SYSTEM_ALERT_WINDOW/.test(man) && /Settings\.canDrawOverlays/.test(bb) && /TYPE_APPLICATION_OVERLAY/.test(bb)
      && /Prefs\(app\)\.backBubble/.test(bb) && /BackBubble\.show\(this\)/.test(mainA) && /BackBubble\.hide\(this\)/.test(mainA)
      && /BackBubble\.show\(ctx\)/.test(nav) && /BackBubble\.show\(this\)/.test(mapA),
    'الرجوع من جوجل مابس لـOscar Drive كان صعب. الصلاحية اختيارية ومن غيرها كله زى الأول.');
}
{
  // المالك ٢٠٢٦-١١-٢٠: الاتصال من الموبايل نفسه — جهات الاتصال مابتتبعتش للشاشة ولا للسيرفر، والتأكيد قبل أى مكالمة
  const app = read('drive-web/app.js'), road = read('drive-web/road.js');
  check('phone voice calls go to the iPhone shortcut by name only, with a confirm step and an optional WhatsApp choice',
    /function parseCall\(/.test(road) && /shortcuts:\/\/run-shortcut\?name=/.test(road) && /function callAsk\(/.test(app) && /function callVoiceAnswer\(/.test(app)
      && /\$\('callBox'\)\.hidden = false/.test(app) && !/contacts|ContactsManager|navigator\.contacts/i.test(app.slice(app.indexOf('function callAsk'), app.indexOf("$('callTestBtn')"))),
    'Safari مابيقراش جهات الاتصال، والمالك عايزها تفضل على الموبايل — الاختصار هو اللى بيدوّر ويتصل.');
}
{
  const app = read('drive-web/app.js');
  const ct = app.slice(app.indexOf("const CT_KEY"), app.indexOf('function callAsk('));
  check('Android call contacts live in this phone only (localStorage) — never sent to the server or the screen',
    /localStorage\.setItem\(CT_KEY/.test(ct) && !/api\(|fetch\(|inbox/.test(ct), 'قرار المالك ٢٠٢٦-١١-٢٠: جهات الاتصال مابتتخزّنش لا فى الشاشة ولا عندنا.');
}
{
  const srv = read('server.js');
  check('drive.oscardevs.com bodies skip the site-wide 100 KB JSON parser (road photos are up to 1.2 MB)',
    /if \(h\.startsWith\('drive\.'\)\) return next\(\);\s*\n\s*return globalJson\(req, res, next\);/.test(srv),
    'المالك ٢٠٢٦-١١-٢٠: «صوّر الطريق» كان بيطلّع «خطأ فى الاتصال» — الحد العام كان بيرفض الصورة قبل راوتر Oscar Drive، والشاشة كانت بتمسحها.');
}

process.exit(failed ? 1 : 0);
