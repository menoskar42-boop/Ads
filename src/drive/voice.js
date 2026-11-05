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
const INSTRUCTIONS = {
  ar: 'Speak in warm, friendly Egyptian Arabic (Cairo dialect), like a calm and confident car co-pilot. Short, clear, natural.',
  en: 'Speak in warm, friendly, clear English, like a calm and confident car co-pilot. Short and natural.',
};

const lines = () => JSON.parse(fs.readFileSync(LINES_FILE, 'utf8')).lines;
const fileKey = (text, voice, lang) => crypto.createHash('sha256').update(`${MODEL}|${voice}|${lang}|${INSTRUCTIONS[lang]}|${text}`).digest('hex').slice(0, 32);

async function tts(text, voiceName, lang, key = process.env.OPENAI_API_KEY) {
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

module.exports = { lines, fileKey, tts, manifest, VOICE_DIR, VOICES, INSTRUCTIONS };
