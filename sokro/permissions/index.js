'use strict';

// ── Permissions ──────────────────────────────────────────────────────────────
// Every Action/Skill declares the scopes it needs. A subset is SENSITIVE and
// must get explicit (voice) consent before the executor runs it — the assistant
// says "I'm about to log into Facebook and publish — confirm?" and the user
// approves by voice/click. Non-sensitive scopes (e.g. 'network' for search) run
// without interruption. New scopes are added here — no code change elsewhere.
// Reading/navigating a site ('browser') is LOW-RISK and runs WITHOUT a confirm —
// opening Google or reading a page is not something you undo. Confirmation is
// reserved for actions that are hard to reverse: submitting/publishing/saving a
// form ('submit'), logging in, sending email, posting to social, payment, files,
// cloud. (The operate loop additionally pauses right before a pay/delete/publish
// BUTTON on its own, regardless of these scopes.)
const SENSITIVE = new Set([
  'submit',    // submit/publish/save a form — a write the user can't easily undo
  'login',     // authenticate to a third-party site
  'files',     // write/read the user's files
  'email',     // send email
  'social',    // post to social media
  'facebook', 'instagram', 'twitter', 'slack',
  'drive',     // cloud storage
  'payment',   // anything touching money / checkout
]);

// Collects the union of permissions required by a plan's steps.
function forPlan(plan, registry) {
  const steps = (plan && plan.steps) || [];
  const all = new Set();
  for (const s of steps) {
    const cap = registry.get(s.action);
    ((cap && cap.permissions) || []).forEach((p) => all.add(p));
  }
  const required = [...all];
  const sensitive = required.filter((p) => SENSITIVE.has(p));
  return { required, sensitive, requiresConsent: sensitive.length > 0 };
}

function isSensitive(perms) { return (perms || []).some((p) => SENSITIVE.has(p)); }

module.exports = { forPlan, isSensitive, SENSITIVE };
