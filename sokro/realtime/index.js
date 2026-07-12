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

// Browser/extension tools we DO expose in a live call: they run in the user's own
// browser (via the Sokro extension when connected) and are confirmed inline —
// by voice ("أكّد") — right before they act. This is the core product: control
// the browser by voice. Truly high-risk scopes (login/payment/social) stay out.
const IN_CALL_SENSITIVE = new Set(['browse', 'navigate_site', 'operate', 'extract_table']);

function tools() {
  // Expose non-sensitive tools + the browser tools above. The remaining sensitive
  // ones (login/payment/social) still route only through the consent-gated
  // /api/run flow.
  const list = registry.catalog()
    .filter((c) => { const cap = registry.get(c.name); return !permissions.isSensitive(cap && cap.permissions) || IN_CALL_SENSITIVE.has(c.name); })
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
  let extConnected = false;
  try { extConnected = !!require('../extension-bridge').connected(userId); } catch (_) {}
  const browserNote = extConnected
    ? 'The Sokro browser extension IS connected, so you CAN act inside the user\'s live logged-in browser: use browse / navigate_site / operate to open sites, follow links, search, click and read. When you call one of these, the user is asked to confirm once (they can say «أكّد» to approve) — proceed after that. NEVER say you cannot use the extension or control the browser; you can.'
    : 'You CAN control the browser and act inside sites via the Sokro extension, but it is NOT connected right now. If the user asks you to use the browser/extension, tell them briefly to open it from the «🧩 المتصفح» button (or /ext) and connect it, then you\'ll do it. Do NOT claim the capability doesn\'t exist — it does; it just needs connecting.';
  const instructions = AP.buildPreamble(s) + ' ' + lang.replyInstruction(s.lang) +
    ' You are a live voice assistant. You can EXECUTE tasks by calling the provided tools (search the web, generate images, research + report, browse sites, and OPERATE inside websites). ' + browserNote + ' ' +
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
