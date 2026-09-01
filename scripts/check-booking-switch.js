#!/usr/bin/env node
/**
 * The switch that only the button obeyed.
 *
 * `booking_enabled` was read in the VIEW — the button disappeared — and never
 * on the server. The POST was accepted regardless. So a clinic that
 * deliberately turned online booking off kept receiving bookings from a saved
 * page, a back button, or anybody who had seen the form once, and had no way to
 * work out why. A hidden button is not a closed door.
 *
 * Two things this check insists on beyond "the route looks at the setting":
 *
 *  · **Default open.** A tenant with no settings row has not switched anything
 *    off. Refusing them would break every clinic that never opened the settings
 *    page — a fix that takes away more bookings than the bug did.
 *
 *  · **A settings table that cannot be read stays open too.** Closing a working
 *    booking form over a database blip is the same failure with better
 *    intentions.
 *
 * And the person who gets refused is told which of the two it was: "the clinic
 * is not taking online bookings" is a different sentence from "check your name
 * and phone", and this page has already been fixed once for printing the second
 * when it meant the first.
 *
 *   node scripts/check-booking-switch.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const tenant = code('src/routes/tenant.js');

/* ── The helper, and the two ways it must fail open ────────────────────── */
{
  const fn = (tenant.match(/async function bookingOpen[\s\S]*?\n\}/) || [''])[0];
  check('في دالة بتسأل الإعداد على السيرفر', !!fn);
  check('وبتقرا العمود من جدول إعدادات القطاع',
    /SELECT booking_enabled FROM \$\{table\} WHERE company_id=\$1/.test(fn));
  check('ومن غير صف إعدادات الحجز مفتوح (محدش قفل حاجة)',
    /!r\.rows\.length \|\| r\.rows\[0\]\.booking_enabled !== false/.test(fn));
  check('وخطأ في القراءة مايقفلش فورم شغّال',
    /catch \(e\)[\s\S]{0,400}return true;/.test(fn));
}

/* ── Both public booking routes ask it, before anything else ───────────── */
for (const [label, re, table, redirect] of [
  /* ⚠️ **لازم يتربط بالحارس بتاع العيادة بالاسم.** كان مكتوب
   * `/router\.post\('\/book',…/` وخلاص — أول تطابق في الملف. ولما اتضاف
   * راوت `/book` جديد **للورشة** فوق راوت العيادة، الحارس بقى يقيس
   * الورشة ويقول إن العيادة مابتسألش — والعيادة سليمة طول الوقت.
   * ساعتها الأحمر بيبقى كدب، وده أسوأ من مفيش فحص. */
  ['حجز العيادة', /router\.post\('\/book',\s*clinicGuard,[\s\S]*?\n\}\);/, 'clinic_settings', 'error=closed'],
  ['حجز كلاس الجيم', /router\.post\('\/book-class',[\s\S]*?\n\}\);/, 'gym_settings', 'bookerr=closed'],
]) {
  const body = (tenant.match(re) || [''])[0];
  check(label + ': بيسأل قبل ما يكتب', new RegExp("bookingOpen\\('" + table + "'").test(body),
    body ? '' : 'مالقيتش الراوت');
  check(label + ': وبيرجع بكود مفهوم', body.includes(redirect));
  {
    // Asking after the write would be decoration.
    const iAsk = body.indexOf('bookingOpen');
    const iWrite = Math.max(body.indexOf('INSERT INTO'), body.indexOf('booking.book('));
    check(label + ': والسؤال قبل الكتابة', iAsk > -1 && iWrite > iAsk, `ask@${iAsk} write@${iWrite}`);
  }
}

/* ── The refusal reaches the person, in its own words ───────────────────── */
{
  const clinicView = fs.readFileSync(path.join(ROOT, 'src/views/tenant_clinic.ejs'), 'utf8');
  const gymView = fs.readFileSync(path.join(ROOT, 'src/views/tenant_gym.ejs'), 'utf8');
  const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
  check('صفحة العيادة ليها رسالة خاصة بالقفل',
    /closed: 'cp\.err_closed'/.test(clinicView));
  check('ومش الرسالة العامة «راجع اسمك وتليفونك»',
    !/closed: 'cp\.error'/.test(clinicView));
  check('والمفتاح باللغتين', (i18n.match(/'cp\.err_closed'/g) || []).length === 2);
  check('وصفحة الجيم كمان', /gymBookError === 'closed'/.test(gymView));
}

/* ── And nothing renders the URL's own words ───────────────────────────── */
{
  check('رسالة العيادة أكواد معروفة بس',
    /\['1', 'taken', 'past', 'far', 'closed'\]\.includes/.test(tenant));
  check('ورسالة الجيم كمان',
    /\['1', 'dup', 'closed', 'members'\]\.includes\(String\(req\.query\.bookerr/.test(tenant));
}

/* ── The setting still means something on the screen ───────────────────── */
{
  const gymSettings = fs.readFileSync(path.join(ROOT, 'src/views/gym_admin/settings.ejs'), 'utf8');
  const clinicSettings = fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/settings.ejs'), 'utf8');
  check('والزرار لسه موجود في إعدادات الجيم', /name="booking_enabled"/.test(gymSettings));
  check('وفي إعدادات العيادة', /name="booking_enabled"/.test(clinicSettings));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني تاجر قفل الحجز ولسه بيوصله حجوزات.`
  : '\nالحجز المقفول مقفول على السيرفر، واللي بيتقفل عليه بيعرف السبب.');
process.exit(fail ? 1 : 0);
