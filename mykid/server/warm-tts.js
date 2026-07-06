// ===== سكربت تسخين النطق (يُشغَّل مرّة واحدة) =====
// يولّد أصوات كل محتوى التطبيق (حروف/أرقام/كلمات/أسماء) ويحفظها على القرص
// عبر نقطة /api/tts نفسها، فتُخزَّن كملفات .mp3 دائمة يُشارَكها كل الأطفال.
// بعد ذلك لا يُستدعى الذكاء الاصطناعي للنطق إطلاقاً — فقط الميكروفون.
//
// التشغيل (يحتاج الخادم يعمل + OPENAI_API_KEY مضبوط):
//   node server/warm-tts.js
// أو مع عنوان مختلف:  WARM_BASE=http://localhost:5000 node server/warm-tts.js
import { DATASETS } from "../js/data/datasets.js";
import { MIZO_INTRO, MIZO_HELLO, MIZO_PRAISE, MIZO_ENCOURAGE, MIZO_GOAL, MIZO_CATCH } from "../js/games/character.js";
import { MIZO_SONG, MIZO_CHAT, MIZO_OOPS, MIZO_WELCOME, MIZO, femAdapt, storyTone } from "../js/data/mizo.js";
import { STORIES } from "../js/data/stories.js";
const MZ = MIZO.toneInstructions; // توجيهات لهجة ميزو (لمطابقة مفاتيح الكاش)

const BASE = process.env.WARM_BASE || `http://localhost:${process.env.PORT || 5000}`;
const AR = "alloy"; // صوت ميزو الثابت للعربية (يطابق ما يرسله العميل)
const EN = "alloy"; // صوت ميزو الثابت للإنجليزية (موحّد كي لا يتغيّر الصديق)

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
// نُسخّن النسختين: المذكّر (الأصل) والمؤنّث (femAdapt) لتغطية الولد والبنت بلا توليد لاحق.
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

console.log(`🔥 تسخين النطق: ${phrases.length} عبارة فريدة → ${BASE}/api/tts`);

let done = 0, miss = 0, hit = 0, fail = 0;
for (const p of phrases) {
  try {
    const r = await fetch(`${BASE}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: p.text, voice: p.voice, instructions: p.instructions || undefined }),
    });
    if (!r.ok) { fail++; console.warn(`✗ (${r.status}) ${p.text}`); }
    else {
      const cache = r.headers.get("X-Cache");
      if (cache === "MISS") miss++; else hit++;
      // نستهلك الجسم لإغلاق الاتصال
      await r.arrayBuffer();
    }
  } catch (e) {
    fail++;
    console.warn(`✗ خطأ شبكة: ${p.text} — ${e.message}`);
  }
  done++;
  if (done % 25 === 0) console.log(`  … ${done}/${phrases.length}`);
}

console.log(
  `\n✅ تمّ. جديد (استُدعي الـ AI): ${miss} · موجود مسبقاً: ${hit} · فشل: ${fail}`
);
console.log("الآن كل النطق محفوظ على القرص ويعمل بلا استهلاك للذكاء الاصطناعي.");
