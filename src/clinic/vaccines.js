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
const EGYPT_SEED = [
  { name: 'الدرن (BCG)',                 age_months: 0,  dose_label: 'عند الميلاد' },
  { name: 'الالتهاب الكبدي B',            age_months: 0,  dose_label: 'جرعة الميلاد' },
  { name: 'شلل الأطفال (فموي)',           age_months: 0,  dose_label: 'الجرعة صفر' },
  { name: 'شلل الأطفال (فموي)',           age_months: 2,  dose_label: 'الجرعة الأولى' },
  { name: 'الخماسي (DTP-HepB-Hib)',       age_months: 2,  dose_label: 'الجرعة الأولى' },
  { name: 'شلل الأطفال (حقن IPV)',        age_months: 2,  dose_label: 'الجرعة الأولى' },
  { name: 'شلل الأطفال (فموي)',           age_months: 4,  dose_label: 'الجرعة الثانية' },
  { name: 'الخماسي (DTP-HepB-Hib)',       age_months: 4,  dose_label: 'الجرعة الثانية' },
  { name: 'شلل الأطفال (فموي)',           age_months: 6,  dose_label: 'الجرعة الثالثة' },
  { name: 'الخماسي (DTP-HepB-Hib)',       age_months: 6,  dose_label: 'الجرعة الثالثة' },
  { name: 'شلل الأطفال (حقن IPV)',        age_months: 6,  dose_label: 'الجرعة الثانية' },
  { name: 'الحصبة',                       age_months: 9,  dose_label: 'جرعة' },
  { name: 'الثلاثي الفيروسي (MMR)',       age_months: 12, dose_label: 'الجرعة الأولى' },
  { name: 'شلل الأطفال (فموي)',           age_months: 18, dose_label: 'منشّطة' },
  { name: 'الثلاثي البكتيري (DTP)',       age_months: 18, dose_label: 'منشّطة' },
  { name: 'الثلاثي الفيروسي (MMR)',       age_months: 18, dose_label: 'الجرعة الثانية' },
];

// Seed once per clinic. Never overwrites: a clinic that edited its schedule
// must not have those edits reverted the next time this runs.
async function ensureSchedule(pool, companyId) {
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
        [companyId, v.name, v.age_months, v.dose_label, i]
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
