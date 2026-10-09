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
check('every fleet response is noindex', /res\.set\('X-Robots-Tag', 'noindex, nofollow'\)/.test(routes)
  && /router\.use\(\(req, res, next\) => \{\s*res\.locals\.showAds = false;\s*res\.set\('X-Robots-Tag', 'noindex, nofollow'\);/.test(routes),
  'router.use لازم يحط noindex ويقفل الإعلانات قبل أى راوت.');

for (const v of ['home', 'dashboard', 'app']) {
  const src = read(`src/views/fleet/${v}.ejs`);
  check(`fleet/${v}.ejs carries <meta name="robots" content="noindex, nofollow">`,
    /<meta name="robots" content="noindex, nofollow" \/>/.test(src), 'الصفحة لازم تفضل noindex لحد موافقة المالك.');
  check(`fleet/${v}.ejs has no ad slot`, !/adsbygoogle|ad_slot|partials\/ads/.test(src), 'أداة شركة/تجربة — مفيش إعلانات.');
}

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
check('server mounts /fleet and creates its tables at boot',
  /app\.use\('\/fleet', require\('\.\/src\/routes\/fleet'\)\)/.test(server) && /\.then\(\(\) => ensureFleetSchema\(\)\)/.test(server),
  'الراوتر أو ensureFleetSchema مش متركّبين فى server.js.');

// الـrelease بتاع GitHub لازم يفضل pre-release ومش «latest» — وإلا لينك NeuroPilot
// (/releases/latest/download/neuropilot.apk) بيوقع فى صمت.
const wf = read('.github/workflows/speedguard-apk.yml');
check('the APK release is a pre-release that never becomes "latest"',
  /prerelease: true/.test(wf) && /make_latest: false/.test(wf) && /tag_name: speedguard-latest/.test(wf),
  'release عادى جديد بياخد مكان NeuroPilot فى /releases/latest.');

process.exit(failed ? 1 : 0);
