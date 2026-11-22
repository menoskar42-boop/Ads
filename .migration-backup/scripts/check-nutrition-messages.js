#!/usr/bin/env node
/**
 * سؤال المريض كان بيروح على واتساب رقم شخصي — ومعاه صورة ورقة التحاليل.
 *
 * يعني ورقة تحاليل باسم واحد بتتخزّن على تليفون شخصي وعلى سيرفر شركة تانية،
 * والسؤال بيضيع في نفس الشاشة اللي فيها كلام العيلة. الرسايل هنا جوّه النظام
 * جنب ملف المريض.
 *
 * ── الخمسة اللي الفحص ده بيمسكهم ────────────────────────────────────────
 *
 * ١) **دي مش شات.** اللي بيكتب الساعة ٢ بالليل ويشوف فقاعة رسالة بيفترض إن
 *    حد بيقرا. فالصفحة بتقول صراحةً إن دي مش للطوارئ، وبتقول وقت الرد بكلام
 *    العيادة نفسها. الجملة دي جزء من الميزة مش تحذير مركون في الفوتر.
 *
 * ٢) **«اتبعت» غير «اتقرت».** الحالة بتتحسب من `read_at` اللي بيتكتب لما
 *    الطرف التاني يفتح الخيط. علامة «اتقرت» على مجرد وصول الصف كدب نتيجته
 *    إن المريض يستنى رد على حاجة محدش شافها.
 *
 * ٣) **المريض بيقرا خيطه هو بس** — مافيش رقم مريض في أي رابط في البوابة،
 *    والكتابة بتتأكد إن المريض بتاع العيادة دي **جوّه** الجملة.
 *
 * ٤) **الصندوق على صلاحية `clinical`** زي التحاليل والخطة: جوّاه أسئلة طبية
 *    بأسماء أصحابها، مش «حجزلي ميعاد».
 *
 * ٥) **الميزة اختيارية ومقفولة افتراضياً** (قرار المالك: كل ميزة للتاجر
 *    اختيارية). والقراءة اللي تفشل مش «مفتوحة» — مابنوعدش بصندوق وارد.
 *
 *   node scripts/check-nutrition-messages.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MSG = require('../src/nutrition/messages');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const ROWS = [
  { id: 1, sender: 'patient', body: 'q1', read_at: '2026-08-18T10:00:00Z', created_at: '2026-08-18T09:00:00Z' },
  { id: 2, sender: 'practice', author_name: 'Dr. Nour', body: 'a1', read_at: null, created_at: '2026-08-18T10:05:00Z' },
  { id: 3, sender: 'patient', body: 'q2', read_at: null, created_at: '2026-08-19T07:00:00Z' },
];
const NOW = new Date('2026-08-19T12:00:00Z');

/* ── ١. «اتبعت» غير «اتقرت» ────────────────────────────────────────────── */
{
  const mine = MSG.threadFor(ROWS, 'patient');
  check('الرسالة اللي الطرف التاني فتحها بتقول «اتقرت»',
    mine[0].state === 'read' && mine[0].mine === true);
  check('واللي لسه ما اتفتحتش بتفضل «اتبعتت» مش «اتقرت»',
    mine[2].state === 'sent', mine[2].state);
  check('ورسالة الطرف التاني مالهاش حالة (مش بتقول لنفسك قريتها)',
    mine[1].state === null && mine[1].mine === false);
  check('والعيادة بتشوف نفس الخيط من ناحيتها',
    MSG.threadFor(ROWS, 'practice')[1].mine === true);
  check('واسم اللي رد بيوصل للمريض',
    mine[1].author === 'Dr. Nour');

  // كل طرف بيعدّ اللي جاي من التاني: العيادة عندها سؤال ما اتقراش، والمريض
  // عنده رد ما اتقراش. عدّاد بيعدّ رسايلي أنا كمان بيقول «٣ جديدة» لواحد
  // كاتب اتنين منهم بنفسه.
  check('وعدّاد الجديد بيعدّ اللي جاي من الطرف التاني بس',
    MSG.unreadFor(ROWS, 'practice') === 1 && MSG.unreadFor(ROWS, 'patient') === 1);
  check('واللي اتقرا مابيتعدّش',
    MSG.unreadFor(ROWS.map((r) => ({ ...r, read_at: '2026-08-19T12:00:00Z' })), 'practice') === 0);
}

/* ── ٢. «مستني رد» محسوب من الرسايل ────────────────────────────────────── */
{
  check('مستني رد بيتحسب من آخر رسالة مريض', MSG.waitingHours(ROWS, NOW) === 5,
    String(MSG.waitingHours(ROWS, NOW)));
  check('وأول ما العيادة ترد بيختفي',
    MSG.waitingHours(ROWS.concat([{ sender: 'practice', created_at: '2026-08-19T11:00:00Z' }]), NOW) === null);
  check('والخيط الفاضي مش «مستني»', MSG.waitingHours([], NOW) === null);
}

/* ── ٣. النص ───────────────────────────────────────────────────────────── */
{
  check('الرسالة الفاضية مابتتبعتش', MSG.clean('   \n ') === null);
  check('والطويلة بتتقص مش بترمي الطلب', MSG.clean('x'.repeat(5000)).length === MSG.MAX_LEN);
}

/* ── ٤. الكتابة مقيّدة بالعيادة جوّه الجملة ─────────────────────────────── */
{
  const q = MSG.insertMessage({ companyId: 7, patientId: 3, sender: 'patient', body: 'hi' });
  check('شرط «المريض بتاع العيادة دي» جوّه الـINSERT',
    /INSERT INTO nutrition_messages[\s\S]*FROM nutrition_patients p\s+WHERE p\.id = \$2 AND p\.company_id = \$1/.test(q.text));
  check('والمريض الموقوف مابيتكتبش عليه', /AND p\.is_active/.test(q.text));
  check('وبيرجّع الصف عشان الراوت مايقولش «اتبعت» على كتابة مااتعملتش',
    /RETURNING id, created_at/.test(q.text));
  check('والطرف اللي مش من قايمتنا بيترجع للمريض مش بيتكتب زي ما جه',
    MSG.insertMessage({ companyId: 1, patientId: 1, sender: 'admin', body: 'x' }).values[2] === 'patient');

  const m = MSG.markRead({ companyId: 7, patientId: 3, viewer: 'practice' });
  check('و«اتقرت» بتتكتب على رسايل الطرف التاني بس', /sender <> \$3/.test(m.text));
  check('ووقت أول قراية مابيتغيّرش مع كل فتحة للصفحة', /read_at IS NULL/.test(m.text));
}

/* ── ٥. الميزة اختيارية ومقفولة افتراضياً ──────────────────────────────── */
{
  check('مقفولة لو الإعداد مش موجود', MSG.enabledFrom(null) === false && MSG.enabledFrom({}) === false);
  check('ومقفولة لو القيمة مش true صريحة',
    MSG.enabledFrom({ messages_enabled: 'yes' }) === false && MSG.enabledFrom({ messages_enabled: false }) === false);
  check('وبتتفتح بقرار العيادة', MSG.enabledFrom({ messages_enabled: true }) === true);

  const schema = raw('src/nutrition/schema.js');
  check('والافتراضي في المخطط مقفول',
    /messages_enabled BOOLEAN NOT NULL DEFAULT false/.test(schema));
  check('وجدول الرسايل موجود وبيروح مع المريض',
    /CREATE TABLE IF NOT EXISTS nutrition_messages/.test(schema)
    && /patient_id\s+INTEGER NOT NULL REFERENCES nutrition_patients\(id\) ON DELETE CASCADE/.test(schema));
  check('و`read_at` عمود مستقل مش محسوب من وقت الوصول',
    /read_at\s+TIMESTAMPTZ,/.test(schema));
}

/* ── ٦. بوابة المريض ───────────────────────────────────────────────────── */
{
  const portal = code('src/routes/nutrition_portal.js');
  check('البوابة بتقرا رقم المريض من الجلسة مش من الرابط',
    /WHERE company_id=\$1 AND patient_id=\$2 ORDER BY created_at`,\s*\[req\.practice\.id, req\.patientId\]/.test(portal));
  check('ومفيش رقم مريض في أي مسار رسايل في البوابة',
    !/\/messages\/:/.test(portal));
  check('والميزة المقفولة مابتفتحش صفحة بتوعد بحاجة',
    (portal.match(/if \(!prefs\.on\) return res\.redirect\('\/portal'\)/g) || []).length >= 2);
  check('والقراءة اللي تفشل بترجع مقفولة',
    /catch \(e\) \{ console\.error\('\[portal msg prefs\]', e\.message\); return \{ on: false/.test(portal));
  check('والإرسال وراه حدّ معدّل',
    /rateLimit\(\{ name: 'nutrition-portal-msg'/.test(portal) && /router\.post\('\/messages', msgLimiter/.test(portal));
  check('والكتابة اللي مارجّعتش صف مابتقولش «اتبعت»',
    /if \(!r\.rows\.length\) return res\.redirect\('\/portal\/messages\?err=send'\)/.test(portal));
  check('وفتح الخيط بيعلّم رسايل العيادة مقروءة',
    /MSG\.markRead\(\{ companyId: req\.practice\.id, patientId: req\.patientId, viewer: 'patient' \}\)/.test(portal));
  check('والمدخل على الصفحة الرئيسية بيظهر لما الميزة مفتوحة بس',
    /msgs = \{ on: true, unread: MSG\.unreadFor\(rows, 'patient'\) \}/.test(portal));
}

/* ── ٧. لوحة العيادة ───────────────────────────────────────────────────── */
{
  const admin = code('src/routes/nutrition_admin.js');
  check('صندوق الوارد بيرتّب اللي مستني رد فوق',
    /ORDER BY unread DESC, last_at DESC/.test(admin));
  check('والخيوط بتاعت العيادة دي بس',
    /JOIN nutrition_patients p ON p\.id = m\.patient_id AND p\.company_id = m\.company_id/.test(admin));
  check('وفتح الخيط بيعلّم رسايل المريض مقروءة',
    /MSG\.markRead\(\{ companyId: req\.company\.id, patientId: pid, viewer: 'practice' \}\)/.test(admin));
  check('والرد باسم اللي رد فعلاً',
    /authorName: \(req\.perms && req\.perms\.name\) \|\| null/.test(admin));
  check('والرد اللي مارجّعش صف مابيقولش «اتبعت»',
    /if \(!r\.rows\.length\) return res\.redirect\(back \+ '\?err=save'\)/.test(admin));
  check('وإعداد الرسايل بيتحفظ من شاشة الإعدادات',
    /messages_enabled=EXCLUDED\.messages_enabled/.test(admin)
    && /b\.messages_enabled === '1', text\(b\.messages_reply_note, 200\)/.test(admin));

  check('وكود الخطأ من قايمة عندنا مش من الرابط',
    /const MSG_ERRORS = \['empty', 'save'\]/.test(admin) && !/err: req\.query\.err \|\| null/.test(admin));

  const perms = code('src/nutrition/perms.js');
  check('والصندوق على صلاحية التحاليل والخطة مش على الاستقبال',
    /\['\/messages', 'clinical'\]/.test(perms));
}

/* ── ٨. الشاشات والكلام ────────────────────────────────────────────────── */
{
  const page = raw('src/views/nutrition_portal/messages.ejs');
  check('صفحة المريض بتقول إن دي مش للطوارئ',
    /np\.msg\.not_urgent/.test(page));
  check('وبتقول وقت الرد بكلام العيادة، ولو ما كتبتوش بجملة واضحة',
    /replyNote \? replyNote : t\('np\.msg\.reply_default'\)/.test(page));
  check('وبتعرض حالة الرسالة (اتبعتت/اتقرت)', /np\.msg\.st\.' \+ m\.state/.test(page));
  check('والصفحة noindex وبدون إعلانات',
    /noindex,nofollow/.test(raw('src/views/nutrition_portal/head.ejs'))
    && !/adsbygoogle/.test(page));

  const inbox = raw('src/views/nutrition_admin/messages.ejs');
  check('وصندوق العيادة المقفول بيقول إنه مقفول مش بيبان فاضي',
    /nt\.msg\.off/.test(inbox) && /nt\.msg\.open_settings/.test(inbox));

  const set = raw('src/views/nutrition_admin/settings.ejs');
  check('والزرار في الإعدادات مش متعلّم افتراضياً',
    /name="messages_enabled" value="1" <%= settings\.messages_enabled \? 'checked' : '' %>/.test(set));

  const keys = ['nt.nav.messages', 'nt.msg.title', 'nt.msg.off', 'nt.msg.st.sent', 'nt.msg.st.read',
    'nt.msg.err.empty', 'nt.set.msg_on', 'nt.set.msg_note',
    'np.msg.title', 'np.msg.not_urgent', 'np.msg.reply_default', 'np.msg.st.sent', 'np.msg.st.read',
    'np.msg.waiting', 'np.msg.err.send'];
  const missing = keys.filter((k) => !strings.ar[k] || !strings.en[k]);
  check('والكلام باللغتين', missing.length === 0, missing.join(', ') || 'تمام');
}

console.log(fail === 0
  ? '\n✅ الرسايل جوّه النظام: «اتبعت» غير «اتقرت»، والصفحة مابتوعدش برد فوري.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
