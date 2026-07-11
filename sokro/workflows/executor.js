'use strict';

// ── Executor (self-healing) ──────────────────────────────────────────────────
// Runs a plan step-by-step. After each step the Validator checks the result; on
// failure the step is retried (with simple backoff) up to `maxRetries` instead of
// stopping the whole run. Every step is logged to Memory (execution_history).
// A hard failure after retries aborts the remaining plan.
const { validate } = require('../validation/validator');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function execute(ctx, plan, opts = {}) {
  const onStep = opts.onStep || function () {};
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : 2;
  const steps = (plan && plan.steps) || [];
  const results = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const action = ctx.actions.get(step.action);
    let result;

    if (!action) {
      result = { ok: false, error: 'unknown action: ' + step.action };
    } else {
      let attempt = 0;
      for (;;) {
        attempt++;
        try { result = await action.run(ctx, step.input || {}); }
        catch (e) { result = { ok: false, error: e.message }; }
        const v = validate(action, result);
        if (v.valid) break;
        if (attempt > maxRetries) { result.ok = false; result.error = result.error || v.reason; break; }
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

module.exports = { execute };
