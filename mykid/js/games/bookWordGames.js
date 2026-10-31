// ===== ألعاب «الحرف فى الكلمة» جوّه الكراستين (المالك ٢٠٢٦-١٠-٣١) =====
// المالك: «عاوز كمان ان الألعاب دى تبقى موجوده داخل كراسه الانجليزى و كراسه الحروف».
// نفس ألعاب القلعة بشكلها، بس على حرف الصفحة وجولات أقل (زى ألعاب القلعة التانية جوّه صفحة الحرف):
//   runaway     🏃 الحرف الهربان — كلمة واحدة، على الخط المتقطّع (المستوى ٢)
//   train       🚃 قطر الكلمة — كلمة واحدة، مربع فاضى (المستوى ٣ ⇒ بيتسجّل فى المراجعة)
//   spotMistake 🕵️ غلطة ميزو — جولتين على كلمات الحرف
//   examSheet   📄 ورقة الامتحان — ورقة واحدة: كلمة من حرف الصفحة + كلمتين من الحروف اللى عليها نجمة
//   dueReview   🔁 مراجعة اليوم — بتظهر بس لو فيه كلمات عليها الدور النهارده (لحد ٣)
import { Store } from "../core/storage.js";
import { mountBlankWrite } from "./blankWrite.js";
import { mountSpotMistake } from "./spotMistake.js";
import { mountExamPaper } from "./examSheet.js";
import { arItems, enItems, BW_AR_LETTERS, BW_EN_LETTERS } from "../data/blankWrite.js";
import { spotRounds } from "../data/spotMistake.js";
import { sheetItems, EX_SAY } from "../data/examSheet.js";
import { dueKeys, resolveKey, todayISO } from "../data/writeReview.js";

export const BOOK_WORD_KINDS = ["runaway", "train", "spotMistake", "examSheet", "dueReview"];
export const BOOK_WORD_ICON = { runaway: "🏃", train: "🚃", spotMistake: "🕵️", examSheet: "📄", dueReview: "🔁" };
export const BOOK_REVIEW_MAX = 3;
export const BOOK_SPOT_ROUNDS = 2;

const itemsOf = (lang, ch) => (lang === "ar" ? arItems(ch) : enItems(ch)).map((x) => ({ ch, ...x }));

/**
 * تجهيز الخطوة وقت فتح الصفحة (النجوم والمراجعة بتتغيّر مع الوقت، فمش فى الخطة الصافية).
 * null = الخطوة تتشال (مفيش كلمات للحرف، أو مفيش مراجعة النهارده).
 */
export function prepBookWordStep(lang, s, starred = [], rnd = Math.random) {
  if (s.kind === "dueReview") {
    const items = dueKeys(Store.writeReview, lang, todayISO(), BOOK_REVIEW_MAX).map(resolveKey).filter(Boolean);
    return items.length ? { ...s, items } : null;
  }
  const mine = itemsOf(lang, s.ch);
  if (!mine.length) return null;
  if (s.kind === "examSheet") {
    const all = lang === "ar" ? BW_AR_LETTERS : BW_EN_LETTERS;
    const others = starred.filter((c) => c !== s.ch && all.includes(c));
    const mode = lang === "ar" ? "any" : "first";
    const own = sheetItems(lang, [s.ch], mode, rnd, others.length ? 1 : 3);
    const rest = others.length ? sheetItems(lang, others, mode, rnd, 2) : [];
    const items = [...own, ...rest.filter((x) => !own.some((o) => o.w === x.w))];
    return items.length ? { ...s, items } : null;
  }
  if (s.kind === "spotMistake") {
    const rounds = spotRounds(lang, [s.ch], rnd).slice(0, BOOK_SPOT_ROUNDS);
    return rounds.length ? { ...s, rounds } : null;
  }
  if (s.kind === "runaway" || s.kind === "train") {
    const x = mine[Math.min(mine.length - 1, Math.floor((s.pick ?? rnd()) * mine.length))];
    return { ...s, item: x };
  }
  return s;
}

/** الخطوة نفسها جوّه صفحة الكراسة. @returns {{ destroy(): void }} */
export function mountBookWordStep(body, lang, s, { ask, hint, onDone }) {
  if (s.kind === "runaway" || s.kind === "train") {
    return mountBlankWrite(body, lang, s.ch, { ask, hint, onDone, flavor: s.kind, items: [s.item], level: s.kind === "train" ? 3 : 2 });
  }
  if (s.kind === "spotMistake") return mountSpotMistake(body, lang, s.rounds, { onDone });
  if (s.kind === "examSheet") {
    ask(EX_SAY.intro);
    return mountExamPaper(body, lang, s.items, { heading: lang === "ar" ? EX_SAY.head.any : EX_SAY.headEn, onPerfect: () => onDone() });
  }
  if (s.kind === "dueReview") return mountBlankWrite(body, lang, null, { ask, hint, onDone, items: s.items, level: 3 });
  throw new Error("bookWordGames: " + s.kind);
}
