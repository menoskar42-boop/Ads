'use strict';
/**
 * PAR-Q — the seven questions asked before somebody starts training.
 *
 * A gym was signing people up and putting them on a machine with no record of
 * whether they had been told to be careful. The questionnaire is the standard
 * pre-exercise screen: it does not diagnose anything and it does not clear
 * anybody — it asks seven yes/no questions, and a single yes means "talk to a
 * doctor before you start".
 *
 * ── What this refuses to do ─────────────────────────────────────────────────
 *
 * It never says "fit to train". Software cannot say that, and a screen that
 * printed it would be the reason a gym stopped asking a doctor. `clear` here
 * means "no flags on this questionnaire", which is a fact about the form and
 * not a statement about the person — the wording on the screen says exactly
 * that.
 *
 * An unanswered question is `incomplete`, never a no. A form where somebody
 * skipped the chest-pain question is not a form that says no chest pain.
 */

/** The seven, in the order they are asked. Keys are stable; text is i18n. */
const QUESTIONS = ['heart', 'chest_pain', 'dizzy', 'bone_joint', 'bp_meds', 'pregnancy', 'other'];

/** Read a submitted form. Anything not 'yes'/'no' stays unanswered. */
function readAnswers(body) {
  const b = body || {};
  const out = {};
  for (const q of QUESTIONS) {
    const v = String(b['q_' + q] || '').trim();
    out[q] = (v === 'yes' || v === 'no') ? v : null;
  }
  return out;
}

/** Which questions have no answer yet. */
function unanswered(answers) {
  return QUESTIONS.filter((q) => !answers || (answers[q] !== 'yes' && answers[q] !== 'no'));
}

/** Which were answered yes — the ones a trainer has to read. */
function flags(answers) {
  return QUESTIONS.filter((q) => answers && answers[q] === 'yes');
}

/**
 * The verdict on the FORM, not on the person.
 *
 * @returns {'incomplete'|'see_doctor'|'no_flags'}
 */
function verdict(answers) {
  if (!answers) return 'incomplete';
  if (flags(answers).length) return 'see_doctor';
  if (unanswered(answers).length) return 'incomplete';
  return 'no_flags';
}

/** Is there anything on file at all? */
function isFilled(answers) {
  return !!answers && QUESTIONS.some((q) => answers[q] === 'yes' || answers[q] === 'no');
}

module.exports = { QUESTIONS, readAnswers, unanswered, flags, verdict, isFilled };
