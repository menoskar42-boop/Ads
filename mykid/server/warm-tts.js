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
import { LB_LETTERS, LB_ORDER, LB_HARAKAT, LB_SHADOWS, LB_BUILD, nameOf as lbName, bare as lbBare } from "../js/data/letterbook.js";
import { EB_PAGES, EB_WORDS, NUM_EN, ebSteps } from "../js/data/englishbook.js";
import { WB_AR, WB_COLORS, WB_NUMBERS, WB_COLOR_PAIRS, WB_SHAPES, WB_SHAPE_PAIRS, WB_HOUR_AR, WB_LINES, colorPairOf } from "../js/data/workbook.js";

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

// ===== «كراسة الأرقام» (٢٠٢٦-١٠-١٢) — WB_SAY بكل الأعداد والألوان اللى ممكن تطلع =====
{
  const W = WP.WB_SAY;
  const colors = Object.values(WB_COLORS);
  for (let v = 1; v <= 10; v++) add(WB_AR[v], AR); // العدّ بالعامية (واحد، اتنين …)
  colors.forEach((c) => add(c.ar, AR)); // اسم اللون لما القلم يتختار
  [W.againDots, W.countChoose, W.match, W.missing, W.paintWrong, W.frameFill, W.colorBarOne, W.chooseColor].forEach(addAr);
  for (let v = 1; v <= 10; v++) {
    if (v <= 8) addAr(W.missPrev(WB_AR[v + 1]));
    if (v >= 2 && v <= 9) addAr(W.missMid(WB_AR[v - 1], WB_AR[v + 1]));
    if (v >= 3) addAr(W.missNext(WB_AR[v - 1]));
    if (v >= 2) addAr(W.colorBar(WB_AR[v]));
  }
  colors.forEach((c) => addAr(W.pickColor(c.al)));
  for (const n of WB_NUMBERS) {
    const ar = WB_AR[n];
    const [c1] = colorPairOf(n);
    [W.meet(ar), W.tooMany(ar), W.stampTooMany(ar), W.tooFew(ar), W.find(ar), W.colorN(ar, WB_COLORS[c1].al), WP.writeIntro("الرقم", ar)].forEach(addAr);
    for (let a = 1; a < n; a++) addAr(W.parts(WB_AR[a], WB_AR[n - a]));
    // «لوّن رقم n …، ورقم m …»: m أى رقم تانى، ولون كل واحد من زوج n
    const [p1, p2] = colorPairOf(n).map((k) => WB_COLORS[k].ar);
    for (const m of WB_NUMBERS) if (m !== n) addAr(W.paint(ar, p1, WB_AR[m], p2));
  }
  // صفحات الألوان
  [W.chooser, W.realWrong, W.pickFirst, W.picture, W.repeated, W.matchEqual, W.matchShape, W.shapeWrong, W.stamp, W.robot].forEach(addAr);
  // الأشكال
  Object.values(WB_SHAPES).forEach((sh) => {
    add(sh.ar, AR); add(sh.en, EN);
    [W.drawShape(sh.ar), W.drawAlone(sh.ar), W.checkShape(sh.ar)].forEach(addAr);
  });
  for (const [a, b] of WB_SHAPE_PAIRS) addAr(W.meetShapes(WB_SHAPES[a].ar, WB_SHAPES[b].ar));
  // باقى الكتاب: الخطوط · خط الأعداد · الساعة · الصفر · الجمع · المراجعة
  [W.locked, W.oddColor, W.countKinds, W.meetClock, W.clockChoose, W.clockWrite, W.clockMatch, W.clockWrong, W.meetZero, W.writeAnswer, W.codeKey].forEach(addAr);
  WB_LINES.forEach((id) => addAr(W.lineSpot(PREWRITING.find((p) => p.id === id).name)));
  add(WB_AR[0], AR);
  addAr(W.find(WB_AR[0]));
  for (let v = 0; v <= 10; v++) {
    if (v <= 9) addAr(W.hopNext(WB_AR[v]));
    if (v >= 1) addAr(W.hopPrev(WB_AR[v]));
    if (v >= 1 && v <= 9) addAr(W.hopMid(WB_AR[v - 1], WB_AR[v + 1]));
    for (let b = 1; b <= 3 && v + b <= 10; b++) addAr(W.hopAdd(WB_AR[v], WB_AR[b]));
  }
  for (let h = 1; h <= 12; h++) { addAr(W.clockSay(WB_HOUR_AR[h])); addAr(W.clockSet(WB_HOUR_AR[h])); }
  colors.forEach((c) => { add(c.en, EN); addAr(W.countWrite(c.al)); });
  for (const [k1, k2] of WB_COLOR_PAIRS) {
    const [a, b] = [WB_COLORS[k1].ar, WB_COLORS[k2].ar];
    [W.meetColors(a, b), W.realColor(a, b), W.realColor(b, a)].forEach(addAr);
  }
}

// ===== «كراسة الحروف» (٢٠٢٦-١٠-١٣) — LB_SAY بكل الحروف + الفزّورة والكلمات والمقاطع =====
{
  const S = WP.LB_SAY;
  [S.chooser, S.riddleWrong, S.harakaChoose, S.harakaWrong, S.startsWrong, S.startsMore, S.missing, S.missingWrong,
    S.writeAlone, S.shadow, S.shadowWrong, S.colorLearned, S.colorWrong, S.matchFirst, S.matchWrong, S.sameSound,
    S.sameWrong, S.positionWrong, S.buildWrong, ...S.formPos, ...S.cheer].forEach(addAr);
  add("أنا اتعلّمت", AR); add("التهيئة", AR);
  for (const ch of LB_ORDER) {
    const L = LB_LETTERS[ch];
    const name = lbName(ch);
    const s3 = ["a", "u", "i"].map((h) => (ch === "أ" && h === "i" ? "إ" : ch) + LB_HARAKAT[h].mark);
    [S.meet(name, s3.join("، ")), S.pop(name), S.popWrong(name), S.popMore(name), S.harakat(name), S.starts(name),
      S.forms(name), S.position(name), WP.writeIntro("الحرف", name), L.riddle,
      S.circle(name, 0), S.circle(name, 1), S.circle(name, 2), S.circleWrong(name)].forEach(addAr);
    add(name, AR);
    // المقاطع (بَ بُ بِ بْ) + «اقرأ بُ …»
    for (const h of ["a", "u", "i", "o"]) {
      const v = (ch === "أ" && h === "i" ? "إ" : ch) + LB_HARAKAT[h].mark;
      add(v, AR);
      if (h !== "o") addAr(S.harakaPic(v));
    }
    // كل كلمة: بالتشكيل (الحركات) ومن غيره (الصور والفزّورة)
    for (const x of [...L.harakat, ...L.forms, ...L.more, L.answer, ...(L.circle || [])]) { add(x.w, AR); add(lbBare(x.w), AR); }
  }
  for (const x of LB_SHADOWS) add(x.w, AR);
  for (const b of LB_BUILD) { add(b.w, AR); addAr(S.build(lbName(b.a), lbName(b.b))); }
}

// ===== «ارسم الحرف» بالحركات (٢٠٢٦-١٠-١٤): كل حرف عربى بَ بُ بِ بْ — بيتنطق بعد كل جولة =====
{
  const MARKS = { a: "\u064E", u: "\u064F", i: "\u0650", o: "\u0652" };
  for (const it of DATASETS.arabic.items) {
    const ch = it.char;
    if (!ch) continue;
    for (const h of ["a", "u", "i", "o"]) add((ch === "أ" && h === "i" ? "إ" : ch) + MARKS[h], AR);
  }
}

// ===== «كتاب الإنجليزى» (٢٠٢٦-١٠-١٤) — كلام ميزو بالعربى + كل كلمة وجملة وحرف إنجليزى فى الكتاب =====
{
  const S = WP.EB_SAY;
  const en = (t) => add(t, EN);
  [S.chooser, S.meetWords, S.find, S.findWrong, S.sortWrong, S.count12, S.count12Wrong, S.sentences, S.pickSentence,
    S.pickWrong, S.opposites, S.firstWrong, S.firstMore, S.matchLetter, S.matchWrong, S.count, S.countWrong,
    S.endWrong, S.choose, S.rhyme, S.rhymeWrong, S.build, S.buildWrong, S.missing, S.missingWrong].forEach(addAr);
  S.cheerEn.forEach(en);
  for (const w of Object.keys(EB_WORDS)) en(w);
  for (const C of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const c = C.toLowerCase();
    en(C); en(c); en(`big ${C}`); en(`small ${c}`);
    [S.writeCap(C), S.writeSmall(c), S.popLetter(C), S.popWrong(C)].forEach(addAr);
  }
  // كل الخطوات بكذا ترتيب عشوائى (المشتّتات والبالونات بتتغيّر) — نجمع كل نص بيتنطق
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const pg of EB_PAGES) {
    const L = pg.label || pg.ch;
    if (pg.type === "letter") { [S.letterMeet(L), S.firstSound(L), S.endSound(L)].forEach(addAr); en(L); en(L.toLowerCase()); }
    if (pg.type === "sight") { [S.sightMeet(pg.word), S.spell(pg.word), S.findColor(pg.word), S.findColorWrong(pg.word)].forEach(addAr); en(pg.word); }
    if (pg.title) en(pg.title);
    if (pg.sort) addAr(pg.sort.say);
    for (let k = 0; k < 12; k++) {
      for (const st of ebSteps(pg, rnd)) {
        (st.words || []).forEach(en);
        (st.lines || []).forEach((l) => en(l.text));
        (st.rounds || []).forEach((r) => {
          if (Array.isArray(r)) { const [w, n] = r; en(`${NUM_EN[n]} ${n > 1 ? w + "s" : w}`); return; }
          [r.target, r.text, r.q, r.w].forEach(en);
          (r.options || []).forEach((o) => (typeof o === "string" ? en(o) : en(o.say)));
          if (r.w) [...r.w].forEach(en);
        });
        (st.items || []).forEach((it) => {
          if (Array.isArray(it)) { const [w, n] = it; en(`I have ${NUM_EN[n]} ${w}.`); return; }
          en(it.w); if (it.say) en(it.say);
        });
        (st.pair || []).forEach(([w]) => en(w));
        (st.pairs || []).forEach((p) => (Array.isArray(p) ? p.forEach(en) : (en(p.ch), en(p.w))));
        (st.cells || []).forEach(en);
        if (st.kind === "write") en(st.glyph);
        if (st.kind === "spell") [...st.word].forEach(en);
      }
    }
  }
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
    // طلب واحد علّق ماكانش بيوقّف التشغيل كله (المالك ٢٠٢٦-١٠-١٤: «معلّق كده بقاله فترة»)
    signal: AbortSignal.timeout(45_000),
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
    console.log(`  ✓ ${miss}: ${p.text}`);   // كل عبارة جديدة بتبان — عشان مايبانش إنه واقف
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
