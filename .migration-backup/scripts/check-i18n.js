#!/usr/bin/env node
/**
 * Guard the translation dictionary.
 *
 * t() falls back to English when a key is missing in the requested language.
 * That is a sensible default for a half-finished translation, but it means a
 * key added to `en` and forgotten in `ar` shows an ARABIC clinic an ENGLISH
 * label — with no error, no warning, and nothing in review to notice. That
 * exact mistake happened while adding the clinical terminology.
 *
 * A key missing from `en` is milder (the raw key renders) but still wrong.
 *
 *   node scripts/check-i18n.js
 */
'use strict';
const { strings, SUPPORTED } = require('../src/i18n/strings');

const langs = SUPPORTED && SUPPORTED.length ? SUPPORTED : Object.keys(strings);
const keysBy = {};
for (const l of langs) keysBy[l] = new Set(Object.keys(strings[l] || {}));

const all = new Set();
for (const l of langs) for (const k of keysBy[l]) all.add(k);

let problems = 0;
for (const l of langs) {
  const missing = [...all].filter((k) => !keysBy[l].has(k));
  if (missing.length) {
    problems += missing.length;
    console.error(`❌ ${l}: ناقص ${missing.length} مفتاح`);
    missing.slice(0, 20).forEach((k) => console.error('   - ' + k));
    if (missing.length > 20) console.error(`   … و${missing.length - 20} غيرهم`);
  } else {
    console.log(`✅ ${l}: ${keysBy[l].size} مفتاح، مكتمل`);
  }
}

// An Arabic value that is pure ASCII is usually an untranslated copy-paste.
// Product names and abbreviations are legitimate, so this only warns.
if (strings.ar) {
  const suspicious = Object.entries(strings.ar)
    .filter(([, v]) => typeof v === 'string' && v.trim() && !/[؀-ۿ]/.test(v))
    .filter(([k]) => !/^(common\.|.*\.(id|url|api)$)/.test(k))
    .map(([k, v]) => `${k} = "${v}"`);
  if (suspicious.length) {
    console.warn(`\n⚠️  ${suspicious.length} قيمة عربية من غير حروف عربية (راجعها — ممكن تكون منسوخة من الإنجليزي):`);
    suspicious.slice(0, 15).forEach((s) => console.warn('   - ' + s));
  }
}

if (problems) {
  console.error('\nكل مفتاح لازم يكون موجود في كل اللغات — الناقص في العربي بيظهر إنجليزي من غير ما حد ياخد باله.');
  process.exit(1);
}
console.log('\nالقاموس متسق.');
