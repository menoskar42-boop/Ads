'use strict';
/**
 * تحقّق نموذج التواصل — إيميل وتليفون حقيقيين، أو رسالة خطأ صريحة.
 *
 * ── المشكلة اللي اتكشفت ────────────────────────────────────────────────
 *
 * `POST /contact` كان بيطلب الاسم والرسالة بس. إيميل `not-an-email` وتليفون
 * `abc` كانوا **بيتقبلوا وبيتحفظوا وبيرجّعوا رسالة نجاح**. ودي مسكها فحص
 * QA خارجي (`BUG-FORM-005`).
 *
 * والضرر مش شكلي: العميل بيسيب رقم غلط بالغلط (لوحة عربية · حرف ناقص)،
 * بيشوف «تم الإرسال»، وبيستنّى رد **عمره ما هييجي** — إحنا مش عارفين
 * نوصله. ده عميل حقيقي ضاع، وإحنا فاكرين إننا استلمنا رسالته.
 *
 * ── و«مفيش وسيلة تواصل» أسوأ من الاتنين ────────────────────────────────
 *
 * الاتنين كانوا اختياريين، يعني كان ينفع تتبعت رسالة **من غير أي وسيلة رد**.
 * دي مش رسالة، دي ملاحظة في قاعدة بيانات. لازم واحد منهم على الأقل.
 *
 * ── ثلاث نتايج مش اتنين ────────────────────────────────────────────────
 *
 * `ok` · `error` بسببه محدّد (أي حقل بالظبط) · والرسالة بالعربي عشان
 * تتعرض للزائر زي ما هي.
 *
 * ── الوحدة دي صافية ────────────────────────────────────────────────────
 *
 * مفيش شبكة ولا قاعدة بيانات — تنضيف وتحقّق بس، عشان الحارس يشغّلها
 * بأربعين حالة من غير سيرفر.
 */

const MAX = { name: 100, email: 150, phone: 30, message: 5000 };

/** تنضيف نص: بيرجّع `null` للفاضي مش سترينج فاضية. */
function clean(v, max) {
  const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/**
 * إيميل.
 *
 * التحقّق **مش** بيحاول يطابق RFC 5322 — التعبير النمطي الكامل بتاعه
 * مشهور بإنه بيرفض عناوين صحيحة. القاعدة العملية: حاجة، @، حاجة، نقطة،
 * وامتداد حرفين على الأقل، ومفيش مسافات. ده بيمسك `not-an-email` و
 * `ahmed@` و`@gmail.com` — وهي الأشكال اللي بتحصل فعلاً.
 */
function normalizeEmail(v) {
  const t = clean(v, MAX.email);
  if (!t) return null;
  const e = t.toLowerCase();
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e)) return null;
  return e;
}

/**
 * تليفون — **مش مصري بس**.
 *
 * ⚠️ `demo_lead.normalizePhone` بيفرض `01` وأحد عشر رقم، وده صح هناك
 * (الديمو للسوق المصري). هنا **غلط**: نموذج التواصل بيوصله أرقام خليجية
 * (+966 · +971)، ورفضها معناه إننا بنقفل الباب على السوق اللي فاتحينه.
 *
 * القاعدة: الأرقام العربية بتتحوّل لإنجليزية الأول (الزائر بيكتب بلوحة
 * عربية والرقم بيتخزّن بشكل مايتبعتش منه واتساب)، وبعدين سبعة لخمستاشر
 * رقم — ده مدى E.164 الفعلي.
 */
function normalizePhone(v) {
  const raw = String(v == null ? '' : v);
  const ar = '٠١٢٣٤٥٦٧٨٩';
  const digits = raw.replace(/[٠-٩]/g, (d) => String(ar.indexOf(d)))
    .replace(/[^\d+]/g, '');
  if (!digits) return null;
  const plus = digits.startsWith('+');
  const bare = digits.replace(/\D/g, '');
  if (bare.length < 7 || bare.length > 15) return null;
  return (plus ? '+' : '') + bare;
}

/**
 * يتحقّق من مدخلات النموذج.
 *
 * بيرجّع `{ ok: true, value }` أو `{ ok: false, field, error }`.
 */
function validate(body) {
  const b = body || {};
  const name = clean(b.name, MAX.name);
  const message = clean(b.message, MAX.message);
  const rawEmail = clean(b.email, MAX.email);
  const rawPhone = clean(b.phone, MAX.phone);

  if (!name) return { ok: false, field: 'name', error: 'اكتب اسمك.' };
  if (!message) return { ok: false, field: 'message', error: 'اكتب رسالتك.' };

  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (rawEmail && !email) {
    return { ok: false, field: 'email', error: 'الإيميل مش مكتوب صح — راجعه.' };
  }
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (rawPhone && !phone) {
    return { ok: false, field: 'phone', error: 'رقم التليفون مش مكتوب صح — راجعه.' };
  }
  // الرسالة اللي مالهاش وسيلة رد مش رسالة.
  if (!email && !phone) {
    return { ok: false, field: 'contact', error: 'سيب إيميل أو رقم تليفون عشان نقدر نرد عليك.' };
  }

  return { ok: true, value: { name, email, phone, message } };
}

module.exports = { validate, normalizeEmail, normalizePhone, clean, MAX };
