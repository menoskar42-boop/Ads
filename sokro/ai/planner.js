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

async function plan(ctx, goal, recentContext = []) {
  const catalog = ctx.actions.catalog();
  const sys = [
    'You are Sokro, an AI operating system that EXECUTES real tasks, not just answers.',
    'Given the user goal and the available actions, output a MINIMAL step-by-step plan.',
    'Rules: only use actions from the catalog; give concrete `input` for each step;',
    'if nothing fits, return empty steps with a short clarifying "message".',
    'Respond ONLY as JSON:',
    '{"intent":"short","steps":[{"action":"name","input":{...},"reason":"why"}],"message":"optional"}',
  ].join(' ');
  const user = `Available actions:\n${catalogText(catalog)}\n\nUser goal: ${goal}`;
  const messages = [{ role: 'system', content: sys }, ...recentContext, { role: 'user', content: user }];
  const out = await llm.json({ messages });
  if (!out || !Array.isArray(out.steps)) return { intent: 'unknown', steps: [], message: (out && out.message) || 'could not plan' };
  return out;
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
