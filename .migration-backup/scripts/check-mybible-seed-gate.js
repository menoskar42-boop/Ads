#!/usr/bin/env node
/**
 * أي راوت في mybible بيكتب أو يمسح في القاعدة لازم يبقى **ورا مفتاح**.
 *
 * الغلط اللي الفحص ده اتعمل عشانه: `/api/seed/*` و`/api/fix/*` كانوا
 * مفتوحين تماماً — ومكتوب جنبهم في الكود «no auth required». يعني
 * `GET /api/seed/verses?force=true` بيفضّي جدول الآيات كله ويعيد
 * الاستيراد، و`/api/fix/duplicate-*` بيمسح صفوف — أي حد معاه الرابط
 * كان يقدر يوقّع موقع فيه ٧٠٠ عضو بضغطة واحدة من المتصفّح، من غير ولا
 * كلمة سر. وأخطر حاجة إنه **GET**: أي زاحف أو وكيل اختبار بيتفرّج على
 * الموقع ممكن يدوسه من غير قصد.
 *
 * الفحص بيتأكد من حاجتين:
 *   ١) كل راوت `/api/seed/*` أو `/api/fix/*` — ما عدا قايمة القراءة
 *      المعلَنة تحت — فيه بوّابة `seedKeyOk` في **جسمه هو**، بترجّع
 *      403 قبل أي شغل. الكومنتات بتتشال قبل الفحص، فبوّابة متعلَّق
 *      عليها مابتعدّيش.
 *   ٢) البوّابة نفسها **بتقفل لما المفتاح مش متظبّط**. ده بيتقاس
 *      بتشغيل كود `seedKeyOk` الحقيقي المستخرَج من الملف — مش بقراءة
 *      الكومنت اللي فوقه. إعداد ناقص لازم يقفل الباب مش يفتحه.
 *
 * لو حد ضاف راوت seed/fix جديد ونسي البوّابة، الفحص بيقع ويسمّيه.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROUTES = path.join(ROOT, 'mybible/server/routes.ts');

/** راوتات بتقرا بس — مسموح تفضل مفتوحة، وكل واحد مكتوب سببه. */
const READ_ONLY = {
  '/api/seed/verses/status': 'بيرجّع حالة مهمة الاستيراد — مابيكتبش حاجة',
};

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

if (!fs.existsSync(ROUTES)) {
  console.log('⏭️  mybible/server/routes.ts مش موجود — مفيش حاجة تتفحص');
  process.exit(0);
}

const raw = fs.readFileSync(ROUTES, 'utf8');

// شيل الكومنتات وسيب نفس عدد الحروف عشان الأسطر ما تتزحلقش
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

/** جسم الـcallback من أول `{` بعد الموضع ده لحد قفلته. */
function handlerBody(text, from) {
  const open = text.indexOf('{', from);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return text.slice(open, i + 1); }
  }
  return text.slice(open);
}

/* ── ١) كل راوت بيكتب ورا بوّابة ───────────────────────────────────────── */
const RE = /app\.(get|post|put|patch|delete)\(\s*'(\/api\/(?:seed|fix)\/[^']*)'/g;
const seen = [];
let m;
while ((m = RE.exec(src))) {
  const [, method, route] = m;
  seen.push(route);
  if (READ_ONLY[route]) continue;

  const body = handlerBody(src, m.index);
  const line = src.slice(0, m.index).split('\n').length;

  if (!/\bseedKeyOk\s*\(/.test(body)) {
    fail(`${method.toUpperCase()} ${route} (سطر ${line}) مفيش عليه بوّابة مفتاح — `
      + 'راوت بيكتب في القاعدة ومفتوح للكل. ضيف '
      + "`if (!seedKeyOk(req)) return res.status(403)...` في أول الجسم، "
      + `أو لو بيقرا بس ضيفه لـREAD_ONLY في ${path.basename(__filename)} ومعاه السبب.`);
    continue;
  }
  if (!/seedKeyOk\s*\([^)]*\)[\s\S]{0,120}?403/.test(body)) {
    fail(`${method.toUpperCase()} ${route} (سطر ${line}) بينادي seedKeyOk `
      + 'من غير ما يرجّع 403 — البوّابة اللي مابتمنعش حاجة مش بوّابة.');
  }
}

if (!seen.length) {
  fail('مفيش ولا راوت seed/fix اتلقى في routes.ts — الفحص مش قادر يقيس حاجة. '
    + 'يا إما الراوتات اتنقلت لملف تاني (حدّث الفحص) يا إما الصيغة اتغيّرت.');
}
for (const route of Object.keys(READ_ONLY)) {
  if (!seen.includes(route)) {
    fail(`${route} مكتوب في قايمة القراءة بس مش موجود في routes.ts — `
      + 'استثناء بايت بيفضل مفتوح لراوت ممكن يرجع بشكل تاني. شيله.');
  }
}

/* ── ٢) البوّابة بتقفل لما المفتاح مش متظبّط ──────────────────────────── */
const gate = /const\s+seedKeyOk\s*=\s*\(req:\s*any\)\s*=>\s*\{[\s\S]*?\n  \};/.exec(src);
if (!gate) {
  fail('مش لاقي تعريف `seedKeyOk` — الفحص مش قادر يجرّبه.');
} else {
  const body = gate[0]
    .replace(/const\s+seedKeyOk\s*=\s*\(req:\s*any\)\s*=>/, 'seedKeyOk = (req) =>')
    .replace(/;\s*$/, ';');
  let seedKeyOk;
  try {
    // eslint-disable-next-line no-eval
    seedKeyOk = eval(`(function(){ let seedKeyOk; ${body} return seedKeyOk; })()`);
  } catch (e) {
    fail('تعريف `seedKeyOk` مش قادر يتشغّل: ' + e.message);
  }
  if (seedKeyOk) {
    const req = (key) => ({ headers: key === undefined ? {} : { 'x-seed-key': key }, query: {} });
    const withEnv = (val, fn) => {
      const old = process.env.MYBIBLE_SEED_KEY;
      if (val === undefined) delete process.env.MYBIBLE_SEED_KEY;
      else process.env.MYBIBLE_SEED_KEY = val;
      try { return fn(); } finally {
        if (old === undefined) delete process.env.MYBIBLE_SEED_KEY;
        else process.env.MYBIBLE_SEED_KEY = old;
      }
    };

    if (withEnv(undefined, () => seedKeyOk(req('أي-حاجة')))) {
      fail('المفتاح مش متظبّط والبوّابة فتحت — الإعداد الناقص لازم يقفل الباب مش يفتحه.');
    }
    if (withEnv('', () => seedKeyOk(req('')))) {
      fail('المفتاح فاضي والبوّابة فتحت لطلب من غير مفتاح.');
    }
    if (!withEnv('s3cret-value', () => seedKeyOk(req('s3cret-value')))) {
      fail('المفتاح الصح اترفض — البوّابة قافلة على المالك نفسه.');
    }
    if (withEnv('s3cret-value', () => seedKeyOk(req('s3cret-valuf')))) {
      fail('مفتاح غلط بنفس الطول عدّى.');
    }
    if (withEnv('s3cret-value', () => seedKeyOk(req('s3cret')))) {
      fail('مفتاح أقصر عدّى.');
    }
    if (withEnv('s3cret-value', () => seedKeyOk(req(undefined)))) {
      fail('طلب من غير مفتاح خالص عدّى.');
    }
  }
}

if (process.exitCode) process.exit(1);
const gated = seen.filter((r) => !READ_ONLY[r]).length;
console.log(`✅ ${gated} راوت seed/fix ورا مفتاح `
  + `(و${Object.keys(READ_ONLY).length} للقراءة بس) · والبوّابة بتقفل لما المفتاح مش متظبّط`);
