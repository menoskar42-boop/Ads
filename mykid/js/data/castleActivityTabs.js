// ترتيب العرض فقط لألعاب قلعتَي الحروف؛ بيانات الألعاب نفسها تبقى في activities.js.
const CASTLE_TABS = {
  arabic: [
    {
      id: "words",
      label: "يلا نلعب كلمات",
      titles: [
        "صور الحروف", "وصّل كل حرف بالصورة", "الحرف بيمسك إيد صاحبه",
        "كمّل الكلمة بالشكل الصحيح", "اسمع وحط فى العربية", "ختم الحرف",
        "اكتب الحرف موصول", "كمّل الكلمة بإيدك", "الحرف الهربان", "قطر الكلمة",
        "غلطة ميزو", "اصطياد الحروف", "بأى حرف تبدأ", "كوّن الكلمة",
        "مراجعة اليوم", "ورقة الامتحان",
      ],
    },
    {
      id: "letters",
      label: "يلا نلعب حروف",
      titles: [
        "اكتب من الذاكرة", "بازل الحرف", "نطة الضفدع", "الكشاف",
        "بيض المفاجآت", "بيانو ميزو", "معلّم الحروف", "شوف واعرف",
        "تعرّف على الحروف", "ارسم الحرف", "شرح الحركات", "الحركات",
        "أشكال الحرف", "الحروف المتشابهة",
      ],
    },
    // «الأقسام السبعة» (خطة ١٣، موافقة المالك ٢٠٢٦-١١-١٧): «سيب الـ٢٦ فى أماكنهم وضيف الـ٧ أقسام وهقيّمهم على الطبيعة»
    // ⇒ تاب زيادة بيعرض نفس الأنشطة (حتى لو موجودة فى تاب تانى) — مفيش حاجة بتتشال من مكانها.
    {
      id: "seven",
      label: "⭐ الأقسام السبعة (جديد)",
      all: true,
      titles: ["كراسة الحروف", "اختبر حروفى", "أعرف الكلمة", "اكتب من الذاكرة", "اكتب اسمك", "دوّر على حروف اسمك",
        "السبورة الذكية", "بيانو ميزو", "تحدّث مع ميزو"],
    },
  ],
  english: [
    {
      id: "words",
      label: "يلا نلعب كلمات",
      titles: [
        "حروفى بالنجمة", "صور الحروف", "وصّل الحرف بالصورة",
        "كمّل الكلمة بإيدك", "الحرف الهربان", "قطر الكلمة", "غلطة ميزو",
        "اصطياد الحروف", "الحرف الناقص", "المراجعة الذكية",
        "مراجعة اليوم", "ورقة الامتحان",
      ],
    },
    {
      id: "letters",
      label: "يلا نلعب حروف",
      titles: [
        "اكتب من الذاكرة", "بازل الحرف", "نطة الضفدع", "الكشاف",
        "بيض المفاجآت", "بيانو ميزو", "معلّم الحروف", "شوف واعرف",
        "تعرّف على الحروف", "ارسم الحرف", "بأى حرف تبدأ",
      ],
    },
    {
      id: "seven",
      label: "⭐ الأقسام السبعة (جديد)",
      all: true,
      titles: ["كتاب الإنجليزى", "اختبر حروفى", "أعرف الكلمة", "اكتب من الذاكرة", "السبورة الذكية", "بيانو ميزو", "تحدّث مع ميزو"],
    },
  ],
  // مدينة الأرقام (٢٠٢٦-١١-١٧): الـ٢٦ قسم زى ما هم فى تاب، والعشرة الجداد فى تاب جنبه
  numbers: [
    { id: "all", label: "كل الأقسام", rest: true },
    {
      id: "ten",
      label: "⭐ الأقسام العشرة (جديد)",
      all: true,
      titles: ["كراسة الأرقام", "اختبر أرقامى", "عُدّ واختر", "الجمع البسيط", "الطرح البسيط", "أيهما أكثر",
        "الأرقام حتى ٢٠", "وصّل النقاط", "قصة: النجوم الخمس", "بيانو ميزو"],
    },
  ],
};

const BOOK_TITLES = new Set(["كراسة الحروف", "كتاب الإنجليزى"]);
const TITLE_ALIASES = {
  arabic: {
    "وصّل كل حرف بالصورة": "وصّل الحرف بالصورة",
    "كمّل الكلمة بالشكل الصحيح": "كمّل الكلمة بالشكل الصح",
  },
};

function normalizeTitle(title) {
  return String(title)
    .normalize("NFC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[؟?]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

export function groupCastleActivities(regionId, activities) {
  const config = CASTLE_TABS[regionId];
  if (!config) return null;

  const books = activities.filter((activity) => BOOK_TITLES.has(activity.title));
  const games = activities.filter((activity) => !BOOK_TITLES.has(activity.title));
  const used = new Set();
  const missing = [];
  const pick = (tab) => tab.titles.flatMap((requestedTitle) => {
    const actualTitle = TITLE_ALIASES[regionId]?.[requestedTitle] || requestedTitle;
    const key = normalizeTitle(actualTitle);
    // tab.all: تاب «الجديد» — بياخد من كل الأنشطة (والكتب) حتى لو موجودة فى تاب تانى، ومابيشيلهاش من مكانها
    const match = (tab.all ? activities : games).find((activity) => (tab.all || !used.has(activity)) && normalizeTitle(activity.title) === key);
    if (!match) {
      missing.push(requestedTitle);
      return [];
    }
    if (!tab.all) used.add(match);
    return [match];
  });
  const groups = config.map((tab) => ({ ...tab, activities: tab.rest || tab.all ? [] : pick(tab) }));
  config.forEach((tab, i) => { if (tab.all) groups[i].activities = pick(tab); });
  // tab.rest: كل اللى ماخدهوش تاب عادى، بالترتيب الأصلى (مدينة الأرقام: الـ٢٦ قسم زى ما هم)
  const left = games.filter((activity) => !used.has(activity));
  const restIdx = config.findIndex((tab) => tab.rest);
  if (restIdx >= 0) groups[restIdx].activities = left.filter((activity) => !activity.fresh);

  return {
    books,
    groups,
    // اللى تحت التابات زى ما كان — والأنشطة الجديدة (fresh) فى تابها بس
    remaining: restIdx >= 0 ? [] : left.filter((activity) => !activity.fresh),
    missing,
  };
}
