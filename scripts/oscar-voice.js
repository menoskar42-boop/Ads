#!/usr/bin/env node
/**
 * صوت أوسكار (Oscar Personality) — يتشغّل مرة واحدة فى Shell ريبليت (محتاج OPENAI_API_KEY):
 *   node scripts/oscar-voice.js          ⇒ يولّد الناقص بس (الموجود مابيتعادش = مفيش تكلفة)
 *   node scripts/oscar-voice.js --dry    ⇒ يعدّ الناقص والتكلفة التقريبية من غير ما يولّد
 * الجمل: oscardrive-android/app/src/main/assets/oscar_lines.json · الناتج: drive-web/voice/<male|female>/
 * وبعدها Republish (ريبليت بيعمل commit للملفات مع النشر زى أصوات ميزو).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const V = require('../src/drive/voice');

(async () => {
  const dry = process.argv.includes('--dry');
  let missing = 0, made = 0, failed = 0, chars = 0;
  for (const voice of Object.keys(V.VOICES)) {
    const dir = path.join(V.VOICE_DIR, voice);
    fs.mkdirSync(dir, { recursive: true });
    for (const [id, byLang] of Object.entries(V.lines())) {
      for (const lang of ['ar', 'en']) {
        for (const t of byLang[lang] || []) {
          const f = path.join(dir, V.fileKey(t, voice, lang) + '.mp3');
          if (fs.existsSync(f)) continue;
          missing++; chars += t.length;
          if (dry) continue;
          try {
            const buf = await V.tts(t, voice, lang);
            fs.writeFileSync(f + '.tmp', buf);
            fs.renameSync(f + '.tmp', f);
            made++;
            console.log(`  ✓ ${voice}/${lang}/${id}: ${t}`);
          } catch (e) { failed++; console.warn(`  ✗ ${voice}/${lang}/${id}: ${e.message}`); }
        }
      }
    }
    if (!dry) fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(V.manifest(voice)));
  }
  if (dry) {
    const secs = chars / 12;
    console.log(`ناقص ${missing} جملة (≈ ${Math.ceil(secs / 60)} دقيقة صوت · ≈ $${((secs / 60) * 0.015).toFixed(2)})`);
  } else console.log(`اتعمل ${made} · فشل ${failed} · الـmanifest اتحدّث`);
  process.exit(failed ? 1 : 0);
})();
