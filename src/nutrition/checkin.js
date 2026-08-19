'use strict';
/**
 * ماء ونوم ومزاج — and the patient who quietly stopped.
 *
 * A weight once a week is a very thin picture of a month. The things that
 * actually explain a stalled week — three hours of sleep, no water, a bad
 * fortnight — were nowhere, so the follow-up visit ran on the patient's memory
 * of a Tuesday two weeks ago.
 *
 * ── The number that must not be invented ────────────────────────────────────
 *
 * A day with nothing logged is NOT a day of zero glasses of water. An average
 * that treats silence as zero makes every patient look worse the less they use
 * the app, which is exactly backwards — and it is the number a dietitian would
 * act on. So averages are over the days that HAVE a reading, and the count of
 * those days comes back with them.
 *
 * ── The alert that is worth having ──────────────────────────────────────────
 *
 * The patient who stops logging is the patient who stopped. That is the one
 * worth a phone call, and it was invisible: the dietitian saw a list of names
 * with no signal of who had gone quiet. `stale` is computed from the last
 * thing they actually did — not from a flag somebody has to remember to set.
 */

/** A mood a patient can pick. Ordered worst → best so a trend has a direction. */
const MOODS = ['bad', 'low', 'ok', 'good', 'great'];

function moodOf(raw) {
  const m = String(raw || '').trim();
  return MOODS.includes(m) ? m : null;
}

/** Glasses of water. Zero is a real answer here; a blank is not. */
function glasses(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(30, Math.round(n));
}

/** Hours of sleep, to the half hour. */
function hours(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(24, +(Math.round(n * 2) / 2).toFixed(1));
}

/** Steps. A phone that reports millions is a phone, not a person. */
function steps(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseInt(String(v).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(100000, n);
}

/**
 * One day's check-in from the form.
 * A form where nothing was filled in is not a check-in.
 */
function readCheckin(body) {
  const b = body || {};
  const out = {
    water_glasses: glasses(b.water_glasses),
    sleep_hours: hours(b.sleep_hours),
    steps: steps(b.steps),
    mood: moodOf(b.mood),
    note: String(b.note || '').trim().slice(0, 300) || null,
  };
  const any = ['water_glasses', 'sleep_hours', 'steps', 'mood'].some((k) => out[k] !== null) || out.note;
  return any ? { ok: true, value: out } : { ok: false, why: 'empty' };
}

/**
 * Averages over the days that have a reading — never over the calendar.
 *
 * @returns {{water:{avg,days}, sleep:{avg,days}, steps:{avg,days}, mood:{avg,days}}}
 */
function summarize(rows) {
  const pick = (key, map) => {
    const vals = (Array.isArray(rows) ? rows : [])
      // A day with no reading is dropped BEFORE the conversion, because
      // `Number(null)` is 0 and 0 is finite — which would count every silent
      // day as a day of zero water and make a patient look worse the less they
      // logged. That is the exact number a dietitian would act on.
      .filter((r) => r && r[key] !== null && r[key] !== undefined && r[key] !== '')
      .map((r) => (map ? map(r[key]) : Number(r[key])))
      .filter((v) => Number.isFinite(v));
    if (!vals.length) return { avg: null, days: 0 };
    const sum = vals.reduce((a, b) => a + b, 0);
    return { avg: +(sum / vals.length).toFixed(1), days: vals.length };
  };
  return {
    water: pick('water_glasses'),
    sleep: pick('sleep_hours'),
    steps: pick('steps'),
    // Mood as a 1..5 number so it can be averaged, and back to a word to read.
    mood: pick('mood', (m) => (MOODS.indexOf(String(m)) >= 0 ? MOODS.indexOf(String(m)) + 1 : NaN)),
  };
}

/** The word for an averaged mood. Null in, null out. */
function moodWord(avg) {
  if (avg === null || avg === undefined || !Number.isFinite(Number(avg))) return null;
  const i = Math.min(MOODS.length - 1, Math.max(0, Math.round(Number(avg)) - 1));
  return MOODS[i];
}

const STALE_DAYS = 7;

/**
 * Has this patient gone quiet?
 *
 * `lastAt` is the most recent thing they DID — a weight, a diary line, a
 * check-in. Never logged anything at all is its own answer: 'never', because a
 * patient who has not started is a different phone call from one who stopped.
 */
function engagement(lastAt, now, days) {
  const limit = Number.isFinite(days) ? days : STALE_DAYS;
  if (!lastAt) return { state: 'never', days: null };
  const t = new Date(lastAt).getTime();
  if (!Number.isFinite(t)) return { state: 'never', days: null };
  const n = (now instanceof Date ? now : new Date(now || Date.now())).getTime();
  const gap = Math.floor((n - t) / 86400000);
  return { state: gap >= limit ? 'stale' : 'active', days: Math.max(0, gap) };
}

module.exports = { MOODS, STALE_DAYS, moodOf, glasses, hours, steps, readCheckin, summarize, moodWord, engagement };
