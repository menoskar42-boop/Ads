#!/usr/bin/env node
/**
 * صوت سفارى كيدز (ميزو) — ملفات فى الكود، مش قاعدة بيانات.
 *
 * المالك ٢٠٢٦-١٠-١٠: «كلام موديل الذكاء الاصطناعى يتسجّل بعد أول مرة نطق فى ملفات
 * الموقع، مش فى قاعدة البيانات… ولا فى قاعدة بيانات ريبليت».
 *
 * الطبقات:
 *   ١) ذاكرة السيرفر (أسرع حاجة)
 *   ٢) mykid/server/tts-prebuilt/*.mp3 — جوّه المستودع، بتتشحن مع كل نشر
 *   ٣) mykid/server/.tts-cache — قرص التشغيل (ريبليت بيمسحه مع كل Republish)
 *   ٤) الذكاء الاصطناعى — أول مرة بس، والنتيجة بتتحفظ فى (٣)
 * وكل جملة ثابتة بتتولّد مرة واحدة فى (٢) بـ warm-tts.js (GitHub Action
 * mykid-tts-prebuild.yml) — فبعد أول Republish مابتروحش للـAI تانى.
 *
 * ماينفعش يتحفظ فى الكود (المستودع عام): أسامى الأطفال وردود دردشة ميزو.
 *
 *   node scripts/check-mykid-tts.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const srv = raw('mykid/server/openai.js');
const tts = srv.slice(srv.indexOf('app.post("/api/tts"'), srv.indexOf('// ===== المساعد الصوتي'));
check('/api/tts مابيلمسش أى قاعدة بيانات (لا pg ولا pool ولا Replit DB)',
  !/\b(pool|pg|query\(|@replit\/database|REPLIT_DB_URL)\b/.test(srv), 'openai.js');
check('الترتيب: ذاكرة ← ملفات الكود (tts-prebuilt) ← قرص التشغيل ← الـAI',
  tts.indexOf('ttsMem.get(hash)') > 0
  && tts.indexOf('ttsMem.get(hash)') < tts.indexOf('for (const p of [ttsPrebuiltPath(hash), filePath])')
  && tts.indexOf('for (const p of [ttsPrebuiltPath(hash), filePath])') < tts.indexOf('/audio/speech'));
check('والصوت الجديد بيتحفظ ملف (مش قاعدة بيانات)', /fs\.promises\s*\.writeFile\(`\$\{filePath\}\.tmp`, buf\)/.test(tts));
check('قرص التشغيل (.tts-cache) مايدخلش المستودع — فيه أسامى أطفال والمستودع عام',
  /mykid\/server\/\.tts-cache\//.test(raw('.gitignore')));

const n = fs.readdirSync(path.join(ROOT, 'mykid/server/tts-prebuilt')).filter((f) => f.endsWith('.mp3')).length;
check('ملفات الصوت الجاهزة موجودة فى الكود', n > 900, n + ' ملف');

const wf = raw('.github/workflows/mykid-tts-prebuild.yml');
check('GitHub Action بيولّد الناقص مرة واحدة ويعمل commit للملفات فى الكود',
  /warm-tts\.js/.test(wf) && /git add mykid\/server\/tts-prebuilt/.test(wf) && /secrets\.OPENAI_API_KEY/.test(wf));
check('والـAction مابيضيفش قرص التشغيل ولا أى حاجة تانية', !/\.tts-cache/.test(wf.replace(/#.*$/gm, '')));

// الجُمَل الثابتة الجديدة كلها من writingPhrases.js (عشان warm-tts يشوفها)
const lits = [
  ['mykid/js/games/trace.js', /"برافو! (دلوقتى|مرة كمان|كتبته|رسمته|هنتمرّن)|تعالى نكتبه|ابدأ من النقطة الخضرا وامشي مع السهم/],
  ['mykid/js/games/grip.js', /"امسك القلم بصباعين|"اكتب بالقلم/],
  ['mykid/js/games/catch.js', /"اصطد الحرف (الصغير|الكابيتال)"|`\$\{kind\} \$\{want\}`/],
  ['mykid/js/games/lesson.js', /`Capital \$\{/],
  ['mykid/js/games/flashcards.js', /`Capital \$\{/],
  ['mykid/js/games/memory.js', /`Capital \$\{/],
];
const stray = lits.filter(([f, re]) => re.test(raw(f))).map(([f]) => f);
check('مفيش جملة ثابتة مكتوبة جوّه الشاشة بدل writingPhrases.js', stray.length === 0, stray.join(' '));

// warm-tts بيقرا writingPhrases وبيشتغل من غير مفتاح فى وضع --dry
let dry = '';
try {
  dry = execFileSync(process.execPath, ['--import', './server/_node-shim.mjs', 'server/warm-tts.js', '--dry'],
    { cwd: path.join(ROOT, 'mykid'), encoding: 'utf8', env: { ...process.env, OPENAI_API_KEY: '' } });
} catch (e) { dry = String(e.stdout || e.message); }
check('warm-tts --dry بيعدّ الجُمَل الثابتة (ومنها جُمَل الكتابة)', /عبارة ثابتة/.test(dry) && Number((dry.match(/(\d+) عبارة/) || [])[1]) > 1500, dry.trim());

console.log(fail === 0 ? '\n✅ صوت ميزو: ملفات فى الكود، مفيش قاعدة بيانات.' : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
