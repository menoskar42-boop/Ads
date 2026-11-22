#!/usr/bin/env node
/**
 * The waiting room, and the day nobody could see.
 *
 * The queue had two buttons — call in, complete — and reception does five
 * things all day. The two that were missing are the two that keep the list
 * honest:
 *
 *   · **لم يحضر.** Without it the patient who never came stays "waiting"
 *     forever: the dashboard's count is wrong, and so is every wait time
 *     computed from the day.
 *   · **إعادة جدولة.** The answer to "can I come tomorrow?" was to cancel and
 *     hope somebody rebooked — so the appointment quietly did not exist while
 *     the patient believed it did. It is ONE action now: the visit closes and
 *     the appointment exists, or neither happens.
 *
 * And there was no calendar at all, so nobody could answer the two questions a
 * calendar is for: is this doctor free at five, and is anything booked for a
 * time they do not work. The two rows a naive grid loses — the appointment with
 * no time, and the one outside the doctor's hours — are what this checks
 * hardest.
 *
 *   node scripts/check-clinic-queue.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Q = require('../src/clinic/queue');
const C = require('../src/clinic/calendar');
const flow = require('../src/lib/order_flow');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8'));
const VISIT_FLOW = ['waiting', 'no_show', 'in_room', 'done', 'cancelled'];

/* ── The patient who never came ────────────────────────────────────────── */
{
  check('«لم يحضر» حالة موجودة', Q.actionsFor('waiting').includes('no_show'));
  check('وهي نهاية مش محطة', flow.isTerminal('no_show') === true);
  check('واللي ماحضرش مايتنداش على الكشف', flow.canMove(VISIT_FLOW, 'no_show', 'in_room').ok === false);
  // The one direction that must NOT be allowed: a patient the doctor has seen
  // did not fail to turn up.
  check('واللي دخل الكشف مايتقالش عليه ماحضرش',
    flow.canMove(VISIT_FLOW, 'in_room', 'no_show').ok === false);
  check('واللي مستني ينفع', flow.canMove(VISIT_FLOW, 'waiting', 'no_show').ok === true);
  check('والراوت شايف الحالة دي',
    /const VISIT_FLOW = \['waiting', 'no_show', 'in_room', 'done', 'cancelled'\]/.test(route));
}

/* ── Rescheduling is one action ────────────────────────────────────────── */
{
  const r = route.slice(route.indexOf("router.post('/visits/:id/reschedule'"));
  const body = r.slice(0, r.indexOf('router.', 40));
  check('إعادة الجدولة معاملة واحدة',
    /BEGIN/.test(body) && /COMMIT/.test(body) && (body.match(/ROLLBACK/g) || []).length >= 3);
  check('وبتعمل الموعد الجديد فعلاً', /INSERT INTO clinic_appointments/.test(body));
  check('وبتقفل الزيارة وبتربطها بالموعد',
    /UPDATE clinic_visits SET status='cancelled', rescheduled_to=\$3, rescheduled_appt_id=\$4/.test(body));
  check('وبس اللي في الانتظار ينفع يتأجّل',
    /clinicQueue\.actionsFor\(v\.status\)\.includes\('reschedule'\)/.test(body)
    && Q.actionsFor('in_room').includes('reschedule') === false);
  check('والوقت بيتقرا قبل ما نلمس حاجة', /clinicQueue\.parseWhen/.test(body));
  // The past is a typo every time.
  check('وميعاد في الماضي بيترفض', Q.parseWhen('2020-01-01T10:00').why === 'past');
  check('وخانة فاضية بترفض', Q.parseWhen('').why === 'required');
  check('وكلام مش تاريخ بيرفض', Q.parseWhen('bukra').why === 'invalid');
  check('وميعاد في المستقبل بيعدّي', Q.parseWhen(new Date(Date.now() + 86400000).toISOString()).ok === true);
  // And the queue says WHY a visit closed, from the stored link.
  const view = fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/queue.ejs'), 'utf8');
  check('والطابور بيقول إن الزيارة اتأجّلت', /v\.rescheduled_to/.test(view));
}

/* ── Worked doctor by doctor ───────────────────────────────────────────── */
{
  const visits = [
    { id: 1, doctor_id: null, status: 'waiting', arrival_at: '2026-08-19T09:00:00Z' },
    { id: 2, doctor_id: 5, doctor_name: 'د. أحمد', room: '2', status: 'waiting', arrival_at: '2026-08-19T09:10:00Z' },
    { id: 3, doctor_id: 5, doctor_name: 'د. أحمد', room: '2', status: 'waiting', arrival_at: '2026-08-19T09:05:00Z', is_urgent: true },
    { id: 4, doctor_id: 7, doctor_name: 'د. منى', status: 'done', arrival_at: '2026-08-19T08:00:00Z' },
  ];
  const g = Q.byDoctor(visits);
  check('الطابور بيتقسم بالطبيب', g.length === 3, g.map((x) => x.doctor_name || '—').join(' · '));
  check('والمستعجل بيتقدّم جوّه الطبيب', g[0].visits[0].id === 3);
  check('والغرفة بتيجي معاه', g[0].room === '2');
  check('واللي مالوش طبيب بيبان مش بيتخفي', g.some((x) => x.doctor_id === null));
  check('واللي مالوش طبيب بيبقى آخر واحد', g[g.length - 1].doctor_id === null);
  check('والطبيب اللي عنده ناس مستنية بيتقدّم', g[0].waiting >= g[1].waiting);
  check('والراوت بيجيب الغرفة أصلاً', /d\.name AS doctor_name, d\.room/.test(route));
}

/* ── The calendar keeps what a naive grid loses ────────────────────────── */
{
  const days = ['2026-08-19'];
  const grid = C.layout({
    days,
    doctors: [{ id: 1, name: 'د', room: '2' }],
    schedules: [{ doctor_id: 1, day_of_week: C.cairoWeekday(days[0]), start_time: '09:00', end_time: '17:00', is_active: true }],
    appointments: [
      { id: 1, doctor_id: 1, slot_at: '2026-08-19T08:00:00Z' },          // 11:00 Cairo — inside
      { id: 2, doctor_id: 1, slot_at: '2026-08-19T18:30:00Z' },          // 21:30 Cairo — outside
      { id: 3, doctor_id: null, slot_at: null, day_hint: days[0] },      // no time at all
    ],
  });
  const col = grid[0].doctors[0];
  check('الموعد جوّه مواعيد الطبيب مش متعلّم', col.appts.find((a) => a.id === 1).outside === false);
  check('واللي بره متعلّم', col.appts.find((a) => a.id === 2).outside === true);
  check('واللي من غير ميعاد مابيضيعش', grid[0].unscheduled.length === 1);
  check('واليوم اللي فيه حاجة مش فاضي', C.isEmptyDay(grid[0]) === false);
  check('واليوم الفاضي فاضي', C.isEmptyDay(C.layout({ days, doctors: [], schedules: [], appointments: [] })[0]) === true);

  // Cairo, not the server's clock: 21:30Z on the 19th is the 20th in Cairo.
  check('التاريخ بتوقيت القاهرة مش السيرفر', C.cairoDate('2026-08-19T21:30:00Z') === '2026-08-20');
  check('والساعة كمان', C.cairoMinutes('2026-08-19T21:30:00Z') === 30);
  check('والأسبوع بيبدأ سبت', C.daysFor('2026-08-19', 'week')[0] === '2026-08-15');
  check('واليوم الواحد يوم واحد', C.daysFor('2026-08-19', 'day').length === 1);
  check('وساعة عمل مش مفهومة مابتتحسبش',
    C.layout({ days, doctors: [{ id: 1, name: 'د' }],
      schedules: [{ doctor_id: 1, day_of_week: C.cairoWeekday(days[0]), start_time: 'x', end_time: 'y', is_active: true }],
      appointments: [] })[0].doctors[0].open.length === 0);
  check('وساعة عمل متوقّفة مابتتحسبش',
    C.layout({ days, doctors: [{ id: 1, name: 'د' }],
      schedules: [{ doctor_id: 1, day_of_week: C.cairoWeekday(days[0]), start_time: '09:00', end_time: '17:00', is_active: false }],
      appointments: [] })[0].doctors[0].open.length === 0);
  // The route asks for the appointments with no time as well.
  check('والراوت بيجيب اللي من غير ميعاد', /a\.slot_at IS NULL/.test(route));
  check('والتقويم في القايمة', /\/clinic\/calendar/.test(fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/head.ejs'), 'utf8')));
}

/* ── Words, in both languages ──────────────────────────────────────────── */
{
  const keys = ['waiting', 'in_room', 'done', 'no_show', 'cancelled'].map((k) => 'q.st.' + k)
    .concat(['q.no_show', 'q.reschedule', 'q.moved_to', 'q.no_doctor', 'q.room', 'q.a_patient'])
    .concat(['required', 'invalid', 'past', 'state', 'save'].map((k) => 'q.err.' + k))
    .concat(['clinic.nav.calendar', 'cal.day', 'cal.week', 'cal.empty', 'cal.free', 'cal.no_hours',
      'cal.outside', 'cal.unscheduled']);
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل نص موجود (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }
  const view = fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/queue.ejs'), 'utf8');
  check('وأسماء الحالات بقت من القاموس مش متصلّبة في القالب',
    /t\('q\.st\.' \+ st\)/.test(view) && !/waiting:'في الانتظار'/.test(view));
}

console.log(fail === 0 ? '\n✅ الطابور بأزراره، والتقويم مش بيضيّع حد.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
