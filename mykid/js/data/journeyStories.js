// ===== قصص بتربط مهام رحلة اليوم (اقتراح كوديكس — المالك ٢٠٢٦-١١-٠٤) =====
// طبقة قصة فوق المهام الموجودة (مش إعادة بناء): كل قاعدة ليها هدف بيكمل مع الأيام —
//   🎨 «ميزو فقد ألوان قوس قزح»: كل مهمة ألوان بترجّع لون (٧) · ✏️ «قطار الحروف مش هيتحرك»: كل حرف عربية (١٠)
//   🔢 «بيض العصفورة»: كل مهمة أرقام بتفقس بيضة (٥). لما الهدف يكمل ⇒ احتفال بالفصل والقصة تبدأ فصل جديد.
// ملف صافى (من غير DOM) — العدّاد فى Store.storyProgress، والشاشة js/screens/dailyPlan.js.

export const RAINBOW = ["🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "🩷"];

export const STORIES = {
  color: {
    title: "ألوان قوس قزح",
    goal: RAINBOW.length,
    nudge: (left) => `قوس قزح ناقصه ${left} ${left === 1 ? "لون" : "ألوان"} — يلا نرجّعهم!`,
    done: "رجّعت كل ألوان قوس قزح! 🌈 ميزو فرحان جداً",
    strip: (have) => RAINBOW.map((c, i) => (i < have ? c : "⬜")).join(""),
  },
  write: {
    title: "قطار الحروف",
    goal: 10,
    nudge: (left) => `القطار مستنى ${left} ${left === 1 ? "عربية" : "عربيات"} عشان يتحرك!`,
    done: "القطار كمل واتحرّك! 🚂 توت توت",
    strip: (have) => "🚂" + "🚃".repeat(Math.min(have, 10)),
  },
  number: {
    title: "بيض العصفورة",
    goal: 5,
    nudge: (left) => `العصفورة مستنية ${left} ${left === 1 ? "بيضة تفقس" : "بيضات يفقسوا"}!`,
    done: "كل البيض فقس! 🐣 العصفورة بتقولك شكراً",
    strip: (have) => Array.from({ length: 5 }, (_, i) => (i < have ? "🐣" : "🥚")).join(""),
  },
};

/** حالة قصة: n = عدد المهام اللى خلصت للقاعدة دى من الأول */
export function storyState(key, n = 0) {
  const s = STORIES[key];
  if (!s) return null;
  const chapter = Math.floor(n / s.goal) + 1;
  const have = n % s.goal;
  return { key, title: s.title, chapter, have, goal: s.goal, left: s.goal - have, strip: s.strip(have), nudge: s.nudge(s.goal - have) };
}

/** بعد ما مهمة تخلص (n = العدد الجديد): الفصل كمل؟ ⇒ رسالته */
export function chapterDone(key, n) {
  const s = STORIES[key];
  return s && n > 0 && n % s.goal === 0 ? s.done : null;
}
