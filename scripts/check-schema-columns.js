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
  for (const m of stripSqlComments(s).matchAll(
    /ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*)/gi)) {
    const t = m[1].toLowerCase();
    (cols[t] = cols[t] || new Set()).add(m[2].toLowerCase());
  }
}

const bad = [];
for (const f of files) {
  if (/schema\.js$/.test(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  for (const m of stripSqlComments(s).matchAll(/INSERT\s+INTO\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)/gi)) {
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
}

console.log(`tables: ${Object.keys(cols).length}`);
if (bad.length) {
  console.log(`\n❌ ${bad.length} column(s) inserted but never created:`);
  bad.forEach((b) => console.log('   ' + b));
} else {
  console.log('\n✅ كل أعمدة الـINSERT موجودة في المخطط.');
}
process.exit(bad.length ? 1 : 0);
