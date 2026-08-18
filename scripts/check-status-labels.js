#!/usr/bin/env node
/**
 * The customer who was told his order was `status.out_for_delivery`.
 *
 * `t()` returns the KEY when a key is missing. That is the right thing for a
 * missing button label — somebody notices — and the wrong thing here, because
 * the page still renders, still looks finished, and prints a developer's
 * identifier into the one sentence a customer actually reads. The shop had
 * seven order states and the dictionary named five of them.
 *
 * The three flows are deliberately separate — a pharmacy says «قيد التحضير»
 * where a restaurant says «بيتجهّز» — so the fix is not one shared list. It is
 * that **every state any flow can reach has a name in every dictionary that
 * might be asked to print it**, in both languages.
 *
 * The check reads the flows OUT OF THE CODE rather than repeating them here.
 * Add a state to a flow next year and this goes red until somebody writes the
 * two sentences the customer will see.
 *
 *   node scripts/check-status-labels.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const S = require('../src/i18n/strings');
/* The dictionaries themselves, not `t()`: `t()` falls back to English when an
   Arabic key is missing, so a missing Arabic name would show as an English
   word on an Arabic page — a quieter version of the same bug, and invisible to
   any check that asks `t()`. */
const DICT = S.strings;

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── Every state any flow can reach, read out of the flows ─────────────── */
const FLOWS = [];
for (const f of fs.readdirSync(path.join(ROOT, 'src/routes')).filter((x) => x.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(ROOT, 'src/routes', f), 'utf8');
  const re = /const (\w*(?:FLOW|STATUSES))\s*=\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(src))) {
    const values = (m[2].match(/'([a-z_]+)'/g) || []).map((v) => v.slice(1, -1));
    if (values.includes('pending')) FLOWS.push({ file: f, name: m[1], values });
  }
}
check('لقيت مسارات الحالات في الكود', FLOWS.length >= 3,
  FLOWS.map((f) => f.file + ':' + f.name).join(' · '));

const ALL = [...new Set(FLOWS.flatMap((f) => f.values))].sort();
check('والاتحاد فيه الحالات اللي البند ده عنها',
  ALL.includes('preparing') && ALL.includes('out_for_delivery'), ALL.join(' '));

/* ── Which dictionaries a template can ask ─────────────────────────────── */
const PREFIXES = new Set();
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.ejs')) {
      const src = fs.readFileSync(p, 'utf8');
      const re = /t\('([a-z_.]*?)status\.'\s*\+/g;
      let m;
      while ((m = re.exec(src))) PREFIXES.add(m[1] + 'status');
    }
  }
};
walk(path.join(ROOT, 'src/views'));
check('ولقيت القواميس اللي القوالب بتسألها', PREFIXES.size >= 3, [...PREFIXES].join(' · '));

/* ── Every state, in every dictionary, in both languages ───────────────── */
{
  const holes = [];
  for (const prefix of PREFIXES) {
    for (const st of ALL) {
      for (const lang of ['ar', 'en']) {
        const key = prefix + '.' + st;
        if (!DICT[lang] || !DICT[lang][key]) holes.push(key + '/' + lang);
      }
    }
  }
  check('كل حالة ليها اسم في كل قاموس وباللغتين', holes.length === 0,
    holes.slice(0, 12).join(' · ') || `${PREFIXES.size} × ${ALL.length} × ٢ مفتاح`);
}

/* ── And the name is a name, not the key wearing a hat ──────────────────── */
{
  const echoes = [];
  for (const prefix of PREFIXES) {
    for (const st of ALL) {
      for (const lang of ['ar', 'en']) {
        const v = (DICT[lang] || {})[prefix + '.' + st] || '';
        if (/status\.|_/.test(v)) echoes.push(prefix + '.' + st + '/' + lang + '=' + v);
      }
    }
  }
  check('ومفيش ترجمة فيها المفتاح نفسه', echoes.length === 0, echoes.slice(0, 6).join(' · ') || 'ولا واحدة');
}

console.log(fail
  ? `\n${fail} مشكلة — يعني عميل ممكن يقرا «status.out_for_delivery» بدل «خرج للتوصيل».`
  : '\nكل حالة طلب ليها اسم يتقري، في كل قاموس، بالعربي والإنجليزي.');
process.exit(fail ? 1 : 0);
