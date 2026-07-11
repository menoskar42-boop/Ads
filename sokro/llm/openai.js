'use strict';

// OpenAI adapter for the LLM Abstraction Layer. Talks to the REST API directly
// via global fetch (Node 18+) — no SDK dependency, so the layer stays light and
// swapping providers never touches callers. Self-registers as 'openai'.
const config = require('../core/config');
const { register } = require('./index');

const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

function makeProvider() {
  const { apiKey, planModel, smartModel } = config.llm.openai;

  async function chat({ messages, model, json = false, temperature = 0.2, maxTokens } = {}) {
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    const useModel = model || planModel;
    const reasoning = /^(gpt-5|o\d)/i.test(useModel); // gpt-5 / o-series
    const body = { model: useModel, messages };
    // Reasoning models reject a custom temperature and use max_completion_tokens.
    if (!reasoning) body.temperature = temperature;
    if (json) body.response_format = { type: 'json_object' };
    if (maxTokens) body[reasoning ? 'max_completion_tokens' : 'max_tokens'] = maxTokens;
    const r = await fetch(BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('openai chat ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const data = await r.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    return { text, raw: data };
  }

  // Convenience: parse a JSON reply safely (planner uses this).
  async function json(opts) {
    const { text } = await chat(Object.assign({ json: true }, opts));
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  async function embed(texts) {
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    const input = Array.isArray(texts) ? texts : [texts];
    const r = await fetch(BASE + '/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({ model: 'text-embedding-3-small', input }),
    });
    if (!r.ok) throw new Error('openai embed ' + r.status);
    const data = await r.json();
    return data.data.map((d) => d.embedding);
  }

  return {
    name: 'openai',
    configured: !!apiKey,
    models: { plan: planModel, smart: smartModel },
    chat, json, embed,
  };
}

register('openai', makeProvider);
module.exports = makeProvider;
