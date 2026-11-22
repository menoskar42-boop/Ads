#!/usr/bin/env node
/**
 * `/api/health` لازم يفضل **يقيس**، مش يقول «ok» وبس.
 *
 * ليه: بعد نقل القاعدة لسوبابيز، «الموقع بقى بطيء» بقى سؤال متكرّر وله
 * تلات إجابات مختلفة تماماً ومفيش طريقة نفرّق بينهم من بره:
 *   · الشبكة بعيدة (`pingMs`) — مفيش كود بيصلّحها.
 *   · الطلبات واقفة في طابور على حوض الاتصالات (`pool.waiting`) —
 *     يتزوّد `MYBIBLE_PG_POOL_MAX`.
 *   · **النقل ضيّع فهارس** (`indexes.missing`) — وساعتها كل استعلام بقى
 *     مسح كامل للجدول. ده أخطر احتمال وأسرعهم إصلاحاً، ومن غير قياس
 *     محدّش هيلاقيه.
 *
 * والفحص بيحمي تلات حاجات:
 *   ١) قايمة الفهارس المتوقّعة **مشتقّة من تعريف الجداول** مش مكتوبة
 *      بالإيد. قايمة مكتوبة بالإيد بتقدم أول ما حد يضيف فهرس، وساعتها
 *      الفحص بيقول «مفيش ناقص» وهو مش عارف.
 *   ٢) الراوت يفضل **مفتوح** — لو اتحط ورا مفتاح، المالك مش هيقدر
 *      يستخدمه وقت المشكلة وهي بالظبط اللحظة اللي محتاجه فيها.
 *   ٣) بيرجّع `waiting` و`pingMs` فعلاً.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYBIBLE = path.join(ROOT, 'mybible');
const ROUTES = path.join(MYBIBLE, 'server/routes.ts');
const SCHEMA = path.join(MYBIBLE, 'shared/schema.ts');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

if (!fs.existsSync(ROUTES)) {
  console.log('⏭️  mybible مش موجود هنا — مفيش حاجة تتفحص');
  process.exit(0);
}

const src = fs.readFileSync(ROUTES, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const start = src.indexOf("app.get('/api/health'");
if (start < 0) {
  fail("مالقيتش `app.get('/api/health')` — الفحص مش قادر يقيس.");
  process.exit(1);
}
let depth = 0, end = start;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
}
const handler = src.slice(start, end + 1);

/* ── ١) مفتوح ──────────────────────────────────────────────────────────── */
if (/seedKeyOk\s*\(/.test(handler)) {
  fail('`/api/health` اتحط ورا مفتاح. ده راوت تشخيص بيتفتح وقت المشكلة — '
    + 'ومابيرجّعش ولا صف بيانات، أسامي فهارس وأرقام بس. سيبه مفتوح.');
}

/* ── ٢) بيقيس فعلاً ───────────────────────────────────────────────────── */
for (const [re, what] of [
  [/pingMs/, '`pingMs` — زمن الوصول للقاعدة'],
  [/waitingCount/, '`pool.waiting` — الطلبات الواقفة في الطابور'],
  [/pg_indexes/, 'فحص الفهارس من `pg_indexes`'],
  [/missing/, 'قايمة الفهارس الناقصة'],
  [/describeDbEndpoint/, 'منطقة القاعدة — بيفرّق بين «الشبكة بعيدة» و«القاعدة بطيئة»'],
]) {
  if (!re.test(handler)) fail(`\`/api/health\` مابيرجّعش ${what}.`);
}

/* ── ٢ب) وصف القاعدة مايكشفش بيانات دخول ولا معرّف مشروع ────────────── */
{
  const label = path.join(MYBIBLE, 'server/db-endpoint-label.ts');
  if (!fs.existsSync(label)) {
    fail('`server/db-endpoint-label.ts` مش موجود — وصف القاعدة رجع جوّه الراوت، '
      + 'والفحص مش قادر يجرّبه على روابط حقيقية.');
  } else {
    const probe = path.join(require('os').tmpdir(), `dbep-${process.pid}.mjs`);
    fs.writeFileSync(probe, `
const m = await import(${JSON.stringify('file://' + label)});
const urls = [
  'postgres://sbuser:Sup3rS3cret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
  'postgres://sbuser:Sup3rS3cret@db.abcdefghijklm.supabase.co:5432/postgres',
];
process.stdout.write('@@JSON@@' + JSON.stringify(urls.map((u) => m.describeDbEndpoint(u))));
`, 'utf8');
    try {
      const raw = require('child_process')
        .execFileSync(process.execPath, ['--no-warnings', probe], { maxBuffer: 1 << 20 }).toString('utf8');
      fs.unlinkSync(probe);
      const out = JSON.parse(raw.slice(raw.indexOf('@@JSON@@') + 8));
      const flat = JSON.stringify(out);
      for (const leak of ['Sup3rS3cret', 'sbuser', 'abcdefghijklm']) {
        if (flat.includes(leak)) {
          fail(`وصف القاعدة بيكشف \`${leak}\` — الراوت ده **مفتوح**، وحجّة إنه يفضل `
            + 'مفتوح هي إنه مابيكشفش حاجة.');
        }
      }
      if (out[0].region !== 'eu-central-1') {
        fail('وصف القاعدة مابيطلّعش المنطقة من اسم مضيف البوولر — '
          + 'وده الرقم الوحيد اللي بيفسّر ping عالي.');
      }
    } catch (e) {
      fail('مش قادر أشغّل db-endpoint-label.ts: ' + String(e.stderr || e.message).split('\n')[0]);
    }
  }
}

/* ── ٣) قايمة الفهارس مشتقّة مش مكتوبة بالإيد ─────────────────────────── */
{
  if (!/getTableConfig\s*\(/.test(handler)) {
    fail('الفهارس المتوقّعة مش مشتقّة من تعريف الجداول (`getTableConfig`) — '
      + 'أي قايمة مكتوبة بالإيد بتقدم وبتقول «مفيش ناقص» وهي مش عارفة.');
  }

  const schema = fs.readFileSync(SCHEMA, 'utf8');
  const declared = [...schema.matchAll(/(?:unique)?[Ii]ndex\(\s*["']([^"']+)["']/g)].map((m) => m[1]);
  if (declared.length < 10) {
    fail(`مالقيتش غير ${declared.length} فهرس في السكيمة — يا إما الصيغة اتغيّرت `
      + 'يا إما الفهارس اتشالت. الفحص مش قادر يقيس.');
  }
  const hardcoded = declared.filter((n) => handler.includes(`'${n}'`) || handler.includes(`"${n}"`));
  if (hardcoded.length) {
    fail(`أسماء فهارس متكتوبة بالإيد جوّه \`/api/health\`: ${hardcoded.slice(0, 3).join(' · ')} — `
      + 'الاسم اللي يتكتب في مكانين بيفترقوا. خلّيها مشتقّة من الجداول بس.');
  }
  if (!process.exitCode) {
    console.log(`✅ \`/api/health\` بيقيس: زمن الوصول · طابور الاتصالات · `
      + `${declared.length} فهرس مشتقّين من تعريف الجداول — والراوت مفتوح`);
  }
}

if (process.exitCode) process.exit(1);
