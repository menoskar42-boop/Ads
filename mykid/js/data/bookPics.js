// صور الكلمات من كتاب البنت نفسه (المالك ٢٠٢٦-١١-١٦: «صور الحروف تبقى نفس صور الكتاب… الكلمات اللى عندنا ومش موجودة
// فى الكتاب سيب صورها زى ما هى»). الرسمة متقصوصة من صفحة الكتاب (docs/book-photos/english/) ومحفوظة فى
// assets/book/en/<الكلمة>.webp — والكلمة اللى مالهاش صورة هنا بتفضل بالإيموجى.

/** كلمات كتاب الإنجليزى اللى ليها رسمة من الكتاب */
export const BOOK_IMG_EN = new Set([
  // M (ص. ١) · A (ص. ٣) · S (ص. ٥؛ sand من تمرين ص. ٦) · T (ص. ٧) · P (ص. ٩)
  "man", "mom", "mud",
  "apple", "ant", "axe",
  "sand", "sun", "star",
  "turtle", "toy", "train",
  "pants", "pen", "pan",
  // N (ص. ١١) · I (ص. ١٣) · C (ص. ١٥)
  "nest", "night", "numbers",
  "insect", "in", "ink",
  "cloud", "cow", "cap",
  // F (ص. ١٧؛ fish من تمرين ص. ٢٠) · D (ص. ١٩) · H (ص. ٢١)
  "frog", "fork", "fish",
  "desk", "dog", "dress",
  "honey", "heart", "helicopter",
  // O (تمرين ص. ٢٤) · R (ص. ٢٥)
  "ostrich", "orange", "octopus",
  "robot", "rabbit", "rice",
]);

/** مسار الرسمة (نسبةً لـ /assets/) أو null لو الكلمة مالهاش رسمة من الكتاب */
export function bookImgEn(w) {
  const k = String(w || "").toLowerCase().trim();
  return BOOK_IMG_EN.has(k) ? `book/en/${k}.webp` : null;
}

/** HTML للصورة: رسمة الكتاب لو موجودة، وإلا الإيموجى زى ما هو */
export function wordPicHtml(w, emoji, cls = "lbk-emoji") {
  const img = bookImgEn(w);
  return img
    ? `<img class="${cls} book-pic" src="/assets/${img}" alt="" draggable="false">`
    : `<span class="${cls}">${emoji}</span>`;
}
