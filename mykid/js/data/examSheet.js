// ===== «ورقة الامتحان» — الفكرة التانية (المالك ٢٠٢٦-١٠-٣١، صورة امتحان بنته) =====
// نفس شكل ورقة المدرسة: ٣ صور جنب بعض، تحت كل صورة الكلمة وأول حرف فاضى («اكتب الحرف الأول للكلمة» /
// «Supply the missing letter»). الطفل يلمس الكارت ويكتب الحرف فى لوحة كبيرة تحت (الكارت بيبان فيه اللى كتبه)،
// ولما يخلّص التلاتة يدوس «سلّم الورقة» ⇒ الميس بتصحّح بالقلم الأحمر ✓ أو ✗ والحرف الصح جنبه، ونجمة لو كله صح.
// والورقة دى بتتطبع كمان (PDF) لكل الحروف — لأن الامتحان بالقلم على الورق.
//
// نوعين: «الحرف الأول» (زى الامتحان) و«فى أى مكان» (أول/وسط/آخر). الحروف = اللى عليها نجمة، ولو مفيش = كلها.
// ملف صافى (من غير DOM) — الشاشة فى games/examSheet.js، والاختبار tests/exam-sheet.test.mjs.
import { BW_AR_LETTERS, BW_EN_LETTERS, arItems, enItems, nameOf } from "./blankWrite.js";

export const EX_PER_SHEET = 3;
export const EX_MODES = ["first", "any"];

const shuffled = (rnd, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** كل الكلمات الممكنة لحروف معيّنة (first ⇒ اللى الحرف فى أولها بس — والإنجليزى X فى آخرها زى الكتاب). */
export function exPool(lang, letters, mode = "first") {
  const out = [];
  for (const ch of letters) {
    const items = lang === "ar" ? arItems(ch) : enItems(ch);
    for (const x of items) if (mode === "any" || x.pos === 0 || (lang === "en" && ch === "X")) out.push({ ch, ...x });
  }
  return out;
}

/** ورقة واحدة: ٣ كلمات من حروف مختلفة لو ينفع (وكلمات مختلفة دايماً). */
export function sheetItems(lang, letters, mode = "first", rnd = Math.random, n = EX_PER_SHEET) {
  const pool = shuffled(rnd, exPool(lang, letters, mode));
  const pick = [];
  for (const x of pool) if (pick.length < n && !pick.some((p) => p.ch === x.ch)) pick.push(x);
  for (const x of pool) if (pick.length < n && !pick.some((p) => p.w === x.w)) pick.push(x);
  return pick;
}

/** الحروف اللى الورقة هتتعمل منها: النجمة لو فيه، وإلا كل الحروف. */
export function sheetLetters(lang, starred) {
  const all = lang === "ar" ? BW_AR_LETTERS : BW_EN_LETTERS;
  const s = (starred || []).filter((c) => all.includes(c));
  return s.length ? s : all;
}

/** الدرجة ⇒ جملة الميس (٣/٣ نجمة · ٢/٣ صحّح · أقل ⇒ نجرّب تانى). */
export function teacherSay(right, total) {
  if (right === total) return EX_SAY.great;
  if (right >= total - 1) return EX_SAY.good;
  return EX_SAY.again;
}

/** صفحات الطباعة: لكل حرف سطر فيه كلماته (العربى ٣ أماكن، والإنجليزى أول حرف) — ٦ سطور فى الصفحة. */
export function printPages(lang, letters, mode = "any", perPage = 6) {
  const rows = letters.map((ch) => ({ ch, items: exPool(lang, [ch], mode) })).filter((r) => r.items.length);
  const pages = [];
  for (let i = 0; i < rows.length; i += perPage) pages.push(rows.slice(i, i + perPage));
  return pages;
}

export const EX_SAY = {
  title: "📄 ورقة الامتحان",
  titleEn: "📄 Exam sheet",
  head: { first: "اكتب الحرف الأول للكلمة", any: "اكتب الحرف الناقص فى الكلمة" },
  headEn: "Supply the missing letter",
  intro: "دى ورقة زى ورقة المدرسة. المس كل صورة واكتب الحرف الناقص، وبعدين سلّم الورقة للميس",
  pickCard: "المس صورة عشان تكتب حرفها",
  writeHere: "اكتب الحرف هنا",
  submit: "سلّم الورقة",
  notYet: "لسه فيه كلمة ماكتبتش حرفها",
  checking: "الميس بتصحّح الورقة",
  great: "ممتاز! كله صح، والميس إدتك نجمة",
  good: "جيد جداً! صحّح الغلطة اللى الميس علّمت عليها",
  again: "يلا نجرّب تانى، الميس كتبت الحرف الصح بالأحمر",
  fix: "صحّح",
  fixSay: "بص على الحرف اللى الميس كتبته بالأحمر، واكتبه تانى",
  smallLetter: "اكتب الحرف الصغير",
  next: "ورقة جديدة",
  print: "🖨️ اطبع ورقة",
  mode: { first: "الحرف الأول", any: "فى أى مكان" },
};

/** كل جمل الميس (لتسجيل الصوت مرة واحدة). */
export function exPhrases() {
  return [EX_SAY.intro, EX_SAY.pickCard, EX_SAY.notYet, EX_SAY.checking, EX_SAY.great, EX_SAY.good, EX_SAY.again,
    EX_SAY.fixSay, EX_SAY.smallLetter, ...Object.values(EX_SAY.head)];
}
export { nameOf };
