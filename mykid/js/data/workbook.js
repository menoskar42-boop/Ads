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
export const WB_PLAYS = ["countChoose", "match", "find", "parts", "frameFill", "repeated", "stamp"];
export const WB_LAST = ["paint", "colorBar", "hexKey"];

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
    // أو «Match the equal pictures»: صورة ↔ صورة تانية عددها زيها (right = "groups")
    match() {
      const mCounts = shuffled(rnd, [n, ...neighbours(rnd, n, 2)]);
      const equal = rnd() < 0.35;
      // «Count, then connect»: مجموعة حاجات، وإيد صوابع، ووش زهر (نقط)
      const reps = equal ? ["things", "things", "things"] : shuffled(rnd, ["things", "fingers", "dots"]);
      return {
        kind: "match",
        right: equal ? "groups" : "numbers",
        groups: mCounts.map((count, i) => ({ count, thing: [t5, t6, t1][i], rep: reps[i] })),
        numbers: shuffled(rnd, mCounts),
        rightThing: t4,
      };
    },
    // «Circle the repeated number»: ٣ صفوف، فى كل صف رقم متكرّر مرتين — يلمس الاتنين
    repeated() {
      const reps = shuffled(rnd, [n, ...neighbours(rnd, n, 2)]);
      return {
        kind: "repeated",
        rows: reps.map((a) => {
          const b = neighbours(rnd, a, 1)[0];
          return { repeated: a, cells: shuffled(rnd, [a, a, b]) };
        }),
      };
    },
    // «Color using the coloring key»: خلايا سداسية عليها أرقام، والمفتاح فوق (رقم ← لون)
    hexKey() {
      const [m1, m2] = neighbours(rnd, n, 2);
      const other = WB_COLOR_PAIRS[(WB_COLOR_PAIRS.findIndex((p) => p[0] === c1) + 1) % WB_COLOR_PAIRS.length][0];
      const key = [{ value: n, color: c1 }, { value: m1, color: c2 }, { value: m2, color: other }];
      return { kind: "hexKey", key, cells: shuffled(rnd, key.flatMap((k) => [k.value, k.value, k.value, k.value])) };
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
    // أو بالأرقام بس («7 and 2 = __») من ٣ وطالع
    parts() {
      const lo = Math.max(1, n - 5), hi = Math.min(5, n - 1);
      const r = rnd();
      const rep = r < 0.4 ? "fingers" : r < 0.7 || n < 3 ? "things" : "digits";
      const a = rep === "fingers" ? lo + Math.floor(rnd() * (hi - lo + 1)) : 1 + Math.floor(rnd() * (n - 1));
      return { kind: "parts", n, a, b: n - a, thing: t2, rep, options: shuffled(rnd, [n, ...neighbours(rnd, n, 2)]) };
    },
    // «Draw according to the required number»: كوباية عليها «8 △» — كل لمسة جوّاها بترسم شكل
    stamp() {
      return { kind: "stamp", n, shape: pickOf(rnd, ["triangle", "square", "circle", "star", "heart"]), color: c2 };
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
export const isWriteStep = (s) => ["write", "missing", "countWrite", "traceShape"].includes(s.kind);

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

// ===== الأشكال (الكتاب: دايرة وبيضاوى بعد ٦ · مربع ومستطيل بعد ٧ · المثلثات بعد ٨ · نجمة وقلب بعد ٩) =====
const r1 = (v) => Math.round(v * 10) / 10;
/** قوس (الزاوية بالدرجات، y لتحت): من -٩٠ لـ-٤٥٠ = من فوق عكس عقارب الساعة زى سهم الكتاب. */
function arcPts(cx, cy, rx, ry, a0, a1) {
  const steps = Math.max(8, Math.round(Math.abs(a1 - a0) / 8));
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((a0 + (a1 - a0) * (i / steps)) * Math.PI) / 180;
    return [r1(cx + rx * Math.cos(a)), r1(cy + ry * Math.sin(a))];
  });
}
function bezPts(p0, p1, p2, p3, n = 14) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return [0, 1].map((k) => r1(u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]));
  });
}
const joinPts = (...parts) => parts.reduce((out, p) => out.concat(out.length ? p.slice(1) : p), []);
function starPts() {
  return Array.from({ length: 11 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const r = i % 2 ? 15 : 36;
    return [r1(50 + r * Math.cos(a)), r1(52 + r * Math.sin(a))];
  });
}

/** كل شكل: اسمه + خطّه للوحة الكتابة (وحدات ٠–١٠٠، خط واحد مقفول) + حاجات بشكله. */
export const WB_SHAPES = {
  circle: { ar: "دايرة", en: "circle", strokes: [arcPts(50, 50, 32, 32, -90, -450)], things: ["🍊", "🕐", "🍩"] },
  oval: { ar: "بيضاوى", en: "oval", strokes: [arcPts(50, 50, 22, 36, -90, -450)], things: ["🥚", "🏉", "🎈"] },
  square: { ar: "مربع", en: "square", strokes: [[[26, 26], [74, 26], [74, 74], [26, 74], [26, 26]]], things: ["🎁", "🧇", "🔲"] },
  rectangle: { ar: "مستطيل", en: "rectangle", strokes: [[[16, 32], [84, 32], [84, 68], [16, 68], [16, 32]]], things: ["🚪", "🍫", "📱"] },
  triangle: { ar: "مثلث", en: "triangle", strokes: [[[50, 16], [84, 78], [16, 78], [50, 16]]], things: ["🍕", "⛺", "🔺"] },
  rightTriangle: { ar: "مثلث قايم", en: "right triangle", strokes: [[[26, 18], [26, 80], [80, 80], [26, 18]]], things: ["📐", "🧀"] },
  star: { ar: "نجمة", en: "star", strokes: [starPts()], things: ["⭐", "🌟"] },
  heart: {
    ar: "قلب", en: "heart",
    strokes: [joinPts(bezPts([50, 34], [40, 14], [12, 24], [18, 46]), bezPts([18, 46], [24, 62], [40, 72], [50, 84]),
      bezPts([50, 84], [60, 72], [76, 62], [82, 46]), bezPts([82, 46], [88, 24], [60, 14], [50, 34]))],
    things: ["❤️", "💝", "💌"],
  },
};
/** الروبوت (كتاب ص ٥٠): رقم كل شكل زى الكتاب — ١ دايرة · ٢ بيضاوى · ٣ قلب · ٤ مربع · ٥ مستطيل · ٦ مثلث · ٧ نجمة. */
export const WB_ROBOT_KEY = ["circle", "oval", "heart", "square", "rectangle", "triangle", "star"];
/** أجزاء الروبوت بالترتيب اللى بتترسم بيه (robotSvg فى الشاشة بنفس الترتيب). */
export const WB_ROBOT_PARTS = ["triangle", "star", "circle", "square", "square", "rectangle", "rectangle",
  "circle", "circle", "rectangle", "rectangle", "oval", "oval", "heart"];
export const WB_SHAPE_PAIRS = [["circle", "oval"], ["square", "rectangle"], ["triangle", "rightTriangle"], ["star", "heart"]];

/**
 * صفحة أشكال: meetShapes → ✏️ ارسم على النقط → «Put a check inside…» → «Choose the picture that
 * matches the shape» → ✏️ «Draw the required shape inside the cloud» (لوحده).
 */
export function shapesPage(pairIdx, rnd = Math.random) {
  const pair = WB_SHAPE_PAIRS[pairIdx];
  if (!pair) throw new Error("صفحة أشكال مش موجودة: " + pairIdx);
  const [a, b] = pair;
  const isTri = pairIdx === 2; // «all kinds of triangles»: المثلثين الاتنين مطلوبين
  const others = Object.keys(WB_SHAPES).filter((k) => !pair.includes(k));
  const steps = [];
  steps.push({ kind: "meetShapes", shapes: [a, b] });
  steps.push({ kind: "traceShape", shape: a, level: 2 });

  const targets = isTri ? [a, b] : [a];
  const near = isTri ? shuffled(rnd, others).slice(0, 2) : [b, b, pickOf(rnd, others)];
  const items = shuffled(rnd, [...(isTri ? [a, a, b, b] : [a, a, a, a]), ...near, ...(isTri ? [pickOf(rnd, others), pickOf(rnd, others)] : [pickOf(rnd, others)])]);
  steps.push({ kind: "checkShape", target: targets, say: a, items });

  // كل صف: الشكل + ٣ صور، واحدة بس بشكله (المشتّتات من أشكال تانية خالص)
  const rowShapes = shuffled(rnd, [a, b, pickOf(rnd, others)]);
  steps.push({
    kind: "matchShape",
    rows: rowShapes.map((sh) => {
      const wrongPool = Object.keys(WB_SHAPES).filter((k) => k !== sh && !(WB_SHAPE_PAIRS[2].includes(k) && WB_SHAPE_PAIRS[2].includes(sh)));
      const wrongs = shuffled(rnd, wrongPool).slice(0, 2).map((k) => pickOf(rnd, WB_SHAPES[k].things));
      const right = pickOf(rnd, WB_SHAPES[sh].things);
      return { shape: sh, right, options: shuffled(rnd, [right, ...wrongs]) };
    }),
  });
  // «Color as shown in the figure»: روبوت من كل الأشكال — كل شكل ليه رقم ولون
  const keyColors = shuffled(rnd, Object.keys(WB_COLORS)).slice(0, WB_ROBOT_KEY.length);
  steps.push({
    kind: "picture", art: "robot",
    key: WB_ROBOT_KEY.map((shape, i) => ({ value: i + 1, shape, color: keyColors[i] })),
    regions: WB_ROBOT_PARTS.map((part) => WB_ROBOT_KEY.indexOf(part) + 1),
  });
  steps.push({ kind: "traceShape", shape: b, level: 3 });
  return steps;
}

/** ترتيب صفحات الكراسة زى فهرس الكتاب: كل رقم من ١ لـ٤ وبعده صفحة ألوانه، و٥، وبعد ٦ و٧ و٨ و٩ صفحة أشكال، و١٠. */
export const WB_PAGES = [
  ...WB_COLOR_PAIRS.flatMap((_, i) => [{ id: String(i + 1), type: "number", n: i + 1 }, { id: "c" + i, type: "colors", pair: i }]),
  { id: "5", type: "number", n: 5 },
  ...WB_SHAPE_PAIRS.flatMap((_, i) => [{ id: String(i + 6), type: "number", n: i + 6 }, { id: "s" + i, type: "shapes", pair: i }]),
  { id: "10", type: "number", n: 10 },
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
  if (page.type === "colors") return colorsPage(page.pair, rnd);
  if (page.type === "shapes") return shapesPage(page.pair, rnd);
  return workbookPage(page.n, rnd, only);
}
