#!/usr/bin/env node
/**
 * The retry that books a second ticket.
 *
 * The executor retried every failed step twice, with backoff. That is right for
 * a search that timed out and catastrophic for a booking that did not answer in
 * time — because a submit whose reply never arrived has usually SUCCEEDED. The
 * request reached the site, the response got lost, and the retry sends it
 * again: a second ticket on the same name, or a second payment. Nobody notices
 * until a statement arrives, and by then nothing in the logs looks wrong.
 *
 * The rule is read from what the project already declares rather than from a
 * new list: an action holding a SENSITIVE permission — submit · payment ·
 * email · social · login · files — runs ONCE. An action can be more precise
 * about itself: `fill_submit` typing into a search box may be repeated, the
 * same action with a submit may not.
 *
 * Defaulting to "do not repeat" also means an action written next year is safe
 * because of what it declares, not because somebody remembered this file.
 *
 *   node scripts/check-no-retry.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { execute, mayRetry } = require('../sokro/workflows/executor');
const registry = require('../sokro/actions/_registry');
require('../sokro/actions');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The rule ──────────────────────────────────────────────────────────── */
{
  check('البحث ينفع يتعاد', mayRetry(registry.get('search_web'), {}) === true);
  check('والقراية كمان', mayRetry(registry.get('browse'), {}) === true);
  check('و«شغّل الموقع» لأ أبداً', mayRetry(registry.get('operate'), {}) === false);
  check('وملء فورم من غير إرسال ينفع', mayRetry(registry.get('fill_submit'), {}) === true);
  check('وبإرسال لأ', mayRetry(registry.get('fill_submit'), { submit: '#send' }) === false);
  check('وحتى بإرسال فاضي (Enter) لأ', mayRetry(registry.get('fill_submit'), { submit: '' }) === false);
  check('و`submitSelector` زيّها', mayRetry(registry.get('fill_submit'), { submitSelector: '#s' }) === false);

  // The default: a made-up action with a sensitive scope must be once-only
  // WITHOUT anybody adding it to a list.
  check('وأي أكشن بصلاحية حسّاسة افتراضيه مرة واحدة',
    mayRetry({ name: 'x', permissions: ['payment'] }, {}) === false
    && mayRetry({ name: 'y', permissions: ['email'] }, {}) === false
    && mayRetry({ name: 'z', permissions: ['social'] }, {}) === false);
  check('واللي مالوش صلاحية حسّاسة ينفع', mayRetry({ name: 'q', permissions: ['network'] }, {}) === true);
  check('و`retryable:false` بتقفلها صراحةً', mayRetry({ name: 'r', permissions: [], retryable: false }, {}) === false);
}

/* ── And the executor obeys it, counted ────────────────────────────────── */
{
  const runner = (name, permissions, extra) => {
    const calls = { n: 0 };
    const action = Object.assign({
      name, permissions,
      run: async () => { calls.n++; return { ok: false, error: 'timeout' }; },
    }, extra || {});
    return { calls, ctx: { actions: { get: () => action } } };
  };

  (async () => {
    {
      const { calls, ctx } = runner('search_web', ['network']);
      await execute(ctx, { steps: [{ action: 'search_web', input: {} }] });
      check('خطوة عادية بتفشل بتتعاد', calls.n === 3, 'مرات: ' + calls.n);
    }
    {
      const { calls, ctx } = runner('fill_submit', ['browser', 'submit']);
      const r = await execute(ctx, { steps: [{ action: 'fill_submit', input: { submit: '#b' } }] });
      check('وخطوة إرسال بتتنفّذ مرة واحدة بس', calls.n === 1, 'مرات: ' + calls.n);
      check('والنتيجة بتقول إنها ماتعادتش', r[0].result.notRetried === true);
    }
    {
      const { calls, ctx } = runner('pay', ['payment']);
      await execute(ctx, { steps: [{ action: 'pay', input: {} }] });
      check('وخطوة دفع كمان', calls.n === 1, 'مرات: ' + calls.n);
    }
    {
      // The action decides for itself: same action, harmless input.
      const { calls, ctx } = runner('fill_submit', ['browser', 'submit'],
        { retryable: (input) => !(input && input.submit != null) });
      await execute(ctx, { steps: [{ action: 'fill_submit', input: {} }] });
      check('ونفس الأكشن من غير إرسال بيتعاد عادي', calls.n === 3, 'مرات: ' + calls.n);
    }

    /* ── The declarations are where they should be ───────────────────── */
    {
      const nl = (m) => m.replace(/[^\n]/g, ' ');
      const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, nl)
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
      check('`fill_submit` معلنة قاعدتها بنفسها',
        /retryable: \(input\) => !\(input && \(input\.submit != null \|\| input\.submitSelector != null\)\)/.test(code('sokro/actions/FillSubmitAction.js')));
      check('و`operate` مقفولة صراحةً', /retryable: false,/.test(code('sokro/actions/OperateAction.js')));
      check('والمنفّذ بيقرا الصلاحيات الحسّاسة مش قايمة عنده',
        /permissions\.isSensitive\(action\.permissions\)/.test(code('sokro/workflows/executor.js')));
      const perms = require('../sokro/permissions');
      for (const p of ['submit', 'payment', 'email', 'social', 'login', 'files']) {
        check('و`' + p + '` لسه محسوبة حسّاسة', perms.SENSITIVE.has(p));
      }
    }

    console.log(fail
      ? `\n${fail} مشكلة — يعني إعادة محاولة ممكن تحجز تذكرتين أو تدفع مرتين.`
      : '\nاللي بيبعت أو بيدفع بيتنفّذ مرة واحدة، واللي بيقرا بيتعاد.');
    process.exit(fail ? 1 : 0);
  })();
}
