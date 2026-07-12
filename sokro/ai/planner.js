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
    // Searching WITHIN a named website: never say "I can only use Google". Use a
    // site-scoped web search (works without a browser). Map the site name to its
    // domain and prefix the query with site:<domain>.
    'When the user says "ابحث/دوّر جوّه/في موقع X عن Y" or "search inside site X for Y", use search_web with input.query = "site:<domain-of-X> Y" (e.g. سليندر=sylndr.com, دوبيزل=dubizzle.com.eg, أمازون=amazon.eg, نون=noon.com).',
    // The user wants Sokro to ACT, not to hand them step-by-step instructions.
    // Plain "open/go to a site" (no scraping) → browse with keepOpen so the tab
    // STAYS open in front of the user, instead of flashing open then closing.
    'If the user just wants to OPEN a site and leave it in front of them ("افتح جوجل"، "افتح يوتيوب"، "روح لموقع X"، "open google", "go to X") WITHOUT asking to read/extract anything, use the browse action with input.url = the site AND input.keepOpen = true. Do NOT use operate for a simple open.',
    'CRITICAL: NEVER reply with manual step-by-step instructions telling the user how to open a site or search themselves. If they want to see content from INSIDE a site ("ادخل الموقع وشوف"، "اتصفّح جواه"، "هات العربيات من سليندر"، "open the site and get…"), USE the browse action (input.url = the site or a search/listing URL on that domain), optionally followed by extract_table. Acting is mandatory — do not explain how to do it manually.',
    // Typing into a site\'s search/input box then submitting → fill_submit (runs in
    // the user\'s live browser and LEAVES the tab open with the results).
    'If the user wants to OPEN a site and TYPE something in its search/input box and search/submit ("افتح جوجل واكتب/ابحث عن كذا"، "دوّر على كذا في يوتيوب"، "open X and search for Y"), use the fill_submit action: input.url = the site (e.g. https://www.google.com), input.fields = [{"selector":"","value":"<the text to type>"}] (leave selector empty to auto-find the search box), input.submit = "" (empty → it presses Enter), input.keepOpen = true. Do NOT use operate or navigate_site for a simple search-in-a-box.',
    'For tasks that need to INTERACT inside a site — apply filters, pick a make/model, click into a specific item, then read what appears (e.g. "دوّر على رينو ميجان في سيلندر وهات ملخص الفحص") — use the operate action (a click/type/scroll loop) with input.url = the site\'s HOMEPAGE root (prefer the www host, e.g. https://www.sylndr.com) and input.goal = the full task. For simply reading pages by following links use navigate_site; for a SINGLE known page use browse. Never use search_web for content that lives inside one site.',
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

// Short, user-facing summary AND a semantic check of whether the user's goal was
// actually achieved (not just "no step threw"). Folded into ONE JSON call so it
// adds no extra cost/latency. Returns { summary, achieved }.
async function summarize(ctx, goal, results) {
  const preamble = require('../assistant-profile').buildPreamble(ctx && ctx.prefs);
  const langInstr = require('../core/lang').replyInstruction(ctx && ctx.prefs && ctx.prefs.lang);
  const sys = preamble + ' ' + langInstr +
    ' Judge whether the results actually achieve the user\'s goal (not just that no error was thrown — e.g. an empty search or a form that did not submit means NOT achieved). ' +
    'Reply ONLY as JSON: {"summary":"1-3 short sentences for the user about what was done","achieved":true|false}.';
  const user = `Goal: ${goal}\nResults: ${JSON.stringify(results).slice(0, 4000)}`;
  try {
    const out = await llm.json({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
    if (out && typeof out.summary === 'string') return { summary: out.summary, achieved: out.achieved !== false };
  } catch (_) {}
  // Fallback: plain summary, achievement unknown (treated as achieved if steps ran).
  try { const { text } = await llm.chat({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }); return { summary: text, achieved: true }; }
  catch (_) { return { summary: null, achieved: true }; }
}

module.exports = { plan, summarize };
