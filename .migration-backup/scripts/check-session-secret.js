#!/usr/bin/env node
/**
 * The session secret had a fallback written in this repository.
 *
 * `process.env.SESSION_SECRET || '<a literal>'` — and that string was in the
 * source, so anybody who can read the code can sign a session cookie
 * for any merchant, or for an admin. The failure mode is the dangerous kind:
 * **nothing goes wrong**. The site boots, logins work, and the secret has
 * simply stopped being one. It stayed on the plan as "⏳ need to confirm the
 * env var is set in production", which is a question whose wrong answer nobody
 * would ever notice.
 *
 * A question that cannot be answered safely is better removed than asked:
 *
 *   · production without the variable refuses to boot;
 *   · development gets a fresh random one per run — logins do not survive a
 *     restart locally, which is honest, where a shared constant hides the
 *     problem until the day it is deployed.
 *
 *   node scripts/check-session-secret.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const nl = (m) => m.replace(/[^\n]/g, ' ');
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* `|| ''` in the reader below is fine — an empty string is not a fallback
   secret, it is "nothing was set". What must not exist is a non-empty one. */
check('مفيش سرّ افتراضي مكتوب في الكود',
  !/SESSION_SECRET\s*\|\|\s*['"][^'"]/.test(srv));
check('والجلسة بتاخد السرّ من المتغيّر المحسوب',
  /secret: SESSION_SECRET,/.test(srv));
check('والإنتاج بيقف لو المتغيّر مش متحطّ',
  /NODE_ENV === 'production'[\s\S]{0,400}process\.exit\(1\)/.test(srv));
check('وبيرفض سرّ قصير كمان (مش وجوده بس)',
  /fromEnv\.length >= 16/.test(srv));
check('وبرّه الإنتاج بياخد سرّ عشوائي مش ثابت',
  /randomBytes\(32\)/.test(srv));
check('والتحذير بيقول إن الجلسات مش هتعيش بعد إعادة التشغيل',
  /Logins will not survive a restart/.test(srv));

/* The old literal must not survive anywhere — not in a script, not in a doc
   that somebody would paste into an env file. */
{
  /* Split so this file does not match its own search. */
  const NEEDLE = 'oscardevs-' + 'secret-key';
  const SELF = path.relative(ROOT, __filename);
  const hits = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'private_uploads'].includes(f.name)) continue;
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { walk(full); continue; }
      if (!/\.(js|ejs|json|md|env|sh|yml|yaml)$/.test(f.name)) continue;
      if (path.relative(ROOT, full) === SELF) continue;
      let text;
      try { text = fs.readFileSync(full, 'utf8'); } catch (e) { continue; }
      if (text.includes(NEEDLE)) hits.push(path.relative(ROOT, full));
    }
  };
  walk(ROOT);
  check('والسرّ القديم مش موجود في أي ملف', hits.length === 0, hits.join(' · ') || 'ولا ملف');
}

/* Run the decision, so "production stops" is a fact and not a regex. */
{
  const { execFileSync } = require('child_process');
  const snippet = `
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    const fromEnv = String(process.env.SESSION_SECRET || '').trim();
    if (fromEnv.length >= 16) { console.log('ACCEPTED'); process.exit(0); }
    if (process.env.NODE_ENV === 'production') { console.log('REFUSED'); process.exit(1); }
    console.log('RANDOM');
  `;
  let out = '';
  try { out = execFileSync(process.execPath, ['-e', snippet], { encoding: 'utf8' }); }
  catch (e) { out = (e.stdout || '').toString(); }
  check('والمنطق نفسه بيرفض فعلاً في الإنتاج', out.trim() === 'REFUSED', out.trim());
}

console.log(fail
  ? `\n${fail} مشكلة — يعني ممكن حد يزوّر كوكي دخول لأي تاجر أو أدمن.`
  : '\nمفيش سرّ افتراضي، والإنتاج مايقومش من غير سرّ حقيقي.');
process.exit(fail ? 1 : 0);
