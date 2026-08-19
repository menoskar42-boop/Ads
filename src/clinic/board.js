'use strict';
/**
 * A dashboard that answers questions instead of printing numbers.
 *
 * The clinic's front screen was five counters: waiting, pending, today's
 * takings, doctors, patients. Every one of them is a true number and not one of
 * them is a question anybody at a reception desk asks. What they ask is: who is
 * waiting right now, who is coming today, who has not confirmed, who owes us
 * money, and what do I do next. A counter makes you click through and find out;
 * an answer is already the list.
 *
 * ── Three states, and why the third one exists ──────────────────────────────
 *
 * `attention` — there is something to do, and here is who.
 * `ok`        — asked and answered: nobody is waiting, nothing is overdue.
 * `unknown`   — the read failed. NOT zero.
 *
 * The third is the one that matters. Five counters in one Promise.all meant a
 * single failing query returned 500 for the whole screen; the obvious "fix" is
 * to default the number to zero, which tells a receptionist that nobody is
 * waiting while four people sit in the corridor. A card that says "I could not
 * check" is the only honest version.
 *
 * The order is by urgency, not by the order they were written: a screen that
 * puts the empty questions first wastes the one glance it gets.
 */

/** The questions, in the order they matter when they all need attention. */
const QUESTIONS = ['waiting', 'unconfirmed', 'today', 'overdue', 'next'];

const RANK = { attention: 0, unknown: 1, ok: 2 };

function rowsOf(answer) {
  if (!answer || answer.ok === false) return null;
  return Array.isArray(answer.rows) ? answer.rows : [];
}

/**
 * One question's answer.
 *
 * @param {string} key
 * @param {{ok:boolean, rows?:Array}} answer  what the query came back with
 */
function answerFor(key, answer) {
  const rows = rowsOf(answer);
  if (rows === null) return { key, state: 'unknown', count: null, rows: [] };
  // "Nothing to do" is a real answer and gets its own state, so the screen can
  // say «مافيش حد مستني» instead of a grey zero that reads like a failure.
  return {
    key,
    state: rows.length ? 'attention' : 'ok',
    count: rows.length,
    rows: rows.slice(0, 8),
    more: Math.max(0, rows.length - 8),
  };
}

/**
 * The whole board.
 *
 * @param {object} answers  { waiting: {ok, rows}, unconfirmed: {...}, … }
 */
function board(answers) {
  const a = answers || {};
  const cards = QUESTIONS.map((k) => answerFor(k, a[k]));
  // Sort is stable in every engine this runs on, so equal ranks keep the
  // order above — which is the order a receptionist reads them in.
  return cards.slice().sort((x, y) => RANK[x.state] - RANK[y.state]);
}

/** Is anything actually wrong, or is the clinic just quiet? */
function needsAttention(cards) {
  return (Array.isArray(cards) ? cards : []).some((c) => c.state === 'attention');
}

/** Did anything fail to read? The screen says so rather than hiding it. */
function anyUnknown(cards) {
  return (Array.isArray(cards) ? cards : []).some((c) => c.state === 'unknown');
}

/**
 * How long somebody has been waiting, in whole minutes.
 * A missing arrival time is null — not "0 minutes", which reads as "just
 * arrived" for somebody who may have been there an hour.
 */
function waitedMinutes(arrivalAt, now) {
  if (!arrivalAt) return null;
  const t = new Date(arrivalAt).getTime();
  if (!Number.isFinite(t)) return null;
  const n = (now instanceof Date ? now : new Date(now || Date.now())).getTime();
  return Math.max(0, Math.floor((n - t) / 60000));
}

/** Waited long enough that somebody should say something. */
const LONG_WAIT = 20;
function isLongWait(mins) {
  return typeof mins === 'number' && mins >= LONG_WAIT;
}

module.exports = { QUESTIONS, board, answerFor, needsAttention, anyUnknown, waitedMinutes, isLongWait, LONG_WAIT };
