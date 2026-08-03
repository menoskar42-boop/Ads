// Childhood vaccination tracking.
//
// IMPORTANT — about the seed data below: this is the childhood schedule as
// commonly published for Egypt, and it is provided as a STARTING POINT that the
// clinic reviews and edits, not as an authority. Schedules change, and a
// vaccination date that is silently wrong is a real harm; the UI says so and
// every row is editable. The value this module adds is the tracking — knowing
// what is due, what is overdue, and what was given — which is correct
// regardless of whose schedule the clinic loads.
'use strict';

// age_months: 0 = at birth, 1.5 = six weeks.
//
// Aligned with the Ministry of Health and Population schedule published on
// mohp.gov.eg (19/9/2023): IPV is a SINGLE dose at 4 months (not two doses at
// 2 and 6), and OPV has doses at 9 and 12 months.
//
// Deliberately NOT included, because that source does not confirm them:
// PCV13, rotavirus, meningococcal at 9 months, MMRV, and vitamin A (which is
// a supplement, not a vaccine). Adding an unconfirmed row would mean a clinic
// chasing a parent for a dose the state does not schedule.
//
// `key` names the i18n string; `name`/`dose_label` are the Arabic fallback used
// when no translator is supplied.
const EGYPT_SEED = [
  { key: 'bcg',       dose: 'birth',  name: 'الدرن (BCG)',              age_months: 0,  dose_label: 'عند الميلاد' },
  { key: 'hepb',      dose: 'birth',  name: 'الالتهاب الكبدي B',        age_months: 0,  dose_label: 'جرعة الميلاد' },
  { key: 'opv',       dose: 'zero',   name: 'شلل الأطفال (فموي)',       age_months: 0,  dose_label: 'الجرعة صفر' },
  { key: 'opv',       dose: 'd1',     name: 'شلل الأطفال (فموي)',       age_months: 2,  dose_label: 'الجرعة الأولى' },
  { key: 'penta',     dose: 'd1',     name: 'الخماسي (DTP-HepB-Hib)',   age_months: 2,  dose_label: 'الجرعة الأولى' },
  { key: 'opv',       dose: 'd2',     name: 'شلل الأطفال (فموي)',       age_months: 4,  dose_label: 'الجرعة الثانية' },
  { key: 'penta',     dose: 'd2',     name: 'الخماسي (DTP-HepB-Hib)',   age_months: 4,  dose_label: 'الجرعة الثانية' },
  { key: 'ipv',       dose: 'single', name: 'شلل الأطفال (حقن IPV)',    age_months: 4,  dose_label: 'جرعة واحدة' },
  { key: 'opv',       dose: 'd3',     name: 'شلل الأطفال (فموي)',       age_months: 6,  dose_label: 'الجرعة الثالثة' },
  { key: 'penta',     dose: 'd3',     name: 'الخماسي (DTP-HepB-Hib)',   age_months: 6,  dose_label: 'الجرعة الثالثة' },
  { key: 'opv',       dose: 'd4',     name: 'شلل الأطفال (فموي)',       age_months: 9,  dose_label: 'الجرعة الرابعة' },
  { key: 'measles',   dose: 'single', name: 'الحصبة',                   age_months: 9,  dose_label: 'جرعة' },
  { key: 'opv',       dose: 'd5',     name: 'شلل الأطفال (فموي)',       age_months: 12, dose_label: 'الجرعة الخامسة' },
  { key: 'mmr',       dose: 'd1',     name: 'الثلاثي الفيروسي (MMR)',   age_months: 12, dose_label: 'الجرعة الأولى' },
  { key: 'opv',       dose: 'boost',  name: 'شلل الأطفال (فموي)',       age_months: 18, dose_label: 'منشّطة' },
  { key: 'dtp',       dose: 'boost',  name: 'الثلاثي البكتيري (DTP)',   age_months: 18, dose_label: 'منشّطة' },
  { key: 'mmr',       dose: 'd2',     name: 'الثلاثي الفيروسي (MMR)',   age_months: 18, dose_label: 'الجرعة الثانية' },
];

// Seed once per clinic. Never overwrites: a clinic that edited its schedule
// must not have those edits reverted the next time this runs.
//
// `t` is optional; when given, the schedule is written in the clinic's chosen
// language. These rows are clinic data the clinic can edit afterwards, so the
// language is fixed at seeding time rather than translated on every read.
async function ensureSchedule(pool, companyId, t) {
  const tr = (k, fallback) => {
    if (typeof t !== 'function') return fallback;
    const v = t(k);
    return v && v !== k ? v : fallback;
  };
  try {
    const have = await pool.query(
      'SELECT COUNT(*)::int n FROM clinic_vaccine_schedule WHERE company_id=$1', [companyId]
    );
    if (have.rows[0].n > 0) return false;
    for (let i = 0; i < EGYPT_SEED.length; i += 1) {
      const v = EGYPT_SEED[i];
      await pool.query(
        `INSERT INTO clinic_vaccine_schedule (company_id, name, age_months, dose_label, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [companyId, tr('vax.' + v.key, v.name), v.age_months,
          tr('vax.dose.' + v.dose, v.dose_label), i]
      );
    }
    return true;
  } catch (e) {
    console.error('[vaccines seed]', e.message);
    return false;
  }
}

function monthsBetween(from, to) {
  const a = new Date(from), b = new Date(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
    + (b.getDate() >= a.getDate() ? 0 : -1);
}

function addMonths(date, months) {
  const d = new Date(date);
  const whole = Math.floor(months);
  d.setMonth(d.getMonth() + whole);
  d.setDate(d.getDate() + Math.round((months - whole) * 30));
  return d;
}

/**
 * Merge a schedule with what a child actually received.
 * @returns {Array} rows with status: given | due | upcoming | overdue
 */
function buildCard(schedule, given, birthDate) {
  if (!birthDate) return [];
  const now = new Date();
  const ageMonths = monthsBetween(birthDate, now);
  // Match by schedule row when we have it, else by name+dose so a record
  // entered before a schedule edit still lines up.
  const givenBy = new Map();
  for (const g of given || []) {
    givenBy.set(String(g.schedule_id || ('n:' + g.name)), g);
  }

  return (schedule || []).map((s) => {
    const g = givenBy.get(String(s.id)) || givenBy.get('n:' + s.name);
    const dueOn = addMonths(birthDate, Number(s.age_months));
    let status;
    if (g) status = 'given';
    else if (ageMonths < Number(s.age_months)) status = 'upcoming';
    // One month past due is a reminder; beyond that it is genuinely late and
    // should read differently to the parent and the nurse.
    else if (ageMonths - Number(s.age_months) <= 1) status = 'due';
    else status = 'overdue';
    return {
      ...s,
      status,
      due_on: dueOn.toISOString().slice(0, 10),
      given_at: g ? g.given_at : null,
      batch: g ? g.batch : null,
      given_id: g ? g.id : null,
    };
  });
}

module.exports = { EGYPT_SEED, ensureSchedule, buildCard, monthsBetween };
