'use strict';

// Reply language / dialect the assistant uses when talking to the user. Drives
// both the LLM reply and the TTS delivery. Fully user-controlled (no hardcoding
// a single language) — new options are added here without touching callers.
const LANGS = {
  egyptian: {
    label: 'مصري',
    reply: 'Reply in warm, natural Egyptian Arabic (اللهجة المصرية العامية).',
    tts: 'Speak in warm, natural Egyptian Arabic.',
  },
  msa: {
    label: 'فصحى',
    reply: 'Reply in clear Modern Standard Arabic (العربية الفصحى).',
    tts: 'Speak in clear Modern Standard Arabic.',
  },
  english: {
    label: 'English',
    reply: 'Reply in clear, natural American English.',
    tts: 'Speak in clear, natural American English.',
  },
};

function get(lang) { return LANGS[lang] || LANGS.egyptian; }
function replyInstruction(lang) { return get(lang).reply; }
function ttsInstruction(lang) { return get(lang).tts; }

module.exports = { LANGS, get, replyInstruction, ttsInstruction };
