#!/usr/bin/env node
/**
 * «مراقب السرعة» للأساطيل — لسه تجربة (قرار المالك ٢٠٢٦-١٠-٠٩):
 * «لينك مباشر، مايتحطّش فى السايت‌ماب ولا فى llms لحد ما أقولك كويس».
 *
 * الفحص ده بيمسك أى حد (أو أى جلسة) يضيفه للسايت‌ماب أو llms.txt أو يلينكه من صفحة عامة
 * قبل الموافقة، أو يشيل noindex أو يحط إعلانات على أداة شركة. لما المالك يوافق على النشر:
 * عدّل الفحص ده نفسه (مش تتخطّاه) — وطبّق فحوص السيو بعدها.
 *
 * Usage: node scripts/check-fleet.js
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

const routes = read('src/routes/fleet.js');
const site = read('src/routes/speed_site.js');
const admin = read('src/routes/fleet_admin.js');
for (const [name, src] of [['fleet.js', routes], ['speed_site.js', site], ['fleet_admin.js', admin]]) {
  check(`${name}: every response is noindex with no ads`,
    /router\.use\(\(req, res, next\) => \{\s*res\.locals\.showAds = false;\s*res\.set\('X-Robots-Tag', 'noindex, nofollow'\);/.test(src),
    'router.use لازم يحط noindex ويقفل الإعلانات قبل أى راوت.');
}

for (const v of ['home', 'dashboard', 'landing', 'admin']) {
  const src = read(`src/views/fleet/${v}.ejs`);
  check(`fleet/${v}.ejs carries <meta name="robots" content="noindex, nofollow">`,
    /<meta name="robots" content="noindex, nofollow" \/>/.test(src), 'الصفحة لازم تفضل noindex لحد موافقة المالك.');
  check(`fleet/${v}.ejs has no ad slot`, !/adsbygoogle|ad_slot|partials\/ads/.test(src), 'أداة شركة/تجربة — مفيش إعلانات.');
}

// الحماية (المالك ٢٠٢٦-١٠-٠٩: «اعمل الأفضل من حيث الحماية»): مفيش تسجيل عام — الحساب
// بيتعمل من لوحة الأدمن بس، بكلمة سر عشوائية.
check('no public sign-up: fleet accounts are created only from /admin/fleet',
  !/router\.post\('\/create'/.test(routes) && !/INSERT INTO fleet_accounts/.test(routes)
  && /router\.post\('\/create'/.test(admin),
  'إنشاء حساب شركة لازم يفضل من لوحة الأدمن بس.');
check('login regenerates the session (no fixation)', /req\.session\.regenerate\(/.test(routes),
  'الدخول لازم يعمل جلسة جديدة.');
check('password change asks for the current password', /bcrypt\.compare\(cur, f\.password_hash\)/.test(routes),
  'تغيير كلمة السر من غير الحالية = أى حد على جهاز سايب الجلسة مفتوحة يقفل صاحبها برّه.');
check('a fleet has a device cap', /MAX_DRIVERS/.test(routes) && /n\.n >= MAX_DRIVERS/.test(routes),
  'أى حد معاه الكود يقدر ينضم — من غير سقف يقدر يغرّق اللوحة بأجهزة وهمية.');
check('the reserved slug list protects speed.oscardevs.com from a store named "speed"',
  /'speed'/.test(read('src/lib/reserved_slugs.js')), 'متجر اسمه speed كان هيتعمل ومايتفتحش أبداً.');

const legal = read('src/routes/legal.js');
check('the sitemap does not list /fleet', !/loc:\s*'\/fleet/.test(legal) && !/['"`]\/fleet/.test(legal),
  'لسه تجربة — مايدخلش السايت‌ماب لحد ما المالك يقول «كويس».');
check('llms.txt does not mention the fleet app', !/fleet|مراقب السرعة|speed-guard/i.test(legal),
  'لسه تجربة — مايدخلش llms.txt لحد موافقة المالك.');

// مفيش صفحة عامة بتلينك عليه (برّه فولدر fleet نفسه)
const hits = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== 'fleet') walk(p); continue; }
    if (!/\.(ejs|html)$/.test(f)) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (/href="\/fleet|speed-guard\.apk|speedguard-latest|مراقب السرعة/.test(s)) hits.push(path.relative(ROOT, p));
  }
})(path.join(ROOT, 'src/views'));
check('no public page links to the fleet app yet', hits.length === 0, 'لينكات قبل الموافقة: ' + hits.join(', '));

const server = read('server.js');
check('speed.oscardevs.com is host-routed to its own site, before the OscarDevs pipeline',
  /if \(!host\.startsWith\('speed\.'\)\) return next\(\);\s*return speedSite\(req, res, next\);/.test(server)
  && server.indexOf("startsWith('speed.')") < server.indexOf('app.use(i18nMiddleware);'),
  'لازم يتوجّه بالـhost قبل i18n/المتاجر — وإلا speed.oscardevs.com يبقى متجر أو صفحة OscarDevs.');
check('the speed site ends in its own 404 (nothing falls through to OscarDevs)',
  /router\.use\(\(req, res\) => \{\s*res\.status\(404\)/.test(site), 'مسار مش موجود على speed لازم يرجع 404 هناك.');
check('/admin/fleet sits behind the admin login', /app\.use\('\/admin\/fleet', require\('\.\/src\/middleware\/adminAuth'\), require\('\.\/src\/routes\/fleet_admin'\)\)/.test(server),
  'صفحة إنشاء الحسابات من غير دخول أدمن = تسجيل عام.');
check('oscardevs.com/fleet only redirects to the speed site (no second copy)',
  /app\.use\('\/fleet', \(req, res\) => \{[\s\S]{0,500}res\.redirect\(301, origin \+ p\)/.test(server)
  && !/app\.use\('\/fleet', require\(/.test(server), 'لوحة على الدومينين = جلستين ولينكين لنفس الحاجة.');
check('fleet tables are created at boot', /\.then\(\(\) => ensureFleetSchema\(\)\)/.test(server), 'ensureFleetSchema مش فى سلسلة الإقلاع.');
check('the app talks to speed.oscardevs.com',
  /"SERVER", "\\"https:\/\/speed\.oscardevs\.com\\""/.test(read('speedguard-android/app/build.gradle.kts')),
  'التطبيق لازم يكلّم موقعه (speed) — الموقع الرئيسى مابقاش فيه API.');

// الـrelease بتاع GitHub لازم يفضل pre-release ومش «latest» — وإلا لينك NeuroPilot
// (/releases/latest/download/neuropilot.apk) بيوقع فى صمت.
const wf = read('.github/workflows/speedguard-apk.yml');
check('the APK release is a pre-release that never becomes "latest"',
  /prerelease: true/.test(wf) && /make_latest: false/.test(wf) && /tag_name: speedguard-latest/.test(wf),
  'release عادى جديد بياخد مكان NeuroPilot فى /releases/latest.');

process.exit(failed ? 1 : 0);
