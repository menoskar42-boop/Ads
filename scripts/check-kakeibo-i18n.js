#!/usr/bin/env node
/**
 * Guard the KAKEIBO dictionary — the one `check-i18n.js` does not look at.
 *
 * check-i18n.js validates `src/i18n/strings` (the OscarDevs site). Kakeibo keeps
 * its own dictionary in `src/kakeibo/i18n.js`, and nothing was checking it: a key
 * added to the Arabic block and forgotten in the English one renders Arabic on an
 * English screen, and a `t('…')` key that exists in neither renders the raw key
 * ("dash.remaining") to the user. Both are silent.
 *
 * `render-kakeibo-pages.js` catches some of this, but it needs `ejs` installed —
 * so on a machine without node_modules there was no check at all. This one has
 * no dependencies on purpose: `src/kakeibo/i18n.js` is plain data.
 *
 * It also balances the EJS delimiters and scriptlet braces in the kakeibo
 * templates, which is the part of "does it still render?" that can be answered
 * without a template engine.
 *
 *   node scripts/check-kakeibo-i18n.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { STR } = require(path.join(ROOT, 'src/kakeibo/i18n'));

let problems = 0;
const fail = (msg) => { problems++; console.error('❌ ' + msg); };

/* ── 1) ar / en parity ─────────────────────────────────── */
const arKeys = new Set(Object.keys(STR.ar || {}));
const enKeys = new Set(Object.keys(STR.en || {}));
const all = new Set([...arKeys, ...enKeys]);
for (const [lang, keys] of [['ar', arKeys], ['en', enKeys]]) {
  const missing = [...all].filter((k) => !keys.has(k));
  if (missing.length) {
    fail(`${lang}: ناقص ${missing.length} مفتاح`);
    missing.slice(0, 20).forEach((k) => console.error('   - ' + k));
  } else {
    console.log(`✅ ${lang}: ${keys.size} مفتاح، مكتمل`);
  }
}

// An English value that carries Arabic letters is a copy-paste that will show
// Arabic to an English reader — the exact leak render-kakeibo-pages hunts for,
// caught here at the source instead of in the output.
const ARABIC = /[\u0600-\u06FF]/;
const leaked = Object.entries(STR.en || {}).filter(([, v]) => typeof v === 'string' && ARABIC.test(v));
if (leaked.length) fail(`en: ${leaked.length} قيمة فيها حروف عربية — ${leaked.slice(0, 5).map(([k]) => k).join(', ')}`);
else console.log('✅ en: مفيش حروف عربية في البلوك الإنجليزي');

// A {placeholder} present in one language and missing in the other means the
// number simply vanishes from that translation — "You have logged of 5" — and
// nothing else would notice, because both strings exist and both render.
const holders = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const mismatched = [...arKeys].filter((k) => enKeys.has(k) && holders(STR.ar[k]) !== holders(STR.en[k]));
if (mismatched.length) {
  fail(`${mismatched.length} مفتاح المتغيّرات فيه مختلفة بين العربي والإنجليزي`);
  mismatched.slice(0, 10).forEach((k) => console.error(`   - ${k}: ar[${holders(STR.ar[k])}] en[${holders(STR.en[k])}]`));
} else {
  console.log('✅ المتغيّرات {…} متطابقة في اللغتين');
}

/* ── 2) every literal t('…') key exists ────────────────── */
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ejs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(path.join(ROOT, 'src/views/kakeibo'), [])
  .concat(walk(path.join(ROOT, 'src/kakeibo'), []).filter((f) => !/i18n\.js$/.test(f)));

// Only literal keys: t('x'), t("x"), t('x', { n: 5 }). A concatenated key
// (t('cat.' + k)) is resolved at runtime and is checked by the prefix rule
// below instead. The trailing [,)] is what admits the interpolating form —
// without it, every t('key', vars) call silently escaped validation.
const LITERAL = /\bt\(\s*(['"])([a-z0-9_.]+)\1\s*[,)]/gi;
const CONCAT = /\bt\(\s*(['"])([a-z0-9_]+\.)\1\s*\+/gi;
const usedKeys = new Map();      // key -> first file that used it
const usedPrefixes = new Map();  // 'cat.' -> first file
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  let m;
  LITERAL.lastIndex = 0;
  while ((m = LITERAL.exec(src))) if (!usedKeys.has(m[2])) usedKeys.set(m[2], f);
  CONCAT.lastIndex = 0;
  while ((m = CONCAT.exec(src))) if (!usedPrefixes.has(m[2])) usedPrefixes.set(m[2], f);
}
const unknown = [...usedKeys].filter(([k]) => !arKeys.has(k) || !enKeys.has(k));
if (unknown.length) {
  fail(`${unknown.length} مفتاح مستخدم في القوالب ومش في القاموس`);
  unknown.slice(0, 20).forEach(([k, f]) => console.error(`   - ${k}  (${path.relative(ROOT, f)})`));
} else {
  console.log(`✅ كل مفاتيح t() الحرفية موجودة (${usedKeys.size} مفتاح)`);
}
// A dynamic prefix with nothing behind it means a whole family renders raw.
for (const [pre, f] of usedPrefixes) {
  const n = [...arKeys].filter((k) => k.startsWith(pre)).length;
  if (!n) fail(`t('${pre}' + …) في ${path.relative(ROOT, f)} ومفيش أي مفتاح بيبدأ بـ${pre}`);
}

/* ── 3) the templates are structurally whole ───────────── */
// Not "does it render" — that needs ejs. This is the subset that can be decided
// statically: every <% has a %>, and the scriptlet braces close.
function stripStrings(code) {
  return code.replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
for (const f of files.filter((x) => x.endsWith('.ejs'))) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f);
  const opens = (src.match(/<%/g) || []).length;
  const closes = (src.match(/%>/g) || []).length;
  if (opens !== closes) { fail(`${rel}: ${opens} من «<%» مقابل ${closes} من «%>»`); continue; }
  let depth = 0, bad = false;
  const RE = /<%[-_=#]?([\s\S]*?)[-_]?%>/g;
  let m;
  while ((m = RE.exec(src))) {
    // A comment scriptlet (<%# … %>) is prose, not code.
    if (src.slice(m.index, m.index + 3) === '<%#') continue;
    for (const ch of stripStrings(m[1])) {
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth < 0) { bad = true; break; } }
    }
    if (bad) break;
  }
  if (bad || depth !== 0) fail(`${rel}: أقواس الـscriptlet مش متوازنة (الرصيد ${depth})`);
}
if (!problems) console.log(`✅ ${files.filter((x) => x.endsWith('.ejs')).length} قالب: الوسوم والأقواس متوازنة`);

if (problems) {
  console.error('\nقاموس كاكيبو أو قوالبه فيهم مشكلة — أي مفتاح لازم يكون في البلوكين (ar و en).');
  process.exit(1);
}
console.log('\nقاموس كاكيبو وقوالبه سليمين.');
