'use strict';

// ── AI Planner ───────────────────────────────────────────────────────────────
// Turns a natural-language goal into an executable plan (an ordered list of
// Actions with concrete inputs). Intent detection is folded into the same LLM
// call to save tokens. Uses the configured provider via the LLM layer, so it is
// vendor-agnostic. The model only sees ACTION NAMES + DESCRIPTIONS — never any
// secret/credential.
const llm = require('../llm');

function catalogText(catalog) {
  return catalog.map((a) => `- ${a.name}: ${a.description}`).join('\n');
}

// Deterministic fast-path / safety net for the two most common commands. It runs
// with NO LLM, so an obvious "draw a cat" / "search X" NEVER fails just because
// the model was flaky, unavailable, or returned empty steps. Used both as a
// fast path and as the fallback when the LLM produces nothing usable.
function heuristicPlan(goal, names) {
  const g = ' ' + String(goal).toLowerCase().trim() + ' ';
  const has = (arr) => arr.some((w) => g.includes(w));
  const imageWords = ['صور', 'ارسم', 'إرسم', 'ارسملي', 'ارسملى', 'رسمة', 'رسمه', 'رسملي', 'ارسمه', 'لوجو', 'logo', 'draw', 'picture', 'image', 'رسم '];
  const searchWords = ['ابحث', 'ابحثلي', 'ابحثلى', 'دوّر', 'دور ', 'لاقي', 'لاقيلي', 'search', 'find ', 'google', 'جوجل'];
  const reportWords = ['تقرير', 'report', 'فيديو', 'video', 'ملف', 'حجز', 'احجز', 'book', 'انشر', 'بوست', 'post'];
  const makeVerbs = ['اعمل', 'اعملي', 'اعملى', 'اعمللي', 'اعمللى', 'اخلق', 'اخلقلي', 'صمم', 'صمملي', 'هات', 'هاتلي', 'عايز', 'عاوز', 'عايزة'];
  const wantImage = has(imageWords);
  const wantSearch = has(searchWords);
  if (wantSearch && !wantImage && names.has('search_web')) {
    return { intent: 'search', steps: [{ action: 'search_web', input: { query: goal }, reason: 'كلمات بحث صريحة' }], _heuristic: true };
  }
  const words = String(goal).trim().split(/\s+/);
  const makeVerb = makeVerbs.some((w) => words[0] && words[0].startsWith(w));
  if (names.has('generate_image') && (wantImage || (makeVerb && words.length <= 5 && !has(reportWords) && !wantSearch))) {
    return { intent: 'image', steps: [{ action: 'generate_image', input: { prompt: goal }, reason: 'طلب توليد صورة' }], _heuristic: true };
  }
  return null;
}

async function plan(ctx, goal, recentContext = []) {
  const catalog = ctx.actions.catalog();
  const sys = [
    'You are Sokro, an AI operating system that EXECUTES real tasks, not just answers.',
    'The user goal is often in Egyptian Arabic. Output a MINIMAL step-by-step plan as JSON.',
    'STRONGLY prefer to ACT: if ANY action can plausibly fulfill the request, USE it with your best-guess concrete input — do not return empty just because you are unsure.',
    // Image intent — do NOT require the literal word "صورة". A make/draw/want verb
    // followed by a CONCRETE NOUN (animal, object, scene, person, logo…) means
    // "generate an image of that noun". e.g. "اعملي قطة"/"اعمللي قطه"/"ارسملي كلب"/
    // "هاتلي منظر بحر"/"عايز لوجو لمطعم" → generate_image with input.prompt = that noun, richly described.
    'Intent → action examples: "اعمل/اعملي/اعمللي/اخلق/ارسم/ارسملي/هاتلي/عايز/عاوز صورة" OR the same verbs + a bare noun like "قطة/كلب/منظر/لوجو/بيت" (WITHOUT the word صورة) → generate_image (input.prompt = a rich description of the thing to draw). "make/create/draw/generate a cat/picture/logo" → generate_image.',
    '"ابحث/دوّر/لاقي/ابحثلي" or "search/find/look up" → search_web (input.query). "ابحث واعمل تقرير" or "research and report" → research_report (input.query).',
    'Rule of thumb: if the user names a THING to be created (an image, drawing, logo, character, scene) and no other action fits better, default to generate_image rather than returning empty.',
    'Only use actions from the catalog and give concrete `input` for each step. Return empty steps ONLY if truly NO action applies, and then set "message" to a SHORT helpful Arabic sentence telling the user what you CAN do.',
    'Respond ONLY as JSON: {"intent":"short","steps":[{"action":"name","input":{...},"reason":"why"}],"message":"optional"}',
  ].join(' ');
  const names = new Set(catalog.map((a) => a.name));
  const user = `Available actions:\n${catalogText(catalog)}\n\nUser goal: ${goal}`;
  const messages = [{ role: 'system', content: sys }, ...recentContext, { role: 'user', content: user }];
  // Ask the LLM, but never let a thrown/absent model turn an obvious command
  // into a dead end — fall back to the deterministic heuristic below.
  let out = null;
  try { out = await llm.json({ messages }); } catch (e) { out = null; }
  if (out && Array.isArray(out.steps) && out.steps.length) return out;
  // LLM returned nothing usable (empty steps, unparseable, or unavailable):
  // try the deterministic heuristic so "ارسم صورة قطة" / "ابحثلي..." still run.
  const h = heuristicPlan(goal, names);
  if (h) return h;
  return {
    intent: 'unknown',
    steps: [],
    message: (out && out.message) || 'مش قادر أحدّد المطلوب — جرّب مثلاً «ارسملي صورة قطة» أو «ابحثلي عن أسعار كذا».',
  };
}

// Short, user-facing natural-language summary of what happened.
async function summarize(ctx, goal, results) {
  const preamble = require('../assistant-profile').buildPreamble(ctx && ctx.prefs);
  const langInstr = require('../core/lang').replyInstruction(ctx && ctx.prefs && ctx.prefs.lang);
  const sys = preamble + ' ' + langInstr + ' Summarize the outcome for the user in 1-3 short sentences. Be concrete about what was done.';
  const user = `Goal: ${goal}\nResults: ${JSON.stringify(results).slice(0, 4000)}`;
  try {
    const { text } = await llm.chat({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
    return text;
  } catch (_) { return null; }
}

module.exports = { plan, summarize };
