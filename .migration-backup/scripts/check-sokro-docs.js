#!/usr/bin/env node
/**
 * The description was narrower than the thing.
 *
 * Sokro's README still ended at "project structure ← current" while the folder
 * had a booking state machine, an agenda, reminders with delivery, WhatsApp,
 * publishing and a secrets UI in it. The portfolio card told visitors it
 * searches and draws pictures. Both are the same failure as the one this whole
 * wave is about, pointed the other way: **the system saying something untrue
 * about itself** — and the version that undersells is what makes a merchant
 * think the platform cannot do the thing they need.
 *
 * The rule from the project's own instructions applies here more than anywhere:
 * ⚠️ **الفحص قبل الادعاء** — a capability written in a document has to be
 * findable in the code. So this check reads the claims and looks for them:
 *
 *   · every file the README's capability table points at must exist;
 *   · every capability named on the public card must exist as a registered
 *     action or skill;
 *   · and — the one that protects users rather than the copy — an action that
 *     WRITES must declare a sensitive scope, or it would quietly skip the
 *     confirmation, the no-retry rule and the domain allowlist.
 *
 *   node scripts/check-sokro-docs.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const registry = require('../sokro/actions/_registry');
require('../sokro/actions');
const skills = require('../sokro/skills/_registry');
require('../sokro/skills');
const permissions = require('../sokro/permissions');
const { mayRetry } = require('../sokro/workflows/executor');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── Every path the README claims, on disk ─────────────────────────────── */
{
  const readme = fs.readFileSync(path.join(ROOT, 'sokro/README.md'), 'utf8');
  const table = readme.slice(readme.indexOf('| Capability | Where |'), readme.indexOf('**What it does not do:**'));
  check('فيه جدول قدرات في الـREADME', table.length > 200);
  const paths = [...new Set((table.match(/`([a-zA-Z0-9_./-]+\.(?:js|md)|[a-zA-Z0-9_-]+\/)`/g) || [])
    .map((m) => m.replace(/`/g, '')))];
  check('والجدول بيشاور على ملفات', paths.length >= 10, paths.length + ' مسار');
  const missing = paths.filter((rel) => !fs.existsSync(path.join(ROOT, 'sokro', rel)));
  check('وكل مسار موجود فعلاً', missing.length === 0, missing.join(' · ') || 'كلهم');

  check('و«الخطوة الحالية» بقت التوثيق مش الهيكل',
    /13\. Docs \+ Deploy .* ← \*\*current\*\*/.test(readme) && !/2\. Project structure \(runnable skeleton\) ← \*\*current\*\*/.test(readme));
  check('والقيود مكتوبة مش بس المميزات', /\*\*What it does not do:\*\*/.test(readme));
  check('واللي لسه مااتعملش مكتوب كـ«الجاي»', /### Next/.test(readme));
  // The checks named in the README have to be real, or the promise is decoration.
  const named = (readme.match(/`check-[a-z-]+`/g) || []).map((m) => m.replace(/`/g, ''));
  const ghosts = named.filter((n) => !fs.existsSync(path.join(ROOT, 'scripts', n + '.js')));
  check('وكل فحص متسمّى في الـREADME موجود', ghosts.length === 0, ghosts.join(' · ') || named.length + ' فحص');
}

/* ── What the public card says ─────────────────────────────────────────── */
{
  const card = fs.readFileSync(path.join(ROOT, 'src/views/legal/our_work.ejs'), 'utf8');
  const block = card.slice(card.indexOf('<!-- Sokro -->'), card.indexOf('<!-- OncoScan -->'));
  check('لقيت كارت سوكرو', block.length > 200);
  const claims = [
    [/يبحث/, 'search_web'],
    [/تقرير/, 'research_report'],
    [/صور/, 'generate_image'],
    [/يفتح المواقع|يملا الفورمات/, 'fill_submit'],
    [/واتساب/, 'whatsapp_send'],
  ];
  const unbacked = claims.filter(([re, cap]) => re.test(block) && !registry.get(cap) && !(skills.get && skills.get(cap)));
  check('وكل قدرة مكتوبة على الكارت ليها كود',
    unbacked.length === 0, unbacked.map((c) => c[1]).join(' · ') || 'كلها');
  // The public page must not promise what the confirmation rules deliberately
  // prevent — «بينشر لوحده» would be a lie in the dangerous direction.
  check('والكارت بيقول إنه بيسأل قبل الإرسال والنشر', /بيسألك قبل/.test(block));
  check('ومفيش أرقام ولا وعود بلا مصدر', !/\d+\s*%|\+\d{2,}/.test(block));
}

/* ── The scope that makes a write behave like one ──────────────────────── */
{
  // An action that writes and declares only 'browser' skips the confirmation,
  // the no-retry rule AND the domain allowlist in one go.
  const WRITERS = ['fill_submit', 'whatsapp_send'];
  const bad = [];
  for (const name of WRITERS) {
    const a = registry.get(name);
    if (!a) { bad.push(name + ' (مش متسجّل)'); continue; }
    if (!permissions.isSensitive(a.permissions)) bad.push(name + ' (مفيش صلاحية حسّاسة)');
    if (mayRetry(a, { submit: '#x', text: 'y', phone: '1' })) bad.push(name + ' (بيتعاد)');
  }
  const fb = skills.get && skills.get('facebook');
  if (fb) {
    if (!permissions.isSensitive(fb.permissions)) bad.push('facebook (مفيش صلاحية حسّاسة)');
    if (mayRetry(fb, {})) bad.push('facebook (بيتعاد)');
  }
  check('كل أكشن بيكتب معلن صلاحية حسّاسة ومابيتعادش', bad.length === 0, bad.join(' · ') || WRITERS.concat(['facebook']).join(' · '));
  check('والقراية فاضلة بلا تأكيد', !permissions.isSensitive(['browser']));
  check('والتوثيق بيشرح الفرق ده', /'browser' alone means READ/.test(
    fs.readFileSync(path.join(ROOT, 'sokro/permissions/index.js'), 'utf8')));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني الوصف بيقول حاجة والكود بيقول حاجة تانية.`
  : '\nالمكتوب في التوثيق وعلى الصفحة موجود في الكود، واللي بيكتب معلن إنه بيكتب.');
process.exit(fail ? 1 : 0);
