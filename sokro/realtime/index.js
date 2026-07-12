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
  const list = registry.catalog()
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
  // Client-side control tool: lets the user END the call by voice. The model
  // calls this whenever the user asks to stop/close/hang up; the browser handles
  // it by closing the WebRTC connection (the model can't close it itself).
  list.push({
    type: 'function',
    name: 'end_call',
    description: 'End / hang up the live voice call. Call this immediately whenever the user asks to stop, close, end, or hang up the call (e.g. "اقفل المكالمة", "خلاص كفاية", "أوقف المكالمة", "hang up", "end call").',
    parameters: { type: 'object', properties: {} },
  });
  return list;
}

async function session(userId) {
  const key = config.llm.openai.apiKey;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  const s = await settings.get(userId);
  const instructions = AP.buildPreamble(s) + ' ' + lang.replyInstruction(s.lang) +
    ' You are a live voice assistant. You can EXECUTE tasks by calling the provided tools (search the web, generate images, research + report, browse sites). ' +
    'Whenever you need to do something EXTERNAL that takes a moment (web search, browsing a site, generating an image, building a report), say EXACTLY ONE short natural sentence FIRST — then call the tool. ' +
    'Keep that opener to a single short line and VARY it every time — e.g. «ثواني هشوف», «خليني أتأكد», «ثانية بس أدوّرلك», «لحظة أراجع», «استنى أجيبهالك», OR anything similar in your own words — never the same one twice in a row, and never more than one sentence. ' +
    'After the tool returns, tell them the result naturally. Keep all spoken replies short, conversational, and non-repetitive.';
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
            // Better live transcription than whisper-1 (Egyptian Arabic/names/numbers).
            transcription: { model: process.env.SOKRO_REALTIME_TRANSCRIBE || 'gpt-4o-transcribe' },
            // server_vad gives natural barge-in (the user can interrupt the model).
            turn_detection: { type: 'server_vad', silence_duration_ms: 500 },
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
