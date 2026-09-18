#!/usr/bin/env node
/**
 * ميزانية اتصالات بوستجرس للعمليتين مع بعض.
 *
 * ليه: القاعدة بقت على سوبابيز وليها سقف اتصالات. وفي المشروع ده **٨١
 * ملف** بيعمل `new Pool(...)` — وكل واحد افتراضيه ١٠ اتصالات، يعني ٨٠٠+
 * اتصال نظرياً. `src/lib/shared_pool.js` بيصلّحها عند حدود المكتبة: بيلفّ
 * `pg.Pool` فكل نداء لنفس رابط الاتصال بيرجّع **نفس** الحوض بسقف واحد.
 *
 * والفحص ده بيحمي تلات حاجات:
 *
 *   ١) **اللفّة لسه شغّالة** — بينفّذ `shared_pool` الحقيقي على `pg` وهمي
 *      ويتأكد إن نداءين بيرجّعوا نفس الكائن بنفس السقف. لو حد شال اللفّة
 *      أو نقل `require` بتاعها بعد أول `new Pool`، الـ٨١ ملف بيرجعوا ٨١
 *      حوض والقاعدة بتقول «sorry, too many clients already».
 *
 *   ٢) **`shared_pool` بيتحمّل قبل أي حوض** في server.js. حوض اتعمل قبل
 *      اللفّة بيفضل حوض مستقل من غير ما حد ياخد باله.
 *
 *   ٣) **المجموع تحت السقف.** أوسكار ديفز وmybible عمليتين منفصلتين على
 *      نفس قاعدة سوبابيز، وكل واحد بيقرا سقفه من متغيّر بيئة في `.replit`.
 *      المجموع لازم يسيب فسحة للنسخ الاحتياطي (pg_dump) ولمحرّر SQL في
 *      لوحة سوبابيز — دول بياخدوا اتصالات مش محسوبة في أي كود.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'src/lib/shared_pool.js');
const SERVER = path.join(ROOT, 'server.js');
const REPLIT = path.join(ROOT, '.replit');
const MYBIBLE_POOL = path.join(ROOT, 'mybible/server/db-pool.ts');

/* ⛔ السقف **١٥** مش ٤٥.
 *
 * كان مكتوب هنا ٤٥ على أساس «سوبابيز بيدّي ~٦٠ اتصال مباشر». ده غلط:
 * إحنا على **session pooler** مش اتصال مباشر، وسقفه أقل بكتير. رفعنا
 * الأحواض لـ20+12=32 واللوج رد:
 *
 *   error: (EMAXCONNSESSION) max clients reached in session mode
 *
 * وmybible بقى مش قادر يوصل للقاعدة أصلاً — يعني السقف الغلط في الفحص
 * ده عدّى إعداد بيوقّع موقع فيه ٧٠٠ عضو.
 *
 * ١٣ (8+5) هو اللي مثبوت إنه بيشتغل. بنسيب هامش لاتنين: النسخ الاحتياطي
 * (pg_dump) ومحرّر SQL في لوحة سوبابيز. */
const BUDGET = 15;

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

/* ── ١) اللفّة بتشتغل فعلاً ───────────────────────────────────────────── */
{
  const apply = require(SHARED);
  class FakePool {
    constructor(opts) { this.opts = opts; this.listeners = []; }
    on(ev, fn) { this.listeners.push([ev, fn]); }
    query() { return Promise.resolve({ rows: [] }); }
  }
  const fakePg = { Pool: FakePool };
  const prev = process.env.PG_POOL_MAX;
  process.env.PG_POOL_MAX = '17';
  try {
    apply(fakePg);
    const a = new fakePg.Pool({ connectionString: 'postgres://x/db' });
    const b = new fakePg.Pool({ connectionString: 'postgres://x/db' });
    const c = new fakePg.Pool({ connectionString: 'postgres://y/other' });

    if (a !== b) {
      fail('نداءين `new Pool()` لنفس رابط الاتصال رجّعوا حوضين مختلفين — '
        + 'اللفّة مش شغّالة، والـ٨١ ملف هيفتحوا ٨١ حوض.');
    }
    if (a === c) {
      fail('روابط اتصال مختلفة رجّعت نفس الحوض — ده بيوصّل استعلام لقاعدة غلط.');
    }
    const max = a && a.opts && a.opts.max;
    if (max !== 17) {
      fail(`الحوض المشترك سقفه ${max} والمفروض ياخد \`PG_POOL_MAX\` (١٧ في الاختبار) — `
        + 'السقف مش قابل للضبط، فمش هتقدر تزوّده وقت الزحمة.');
    }
    if (!a || typeof a.end !== 'function') {
      fail('`end()` مش متلغّي على الحوض المشترك — أول دالة سكيمة تقفله هتوقّع كل حاجة بعدها.');
    }
  } finally {
    if (prev === undefined) delete process.env.PG_POOL_MAX; else process.env.PG_POOL_MAX = prev;
  }
}

/* ── ٢) اللفّة بتتحمّل قبل أي حوض في server.js ───────────────────────── */
{
  const src = fs.readFileSync(SERVER, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  const applyAt = src.indexOf("require('./src/lib/shared_pool')");
  const firstPool = src.search(/new\s+\w*Pool\s*\(/);
  if (applyAt < 0) {
    fail('`server.js` مابيحمّلش `shared_pool` خالص.');
  } else if (firstPool >= 0 && firstPool < applyAt) {
    const line = src.slice(0, firstPool).split('\n').length;
    fail(`فيه \`new Pool()\` في server.js سطر ${line} **قبل** ما \`shared_pool\` يتحمّل — `
      + 'الحوض ده هيفضل مستقل بسقفه الافتراضي من غير ما حد ياخد باله.');
  }
}

/* ── ٣) المجموع تحت السقف ────────────────────────────────────────────── */
{
  const replit = fs.readFileSync(REPLIT, 'utf8');
  const read = (name, fallbackFile, fallbackRe) => {
    const m = new RegExp(`^${name}\\s*=\\s*"(\\d+)"`, 'm').exec(replit);
    if (m) return { value: parseInt(m[1], 10), from: '.replit' };
    const src = fs.readFileSync(fallbackFile, 'utf8');
    const d = fallbackRe.exec(src);
    return d ? { value: parseInt(d[1], 10), from: path.basename(fallbackFile) } : null;
  };

  const ads = read('PG_POOL_MAX', SHARED, /PG_POOL_MAX,\s*10\)\s*\|\|\s*(\d+)/);
  const mybible = read('MYBIBLE_PG_POOL_MAX', MYBIBLE_POOL, /MYBIBLE_PG_POOL_MAX \|\| "(\d+)"/);

  if (!ads) fail('مش قادر أقرا سقف حوض أوسكار ديفز.');
  if (!mybible) fail('مش قادر أقرا سقف حوض mybible.');

  if (ads && mybible) {
    const total = ads.value + mybible.value;
    if (total > BUDGET) {
      fail(`مجموع الأحواض ${total} اتصال (أوسكار ديفز ${ads.value} + mybible ${mybible.value}) `
        + `والسقف ${BUDGET}. سوبابيز هيرفض اتصالات، والنسخ الاحتياطي ومحرّر SQL `
        + 'مش هيلاقوا مكان. قلّل واحد منهم أو ارفع السقف بقرار.');
    }
    if (ads.value < 4) {
      fail(`حوض أوسكار ديفز ${ads.value} — قليل أوي حتى مع سقف سوبابيز.`);
    }
    if (!process.exitCode) {
      console.log(`✅ ميزانية الاتصالات: أوسكار ديفز ${ads.value} + mybible ${mybible.value} `
        + `= ${total} من ${BUDGET} · واللفّة بتجمع الـ٨١ حوض في واحد`);
    }
  }
}

if (process.exitCode) process.exit(1);
