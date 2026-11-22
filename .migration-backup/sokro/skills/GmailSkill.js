'use strict';

// Skill: Gmail — read/summarize the user's inbox in THEIR live browser (they must
// be signed in to Gmail in Chrome; runs via the connected extension, so their
// session applies). Composes navigate_site to open mail.google.com and gather the
// recent messages. Reading works today; sending is consent-gated future work.
const { register } = require('./_registry');

async function run(ctx, input) {
  const nav = ctx.actions.get('navigate_site');
  if (!nav) return { ok: false, error: 'navigate_site action unavailable' };
  const ext = require('../extension-bridge');
  if (!(ctx.userId && ext.connected(ctx.userId))) {
    return { ok: false, error: 'مهارة جيميل بتشتغل في متصفحك الحي — نزّل إضافة سوكرو من /ext ووصّلها، وكن مسجّل دخول في Gmail.' };
  }
  const ask = String((input && (input.goal || input.query)) || '').trim() || 'افتح صندوق الوارد ولخّص آخر الرسائل: المرسِل والموضوع لكل واحدة.';
  const r = await nav.run(ctx, { url: 'https://mail.google.com/mail/u/0/#inbox', goal: 'في Gmail: ' + ask, maxHops: 3 });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, output: Object.assign({ service: 'gmail' }, r.output) };
}

register({
  name: 'gmail',
  description: 'مهارة Gmail: تفتح جيميل في متصفح المستخدم (لازم يكون مسجّل دخول) وتقرأ/تلخّص الرسائل. input.goal = المطلوب (مثلاً "لخّصلي آخر 5 إيميلات" أو "فيه إيميل من فلان؟"). القراءة شغّالة؛ الإرسال قيد التطوير.',
  permissions: ['browser', 'email'],
  inputSchema: { type: 'object', properties: { goal: { type: 'string' } } },
  run,
});

module.exports = run;
