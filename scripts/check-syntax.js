#!/usr/bin/env node
/**
 * Does every file in this project actually parse?
 *
 * `src/pharmacy/schema.js` did not. A prose comment inside a 300-line SQL
 * template literal wrapped a column name in backticks:
 *
 *     * quantities and `kind` says which way the boxes moved.
 *
 * The first of those ends the template two hundred lines early, and the rest of
 * the schema becomes JavaScript the parser cannot make sense of. `server.js`
 * requires that module, so **the site did not boot** — and it shipped, because
 * every check in this directory reads source files as TEXT. Grepping a broken
 * file works perfectly.
 *
 * The render fixtures did not catch it either: they exercise routers, and this
 * module is required from server.js alone.
 *
 * So: parse everything, cheaply, before anything else can pass. A check suite
 * that can go green on a codebase that will not start is not a check suite.
 *
 *   node scripts/check-syntax.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* What this compiles: the Node server — the code `server.js` pulls in, plus the
   checks themselves. Deliberately NOT the browser bundles or the co-hosted
   projects (mykid, mybible, the Cloudflare worker): those are ES modules with
   their own builds, so wrapping them the way CommonJS does would report a
   `export` keyword as a syntax error and drown the one finding that matters. */
const ROOTS = ['src', 'scripts'];
const EXTRA = ['server.js'];
const SKIP = new Set(['node_modules', '.git', 'private_uploads', 'coverage']);

function walk(dir, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(f.name)) continue;
    const full = path.join(dir, f.name);
    if (f.isDirectory()) { walk(full, out); continue; }
    if (f.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/* ── Every .js file compiles ───────────────────────────────────────────── */
{
  const files = ROOTS.reduce((a, d) => walk(path.join(ROOT, d), a), [])
    .concat(EXTRA.map((f) => path.join(ROOT, f)));
  const broken = [];
  for (const file of files) {
    // A shebang is only legal at offset zero, and the wrapper below moves it.
    // Node strips it the same way before compiling.
    const src = fs.readFileSync(file, 'utf8').replace(/^#![^\n]*/, '');
    try {
      // Compile only — nothing runs, so a module with side effects is safe to
      // check. Wrapped the way CommonJS wraps it, so a top-level `await`
      // inside a function and a bare `return` both behave as they really would.
      new vm.Script('(function (exports, require, module, __filename, __dirname) {\n' + src + '\n});',
        { filename: file });
    } catch (e) {
      broken.push(path.relative(ROOT, file) + ' — ' + String(e.message).split('\n')[0]);
    }
  }
  check(`كل ملفات JS بتتقرا (${files.length} ملف)`, broken.length === 0,
    broken.join('\n     ') || 'ولا ملف مكسور');
}

/* ── Every EJS template compiles ───────────────────────────────────────── */
{
  let ejs;
  try { ejs = require('ejs'); } catch (e) { ejs = null; }
  if (!ejs) {
    console.log('⏭️  ejs مش منزّل — القوالب اتخطّت (مش نتيجة).');
  } else {
    const files = [];
    (function w(dir) {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) { w(full); continue; }
        if (f.name.endsWith('.ejs')) files.push(full);
      }
    })(path.join(ROOT, 'src/views'));
    const broken = [];
    for (const file of files) {
      try {
        ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file, client: false });
      } catch (e) {
        broken.push(path.relative(ROOT, file) + ' — ' + String(e.message).split('\n')[0]);
      }
    }
    check(`وكل قوالب EJS بتتترجم (${files.length} قالب)`, broken.length === 0,
      broken.join('\n     ') || 'ولا قالب مكسور');
  }
}

/* Why there is no "count the backticks" rule here.
 *
 * The obvious guard — flag a file with an odd number of backticks — reports
 * seven of these very check scripts, because they quote code in Arabic prose
 * and inside regexes. A rule that cries wolf on the files whose job is to
 * enforce rules gets switched off within a week. Parsing is the honest test:
 * it does not care where the backtick is, only whether the result is a
 * program. */

console.log(fail
  ? `\n${fail} مشكلة — يعني الموقع ممكن مايقومش أصلاً.`
  : '\nكل الملفات بتتقرا — الموقع بيقوم.');
process.exit(fail ? 1 : 0);
