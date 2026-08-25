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

const YES = /^\s*(أيوه|ايوه|أيوة|تمام|ماشي|موافق|أكيد|اكيد|اه|آه|نعم|أكد|اكد|كمل|yes|ok|confirm|go ahead)[\s.!،؟]*$/i;
const NO = /^\s*(لأ|لا|بلاش|استنى|ألغي|الغي|no|cancel|stop)[\s.!،؟]*$/i;

function send(ws, data) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
async function event(callId, userId, type, payload) {
  await pool.query('INSERT INTO sokro_phone_events(call_id,user_id,event_type,payload) VALUES($1,$2,$3,$4::jsonb)', [callId, userId, type, JSON.stringify(payload || {})]).catch(() => {});
}
async function saveText(callId, userId, role, text) {
  if (!text) return;
  await event(callId, userId, role === 'user' ? 'transcript_user' : 'transcript_assistant', { text });
}
function toolList() {
  return realtime.tools().filter(x => x.name !== 'end_call');
}

function attach(wss) {
  wss.on('connection', async (twilio, request, claims) => {
    const callId = Number(claims.callId);
    const userId = Number(claims.sub);
    let streamSid = null, pending = null, openai = null;
    const prefs = await settings.get(userId).catch(() => ({}));
    await event(callId, userId, 'stream_connected', {});
    try {
      openai = new WebSocket('wss://api.openai.com/v1/realtime?model=' + encodeURIComponent(process.env.SOKRO_REALTIME_MODEL || 'gpt-realtime'), {
        headers: { Authorization: 'Bearer ' + (config.llm.openai.apiKey || ''), 'OpenAI-Beta': 'realtime=v1' },
      });
      openai.on('open', () => {
        send(openai, { type: 'session.update', session: {
          type: 'realtime', instructions: `أنت Sokro في مكالمة هاتفية عربية. تحدث باختصار وبوضوح. لا تنفذ أي إجراء حساس إلا بعد أن يقول المستخدم موافقة صريحة مثل أيوه أو تمام. إذا طلب المستخدم إنهاء المكالمة فأنهها.`,
          audio: { input: { format: { type: 'audio/pcmu' }, transcription: { model: process.env.SOKRO_REALTIME_TRANSCRIBE || 'gpt-4o-transcribe', language: 'ar' }, turn_detection: { type: 'server_vad', silence_duration_ms: 500 } }, output: { format: { type: 'audio/pcmu' }, voice: prefs.voice === 'male' ? 'ash' : 'shimmer' } },
          tools: toolList(), tool_choice: 'auto',
        }});
        send(openai, { type: 'response.create' });
      });
      openai.on('message', async raw => {
        let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
        await event(callId, userId, m.type || 'openai_event', m);
        if (m.type === 'response.function_call_arguments.done') {
          const action = registry.get(m.name);
          let args = {}; try { args = JSON.parse(m.arguments || '{}'); } catch (_) {}
          if (!action) return;
          if (permissions.isSensitive(action.permissions)) {
            pending = { name: m.name, callId: m.call_id, args };
            send(openai, { type: 'response.create', response: { instructions: 'اطلب من المستخدم تأكيدًا صريحًا الآن، وانتظر رده قبل تنفيذ الإجراء.' } });
          } else {
            const result = await action.run({ userId, llm: require('../llm'), memory: require('../memory'), browser: require('../browser'), actions: registry, consented: false, log: () => {} }, args).catch(e => ({ ok: false, error: e.message }));
            send(openai, { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: m.call_id, output: JSON.stringify(result) } });
            send(openai, { type: 'response.create' });
          }
        }
        if (/input_audio_transcription\.(completed|done)$/.test(m.type || '') && m.transcript) {
          await saveText(callId, userId, 'user', m.transcript);
          if (pending && YES.test(m.transcript.trim())) {
            const p = pending; pending = null;
            const action = registry.get(p.name);
            const result = await action.run({ userId, llm: require('../llm'), memory: require('../memory'), browser: require('../browser'), actions: registry, consented: true, log: () => {} }, { ...p.args, consent: true }).catch(e => ({ ok: false, error: e.message }));
            await audit.record(userId, 'phone_sensitive_action', { permissions: action.permissions, outcome: result.ok ? 'success' : 'failed' }).catch(() => {});
            send(openai, { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: p.callId, output: JSON.stringify(result) } });
            send(openai, { type: 'response.create' });
          } else if (pending && NO.test(m.transcript.trim())) {
            const p = pending; pending = null;
            send(openai, { type: 'conversation.item.create', item: { type: 'function_call_output', call_id: p.callId, output: JSON.stringify({ ok: false, error: 'user declined' }) } });
            send(openai, { type: 'response.create' });
          }
        }
        if ((m.type === 'response.audio.delta' || m.type === 'response.output_audio.delta') && m.delta && streamSid) {
          send(twilio, { event: 'media', streamSid, media: { payload: m.delta } });
        }
        if ((m.type === 'response.audio_transcript.done' || m.type === 'response.output_audio_transcript.done') && m.transcript) await saveText(callId, userId, 'assistant', m.transcript);
      });
      openai.on('error', e => event(callId, userId, 'openai_error', { error: e.message }));
    } catch (e) {
      await event(callId, userId, 'stream_error', { error: e.message });
      twilio.close();
    }
    twilio.on('message', async raw => {
      let m; try { m = JSON.parse(raw.toString()); } catch (_) { return; }
      if (m.event === 'start') { streamSid = m.start && m.start.streamSid; await event(callId, userId, 'twilio_start', { streamSid }); }
      else if (m.event === 'media' && openai) send(openai, { type: 'input_audio_buffer.append', audio: m.media.payload });
      else if (m.event === 'stop') { await event(callId, userId, 'twilio_stop', {}); if (openai) openai.close(); }
    });
    twilio.on('close', () => { if (openai) openai.close(); });
  });
}
module.exports = { attach };