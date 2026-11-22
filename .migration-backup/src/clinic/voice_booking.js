// Voice booking: a patient sends a voice note instead of filling a form, and
// the clinic gets a booking request.
//
// Two AI steps, both on Groq (the same key the restaurant assistant uses):
//   1. Whisper transcribes the audio (Egyptian Arabic).
//   2. A small model turns that sentence into structured fields.
//
// The design rule throughout: this NEVER books silently on a guess. Anything
// the model is not sure about lands as 'needs_review' for the receptionist. A
// wrong auto-booking costs the clinic a slot and a patient's trust; an
// unreviewed queue item costs thirty seconds.
'use strict';

const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TRANSCRIBE_MODEL = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';
const PARSE_MODEL = process.env.GROQ_PARSE_MODEL || 'llama-3.1-8b-instant';

function groqKey() {
  return process.env.GROQ_API_KEY || process.env.GROQ_KEY || process.env.GROQ || '';
}
function isEnabled() { return Boolean(groqKey()); }

/**
 * Transcribe an audio buffer to text.
 * @returns {Promise<{ok:boolean, text?:string, error?:string}>}
 */
async function transcribe(buffer, filename = 'note.m4a') {
  const key = groqKey();
  if (!key) return { ok: false, error: 'AI key not configured' };
  try {
    const form = new FormData();
    form.append('file', new Blob([buffer]), filename);
    form.append('model', TRANSCRIBE_MODEL);
    // Telling Whisper the language up front measurably improves Egyptian Arabic
    // over letting it auto-detect, which often lands on Modern Standard.
    form.append('language', 'ar');
    form.append('response_format', 'json');

    const res = await fetch(GROQ_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      let detail = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j && j.error && j.error.message) detail = j.error.message; } catch (_) {}
      return { ok: false, error: detail };
    }
    const j = await res.json();
    const text = String(j.text || '').trim();
    if (!text) return { ok: false, error: 'empty transcript' };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const PARSE_SYSTEM = `أنت مساعد حجز في عيادة مصرية. هيوصلك نص رسالة صوتية من مريض.
استخرج منها البيانات دي فقط، وردّ بـJSON من غير أي شرح:
{
  "patient_name": "اسم المريض أو null",
  "phone": "رقم الموبايل بالأرقام الإنجليزية أو null",
  "doctor_hint": "اسم أو تخصص الطبيب المذكور أو null",
  "when_text": "الوقت زي ما قاله بالظبط (مثال: بكرة الصبح) أو null",
  "reason": "سبب الزيارة باختصار أو null",
  "confidence": 0.0
}
قواعد صارمة:
- متخترعش أي معلومة. اللي مش مذكور صراحةً خليه null.
- confidence من 0 لـ1: كام أنت واثق إن دي فعلاً طلب حجز وفهمتها صح.
- لو النص مش طلب حجز أصلاً، خلي confidence أقل من 0.3.`;

/**
 * Turn a transcript into structured booking fields.
 * @returns {Promise<{ok:boolean, data?:object, error?:string}>}
 */
async function parseIntent(transcript) {
  const key = groqKey();
  if (!key) return { ok: false, error: 'AI key not configured' };
  try {
    const res = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: PARSE_MODEL,
        temperature: 0,                       // extraction, not composition
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PARSE_SYSTEM },
          { role: 'user', content: String(transcript).slice(0, 2000) },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const j = await res.json();
    const raw = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    let data;
    try { data = JSON.parse(raw); } catch (_) { return { ok: false, error: 'model returned non-JSON' }; }

    // Normalise defensively — the model is instructed to use null but a missing
    // key or the string "null" must not reach the database as a real value.
    const clean = (v) => {
      const s = String(v == null ? '' : v).trim();
      return (!s || s === 'null' || s === 'undefined') ? null : s.slice(0, 200);
    };
    return {
      ok: true,
      data: {
        patient_name: clean(data.patient_name),
        phone: clean(data.phone),
        doctor_hint: clean(data.doctor_hint),
        when_text: clean(data.when_text),
        reason: clean(data.reason),
        confidence: Math.max(0, Math.min(1, Number(data.confidence) || 0)),
      },
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// A request is only auto-booked when the model is confident AND the two fields
// the clinic cannot work without are present. Everything else is queued for a
// human — deliberately conservative.
const AUTO_BOOK_CONFIDENCE = 0.75;
function canAutoBook(parsed) {
  return Boolean(parsed
    && parsed.confidence >= AUTO_BOOK_CONFIDENCE
    && parsed.patient_name
    && parsed.phone);
}

module.exports = { transcribe, parseIntent, canAutoBook, isEnabled, AUTO_BOOK_CONFIDENCE };
