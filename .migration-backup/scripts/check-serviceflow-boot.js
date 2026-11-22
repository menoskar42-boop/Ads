#!/usr/bin/env node
/**
 * فشل في شغل الإقلاع مايوقّعش التطبيق.
 *
 * الغلط اللي الفحص ده اتعمل عشانه، وكان حي على الموقع: `seedUsers()` في
 * `registerRoutes` كانت متنادية من غير `await` ومن غير `catch`. الدالة
 * بتلمس القاعدة، وأي رفض منها بيطلع `unhandledRejection` **وبيوقّع
 * العملية**. النتيجة اللي ظهرت في اللوج:
 *
 *   [unhandledRejection] error: foreign key constraint "orders_sales_id…"
 *   [co-host] serviceflow exited (code=0) — restarting in 32000ms
 *
 * كل ٣٢ ثانية، للأبد، والموقع بيرجّع ٥٠٢.
 *
 * وزرع مستخدمين افتراضيين مش سبب كافي إن التطبيق مايقومش: المستخدمين
 * الحقيقيين في القاعدة خلاص، والزرع للتجهيز الأول بس.
 *
 * الفحص بيدوّر على **أي** نداء دالة async في نطاق الإقلاع من غير
 * `await` ولا `.catch(` — كل واحد منهم قنبلة بنفس الشكل.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'serviceflow');
const ROUTES = path.join(APP, 'server/routes.ts');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

if (!fs.existsSync(ROUTES)) {
  console.log('⏭️  serviceflow مش موجود هنا — مفيش حاجة تتفحص');
  process.exit(0);
}

const raw = fs.readFileSync(ROUTES, 'utf8');
// ماسح بيحترم النصوص (كومنت-ستريبر بالـregex بيتكسر على `/api/*` جوّه نص)
function strip(src) {
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i]; const next = src[i + 1];
    if (c === '"' || c === "'" || c === '`') {
      const q = c; out += c; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src[i] + (src[i + 1] ?? ''); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '/' && next === '*') {
      const e = src.indexOf('*' + '/', i + 2);
      const stop = e < 0 ? n : e + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' '); i = stop; continue;
    }
    if (c === '/' && next === '/') {
      let e = src.indexOf('\n', i); if (e < 0) e = n;
      out += ' '.repeat(e - i); i = e; continue;
    }
    out += c; i++;
  }
  return out;
}
const src = strip(raw);

/* الدوال الـasync المعرَّفة في الملف — دي اللي نداؤها من غير حماية خطر. */
const asyncNames = new Set([
  ...[...src.matchAll(/async function (\w+)\s*\(/g)].map((m) => m[1]),
  ...[...src.matchAll(/const (\w+)\s*=\s*async\s*\(/g)].map((m) => m[1]),
  ...[...src.matchAll(/(\w+)\s*=\s*async function/g)].map((m) => m[1]),
]);

if (asyncNames.size < 3) {
  fail(`مالقيتش غير ${asyncNames.size} دالة async — الصيغة اتغيّرت والفحص مش قادر يقيس.`);
  process.exit(1);
}

/* نداء في بداية سطر بمسافتين (نطاق registerRoutes) من غير await/void/return
 * ومن غير .catch أو .then على نفس السطر. */
const bare = [];
for (const m of src.matchAll(/^ {2}(\w+)\(\)\s*;\s*$/gm)) {
  const name = m[1];
  if (!asyncNames.has(name)) continue;
  bare.push([name, src.slice(0, m.index).split('\n').length]);
}
for (const [name, line] of bare) {
  fail(`\`${name}()\` بتتنادى في نطاق الإقلاع (سطر ${line}) من غير \`await\` ولا `
    + '`.catch(` — أي رفض منها بيطلع unhandledRejection **ويوقّع العملية كلها**، '
    + 'والموقع يفضل يقوم ويقع في حلقة.');
}

/* والـ`seedUsers` تحديداً لازم يكون معاها catch — دي اللي وقعت فعلاً. */
{
  const at = src.indexOf('seedUsers()');
  if (at < 0) {
    fail('`seedUsers()` مش موجودة — الاسم اتغيّر، حدّث الفحص بدل ما يعدّي أخضر.');
  } else {
    const after = src.slice(at, at + 200);
    if (!/\.catch\s*\(/.test(after) && !/^\s*await/.test(src.slice(Math.max(0, at - 10), at))) {
      fail('`seedUsers()` من غير `.catch(` — دي بالظبط اللي وقّعت التطبيق على '
        + 'الموقع الحي بخطأ قيد في القاعدة.');
    }
  }
}

/* ── التحقّق من هوية القاعدة قبل أي لمسة ليها ────────────────────────── */
{
  const idPath = path.join(APP, 'server/db-identity.ts');
  const indexPath = path.join(APP, 'server/index.ts');
  if (!fs.existsSync(idPath)) {
    fail('`server/db-identity.ts` مش موجود — من غيره التطبيق ممكن يشتغل على قاعدة '
      + 'تطبيق تاني وينشئ جداوله جوّاها. ده حصل فعلاً وقت النقل.');
  } else if (fs.existsSync(indexPath)) {
    const idx = strip(fs.readFileSync(indexPath, 'utf8'));
    const checkAt = idx.indexOf('checkDbIdentity');
    const schemaAt = idx.indexOf('ensureSchema()');
    if (checkAt < 0) {
      fail('`checkDbIdentity` مش متنادية في الإقلاع — الحماية موجودة ومحدّش بيستخدمها.');
    } else if (schemaAt >= 0 && checkAt > schemaAt) {
      fail('`checkDbIdentity` بتتنادى **بعد** `ensureSchema()` — والفحص اللي بييجي '
        + 'بعد ما الجداول اتعملت مالوش لازمة. لازم تكون أول حاجة.');
    }
    // ولازم بصمات التطبيقات التانية تفضل موجودة
    const idSrc = fs.readFileSync(idPath, 'utf8');
    // ونوع users.id لازم يفضل جزء من الفحص — ده أقوى من أسماء الجداول:
    // قاعدة ممكن ماتبقاش فيها بصمة معروفة وبرضه مش بتاعتنا.
    if (!/users/.test(idSrc) || !/information_schema\.columns/.test(idSrc)) {
      fail('فحص هوية القاعدة مابيبصّش لنوع `users.id` — الاعتماد على أسماء '
        + 'الجداول لوحده بيسيب قواعد مش معروفة تعدّي.');
    }
    for (const t of ['bible_verses', 'companies']) {
      if (!idSrc.includes(t)) {
        fail(`بصمة \`${t}\` اتشالت من فحص هوية القاعدة — التطبيق مش هيعرف إنه `
          + 'في قاعدة تطبيق تاني.');
      }
    }
  }
}

/* ── تسلسل الإقلاع نفسه لازم يكون عليه catch ─────────────────────────── */
{
  const indexPath = path.join(APP, 'server/index.ts');
  if (!fs.existsSync(indexPath)) {
    fail('`server/index.ts` مش موجود.');
  } else {
    const idx = strip(fs.readFileSync(indexPath, 'utf8'));
    const iife = /\}\)\(\)([\s\S]{0,40})/.exec(idx.slice(idx.lastIndexOf('})()')));
    const tail = idx.slice(idx.lastIndexOf('})()'));
    if (!/\}\)\(\)\s*\.catch\s*\(/.test(tail)) {
      fail('تسلسل الإقلاع `(async () => { … })()` من غير `.catch(` — أي فشل في '
        + '`ensureSchema` أو الزرع أو تسجيل الراوتات بيطلع unhandledRejection '
        + 'والعملية بتموت **قبل listen** برسالة مقصوصة. ده اللي خلّى التطبيق '
        + 'يقع ٦ مرات ورا بعض ومحدّش عارف أي جملة SQL وقعت.');
    }
    // ولازم يطبع تفاصيل خطأ بوستجرس، مش الرسالة القصيرة بس
    if (!/constraint/.test(tail) || !/detail/.test(tail)) {
      fail('`catch` الإقلاع مابيطبعش تفاصيل خطأ بوستجرس (`constraint` و`detail`) — '
        + 'من غيرها الرسالة بتقول «قيد اتكسر» من غير ما تقول أنهي قيد ولا أنهي صف.');
    }
  }
}

if (process.exitCode) process.exit(1);
console.log(`✅ شغل الإقلاع محمي: ${asyncNames.size} دالة async مفحوصة · `
  + 'مفيش نداء سايب في نطاق الإقلاع');
