#!/usr/bin/env node
/**
 * زرار «احجز» كان بيفتح واتساب.
 *
 * ده مش حجز: المريض بيبعت رسالة، الأخصائي بيرد بعد ساعتين «الميعاد ده
 * محجوز»، والمريض راح لغيره. وأسوأ من كده — ماكانش فيه أي حاجة تمنع إن اتنين
 * يتفقوا على نفس الساعة، لأن مافيش خانات أصلاً.
 *
 * ── التلاتة اللي الفحص ده بيمسكهم ───────────────────────────────────────
 *
 * ١) **الخانات محسوبة من إعدادات العيادة، مش صفوف متخزّنة.** جدول خانات
 *    معناه إن الأخصائي لما يغيّر مواعيده تفضل خانات قديمة شغّالة والمريض
 *    يحجز في ميعاد مقفول.
 *
 * ٢) **التعارض جوّه جملة الكتابة.** اتنين بيحجزوا نفس الخانة في نفس الثانية
 *    — واحد بس بينجح. قراءة قبل الكتابة بتقرا صح وبتتسابق برضه، ودي مش حالة
 *    نظرية لعيادة بتنشر لينكها على واتساب.
 *
 * ٣) **بتوقيت القاهرة.** تقويم بيرسم ميعاد ١١ مساءً في اليوم اللي بعده أسوأ
 *    من مفيش تقويم. والخانة اللي فاتت النهاردة مابتتعرضش أصلاً.
 *
 * وكمان: الخانة المحجوزة **بتتعرض «محجوزة»** مش بتختفي — عشان الزائر يعرف إن
 * اليوم شغّال وفيه خانات اتاخدت، مش يفتكر إن العيادة قافلة.
 *
 *   node scripts/check-nutrition-booking.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const B = require('../src/nutrition/booking');
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

// مصر بتوقيت صيفي في أغسطس (UTC+3)، فـ٩:٠٠ عالمي = ١٢:٠٠ بالقاهرة.
// الرقم ده متكتوب هنا عمداً: أي حسبة بتفترض +٢ على طول بتغلط نص السنة.
const NOW = new Date('2026-08-19T09:00:00Z');

/* ── ١. التوقيت ────────────────────────────────────────────────────────── */
{
  check('التاريخ بتوقيت القاهرة مش السيرفر', B.cairoDate(NOW) === '2026-08-19');
  check('والساعة كمان (توقيت صيفي)', B.cairoMinutes(NOW) === 12 * 60, String(B.cairoMinutes(NOW)));
  check('واليوم في الأسبوع صح', B.cairoWeekday('2026-08-19') === 3);
  // ٤ العصر بتوقيت القاهرة = ١ ظهراً UTC (توقيت صيفي)
  const at = B.slotAt('2026-08-19', '16:00');
  check('الخانة بتتحوّل لوقت مطلق صح', B.cairoMinutes(at) === 16 * 60, at);
  check('والتاريخ البايظ بيترفض مش بيتخمّن',
    B.slotAt('19/08/2026', '16:00') === null && B.slotAt('2026-08-19', '4pm') === null);
}

/* ── ٢. الخانات من الإعدادات ───────────────────────────────────────────── */
{
  const cfg = B.settingsFrom({});
  check('الافتراضي أيام شغل معقولة', cfg.days.has(0) && !cfg.days.has(5));
  check('وطول الجلسة أطول من كشف العيادة', cfg.minutes === 45);

  const slots = B.slotsFor(cfg, '2026-08-20', [], NOW);
  check('اليوم الشغّال فيه خانات', slots.length > 0, slots.length + ' خانة');
  check('والخانات على مسافة طول الجلسة',
    slots[1] && (slots[1].minutes - slots[0].minutes) === cfg.minutes);
  check('واليوم الأجازة مالوش خانات', B.slotsFor(cfg, '2026-08-21', [], NOW).length === 0);

  // اللي فات النهاردة مابيتعرضش — «متاح الساعة ٤» والساعة ٧ كدب.
  const today = B.slotsFor(cfg, '2026-08-19', [], new Date('2026-08-19T16:00:00Z'));
  check('واللي فات النهاردة مابيتعرضش', today.every((s) => s.minutes > 19 * 60));

  // الخانة المحجوزة بتتعرض «محجوزة» مش بتختفي.
  const taken = [{ slot_at: B.slotAt('2026-08-20', '17:30') }];
  const withTaken = B.slotsFor(cfg, '2026-08-20', taken, NOW);
  const busy = withTaken.filter((s) => s.taken);
  check('والمحجوزة بتتعرض محجوزة مش بتختفي',
    busy.length === 1 && busy[0].time === '17:30' && withTaken.length === slots.length);

  const cfg2 = B.settingsFrom({ work_days: '1', work_from: '09:00', work_to: '11:00', slot_minutes: 60 });
  check('وإعدادات العيادة بتتحترم',
    cfg2.days.size === 1 && cfg2.from === 540 && cfg2.to === 660 && cfg2.minutes === 60);
  const cfgBad = B.settingsFrom({ work_days: 'xx', work_from: 'مساءً', slot_minutes: '0' });
  check('والإعداد البايظ بيرجع لافتراضي مايقفلش الحجز',
    cfgBad.days.size > 0 && cfgBad.minutes >= 10 && cfgBad.to > cfgBad.from);
}

/* ── ٣. الميعاد اللي عدّى أو بعيد ──────────────────────────────────────── */
{
  check('اللي عدّى بيترفض', B.slotProblem(B.slotAt('2026-08-01', '16:00'), NOW) === 'past');
  check('واللي بعيد سنة بيترفض', B.slotProblem(B.slotAt('2028-01-01', '16:00'), NOW) === 'far');
  check('واللي في المدى بيعدّي', B.slotProblem(B.slotAt('2026-08-20', '16:00'), NOW) === null);
}

/* ── ٤. الكتابة بتفحص التعارض في نفس الجملة ────────────────────────────── */
{
  const q = B.insertIfFree({ companyId: 5, name: 'x', phone: '1', at: '2026-08-20T14:30:00Z', note: null, status: 'pending', minutes: 45 });
  check('الشرط جوّه الـINSERT مش SELECT قبله',
    /INSERT INTO nutrition_appointments[\s\S]*WHERE NOT EXISTS/.test(q.text));
  check('والتعارض بيتقاس بطول الجلسة',
    /abs\(extract\(epoch from \(slot_at - \$4::timestamptz\)\)\) < \$7 \* 60/.test(q.text));
  check('والملغي مابيحجزش خانة', /status <> 'cancelled'/.test(q.text));
  check('وبيرجّع الصف عشان الراوت يعرف نجح ولا لأ', /RETURNING id, slot_at/.test(q.text));
  check('والقيم متمرّرة كمعاملات', q.values.length === 7 && q.values[0] === 5);
}

/* ── ٥. الوصل: الصفحة العامة والمكتب بيقروا من نفس المصدر ──────────────── */
{
  const tenant = code('src/routes/tenant.js');
  check('الصفحة العامة بتحسب الخانات من نفس الدالة',
    /nb\.daysAhead\(cfg, taken\)/.test(tenant));
  check('والحجز العام بيرفض خانة مش من مواعيد العيادة',
    /const offered = nb\.slotsFor\(cfg, String\(b\.day\), \[\]\)\.some/.test(tenant));
  check('وبيحترم زر إيقاف الحجز',
    /bookingOpen\('nutrition_settings', company\.id\)/.test(tenant));
  check('والخانة المتاخدة بتتقال للمريض بسبب واضح',
    /error=taken#book/.test(tenant));

  const admin = code('src/routes/nutrition_admin.js');
  check('والمكتب بيستعمل نفس جملة الكتابة',
    /NB\.insertIfFree\(\{/.test(admin) && /err=taken/.test(admin));
  check('وشاشة المواعيد بتحسب أيامها من نفس الدالة',
    /NB\.daysAhead\(cfg, rows/.test(admin));
  check('وتغيير الحالة من قايمة السيرفر',
    /\['confirmed', 'done', 'cancelled'\]\.includes\(to\)/.test(admin));
  check('والتحديث مقيّد بالعيادة', /WHERE id=\$2 AND company_id=\$3 RETURNING id/.test(admin));

  const perms = code('src/nutrition/perms.js');
  check('والمواعيد شغل الاستقبال (نفس صلاحية المرضى)',
    /\['\/appointments', 'patients'\]/.test(perms));
}

/* ── ٦. المخطط والشاشات ────────────────────────────────────────────────── */
{
  const schema = raw('src/nutrition/schema.js');
  check('جدول المواعيد موجود', /CREATE TABLE IF NOT EXISTS nutrition_appointments/.test(schema));
  check('وإعدادات المواعيد أعمدة مش قيم متصلّبة',
    /work_days TEXT/.test(schema) && /slot_minutes INTEGER/.test(schema));
  check('ومفيش جدول خانات متخزّن',
    !/CREATE TABLE IF NOT EXISTS nutrition_slots/.test(schema));

  const page = raw('src/views/tenant_nutrition.ejs');
  check('صفحة العيادة فيها تقويم مش زرار واتساب بس',
    /action="\/nutrition\/book"/.test(page) && /ntSlots/.test(page));
  check('والواتساب بيفضل بديل لما مافيش مواعيد متظبّطة',
    /ntp\.book_wa/.test(page));
  const screen = raw('src/views/nutrition_admin/appointments.ejs');
  check('وشاشة المكتب بتعرض المحجوز ومقفول', /o\.disabled = !!s\.taken/.test(screen));

  const keys = ['ntp.book_hint', 'ntp.book_taken', 'nt.ap.title', 'nt.ap.err.taken', 'nt.set.booking', 'nt.day.fri'];
  const missing = keys.filter((k) => !strings.ar[k] || !strings.en[k]);
  check('والكلام باللغتين', missing.length === 0, missing.join(', ') || 'تمام');
}

console.log(fail === 0
  ? '\n✅ الحجز بقى بخانات حقيقية بتوقيت القاهرة، واتنين في نفس الثانية واحد بس بينجح.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
