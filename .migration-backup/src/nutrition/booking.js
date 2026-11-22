// حجز موعد في عيادة التغذية — بتقويم حقيقي، مش زرار واتساب.
//
// الزرار اللي كان على الصفحة بيفتح واتساب بجملة جاهزة. ده مش حجز: الأخصائي
// بيرد بعد ساعتين يقول «الميعاد ده محجوز»، والمريض راح لغيره. والأسوأ إن
// مفيش أي حاجة بتمنع إن اتنين يتفقوا على نفس الساعة.
//
// ── التلات قواعد اللي الملف ده قايم عليها ────────────────────────────────
//
// ١) **المواعيد بتتحسب من إعدادات العيادة، مش مكتوبة في جدول.** أيام الشغل
//    وساعاته وطول الجلسة إعدادات؛ الخانات المتاحة بتتولّد منها كل مرة. جدول
//    خانات متخزّن معناه إن تغيير المواعيد بيسيب خانات قديمة شغّالة.
//
// ٢) **التعارض بيتفحص جوّه جملة الكتابة.** اتنين بيحجزوا نفس الخانة في نفس
//    الثانية — واحد بس بينجح. قراءة قبل الكتابة بتقرا صح وبتتسابق برضه، ودي
//    مش حالة نظرية لعيادة بتنشر لينكها على واتساب.
//
// ٣) **بتوقيت القاهرة، مش توقيت السيرفر.** تقويم بيرسم ميعاد الساعة ١١ مساءً
//    في اليوم اللي بعده أسوأ من مفيش تقويم.
'use strict';

const TZ = 'Africa/Cairo';
const DAY_MS = 24 * 60 * 60 * 1000;

// جلسة التغذية أطول من كشف العيادة، والافتراضي بيتغيّر من الإعدادات.
const DEFAULT_MINUTES = 45;
const DEFAULT_FROM = '16:00';
const DEFAULT_TO = '22:00';
// السبت→الخميس: الجمعة أجازة في أغلب العيادات، والعيادة تقدر تغيّرها.
const DEFAULT_DAYS = '0,1,2,3,4,6';

const GRACE_MINUTES = 5;
const HORIZON_DAYS = 14;

/** التاريخ في القاهرة كـYYYY-MM-DD. */
function cairoDate(at) {
  const d = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** دقايق من نص الليل، بتوقيت القاهرة. */
function cairoMinutes(at) {
  const d = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const [h, m] = parts.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** رقم اليوم في الأسبوع لتاريخ قاهري، ٠=الأحد … ٦=السبت. */
function cairoWeekday(ymd) {
  const d = new Date(String(ymd) + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime())) return null;
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

const toMinutes = (v) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return Number.isFinite(h) && Number.isFinite(mi) ? h * 60 + mi : null;
};
const hhmm = (mins) => String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');

/**
 * إعدادات المواعيد من صف `nutrition_settings`.
 * كل قيمة بتترجع للافتراضي لو مش مقروءة — إعداد بايظ مايقفلش الحجز، بس
 * مايخترعش مواعيد بره المعقول كمان.
 */
function settingsFrom(row) {
  const s = row || {};
  const days = new Set(String(s.work_days == null ? DEFAULT_DAYS : s.work_days)
    .split(',').map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6));
  const from = toMinutes(s.work_from) == null ? toMinutes(DEFAULT_FROM) : toMinutes(s.work_from);
  const to = toMinutes(s.work_to) == null ? toMinutes(DEFAULT_TO) : toMinutes(s.work_to);
  const minutes = Math.min(180, Math.max(10, parseInt(s.slot_minutes, 10) || DEFAULT_MINUTES));
  return {
    days: days.size ? days : new Set(DEFAULT_DAYS.split(',').map(Number)),
    from, to: to > from ? to : from + minutes, minutes,
    enabled: s.booking_enabled !== false,
  };
}

/**
 * خانات يوم واحد.
 *
 * @param taken مواعيد محجوزة (صفوف فيها slot_at) — الخانة اللي فيها حجز
 *        بتترجع `taken: true` بدل ما تتشال، عشان المريض يشوف إن اليوم شغّال
 *        وفيه خانات اتاخدت، مش يفتكر إن العيادة قافلة.
 * @param now لحظة المقارنة (للاختبار).
 */
function slotsFor(settings, ymd, taken, now) {
  const cfg = settings;
  const day = cairoWeekday(ymd);
  if (day == null || !cfg.days.has(day)) return [];

  const busy = new Set();
  for (const t of taken || []) {
    if (!t || !t.slot_at) continue;
    if (cairoDate(t.slot_at) !== ymd) continue;
    busy.add(cairoMinutes(t.slot_at));
  }

  const ref = now ? new Date(now) : new Date();
  const today = cairoDate(ref);
  const nowMins = cairoMinutes(ref);

  const out = [];
  for (let m = cfg.from; m + cfg.minutes <= cfg.to; m += cfg.minutes) {
    // اللي فات النهاردة مابيتعرضش أصلاً — خانة الساعة ٤ الساعة ٧ مش «متاحة».
    const past = ymd < today || (ymd === today && m <= nowMins + GRACE_MINUTES);
    if (past) continue;
    out.push({ time: hhmm(m), minutes: m, taken: busy.has(m) });
  }
  return out;
}

/** الأيام الجاية اللي فيها خانات، لعرضها في تقويم بسيط. */
function daysAhead(settings, taken, now, horizon) {
  const ref = now ? new Date(now) : new Date();
  const out = [];
  const n = Math.min(60, Math.max(1, horizon || HORIZON_DAYS));
  for (let i = 0; i < n; i++) {
    const ymd = cairoDate(new Date(ref.getTime() + i * DAY_MS));
    const slots = slotsFor(settings, ymd, taken, ref);
    if (slots.length) out.push({ ymd, weekday: cairoWeekday(ymd), slots });
  }
  return out;
}

/**
 * الوقت اللي المريض اختاره: تاريخ + خانة، بيتحوّلوا لـtimestamp بتوقيت القاهرة.
 * بيرجع نص ISO أو null لو الشكل مش مظبوط — والراوت بيرفض، مابيخمّنش.
 */
function slotAt(ymd, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ''))) return null;
  if (!/^\d{2}:\d{2}$/.test(String(time || ''))) return null;
  // الإزاحة بتتحسب من التاريخ نفسه عشان التوقيت الصيفي.
  const probe = new Date(`${ymd}T${time}:00Z`);
  const local = new Date(probe.toLocaleString('en-US', { timeZone: TZ }));
  const utc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offset = local.getTime() - utc.getTime();
  return new Date(probe.getTime() - offset).toISOString();
}

/**
 * سبب رفض الميعاد، أو null لو سليم.
 *   'past' — عدّى · 'far' — بعيد أوي (غلطة كتابة مش حجز)
 */
function slotProblem(at, now) {
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) return 'past';
  const ref = (now ? new Date(now) : new Date()).getTime();
  if (t < ref - GRACE_MINUTES * 60000) return 'past';
  if (t > ref + 366 * 86400000) return 'far';
  return null;
}

/**
 * جملة بتكتب الحجز **بس لو الخانة فاضية**. الشرط جزء من الـINSERT.
 * `rows.length === 0` معناها الخانة اتاخدت في نفس اللحظة.
 */
function insertIfFree({ companyId, name, phone, at, note, status, minutes }) {
  const window = Math.max(1, Number(minutes) || DEFAULT_MINUTES);
  return {
    text: `
      INSERT INTO nutrition_appointments
        (company_id, patient_name, patient_phone, slot_at, note, status)
      SELECT $1::int, $2, $3, $4::timestamptz, $5, $6
       WHERE NOT EXISTS (
         SELECT 1 FROM nutrition_appointments
          WHERE company_id = $1
            AND status <> 'cancelled'
            AND slot_at IS NOT NULL
            AND abs(extract(epoch from (slot_at - $4::timestamptz))) < $7 * 60
       )
      RETURNING id, slot_at`,
    values: [companyId, name, phone, at, note, status, window],
  };
}

module.exports = {
  DEFAULT_MINUTES, DEFAULT_DAYS, DEFAULT_FROM, DEFAULT_TO, HORIZON_DAYS,
  cairoDate, cairoMinutes, cairoWeekday, settingsFrom, slotsFor, daysAhead,
  slotAt, slotProblem, insertIfFree, hhmm, toMinutes,
};
