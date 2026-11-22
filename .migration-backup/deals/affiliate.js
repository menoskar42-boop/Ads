'use strict';

// فحص رابط الأفيلييت قبل الحفظ.
//
// رابط أمازون من غير `tag=` هو رابط بيوَدّي الزبون لأمازون **ومن غير أي
// نسبة للحساب** — يعني الموقع بيدفع تكلفة الإحالة ومابياخدش عمولتها،
// والمشكلة إنها بتفضل شغالة وباينة صح فمحدّش بياخد باله. والعكس أخطر:
// رابط لدومين تاني اتحط بالغلط في خانة الأفيلييت بيبقى إحالة لمكان
// مش متفق عليه. فالفحص بيقف على الاتنين.
//
// الوحدة دي **صافية** (مفيش شبكة ولا قاعدة بيانات) عشان الحارس يقدر
// يشغّلها ويتأكد من القواعد من غير سيرفر.

// دومينات أمازون الكاملة: هنا `tag` لازم يكون موجود وبقيمة.
const AMAZON_HOST = /(^|\.)amazon\.[a-z.]{2,7}$/i;
// اللينكات القصيرة: التاج جوّه الريدايركت نفسه ومش ظاهر في الـ URL،
// فمنقدرش نتحقق منه — بنسمح بيها من غير ما ندّعي إننا فحصناها.
const AMAZON_SHORT_HOST = /(^|\.)(amzn\.to|amzn\.eu|a\.co)$/i;

const MAX_LENGTH = 1200;

// النتيجة تلات حالات مش اتنين: مقبول / مرفوض بسبب / مقبول-بدون-تحقق.
// `kind` بيقول أنهي حالة، عشان اللي بيستدعي ما يخلطش بين
// \"اتفحص وعدّى\" و\"مقدرناش نفحص\".
function checkAffiliateUrl(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return { ok: false, kind: 'missing', error: 'رابط Affiliate مطلوب.' };
  if (value.length > MAX_LENGTH) return { ok: false, kind: 'too_long', error: 'رابط Affiliate طويل أكثر من اللازم.' };

  let parsed;
  try { parsed = new URL(value); } catch { return { ok: false, kind: 'invalid', error: 'رابط Affiliate غير صالح.' }; }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, kind: 'scheme', error: 'رابط Affiliate يجب أن يبدأ بـ http أو https.' };
  }

  const host = parsed.hostname;
  if (AMAZON_SHORT_HOST.test(host)) {
    return { ok: true, kind: 'short', url: parsed.toString(), tag: null };
  }
  if (AMAZON_HOST.test(host)) {
    const tag = (parsed.searchParams.get('tag') || '').trim();
    if (!tag) {
      return {
        ok: false,
        kind: 'no_tag',
        error: 'رابط أمازون بدون tag= لن يُحتسب كإحالة. انسخ الرابط من SiteStripe أو أضف معرّف الـ Associates.',
      };
    }
    return { ok: true, kind: 'tagged', url: parsed.toString(), tag };
  }
  return { ok: true, kind: 'other', url: parsed.toString(), tag: null };
}

module.exports = { checkAffiliateUrl, AMAZON_HOST, AMAZON_SHORT_HOST, MAX_LENGTH };
