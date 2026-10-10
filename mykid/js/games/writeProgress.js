// ===== متابعة الكتابة: الحرف ده اتقن ولا محتاج يتعاد؟ =====
//
// دوال صافية (من غير DOM) — الشاشة بتديها سجل الحرف من `Store.writeStats` ومستواه.
// بتستخدمها صفحة ولى الأمر (ألوان الحروف + ورقة الطباعة) و«ارسم الحرف» (اللى بيبدأ
// بالحروف الصعبة لوحده بدل اختيار عشوائى). المالك ٢٠٢٦-١٠-١٠.

/** "new" ماجرّبهوش · "weak" محتاج يتعاد · "learning" بيتعلّمه · "mastered" اتقنه. */
export function writeStatus(stat, level) {
  if (!stat || !stat.n) return "new";
  const r = stat.r || [];
  const avg = r.reduce((s, x) => s + x[0], 0) / (r.length || 1);
  const last = r[r.length - 1] || [0, 1];
  if (last[0] >= 6 || avg >= 4) return "weak";
  // اتقنه = كتبه نضيف من غير مساعدة (المستوى ٣) آخر مرة، ومش أول مرة يكتبه
  if (level >= 3 && last[1] >= 3 && last[0] <= 2 && stat.n >= 3) return "mastered";
  return "learning";
}

const WEIGHT = { weak: 4, new: 2.5, learning: 1.5, mastered: 0.3 };

/**
 * ترتيب التدريب: الصعب الأول، وبعده الجديد، وبعده اللى بيتعلّمه — والمتقن آخر حاجة.
 * فيه عشوائية صغيرة عشان مايبقاش نفس الترتيب كل مرة.
 */
export function practiceOrder(items, statusOf, rand = Math.random) {
  return items
    .map((it) => ({ it, s: WEIGHT[statusOf(it)] + rand() * 1.4 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.it);
}

export const STATUS_LABEL = {
  mastered: "متقَن",
  learning: "تحت التعلّم",
  weak: "محتاج تدريب",
  new: "لسه ما اتكتبش",
};
