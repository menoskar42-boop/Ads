#!/usr/bin/env node
/**
 * Tick a row in QA_MASTER_PLAN.md by its id, not by retyping its text.
 *
 * Marking items by pasting the whole row back has failed silently three times
 * in a row: one character of drift and the replace matches nothing, the commit
 * goes through anyway, and the plan quietly says ❌ about something that is
 * done. Which is the same class of bug this whole backlog is about — a system
 * reporting a state it does not have.
 *
 *   node scripts/mark-done.js <id> "<the status cell>"
 *   node scripts/mark-done.js د-٧ "✅ اتصلّح ٢٠٢٦-٠٨-١٧ — …"
 */
'use strict';
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'docs', 'QA_MASTER_PLAN.md');

const [id, status] = process.argv.slice(2);
if (!id || !status) {
  console.error('usage: node scripts/mark-done.js <id> "<status>"');
  process.exit(1);
}

const lines = fs.readFileSync(FILE, 'utf8').split('\n');
const hits = [];
lines.forEach((l, i) => {
  // A table row whose FIRST cell is exactly this id.
  const m = l.match(/^\|\s*([^|]+?)\s*\|/);
  if (m && m[1] === id) hits.push(i);
});

if (hits.length !== 1) {
  console.error(hits.length === 0
    ? `❌ مالقيتش صف بالمعرّف «${id}»`
    : `❌ لقيت ${hits.length} صفوف بالمعرّف «${id}» — وضّح أكتر`);
  process.exit(1);
}

const i = hits[0];
const cells = lines[i].split('|');
// Last cell is the trailing empty string after the closing pipe.
cells[cells.length - 2] = ' ' + status + ' ';
lines[i] = cells.join('|');
fs.writeFileSync(FILE, lines.join('\n'));
console.log(`✅ ${id} اتعلّم`);
