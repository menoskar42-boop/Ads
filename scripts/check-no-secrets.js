#!/usr/bin/env node
/**
 * No working credential may live in this repository.
 *
 * This exists because four of them did. Each vertical's schema file carried a
 * literal demo password — pharmacy123, clinic123, gym123, orders123 — and the
 * seeder ran automatically at boot, so a public GitHub repository published a
 * working login for a live demo tenant that anybody could sign into and edit.
 * Three documentation files repeated the same passwords, and two of the demo
 * scripts I wrote later carried defaults of their own.
 *
 * A password in a repository is not fixed by deleting it. Anyone who cloned it
 * still has it and the history still holds it, so the credential must also be
 * ROTATED. This check only stops the next one.
 *
 * Usage: node scripts/check-no-secrets.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SKIP_DIRS = /node_modules|\.git|uploads|pgdata|coverage/;
const SCAN_EXT = /\.(js|ejs|md|json|ya?ml|sh|txt)$/;
// This file necessarily contains the very strings it looks for.
const SELF = path.basename(__filename);

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (SKIP_DIRS.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (SCAN_EXT.test(e.name) && e.name !== SELF) out.push(p);
  }
  return out;
}

const RULES = [
  {
    label: 'a demo password written into the code',
    // The exact family that shipped, plus the obvious shape of a successor.
    re: /\b(pharmacy|clinic|gym|orders|furniture|workshop|nutrition|shop|admin|demo)\s*['"]?\s*(123|1234|12345|123456)\b/i,
    why: 'These were live logins in a public repository. Read the password from\n   '
       + 'the environment and create no user when it is unset.',
  },
  {
    label: 'a password assigned to a literal',
    re: /(?:^|[^\w.])(?:DEMO_)?PASSWORD\s*=\s*['"][^'"\s]{4,}['"]/,
    why: 'Take it from process.env instead. A default is a published credential.',
  },
  {
    label: 'a password printed to the console',
    re: /console\.(log|info|warn)\([^)]*\$\{\s*password\s*\}/,
    why: 'That puts a working credential in a terminal scrollback, a CI log and\n   '
       + 'any screenshot of either.',
  },
  {
    label: 'a hard-coded bearer token or API key',
    re: /(?:api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{24,}['"]/i,
    why: 'Read it from the environment.',
  },
];

// Real values that are meant to be public, and lines that only NAME a secret
// rather than containing one.
//
// This list has to stay narrow. The first version exempted any line mentioning
// DEMO_PASSWORD — which exempted `const DEMO_PASSWORD = 'gym123'` too, so the
// check passed on the exact line it was written to catch. A line is only
// allowed if it reads from the environment; an assignment of a literal never is.
const ALLOW = [
  /ca-pub-\d+/,            // the AdSense publisher id is public by design
  /pub-3132188303904900/,
  /msvalidate|google-site-verification|yandex-verification/,
];

/** A line that only reads process.env carries no secret of its own. */
function readsEnvOnly(line) {
  if (!/process\.env\./.test(line)) return false;
  // …unless it also assigns a quoted literal of its own, as a fallback would.
  return !/=\s*['"][^'"]{4,}['"]/.test(line.replace(/process\.env\.[A-Z_]+/g, ''));
}

let failed = 0;
const hits = [];
for (const f of walk(ROOT)) {
  const rel = path.relative(ROOT, f);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (ALLOW.some((a) => a.test(line)) || readsEnvOnly(line)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        hits.push({ rel, line: i + 1, text: line.trim().slice(0, 110), rule });
        break;
      }
    }
  });
}

if (hits.length) {
  failed = 1;
  console.log(`❌ ${hits.length} possible credential(s) in the repository:\n`);
  const byRule = new Map();
  for (const h of hits) {
    if (!byRule.has(h.rule.label)) byRule.set(h.rule.label, []);
    byRule.get(h.rule.label).push(h);
  }
  for (const [label, list] of byRule) {
    console.log('  ' + label + ':');
    console.log('   ' + list[0].rule.why);
    list.slice(0, 10).forEach((h) => console.log(`     ${h.rel}:${h.line}  ${h.text}`));
    console.log('');
  }
  console.log('  Remember: deleting a password does not fix it. Rotate it too —');
  console.log('  anyone who cloned the repository still has the old one.');
} else {
  console.log('✅ مفيش بيانات دخول مكتوبة في الكود.');
}
process.exit(failed);
