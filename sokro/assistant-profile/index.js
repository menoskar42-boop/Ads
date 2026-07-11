'use strict';

// ── Assistant Profile — Personality Engine ───────────────────────────────────
// Shapes WHO the assistant is (name + personality). The preamble is injected
// into the LLM system prompt before every reply, so the assistant always knows
// its identity and tone — with nothing hardcoded in the planner. Personalities
// are pluggable: add one with register(name, def), no code change elsewhere.
const PERSONALITIES = {
  professional: { label: 'احترافي', tone: 'professional, precise, businesslike', systemPrompt: 'Be concise and accurate. Avoid slang and filler.' },
  friendly: { label: 'ودود', tone: 'warm, friendly, encouraging', systemPrompt: 'Be warm and supportive; use an approachable tone.' },
  funny: { label: 'مرِح', tone: 'light, witty, upbeat', systemPrompt: 'Add a light touch of humor, but stay helpful and clear.' },
  minimal: { label: 'مختصر', tone: 'minimal, to-the-point', systemPrompt: 'Answer in as few words as possible. No preamble.' },
  teacher: { label: 'معلّم', tone: 'patient, explanatory', systemPrompt: 'Explain step by step and teach the reasoning simply.' },
};

function personality(name) { return PERSONALITIES[name] || PERSONALITIES.professional; }
function list() { return Object.keys(PERSONALITIES).map((k) => ({ name: k, label: PERSONALITIES[k].label })); }
function register(name, def) { PERSONALITIES[name] = def; }

// The identity+personality preamble prepended to every user-facing system prompt.
function buildPreamble(settings) {
  settings = settings || {};
  const name = settings.assistantName || 'Selena';
  const p = personality(settings.personality);
  return `You are ${name}, the user's personal AI assistant. Personality: ${p.tone}. ${p.systemPrompt}`;
}

module.exports = { personality, list, register, buildPreamble, PERSONALITIES };
