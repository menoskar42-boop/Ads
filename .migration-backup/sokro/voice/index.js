'use strict';

// ── Voice (STT) ──────────────────────────────────────────────────────────────
// Server-side speech-to-text via OpenAI Whisper — the robust path for Arabic and
// for browsers/mobile without the Web Speech API. The single voice UI uses the
// browser's on-device recognition when available and falls back to this endpoint.
const config = require('../core/config');
const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

async function transcribe(buffer, filename = 'audio.webm', language = 'ar') {
  const key = config.llm.openai.apiKey;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  const form = new FormData();
  form.append('file', new Blob([buffer]), filename);
  // gpt-4o-transcribe recognises Egyptian Arabic, names and numbers better than
  // the original Whisper. Overridable (SOKRO_STT_MODEL) — e.g. back to whisper-1.
  form.append('model', process.env.SOKRO_STT_MODEL || 'gpt-4o-transcribe');
  if (language) form.append('language', language);
  const r = await fetch(BASE + '/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key },
    body: form,
  });
  if (!r.ok) throw new Error('whisper ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const data = await r.json();
  return data.text || '';
}

// ── Text-to-speech (Arabic-quality) ──────────────────────────────────────────
// High-quality natural speech via OpenAI TTS — far better than the browser's
// built-in Arabic voice. Returns an MP3 Buffer the client plays. Voice + model
// are configurable (default a warm female voice to match the assistant profile).
async function speak(text, opts = {}) {
  const key = config.llm.openai.apiKey;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  const model = opts.model || process.env.SOKRO_TTS_MODEL || 'gpt-4o-mini-tts';
  const voice = opts.voice || process.env.SOKRO_TTS_VOICE || 'shimmer';
  const body = { model, voice, input: String(text).slice(0, 4000), response_format: 'mp3' };
  // A light instruction nudges an Egyptian-Arabic delivery on models that honor it.
  if (/tts/.test(model)) body.instructions = opts.instructions || 'Speak in clear, warm Egyptian Arabic.';
  const r = await fetch(BASE + '/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('tts ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return Buffer.from(await r.arrayBuffer());
}

module.exports = { transcribe, speak };
