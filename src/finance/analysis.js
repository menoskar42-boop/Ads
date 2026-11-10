// تحليل إفصاحات البورصة بالذكاء الاصطناعى: دالة واحدة (analyzeDisclosure) فى الملف ده بس، عشان تغيير المزوّد يبقى هنا.
// المزوّد: DeepSeek لو DEEPSEEK_API_KEY موجود، وإلا OpenAI (OPENAI_API_KEY) بموديل صغير رخيص.
// FINANCE_AI_MODEL بيغيّر الموديل. الاتنين بيتكلموا بنفس شكل OpenAI (chat/completions + JSON).
'use strict';

const SENTIMENTS = ['positive', 'negative', 'neutral'];
const EVENTS = ['dividend', 'earnings', 'board_decision', 'capital_increase', 'buyback', 'other'];

function provider(env) {
  env = env || process.env;
  if (env.DEEPSEEK_API_KEY) {
    return { name: 'deepseek', url: 'https://api.deepseek.com/chat/completions', key: env.DEEPSEEK_API_KEY, model: env.FINANCE_AI_MODEL || 'deepseek-chat' };
  }
  if (env.OPENAI_API_KEY) {
    return { name: 'openai', url: 'https://api.openai.com/v1/chat/completions', key: env.OPENAI_API_KEY, model: env.FINANCE_AI_MODEL || 'gpt-4o-mini' };
  }
  return null;
}

/** بيتأكد من شكل الرد بالظبط. null = مش صالح. */
function validate(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const sentiment = String(obj.sentiment || '').toLowerCase();
  const impact = Number(obj.impact_score);
  const event = String(obj.event_type || '').toLowerCase();
  const summary = typeof obj.summary_ar === 'string' ? obj.summary_ar.trim() : '';
  if (!SENTIMENTS.includes(sentiment) || !Number.isInteger(impact) || impact < -2 || impact > 2 || !summary) return null;
  const facts = Array.isArray(obj.key_facts) ? obj.key_facts.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 200)).slice(0, 6) : [];
  return {
    sentiment, impact_score: impact, event_type: EVENTS.includes(event) ? event : 'other',
    summary_ar: summary.replace(/[\u2013\u2014]/g, '-').slice(0, 400), key_facts: facts,
  };
}

function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (_) { return null; }
}

const SYSTEM = 'أنت محلل أخبار للبورصة المصرية. اقرا الإفصاح وارجع JSON بس بالمفاتيح دى:\n' +
  '{"sentiment":"positive|negative|neutral","impact_score":عدد صحيح من -2 لـ 2,' +
  '"event_type":"dividend|earnings|board_decision|capital_increase|buyback|other",' +
  '"summary_ar":"جملتين عربى بالكتير","key_facts":["حقيقة قصيرة", "..."]}\n' +
  'ماتخترعش أرقام مش موجودة فى النص. لو النص مش كفاية اختار neutral و0. ماتديش نصيحة شراء أو بيع.';

/**
 * analyzeDisclosure(title, body_text, company) => {sentiment, impact_score, event_type, summary_ar, key_facts}
 * أو {sentiment:'unknown'} لو فشل مرتين. callModel اختيارى للاختبار (موديل وهمى).
 */
async function analyzeDisclosure(title, bodyText, company, opts) {
  opts = opts || {};
  const call = opts.callModel || defaultCall(provider(opts.env));
  if (!call) return { sentiment: 'unknown', error: 'no_ai_key' };
  const user = `الشركة: ${company || 'غير محددة'}\nالعنوان: ${title || ''}\nالنص:\n${String(bodyText || '').slice(0, 6000)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const v = validate(parseJson(await call(SYSTEM, user)));
      if (v) return v;
    } catch (e) {
      if (attempt === 1) return { sentiment: 'unknown', error: String(e.message || e).slice(0, 200) };
    }
  }
  return { sentiment: 'unknown', error: 'invalid_json' };
}

function defaultCall(p) {
  if (!p) return null;
  return async (system, user) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(p.url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key },
        body: JSON.stringify({
          model: p.model, temperature: 0.2, max_tokens: 400, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(p.name + ' HTTP ' + res.status);
      const data = await res.json();
      return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    } finally { clearTimeout(timer); }
  };
}

module.exports = { analyzeDisclosure, validate, parseJson, provider, SENTIMENTS, EVENTS };
