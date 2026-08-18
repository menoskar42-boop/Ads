#!/usr/bin/env node
/**
 * Posting under somebody's name.
 *
 * The Facebook skill could read a feed and the description said publishing was
 * "قيد التطوير". Publishing is the one thing in this project other people SEE:
 * it carries the user's name, we cannot take it back, and "probably posted" is
 * useless — they will go and look anyway, and if we were wrong they post twice.
 *
 * So the rules are the strict ones, and this check holds them:
 *
 *   · **the words are the user's.** `input.text` goes up verbatim; the model
 *     does not compose and publish in one breath;
 *   · **a yes for THIS post.** Consent to "use the browser" is not consent to
 *     write something under somebody's name — without an explicit confirm the
 *     skill returns the exact text and asks;
 *   · **published means seen.** Success only when the text is visible on the
 *     page afterwards; anything else says what it saw and leaves the tab open;
 *   · **never twice.** `retryable: false`, because a retry is a second post on
 *     a real person's wall.
 *
 *   node scripts/check-social-publish.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FB = require('../sokro/skills/FacebookSkill');
const skills = require('../sokro/skills/_registry');
require('../sokro/skills');
const { mayRetry } = require('../sokro/workflows/executor');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const bridge = require('../sokro/extension-bridge');
const realConnected = bridge.connected;

// A ctx whose operator reports back exactly what we say it saw.
const ctxWith = (answer, ok) => ({
  userId: 1, log: () => {},
  actions: {
    get: (n) => (n === 'operate'
      ? { run: async (_c, input) => ({ ok: ok !== false, error: ok === false ? 'مفيش' : null, output: { answer, goal: input.goal } }) }
      : { run: async () => ({ ok: true, output: {} }) }),
  },
});

async function main() {
  bridge.connected = () => true;

  check('الخدمة بتتحدّد من المدخل', FB.serviceOf({ service: 'instagram' }) === 'instagram'
    && FB.serviceOf({}) === 'facebook' && FB.serviceOf({ service: 'يلا' }) === 'facebook');

  /* ── Nothing goes up without a yes for this text ─────────────────────── */
  {
    const r = await FB(ctxWith('…'), { text: 'خصم ٢٠٪ النهاردة' });
    check('النشر من غير تأكيد بيقف', r.ok === false && r.errorCode === 'needs_confirm');
    check('وبيعرض النص بالحرف قبل ما يسأل', /خصم ٢٠٪ النهاردة/.test(r.error));
    check('وبيقول المطلوب كلمة واحدة', /أكّد/.test(r.error));
  }
  {
    const r = await FB(ctxWith('…'), { publish: true, confirm: true, text: '' });
    check('ونص فاضي مابينشرش', r.ok === false && r.errorCode === 'no_text');
  }

  /* ── Published means seen ────────────────────────────────────────────── */
  {
    const text = 'عرض النهاردة على كل الموبايلات';
    const seen = await FB(ctxWith('المنشور ظهر: ' + text), { text, confirm: true });
    check('لما النص يظهر على الصفحة = نشر', seen.ok === true && seen.output.published === true);

    const unseen = await FB(ctxWith('اتفتحت الصفحة وخلاص'), { text, confirm: true });
    check('ومن غير ما يظهر = مش متأكد، مش نجاح', unseen.ok === false && unseen.errorCode === 'unconfirmed');
    check('والرد بيقول الصفحة مفتوحة يشوف بنفسه', /تنشر بنفسك/.test(unseen.error));
    check('والنتيجة بتقول published: false', unseen.output.published === false);

    const broke = await FB(ctxWith('', false), { text, confirm: true });
    check('وفشل المشغّل بيترد كفشل', broke.ok === false && broke.errorCode === 'operate_failed');
  }

  /* ── The text is the user's ──────────────────────────────────────────── */
  {
    let sentGoal = '';
    const ctx = {
      userId: 1, log: () => {},
      actions: { get: () => ({ run: async (_c, i) => { sentGoal = i.goal || ''; return { ok: true, output: { answer: i.goal } }; } }) },
    };
    await FB(ctx, { text: 'نص المستخدم بالحرف', confirm: true });
    check('النص بيتبعت للمشغّل زي ما هو', sentGoal.includes('نص المستخدم بالحرف'));
    check('والتعليمات بتمنع أي تغيير فيه', /ماتغيّرش ولا كلمة/.test(sentGoal));
    check('وبتمنع نشر أي حاجة تانية', /ماتنشرش أي حاجة تانية/.test(sentGoal));
  }

  /* ── Declared like the dangerous thing it is ─────────────────────────── */
  {
    const cap = skills.get ? skills.get('facebook') : null;
    check('المهارة متسجّلة', !!cap);
    if (cap) {
      check('وصلاحياتها فيها النشر والسوشيال',
        (cap.permissions || []).includes('social') && (cap.permissions || []).includes('submit'));
      check('ومابتتعادش أبداً', mayRetry(cap, {}) === false);
      check('والوصف بقى بيقول إن النشر شغّال', !/قيد التطوير/.test(cap.description || ''));
    }
  }

  /* ── No extension, no posting ────────────────────────────────────────── */
  {
    bridge.connected = () => false;
    const r = await FB({ userId: 1, actions: { get: () => null } }, { text: 'حاجة', confirm: true });
    check('ومن غير إضافة بيقول السبب', r.ok === false && r.errorCode === 'no_extension');
    bridge.connected = realConnected;
  }

  console.log(fail
    ? `\n${fail} مشكلة — يعني منشور ممكن يتنشر باسم المستخدم من غير موافقته أو من غير ما نتأكد.`
    : '\nالنشر بكلام المستخدم، بموافقة على النص ده بالذات، و«اتنشر» معناها شفناه.');
  process.exit(fail ? 1 : 0);
}

main();
