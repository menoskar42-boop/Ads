#!/usr/bin/env node
/**
 * A tool that cannot run, offered on a phone.
 *
 * The browser actions — browse, operate, fill_submit, navigate_site,
 * extract_table — need either the user's own browser through the Sokro
 * extension, or server-side Chromium. On a phone with neither, they are not
 * "less reliable": they are impossible. The catalog handed to the planner
 * listed them anyway, and the model was told, in a sentence buried in a long
 * prompt, not to pick them.
 *
 * A model that can see a tool picks the tool. The user then gets an apology
 * about a browser extension they were never offered, for a question they asked
 * innocently — and the answer they wanted was one `search_web` away.
 *
 * So availability decides the CATALOG, not the wording:
 *
 *   · no browser anywhere → the browser actions are not in the list at all;
 *   · a plan that names one anyway has the step removed, and if that was the
 *     whole plan the user is told what is missing in one sentence;
 *   · which actions "need a browser" is read from the actions' own declared
 *     permissions, so a sixth one written next year is covered by declaring
 *     itself, not by being added to a list in the planner.
 *
 *   node scripts/check-mobile-tools.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const registry = require('../sokro/actions/_registry');
require('../sokro/actions');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The catalog can leave a capability out ────────────────────────────── */
{
  const all = registry.catalog().map((a) => a.name);
  const mobile = registry.catalog({ without: ['browser'] }).map((a) => a.name);
  check('الكتالوج بيقدر يشيل أدوات المتصفّح', mobile.length < all.length,
    'شال: ' + all.filter((n) => !mobile.includes(n)).join(', '));
  check('واللي فضل مش محتاج متصفّح',
    registry.catalog({ without: ['browser'] }).every((a) => !(a.permissions || []).includes('browser')));
  check('والبحث وتوليد الصور لسه موجودين',
    mobile.includes('search_web') && mobile.includes('generate_image'));
  check('ومن غير `without` مفيش حاجة بتتشال', registry.catalog().length === all.length);
  // The five actions must actually declare it, or the filter has nothing to grip.
  const declared = registry.catalog().filter((a) => (a.permissions || []).includes('browser')).map((a) => a.name);
  for (const n of ['browse', 'operate', 'fill_submit', 'navigate_site', 'extract_table']) {
    check(n + ' معلنة إنها محتاجة متصفّح', declared.includes(n));
  }
}

/* ── The planner asks availability, not the prompt ─────────────────────── */
{
  const p = code('sokro/ai/planner.js');
  check('المخطِّط بيسأل: فيه متصفّح أصلاً؟', /function browserPossible\(ctx\)/.test(p));
  check('وبيحسب الإضافة والسيرفر', /extension-bridge'\)\.connected/.test(p) && /ctx\.browser\.available\(\)/.test(p));
  check('والكتالوج نفسه بيتفلتر',
    /ctx\.actions\.catalog\(B\.any \? undefined : \{ without: \['browser'\] \}\)/.test(p));
  check('والخطوة اللي بتطلب أداة مش موجودة بتتشال', /function keepKnown\(plan, names, browserNames\)/.test(p)
    && /const cleaned = keepKnown\(out, names, browserActionNames\(ctx\)\)/.test(p));
  check('وأسماء أدوات المتصفّح بتتقرا من الصلاحيات مش من قايمة',
    /includes\('browser'\)\)\.map\(\(a\) => a\.name\)/.test(p));
  check('واللي اتشال بيتقال للمستخدم بجملة واحدة', /مش موصول بمتصفّحك دلوقتي/.test(p));
  check('والاستدلال الاحتياطي بيتبع نفس التوفّر', /heuristicPlan\(goal, names, B\.any\)/.test(p));
}

/* ── And the rules, run rather than read ───────────────────────────────── */
{
  const { _internals: I } = require('../sokro/ai/planner');
  const names = new Set(registry.catalog({ without: ['browser'] }).map((a) => a.name));
  const ctx = { actions: registry };

  check('أسماء أدوات المتصفّح بتتحسب من التسجيل',
    I.browserActionNames(ctx).sort().join(',') === 'browse,extract_table,fill_submit,navigate_site,operate');

  {
    const plan = { steps: [{ action: 'operate', input: {} }, { action: 'search_web', input: {} }] };
    const out = I.keepKnown(plan, names, I.browserActionNames(ctx));
    check('خطوة المتصفّح بتتشال والباقي بيفضل',
      out.steps.length === 1 && out.steps[0].action === 'search_web');
  }
  {
    const plan = { steps: [{ action: 'operate', input: {} }] };
    const out = I.keepKnown(plan, names, I.browserActionNames(ctx));
    check('وخطة كلها متصفّح بترجع فاضية برسالة مفهومة',
      out.steps.length === 0 && /متصفّحك/.test(out.message || ''));
  }
  {
    const plan = { steps: [{ action: 'search_web', input: {} }] };
    const out = I.keepKnown(plan, names, I.browserActionNames(ctx));
    check('وخطة سليمة مابتتلمسش', out.steps.length === 1 && !out.message);
  }
  {
    // With no extension and no server browser: the deterministic path must still
    // answer, and must not reach for a tool that is not there.
    const h = I.heuristicPlan('دوّر على أسعار العربيات في سيلندر', names, false);
    check('والاستدلال من غير متصفّح مابيرجعش خطوة متصفّح',
      !h || h.steps.every((s) => !I.browserActionNames(ctx).includes(s.action)),
      h ? h.steps.map((s) => s.action).join(',') : 'مفيش خطة');
  }
  {
    check('و«فيه متصفّح؟» بترجع لأ لما مفيش ولا واحد',
      I.browserPossible({}).any === false);
    check('وأيوه لما السيرفر متاح',
      I.browserPossible({ browser: { available: () => true } }).any === true);
  }
}

console.log(fail
  ? `\n${fail} مشكلة — يعني الموديل ممكن يختار أداة مستحيلة ويعتذر للمستخدم بدل ما يجاوبه.`
  : '\nاللي مش موجود مش معروض: الموبايل بياخد الأدوات اللي بتشتغل عليه بس.');
process.exit(fail ? 1 : 0);
