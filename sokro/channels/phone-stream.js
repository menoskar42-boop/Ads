'use strict';

// Twilio Media Streams <-> OpenAI Realtime bridge. Twilio and OpenAI both use
// G.711 μ-law here, so the server does not decode or persist audio bytes.
const WebSocket = require('ws');
const { Pool } = require('pg');
const auth = require('../auth');
const config = require('../core/config');
const settings = require('../settings');
const realtime = require('../realtime');
const registry = require('../registry');
const permissions = require('../permissions');
const audit = require('../audit');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const YES = /(?:^|\s)(أيوه|ايوه|أيوة|تمام|ماشي|موافق|موافقة|أكيد|اكيد|اه|آه|نعم|أكد|اكد|كمل|yes|ok|confirm|go ahead)(?:$|\s|[.!،؟])/i;
const NO = /(?:^|\s)(لأ|لا|بلاش|استنى|ألغي|الغي|مش موافق|no|cancel|stop)(?:$|\s|[.!،؟])/i;

function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function normalizeSpeech(text) {
  return String(text || '').normalize('NFKC').replace(/[ـ]/g, '').replace(/\s+/g, ' ').trim();
}
function isConfirmation(text) {
  const value = normalizeSpeech(text);
  return !!value && YES.test(value) && !NO.test(value);
}
function isDecline(text) {
  const value = normalizeSpeech(text);
  return !!value && NO.test(value);
}

// Provider events are useful for diagnosing a call, but the raw Realtime event
// can contain audio bytes, tool arguments, or other data that does not belong in
// a transcript. Persist only non-sensitive metadata; transcripts are stored
// separately by saveText below.
function safeProviderEvent(message) {
  const m = message && typeof message === 'object' ? message : {};
  const keep = [
    'type', 'event_id', 'session_id', 'response_id', 'item_id', 'call_id',
    'output_index', 'content_index', 'audio_start_ms', 'audio_end_ms',
    'name', 'status', 'error', 'delta',
  ];
  const out = {};
  for (const key of keep) {
    if (m[key] == null || key === 'delta') continue;
    if (key === 'error' && typeof m[key] === 'object') {
      out.error = { type: m[key].type, code: m[key].code, message: String(m[key].message || '').slice(0, 240) };
    } else if (typeof m[key] !== 'object') {
      out[key] = String(m[key]).slice(0, 240);
    }
  }
  if (m.type === 'response.function_call_arguments.done') out.hasArguments = true;
  return out;
}

async function event(callId, userId, type, payload) {
  const clean = payload && typeof payload === 'object' ? payload : {};
  await pool.query(
    'INSERT INTO sokro_phone_events(call_id,user_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)',
    [callId, userId, type, JSON.stringify(clean)]
  ).catch((e) => console.error('[sokro:phone] event record failed:', e.message));
}
async function saveText(callId, userId, role, text) {
  const value = normalizeSpeech(text);
  if (!value) return;
  await event(callId, userId, role === 'user' ? 'transcript_user' : 'transcript_assistant', { text: value.slice(0, 4000) });
}
function toolList() {
  return realtime.tools();
}

function attach(wss) {
  wss.on('connection', async (twilio, request, claims) => {
    const callId = Number(claims.callId);
    const userId = Number(claims.sub);
    let streamSid = null, pending = null, pendingTimer = null, openai = null;
    const audioBacklog = [];
    let openaiReady = false, twilioStarted = false, closed = false;
    let openaiQueue = Promise.resolve();
    const ownedCall = (await pool.query('SELECT id FROM sokro_phone_calls WHERE id=$1 AND user_id=$2', [callId, userId]).catch(() => ({ rows: [] }))).rows[0];
    if (!ownedCall) return twilio.close();
    const prefs = await settings.get(userId).catch(() => ({}));
    await event(callId, userId, 'stream_connected', {});
    const finish = async (reason) => {
      if (closed) return;
      closed = true;
      if (pendingTimer) clearTimeout(pendingTimer);
      pending = null;
      await event(callId, userId, 'stream_closed', { reason });
      try { if (openai && openai.readyState === WebSocket.OPEN) openai.close(); } catch (_) {}
      try { if (twilio.readyState === WebSocket.OPEN) twilio.close(); } catch (_) {}
    };
    const rejectPending = () => {
      if (!pending || !openai) return;
      const p = pending;
      pending = null;
      if (pendingTimer) clearTimeout(pendingTimer);
      send(openai, { type: 'conversation.item.create', item: {
        type: 'function_call_output', call_id: p.callId,
        output: JSON.stringify({ ok: false, error: 'confirmation timed out' }),
      }});
      send(openai, { type: 'response.create' });
      event(callId, userId, 'confirmation_expired', {}).catch(() => {});
    };
    const armConfirmationTimeout = () => {
      if (pendingTimer) clearTimeout(pendingTimer);
      pendingTimer = setTimeout(rejectPending, 60000);
    };
    const executePending = async (approved) => {
      if (!pending || !openai) return;
      const p = pending;
      pending = null;
      if (pendingTimer) clearTimeout(pendingTimer);
      const action = registry.get(p.name);
      if (!action) return;
      if (!approved) {
        send(openai, { type: 'conversation.item.create', item: {
          type: 'function_call_output', call_id: p.callId,
          output: JSON.stringify({ ok: false, error: 'user declined' }),
        }});
        send(openai, { type: 'response.create' });
        await event(callId, userId, 'confirmation_declined', {});
        return;
      }
      const result = await action.run({
        userId, llm: require('../llm'), memory: require('../memory'),
        browser: require('../browser'), actions: registry, consented: true, log: () => {},
      }, { ...p.args, consent: true }).catch(e => ({ ok: false, error: e.message }));
      await audit.record(userId, 'phone_sensitive_action', {
        permissions: action.permissions, outcome: result.ok ? 'success' : 'failed',
      }).catch(() => {});
      await event(callId, userId, 'confirmation_accepted', {
        action: p.name, outcome: result.ok ? 'success' : 'failed',
      });
      send(openai, { type: 'conversation.item.create', item: {
        type: 'function_call_output', call_id: p.callId, output: JSON.stringify(result),
      }});
      send(openai, { type: 'response.create' });
    };
    const handleOpenAiMessage = async (m) => {
      if (closed) return;
      await event(callId, userId, 'provider_event', safeProviderEvent(m));
      if (m.type === 'response.function_call_arguments.done') {
        if (m.name === 'end_call') {
          await event(callId, userId, 'user_requested_hangup', {});
          return finish('user_requested_hangup');
        }
        const action = registry.get(m.name);
        let args = {};
        try { args = JSON.parse(m.arguments || '{}'); } catch (_) {}
        if (!action) {
          send(openai, { type: 'response.create', response: { instructions: 'هذا الإجراء غير متاح في مكالمة هاتفية.' } });
          return;
        }
        if (permissions.isSensitive(action.permissions)) {
          pending = { name: m.name, callId: m.call_id, args };
          await event(callId, userId, 'confirmation_requested', { action: m.name });
          send(openai, { type: 'response.create', response: {
            instructions: 'اطلب من المستخدم تأكيدًا صريحًا الآن بكلمة مثل «أيوه» أو «أكد»، وانتظر رده قبل تنفيذ الإجراء. لا تنفذه الآن.',
          }});
          armConfirmationTimeout();
        } else {
          const result = await action.run({
            userId, llm: require('../llm'), memory: require('../memory'),
            browser: require('../browser'), actions: registry, consented: false, log: () => {},
          }, args).catch(e => ({ ok: false, error: e.message }));
          send(openai, { type: 'conversation.item.create', item: {
            type: 'function_call_output', call_id: m.call_id, output: JSON.stringify(result),
          }});
          send(openai, { type: 'response.create' });
        }
      }
      if (/input_audio_transcription\.(completed|done)$/.test(m.type || '') && m.transcript) {
        await saveText(callId, userId, 'user', m.transcript);
        if (pending && isConfirmation(m.transcript)) return executePending(true);
        if (pending && isDecline(m.transcript)) return executePending(false);
      }
      if ((m.type === 'response.audio.delta' || m.type === 'response.output_audio.delta') && m.delta && streamSid) {
        send(twilio, { event: 'media', streamSid, media: { payload: m.delta } });
      }
      if ((m.type === 'response.audio_transcript.done' || m.type === 'response.output_audio_transcript.done') && m.transcript) {
        await saveText(callId, userId, 'assistant', m.transcript);
      }
      if (m.type === 'input_audio_buffer.speech_started') {
        // Stop queued Twilio audio so a caller can interrupt a long answer.
        send(twilio, { event: 'clear', streamSid });
      }
    };
    try {
      openai = new WebSocket('wss://api.openai.com/v1/realtime?model=' + encodeURIComponent(process.env.SOKRO_REALTIME_MODEL || 'gpt-realtime'), {
        headers: { Authorization: 'Bearer ' + (config.llm.openai.apiKey || ''), 'OpenAI-Beta': 'realtime=v1' },
      });
      openai.on('open', () => {
        openaiReady = true;
        send(openai, { type: 'session.update', session: {
          type: 'realtime', instructions: `أنت Sokro في مكالمة هاتفية عربية. تحدث باختصار وبوضوح. لا تنفذ أي إجراء حساس إلا بعد أن يقول المستخدم موافقة صريحة مثل أيوه أو تمام. إذا طلب المستخدم إنهاء المكالمة فأنهها.`,
          audio: { input: { format: { type: 'audio/pcmu' }, transcription: { model: process.env.SOKRO_REALTIME_TRANSCRIBE || 'gpt-4o-transcribe', language: 'ar' }, turn_detection: { type: 'server_vad', silence_duration_ms: 500 } }, output: { format: { type: 'audio/pcmu' }, voice: prefs.voice === 'male' ? 'ash' : 'shimmer' } },
          tools: toolList(), tool_choice: 'auto',
        }});
        while (audioBacklog.length && openai.readyState === WebSocket.OPEN) {
          send(openai, { type: 'input_audio_buffer.append', audio: audioBacklog.shift() });
        }
        // TwiML speaks the initial greeting. Waiting for the Twilio start event
        // also prevents the first model audio from being dropped before the
        // streamSid is known.
        if (twilioStarted) send(openai, { type: 'response.create' });
      });
      openai.on('message', async raw => {
        let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
        openaiQueue = openaiQueue.then(() => handleOpenAiMessage(m)).catch(e => {
          event(callId, userId, 'stream_error', { error: String(e.message || e).slice(0, 240) }).catch(() => {});
        });
      });
      openai.on('error', e => {
        event(callId, userId, 'openai_error', { error: String(e.message || e).slice(0, 240) }).catch(() => {});
        finish('openai_error').catch(() => {});
      });
      openai.on('close', () => {
        openaiReady = false;
        if (!closed) finish('openai_closed').catch(() => {});
      });
    } catch (e) {
      await event(callId, userId, 'stream_error', { error: e.message });
      return finish('openai_setup_failed');
    }
    twilio.on('message', async raw => {
      let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
      if (m.event === 'start') {
        streamSid = m.start && m.start.streamSid;
        twilioStarted = true;
        await event(callId, userId, 'twilio_start', { streamSid });
        if (openaiReady) send(openai, { type: 'response.create' });
      }
      else if (m.event === 'media' && m.media && m.media.payload) {
        if (openai && openai.readyState === WebSocket.OPEN) {
          send(openai, { type: 'input_audio_buffer.append', audio: m.media.payload });
        } else if (audioBacklog.length < 100) {
          // The caller can speak over Twilio's greeting while the Realtime
          // socket is negotiating. Keep at most two seconds of 20ms frames so
          // the opening words are not silently lost.
          audioBacklog.push(m.media.payload);
        }
      }
      else if (m.event === 'stop') { await event(callId, userId, 'twilio_stop', {}); await finish('twilio_stop'); }
    });
    twilio.on('error', e => event(callId, userId, 'twilio_error', { error: String(e.message || e).slice(0, 240) }));
    twilio.on('close', () => { finish('twilio_closed').catch(() => {}); });
  });
}
module.exports = { attach, normalizeSpeech, isConfirmation, isDecline, safeProviderEvent };