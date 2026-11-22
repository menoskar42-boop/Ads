'use strict';

// Skill: Facebook / Instagram — read the user's feed in THEIR live browser, and
// PUBLISH from it.
//
// ── Why publishing is built this way ────────────────────────────────────────
//
// Posting is the one thing here that other people see. It cannot be undone by
// us, it carries the user's name, and a "probably posted" is useless — they
// will go and check anyway, and if we were wrong they have posted twice. So:
//
//   · the text is the USER's text. The model does not write a post and publish
//     it in the same breath; `input.text` is what goes up, verbatim;
//   · publishing is refused without an explicit confirmation (`confirm: true`),
//     which the consent gate collects — the same gate the payment actions use;
//   · success is only reported when the composer closed and the text is
//     visible on the page afterwards. Anything else says exactly what it saw
//     and leaves the tab open;
//   · it is never retried (`retryable: false`): a repeat is a second post on a
//     real person's wall.
const { register } = require('./_registry');

const SERVICES = {
  facebook: { url: 'https://www.facebook.com/', label: 'فيسبوك' },
  instagram: { url: 'https://www.instagram.com/', label: 'إنستجرام' },
};

function serviceOf(input) {
  const raw = String((input && input.service) || 'facebook').toLowerCase();
  return SERVICES[raw] ? raw : 'facebook';
}

/** Read mode: open the feed and summarise it. */
async function read(ctx, input, service) {
  const nav = ctx.actions.get('navigate_site');
  if (!nav) return { ok: false, error: 'navigate_site action unavailable' };
  const ask = String((input && (input.goal || input.query)) || '').trim() || 'لخّص آخر المنشورات/الإشعارات المهمة في الصفحة الرئيسية.';
  const r = await nav.run(ctx, { url: SERVICES[service].url, goal: 'في ' + SERVICES[service].label + ': ' + ask, maxHops: 3 });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, output: Object.assign({ service }, r.output) };
}

/**
 * Publish mode. The operator does the clicking; this decides what counts as
 * done — and refuses to call anything else done.
 */
async function publish(ctx, input, service) {
  const text = String((input && input.text) || '').trim();
  if (!text) return { ok: false, errorCode: 'no_text', error: 'اكتب نص المنشور اللي عايز أنشره.' };
  if (text.length > 5000) return { ok: false, errorCode: 'too_long', error: 'النص طويل أوي للنشر.' };
  // The user has to have said yes to THIS post. Consent for "use the browser"
  // is not consent to write something under their name.
  if (!(input && (input.confirm === true || input.confirmed === true)) && !(ctx && ctx.consented)) {
    return {
      ok: false, errorCode: 'needs_confirm',
      error: 'هنشر على ' + SERVICES[service].label + ' النص ده بالظبط:\n\n«' + text + '»\n\nقول «أكّد» عشان أنشر.',
      output: { service, pendingText: text, awaitingConfirm: true },
    };
  }
  const operate = ctx.actions.get('operate');
  if (!operate) return { ok: false, error: 'operate action unavailable' };
  const goal = 'انشر المنشور ده على ' + SERVICES[service].label + ' بالنص ده بالحرف: «' + text + '». '
    + 'افتح خانة إنشاء منشور، الصق النص زي ما هو، وبعدين اضغط زرار النشر. '
    + 'ماتغيّرش ولا كلمة من النص، وماتنشرش أي حاجة تانية.';
  const r = await operate.run(ctx, { url: SERVICES[service].url, goal, confirmSensitive: true, maxSteps: 8 });
  if (!r.ok) return { ok: false, errorCode: 'operate_failed', error: r.error, output: r.output };

  // Verification, not optimism: the post has to be visible where it was made.
  const seen = String((r.output && (r.output.answer || '')) || '');
  const head = text.slice(0, Math.min(40, text.length));
  const posted = head.length > 3 && seen.includes(head);
  if (!posted) {
    return {
      ok: false, errorCode: 'unconfirmed',
      error: 'مقدرتش أتأكد إن المنشور اتنشر فعلاً — سيبت الصفحة مفتوحة قدامك عشان تشوف وتنشر بنفسك لو لسه.',
      output: Object.assign({ service, published: false }, r.output),
    };
  }
  if (ctx.log) ctx.log('social.publish', { service, chars: text.length });
  return { ok: true, output: Object.assign({ service, published: true }, r.output) };
}

async function run(ctx, input) {
  const service = serviceOf(input);
  const ext = require('../extension-bridge');
  if (!(ctx.userId && ext.connected(ctx.userId))) {
    return { ok: false, errorCode: 'no_extension',
      error: 'مهارة ' + SERVICES[service].label + ' بتشتغل في متصفحك الحي — نزّل إضافة سوكرو من /ext ووصّلها، وكن مسجّل دخول.' };
  }
  const wantsPublish = !!(input && (input.publish === true || input.text));
  return wantsPublish ? publish(ctx, input, service) : read(ctx, input, service);
}

register({
  name: 'facebook',
  description: 'مهارة Facebook/Instagram في متصفح المستخدم (لازم يكون مسجّل دخول): القراءة بـ input.goal، والنشر بـ input.text (نص المنشور بالحرف) + input.service = facebook|instagram. النشر بيحتاج تأكيد صريح وبيتأكد إن المنشور ظهر فعلاً.',
  permissions: ['browser', 'facebook', 'social', 'submit'],
  // A repeat is a second post on a real person's wall.
  retryable: false,
  inputSchema: {
    type: 'object',
    properties: {
      goal: { type: 'string' }, text: { type: 'string' },
      service: { type: 'string' }, publish: { type: 'boolean' }, confirm: { type: 'boolean' },
    },
  },
  run,
});

module.exports = run;
module.exports.serviceOf = serviceOf;
module.exports.SERVICES = SERVICES;
