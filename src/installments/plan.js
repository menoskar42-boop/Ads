// قسّطلي — the instalment schedule, and who is late.
//
// Pure functions over rows, for the same reason the nursery's fee engine is:
// the number here is read out loud to a customer who is standing in the shop
// arguing about it. A figure that is computed the same way every time it is
// shown can be defended. A stored balance cannot.
//
// Two rules the whole product rests on:
//
//   1. THE PARTS MUST SUM TO THE WHOLE, EXACTLY. Three instalments of 333.33
//      against 1000 leave a piastre outstanding forever, and a plan that never
//      closes is a customer who is chased after they have finished paying.
//      The last instalment absorbs the rounding.
//
//   2. MONEY PAYS THE OLDEST INSTALMENT FIRST. That is how every customer in
//      Egypt already thinks ("أنا دفعت قسط شهر ٦"), and it is what makes
//      "متأخر قسطين" mean something specific rather than being a feeling.
'use strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const PLAN_STATUSES = ['active', 'completed', 'defaulted', 'cancelled'];
const INTERVALS = ['monthly', 'weekly', 'biweekly'];
const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** A Date, a Postgres DATE or a 'YYYY-MM-DD' string → 'YYYY-MM-DD'. */
function ymd(v) {
  if (v instanceof Date) return isNaN(v) ? null : v.toISOString().slice(0, 10);
  const s = String(v == null ? '' : v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function dateLabel(v) {
  const s = ymd(v);
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return d + ' ' + AR_MONTHS[m - 1] + ' ' + y;
}

/**
 * Add whole months, clamped to the length of the target month.
 *
 * A plan starting on the 31st has to have a February instalment. Plain date
 * arithmetic rolls 31 Jan + 1 month over into 3 March, which silently moves
 * every later due date and makes the customer late on a day nobody agreed to.
 */
function addMonths(dateStr, n) {
  const s = ymd(dateStr);
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + Number(n || 0);
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, last);
  return String(ny).padStart(4, '0') + '-' + String(nm).padStart(2, '0') + '-' + String(nd).padStart(2, '0');
}

function addDays(dateStr, n) {
  const s = ymd(dateStr);
  if (!s) return null;
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(n || 0));
  return d.toISOString().slice(0, 10);
}

function nextDue(startOn, index, interval) {
  if (interval === 'weekly') return addDays(startOn, 7 * index);
  if (interval === 'biweekly') return addDays(startOn, 14 * index);
  return addMonths(startOn, index);
}

/**
 * Build the schedule.
 *
 * @param opts { total, down, count, startOn, interval }
 * @returns { financed, each, rows: [{ seq, amount, due_on }] }
 *
 * The down payment is subtracted first and is never itself an instalment — a
 * shop takes it at the counter, and putting it in the schedule makes every
 * later count wrong by one.
 */
function buildSchedule(opts) {
  const o = opts || {};
  const total = Math.max(0, round2(o.total));
  const down = Math.min(total, Math.max(0, round2(o.down)));
  const count = Math.max(1, Math.min(60, parseInt(o.count, 10) || 1));
  const interval = INTERVALS.includes(o.interval) ? o.interval : 'monthly';
  const startOn = ymd(o.startOn) || ymd(new Date());

  const financed = round2(total - down);
  const each = round2(financed / count);
  const rows = [];
  let allocated = 0;
  for (let i = 0; i < count; i += 1) {
    // The last one takes whatever is left, so the parts always sum to the whole.
    const amount = i === count - 1 ? round2(financed - allocated) : each;
    allocated = round2(allocated + amount);
    rows.push({ seq: i + 1, amount, due_on: nextDue(startOn, i, interval) });
  }
  return { financed, each, rows, interval, startOn, down, total };
}

/**
 * Apply the money received to the schedule, oldest first.
 *
 * @param installments rows of { seq, amount, due_on }
 * @param payments     rows of { amount }
 * @param today        'YYYY-MM-DD', injected so this stays pure
 */
function allocate(installments, payments, today) {
  const now = ymd(today || new Date());
  const rows = (installments || []).slice()
    .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));

  let paidPool = 0;
  for (const p of payments || []) paidPool = round2(paidPool + Number(p.amount || 0));

  const totalDue = round2(rows.reduce((s, r) => s + Number(r.amount || 0), 0));
  let pool = paidPool;
  const out = [];
  let lateCount = 0;
  let lateAmount = 0;
  let nextUnpaid = null;
  let dueNow = 0;

  for (const r of rows) {
    const amount = round2(Number(r.amount || 0));
    const applied = Math.min(pool, amount);
    pool = round2(pool - applied);
    const remaining = round2(amount - applied);
    const due = ymd(r.due_on);
    // "Late" means the agreed day has passed, not that the money is missing.
    // An instalment due next week is not a debt anybody has broken.
    const late = remaining > 0.009 && !!due && !!now && due < now;
    if (late) { lateCount += 1; lateAmount = round2(lateAmount + remaining); }
    if (remaining > 0.009) {
      if (!nextUnpaid) nextUnpaid = { seq: r.seq, due_on: due, remaining };
      if (due && now && due <= now) dueNow = round2(dueNow + remaining);
    }
    out.push({
      // The row id is carried through so a screen can offer to edit this one
      // instalment. Without it the edit form posts to an empty id and silently
      // does nothing — the caller has the schedule but not a handle on it.
      id: r.id,
      seq: r.seq, amount, due_on: due, paid: round2(applied), remaining, late,
      settled: remaining <= 0.009,
    });
  }

  const paid = round2(Math.min(paidPool, totalDue));
  return {
    rows: out,
    totalDue,
    paid,
    remaining: round2(Math.max(0, totalDue - paidPool)),
    credit: round2(Math.max(0, paidPool - totalDue)),
    lateCount,
    lateAmount,
    // What should already be in the till today: everything due up to now that
    // has not been paid. This is the number a shop chases, not the total.
    dueNow,
    nextUnpaid,
    settled: paidPool + 0.009 >= totalDue && totalDue > 0,
    progress: totalDue > 0 ? Math.min(100, Math.round((paidPool / totalDue) * 100)) : 0,
  };
}

/**
 * The reminder message.
 *
 * Same shape as the nursery's and for the same reason: a specific amount and a
 * specific date so there is nothing to argue about, no threat, and an explicit
 * way out for somebody who already paid — which is the fear that stops a shop
 * sending reminders at all.
 */
function reminderText(opts) {
  const o = opts || {};
  const shop = String(o.businessName || '').trim();
  const name = String(o.customerName || '').trim();
  const item = String(o.item || '').trim();
  const amount = Number(o.amount || 0);
  const dueOn = o.dueOn ? dateLabel(o.dueOn) : '';
  const lateCount = Number(o.lateCount || 0);

  const lines = [];
  lines.push(name ? `أهلاً ${name}` : 'أهلاً بحضرتك');
  lines.push('');
  if (lateCount > 1) {
    lines.push(`عندك ${lateCount} أقساط متأخرة${item ? ' على ' + item : ''} — إجمالي ${amount.toLocaleString('ar-EG')} جنيه.`);
  } else if (lateCount === 1) {
    lines.push(`قسط${item ? ' ' + item : ''} بتاع ${dueOn} — ${amount.toLocaleString('ar-EG')} جنيه.`);
  } else {
    lines.push(`فاكرين حضرتك بقسط${item ? ' ' + item : ''} المستحق ${dueOn} — ${amount.toLocaleString('ar-EG')} جنيه.`);
  }
  if (o.statementUrl) {
    lines.push('');
    lines.push('كشف حسابك كامل من اللينك ده:');
    lines.push(o.statementUrl);
  }
  lines.push('');
  lines.push('لو حضرتك دفعت بالفعل يبقى اعتبر الرسالة دي ملهاش لازمة، وياريت تبعتلنا عشان نظبّط الحساب.');
  if (shop) { lines.push(''); lines.push(shop); }
  return lines.join('\n');
}

/** A wa.me link, Egypt-aware. Local 01xxxxxxxxx is how numbers are stored here. */
function waLink(phone, text) {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const intl = /^0?1\d{9}$/.test(digits) ? '20' + digits.replace(/^0/, '') : digits;
  return 'https://wa.me/' + intl + (text ? '?text=' + encodeURIComponent(text) : '');
}

function planCode(id) {
  return 'QP-' + String(id || 0).padStart(5, '0');
}

module.exports = {
  round2, ymd, dateLabel, addMonths, addDays, nextDue,
  buildSchedule, allocate, reminderText, waLink, planCode,
  PLAN_STATUSES, INTERVALS, AR_MONTHS,
};
