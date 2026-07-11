'use strict';

// ── Execution Validator ──────────────────────────────────────────────────────
// Decides whether a step result is acceptable (drives the retry loop). Rule-based
// by default: a result is valid unless it reports `ok === false`. An Action may
// expose its own `validate(result)` for richer checks (e.g. "did the download
// actually produce a file?"). Returns { valid, reason }.
function validate(action, result) {
  if (!result || result.ok === false) {
    return { valid: false, reason: (result && result.error) || 'action reported failure' };
  }
  if (action && typeof action.validate === 'function') {
    try { return action.validate(result); } catch (e) { return { valid: false, reason: 'validator error: ' + e.message }; }
  }
  return { valid: true };
}

module.exports = { validate };
