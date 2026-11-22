'use strict';

// A few examples for the prompt, generated from the ONE table that the actions
// actually use (`sokro/lib/siteDict.js`) so the two can never drift apart.
const SITE_HINTS = require('../lib/siteDict').SITES
  .slice(0, 4).map((s) => s.label + '=' + s.domain).join(', ');

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
function heuristicPlan(goal, names, extConnected) {
  const g = ' ' + String(goal).toLowerCase().trim() + ' ';
  const has = (arr) => arr.some((w) => g.includes(w));
  const imageWords = ['صور', 'ارسم', 'إرسم', 'ارسملي', 'ارسملى', 'رسمة', 'رسمه', 'رسملي', 'ارسمه', 'لوجو', 'logo', 'draw', 'picture', 'image', 'رسم '];
  const searchWords = ['ابحث', 'ابحثلي', 'ابحثلى', 'دوّر', 'دور ', 'لاقي', 'لاقيلي', 'search', 'find ', 'google', 'جوجل'];
  const reportWords = ['تقرير', 'report', 'فيديو', 'video', 'ملف', 'حجز', 'احجز', 'book', 'انشر', 'بوست', 'post'];
  const makeVerbs = ['اعمل', 'اعملي', 'اعملى', 'اعمللي', 'اعمللى', 'اخلق', 'اخلقلي', 'صمم', 'صمملي', 'هات', 'هاتلي', 'عايز', 'عاوز', 'عايزة'];
  const wantImage = has(imageWords);
  const wantSearch = has(searchWords);
  // A concrete site to open/interact with → operate. This catches "افتح sylndr.com
  // واضغط..." even when the LLM planner fumbles and returns nothing, so the request
  // never dead-ends with "مش قادر أحدّد المطلوب".
  const domainRe = /\b((?:[a-z0-9-]+\.)+(?:com|net|org|io|eg|co|me|app|store|shop|dev|ai|gov|edu|sa|ae)(?:\.[a-z]{2})?)(\/[^\s]*)?/i;
  // الهدف بيتقصّ قبل الريجيكس.
  //
  // مراجعة خارجية قالت إن الريجيكس ده «ReDoS» بتراجع كارثي. اتقاس فعلاً:
  // النقطة فاصل صريح فمافيش انفجار أسّي — الزمن **تربيعي** لا أكتر (٢٠ ألف
  // مقطع منقّط ≈ ١٫٥ ثانية، و٥ آلاف ≈ ٨٠ مللي). فالعلاج مش إعادة كتابة
  // الريجيكس وكأنه متفجّر، ده إن المدخل يتحدّد — والهدف اللي طوله أكتر من
  // ٢ كيلو مش هدف أصلاً، وأي حسبة عليه ضياع وقت مهما كان شكل الريجيكس.
  const dm = String(goal).slice(0, 2000).match(domainRe);
  const interactWords = ['افتح', 'اضغط', 'دوس', 'حدد', 'فلتر', 'اختار', 'ادخل', 'روح', 'صفّي', 'اعمل فلتر', 'open', 'click', 'filter', 'select', 'go to', 'operate'];
  // A named site: with the extension → operate inside it; WITHOUT it → a site-scoped
  // web search (works with no browser).
  if (dm) {
    if (extConnected && names.has('operate')) {
      const url = 'https://' + dm[1] + (dm[2] || '');
      return { intent: 'operate', steps: [{ action: 'operate', input: { url, goal }, reason: 'موقع محدّد + إضافة موصولة' }], _heuristic: true };
    }
    if (names.has('search_web')) {
      return { intent: 'search', steps: [{ action: 'search_web', input: { query: 'site:' + dm[1] + ' ' + goal.replace(dm[0], '').trim() }, reason: 'بحث داخل الموقع (بدون متصفح)' }], _heuristic: true };
    }
  }
  if (wantSearch && !wantImage && names.has('search_web')) {
    return { intent: 'search', steps: [{ action: 'search_web', input: { query: goal }, reason: 'كلمات بحث صريحة' }], _heuristic: true };
  }
  // Interaction verbs → operate ONLY with the extension; otherwise fall through to a
  // plain web search so we never push a failing browser action.
  if (extConnected && has(interactWords) && names.has('operate') && !wantImage) {
    return { intent: 'operate', steps: [{ action: 'operate', input: { goal }, reason: 'تفاعل داخل موقع + إضافة موصولة' }], _heuristic: true };
  }
  const words = String(goal).trim().split(/\s+/);
  const makeVerb = makeVerbs.some((w) => words[0] && words[0].startsWith(w));
  if (names.has('generate_image') && (wantImage || (makeVerb && words.length <= 5 && !has(reportWords) && !wantSearch))) {
    return { intent: 'image', steps: [{ action: 'generate_image', input: { prompt: goal }, reason: 'طلب توليد صورة' }], _heuristic: true };
  }
  return null;
}

// Only `fill_submit` can actually TYPE into a site's box via the extension;
// `operate`/`navigate_site` only read. So when a step is really "type X and search
// in a site", rewrite it to fill_submit (auto-find the box, press Enter, keep the
// tab open) — works on ANY site, not just Google.
function extractSearchQuery(goal) {
  const g = String(goal || '');
  let m = g.match(/(?:ابحث|ابحثلي|دوّر|دور|اكتب|بحث|search|find|look up|type)[\s\S]*?(?:عن|على|بخصوص|for|about|:)\s+(.+)$/i);
  if (m && m[1]) return m[1].trim().replace(/^["'«»]+|["'«»]+$/g, '').trim();
  m = g.match(/(?:ابحث|ابحثلي|دوّر|دور|اكتب|search|find|type)\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();
  return '';
}
function isSimpleSearch(goal) {
  const g = String(goal || '').toLowerCase();
  if (!/ابحث|دوّر|دور|اكتب|بحث|search|find|look up|type/.test(g)) return false;
  // Skip genuinely multi-step interactive tasks — those still belong to operate.
  if (/فلتر|filter|قارن|compare|سجل دخول|login|checkout|اشتري|شراء|أضف للسلة|add to cart|ثم اضغط|then click/.test(g)) return false;
  return true;
}
/**
 * Drop steps that name a tool this request does not have.
 *
 * The catalog is what the model was SHOWN; this is what it is HELD to. A model
 * that asks for `operate` on a phone with no browser gets the step removed
 * rather than an executor error — and if that was the whole plan, the user is
 * told what is missing in one sentence instead of watching a task fail.
 */
function keepKnown(plan, names, browserNames) {
  if (!plan || !Array.isArray(plan.steps)) return plan;
  const kept = plan.steps.filter((s) => s && names.has(s.action));
  if (kept.length === plan.steps.length) return plan;
  const needsBrowser = new Set(browserNames || []);
  const droppedBrowser = plan.steps
    .filter((s) => s && !names.has(s.action))
    .some((s) => needsBrowser.has(s.action));
  plan.steps = kept;
  if (!kept.length && !plan.message) {
    plan.message = droppedBrowser
      ? 'ده محتاج متصفّح وأنا مش موصول بمتصفّحك دلوقتي. قولي المعلومة اللي عايزها وأنا أدوّرها لك، أو وصّل إضافة سوكرو من الكمبيوتر.'
      : 'مش لاقي أداة تعمل ده دلوقتي.';
  }
  return plan;
}

// Which actions need a browser is a property OF THE ACTIONS — each one declares
// `permissions: ['browser']`. Repeating the list here is how a sixth browser
// action gets written and silently keeps being offered on a phone.
function browserActionNames(ctx) {
  try {
    return ctx.actions.catalog().filter((a) => (a.permissions || []).includes('browser')).map((a) => a.name);
  } catch (_) { return []; }
}

function rewriteTypingSteps(plan, names) {
  if (!plan || !Array.isArray(plan.steps) || !names.has('fill_submit')) return plan;
  plan.steps = plan.steps.map((s) => {
    if (!s || !s.input) return s;
    if ((s.action === 'operate' || s.action === 'navigate_site') && /^https?:\/\//.test(String(s.input.url || ''))) {
      const g = String(s.input.goal || s.input.query || '');
      if (isSimpleSearch(g)) {
        const q = extractSearchQuery(g) || g;
        return { action: 'fill_submit', input: { url: s.input.url, fields: [{ selector: '', value: q }], submit: '', keepOpen: true }, reason: 'كتابة وبحث في خانة الموقع' };
      }
    }
    return s;
  });
  return plan;
}

/**
 * Can anything actually drive a browser right now?
 *
 * Two ways: the user's own browser through the extension, or server-side
 * Chromium. On a phone with neither, the browser actions are not "unreliable" —
 * they are impossible, and every plan that reaches for one ends as an apology.
 */
function browserPossible(ctx) {
  let ext = false;
  try { ext = !!(ctx && ctx.userId && require('../extension-bridge').connected(ctx.userId)); } catch (_) {}
  let server = false;
  try { server = !!(ctx && ctx.browser && ctx.browser.available()); } catch (_) {}
  return { ext, server, any: ext || server };
}

async function plan(ctx, goal, recentContext = []) {
  // The live-browser tools (browse/operate/fill_submit/navigate_site/extract_table)
  // all declare the `browser` permission. With no way to run a browser they are
  // REMOVED FROM THE CATALOG rather than discouraged in the prompt: a tool the
  // model can still see is a tool it will still choose, and the failure lands on
  // the user as "install the extension" for something they asked innocently.
  const B = browserPossible(ctx);
  const catalog = ctx.actions.catalog(B.any ? undefined : { without: ['browser'] });
  const extConnected = B.ext;
  const base = [
    'You are Sokro, an AI operating system that EXECUTES real tasks, not just answers.',
    'The user goal is often in Egyptian Arabic. Output a MINIMAL step-by-step plan as JSON.',
    'STRONGLY prefer to ACT: if ANY action can plausibly fulfill the request, USE it with your best-guess concrete input — do not return empty just because you are unsure.',
    'TOP PRIORITY: if the user is asking to FIND OUT information / prices / facts / news ("ابحثلي عن أسعار X"، "معلومات عن Y"، "كام سعر Z"، "أخبار كذا"، "find/search for prices of X"), use search_web (input.query = the whole query) — or research_report for a deep report.',
    'Intent → action examples: "اعمل/اعملي/اعمللي/اخلق/ارسم/ارسملي/هاتلي/عايز/عاوز صورة" OR the same verbs + a bare noun like "قطة/كلب/منظر/لوجو/بيت" (WITHOUT the word صورة) → generate_image (input.prompt = a rich description of the thing to draw). "make/create/draw/generate a cat/picture/logo" → generate_image.',
    '"ابحث/دوّر/لاقي/ابحثلي" or "search/find/look up" → search_web (input.query). "ابحث واعمل تقرير" or "research and report" → research_report (input.query).',
    // The domains are read from the table, not repeated here: a prompt line and
    // a lookup table that disagree is how «سيلندر» became `selender.com`.
    'When the user says "ابحث/دوّر جوّه/في موقع X عن Y" or "search inside site X for Y", use search_web with input.query = "site:<domain-of-X> Y" (e.g. ' + SITE_HINTS + ').',
    'For a site you do not know the domain of, pass the NAME the user said as input.url — it is resolved from a table of known sites, and a name that is not in it is searched for. Do NOT invent a domain.',
  ];
  // Browser-routing guidance — INCLUDED ONLY when the extension is connected.
  const browserRules = [
    extConnected
      ? 'The user\'s live browser (Sokro extension) IS connected, so you can act inside sites.'
      : 'A server-side browser is available, so you can open and read sites (the user\'s own logged-in sessions are NOT available).',
    'If the user just wants to OPEN a site ("افتح جوجل"، "روح لموقع X"، "open X") WITHOUT reading/extracting, use browse with input.url = the site AND input.keepOpen = true.',
    'If they want to OPEN a site and TYPE in its search box then submit ("افتح جوجل واكتب/ابحث عن كذا"، "دوّر على كذا في يوتيوب"), use fill_submit: input.url = the site, input.fields = [{"selector":"","value":"<text>"}], input.submit = "", input.keepOpen = true.',
    'For tasks that INTERACT inside a site — filters, pick a make/model, click into an item, read what appears ("دوّر على رينو ميجان في سيلندر") — use operate with input.url = the site homepage (prefer www) and input.goal = the full task. For reading by following links use navigate_site; for a SINGLE known page use browse.',
    'NEVER reply with manual step-by-step instructions telling the user to open a site themselves — ACT using the tools above.',
  ];
  // No-browser guidance — when the extension is NOT connected, keep everything to
  // tools that don't need a live browser.
  const noBrowserRules = [
    // The tools are already gone from the catalog above; this only explains the
    // absence so the model routes around it instead of apologising.
    'The live browser is NOT available right now, so the browsing tools are not in your catalog at all. For anything that would need a website, use search_web (for a specific site use input.query = "site:<domain> <what they want>"), generate_image, or research_report instead. Never tell the user to open a site manually — give them the answer via search_web.',
  ];
  const tail = [
    'Rule of thumb: if the user names a THING to be created (an image, drawing, logo, character, scene) and no other action fits better, default to generate_image rather than returning empty.',
    'Only use actions from the catalog and give concrete `input` for each step. Return empty steps ONLY if truly NO action applies, and then set "message" to a SHORT helpful Arabic sentence telling the user what you CAN do.',
    'Respond ONLY as JSON: {"intent":"short","steps":[{"action":"name","input":{...},"reason":"why"}],"message":"optional"}',
  ];
  const sys = base.concat(B.any ? browserRules : noBrowserRules).concat(tail).join(' ');
  const names = new Set(catalog.map((a) => a.name));
  const user = `Available actions:\n${catalogText(catalog)}\n\nUser goal: ${goal}`;
  const messages = [{ role: 'system', content: sys }, ...recentContext, { role: 'user', content: user }];
  // Ask the LLM, but never let a thrown/absent model turn an obvious command
  // into a dead end — fall back to the deterministic heuristic below.
  let out = null;
  try { out = await llm.json({ messages }); } catch (e) { out = null; }
  if (out && Array.isArray(out.steps) && out.steps.length) {
    const cleaned = keepKnown(out, names, browserActionNames(ctx));
    if (cleaned.steps.length) return rewriteTypingSteps(cleaned, names);
    return cleaned;   // nothing survived: the message says why
  }
  // LLM returned nothing usable (empty steps, unparseable, or unavailable):
  // try the deterministic heuristic so "ارسم صورة قطة" / "ابحثلي..." still run.
  const h = heuristicPlan(goal, names, B.any);
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
  const cfg = require('../core/config').llm.openai;
  // Model on the size of the TASK: a deep report earns the SMART model; a plain
  // search / browse / image gets summarized by the cheap FAST model.
  const heavy = (results || []).some((r) => r && r.action === 'research_report' || (r && r.result && r.result.output && r.result.output.report));
  const model = heavy ? cfg.smartModel : cfg.fastModel;
  const sys = preamble + ' ' + langInstr +
    ' Read the results and answer the user in a short, natural SUMMARY (not a list of links). Judge whether the results actually achieve the goal (an empty search or a form that did not submit = NOT achieved). ' +
    'Reply ONLY as JSON: {"summary":"1-3 short sentences answering the user","achieved":true|false}.';
  const user = `Goal: ${goal}\nResults: ${JSON.stringify(results).slice(0, 4000)}`;
  try {
    const out = await llm.json({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] });
    if (out && typeof out.summary === 'string') return { summary: out.summary, achieved: out.achieved !== false };
  } catch (_) {}
  try { const { text } = await llm.chat({ model, messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }); return { summary: text, achieved: true }; }
  catch (_) { return { summary: null, achieved: true }; }
}

// Exported for the guard: these three decide what the model is allowed to
// choose, and a rule that cannot be run in a test is a rule nobody is checking.
module.exports = { plan, summarize, _internals: { heuristicPlan, keepKnown, browserPossible, browserActionNames } };
