'use strict';

// Skill: Facebook — read/summarize the user's feed or notifications in THEIR live
// browser (they must be signed in; runs via the connected extension). Composes
// navigate_site to open facebook.com and gather what's there. Reading works
// today; posting is consent-gated future work (operate + explicit approval).
const { register } = require('./_registry');

async function run(ctx, input) {
  const nav = ctx.actions.get('navigate_site');
  if (!nav) return { ok: false, error: 'navigate_site action unavailable' };
  const ext = require('../extension-bridge');
  if (!(ctx.userId && ext.connected(ctx.userId))) {
    return { ok: false, error: 'مهارة فيسبوك بتشتغل في متصفحك الحي — نزّل إضافة سوكرو من /ext ووصّلها، وكن مسجّل دخول في Facebook.' };
  }
  const ask = String((input && (input.goal || input.query)) || '').trim() || 'لخّص آخر المنشورات/الإشعارات المهمة في الصفحة الرئيسية.';
  const r = await nav.run(ctx, { url: 'https://www.facebook.com/', goal: 'في Facebook: ' + ask, maxHops: 3 });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, output: Object.assign({ service: 'facebook' }, r.output) };
}

register({
  name: 'facebook',
  description: 'مهارة Facebook: تفتح فيسبوك في متصفح المستخدم (لازم يكون مسجّل دخول) وتقرأ/تلخّص الرئيسية أو الإشعارات. input.goal = المطلوب. القراءة شغّالة؛ النشر قيد التطوير (بموافقة صريحة).',
  permissions: ['browser', 'facebook', 'social'],
  inputSchema: { type: 'object', properties: { goal: { type: 'string' } } },
  run,
});

module.exports = run;
