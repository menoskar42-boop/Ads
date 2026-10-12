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

/** شكل العدد فى «لوّن حسب الرقم»: الرقم نفسه · نقط زى الدومينو/الزهر · حاجات متعدّة. */
export const WB_REPS = ["digit", "dots", "things"];

/**
 * خطوات صفحة الرقم n بالترتيب — كتابة (write) ولعب بالتناوب:
 *   meet → write(1) → colorN → countChoose → write(2) → match → find → parts → missing(write 3) → paint
 * كل خطوة فيها اللى الشاشة محتاجاه بس؛ والإجابة الصح محسوبة هنا (مش فى الشاشة).
 */
export function workbookPage(n, rnd = Math.random) {
  if (!Number.isInteger(n) || n < 1 || n > WB_MAX) throw new Error("رقم الكراسة من ١ لـ" + WB_MAX);
  const [c1, c2] = colorPairOf(n);
  const [t1, t2, t3, t4, t5, t6] = things(rnd, 6);
  const steps = [];

  // ١) اعرف الرقم: شريط الدواير (٥ خانات، أو ١٠ لو الرقم أكبر من ٥) — الطفل بيلمس ويعدّ
  steps.push({ kind: "meet", n, frame: n > 5 ? 10 : 5 });

  // ٢) اكتب: على الخط العريض
  steps.push({ kind: "write", n, level: 1 });

  // ٣) «Color four of the dresses» — بلون الكتاب، وفيه علبة ألوان والطفل يختار الصح
  const extra = n <= 3 ? 2 : n <= 7 ? 3 : 12 - n;
  steps.push({
    kind: "colorN", n, total: n + Math.max(2, extra), thing: t1, color: c1,
    palette: shuffled(rnd, [c1, c2, pickOf(rnd, WB_COLOR_PAIRS.filter((p) => !p.includes(c1)))[0]]),
  });

  // ٤) «Count and choose the correct number»: ٣ صور، تحت كل واحدة رقمين
  const counts = shuffled(rnd, [n, ...neighbours(rnd, n, 2)]);
  steps.push({
    kind: "countChoose",
    cards: counts.map((count, i) => {
      const wrong = neighbours(rnd, count, 1)[0];
      return { count, thing: [t2, t3, t4][i], options: rnd() < 0.5 ? [count, wrong] : [wrong, count] };
    }),
  });

  // ٥) اكتب تانى: على النقط
  steps.push({ kind: "write", n, level: 2 });

  // ٦) «Count, then match»: مجموعات على ناحية وأرقام على الناحية التانية
  const mCounts = shuffled(rnd, [n, ...neighbours(rnd, n, 2)]);
  steps.push({
    kind: "match",
    groups: mCounts.map((count, i) => ({ count, thing: [t5, t6, t1][i] })),
    numbers: shuffled(rnd, mCounts),
  });

  // ٧) «Color the octopus that has the number 1» / «Draw a circle around the number»
  const targets = n === 1 ? 4 : 3;
  const others = neighbours(rnd, n, 4, 9);
  const cells = shuffled(rnd, [
    ...Array(targets).fill(n),
    ...Array.from({ length: 9 - targets }, (_, i) => others[i % others.length]),
  ]);
  steps.push({ kind: "find", n, cells, color: c2 });

  // ٨) مكوّنات الرقم (٢ و ١ = ٣) — من ٢ وطالع
  if (n >= 2) {
    const a = 1 + Math.floor(rnd() * (n - 1));
    steps.push({ kind: "parts", n, a, b: n - a, thing: t2, options: shuffled(rnd, [n, ...neighbours(rnd, n, 2)]) });
  }

  // ٩) «Complete the missing numbers» — والناقص هو رقمنا: يكتبه لوحده
  const start = Math.min(Math.max(n - 1, 1), WB_MAX - 2);
  const seq = [start, start + 1, start + 2];
  // الخيارات: الناقص + أقرب رقمين مش ظاهرين فى الصف (الظاهر نفسه مايبقاش اختيار)
  const missOthers = WB_NUMBERS.filter((v) => !seq.includes(v))
    .sort((x, y) => Math.abs(x - n) - Math.abs(y - n) || x - y).slice(0, 2);
  steps.push({ kind: "missing", n, seq, blank: seq.indexOf(n), level: 3, options: shuffled(rnd, [n, ...missOthers]) });

  // ١٠) «Color number 1 pink and number 2 yellow» — الرقم وصورته بنقط وبحاجات
  const m = neighbours(rnd, n, 1)[0];
  const tiles = shuffled(rnd, [
    ...WB_REPS.map((rep) => ({ value: n, rep })),
    ...WB_REPS.map((rep) => ({ value: m, rep })),
  ]).map((t) => ({ ...t, thing: t.value === n ? t3 : t4 }));
  steps.push({ kind: "paint", pairs: [{ value: n, color: c1 }, { value: m, color: c2 }], tiles });

  return steps;
}

/** عدد خطوات الكتابة فى الصفحة (الاختبار بيتأكد إن الكتابة متوزّعة مش ورا بعض). */
export const isWriteStep = (s) => s.kind === "write" || s.kind === "missing";
