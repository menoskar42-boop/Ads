'use strict';

// ── ring_user — المساعد بيرنّ للمستخدم ──────────────────────────────────────
//
// «شوف أنا ممكن أتعشى إيه النهارده، **واتصل بيا** بعد ما تعرف» — الأداة دي
// هي اللي بتخلّي النص ده قابل للتنفيذ. من غيرها المساعد بيخلّص المهمة
// ويستنى المستخدم يفتح التطبيق يشوف.
//
// ── ليه مش في `SENSITIVE` ───────────────────────────────────────────────────
//
// الرن بيوصل **لصاحب الحساب نفسه** ومحدّش تاني. مافيش طرف تالت بيتزعج،
// ومافيش حاجة بتحصل في العالم الخارجي، ومافيش إجراء مالوش رجعة. طلب
// موافقة قبل كل رن كان هيبقى معناه إن المستخدم لازم يكون فاتح التطبيق
// عشان يوافق إن التطبيق ينده عليه — وده بيلغي الميزة.
//
// اللي بيحمي من إساءة الاستخدام حاجة تانية: **نداء واحد مستني لكل مستخدم**
// (في `rings/index.js`)، فحتى لو الموديل اتلغبط وناداها عشر مرات، النتيجة
// رنّة واحدة مش عشرة.
const rings = require('../rings');
const { register } = require('./_registry');

async function run(ctx, input) {
  const brief = String((input && input.brief) || '').trim();
  if (!brief) {
    return { ok: false, error: 'brief مطلوب — النداء من غير كلام بيفتح مكالمة فاضية' };
  }
  if (!ctx || !ctx.userId) return { ok: false, error: 'no user in context' };
  const out = await rings.create(ctx.userId, {
    reason: String((input && input.reason) || 'task').slice(0, 40),
    brief,
  });
  if (!out.ok) return { ok: false, error: out.error };

  /* النتيجة بتقول **وصل لكام جهاز** مش «تم».
   *
   * الرن ممكن ينجح على السيرفر ويوصل لصفر أجهزة (المستخدم مارضيش بالإذن،
   * أو الاشتراك مات). لو رجّعنا «تم» في الحالة دي، المساعد هيقول «كلمتك
   * ومردتش» وهو أصلاً مانداش. الرقم بيخلّي الموديل يقدر يقول الحقيقة. */
  const sent = (out.push && out.push.sent) || 0;
  return {
    ok: true,
    output: {
      ringId: out.ring.id,
      delivered: sent,
      note: sent
        ? `اتبعت رنّة لـ${sent} جهاز. المستخدم لسه ماردّش.`
        : 'النداء اتسجّل بس مافيش جهاز مشترك في الرن — المستخدم هيشوفه أول ما يفتح التطبيق.',
    },
  };
}

register({
  name: 'ring_user',
  description: 'Ring the user inside the Sokro app (their phone rings) and speak a short brief when they answer. '
    + 'Use this when a task the user asked you to do FINISHES and they asked you to call/come back to them, '
    + 'or when you need an answer to continue and they are not currently in a call.',
  permissions: ['network'],
  inputSchema: {
    type: 'object',
    properties: {
      brief: { type: 'string', description: 'What to say the moment they answer — short, spoken Egyptian Arabic.' },
      reason: { type: 'string', description: 'Short tag: task | reminder | question' },
    },
    required: ['brief'],
  },
  run,
});

module.exports = run;
