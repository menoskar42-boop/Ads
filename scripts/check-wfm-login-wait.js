#!/usr/bin/env node
/**
 * check-wfm-login-wait — سكربت WFM Reporting مايقفش على «تسجيل الدخول…».
 *
 * البلاغ (٢٠٢٦-٠٩-٢٨): بعد Login أحياناً الدخول بيطوّل، والصفحة توصل للـ Home والشريط
 * فاضل «تسجيل الدخول…» — والمالك بيحلّها بريفريش + Login تانى. السبب: السكربت كان
 * بيستنى ٩٠ث بس إن صفحة الدخول تختفى (waitFor(() => !onLogin(), 90000))، وبعدها
 * بيبطّل يراقب خالص.
 *
 * بيتأكد من:
 *   · مفيش انتظار دخول بسقف ٩٠ث؛ الانتظار ≥ ٣ دقايق ومعاه hashchange.
 *   · لو لسه على صفحة الدخول بعد ٣٠ث: ريفريش (لحد مرتين، بعدّاد sessionStorage — مايلفّش).
 *   · بيانات غلط → يقف (مفيش تكرار يقفل الحساب)، والرفع ناجح بس لو رد الـ API نفسه.
 *   · والاختبار الوظيفى (jsdom) لو متاح: دخول بعد ١٠٠ث بيكمّل، ودخول واقف بيعمل ريفريش واحد.
 *
 *   node scripts/check-wfm-login-wait.js [path-to-userscript]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FILE = process.argv[2] || path.join(ROOT, 'serviceflow', 'wfm-voice-installation-raw.user.js');
const src = fs.readFileSync(FILE, 'utf8');

const errors = [];
const need = (ok, msg) => { if (!ok) errors.push(msg); };

need(!/waitFor\(\(\) => !onLogin\(\), 90000\)/.test(src),
  'انتظار الدخول بسقف ٩٠ث رجع — لو الدخول طوّل، السكربت بيبطّل يراقب والشريط يفضل «تسجيل الدخول…».');
const m = src.match(/const LOGIN_WAIT_MS = (\d+) \* 60 \* 1000;/);
need(m && Number(m[1]) >= 3, 'LOGIN_WAIT_MS لازم يبقى ٣ دقايق على الأقل.');
need(/window\.addEventListener\("hashchange", \(\) => setTimeout\(go, \d+\)\)/.test(src),
  'لازم يسمع hashchange — أول ما الـ Home يوصل يكمّل من غير ما يستنى الدورة.');
need(/const loggedIn = \(\) => !\/#\\\/login\/i\.test\(location\.hash\) && \(!pwVisible\(\) \|\| homeTiles\(\)\);/.test(src),
  'loggedIn لازم يقبل الـ Home حتى لو فيه خانة باسورد فاضلة فى الصفحة (كروت Reports/Dashboards).');
// v1.0.11: الريفريش هو العلاج المجرَّب (المالك) — بعد ٣٠ث، ولحد مرتين كل ١٠ دقايق.
const rm = src.match(/const RELOAD_MAX = (\d+);/);
need(rm && Number(rm[1]) >= 1 && Number(rm[1]) <= 2, 'RELOAD_MAX لازم ١ أو ٢ — أكتر من كده ممكن يلفّ فى ريفريش.');
need(/catch \(e\) \{ return RELOAD_MAX; \}/.test(src), 'لو sessionStorage مش متاح لازم مايعملش ريفريش خالص (منعاً للّف).');
need(/!reloadedRecently\(\)\) \{\s*\n\s*noteReload\(\);/.test(src), 'العداد لازم يتسجّل قبل الريفريش — غير كده ممكن يلفّ.');
// إعادة الضغط بكلمة سر غلط بتقفل الحساب
const rl = src.match(/const RELOGIN_MAX = (\d+);/);
need(rl && Number(rl[1]) <= 1, 'RELOGIN_MAX لازم ≤ ١ — تكرار Login ببيانات غلط ممكن يقفل الحساب.');
need(/if \(pwVisible\(\) && badCredsShown\(\)\) \{[\s\S]{0,200}?return;/.test(src),
  'لو الموقع كاتب إن البيانات غلط لازم يقف (من غير ريفريش ولا Login تانى).');
// الرفع: 2xx لوحده مش نجاح — لازم رد الـ API نفسه (JSON فيه inserted)
need(/apiOk = !!j && typeof j\.inserted === "number"/.test(src) && /ok: httpOk && apiOk/.test(src),
  'الرفع لازم يتحسب ناجح بس لو الرد JSON فيه inserted — صفحة HTML بـ200 كانت بتطلّع «اتحدّث» والتقرير ماتحدّثش.');
need(/if \(onLogin\(\)\) \{\s*\n\s*login\(\);\s*\n\s*waitLoginThenRun\(\);/.test(src), 'boot لازم ينادى waitLoginThenRun بعد login.');

let functional = 'jsdom مش متسطّب — الاختبار الوظيفى اتخطّى';
let hasJsdom = false;
try { require.resolve('jsdom'); hasJsdom = true; } catch {}
if (hasJsdom && !errors.length) {
  for (const extra of [['--after=100000', '--reloaded'], ['--after=0'], ['--bad-creds']]) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'serviceflow', 'scripts', 'test-wfm-login.cjs'), FILE, ...extra],
      { encoding: 'utf8', timeout: 240000, env: process.env });
    if (r.status !== 0) errors.push(`الاختبار الوظيفى فشل (${extra.join(' ')}):\n` + (r.stdout || '') + (r.stderr || ''));
  }
  if (!errors.length) functional = 'الاختبار الوظيفى: دخول بعد ١٠٠ث كمّل، دخول معلّق عمل ريفريش بعد ٣٠ث، وبيانات غلط وقّفته';
}

if (errors.length) {
  console.log('❌ check-wfm-login-wait:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-wfm-login-wait: WFM Reporting بيستنى الدخول الطويل ويعمل ريفريش واحد لو وقف (${functional}).`);
