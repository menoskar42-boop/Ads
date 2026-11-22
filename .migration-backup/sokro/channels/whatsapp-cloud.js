'use strict';

// ── واتساب كلاود: بحساب كل مستخدم هو ────────────────────────────────────────
//
// الشكل الأول كان بيقرا التوكن ورقم الهاتف من `process.env` — يعني **رقم واحد
// للمنصّة كلها**، وكل مستخدمي سوكرو بيبعتوا منه، ومحدش فيهم يقدر يربط رقمه.
// وده مش شكل منصّة بتخدم ناس مختلفين؛ ده شكل تطبيق لشخص واحد.
//
// دلوقتي كل دالة بتاخد **بيانات الحساب** كمُعامل. الملف ده مايعرفش خالص إن
// فيه قاعدة بيانات ولا خزنة ولا مستخدمين — بيعرف يكلّم ميتا وخلاص، فينفع
// يتجرّب بأرقام مخترعة من غير أي إعداد.
//
// ── والقاعدة اللي بتحكم الرسايل الصادرة ─────────────────────────────────
//
// ميتا بتقفل المحادثة بعد **٢٤ ساعة** من آخر رسالة من العميل. بعدها الرسالة
// الحرّة بترجع خطأ، واللي ينفع هو قالب معتمد (وبفلوس). الملف ده **مابيخمّنش**
// النافذة — بيرجّع خطأ ميتا زي ما هو عشان اللي فوق يقرّر، لأن تخمين النافذة
// غلط معناه رسالة اتقال عنها «اتبعتت» وهي مااتبعتتش.

const crypto = require('crypto');

const GRAPH = 'https://graph.facebook.com';
const VERSION = 'v21.0';

/**
 * بيانات الحساب اللي أي عملية محتاجاها.
 * @typedef {{ phoneNumberId: string, token: string, appSecret?: string, verifyToken?: string }} Creds
 */

/** الحساب مكتمل؟ (رقم + توكن — الباقي بيخصّ الويب هوك بس) */
function ready(creds) {
  return !!(creds && String(creds.phoneNumberId || '').trim() && String(creds.token || '').trim());
}

/**
 * توكن التحقّق اللي ميتا بتبعته وقت ربط الويب هوك.
 * المقارنة بتوقيت ثابت، والفاضي **مابيساويش** الفاضي — حساب لسه ما اتظبطش
 * مايتحوّلش لحساب بيقبل أي طلب.
 */
function verifyToken(expected, got) {
  const a = Buffer.from(String(got == null ? '' : got));
  const b = Buffer.from(String(expected == null ? '' : expected));
  if (!b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * توقيع الطلب الجاي من ميتا، بمفتاح **تطبيق صاحب الحساب**.
 * من غير مفتاح، الإجابة `false` — مش «عدّي». الحساب اللي مادخّلش مفتاحه
 * مايستقبلش رسايل، وده أأمن من إنه يستقبل أي حاجة.
 */
function verifySignature(appSecret, rawBody, signature) {
  const secret = String(appSecret || '');
  const sig = String(signature || '');
  if (!secret || !sig.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** جسم الرسالة زي ما ميتا بتستقبله — مفصول عشان يتجرّب من غير شبكة. */
function textPayload(to, text) {
  return {
    messaging_product: 'whatsapp',
    to: String(to),
    type: 'text',
    text: { preview_url: false, body: String(text == null ? '' : text).slice(0, 4096) },
  };
}

/** رابط الإرسال لرقم الحساب. */
function sendUrl(phoneNumberId, version) {
  return `${GRAPH}/${version || VERSION}/${encodeURIComponent(String(phoneNumberId))}/messages`;
}

/**
 * إرسال رسالة نصّية.
 * @param creds بيانات الحساب — مش من متغيّرات البيئة.
 */
async function send(creds, to, text, opts) {
  if (!ready(creds)) throw new Error('حساب واتساب مش متظبّط لهذا المستخدم');
  const o = opts || {};
  const body = o.template
    ? { messaging_product: 'whatsapp', to: String(to), type: 'template', template: o.template }
    : textPayload(to, text);
  const r = await fetch(sendUrl(creds.phoneNumberId, o.version), {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((out.error && out.error.message) || `WhatsApp API ${r.status}`);
    err.status = r.status;
    // كود ٤٧٠/١٣١٠٤٧ من ميتا معناه إن نافذة الـ٢٤ ساعة قفلت — بيترفع زي ما
    // هو عشان الشاشة تقول للمستخدم «محتاج قالب» بدل «فشل الإرسال».
    err.metaCode = (out.error && (out.error.code || out.error.error_subcode)) || null;
    throw err;
  }
  return out;
}

/** الرسايل الجوّه من جسم الويب هوك. */
function incoming(payload) {
  const out = [];
  for (const entry of (payload && payload.entry) || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      for (const message of value.messages || []) {
        out.push({
          phoneId: value.metadata && value.metadata.phone_number_id,
          messageId: message.id,
          from: message.from,
          text: message.text && message.text.body,
          type: message.type,
        });
      }
    }
  }
  return out;
}

module.exports = { VERSION, ready, verifyToken, verifySignature, send, incoming, textPayload, sendUrl };
