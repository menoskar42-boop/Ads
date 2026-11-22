#!/usr/bin/env node
/**
 * صفحة مجموعة القراءة لازم تستحمّل إن كل الأعضاء يفتحوها في نفس اللحظة.
 *
 * السياق: درس مار مرقس فيه ~٧٠٠ عضو. لما الرابط بيتبعت في الجروب،
 * بيدخلوا في نفس الدقيقة. و`GET /api/groups/:code` بيعمل أربع استعلامات،
 * وواحد منهم كان بيسحب **كل** صفوف سجل القراءة من أول يوم ويعدّ في
 * الذاكرة. مع حوض اتصالات محدود، ده بيقع الصفحة — واللي بيظهر للعضو
 * «حدث خطأ في تحميل الصفحة».
 *
 * الفحص بيقيس أربع حاجات، كلها بتشغيل الكود الحقيقي مش بالبحث عن نص:
 *
 *   ١) **تجميع الطلبات**: ٧٠٠ نداء متزامن على `getOrLoad` بنفس المفتاح
 *      لازم يعملوا **تحميل واحد**. ولو التحميل فشل، الفشل مايتخزّنش.
 *   ٢) **الراوت بيستخدمه فعلاً** — كاش محدّش بيناديه مابيخفّفش حاجة.
 *   ٣) **الإلغاء بعد الكتابة مسجّل قبل الراوتات** — لو اتسجّل بعدها،
 *      العضو بيفضل شايف بيانات قديمة بعد ما يغيّر حاجة بنفسه.
 *   ٤) **مفيش سحب كامل لسجل القراءة** في بناء رد الصفحة.
 *
 * وكمان بيتأكد من قاعدة كاش المتصفّح (`sw.js` و`main.tsx`): كاش تحميل
 * الكتاب أوفلاين (`mybible-static-v1`) بيفضل، وأي كاش قشرة قديم بيتمسح.
 * الريجيكس اللي كان هناك كان بيسيب `mybible-v1` كمان — قشرة قديمة
 * بتفضل على أجهزة الناس للأبد وزرار «تحديث الصفحة» مش قادر ينضّفها.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYBIBLE = path.join(ROOT, 'mybible');
const CACHE = path.join(MYBIBLE, 'server/group-cache.ts');
const ROUTES = path.join(MYBIBLE, 'server/group-routes.ts');
const SW = path.join(MYBIBLE, 'client/public/sw.js');
const MAIN = path.join(MYBIBLE, 'client/src/main.tsx');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };
const notes = [];

if (!fs.existsSync(ROUTES)) {
  console.log('⏭️  mybible مش موجود هنا — مفيش حاجة تتفحص');
  process.exit(0);
}
if (!fs.existsSync(CACHE)) {
  fail('`server/group-cache.ts` مش موجود — تجميع الطلبات اتشال، و٧٠٠ عضو '
    + 'بيفتحوا مع بعض هيعملوا ٧٠٠ ضربة على القاعدة.');
  process.exit(1);
}

/* ── ١) تجميع الطلبات — بتشغيل الموديول الحقيقي ───────────────────────── */
{
  const probe = path.join(require('os').tmpdir(), `group-load-${process.pid}.mjs`);
  fs.writeFileSync(probe, `
const c = await import(${JSON.stringify('file://' + CACHE)});
const out = {};

let loads = 0;
const slow = () => { loads++; return new Promise((r) => setTimeout(() => r({ n: loads }), 25)); };
const burst = await Promise.all(Array.from({ length: 700 }, () => c.getOrLoad('G', slow)));
out.loadsForBurst = loads;
out.allSame = burst.every((x) => x.n === 1);

await c.getOrLoad('G', slow);
out.loadsAfterImmediateRepeat = loads;

c.invalidate('G');
await c.getOrLoad('G', slow);
out.loadsAfterInvalidate = loads;

let tries = 0;
try { await c.getOrLoad('E', () => { tries++; return Promise.reject(new Error('x')); }); } catch {}
try { await c.getOrLoad('E', () => { tries++; return Promise.resolve(1); }); } catch {}
out.retriedAfterFailure = tries === 2;

c.clearAll();
for (let i = 0; i < 1000; i++) await c.getOrLoad('k' + i, () => Promise.resolve(i));
out.boundedSize = c.size();

process.stdout.write('@@JSON@@' + JSON.stringify(out));
`, 'utf8');

  let r;
  try {
    const raw = execFileSync(process.execPath, ['--no-warnings', probe], { maxBuffer: 1 << 24 }).toString('utf8');
    fs.unlinkSync(probe);
    r = JSON.parse(raw.slice(raw.indexOf('@@JSON@@') + 8));
  } catch (e) {
    console.error('⚠️  مش قادر أشغّل group-cache.ts (محتاج Node ≥ 22.6):');
    console.error('    ' + String(e.stderr || e.message).split('\n').slice(0, 3).join('\n    '));
    process.exit(1);
  }

  if (r.loadsForBurst !== 1) {
    fail(`٧٠٠ طلب متزامن عملوا ${r.loadsForBurst} تحميل (المفروض ١) — `
      + 'التجميع مش شغّال، والقاعدة هتاخد الضربة كاملة.');
  }
  if (!r.allSame) fail('الطلبات المتزامنة رجعت نتايج مختلفة — التجميع بيرجّع بيانات مخلوطة.');
  if (r.loadsAfterImmediateRepeat !== 1) {
    fail(`طلب تاني على طول عمل تحميل جديد (${r.loadsAfterImmediateRepeat}) — العمر القصير مش شغّال.`);
  }
  if (r.loadsAfterInvalidate !== 2) {
    fail('`invalidate` ما ألغتش النسخة — العضو هيشوف بيانات قديمة بعد ما يغيّر حاجة بنفسه.');
  }
  if (!r.retriedAfterFailure) {
    fail('الفشل اتخزّن في الكاش — مجموعة وقعت مرة هتفضل واقعة لحد ما العمر يخلص.');
  }
  if (r.boundedSize > 400) {
    fail(`الكاش مش محدود: بعد ١٠٠٠ مجموعة فضل فيه ${r.boundedSize} — تسريب ذاكرة.`);
  }
  notes.push(`٧٠٠ طلب → ${r.loadsForBurst} استعلام`);
}

/* ── ٢–٤) الراوت بيستخدمه، والإلغاء قبله، ومفيش سحب كامل ─────────────── */
{
  const src = fs.readFileSync(ROUTES, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

  const getRoute = src.indexOf("app.get('/api/groups/:code'");
  if (getRoute < 0) {
    fail("مالقيتش `app.get('/api/groups/:code')` — الفحص مش قادر يقيس.");
  } else {
    const handler = src.slice(getRoute, getRoute + 900);
    if (!/getOrLoad\s*\(/.test(handler)) {
      fail('راوت المجموعة مابيستخدمش `getOrLoad` — الكاش موجود ومحدّش بيناديه.');
    }
  }

  const invalidateMw = src.indexOf("app.use('/api/groups/:code'");
  if (invalidateMw < 0) {
    fail('مفيش middleware بيلغي كاش المجموعة بعد الكتابة — العضو هيشوف بيانات قديمة '
      + 'بعد ما يسجّل قراءة أو يبعت رسالة.');
  } else if (getRoute >= 0 && invalidateMw > getRoute) {
    fail('middleware الإلغاء مسجّل **بعد** راوتات المجموعات — إكسبريس بينفّذ بالترتيب، '
      + 'فمش هيشوف الطلبات اللي الراوتات بتردّ عليها.');
  }

  // سحب كل سجل القراءة في بناء الرد
  const payload = /async function loadGroupPayload[\s\S]*?\n  \}/.exec(src);
  if (!payload) {
    fail('مالقيتش `loadGroupPayload` — يا إما اتشالت يا إما اتغيّر اسمها. حدّث الفحص.');
  } else if (/from\(groupReadingLogs\)/.test(payload[0])) {
    fail('بناء رد الصفحة بيسحب **كل** صفوف `group_reading_logs` للمجموعة ويعدّ في '
      + 'الذاكرة. لمجموعة فيها ٧٠٠ عضو دي مئات الآلاف من الصفوف على كل فتحة. '
      + 'استخدم COUNT في القاعدة.');
  }
}

/* ── ٥) قاعدة كاش المتصفّح: نفّذ الفلتر الحقيقي ──────────────────────── */
{
  const PRESENT = ['mybible-v1', 'mybible-static-v1', 'mybible-v2', 'mybible-static-v2',
    'mybible-v3', 'mybible-static-v3', 'other-app-cache'];

  const sw = fs.readFileSync(SW, 'utf8');
  const consts = {};
  for (const k of ['CACHE_NAME', 'STATIC_CACHE', 'OFFLINE_DOWNLOAD_CACHE']) {
    const m = new RegExp(`const ${k} = '([^']+)'`).exec(sw);
    if (m) consts[k] = m[1];
  }
  if (!consts.OFFLINE_DOWNLOAD_CACHE) {
    fail('`sw.js` مافيهوش `OFFLINE_DOWNLOAD_CACHE` باسم صريح — القاعدة راجعت لريجيكس '
      + 'على رقم النسخة، وده اللي سابّ `mybible-v1` على أجهزة الناس للأبد.');
  }

  const filt = /\.filter\(function\s*\(key\)\s*\{([\s\S]*?)\}\)\s*\n\s*\.map/.exec(sw);
  if (!filt) {
    fail('مش لاقي فلتر تنضيف الكاش في `sw.js` — الفحص مش قادر ينفّذه.');
  } else {
    let deleted;
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('CACHE_NAME', 'STATIC_CACHE', 'OFFLINE_DOWNLOAD_CACHE', 'key',
        filt[1]);
      deleted = PRESENT.filter((k) =>
        fn(consts.CACHE_NAME, consts.STATIC_CACHE, consts.OFFLINE_DOWNLOAD_CACHE, k));
    } catch (e) {
      fail('فلتر الكاش في sw.js مش قادر يتنفّذ: ' + e.message);
      deleted = null;
    }
    if (deleted) {
      if (deleted.includes('mybible-static-v1')) {
        fail('`mybible-static-v1` بيتمسح — ده تحميل الكتاب أوفلاين اللي المستخدم '
          + 'نزّله بإيده (بتتكتب فيه من useOfflineSync.ts وGroupView.tsx). مايتمسحش.');
      }
      if (!deleted.includes('mybible-v1')) {
        fail('`mybible-v1` مابيتمسحش — ده كاش القشرة القديم مش تحميل الكتاب. '
          + 'لو فضل، القشرة القديمة بتعيش على جهاز العضو وزرار «تحديث الصفحة» '
          + 'مش قادر ينضّفها.');
      }
      if (deleted.includes('other-app-cache')) {
        fail('الفلتر بيمسح كاشات مش بتاعة mybible — الموقع مستضاف جنب أوسكار ديفز.');
      }
      notes.push(`تنضيف الكاش: ${deleted.length} اتمسحوا`);
    }
  }

  // main.tsx لازم يمشي بنفس القاعدة
  const main = fs.readFileSync(MAIN, 'utf8');
  const mf = /\.filter\(\(name\) =>([^)]*\)[^)]*|[^)]*)\)/.exec(main);
  if (!mf) {
    fail('مش لاقي فلتر التنضيف في `main.tsx`.');
  } else {
    let del;
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('name', 'return (' + mf[1].trim() + ');');
      del = PRESENT.filter((k) => fn(k));
    } catch (e) { fail('فلتر main.tsx مش قادر يتنفّذ: ' + e.message); del = null; }
    if (del) {
      if (del.includes('mybible-static-v1')) {
        fail('زرار «تحديث الصفحة» بيمسح تحميل الكتاب أوفلاين — ده شغل المستخدم، مايتمسحش.');
      }
      if (!del.includes('mybible-v1')) {
        fail('زرار «تحديث الصفحة» مش بيمسح `mybible-v1` — يعني مش قادر يصلّح '
          + 'القشرة القديمة اللي هو موجود عشانها أصلاً.');
      }
    }
  }
}

if (process.exitCode) process.exit(1);
console.log('✅ صفحة المجموعة تستحمّل الزحمة: ' + notes.join(' · '));
