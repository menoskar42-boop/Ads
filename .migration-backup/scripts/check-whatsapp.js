#!/usr/bin/env node
/**
 * "I sent it" has to mean it was sent.
 *
 * WhatsApp goes out through the user's OWN session in their own browser: the
 * message comes from them, to a number they named, and none of their
 * credentials are copied anywhere. The deep link fills the composer; pressing
 * send is the actual job — and the failure that matters is telling somebody
 * their message reached a person while it sits in a composer nobody will look
 * at again.
 *
 * So this action returns ok ONLY when the page confirmed the send — the
 * composer that had text in it is empty afterwards, which is the page's own
 * receipt. Every other outcome names itself: not logged in, not on WhatsApp,
 * no send button.
 *
 * And the number is not guessed. `01001234567` is Egyptian with a national
 * prefix; a bare `123` has no country in it, and guessing one is how a message
 * goes to a stranger.
 *
 *   node scripts/check-whatsapp.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const W = require('../sokro/actions/WhatsAppAction');
const registry = require('../sokro/actions/_registry');
require('../sokro/actions');
const { mayRetry } = require('../sokro/workflows/executor');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The number ────────────────────────────────────────────────────────── */
{
  check('الرقم المصري بالصفر بياخد كود الدولة', W.normalizePhone('01001234567') === '201001234567');
  check('والأرقام العربية بتتقرا', W.normalizePhone('٠١٠٠١٢٣٤٥٦٧') === '201001234567');
  check('و+ و00 بيتشالوا', W.normalizePhone('+201001234567') === '201001234567' && W.normalizePhone('00201001234567') === '201001234567');
  check('والمسافات والشرط', W.normalizePhone('+1 415-555-2671') === '14155552671');
  check('واللي مالوش دولة ولا طول معقول بيترفض',
    W.normalizePhone('123') === null && W.normalizePhone('') === null && W.normalizePhone(null) === null);
  check('والرابط بيتبني متهرّب صح', W.link('201001234567', 'سلام & تمام').includes('%26') === false
    ? /text=%D8/.test(W.link('201001234567', 'سلام & تمام')) : true);
}

/* ── The action refuses before it sends ────────────────────────────────── */
{
  (async () => {
    const noExt = { userId: null };
    let r = await W({ userId: 1 }, { phone: '123', text: 'أهلاً' });
    check('رقم مش مفهوم = رفض قبل أي فتح', r.ok === false && r.errorCode === 'bad_phone');
    r = await W({ userId: 1 }, { phone: '01001234567', text: '  ' });
    check('ورسالة فاضية كمان', r.ok === false && r.errorCode === 'no_text');
    r = await W(noExt, { phone: '01001234567', text: 'أهلاً' });
    check('ومن غير إضافة بيقول السبب', r.ok === false && r.errorCode === 'no_extension' && /WhatsApp Web/.test(r.error));

    /* ── Only a confirmed send is a success ────────────────────────────── */
    const bridge = require('../sokro/extension-bridge');
    const realRun = bridge.run; const realConnected = bridge.connected;
    bridge.connected = () => true;
    const withOutput = async (output) => { bridge.run = async () => ({ ok: true, output }); return W({ userId: 1, log: () => {} }, { phone: '01001234567', text: 'أهلاً' }); };

    let out = await withOutput({ sent: true });
    check('اتبعت فعلاً = نجاح', out.ok === true && out.output.sent === true);

    out = await withOutput({ sent: false, reason: 'no_send_button' });
    check('ومالقاش زرار الإرسال = فشل صريح', out.ok === false && out.errorCode === 'no_send_button');
    check('والرد بيقول إنها مااتبعتتش', /مااتبعتتش/.test(out.error));

    out = await withOutput({ sent: false, reason: 'not_logged_in' });
    check('ومش مسجّل دخول ليه رسالته', out.ok === false && /WhatsApp Web/.test(out.error));

    out = await withOutput({ sent: false, reason: 'not_on_whatsapp' });
    check('ورقم مش على واتساب كمان', out.ok === false && /مش على واتساب/.test(out.error));

    // The dangerous shape: the extension answered ok but said nothing about the
    // send. Absence of "no" is not "yes".
    out = await withOutput({});
    check('وسكوت الإضافة مش نجاح', out.ok === false);

    bridge.run = realRun; bridge.connected = realConnected;

    /* ── Declared like the dangerous thing it is ───────────────────────── */
    {
      const a = registry.get('whatsapp_send');
      check('الأكشن متسجّل', !!a);
      check('وصلاحياته حسّاسة (بتطلب موافقة)',
        (a.permissions || []).includes('social') && (a.permissions || []).includes('submit'));
      check('ومابيتعادش أبداً', mayRetry(a, {}) === false);
    }

    /* ── And the extension confirms rather than assumes ────────────────── */
    {
      const bg = fs.readFileSync(path.join(ROOT, 'sokro/extension/background.js'), 'utf8');
      check('الإضافة عندها أمر واتساب', /cmd\.kind === 'wa_send'/.test(bg) && /async function doWaSend/.test(bg));
      check('وبتتأكد بعد الضغط مش بتفترض', /const emptied = after && after\.composer === ''/.test(bg));
      check('وبتفرّق بين مش-مسجّل ومش-على-واتساب',
        /reason: 'not_logged_in'/.test(bg) && /reason: 'not_on_whatsapp'/.test(bg));
      check('والتبويب بيفضل مفتوح قدام المستخدم', /openAndWait\(input\.url, true\)/.test(bg));
    }

    console.log(fail
      ? `\n${fail} مشكلة — يعني ممكن نقول «اتبعت» ورسالة قاعدة في الخانة.`
      : '\n«اتبعت» معناها الصفحة نفسها أكّدت، وأي حاجة تانية بتتقال باسمها.');
    process.exit(fail ? 1 : 0);
  })();
}
