#!/usr/bin/env node
/**
 * Guard against a specific, silent schema bug.
 *
 * Each schema file sends its DDL as ONE multi-statement string. Postgres runs
 * those in order, so an `ALTER TABLE x` placed above `CREATE TABLE x` throws —
 * and everything after it in that string never executes. On a database where
 * the table already exists it works fine, so the bug only appears on a FRESH
 * database, long after the code was written, as a pile of missing tables.
 *
 * That is exactly how it reached production: the ALTER looked harmless because
 * every existing deployment already had the table.
 *
 *   node scripts/check-schema-order.js     # exits non-zero if anything is wrong
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'server.js',
  'src/clinic/schema.js',
  'src/pharmacy/schema.js',
  'src/food/schema.js',
  'src/gym/schema.js',
  'src/kakeibo/schema.js',
  'src/accounting/schema.js',
  'src/radiology/schema.js',
  'src/furniture/schema.js',
  'src/nutrition/schema.js',
];

let problems = 0;

for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');

  // First position each table is created at.
  const creates = new Map();
  for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) {
    if (!creates.has(m[1])) creates.set(m[1], m.index);
  }

  const issues = [];
  const check = (re, kind) => {
    for (const m of src.matchAll(re)) {
      const table = m[1];
      if (!creates.has(table)) continue;           // created elsewhere — not our call
      if (m.index < creates.get(table)) {
        const line = src.slice(0, m.index).split('\n').length;
        issues.push(`${rel}:${line} — ${kind} على "${table}" قبل إنشائه`);
      }
    }
  };
  check(/ALTER TABLE (\w+)/g, 'ALTER');
  check(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS \w+\s+ON (\w+)/g, 'INDEX');

  if (issues.length) {
    problems += issues.length;
    issues.forEach((i) => console.error('  ❌ ' + i));
  } else {
    console.log('  ✅ ' + rel);
  }
}

if (problems) {
  console.error(`\n${problems} مشكلة ترتيب — الـALTER/INDEX لازم يجي بعد CREATE TABLE بتاعه.`);
  console.error('على قاعدة جديدة ده بيوقف تنفيذ باقي المخطط بالكامل من غير ما يبان.');
  process.exit(1);
}
console.log('\nترتيب المخطط سليم في كل الملفات.');
