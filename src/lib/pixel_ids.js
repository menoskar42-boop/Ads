// معرّفات البيكسل: التحقّق من الشكل قبل ما تتخزّن.
//
// الحفظ كان بيشيل الحروف الغريبة وخلاص، فأي حاجة كانت بتتقبل. وأكتر غلطة
// بتحصل في العملي مش حروف غريبة — إنك تلزق **رقم المنصّة الغلط في الخانة
// الغلط**: الـGA4 في خانة ميتا، أو بيكسل ميتا في خانة تيك توك. الصفحة كانت
// بتقول «اتحفظ»، والسكربت بيتحمّل، والتاجر يفضل أسبوعين يستنى أحداث
// مش هتوصل أبداً — لأن `fbq('init','G-ABC123')` بيفشل بصمت في المتصفح.
//
// وفيه غلطة تانية: التاجر بيلزق **السنيبت كله** (`<script>…`) بدل الرقم.
// التنضيف القديم كان بيشيل الأقواس ويسيب خليط حروف بيتحط جوّه `init()`.
//
// عشان كده كل خانة ليها شكل معروف، والرفض بيقول **إيه اللي اتلزق فعلاً**.
'use strict';

const PLATFORMS = {
  // بيكسل ميتا: أرقام بس، ١٥ أو ١٦ رقم في العملي (سيبناها ١٣–١٧ عشان
  // مانرفضش رقم صحيح شكله اتغيّر).
  fb_pixel_id: {
    label: 'Facebook Pixel',
    re: /^[0-9]{13,17}$/,
    hint: 'رقم من ١٥ رقم تقريباً، أرقام بس.',
  },
  // تيك توك: حروف كبيرة وأرقام، بيبدأ غالباً بـC أو D.
  //
  // **لازم يكون فيه حرف واحد على الأقل** — من غير الشرط ده الشكل ده بيبلع
  // رقم ميتا (١٥ رقم) كمان، فأكتر غلطة بتحصل — رقم في الخانة الغلط — كانت
  // بتعدّي في الاتجاه ده بالذات.
  tiktok_pixel_id: {
    label: 'TikTok Pixel',
    re: /^(?=[A-Z0-9]{15,30}$)[0-9]*[A-Z][A-Z0-9]*$/,
    hint: 'حروف كبيرة وأرقام، حوالي ٢٠ خانة (مثال: C1AB2CD3EF4GH5IJ6KL7).',
  },
  // GA4: G- وبعدها حروف/أرقام.
  ga4_id: {
    label: 'Google Analytics 4',
    re: /^G-[A-Z0-9]{6,14}$/,
    hint: 'بيبدأ بـ‎G-‎ (مثال: G-ABCD123456).',
  },
};

/** شكل كل منصّة، عشان الرسالة تقول «ده رقم GA4» بدل «قيمة غير صالحة». */
function looksLike(value) {
  const v = String(value || '').trim();
  for (const key of Object.keys(PLATFORMS)) {
    if (PLATFORMS[key].re.test(v.toUpperCase())) return key;
  }
  return null;
}

/**
 * تحقّق من خانة واحدة.
 *
 * @returns { ok, value, why, looksLike }
 *   why: 'shape'   — الشكل مش شكل المنصّة دي
 *        'snippet' — ده سنيبت أو رابط، مش رقم
 *        'wrong_platform' — ده رقم منصّة تانية (وبنقول أنهي)
 *
 * الفاضي **مش غلط**: التاجر بيمسح الرقم عشان يوقف التتبّع، وده قرار.
 */
function validate(field, raw) {
  const spec = PLATFORMS[field];
  if (!spec) return { ok: false, why: 'shape', value: null };

  const s = String(raw == null ? '' : raw).trim();
  if (!s) return { ok: true, value: null, why: null };

  // السنيبت كله. بيتقال باسمه لأن التاجر عارف إنه لزق سكربت، ومش هيفهم
  // «شكل غير صحيح» وهو شايف الكود اللي فيسبوك نفسه إداهوله.
  if (/[<>]|script|https?:\/\//i.test(s)) {
    return { ok: false, why: 'snippet', value: null };
  }

  // ميتا بتتقارن كما هي (أرقام)، والتانيين بحروف كبيرة — التاجر بيلزق
  // بحروف صغيرة أحياناً وده مش خطأ منه.
  const norm = field === 'fb_pixel_id' ? s : s.toUpperCase();
  if (spec.re.test(norm)) return { ok: true, value: norm, why: null };

  const other = looksLike(norm);
  if (other && other !== field) {
    return { ok: false, why: 'wrong_platform', value: null, looksLike: other };
  }
  return { ok: false, why: 'shape', value: null };
}

/**
 * تحقّق من النموذج كله.
 * @returns { values, errors } — `errors` مفتاحها الخانة، وقيمتها {why, looksLike}
 */
function validateAll(body) {
  const values = {};
  const errors = {};
  for (const field of Object.keys(PLATFORMS)) {
    const r = validate(field, (body || {})[field]);
    if (r.ok) values[field] = r.value;
    else errors[field] = { why: r.why, looksLike: r.looksLike || null };
  }
  return { values, errors };
}

module.exports = { PLATFORMS, validate, validateAll, looksLike };
