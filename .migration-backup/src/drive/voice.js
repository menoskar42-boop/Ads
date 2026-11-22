// Oscar Personality — صوت أوسكار بيتولّد مرة واحدة بالذكاء الاصطناعى (OpenAI TTS، نفس طريقة ميزو فى mykid)
// وبيتحفظ mp3 فى drive-web/voice/<الصوت>/، والتطبيق بينزّله ويشغّله من غير نت ولا AI.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LINES_FILE = path.join(__dirname, '..', '..', 'oscardrive-android', 'app', 'src', 'main', 'assets', 'oscar_lines.json');
const VOICE_DIR = path.join(__dirname, '..', '..', 'drive-web', 'voice');
const MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const VOICES = { male: 'ash', female: 'coral' };
/*
 * ElevenLabs (المالك ٢٠٢٦-١١-١٨: «صوت أوسكار باين إنه ذكاء اصطناعى»): أصوات مصرية طبيعية اختارها المالك بالسمع —
 * Mostafa Mahmoud (راجل) و Ghozlan – Soft Clear (ست)، موديل eleven_multilingual_v2. فولدرات لوحدها (el-male / el-female)
 * والأصوات القديمة بتفضل زى ما هى لحد ما المالك يتأكد من الجودة على الشاشة (اختيار «نوع الصوت» فى الإعدادات).
 * ⚠️ مولّدة بالباقة المجانية للتجربة بس — قبل النشر الرسمى بتتعاد بباقة مدفوعة (استخدام تجارى).
 */
const EL_MODEL = 'eleven_multilingual_v2';
const EL_VOICES = { 'el-male': 'FXJhBZJ1DJMO0U4ZPSur', 'el-female': 'xPcC3nehhziQaOrIeAwv' };
const ALL_VOICES = [...Object.keys(VOICES), ...Object.keys(EL_VOICES)];
/** نطق مصرى: تشكيل خفيف على الكلمة اللى بتتقرا غلط بس (التشكيل الكامل بيخلّيها فصحى — تجربة المالك). */
const EL_SAY = [[/خلّى بالك/g, 'خَلّي بالَك'], [/جاهز ننطلق/g, 'جاهِز نِنْطِلِق']];
const elSay = (t) => EL_SAY.reduce((s, [re, to]) => s.replace(re, to), String(t));
const isEl = (v) => Object.prototype.hasOwnProperty.call(EL_VOICES, v);
const INSTRUCTIONS = {
  ar: 'Speak in warm, friendly Egyptian Arabic (Cairo dialect), like a calm and confident car co-pilot. Short, clear, natural.',
  en: 'Speak in warm, friendly, clear English, like a calm and confident car co-pilot. Short and natural.',
};

const lines = () => JSON.parse(fs.readFileSync(LINES_FILE, 'utf8')).lines;
const fileKey = (text, voice, lang) => crypto.createHash('sha256').update(isEl(voice)
  ? `el|${EL_MODEL}|${EL_VOICES[voice]}|${lang}|${elSay(text)}`
  : `${MODEL}|${voice}|${lang}|${INSTRUCTIONS[lang]}|${text}`).digest('hex').slice(0, 32);

async function elTts(text, voiceName, lang, key = process.env.ELEVENLABS_API_KEY) {
  if (!key) throw new Error('ELEVENLABS_API_KEY missing');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICES[voiceName]}?output_format=mp3_44100_64`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: elSay(text).slice(0, 300), model_id: EL_MODEL }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

async function tts(text, voiceName, lang, key) {
  if (isEl(voiceName)) return elTts(text, voiceName, lang, key);
  key = key || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, voice: VOICES[voiceName], input: String(text).slice(0, 300), instructions: INSTRUCTIONS[lang], response_format: 'mp3' }),
  });
  if (!r.ok) throw new Error(`TTS ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** manifest لكل صوت: { version, lines: { id: { ar: [{t, f}], en: [...] } } } — f = اسم الملف لو اتولّد. */
function manifest(voiceName) {
  const out = { version: 1, voice: voiceName, lines: {} };
  for (const [id, byLang] of Object.entries(lines())) {
    out.lines[id] = {};
    for (const lang of ['ar', 'en']) {
      out.lines[id][lang] = (byLang[lang] || []).map((t) => {
        const f = fileKey(t, voiceName, lang) + '.mp3';
        return fs.existsSync(path.join(VOICE_DIR, voiceName, f)) ? { t, f } : { t };
      });
    }
  }
  return out;
}

module.exports = { lines, fileKey, tts, manifest, VOICE_DIR, VOICES, INSTRUCTIONS, EL_VOICES, ALL_VOICES, isEl, elSay };
