// ===== «كمّل الأرقام ١–١٠» (المالك ٢٠٢٦-١٠-٢٦ — صورة من شاشة الحضانة) =====
// الأرقام من ١ لـ١٠ فى سطرين، وفيها أرقام ناقصة. تحت نجوم عليها أرقام (الناقصة + أرقام موجودة
// للتمويه)، والطفل يسحب الرقم الناقص لمكانه (أو يلمس النجمة وبعدين المكان الفاضى).
// الجولات بتصعب: ٢ ناقصين ← ٢ ← ٣ ← ٤.
//
// ملف صافى (من غير DOM) — الشاشة فى games/missingLine.js، والاختبار بيستورده مباشرة.
export const ML_MAX = 10;
export const ML_GAPS = [2, 2, 3, 4];
export const ML_DECOYS = 2;

const shuffle = (rnd, a) => {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
  return x;
};

/** جولات: { gaps: [أرقام ناقصة مترتبة], bank: [الناقصة + أرقام موجودة، متلخبطة] }.
 *  الرقم ١ مابيتشالش فى أول جولة (عشان الطفل يشوف البداية)، ومفيش جولتين ورا بعض بنفس الناقص. */
export function missingLineRounds(rnd = Math.random, gaps = ML_GAPS, max = ML_MAX) {
  let prev = [];
  return gaps.map((k, i) => {
    const pool = Array.from({ length: max }, (_, j) => j + 1).filter((n) => !(i === 0 && n === 1));
    let pick;
    for (let t = 0; t < 20; t++) {
      pick = shuffle(rnd, pool).slice(0, k).sort((a, b) => a - b);
      if (pick.join() !== prev.join()) break;
    }
    prev = pick;
    const present = Array.from({ length: max }, (_, j) => j + 1).filter((n) => !pick.includes(n));
    const decoys = shuffle(rnd, present).slice(0, ML_DECOYS);
    return { gaps: pick, bank: shuffle(rnd, [...pick, ...decoys]) };
  });
}

// جمل ميزو (بتتسجّل صوت — server/tts-games.js) — والرقم نفسه بيتنطق بـ WB_AR (واحد، اتنين…)
export const ML_SAY = {
  intro: "فيه أرقام ناقصة! اسحب كل رقم من النجوم لمكانه",
  here: "الرقم ده موجود فى السطر — دوّر على اللى ناقص",
  notHere: "مش مكانه، عدّ من الأول وشوف",
  done: "برافو! السطر كمل من واحد لعشرة",
};
