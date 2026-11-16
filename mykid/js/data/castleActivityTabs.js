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
  const groups = config.map((tab) => ({
    ...tab,
    activities: tab.titles.flatMap((requestedTitle) => {
      const actualTitle = TITLE_ALIASES[regionId]?.[requestedTitle] || requestedTitle;
      const key = normalizeTitle(actualTitle);
      const match = games.find((activity) => !used.has(activity) && normalizeTitle(activity.title) === key);
      if (!match) {
        missing.push(requestedTitle);
        return [];
      }
      used.add(match);
      return [match];
    }),
  }));

  return {
    books,
    groups,
    remaining: games.filter((activity) => !used.has(activity)),
    missing,
  };
}
