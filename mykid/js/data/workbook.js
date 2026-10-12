// ===== «كراسة الأرقام» — صفحة لكل رقم زى كتاب «Little Mathematics» =====
//
// المالك ٢٠٢٦-١٠-١٢ (صوّر الكتاب صفحة صفحة): «عاوز ادمج نفس التمارين دى اللى فى الكتاب
// مع mykid… الطفل يبقى مش بيتعلم الكتابه انما يكتب شويه و يلعب شويه كل فى نفس التاب».
//
// صفحة الرقم فى الكتاب: الرقم واسمه + الصوابع + شريط الدواير ← شبكة تتبّع الرقم ←
// «لوّن ٤ من الفساتين» ← مكوّنات الرقم (٢ و ١ = ٣) ← تمارين الرقم (عُدّ واختار · عُدّ ووصّل ·
// لوّن الدايرة اللى فيها الرقم · كمّل الأرقام الناقصة) ← وتمارين الألوان (لوّن حسب الرقم).
// هنا نفس الحاجات بالترتيب، بس الكتابة متقسّمة: سطر قصير وبعده لعبة، والمساعدة بتقلّ
// كل مرة (على الخط ← على النقط ← لوحده جوّه «الرقم الناقص»).
//
// ملف بيانات صافى (من غير DOM) — الخطة متقاسة فى node، وwarm-tts بيقرا الألوان.

/** ألوان الكتاب بنفس ترتيب وحداته: (أحمر وبمبى) (أصفر وبرتقانى) (أزرق ولبنى) (أخضر وأخضر فاتح). */
export const WB_COLORS = {
  red: { ar: "أحمر", al: "الأحمر", en: "red", hex: "#ef4444" },
  pink: { ar: "بمبى", al: "البمبى", en: "pink", hex: "#f472b6" },
  yellow: { ar: "أصفر", al: "الأصفر", en: "yellow", hex: "#facc15" },
  orange: { ar: "برتقانى", al: "البرتقانى", en: "orange", hex: "#fb923c" },
  blue: { ar: "أزرق", al: "الأزرق", en: "blue", hex: "#2563eb" },
  lightBlue: { ar: "لبنى", al: "اللبنى", en: "light blue", hex: "#7dd3fc" },
  green: { ar: "أخضر", al: "الأخضر", en: "green", hex: "#16a34a" },
  lime: { ar: "أخضر فاتح", al: "الأخضر الفاتح", en: "lime green", hex: "#a3e635" },
};

/** أسامى الأعداد بالعامية زى ما ميزو بيتكلم (numbers.js فيها الفصحى للدروس). */
export const WB_AR = ["", "واحد", "اتنين", "تلاتة", "أربعة", "خمسة", "ستة", "سبعة", "تمانية", "تسعة", "عشرة"];
export const WB_COLOR_PAIRS = [["red", "pink"], ["yellow", "orange"], ["blue", "lightBlue"], ["green", "lime"]];

/** الرقم ← زوج الألوان بتاعه (١ أحمر/بمبى زى الكتاب، ٢ أصفر/برتقانى …، وبعد ٤ بيلفّ). */
export const colorPairOf = (n) => WB_COLOR_PAIRS[(n - 1) % WB_COLOR_PAIRS.length];

/** حاجات بتتعدّ وتتلوّن (من صور الكتاب: بط، تيجان، أرانب، فساتين، تفاح، بالونات، …). */
export const WB_THINGS = ["🦆", "👑", "🐰", "👗", "🍎", "🎈", "🐄", "🐟", "🍌", "🧀", "🐙", "⭐", "🐤", "🍓", "🐢", "🦀"];

export const WB_MAX = 10;
export const WB_NUMBERS = Array.from({ length: WB_MAX }, (_, i) => i + 1);

/** مولّد عشوائى بذرة (عشان الاختبار يطلع نفس الصفحة كل مرة). */
export function seeded(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const pickOf = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
function shuffled(rnd, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** أعداد مختلفة جنب n (للمشتّتات) — من ١ لـ`max`. */
function neighbours(rnd, n, k, max = WB_MAX) {
  const pool = [];
  for (let d = 1; pool.length < k * 3 && d <= max; d++) {
    if (n - d >= 1) pool.push(n - d);
    if (n + d <= max) pool.push(n + d);
  }
  return shuffled(rnd, pool.slice(0, Math.max(k, 4))).slice(0, k);
}
const things = (rnd, k) => shuffled(rnd, WB_THINGS).slice(0, k);

/** شكل العدد: الرقم نفسه · نقط زى الدومينو/الزهر · حاجات متعدّة · صوابع (الكتاب: ✌️ and ✌️). */
export const WB_REPS = ["digit", "dots", "things", "fingers"];

/** تمارين اللعب اللى بتتوزّع على صفحات الأرقام (كل صفحة فى الكتاب ليها تشكيلة مختلفة). */
export const WB_PLAYS = ["countChoose", "match", "find", "parts", "frameFill"];
export const WB_LAST = ["paint", "colorBar"];

/**
 * خطوات صفحة الرقم n — كتابة (✏️) ولعب (🎲) بالتناوب:
 *   meet → ✏️ خط → colorN → 🎲 → ✏️ نقط → 🎲 → 🎲 → ✏️ لوحده (قبل/بعد/فى النص) → 🎲 تلوين
 * الـ🎲 التلاتة من WB_PLAYS والأخيرة من WB_LAST — فكل صفحة شكلها مختلف زى الكتاب.
 * `only` (للاختبار): تمارين بعينها بدل الاختيار العشوائى.
 * كل خطوة فيها اللى الشاشة محتاجاه بس؛ والإجابة الصح محسوبة هنا (مش فى الشاشة).
 */
export function workbookPage(n, rnd = Math.random, only = null) {
  if (!Number.isInteger(n) || n < 1 || n > WB_MAX) throw new Error("رقم الكراسة من ١ لـ" + WB_MAX);
  const [c1, c2] = colorPairOf(n);
  const [t1, t2, t3, t4, t5, t6] = things(rnd, 6);
  const make = {
    // «Count and choose the correct number»: ٣ صور، تحت كل واحدة رقمين
    countChoose() {
      const counts = shuffled(rnd, [n, ...neighbours(rnd, n, 2)]);
      return {
        kind: "countChoose",
        cards: counts.map((count, i) => {
          const wrong = neighbours(rnd, count, 1)[0];
          return { count, thing: [t2, t3, t4][i], options: rnd() < 0.5 ? [count, wrong] : [wrong, count] };
        }),
      };
    },
    // «Count, then match» / «Match» (صوابع ↔ رقم): مجموعات على ناحية وأرقام على التانية
    match() {
      const mCounts = shuffled(rnd, [n, ...neighbours(rnd, n, 2)]);
      const fingersAt = Math.floor(rnd() * 3);
      return {
        kind: "match",
        groups: mCounts.map((count, i) => ({ count, thing: [t5, t6, t1][i], rep: i === fingersAt ? "fingers" : "things" })),
        numbers: shuffled(rnd, mCounts),
      };
    },
    // «Color the octopus that has the number 1» / «Draw a circle around the number»
    find() {
      const targets = n === 1 ? 4 : 3;
      const others = neighbours(rnd, n, 4, 9);
      const cells = shuffled(rnd, [
        ...Array(targets).fill(n),
        ...Array.from({ length: 9 - targets }, (_, i) => others[i % others.length]),
      ]);
      return { kind: "find", n, cells, color: c2 };
    },
    // مكوّنات الرقم (٢ و ١ = ٣) — بالحاجات أو بالصوابع (كل إيد لحد ٥)
    parts() {
      const lo = Math.max(1, n - 5), hi = Math.min(5, n - 1);
      const fingers = rnd() < 0.5;
      const a = fingers ? lo + Math.floor(rnd() * (hi - lo + 1)) : 1 + Math.floor(rnd() * (n - 1));
      return { kind: "parts", n, a, b: n - a, thing: t2, rep: fingers ? "fingers" : "things", options: shuffled(rnd, [n, ...neighbours(rnd, n, 2)]) };
    },
    // «Count, write the number, then add dots»: يعدّ الحاجات ويحط نقطة لكل واحدة فى الشريط
    frameFill() {
      const k = rnd() < 0.6 ? n : neighbours(rnd, n, 1)[0];
      return { kind: "frameFill", count: k, thing: t6, frame: k > 5 ? 10 : 5, color: c1 };
    },
    // «Color number 1 pink and number 2 yellow» — الرقم وصورته (نقط/حاجات/صوابع) كل واحد بلونه
    paint() {
      const m = neighbours(rnd, n, 1)[0];
      const reps = ["digit", ...shuffled(rnd, WB_REPS.slice(1)).slice(0, 2)];
      const tiles = shuffled(rnd, [
        ...reps.map((rep) => ({ value: n, rep })),
        ...reps.map((rep) => ({ value: m, rep })),
      ]).map((t) => ({ ...t, thing: t.value === n ? t3 : t4 }));
      return { kind: "paint", pairs: [{ value: n, color: c1 }, { value: m, color: c2 }], tiles };
    },
    // «Color the required number»: فراولاية عليها الرقم وشريط خانات — يلوّن على قدّه
    colorBar() {
      return { kind: "colorBar", n, cells: n > 6 ? 10 : 6, color: c1 };
    },
  };

  let plays, last;
  const fits = (k) => !(k === "parts" && n < 2); // ١ مالوش مكوّنات
  if (only) {
    plays = only.filter((k) => WB_PLAYS.includes(k) && fits(k));
    last = only.find((k) => WB_LAST.includes(k)) || "paint";
  } else {
    plays = shuffled(rnd, WB_PLAYS.filter(fits)).slice(0, 3);
    last = pickOf(rnd, WB_LAST);
  }

  const steps = [];
  // اعرف الرقم: شريط الدواير (٥ خانات، أو ١٠ لو الرقم أكبر من ٥) — الطفل بيلمس ويعدّ
  steps.push({ kind: "meet", n, frame: n > 5 ? 10 : 5 });
  steps.push({ kind: "write", n, level: 1 });
  // «Color four of the dresses» — بلون الكتاب، وفيه علبة ألوان والطفل يختار الصح
  const extra = n <= 3 ? 2 : n <= 7 ? 3 : 12 - n;
  steps.push({
    kind: "colorN", n, total: n + Math.max(2, extra), thing: t1, color: c1,
    palette: shuffled(rnd, [c1, c2, pickOf(rnd, WB_COLOR_PAIRS.filter((p) => !p.includes(c1)))[0]]),
  });
  if (plays[0]) steps.push(make[plays[0]]());
  steps.push({ kind: "write", n, level: 2 });
  for (const k of plays.slice(1)) steps.push(make[k]());

  // «The previous, middle, and next number» — والناقص هو رقمنا: يكتبه لوحده
  const modes = [n <= WB_MAX - 2 && "prev", n >= 2 && n <= WB_MAX - 1 && "mid", n >= 3 && "next"].filter(Boolean);
  const mode = pickOf(rnd, modes);
  const seq = mode === "prev" ? [n, n + 1, n + 2] : mode === "mid" ? [n - 1, n, n + 1] : [n - 2, n - 1, n];
  // الخيارات: الناقص + أقرب رقمين مش ظاهرين فى الصف (الظاهر نفسه مايبقاش اختيار)
  const missOthers = WB_NUMBERS.filter((v) => !seq.includes(v))
    .sort((x, y) => Math.abs(x - n) - Math.abs(y - n) || x - y).slice(0, 2);
  steps.push({ kind: "missing", n, mode, seq, blank: seq.indexOf(n), level: 3, options: shuffled(rnd, [n, ...missOthers]) });

  steps.push(make[last]());
  return steps;
}

/** عدد خطوات الكتابة فى الصفحة (الاختبار بيتأكد إن الكتابة متوزّعة مش ورا بعض). */
export const isWriteStep = (s) => s.kind === "write" || s.kind === "missing" || s.kind === "countWrite";

// ===== صفحات الألوان (الكتاب بيحطها بين الأرقام: ١ ← أحمر/بمبى ← ٢ ← أصفر/برتقانى ← …) =====

/** حاجات لونها معروف فى الحقيقة — «Color the shapes yellow or orange» (موزة صفرا، جزرة برتقانى…). */
export const WB_REAL = {
  red: ["🍓", "🍅", "🌶️", "🍎"],
  pink: ["🌸", "🦩", "🐷", "🎀"],
  yellow: ["🍌", "🍋", "🐤", "🌻"],
  orange: ["🍊", "🥕", "🎃", "🦊"],
  blue: ["🐳", "🫐", "👖"],
  lightBlue: ["💧", "🧊", "🐬"],
  green: ["🥒", "🐸", "🥦", "🌲"],
  lime: ["🍏", "🍐", "🍈"],
};

/** ترتيب صفحات الكراسة زى فهرس الكتاب: كل رقم من ١ لـ٤ وبعده صفحة ألوانه، وبعدين ٥ لـ١٠. */
export const WB_PAGES = [
  ...WB_COLOR_PAIRS.flatMap((_, i) => [{ id: String(i + 1), type: "number", n: i + 1 }, { id: "c" + i, type: "colors", pair: i }]),
  ...WB_NUMBERS.slice(WB_COLOR_PAIRS.length).map((n) => ({ id: String(n), type: "number", n })),
];

/** مناطق صورة «لوّن حسب الرقم» (كب كيك زى الكتاب): كريزة · ٣ طبقات كريمة · ٥ خطوط ورقة. */
export const WB_PICTURE_REGIONS = 9;

/**
 * خطوات صفحة الألوان للزوج رقم `pairIdx`:
 *   meetColors → realColor → countWrite(نقط) → picture → chooseColor → countWrite(لوحده)
 */
export function colorsPage(pairIdx, rnd = Math.random) {
  const pair = WB_COLOR_PAIRS[pairIdx];
  if (!pair) throw new Error("صفحة ألوان مش موجودة: " + pairIdx);
  const [c1, c2] = pair;
  const steps = [];

  // ١) اعرف اللونين: كارت لكل لون وعليه حاجتين بلونه
  steps.push({ kind: "meetColors", colors: [c1, c2], examples: { [c1]: shuffled(rnd, WB_REAL[c1]).slice(0, 2), [c2]: shuffled(rnd, WB_REAL[c2]).slice(0, 2) } });

  // ٢) «Color the shapes red or pink»: كل حاجة بلونها الحقيقى
  const real = shuffled(rnd, [
    ...shuffled(rnd, WB_REAL[c1]).slice(0, 3).map((thing) => ({ thing, color: c1 })),
    ...shuffled(rnd, WB_REAL[c2]).slice(0, 2).map((thing) => ({ thing, color: c2 })),
  ]);
  steps.push({ kind: "realColor", colors: shuffled(rnd, [c1, c2]), items: real });

  // ٣) «Count, write, then color as required» — يلوّن (ويعدّ) وبعدين يكتب العدد على النقط
  const other = WB_COLOR_PAIRS[(pairIdx + 1) % WB_COLOR_PAIRS.length][0];
  const k1 = 1 + Math.floor(rnd() * 3);
  const k2 = [1, 2, 3].filter((k) => k !== k1)[Math.floor(rnd() * 2)];
  const cw = (count, color, level) => ({
    kind: "countWrite", count, color, level,
    thing: pickOf(rnd, WB_REAL[color]), palette: shuffled(rnd, [c1, c2, other]),
  });
  steps.push(cw(k1, c1, 2));

  // ٤) «Color according to the number» — كب كيك: كل حتة عليها رقم، والرقم ليه لون
  const key = [{ value: 1, color: c1 }, { value: 2, color: c2 }, { value: 3, color: other }];
  const [a, b, c] = shuffled(rnd, [1, 2, 3]);
  steps.push({ kind: "picture", key, regions: [a, b, c, b, c, a, c, a, c] });

  // ٥) «Choose and color»: كل حاجة جنبها لونين — يختار لونها الحقيقى
  const colorKeys = Object.keys(WB_REAL);
  const picks = shuffled(rnd, [c1, c2, ...shuffled(rnd, colorKeys.filter((k) => k !== c1 && k !== c2)).slice(0, 2)]);
  steps.push({
    kind: "chooseColor",
    items: picks.map((color) => {
      const wrong = pickOf(rnd, colorKeys.filter((k) => k !== color));
      return { thing: pickOf(rnd, WB_REAL[color]), color, options: rnd() < 0.5 ? [color, wrong] : [wrong, color] };
    }),
  });

  // ٦) تانى، بس يكتب لوحده
  steps.push(cw(k2, c2, 3));
  return steps;
}

/** خطوات أى صفحة من WB_PAGES. */
export function pageSteps(page, rnd = Math.random, only = null) {
  return page.type === "colors" ? colorsPage(page.pair, rnd) : workbookPage(page.n, rnd, only);
}
