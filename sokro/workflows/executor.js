'use strict';

// ── Executor (self-healing) ──────────────────────────────────────────────────
// Runs a plan step-by-step. After each step the Validator checks the result; on
// failure the step is retried (with simple backoff) up to `maxRetries` instead of
// stopping the whole run. Every step is logged to Memory (execution_history).
// A hard failure after retries aborts the remaining plan.
//
// ── Except the steps that must not run twice ─────────────────────────────────
//
// "Retry on failure" is right for a search that timed out and catastrophic for
// a booking that did not answer in time. A submit whose response never arrived
// has usually SUCCEEDED — the request reached the site, the reply got lost — and
// the retry books a second ticket, or pays a second time. Nobody sees it until
// a statement arrives.
//
// The rule is read from what the project already declares: an action holding a
// SENSITIVE permission (submit · payment · email · social · login · files) runs
// ONCE. An action can be more precise about itself with `retryable(input)` —
// `fill_submit` that is only typing into a search box is safe to repeat; the
// same action with a submit is not.
const { validate } = require('../validation/validator');
const permissions = require('../permissions');

/**
 * May this step be run a second time?
 *
 * Defaults to "no" for anything hard to reverse, so a new action is safe by
 * being declared, not by being remembered here.
 */
function mayRetry(action, input) {
  if (!action) return false;
  if (action.retryable === false) return false;
  if (typeof action.retryable === 'function') return action.retryable(input) !== false;
  return !permissions.isSensitive(action.permissions);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function execute(ctx, plan, opts = {}) {
  const onStep = opts.onStep || function () {};
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : 2;
  // Generous safety net ONLY — a heavy plan is allowed to run long and finish
  // (the user prefers a full result over an early cut-off); this just stops a
  // truly runaway plan from never returning.
  const maxSteps = opts.maxSteps != null ? opts.maxSteps : 20;
  const timeBudgetMs = opts.timeBudgetMs != null ? opts.timeBudgetMs : 210000;
  const startedAt = Date.now();
  const steps = (plan && plan.steps) || [];
  const results = [];

  for (let i = 0; i < steps.length; i++) {
    if (i >= maxSteps || (Date.now() - startedAt) > timeBudgetMs) {
      results.push({ step: i, action: '(stopped)', result: { ok: true, output: { note: 'وقفت بدري عشان المهمة كبيرة — دي نتيجة جزئية. جرّب طلب أضيق (عربية واحدة أو صفحة واحدة).', truncated: true, remaining: steps.length - i } } });
      break;
    }
    const step = steps[i];
    const action = ctx.actions.get(step.action);
    let result;

    if (!action) {
      result = { ok: false, error: 'unknown action: ' + step.action };
    } else {
      const retries = mayRetry(action, step.input || {}) ? maxRetries : 0;
      let attempt = 0;
      for (;;) {
        attempt++;
        try { result = await action.run(ctx, step.input || {}); }
        catch (e) { result = { ok: false, error: e.message }; }
        const v = validate(action, result);
        if (v.valid) break;
        if (attempt > retries) {
          result.ok = false;
          result.error = result.error || v.reason;
          // Say it out loud. A step that was tried once, on purpose, is not the
          // same as a step that was tried three times and kept failing — and the
          // user deciding whether to try again deserves to know which.
          if (retries === 0) result.notRetried = true;
          break;
        }
        onStep({ step: i, action: step.action, status: 'retry', attempt, error: v.reason });
        await sleep(400 * attempt);
      }
    }

    if (ctx.taskId && ctx.memory) {
      try {
        await ctx.memory.logStep(ctx.taskId, {
          step: i, action: step.action, status: result.ok ? 'ok' : 'error',
          input: step.input, output: result.output, error: result.error,
        });
      } catch (_) { /* logging must never break execution */ }
    }

    onStep({ step: i, action: step.action, status: result.ok ? 'ok' : 'error', output: result.output, error: result.error });
    results.push({ step: i, action: step.action, result });
    if (!result.ok) break; // hard failure → abort the rest of the plan
  }

  return results;
}

module.exports = { execute, mayRetry };
