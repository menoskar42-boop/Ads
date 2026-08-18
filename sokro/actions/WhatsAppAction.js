'use strict';

// ── Sending a WhatsApp message ───────────────────────────────────────────────
//
// Through the user's OWN WhatsApp Web session, in their own browser: the
// message comes from them, to a number they named, and no credential of theirs
// is copied anywhere. (The official Cloud API is the other route — it needs a
// business account and an approved template, so it comes later and behind the
// same interface.)
//
// The rule that shapes everything here: a message is SENT or it is not. This
// action reports success only when the page confirmed it — no "probably went
// through". Getting that wrong means telling somebody their message reached a
// person when it is sitting in a composer nobody will look at.
const { register } = require('./_registry');

/**
 * A phone number as a person types it → digits WhatsApp accepts.
 *
 * `01001234567` is an Egyptian mobile with a national prefix; WhatsApp wants
 * `201001234567`. Guessing the country for a number that carries no clue is
 * how a message goes to a stranger, so anything ambiguous is refused.
 */
function normalizePhone(raw, defaultCountry) {
  const digits = String(raw == null ? '' : raw)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/[^\d+]/g, '');
  if (!digits) return null;
  const cc = String(defaultCountry || '20');
  if (digits.startsWith('+')) {
    const d = digits.slice(1);
    return /^\d{8,15}$/.test(d) ? d : null;
  }
  if (digits.startsWith('00')) {
    const d = digits.slice(2);
    return /^\d{8,15}$/.test(d) ? d : null;
  }
  // A national number: one leading zero, then the local number.
  if (digits.startsWith('0')) {
    const d = cc + digits.slice(1);
    return /^\d{8,15}$/.test(d) ? d : null;
  }
  // Already carries a country code (it starts with one and is long enough).
  if (/^\d{10,15}$/.test(digits)) return digits;
  return null;
}

function link(phone, text) {
  return 'https://web.whatsapp.com/send?phone=' + encodeURIComponent(phone)
    + '&text=' + encodeURIComponent(String(text || '').slice(0, 3000));
}

async function run(ctx, input) {
  const text = String((input && input.text) || '').trim();
  const phone = normalizePhone(input && input.phone, input && input.country);
  if (!phone) {
    return { ok: false, errorCode: 'bad_phone',
      error: 'الرقم ده مش مفهوم. اكتبه بالكامل (مثلاً 01001234567 أو +201001234567).' };
  }
  if (!text) return { ok: false, errorCode: 'no_text', error: 'اكتب الرسالة اللي عايز تبعتها.' };

  const ext = require('../extension-bridge');
  if (!(ctx.userId && ext.connected(ctx.userId))) {
    return { ok: false, errorCode: 'no_extension',
      error: 'الواتساب بيتبعت من متصفّحك أنت (جلستك في WhatsApp Web). وصّل إضافة سوكرو من /ext وافتح واتساب ويب الأول.' };
  }

  const r = await ext.run(ctx.userId, 'wa_send', { url: link(phone, text), phone, text }, 90000);
  if (!r || !r.ok) return { ok: false, errorCode: 'ext_failed', error: (r && r.error) || 'مقدرتش أوصل للمتصفّح.' };
  const o = r.output || {};
  // The only success is a confirmed one.
  if (o.sent !== true) {
    const why = {
      not_on_whatsapp: 'الرقم ده مش على واتساب.',
      not_logged_in: 'محتاج تسجّل دخول في WhatsApp Web الأول، وبعدين أعيد المحاولة.',
      no_send_button: 'مالقيتش زرار الإرسال — الرسالة **مااتبعتتش**. الصفحة مفتوحة قدامك بالرسالة جاهزة.',
    }[o.reason] || 'الرسالة مااتبعتتش. الصفحة مفتوحة قدامك عشان تبعتها بنفسك.';
    return { ok: false, errorCode: o.reason || 'not_sent', error: why, output: Object.assign({ phone }, o) };
  }
  if (ctx.log) ctx.log('whatsapp_send', { phone, chars: text.length });
  return { ok: true, output: Object.assign({ phone, sent: true }, o) };
}

register({
  name: 'whatsapp_send',
  description: 'Send a WhatsApp message from the user\'s own WhatsApp Web session (needs the Sokro extension and the user logged into web.whatsapp.com). input.phone = the recipient number, input.text = the message. Use for "ابعت واتساب لفلان".',
  // social + submit → the consent gate asks first, and the executor never
  // repeats it: a resent message is a message the recipient reads twice.
  permissions: ['browser', 'social', 'submit'],
  retryable: false,
  inputSchema: {
    type: 'object',
    properties: { phone: { type: 'string' }, text: { type: 'string' }, country: { type: 'string' } },
    required: ['phone', 'text'],
  },
  run,
});

module.exports = run;
module.exports.normalizePhone = normalizePhone;
module.exports.link = link;
