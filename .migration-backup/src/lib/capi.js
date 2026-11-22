// Conversion API: نفس عملية الشراء، متبعوتة من السيرفر كمان.
//
// البيكسل في المتصفح بيضيع في تلات حالات شائعة: مانع إعلانات، متصفح بيقفل
// الكوكيز التانية (سفاري وفايرفوكس افتراضياً)، وتبويب بيتقفل قبل ما السكربت
// يخلّص. النتيجة إن التاجر بيدفع لإعلان بيجيب طلبات، والمنصّة شايفة نص
// المبيعات — فبتوقف تحسّن على الإعلان الصح.
//
// ── القاعدة اللي الملف ده كله قايم عليها: **رقم الحدث واحد** ─────────────
//
// نفس عملية الشراء بتتبعت مرتين — من المتصفح ومن السيرفر — والاتنين لازم
// يبعتوا **نفس `event_id`**. ميتا بتدمجهم ساعتها في حدث واحد. من غير الرقم
// ده كل طلب بيتحسب مرتين، والتاجر بيفتكر إن الإعلان بيجيب ضعف اللي بيجيبه
// فيزوّد الميزانية على رقم مش حقيقي — وده أسوأ من إن الحدث ماوصلش أصلاً.
//
// الرقم مشتق من رقم الطلب (`order-<id>`) مش عشوائي: إعادة تحميل صفحة النجاح،
// أو إعادة إرسال من السيرفر بعد فشل، كلها بتبعت نفس الرقم — فمفيش تكرار.
//
// ── والبيانات الشخصية ───────────────────────────────────────────────────
//
// ميتا بتطلب الإيميل والموبايل **مهشّرين** (SHA-256) بعد تنضيف متفق عليه.
// مفيش هنا أي إرسال لبيانات خام، والتوكن نفسه بيتخزّن مشفّر في الخزنة ومش
// بيتكتب في أي لوج.
'use strict';

const crypto = require('crypto');

const GRAPH = 'https://graph.facebook.com/v19.0';

/** التهشير اللي ميتا بتطلبه: تنضيف متفق عليه، وبعدين SHA-256. */
function hash(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (!s) return null;
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** الموبايل: أرقام بس (من غير + ولا مسافات) قبل التهشير. */
function hashPhone(value) {
  const digits = String(value == null ? '' : value).replace(/[^\d]/g, '');
  if (!digits) return null;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

/**
 * رقم الحدث لعملية شراء.
 *
 * مشتق من رقم الطلب عشان يبقى هو هو في المتصفح وفي السيرفر ومع أي إعادة
 * إرسال. لو بقى عشوائي، الدمج بيقع والطلب بيتحسب مرتين.
 */
function eventIdFor(orderId) {
  return 'order-' + String(orderId);
}

/**
 * جسم الحدث. مفصول عن الإرسال عشان الفحص يقدر يقراه من غير شبكة.
 */
function purchasePayload(order, opts = {}) {
  const o = order || {};
  const user = {};
  const em = hash(o.customer_email);
  const ph = hashPhone(o.customer_phone);
  if (em) user.em = [em];
  if (ph) user.ph = [ph];
  // الـIP والـuser agent بيتبعتوا زي ما هما بقرار ميتا (مش بيانات شخصية
  // مهشّرة عندهم)، ولو مش موجودين مابنخترعش قيم.
  if (opts.ip) user.client_ip_address = opts.ip;
  if (opts.userAgent) user.client_user_agent = opts.userAgent;
  if (opts.fbp) user.fbp = opts.fbp;
  if (opts.fbc) user.fbc = opts.fbc;

  return {
    event_name: 'Purchase',
    // بالثواني زي ما الـAPI بيطلب — بالملي ثانية الحدث بيترفض.
    event_time: Math.floor((opts.at ? new Date(opts.at).getTime() : Date.now()) / 1000),
    event_id: eventIdFor(o.id),
    action_source: 'website',
    event_source_url: opts.url || undefined,
    user_data: user,
    custom_data: {
      currency: String(opts.currency || 'EGP').toUpperCase(),
      value: Math.max(0, Math.round((Number(o.total_amount) || 0) * 100) / 100),
      order_id: String(o.id),
      num_items: Math.max(0, Number(opts.items) || 0) || undefined,
    },
  };
}

/**
 * ابعت الحدث. بيرجع { ok, why } — ومابيرميش أبداً: فشل الإرسال لميتا
 * ماينفعش يوقّع صفحة نجاح الطلب على العميل.
 *
 * why: 'not_configured' — مفيش بيكسل أو توكن (ودي مش مشكلة، دي إعداد)
 *      'no_key'         — الخزنة مش متظبّطة، فالتوكن مش متقري
 *      'http'           — ميتا ردّت بخطأ
 *      'network'        — مااتبعتش أصلاً
 */
async function sendPurchase(company, order, opts = {}) {
  const pixel = company && company.fb_pixel_id;
  const token = opts.token || null;
  if (!pixel || !token) return { ok: false, why: 'not_configured' };

  const body = {
    data: [purchasePayload(order, opts)],
    // في وضع الاختبار بس — التاجر بياخد الكود ده من Test Events عنده.
    test_event_code: opts.testCode || undefined,
  };

  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(pixel)}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // التوكن في الجسم مش في الرابط: الروابط بتتكتب في لوجات البروكسي.
      body: JSON.stringify(Object.assign({}, body, { access_token: token })),
    });
    if (!res.ok) {
      // نصّ رد ميتا بيتقص وبيتسجّل من غير التوكن — الرسالة بتفيد في التشخيص،
      // والتوكن مش بيدخل اللوج أبداً.
      const text = (await res.text().catch(() => '')).slice(0, 300);
      console.error('[capi] meta rejected the event:', res.status, text.replace(/access_token=[^&"]*/g, 'access_token=•••'));
      return { ok: false, why: 'http', status: res.status };
    }
    return { ok: true };
  } catch (e) {
    console.error('[capi] send failed:', e.message);
    return { ok: false, why: 'network' };
  }
}

module.exports = { hash, hashPhone, eventIdFor, purchasePayload, sendPurchase, GRAPH };
