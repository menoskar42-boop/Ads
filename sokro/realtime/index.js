'use strict';

// ── Realtime voice (OpenAI Realtime API) ─────────────────────────────────────
// Powers a live, low-latency speech-to-speech call (like ChatGPT Voice). The
// browser connects DIRECTLY to OpenAI over WebRTC using a short-lived ephemeral
// token minted here — our permanent API key never reaches the client. The model
// can EXECUTE Sokro actions mid-call via function-calling (tools = the registry).
const config = require('../core/config');
const settings = require('../settings');
const registry = require('../registry');
const permissions = require('../permissions');
const AP = require('../assistant-profile');
const lang = require('../core/lang');

const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

function tools() {
  // Only expose NON-sensitive tools to the live model. Sensitive ones
  // (browser/login/social/payment…) require explicit consent, which the realtime
  // tool-call bridge can't collect mid-call — so they're withheld here and the
  // consent-gated /api/run flow remains the only path to them.
  return registry.catalog()
    .filter((c) => { const cap = registry.get(c.name); return !permissions.isSensitive(cap && cap.permissions); })
    .map((c) => {
      const cap = registry.get(c.name);
      return {
        type: 'function',
        name: c.name,
        description: c.description || '',
        parameters: (cap && cap.inputSchema) || { type: 'object', properties: { query: { type: 'string' } } },
      };
    });
}

async function session(userId) {
  const key = config.llm.openai.apiKey;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  const s = await settings.get(userId);
  const instructions = AP.buildPreamble(s) + ' ' + lang.replyInstruction(s.lang) +
    ' You are a live voice assistant. You can EXECUTE tasks by calling the provided tools (search the web, generate images, research + report, browse sites). ' +
    'When the user asks for something a tool can do, call it, then tell them the result naturally. Keep spoken replies short and conversational.';
  const voice = s.voice === 'male' ? 'ash' : 'shimmer';
  const model = process.env.SOKRO_REALTIME_MODEL || 'gpt-realtime';

  // GA Realtime API: mint an ephemeral client secret via /realtime/client_secrets
  // (the old beta /realtime/sessions endpoint returns 404 "Invalid URL"). The
  // session config now nests audio.input/output and lives under a `session` key.
  const r = await fetch(BASE + '/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: {
        type: 'realtime',
        model,
        instructions,
        audio: {
          input: {
            transcription: { model: 'whisper-1' },
            turn_detection: { type: 'server_vad' },
          },
          output: { voice },
        },
        tools: tools(),
        tool_choice: 'auto',
      },
    }),
  });
  if (!r.ok) throw new Error('realtime client_secret ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const data = await r.json();
  // GA returns the ephemeral key as a top-level `value` (ek_...).
  return { model, clientSecret: data.value || (data.client_secret && data.client_secret.value), raw: data };
}

module.exports = { session, tools };
