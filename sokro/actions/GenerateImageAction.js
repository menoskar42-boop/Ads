'use strict';

// Action: generate an image from a text description via the OpenAI images API —
// no browser needed. Maps to "اخلقلي صورة وابعتهالي". Returns the image URL,
// which the voice UI displays with a download link.
const { register } = require('./_registry');
const config = require('../core/config');
const fs = require('fs');
const path = require('path');
const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

// Persist the raw image bytes to public/uploads and return a SHORT same-origin
// URL instead of a multi-megabyte data: URL. Inlining base64 in the chat bloats
// the DOM/conversation (a single image blew a browser agent past 1M tokens) and
// bloats memory. Best-effort mirror to Object Storage so it survives redeploys.
function saveImage(b64) {
  try {
    const dir = path.join(__dirname, '..', '..', 'public', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    const name = 'sokro-img-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.png';
    const abs = path.join(dir, name);
    fs.writeFileSync(abs, Buffer.from(b64, 'base64'));
    try { require('../../src/lib/object_store').mirror(abs); } catch (_) {}
    return '/uploads/' + name;
  } catch (_) { return null; }
}

async function run(ctx, input) {
  const prompt = String((input && (input.prompt || input.description || input.query)) || '').trim();
  if (!prompt) return { ok: false, error: 'prompt required' };
  const key = config.llm.openai.apiKey;
  if (!key) return { ok: false, error: 'OPENAI_API_KEY not configured' };
  try {
    // gpt-image-1 is the current image model (dall-e-3 was retired — it now
    // rejects with invalid_value). gpt-image-1 does NOT accept response_format
    // and ALWAYS returns base64 (b64_json), never a URL, so we build a data URL
    // from the bytes below. Model + quality overridable via env.
    const model = process.env.SOKRO_IMAGE_MODEL || 'gpt-image-1';
    const body = { model, prompt, n: 1, size: (input && input.size) || '1024x1024' };
    if (/^gpt-image/i.test(model)) body.quality = process.env.SOKRO_IMAGE_QUALITY || 'medium';
    const r = await fetch(BASE + '/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, error: 'image gen ' + r.status + ': ' + (await r.text()).slice(0, 200) };
    const data = await r.json();
    const item = (data.data && data.data[0]) || {};
    // Prefer a short saved-file URL; fall back to the provider URL, then a data URL.
    let url = null;
    if (item.b64_json) url = saveImage(item.b64_json) || ('data:image/png;base64,' + item.b64_json);
    else if (item.url) url = item.url;
    if (!url) return { ok: false, error: 'no image returned' };
    if (ctx && ctx.log) ctx.log('generate_image', { prompt });
    return { ok: true, output: { prompt, imageUrl: url } };
  } catch (e) {
    return { ok: false, error: 'image request failed: ' + e.message };
  }
}

register({
  name: 'generate_image',
  description: 'Create, draw or generate an image/picture from a text description (e.g. "a cat", "قطة", "صورة منظر"). Returns the image URL.',
  permissions: ['network'],
  inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, size: { type: 'string' } }, required: ['prompt'] },
  run,
});

module.exports = run;
