#!/usr/bin/env node
/**
 * الاتصال بالقاعدة يفضل دافي — وفتحه من جديد غالي.
 *
 * القياس من `/api/health` على الموقع الحي، نفس اليوم، مرتين:
 *
 *     pingMs 105   ← لما يكون فيه اتصال مفتوح (total:1)
 *     pingMs 806   ← لما الحوض اضطر يفتح اتصال جديد (total:2)
 *
 * الفرق ~٧٠٠ مللي هو مصافحة TLS + المصادقة على مسافة قارة — تكلفة
 * بتتدفع مرة على كل اتصال جديد. وبـ`idleTimeoutMillis` = ٣٠ ثانية، أي
 * هدوء نص دقيقة كان بيقفل الاتصالات، فأول زائر بعد الهدوء يدفع ٨٠٠ مللي.
 * ده بالظبط إحساس «الموقع بطيء أول ما أفتحه وبعدين بيبقى عادي».
 *
 * الفحص بيتأكد إن الحوضين (أوسكار ديفز وmybible) بيسيبوا الاتصال مفتوح
 * فترة معقولة وإن `keepAlive` مفعّل — وإن `connectionTimeoutMillis` أكبر
 * من زمن فتح اتصال حقيقي، وإلا الاتصال البارد بيترمي قبل ما يكمّل.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

/** أقل عمر خمول مقبول: الهدوء العادي في الموقع أطول من دقيقة بكتير. */
const MIN_IDLE_MS = 5 * 60 * 1000;
/** لازم يكون أكبر من ~٨٠٠ مللي بهامش — الاتصال البارد بياخدها. */
const MIN_CONNECT_TIMEOUT_MS = 5000;

const POOLS = [
  { name: 'أوسكار ديفز', file: 'src/lib/shared_pool.js' },
  { name: 'mybible', file: 'mybible/server/db-pool.ts' },
];

/** بيحوّل تعبير زي `10 * 60_000` لرقم، من غير eval على كود عشوائي. */
function evalMs(expr) {
  const clean = String(expr).replace(/_/g, '').trim();
  if (!/^[\d\s*+()]+$/.test(clean)) return NaN;
  try { return Function(`"use strict";return (${clean});`)(); } catch { return NaN; }
}

for (const pool of POOLS) {
  const full = path.join(ROOT, pool.file);
  if (!fs.existsSync(full)) { fail(`${pool.file} مش موجود.`); continue; }
  const src = fs.readFileSync(full, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

  const idle = /idleTimeoutMillis:\s*([^,\n]+)/.exec(src);
  if (!idle) {
    fail(`${pool.name}: مفيش \`idleTimeoutMillis\` — الافتراضي في pg عشر ثواني، `
      + 'يعني كل زائر تقريباً هيدفع تكلفة فتح اتصال جديد.');
  } else {
    const ms = evalMs(idle[1]);
    if (!Number.isFinite(ms)) {
      fail(`${pool.name}: مش قادر أقرا \`idleTimeoutMillis\` (${idle[1].trim()}).`);
    } else if (ms !== 0 && ms < MIN_IDLE_MS) {
      fail(`${pool.name}: \`idleTimeoutMillis\` = ${ms} مللي — أي هدوء أطول من كده `
        + 'بيقفل الاتصال، وأول زائر بعده بيدفع ~٨٠٠ مللي مصافحة. '
        + `الحد ${MIN_IDLE_MS} مللي.`);
    }
  }

  if (!/keepAlive:\s*true/.test(src)) {
    fail(`${pool.name}: \`keepAlive\` مش مفعّل — أي وسيط في الشبكة يقدر يقفل `
      + 'السوكيت وهو ساكت، والاتصال «المفتوح» بيبقى ميّت من غير ما نعرف.');
  }

  const ct = /connectionTimeoutMillis:\s*([^,\n]+)/.exec(src);
  if (ct) {
    const ms = evalMs(ct[1]);
    if (Number.isFinite(ms) && ms < MIN_CONNECT_TIMEOUT_MS) {
      fail(`${pool.name}: \`connectionTimeoutMillis\` = ${ms} مللي، والاتصال البارد `
        + 'لوحده بياخد ~٨٠٠. المهلة القصيرة بترمي الاتصال قبل ما يكمّل فتحدث '
        + 'أخطاء متقطّعة مالهاش تفسير.');
    }
  }
}

if (process.exitCode) process.exit(1);
console.log(`✅ الاتصالات بتفضل دافية: ${POOLS.length} حوض · عمر خمول ≥ ${MIN_IDLE_MS / 60000} دقايق · keepAlive مفعّل`);
