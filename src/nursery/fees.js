// What a family owes, and how to say so politely.
//
// Everything here is a pure function over rows, for one reason: the arrears
// figure is the number a manager reads out loud to a parent, and a number that
// is computed the same way every time it is displayed can be argued about
// calmly. A stored balance cannot — it drifts the first time a payment is
// edited, and then the manager is wrong in front of the customer.
//
// The allocation rule is FIFO: money received pays the oldest month first. That
// is not a preference, it is how every parent already thinks ("أنا دفعت شهر
// يوليو"), and it is what makes "متأخر شهرين" mean something specific.
'use strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const CHILD_STATUSES = ['active', 'paused', 'left'];
const ATTENDANCE = ['present', 'absent', 'late', 'excused'];
const ENQUIRY_STATUSES = ['new', 'contacted', 'visited', 'enrolled', 'lost'];
const OPEN_ENQUIRY = ['new', 'contacted', 'visited'];

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** A Date, a 'YYYY-MM-DD' string or a Date-from-Postgres → 'YYYY-MM-DD'. */
function ymd(v) {
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  const s = String(v == null ? '' : v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

/** 'YYYY-MM' for a date, defaulting to today. */
function periodKey(v) {
  const s = ymd(v || new Date());
  return s ? s.slice(0, 7) : null;
}

function isPeriod(p) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p || '')); }

function periodLabel(p) {
  if (!isPeriod(p)) return String(p || '');
  const [y, m] = String(p).split('-');
  return AR_MONTHS[Number(m) - 1] + ' ' + y;
}

function shiftPeriod(p, by) {
  if (!isPeriod(p)) return null;
  const [y, m] = String(p).split('-').map(Number);
  const total = y * 12 + (m - 1) + Number(by || 0);
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return String(yy) + '-' + String(mm).padStart(2, '0');
}

/** How many whole months from a → b. Negative if b is earlier. */
function monthsBetween(a, b) {
  if (!isPeriod(a) || !isPeriod(b)) return 0;
  const [ay, am] = String(a).split('-').map(Number);
  const [by, bm] = String(b).split('-').map(Number);
  return (by * 12 + bm) - (ay * 12 + am);
}

/** First and last calendar day of a period. */
function periodRange(p) {
  if (!isPeriod(p)) return { from: null, to: null };
  const [y, m] = String(p).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: p + '-01', to: p + '-' + String(last).padStart(2, '0') };
}

/**
 * The due date for a period, given the nursery's chosen day of the month.
 *
 * Clamped to the length of the month, because a nursery that collects on the
 * 31st still has to collect in February — and an invalid date silently becomes
 * the 3rd of March in most date handling, which moves the whole arrears list.
 */
function dueDateFor(period, dueDay) {
  if (!isPeriod(period)) return null;
  const [y, m] = String(period).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(last, Math.max(1, parseInt(dueDay, 10) || 1));
  return period + '-' + String(d).padStart(2, '0');
}

/**
 * What this child is billed for a month.
 *
 * The child's own fee wins over the group's, and the group's over the centre
 * default — so a scholarship or a sibling rate is set once on the child and
 * never has to be remembered again.
 */
function feeFor(child, group, settings) {
  const c = child || {};
  const own = c.monthly_fee == null || c.monthly_fee === '' ? null : Number(c.monthly_fee);
  const grp = group && group.monthly_fee != null ? Number(group.monthly_fee) : null;
  const def = settings && settings.default_fee != null ? Number(settings.default_fee) : 0;
  let amount = 0;
  if (Number.isFinite(own) && own > 0) amount = own;
  else if (Number.isFinite(grp) && grp > 0) amount = grp;
  else if (Number.isFinite(def)) amount = def;
  const discount = Math.max(0, Math.min(amount, Number(c.discount || 0)));
  return { amount: round2(amount), discount: round2(discount), net: round2(amount - discount) };
}

/**
 * Should this child be billed for this month at all?
 *
 * Three ways the answer is no, and every one of them is a family that would
 * otherwise be chased for money they do not owe:
 *   - the child left before the month started;
 *   - the child had not enrolled by the time the month ended;
 *   - the child is paused (a summer break, a travelling family).
 */
function shouldInvoice(child, period) {
  const c = child || {};
  if (c.status === 'paused') return false;
  const { from, to } = periodRange(period);
  if (!from) return false;
  const enrolled = ymd(c.enrolled_on);
  const left = ymd(c.left_on);
  if (enrolled && enrolled > to) return false;   // had not joined yet that month
  if (left && left < from) return false;         // already gone before it started
  // Marked as left with no leaving date: the record is incomplete, so the safe
  // reading is "do not bill". Chasing a family that already left is the single
  // fastest way to lose the referral they would have given.
  if (c.status === 'left' && !left) return false;
  return true;
}

/**
 * The family's position: what was billed, what came in, what is outstanding,
 * and — the number the whole product is sold on — how many months late.
 *
 * @param invoices rows of { period, amount, discount, due_on, cancelled }
 * @param payments rows of { amount }
 * @param today    'YYYY-MM-DD', injected so this stays pure and testable
 */
function arrears(invoices, payments, today) {
  const now = ymd(today || new Date());
  const live = (invoices || [])
    .filter((i) => !i.cancelled)
    .map((i) => ({
      ...i,
      net: round2(Number(i.amount || 0) - Number(i.discount || 0)),
      due: ymd(i.due_on),
    }))
    .sort((a, b) => String(a.period).localeCompare(String(b.period)));

  const billed = round2(live.reduce((s, i) => s + i.net, 0));
  let paid = 0;
  for (const p of payments || []) paid = round2(paid + Number(p.amount || 0));

  // FIFO: the money that came in settles the oldest month first.
  let pool = paid;
  let oldestUnpaid = null;
  let lateCount = 0;
  const open = [];
  for (const inv of live) {
    const applied = Math.min(pool, inv.net);
    pool = round2(pool - applied);
    const remaining = round2(inv.net - applied);
    if (remaining > 0.009) {
      if (!oldestUnpaid) oldestUnpaid = inv;
      open.push({ period: inv.period, remaining, due_on: inv.due, label: periodLabel(inv.period) });
      // "Late" means the due date has passed. A month billed on the 1st and due
      // on the 5th is not late on the 2nd, and calling it late is how a manager
      // loses trust in the list.
      if (inv.due && now && inv.due < now) lateCount += 1;
    }
  }

  const due = round2(Math.max(0, billed - paid));
  return {
    billed,
    paid: round2(paid),
    due,
    credit: round2(Math.max(0, paid - billed)),
    open,
    lateMonths: lateCount,
    oldestUnpaid: oldestUnpaid ? oldestUnpaid.period : null,
    oldestUnpaidLabel: oldestUnpaid ? periodLabel(oldestUnpaid.period) : null,
  };
}

/**
 * The reminder message.
 *
 * Written the way the manager wishes she could say it and cannot: no threat, no
 * "برجاء سرعة السداد", a specific number and a specific month so there is
 * nothing to argue about, and an explicit "لو حضرتك دفعت بالفعل" — because the
 * one thing that makes a nursery stop sending reminders is the fear of asking
 * somebody who already paid.
 */
function reminderText(opts) {
  const o = opts || {};
  const place = String(o.businessName || '').trim();
  const child = String(o.childName || '').trim();
  const guardian = String(o.guardianName || '').trim();
  const amount = Number(o.due || 0);
  const months = o.openLabels && o.openLabels.length ? o.openLabels : [];

  const lines = [];
  lines.push(guardian ? `أهلاً ${guardian}` : 'أهلاً بحضرتك');
  lines.push('');
  const what = child ? `مصاريف ${child}` : 'المصاريف';
  if (months.length === 1) {
    lines.push(`${what} عن شهر ${months[0]} — ${amount.toLocaleString('ar-EG')} جنيه.`);
  } else if (months.length > 1) {
    lines.push(`${what} عن ${months.length} شهور (${months.join('، ')}) — إجمالي ${amount.toLocaleString('ar-EG')} جنيه.`);
  } else {
    lines.push(`${what} المستحقة ${amount.toLocaleString('ar-EG')} جنيه.`);
  }
  lines.push('');
  lines.push('لو حضرتك دفعت بالفعل يبقى اعتبر الرسالة دي ملهاش لازمة، وياريت تبعتلنا عشان نظبّط الحساب.');
  if (place) lines.push('');
  if (place) lines.push(place);
  return lines.join('\n');
}

/** A wa.me link for a phone number, or null. Digits only, Egypt-aware. */
function waLink(phone, text) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  // 01xxxxxxxxx is how every Egyptian number is written and stored locally;
  // wa.me needs it in international form or the link opens an empty chat.
  const intl = /^0?1\d{9}$/.test(digits) ? '20' + digits.replace(/^0/, '') : digits;
  return 'https://wa.me/' + intl + (text ? '?text=' + encodeURIComponent(text) : '');
}

/** A child's age today, in years and months, from a birth date. */
function ageOf(birth, today) {
  const b = ymd(birth);
  const n = ymd(today || new Date());
  if (!b || !n) return null;
  const [by, bm, bd] = b.split('-').map(Number);
  const [ny, nm, nd] = n.split('-').map(Number);
  let months = (ny * 12 + nm) - (by * 12 + bm);
  if (nd < bd) months -= 1;
  if (months < 0) return null;
  return { years: Math.floor(months / 12), months: months % 12, totalMonths: months };
}

function ageLabel(birth, today) {
  const a = ageOf(birth, today);
  if (!a) return '';
  if (a.years <= 0) return a.months + ' شهر';
  if (a.months === 0) return a.years + ' سنة';
  return a.years + ' سنة و' + a.months + ' شهر';
}

module.exports = {
  round2, ymd, periodKey, isPeriod, periodLabel, shiftPeriod, monthsBetween, periodRange,
  dueDateFor, feeFor, shouldInvoice, arrears, reminderText, waLink, ageOf, ageLabel,
  CHILD_STATUSES, ATTENDANCE, ENQUIRY_STATUSES, OPEN_ENQUIRY, AR_MONTHS,
};
