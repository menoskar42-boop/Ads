#!/usr/bin/env node
/**
 * حزمة جاية من رابط خارجي ما تقدرش توقّع الموقع وقت الإقلاع.
 *
 * الغلط اللي الفحص ده اتعمل عشانه: `xlsx` في package.json مش جاية من
 * npm — جاية من tarball على `cdn.sheetjs.com`. وكانت بتتستدعى على مستوى
 * الموديول في `src/lib/sheet_import.js` و`src/research/parser.js`،
 * والاتنين مربوطين بـserver.js.
 *
 * فأي بناء ما يوصلش للـCDN بيطلع من غير الحزمة، والاستدعاء بيرمي
 * `Cannot find module 'xlsx'` **قبل ما السيرفر يسمع على البورت أصلاً**.
 * واللي بيظهر في لوج النشر:
 *
 *     healthcheck failed error=healthcheck / returned status 500
 *
 * يعني الموقع كله بيقع — كل الأنظمة والصفحات المفهرسة — عشان ميزة
 * استيراد إكسل. وكان صعب يتشاف لأن الرسالة بتتلمّ في
 * `process.on('uncaughtException')` اللي بيسجّل بس وما بيوقّفش العملية.
 *
 * القاعدة: أي اعتمادية نسختها رابط لازم استدعاؤها يبقى جوّه try/catch،
 * زي `compression` في server.js بالظبط. الميزة تقف — الموقع لأ.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

const IS_URL = /^(https?:|git\+|git:|file:)/i;
const cdnDeps = Object.keys(deps).filter((d) => IS_URL.test(String(deps[d])));

if (!cdnDeps.length) {
  console.log('✅ كل الاعتماديات من سجلّ npm — مفيش حزمة من رابط خارجي');
  process.exit(0);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const files = [path.join(ROOT, 'server.js'), ...walk(path.join(ROOT, 'src'))]
  .filter((f) => fs.existsSync(f));

const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

for (const dep of cdnDeps) {
  const esc = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const src0 = `require\\(\\s*['"]${esc}['"]\\s*\\)`;
  for (const file of files) {
    const src = strip(fs.readFileSync(file, 'utf8'));
    let guarded = true, seen = false;
    for (const m of src.matchAll(new RegExp(src0, 'g'))) {
      seen = true;
      const before = src.slice(0, m.index);
      const opens = (before.match(/\btry\s*\{/g) || []).length;
      const closes = (before.match(/\}\s*catch\s*\(/g) || []).length;
      if (opens <= closes) { guarded = false; break; }
    }
    if (seen && !guarded) {
      fail(
        `${path.relative(ROOT, file)}: بيستدعي «${dep}» من غير try/catch. `
        + `الحزمة دي بتتسطّب من رابط خارجي (${deps[dep]}) — `
        + 'فبناء ما يوصلش للرابط بيوقّف الموقع كله وقت الإقلاع.',
      );
    }
  }
}

if (!process.exitCode) {
  console.log(`✅ الحزم الجاية من روابط خارجية (${cdnDeps.join('، ')}) استدعاؤها محمي`);
}
