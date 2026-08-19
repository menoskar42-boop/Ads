'use strict';
/**
 * The patient file, as tabs.
 *
 * Everything a clinic knows about a patient was one scrolling page: the
 * details, the quick-entry forms, then every visit, every reading, every
 * prescription, one after another. A file with three years in it is unusable
 * that way — and it loaded all of it on every open, including for somebody who
 * came to check one date.
 *
 * ── What a tab must not do ─────────────────────────────────────────────────
 *
 * Show nothing and look finished. A tab whose query failed and a tab with
 * genuinely no rows render identically unless the difference is carried, and
 * "this patient has no prescriptions" is a clinical statement — somebody will
 * act on it. So a tab knows whether its data was READ, and says so when it was
 * not.
 *
 * Two tabs are new here, and both are places a clinic already had data and no
 * way to see it from the file: the patient's invoices, and their attachments
 * (photos, x-rays, lab work).
 */

/** The tabs, in the order a doctor reads them. */
const TABS = ['summary', 'visits', 'prescriptions', 'vitals', 'invoices', 'attachments'];

/** A tab name from the URL, or the default. Never trusts the query string. */
function tabOf(raw) {
  const t = String(raw || '').trim();
  return TABS.includes(t) ? t : 'summary';
}

/** Which queries a tab needs — so opening one tab does not read all six. */
function needsFor(tab) {
  switch (tabOf(tab)) {
    case 'visits':        return ['visits'];
    case 'prescriptions': return ['prescriptions'];
    case 'vitals':        return ['vitals'];
    case 'invoices':      return ['invoices'];
    case 'attachments':   return ['photos', 'labs'];
    // The summary is the one screen that shows a bit of everything, so it pays
    // for a few reads. It is also the one people open by default.
    default:              return ['visits', 'vitals', 'notes', 'prescriptions'];
  }
}

/**
 * The state of one dataset: read and empty, read and full, or not read at all.
 *
 * @param {{ok:boolean, rows?:Array}} answer
 */
function stateOf(answer) {
  if (!answer || answer.ok === false) return 'unknown';
  return (Array.isArray(answer.rows) ? answer.rows : []).length ? 'has' : 'empty';
}

/** Rows to render — never null, so the template does not have to guard. */
function rowsOf(answer) {
  return (answer && answer.ok !== false && Array.isArray(answer.rows)) ? answer.rows : [];
}

/**
 * What the invoices tab says at the top: billed, paid, and what is still owed.
 * Returns null when the invoices could not be read — a zero balance is a
 * statement about money and must not be invented.
 */
function balanceOf(answer) {
  if (!answer || answer.ok === false) return null;
  let billed = 0, paid = 0;
  for (const i of rowsOf(answer)) {
    if (String(i.status) === 'cancelled') continue;   // a cancelled bill is not owed
    const t = Number(i.total_amount), p = Number(i.paid_amount);
    billed += Number.isFinite(t) ? t : 0;
    paid += Number.isFinite(p) ? p : 0;
  }
  return { billed: +billed.toFixed(2), paid: +paid.toFixed(2), due: +(billed - paid).toFixed(2) };
}

module.exports = { TABS, tabOf, needsFor, stateOf, rowsOf, balanceOf };
