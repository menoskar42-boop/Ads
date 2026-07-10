// Kakeibo AI layer — OpenAI, built for MINIMAL cost:
//  • local-first (free heuristics) before ever calling the model,
//  • structured JSON prompts, tiny max_tokens,
//  • every result cached in kkb_ai_cache so we never re-ask the same thing.
// Degrades gracefully: if OPENAI_API_KEY is unset, AI features are simply hidden
// and the local heuristics still work.
const crypto = require('crypto');
const { CATEGORY_KEYS } = require('./categories');

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function isEnabled() { return Boolean(process.env.OPENAI_API_KEY); }

async function chat(messages, opts) {
  opts = opts || {};
  const body = {
    model: opts.model || MODEL,
    messages,
    temperature: opts.temperature != null ? opts.temperature : 0.4,
    max_tokens: opts.maxTokens || 220,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); const e = new Error('OpenAI ' + res.status + ': ' + t.slice(0, 200)); e.status = res.status; throw e; }
  const data = await res.json();
  const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  const tokens = (data.usage && data.usage.total_tokens) || 0;
  return { text: text.trim(), tokens };
}

/* ─── Cache helpers ────────────────────────────────────── */
async function getCache(pool, userId, kind, ckey) {
  try {
    const r = await pool.query('SELECT content FROM kkb_ai_cache WHERE user_id=$1 AND kind=$2 AND ckey=$3', [userId, kind, ckey]);
    return r.rows.length ? r.rows[0].content : null;
  } catch (e) { return null; }
}
async function setCache(pool, userId, kind, ckey, content, tokens) {
  try {
    await pool.query(
      `INSERT INTO kkb_ai_cache (user_id, kind, ckey, content) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, kind, ckey) DO UPDATE SET content=EXCLUDED.content, created_at=now()`,
      [userId, kind, ckey, content]
    );
    if (tokens) await pool.query('INSERT INTO kkb_ai_usage (user_id, kind, tokens) VALUES ($1,$2,$3)', [userId, kind, tokens]);
  } catch (e) { console.error('[kkb ai cache]', e.message); }
}
function hash(s) { return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16); }

/* ─── Local-first categorizer (free) ───────────────────── */
const KEYWORDS = {
  food: ['مطعم', 'كافيه', 'قهوة', 'قهوه', 'بيتزا', 'برجر', 'اكل', 'أكل', 'طعام', 'وجبة', 'سوبر ماركت', 'بقالة', 'ماك', 'كنتاكي', 'restaurant', 'cafe', 'coffee', 'food', 'pizza', 'burger', 'grocery', 'lunch', 'dinner', 'breakfast'],
  transport: ['اوبر', 'أوبر', 'تاكسي', 'بنزين', 'وقود', 'مواصلات', 'مترو', 'قطر', 'اتوبيس', 'كريم', 'uber', 'careem', 'taxi', 'fuel', 'gas', 'metro', 'bus', 'transport'],
  bills: ['فاتورة', 'كهرباء', 'مياه', 'غاز', 'نت', 'انترنت', 'موبايل', 'إيجار', 'ايجار', 'اشتراك', 'bill', 'electric', 'water', 'internet', 'rent', 'subscription', 'phone'],
  entertainment: ['سينما', 'فيلم', 'العاب', 'لعبة', 'نتفليكس', 'حفلة', 'ترفيه', 'cinema', 'movie', 'game', 'netflix', 'spotify', 'party', 'fun'],
  health: ['دواء', 'صيدلية', 'دكتور', 'طبيب', 'مستشفى', 'تحاليل', 'اشعة', 'صحة', 'pharmacy', 'doctor', 'hospital', 'clinic', 'medicine', 'health'],
  shopping: ['ملابس', 'حذاء', 'تسوق', 'هدية', 'الكترونيات', 'موبايل جديد', 'clothes', 'shoes', 'shopping', 'gift', 'electronics', 'amazon', 'noon'],
  investment: ['سهم', 'اسهم', 'ذهب', 'استثمار', 'صندوق', 'شهادة', 'stock', 'gold', 'invest', 'fund', 'etf', 'crypto'],
  needs: ['احتياجات', 'ضروريات', 'needs', 'essentials'],
};
function localCategorize(text) {
  const s = String(text || '').toLowerCase();
  if (!s.trim()) return null;
  for (const cat of Object.keys(KEYWORDS)) {
    if (KEYWORDS[cat].some((k) => s.indexOf(k) !== -1)) return cat;
  }
  return null;
}

// Categorize a description. Local-first; AI only when local is unsure AND enabled.
// Cached per (user, description-hash) so repeated merchants cost nothing.
async function categorize(pool, userId, description, lang) {
  const local = localCategorize(description);
  if (local) return { category: local, source: 'local' };
  if (!isEnabled()) return { category: 'other', source: 'default' };
  const ckey = hash((lang || 'ar') + '|' + String(description || '').toLowerCase().trim());
  const cached = await getCache(pool, userId, 'categorize', ckey);
  if (cached && cached.category) return { category: cached.category, source: 'cache' };
  try {
    const { text, tokens } = await chat([
      { role: 'system', content: 'You classify a short expense description into exactly one category. Reply as JSON {"category":"<one of: ' + CATEGORY_KEYS.join(', ') + '>"}. No prose.' },
      { role: 'user', content: String(description || '').slice(0, 120) },
    ], { json: true, maxTokens: 20, temperature: 0 });
    let cat = 'other';
    try { const j = JSON.parse(text); if (CATEGORY_KEYS.includes(j.category)) cat = j.category; } catch (e) {}
    await setCache(pool, userId, 'categorize', ckey, { category: cat }, tokens);
    return { category: cat, source: 'ai' };
  } catch (e) { console.error('[kkb categorize]', e.message); return { category: 'other', source: 'error' }; }
}

// Generic cached text generator — returns cached text, else generates once and
// caches it. Returns null if AI is disabled (caller hides the feature).
async function cachedText(pool, userId, kind, ckey, messages, maxTokens) {
  const cached = await getCache(pool, userId, kind, ckey);
  if (cached && cached.text) return cached.text;
  if (!isEnabled()) return null;
  try {
    const { text, tokens } = await chat(messages, { maxTokens: maxTokens || 160, temperature: 0.5 });
    await setCache(pool, userId, kind, ckey, { text }, tokens);
    return text;
  } catch (e) { console.error('[kkb ' + kind + ']', e.message); return null; }
}

// A compact, personalized system prompt shared by the coaching features.
function coachSystem(lang) {
  return 'You are a warm, concise personal-finance coach using the Japanese Kakeibo method. '
    + 'Base EVERY statement on the user numbers provided — never invent figures. '
    + 'Reply in ' + (lang === 'en' ? 'English' : 'Egyptian Arabic') + ', plain text (no markdown), and keep it short.';
}

// Build a compact context line from the user's finances (kept tiny for cost).
function financeContext(profile, d, topCats) {
  const cur = profile.currency || 'EGP';
  const cats = (topCats || []).slice(0, 3).map((c) => c.key + '=' + Math.round(c.total)).join(', ');
  return [
    'currency=' + cur,
    'monthly_income=' + Math.round(Number(profile.monthly_income) || 0),
    'saving_goal=' + Math.round(Number(profile.saving_goal) || 0),
    'spent_this_period=' + Math.round(d.spentPeriod || 0),
    'remaining=' + Math.round(d.remaining || 0),
    'saving_rate=' + (d.savingRate || 0) + '%',
    'days_to_next_salary=' + (d.daysLeft || 0),
    'today_spent=' + Math.round(d.spentToday || 0),
    'top_categories(' + cur + '): ' + (cats || 'none'),
  ].join('; ');
}

module.exports = { isEnabled, chat, getCache, setCache, hash, localCategorize, categorize, cachedText, coachSystem, financeContext, MODEL };
