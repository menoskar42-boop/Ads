#!/usr/bin/env node
/**
 * Cross-check every INSERT's column list against the schema this app creates.
 *
 * A column named in an INSERT that no CREATE TABLE or ALTER TABLE declares is a
 * 500 the first time a real person submits that form — Postgres rejects it, and
 * nothing before runtime says a word. Renaming a column in the schema and
 * missing one call site is exactly how it happens.
 *
 * Usage: node scripts/check-schema-columns.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// SQL line comments must go BEFORE the column list is split on commas: a
// comment like "-- Copied, not joined: …" contains a comma, and splitting first
// tore it in half, swallowing the column declared on the next line and
// inventing two columns named after words inside the prose.
const stripSqlComments = (s) => s.replace(/--[^\n]*/g, '');

const files = walk(path.join(ROOT, 'src')).concat([path.join(ROOT, 'server.js')]);

const cols = {};
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\n\s*\)/g)) {
    const t = m[1].toLowerCase();
    cols[t] = cols[t] || new Set();
    const body = stripSqlComments(m[2]);
    // Split on commas at paren depth 0 — NUMERIC(5,1) and REFERENCES x(id)
    // both contain commas that do not separate columns.
    let depth = 0, cur = '';
    const parts = [];
    for (const ch of body) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    for (const part of parts) {
      const c = /^\s*([a-z_][a-z0-9_]*)\s+[A-Za-z]/.exec(part);
      if (c && !/^(primary|unique|foreign|constraint|check)$/i.test(c[1])) {
        cols[t].add(c[1].toLowerCase());
      }
    }
  }
  /* جملة الـALTER الواحدة بتضيف **أكتر من عمود** مفصولين بفاصلة:
   *
   *     ALTER TABLE workshop_messages
   *       ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
   *       ADD COLUMN IF NOT EXISTS campaign_id BIGINT,
   *       ADD COLUMN IF NOT EXISTS provider_status TEXT;
   *
   * النسخة الأولى كانت `ALTER TABLE (\w+) … ADD COLUMN (\w+)` — فبتاخد
   * **أول عمود بس**، والباقي مالوش `ALTER TABLE` قبله فمابيتلقطش. النتيجة
   * إن الحارس بيقول عن أعمدة موجودة فعلاً إنها ناقصة: أربعتاشر عمود
   * اتبلّغوا غلط، وكلهم متضافين صح. وحارس بيفشّل شغل سليم بيعلّم اللي
   * بعده إن الأحمر مالوش معنى.
   *
   * فبناخد جملة الـALTER كلها لحد `;` الأول، وبعدين كل `ADD COLUMN`
   * جوّاها بتتنسب للجدول اللي في أولها. */
  for (const stmt of stripSqlComments(s).matchAll(/ALTER TABLE\s+(\w+)\s+([\s\S]*?);/gi)) {
    const t = stmt[1].toLowerCase();
    for (const c of stmt[2].matchAll(
      /ADD COLUMN\s+(?:IF NOT EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
      (cols[t] = cols[t] || new Set()).add(c[1].toLowerCase());
    }
  }
}

const bad = [];
for (const f of files) {
  if (/schema\.js$/.test(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  const clean = stripSqlComments(s);

  // 1. INSERT column lists.
  for (const m of clean.matchAll(/INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
    const t = m[1].toLowerCase();
    if (!cols[t]) continue;               // not a table this app creates
    for (const raw of m[2].split(',')) {
      const c = raw.trim().replace(/["`]/g, '').toLowerCase();
      if (!c || !/^[a-z_][a-z0-9_]*$/.test(c)) continue;
      if (cols[t].has(c)) continue;
      const line = s.slice(0, m.index).split('\n').length;
      bad.push(`${path.relative(ROOT, f)}:${line}  INSERT INTO ${t} → "${c}" not in the schema`);
    }
  }

  // 2. Single-table SELECT / UPDATE / DELETE bodies.
  //
  // Checking only INSERT is what let contact_messages.is_spam ship: the column
  // appeared in a WHERE clause, never in an insert, so nothing looked at it and
  // /company/messages was a 500 for every merchant on a fresh database.
  //
  // Restricted to statements naming exactly one of our tables — with a join,
  // a bare column name cannot be attributed to a table without a real parser,
  // and guessing produces noise nobody reads.
  const STMT = /\b(?:SELECT|UPDATE|DELETE)\b[\s\S]{0,900}?(?=;|`|'|"|$)/gi;
  for (const stmt of clean.match(STMT) || []) {
    const named = [...stmt.matchAll(/\b(?:FROM|UPDATE|JOIN)\s+([a-z_][a-z0-9_]*)/gi)]
      .map((x) => x[1].toLowerCase());
    const ours = [...new Set(named)].filter((t) => cols[t]);
    if (ours.length !== 1 || named.length !== 1) continue;   // skip joins entirely
    const t = ours[0];
    // Identifiers that sit where a column goes: after WHERE/AND/SET/ORDER BY,
    // immediately followed by a comparison or assignment.
    // Strip ::type casts first — "$3::int IS NULL" put the cast's type where a
    // column name goes and the check reported a column called "int".
    const noCasts = stmt.replace(/::\s*[a-z_][a-z0-9_]*(\s*\[\s*\])?/gi, ' ');
    const ids = new Set();
    for (const c of noCasts.matchAll(/\b([a-z_][a-z0-9_]*)\s*(?:=|<>|!=|>=|<=|>|<|\bIS\b|\bILIKE\b|\bLIKE\b)/gi)) {
      ids.add(c[1].toLowerCase());
    }
    for (const c of ids) {
      if (cols[t].has(c)) continue;
      // SQL keywords, functions and bind markers are not columns.
      if (/^(select|from|where|and|or|not|null|true|false|set|values|order|by|group|having|limit|offset|as|on|case|when|then|else|end|coalesce|count|sum|max|min|avg|now|current_date|current_timestamp|interval|date|text|integer|numeric|boolean|distinct|exists|in|between|asc|desc|nulls|first|last|filter|over|returning|conflict|do|update|delete|insert|into|join|left|right|inner|outer|using|with|all|any|some|cast|extract|trim|lower|upper|length|char_length|to_char|to_date|greatest|least|abs|round|floor|ceil|nullif|array|row|json|jsonb|string_agg|array_agg|regexp_replace|split_part|position|substring|replace|concat|md5|random|uuid)$/i.test(c)) continue;
      if (/^\$\d+$/.test(c)) continue;
      const at = s.indexOf(stmt.slice(0, 40));
      const line = at > 0 ? s.slice(0, at).split('\n').length : 0;
      bad.push(`${path.relative(ROOT, f)}:${line}  ${t} → "${c}" not in the schema`);
    }
  }
}

console.log(`tables: ${Object.keys(cols).length}`);
if (bad.length) {
  console.log(`\n❌ ${bad.length} column(s) inserted but never created:`);
  bad.forEach((b) => console.log('   ' + b));
} else {
  console.log('\n✅ كل أعمدة الـINSERT موجودة في المخطط.');
}
process.exit(bad.length ? 1 : 0);
