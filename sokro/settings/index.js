'use strict';

// ── Per-user assistant settings ──────────────────────────────────────────────
// Stored per user in the durable JSONB context (sokro_user_context.data.assistant)
// so they persist and are loaded automatically before every conversation. The
// defaults live HERE in one place (no scattered hardcoding), and the JSONB shape
// is future-proof: adding a field (avatar, greeting, wake word…) needs no schema
// change. This is the lightweight home for the Assistant Profile settings.
const memory = require('../memory');

const DEFAULTS = {
  assistantName: 'Selena',
  voice: 'female',        // 'female' | 'male'
  lang: 'egyptian',       // 'egyptian' | 'msa' | 'english'  (default: Egyptian Arabic)
  personality: 'professional',
};

const VOICES = ['female', 'male'];
const LANGS = ['egyptian', 'msa', 'english'];
const PERSONALITIES = ['professional', 'friendly', 'funny', 'minimal', 'teacher'];

async function get(userId) {
  const ctx = await memory.getContext(userId);
  return Object.assign({}, DEFAULTS, (ctx && ctx.assistant) || {});
}

async function update(userId, patch) {
  patch = patch || {};
  const clean = {};
  if (VOICES.includes(patch.voice)) clean.voice = patch.voice;
  if (LANGS.includes(patch.lang)) clean.lang = patch.lang;
  if (PERSONALITIES.includes(patch.personality)) clean.personality = patch.personality;
  if (typeof patch.assistantName === 'string' && patch.assistantName.trim()) {
    clean.assistantName = patch.assistantName.trim().slice(0, 40);
  }
  const merged = Object.assign({}, await get(userId), clean);
  await memory.mergeContext(userId, { assistant: merged });
  return merged;
}

// Maps the user's voice choice to an OpenAI TTS voice.
function ttsVoice(gender) { return gender === 'male' ? 'onyx' : 'shimmer'; }

module.exports = { get, update, ttsVoice, DEFAULTS, VOICES, LANGS, PERSONALITIES };
