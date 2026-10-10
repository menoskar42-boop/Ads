// ===== سكربت تسخين النطق (يُشغَّل مرّة واحدة) =====
// يولّد أصوات كل جُمَل التطبيق الثابتة (حروف/أرقام/كلمات/عبارات ميزو للأولاد
// وللبنات) ويحفظها كملفات .mp3 **دائمة داخل المستودع** في مجلّد tts-prebuilt/.
// دي ملفات ثابتة تُشحَن مع كل نشر، فالذكاء الاصطناعي لا يُستدعى للنطق إطلاقاً بعد
// كده — الوحيد المتغيّر هو اسم الطفل (يُولَّد مرّة على الخادم عند كتابته).
//
// التشغيل (مرّة واحدة، يحتاج OPENAI_API_KEY مضبوط):
//   node server/warm-tts.js
// وبعدها اعمل commit لمجلّد server/tts-prebuilt/ عشان الملفات تفضل دائمة.
import fs from "node:fs";
import { DATASETS } from "../js/data/datasets.js";
import { MIZO_INTRO, MIZO_HELLO, MIZO_PRAISE, MIZO_ENCOURAGE, MIZO_GOAL, MIZO_CATCH } from "../js/games/character.js";
import { MIZO_SONG, MIZO_CHAT, MIZO_OOPS, MIZO_WELCOME, MIZO, femAdapt, storyTone } from "../js/data/mizo.js";
import { STORIES } from "../js/data/stories.js";
import { ttsCacheKey, ttsPrebuiltPath, TTS_MODEL, TTS_VOICE, TTS_PREBUILT_DIR, OPENAI_BASE } from "./openai.js";
import * as WP from "../js/data/writingPhrases.js";
import { hintForResult } from "../js/games/strokeJudge.js";
import { PREWRITING, AR as AR_STROKES } from "../js/data/strokes.js";

const MZ = MIZO.toneInstructions; // توجيهات لهجة ميزو (لمطابقة مفاتيح الكاش)
const AR = TTS_VOICE; // صوت ميزو الثابت (يطابق ما يقرأه الخادم بالظبط)
const EN = TTS_VOICE;

// عبارة المثال بلغة العنصر (نسخة مطابقة لِما في js/games/common.js)
function examplePhrase(item, lang) {
  return lang && lang.startsWith("en")
    ? `${item.name} for ${item.word}`
    : `${item.name} مثل ${item.word}`;
}

// بناء قائمة العبارات الفريدة { text, voice, instructions }
const seen = new Set();
const phrases = [];
function add(text, voice, instructions = "") {
  if (!text) return;
  const k = `${voice}|${instructions}|${text}`;
  if (seen.has(k)) return;
  seen.add(k);
  phrases.push({ text, voice, instructions });
}

for (const ds of Object.values(DATASETS)) {
  const voice = (ds.lang || "ar").startsWith("en") ? EN : AR;
  for (const item of ds.items) {
    if (ds.glyphKind === "number") {
      add(item.arName, AR);
      add(item.enName, EN);
      add(String(item.value), AR); // العدّ ينطق الرقم بالعربية
    } else {
      add(item.name, voice);
      if (item.word) add(examplePhrase(item, ds.lang || "ar"), voice);
      if (item.word) add(item.word, voice);
    }
  }
}

// عبارات الواجهة المتكرّرة (تشجيع/تعليمات)
[
  "أحسنت يا بطل!",
  "أحسنت! لقد أكملت المهمة",
  "رائع!",
  "حاول مرة أخرى",
  "كم عددها؟",
  "اقلب بطاقتين متشابهتين",
  "هذه سبورتك، اكتب وارسم ما تحب!",
  "حان وقت الراحة، أحسنت اليوم يا بطل",
].forEach((t) => add(t, AR));

// كل بنك عبارات ميزو الثابت — تُنطق دائماً بالعربية (AI مرّة واحدة ثم مخزَّنة)
// نُسخّن النسختين: المذكّر (الأصل/الأولاد) والمؤنّث (femAdapt/البنات) لتغطية الاتنين.
const addMizo = (t) => { add(t, AR, MZ); const f = femAdapt(t); if (f !== t) add(f, AR, MZ); };
[...MIZO_INTRO, ...MIZO_HELLO, ...MIZO_PRAISE, ...MIZO_ENCOURAGE, ...MIZO_GOAL, ...MIZO_CATCH, ...MIZO_SONG, ...MIZO_OOPS, ...MIZO_WELCOME].forEach(addMizo);
// دردشة ميزو (الأسئلة + كل الردود) بلهجته
MIZO_CHAT.forEach((s) => { addMizo(s.q); s.opts.forEach((o) => addMizo(o.r)); });
// سرد القصص: كل مشهد بنبرته الخاصّة حسب مزاجه (لمطابقة مفتاح Speech.say في story.js)
STORIES.forEach((story) => {
  story.scenes.forEach((sc) => add(sc.text, AR, storyTone(sc.mood)));
});

// جُمَل المعلّم الافتراضي لكل حرف/رقم: "هذا حرف ..." و"..." منفردة
for (const key of ["arabic", "english", "numbers"]) {
  const ds = DATASETS[key];
  if (!ds) continue;
  const voice = (ds.lang || "ar").startsWith("en") ? EN : AR;
  const noun = ds.glyphKind === "number" ? "رقم" : "حرف";
  for (const it of ds.items) {
    const label = it.name || it.arName || "";
    add(`هذا ${noun} ${label}`, voice);
    add(label, voice);
  }
}

// ===== الكتابة + الكابيتال/الصغير (٢٠٢٦-١٠-١٠) — من writingPhrases.js نفسه =====
// كل جملة ثابتة بتتنطق فى «ارسم الحرف» و«اكتب اسمك» والقلم والاختيار وألعاب Aa.
// tell() فى الشاشات بيأنّث للبنت ⇒ النسختين.
const addAr = (t) => { add(t, AR); const f = femAdapt(t); if (f !== t) add(f, AR); };
for (const r of ["wrong-start", "off-path", "backwards", "too-short", "reversed"]) {
  addAr(hintForResult(r, false));
  addAr(hintForResult(r, true));
}
Object.values(WP.ROUND_MSG).forEach(addAr);
[WP.GRIP_SAY, WP.PEN_ONLY_SAY, WP.PEN_ONLY_PARENT, ...WP.CHOOSER_TITLES].forEach(addAr);
PREWRITING.forEach((pw) => addAr(pw.say));
add("برافو", AR);
{
  const en = DATASETS.english.items;
  // «اكتب الحرف …» لكل حرف/رقم (الإنجليزى كابيتال وصغير)
  for (const it of DATASETS.arabic.items) addAr(WP.writeIntro("الحرف", it.name));
  for (const it of en) {
    addAr(WP.writeIntro("الحرف", it.name));
    addAr(WP.writeIntro("الحرف", `small ${it.lower}`));
    // الصغير: زرار 🔊 + جملة المثال لما يخلص
    add(`small ${it.lower}`, EN);
    add(examplePhrase({ name: `small ${it.lower}`, word: it.word }, "en"), EN);
    // ألعاب Aa: المعلّم/شوف واعرف/Memory + اصطياد/الناقص/المراجعة
    add(WP.bothCasesSay(it.char, it.lower), EN);
    add(WP.caseSay("small", it.lower), EN);
    add(WP.caseSay("capital", it.char), EN);
  }
  for (const it of DATASETS.numbers.items) addAr(WP.writeIntro("الرقم", it.arName));
  addAr(WP.writeIntro("الرقم", "صفر"));
  for (const it of DATASETS.englishNumbers.items) addAr(WP.writeIntro("الرقم", it.name));
  addAr(WP.writeIntro("الرقم", "zero"));
  Object.values(WP.CATCH_SAY).forEach(addAr);
  Object.values(WP.MISSING_SAY).forEach(addAr);
  // «اكتب اسمك»: الحرف بس (الاسم نفسه بيتولّد وقت التشغيل ومايتحفظش فى الكود — المستودع عام)
  const nameLetters = [...Object.keys(AR_STROKES), ...en.map((it) => it.char), ...en.map((it) => it.lower)];
  for (const ch of nameLetters) { addAr(WP.nameFirst(ch)); addAr(WP.nameNext(ch)); }
}

// ===== --dry: يعدّ الناقص بس (من غير مفتاح ولا تكلفة) — للفحص والـCI =====
if (process.argv.includes("--dry")) {
  const missing = phrases.filter((p) => !fs.existsSync(ttsPrebuiltPath(ttsCacheKey(p.text, p.voice, p.instructions))));
  console.log(`${phrases.length} عبارة ثابتة · موجود صوتها فى الكود: ${phrases.length - missing.length} · ناقص: ${missing.length}`);
  if (process.argv.includes("--list")) missing.forEach((p) => console.log(`  - ${p.text}`));
  process.exit(0);
}

// ===== التوليد المباشر إلى مجلّد الملفات الدائمة (بلا حاجة لخادم يعمل) =====
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) {
  console.error("✗ OPENAI_API_KEY غير مضبوط — لا يمكن توليد الأصوات. اضبط المفتاح ثم أعد التشغيل.");
  process.exit(1);
}
fs.mkdirSync(TTS_PREBUILT_DIR, { recursive: true });

// نولّد الصوت بنفس نبرة الخادم بالظبط عشان النتيجة تبقى متطابقة
async function generate(text, voice, instructions) {
  const r = await fetch(`${OPENAI_BASE}/audio/speech`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: voice || TTS_VOICE,
      input: String(text).slice(0, 600),
      response_format: "mp3",
      instructions:
        instructions ||
        "Speak slowly, warmly and clearly, like a friendly teacher for a 3-5 year old child.",
    }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

console.log(`🔥 تسخين النطق: ${phrases.length} عبارة فريدة → ${TTS_PREBUILT_DIR}`);

let done = 0, miss = 0, hit = 0, fail = 0;
for (const p of phrases) {
  const hash = ttsCacheKey(p.text, p.voice, p.instructions);
  const file = ttsPrebuiltPath(hash);
  if (fs.existsSync(file)) { hit++; done++; continue; } // موجود مسبقاً → بلا تكلفة
  try {
    const buf = await generate(p.text, p.voice, p.instructions);
    // كتابة ذرّية (atomic) لتفادي ملف ناقص لو انقطع التوليد في النص
    fs.writeFileSync(`${file}.tmp`, buf);
    fs.renameSync(`${file}.tmp`, file);
    miss++;
  } catch (e) {
    fail++;
    console.warn(`✗ ${p.text} — ${e.message}`);
  }
  done++;
  if (done % 25 === 0) console.log(`  … ${done}/${phrases.length}`);
}

console.log(
  `\n✅ تمّ. جديد (استُدعي الـ AI): ${miss} · موجود مسبقاً: ${hit} · فشل: ${fail}`
);
console.log("اعمل الآن: git add mykid/server/tts-prebuilt && commit — الملفات بقت دائمة.");
