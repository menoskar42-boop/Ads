#!/usr/bin/env node
/**
 * الطلبات اللي مش محتاجة جلسة ما تدفعش تمن استعلام جلسة.
 *
 * الخلفية: مخزن الجلسات بوستجرس (`connect-pg-simple`)، والرحلة الواحدة
 * لسوبابيز ~١٠٤ مللي ثانية (مقيسة من `/api/health` على الموقع الحي).
 * الـmiddleware كان على `app.use(...)` قبل كل حاجة، يعني كل صورة وكل ملف
 * جافاسكريبت وكل نداء API بياخد ١٠٤ مللي زيادة قبل ما يبدأ شغله. صفحة
 * المجموعة لوحدها فيها ٣١ نداء.
 *
 * الفحص بيقيس حاجتين، وواحدة منهم أهم من التانية بكتير:
 *
 *   ١) **مافيش مسار بيستخدم الجلسة اتشال بالغلط.** ده الاتجاه الخطر:
 *      مسار اتنسي في القايمة بياخد ١٠٤ مللي زيادة وبس، إنما مسار اتشال
 *      وهو بيقرا `req.session` بيفقد هوية المستخدم. الفحص بيستخرج **كل**
 *      مسار في السيرفر معالجه بيلمس `req.session`، وبينفّذ `skipsSession`
 *      الحقيقية عليه، ولازم ترجّع `false` لكلهم.
 *   ٢) المسارات الساكنة والمعروفة بتعدّي فعلاً — وإلا التحسين مش موجود.
 *
 * وكمان بيتأكد إن `saveUninitialized` فضلت `false`: بـ`true` كل زائر —
 * وكل بوت — بيتعملّه صف في جدول الجلسات حتى لو ماكتبش فيه حاجة.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYBIBLE = path.join(ROOT, 'mybible');
const SCOPE = path.join(MYBIBLE, 'server/session-scope.ts');
const INDEX = path.join(MYBIBLE, 'server/index.ts');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

if (!fs.existsSync(INDEX)) {
  console.log('⏭️  mybible مش موجود هنا — مفيش حاجة تتفحص');
  process.exit(0);
}
if (!fs.existsSync(SCOPE)) {
  fail('`server/session-scope.ts` مش موجود — يا إما التحسين اتشال يا إما '
    + 'الشرط رجع مكتوب جوّه index.ts. الفحص مش قادر ينفّذه.');
  process.exit(1);
}

/* شيل الكومنتات **من غير ما تلمس النصوص**.
 *
 * 🐛 النسخة القديمة كانت regex على بداية ونهاية كومنت البلوك. والسطر
 * `app.use('/api/*', ensureSessionUser)` فيه `/` بعدها `*` جوّه نص — فكانت
 * بتتحسب بداية كومنت وتاكل باقي الملف. الفحص ساعتها قال «مالقيتش الراوت»
 * بدل ما يفحصه. ماسح بسيط بيتابع حالة النص بيحل ده. */
function strip(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {           // نص — انقله زي ما هو
      const quote = c;
      out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        if (src[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '/' && next === '*') {                      // كومنت بلوك
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (c === '/' && next === '/') {                      // كومنت سطر
      let end = src.indexOf('\n', i);
      if (end < 0) end = n;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    out += c; i++;
  }
  return out;
}

/* ── اجمع كل مسار معالجه بيلمس req.session ───────────────────────────── */
const sessionPaths = [];
const routeFiles = fs.readdirSync(path.join(MYBIBLE, 'server'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

for (const file of routeFiles) {
  const src = strip(fs.readFileSync(path.join(MYBIBLE, 'server', file), 'utf8'));
  const re = /app\.(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    // جسم المعالج بالأقواس
    let depth = 0, end = m.index;
    for (let i = src.indexOf('{', m.index); i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(m.index, end + 1);
    if (/req\.session\b/.test(body)) sessionPaths.push(m[1]);
  }
}

if (!sessionPaths.length) {
  fail('مالقيتش ولا مسار بيستخدم `req.session` — يا إما الجلسات اتشالت خالص '
    + 'يا إما الصيغة اتغيّرت. الفحص مش قادر يقيس، وماينفعش يعدّي أخضر.');
  process.exit(1);
}

// مسارات ساكنة ومعروفة المفروض تعدّي
const MUST_SKIP = [
  '/assets/index-abc123.js', '/assets/main.css', '/audio/hymn.mp3',
  '/icon-192.png', '/robots.txt', '/llms.txt', '/sitemap.xml',
  '/sitemap-bible.xml', '/manifest.json',
  '/api/groups/ABC123', '/api/tafsir/books', '/api/health',
];
// ومسارات المفروض **ماتعدّيش** مهما حصل
const MUST_KEEP = ['/', '/bible/يوحنا/3', '/api/user', '/api/ai/query'];

const probe = path.join(require('os').tmpdir(), `session-scope-${process.pid}.mjs`);
fs.writeFileSync(probe, `
const m = await import(${JSON.stringify('file://' + SCOPE)});
const paths = ${JSON.stringify({ sessionPaths, MUST_SKIP, MUST_KEEP })};
const out = {};
const concrete = (p) => p.replace(/:([^/]+)/g, 'x');
out.sessionSkipped = paths.sessionPaths.filter((p) => m.skipsSession(concrete(p)));
out.notSkipped = paths.MUST_SKIP.filter((p) => !m.skipsSession(p));
out.wronglySkipped = paths.MUST_KEEP.filter((p) => m.skipsSession(p));
out.skipCount = paths.MUST_SKIP.filter((p) => m.skipsSession(p)).length;
process.stdout.write('@@JSON@@' + JSON.stringify(out));
`, 'utf8');

let r;
try {
  const raw = execFileSync(process.execPath, ['--no-warnings', probe], { maxBuffer: 1 << 24 }).toString('utf8');
  fs.unlinkSync(probe);
  r = JSON.parse(raw.slice(raw.indexOf('@@JSON@@') + 8));
} catch (e) {
  console.error('⚠️  مش قادر أشغّل session-scope.ts: ' + String(e.stderr || e.message).split('\n')[0]);
  process.exit(1);
}

/* ── ١) الاتجاه الخطر: مسار بيستخدم الجلسة واتشال ────────────────────── */
for (const p of r.sessionSkipped) {
  fail(`\`${p}\` معالجه بيستخدم \`req.session\` وهو **متشال** من الجلسة — `
    + 'المستخدم هيفقد هويته على المسار ده. شيله من قايمة الاستثناء في session-scope.ts.');
}

/* ── ٢) التحسين شغّال فعلاً ───────────────────────────────────────────── */
for (const p of r.notSkipped) {
  fail(`\`${p}\` لسه بياخد استعلام جلسة وهو مش محتاجه — التحسين مش بيغطّيه.`);
}
for (const p of r.wronglySkipped) {
  fail(`\`${p}\` اتشال من الجلسة وهو المفروض ياخدها.`);
}

/* ── ٢ب) الـmiddleware اللي على /api/* كله لازم يستحمّل غياب الجلسة ──────
 *
 * 🐛 الغلط اللي البند ده اتضاف عشانه، وكان حي على الموقع: `ensureSessionUser`
 * متركّب على `app.use('/api/*', …)` — يعني بيشوف **كل** مسار API، بما فيهم
 * اللي `skipsSession` بيعدّيهم. وأول سطر فيه بيلمس `req.session` رمى
 * «Cannot read properties of undefined»، فكل نداء على `/api/groups/*`
 * رجّع 500 وصفحة المجموعة وقعت.
 *
 * فحص «المسارات اللي بتستخدم الجلسة مش متشالة» مامسكهاش، لأن راوتات
 * المجموعات نفسها مابتلمسش `req.session` — اللي بيلمسها هو الـmiddleware
 * اللي فوقهم. */
{
  const routesSrc = strip(fs.readFileSync(path.join(MYBIBLE, 'server/routes.ts'), 'utf8'));
  const wildcardMw = [...routesSrc.matchAll(/app\.use\(\s*['"]\/api\/\*['"]\s*,\s*(\w+)/g)]
    .map((m) => m[1]);
  if (!wildcardMw.length) {
    fail("مالقيتش `app.use('/api/*', …)` — الفحص مش قادر يتأكد إن الـmiddleware "
      + 'اللي على كل مسارات API بيستحمّل غياب الجلسة.');
  }
  for (const name of wildcardMw) {
    // دوّر على تعريف الدالة في كل ملفات السيرفر
    let body = null;
    for (const f of routeFiles) {
      const fsrc = strip(fs.readFileSync(path.join(MYBIBLE, 'server', f), 'utf8'));
      const at = fsrc.indexOf(`function ${name}(`);
      if (at < 0) continue;
      let depth = 0;
      for (let i = fsrc.indexOf('{', at); i < fsrc.length; i++) {
        if (fsrc[i] === '{') depth++;
        else if (fsrc[i] === '}') { depth--; if (depth === 0) { body = fsrc.slice(at, i + 1); break; } }
      }
      if (body) break;
    }
    if (!body) { fail(`مالقيتش تعريف \`${name}\` — الفحص مش قادر يقيس.`); continue; }

    const touchesSession = /req\.session\b/.test(body);
    if (!touchesSession) continue;
    // لازم يخرج بدري لو مفيش جلسة، قبل أي لمسة
    const guard = /if\s*\(\s*!req\.session\s*\)\s*return/.test(body);
    const firstTouch = body.search(/req\.session\b/);
    const guardAt = body.search(/if\s*\(\s*!req\.session\s*\)\s*return/);
    if (!guard || (firstTouch >= 0 && guardAt > firstTouch)) {
      fail(`\`${name}\` متركّب على \`/api/*\` وبيلمس \`req.session\` من غير ما `
        + 'يتأكد إنها موجودة الأول. المسارات اللي `skipsSession` بيعدّيهم بتوصله '
        + 'من غير جلسة، وساعتها كل نداء عليهم بيرجّع 500.');
    }
  }
}

/* ── ٣) الـmiddleware متوصّل، وsaveUninitialized فضلت false ───────────── */
{
  const idx = strip(fs.readFileSync(INDEX, 'utf8'));
  if (!/skipsSession\s*\(/.test(idx)) {
    fail('`index.ts` مابيناديش `skipsSession` — الدالة موجودة ومحدّش بيستخدمها.');
  }
  const m = /saveUninitialized:\s*(\w+)/.exec(idx);
  if (!m) fail('`saveUninitialized` مش موجودة في إعداد الجلسة.');
  else if (m[1] !== 'false') {
    fail(`\`saveUninitialized: ${m[1]}\` — بـtrue كل زائر وكل بوت بيتعملّه صف في `
      + 'جدول الجلسات حتى لو ماكتبش حاجة. خلّيها `false`.');
  }
}

if (process.exitCode) process.exit(1);
console.log(`✅ الجلسة بتتفتح لما تلزم بس: ${sessionPaths.length} مسار بيستخدمها `
  + `كلهم محفوظين · ${r.skipCount} مسار ساكن/عام بيعدّوا من غير استعلام`);
