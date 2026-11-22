#!/usr/bin/env node
/**
 * A setting that silently did the opposite of what it said.
 *
 * `SELECT notify_orders AS on FROM companies` — `on` is a reserved word in
 * PostgreSQL (it is the JOIN keyword), so that query was a syntax error EVERY
 * time it ran. It sat inside a try/catch that failed OPEN and sent the
 * notification anyway. So the merchant who switched order alerts off kept
 * getting them, the preference screen kept showing "off", and no error ever
 * reached anybody: the only trace was a console line on a server nobody reads.
 *
 * The failure mode is what makes this worth a check of its own. A query that
 * throws loudly gets fixed the same day. A query that throws into a catch which
 * was written for a different purpose can be wrong for a year.
 *
 * So: no SQL alias may be a fully-reserved PostgreSQL keyword. Those are the
 * ones that cannot follow AS at all — the rest are legal and this does not
 * police style.
 *
 *   node scripts/check-sql-reserved.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* PostgreSQL's fully-reserved words: illegal as a bare alias even after AS.
 * (Words like LEFT and OVER are "reserved (can be function or type name)" and
 * ARE legal as an alias, so they are deliberately not here — a check that
 * flags legal code gets switched off.) */
const RESERVED = new Set(['all', 'analyse', 'analyze', 'and', 'any', 'array', 'as', 'asc',
  'asymmetric', 'both', 'case', 'cast', 'check', 'collate', 'column', 'constraint', 'create',
  'default', 'deferrable', 'desc', 'distinct', 'do', 'else', 'end', 'except', 'false', 'fetch',
  'for', 'foreign', 'from', 'grant', 'group', 'having', 'in', 'initially', 'intersect', 'into',
  'lateral', 'leading', 'limit', 'localtime', 'localtimestamp', 'not', 'null', 'offset', 'on',
  'only', 'or', 'order', 'placing', 'primary', 'references', 'returning', 'select',
  'session_user', 'some', 'symmetric', 'table', 'then', 'to', 'trailing', 'true', 'union',
  'unique', 'user', 'using', 'variadic', 'when', 'where', 'window', 'with']);

/**
 * Comments are stripped first. The codebase explains itself in English, and
 * English says "as in", "as not", "as having" all the time — scanning prose as
 * SQL is how a check earns a reputation for crying wolf. (This exact trap has
 * already bitten three checks in this repo.)
 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
    .replace(/([^:])\/\/.*$/gm, '$1');
}

const offenders = [];
const walk = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== 'node_modules') walk(full); continue; }
    if (!f.name.endsWith('.js')) continue;
    let src;
    try { src = fs.readFileSync(full, 'utf8'); } catch (e) { continue; }
    const code = stripComments(src);
    for (const m of code.matchAll(/\bAS\s+([A-Za-z_][A-Za-z_0-9]*)/g)) {
      // Quoted aliases are fine — "on" is legal, on is not.
      if (RESERVED.has(m[1].toLowerCase())) {
        const line = code.slice(0, m.index).split('\n').length;
        offenders.push(path.relative(ROOT, full) + ':' + line + ' → AS ' + m[1]);
      }
    }
  }
};
walk(path.join(ROOT, 'src'));
{
  const code = stripComments(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'));
  for (const m of code.matchAll(/\bAS\s+([A-Za-z_][A-Za-z_0-9]*)/g)) {
    if (RESERVED.has(m[1].toLowerCase())) {
      offenders.push('server.js:' + code.slice(0, m.index).split('\n').length + ' → AS ' + m[1]);
    }
  }
}

check('مفيش اسم مستعار بكلمة محجوزة في PostgreSQL', offenders.length === 0,
  offenders.join(' | ') || 'ولا واحد');

/* ── The one that was live ─────────────────────────────────────────────── */
{
  const push = fs.readFileSync(path.join(ROOT, 'src/lib/push.js'), 'utf8');
  const code = stripComments(push);
  check('وتفضيل الإشعارات بقى باسم مش كلمة محجوزة', /AS enabled FROM companies/.test(code));
  check('والقراءة بتقرا نفس الاسم', /pref\.rows\[0\]\.enabled === false/.test(code));
  // The column name is a literal from this file, never user input — stated so
  // the interpolation is not mistaken for an injection later.
  check('واسم العمود ثابت من الملف مش من المستخدم',
    /const col = type === 'order' \? 'notify_orders' : 'notify_messages';/.test(code));
}

console.log(fail
  ? `\n${fail} مشكلة — استعلام بيرمي خطأ في صمت، والإعداد بيعمل عكس اللي المستخدم طلبه.`
  : '\nمفيش كلمة محجوزة كاسم مستعار — الإعدادات بتعمل اللي بتقوله.');
process.exit(fail ? 1 : 0);
