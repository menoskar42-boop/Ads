'use strict';

// Action: generate an image from a text description via the OpenAI images API —
// no browser needed. Maps to "اخلقلي صورة وابعتهالي". Returns the image URL,
// which the voice UI displays with a download link.
const { register } = require('./_registry');
const config = require('../core/config');
const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

async function run(ctx, input) {
  const prompt = String((input && (input.prompt || input.description || input.query)) || '').trim();
  if (!prompt) return { ok: false, error: 'prompt required' };
  const key = config.llm.openai.apiKey;
  if (!key) return { ok: false, error: 'OPENAI_API_KEY not configured' };
  try {
    const r = await fetch(BASE + '/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: process.env.SOKRO_IMAGE_MODEL || 'dall-e-3', prompt, n: 1, size: (input && input.size) || '1024x1024' }),
    });
    if (!r.ok) return { ok: false, error: 'image gen ' + r.status + ': ' + (await r.text()).slice(0, 200) };
    const data = await r.json();
    const item = (data.data && data.data[0]) || {};
    const url = item.url || (item.b64_json ? ('data:image/png;base64,' + item.b64_json) : null);
    if (!url) return { ok: false, error: 'no image returned' };
    if (ctx && ctx.log) ctx.log('generate_image', { prompt });
    return { ok: true, output: { prompt, imageUrl: url } };
  } catch (e) {
    return { ok: false, error: 'image request failed: ' + e.message };
  }
}

register({
  name: 'generate_image',
  description: 'Generate an image from a text description and return its URL.',
  permissions: ['network'],
  inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, size: { type: 'string' } }, required: ['prompt'] },
  run,
});

module.exports = run;
