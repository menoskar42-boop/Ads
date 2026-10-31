// ===== جمل الألعاب القديمة اللى بتتبنى من البيانات (٢٠٢٦-١٠-١٦) =====
//
// المالك: «افحص كامل موقع mykid وشوف الجمل الغير مسجّلة… ونسجّلها دفعة واحدة».
// الألعاب دى بتركّب الجملة من اسم الحرف/الحيوان/الرقم (`اصطد ما يبدأ بحرف ${name}`…)،
// فمكانتش فى قايمة warm-tts.js — وكانت بتتولّد بالـAI وتتحفظ فى .tts-cache اللى بيتمسح
// مع كل Republish. هنا كل تركيبة ممكنة من البيانات المصدّرة نفسها (مش نسخة منها).
// واللى بيانات لعبته جوّه ملف اللعبة (القواعد، الإحساس، وصّل النقاط…) بيلقطه
// tts-crawl.mjs من اللعب الفعلى ويكتبه فى tts-extra.json.
//
// كل الأصوات «alloy» (العربى والإنجليزى) — المفتاح = النص + التوجيه بس:
//   say(t)  ← Speech.say/ar/en/sequence (من غير توجيه)
//   mizo(t) ← Speech.mizo (بلهجة ميزو، والبنت بتسمع femAdapt)
import { DATASETS } from "../js/data/datasets.js";
import { ARABIC_LETTERS } from "../js/data/arabicLetters.js";
import { OPPOSITES } from "../js/data/opposites.js";
import { SPELL_WORDS } from "../js/data/spelling.js";
import { READING_RULES, CLASSIFY_SETS } from "../js/data/readingRules.js";
import { REGIONS } from "../js/data/regions.js";
import { ACTIVITIES } from "../js/data/activities.js";
import { MIZO_REGION_HOOKS, MIZO_PRAISE, MIZO_HELLO, MIZO_INTRO, MIZO_CATCH, femAdapt } from "../js/data/mizo.js";
import fs from "node:fs";
import { bodyMapPhrases } from "../js/data/bodyMap.js";
import { recallPhrases } from "../js/data/letterRecall.js";
import { ML_SAY } from "../js/data/missingLine.js";
import { lfPhrases } from "../js/data/letterForms.js";
import { bwPhrases } from "../js/data/blankWrite.js";
import { exPhrases } from "../js/data/examSheet.js";

/** { name, how } من مصفوفة جوّه شاشة (الأوسمة/إكسسوارات ميزو) — الشاشة نفسها بتلمس الصفحة فمابنستوردهاش. */
function namesHows(file, arr) {
  const src = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const body = src.slice(src.indexOf(`${arr} = [`), src.indexOf("];", src.indexOf(`${arr} = [`)));
  return [...body.matchAll(/name:\s*"([^"]*)",\s*how:\s*"([^"]*)"/g)].map((m) => ({ name: m[1], how: m[2] }));
}

/** كتلة `const X = [ … ];` من ملف شاشة/لعبة (من غير استيراده). */
function block(file, decl) {
  const src = fs.readFileSync(new URL(file, import.meta.url), "utf8");
  const i = src.indexOf(`${decl} = [`);
  return i < 0 ? "" : src.slice(i, src.indexOf("\n];", i));
}
const namesIn = (txt) => [...txt.matchAll(/name:\s*"([^"]*)"/g)].map((m) => m[1]);

export function addGamePhrases({ say, mizo }) {
  const ds = (k) => (DATASETS[k] ? DATASETS[k].items : []);
  // كل نشاط بشاشته وبياناته (عشان مانسجّلش تركيبات محدّش بيلعبها)
  const acts = Object.values(ACTIVITIES).flat();
  const of = (screen) => acts.filter((a) => a.screen === screen).map((a) => a.params || {});

  // ١) كل عنصر فى كل مجموعة: الاسم بالإنجليزى والصوت («استكشف» / «أصوات الحيوانات») والرقم بالحروف
  for (const d of Object.values(DATASETS)) {
    for (const it of d.items) [it.name, it.en, it.sound, it.word, it.arName, it.enName].forEach(say);
  }

  // ٢) «اصطد» و«بأى حرف تبدأ؟» و«تعلّم»
  for (const p of of("catch")) for (const it of ds(p.datasetKey)) say(`اصطد ما يبدأ بحرف ${it.name}`);
  for (const p of of("phonics")) {
    const isAr = !(p.lang || DATASETS[p.datasetKey]?.lang || "").startsWith("en");
    for (const it of ds(p.datasetKey)) say(isAr ? `تبدأ بحرف ${it.name}` : `starts with ${it.name}`);
  }
  for (const p of of("learn")) for (const it of ds(p.datasetKey)) if (it.word) mizo("شوف يا بطل، دي " + it.word);

  // ٣) «أشكال الحرف»: أول/وسط/آخر الكلمة (نفس forms() فى letterforms.js)
  const NON_CONNECTORS = new Set(["ا", "أ", "إ", "آ", "د", "ذ", "ر", "ز", "و"]);
  const T = "ـ";
  for (const it of ARABIC_LETTERS) {
    const ch = it.char;
    const c = !NON_CONNECTORS.has(ch);
    say(`في أول الكلمة ${c ? ch + T : ch}`);
    say(`في وسط الكلمة ${c ? T + ch + T : T + ch}`);
    say(`في آخر الكلمة ${T + ch}`);
    for (const label of ["أول الكلمة", "وسط الكلمة", "آخر الكلمة"]) say(`${it.name} في ${label}`);
  }

  // ٤) «كوّن الكلمة» و«الأضداد»
  for (const w of SPELL_WORDS) { say(`كوّن كلمة ${w.word}`); say(w.word); }
  for (const { a, b } of OPPOSITES) {
    for (const [x, y] of [[a, b], [b, a]]) {
      say(x.name);
      say(`ما ضدّ ${x.name}؟`);
      say(`${x.name} ضدّ ${y.name}`);
      mizo("شوف، ضدّ " + x.name + " هو " + y.name);
    }
  }

  // ٥) «صنّف» و«جِد المطلوب» و«ركّب الصورة»
  for (const p of of("sort")) {
    for (const g of p.groups || []) for (const it of ds(g.datasetKey)) {
      say(`${it.name}، إلى أي فئة ينتمي؟`);
      mizo(`برافو، ${it.name} من ${g.label}`);
    }
  }
  for (const p of of("findIt")) for (const it of ds(p.datasetKey)) mizo(`${p.verb || "اضغط على"} ${it.name}`);
  for (const p of of("puzzle")) for (const it of ds(p.datasetKey)) { mizo(`كوّن صورة ${it.name}`); say(it.name); }

  // ٦) مدينة الأرقام (count.js): أطعمنى ١–٦، اجمع ٥/٧/١٠ نجوم، الجمع، الطرح، المقارنة، والعدّ
  for (let n = 0; n <= 20; n++) say(String(n));
  for (let n = 1; n <= 6; n++) say(`أطعمني ${n}`);
  for (const n of [5, 7, 10]) say(`اجمع ${n} نجوم`);
  for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) { say(`كم يساوي ${a} زائد ${b}؟`); say(`What is ${a} plus ${b}?`); }
  for (let a = 2; a <= 8; a++) for (let b = 1; b < a; b++) say(`${a} ناقص ${b}، كم بقي؟`);
  for (let n = 2; n <= 9; n++) say(`نعم، ${n} أكثر`);

  // ٧) قواعد القراءة: الشرح + كل كلمة مثال، وكلمات التصنيف
  for (const r of READING_RULES) { say(r.explain); (r.examples || []).forEach((e) => say(e.word)); }
  for (const s of CLASSIFY_SETS) for (const it of s.items || []) say(it.word);

  // ٨-أ) «المعلّم» (lesson.js): الترحيب والمدح بيتقالوا فى Speech.sequence (من غير لهجة ميزو)
  //       بالتأنيث للبنت، و«This is number …» للأرقام الإنجليزى + الصفر
  for (const t of [...MIZO_INTRO, ...MIZO_HELLO, ...MIZO_PRAISE]) { say(t); say(femAdapt(t)); }
  for (const p of of("lesson")) {
    const en = p.datasetKey === "englishNumbers";
    const d = DATASETS[p.datasetKey];
    const items = [...(p.includeZero && d?.glyphKind === "number" ? [{ name: en ? "zero" : "", arName: "صفر" }] : []), ...ds(p.datasetKey)];
    const noun = d?.glyphKind === "number" ? (en ? "number" : "رقم") : "حرف";
    for (const it of items) {
      const label = it.name || it.arName || "";
      say(en ? `This is number ${label}` : `هذا ${noun} ${label}`);
      say(label);
    }
  }

  // ٨) دخول كل منطقة: هوك ميزو العشوائى × اسم المنطقة
  for (const r of REGIONS) for (const h of MIZO_REGION_HOOKS) mizo(h.replace("{r}", r.name));

  // ٩) الأوسمة: «وسام … + مدح»، «لتفتح هذا الوسام: …»، و«مدح عندك n وسام من ١٢!» — وإكسسوارات ميزو
  const BADGES = namesHows("../js/screens/badges.js", "const BADGES");
  for (const b of BADGES) {
    mizo(`لتفتح هذا الوسام: ${b.how}`);
    for (const p of MIZO_PRAISE) mizo(`وسام ${b.name}! ${p}`);
  }
  for (let c = 1; c <= BADGES.length; c++) for (const p of MIZO_PRAISE) mizo(`${p} عندك ${c} وسام من ${BADGES.length}!`);
  mizo("ابدأ اللعب لتفتح أوّل وسام!");
  for (const a of namesHows("../js/screens/profile.js", "const ACCS")) if (a.how) mizo(`لتفتح ${a.name}: ${a.how}`);

  // ١٠) الكنوز: «حصلت على …» (core/rewards.js بيلمس الصفحة فبنقرا القايمة من الملف)
  for (const n of namesIn(block("../js/core/rewards.js", "export const COLLECTIBLES"))) { say(n); say(`حصلت على ${n}`); }

  // ١١) «لوّن الصور» · «اعرف الإحساس» · «وصّل النقاط» · «اكتشف المختلف» · العجلة · رحلة اليوم
  for (const n of namesIn(block("../js/games/coloring.js", "const PICTURES"))) say(`لوّن ${n}`);
  for (const n of namesIn(block("../js/games/emotions.js", "const FACES"))) { mizo("برافو! ده إحساس " + n); mizo("شوف... ده " + n); }
  for (const m of block("../js/games/dotdot.js", "const FIGURES").matchAll(/name:\s*"([^"]*)",\s*emoji:\s*"([^"]*)",\s*dots:\s*\[(.*)\]\s*\}/g)) {
    const n = (m[3].match(/\[/g) || []).length;
    mizo("اضغط الأرقام بالترتيب من ١ لـ" + n + " وشوف الصورة!");
    mizo("برافو! طلعت " + m[1] + " " + m[2]);
  }
  for (let k = 2; k <= 10; k++) mizo("دوّر على رقم " + k);
  for (const st of [3, 5, 8, 10]) mizo(`جامد! ربحت ${st} نجوم!`);
  for (const c of MIZO_CATCH) mizo(`${c} دي رحلتنا النهارده، يلا بينا!`);

  // ١٢) «جسمي بالإنجليزي» (games/bodyMap.js): اسم كل جزء بالإنجليزى والعربى، «Where is your …?»، وكلمات الأغنية
  const bm = bodyMapPhrases();
  bm.en.forEach(say);
  bm.ar.forEach(say);

  // ١٣) «صور الحروف» و«اكتب من الذاكرة» (games/letterRecall.js): كلمات كل حرف وأسئلتها، و«اكتب حرف …»
  //     — والعربى بصيغة الولد والبنت (الشاشة بتنطقه Speech.ar(fem(t)))
  const rc = recallPhrases();
  rc.en.forEach(say);
  for (const t of rc.ar) { say(t); say(femAdapt(t)); }

  // ١٤) «كمّل الأرقام ١–١٠» (games/missingLine.js) — بصيغة الولد والبنت
  for (const t of Object.values(ML_SAY)) { say(t); say(femAdapt(t)); }

  // ١٥) ستّ ألعاب أشكال الحرف (games/formsPlay.js — المالك ٢٠٢٦-١٠-٢٧): تعليمات كل حرف، والكلمات،
  //     و«ليه شكله اتغيّر»، و«دوّر على حرف … فى اسمك» لكل الحروف — بصيغة الولد والبنت
  for (const t of lfPhrases()) { say(t); say(femAdapt(t)); }
  for (const t of bwPhrases()) { say(t); say(femAdapt(t)); }
  for (const t of exPhrases()) { say(t); say(femAdapt(t)); }
}
