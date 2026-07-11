'use strict';

// ── Action Registry (Plugin Architecture) ────────────────────────────────────
// The lowest execution unit. Adding a new capability = one new file + one
// register() call here — ZERO changes to existing actions (Open/Closed).
//
//   interface Action {
//     name: string;                 // "search_web"
//     description: string;          // shown to the AI planner
//     permissions: string[];        // e.g. ['browser'], ['files'], ['email']
//     inputSchema?: object;         // JSON Schema for input validation
//     run(ctx, input): Promise<{ ok, output, artifacts?, error? }>;
//   }
//
// ctx exposes: llm, browser, secrets (decrypted at run-time only — never sent to
// the model), storage, logger, and the current user/task.
const actions = new Map();

function register(action) {
  if (!action || !action.name) throw new Error('[sokro/actions] action needs a name');
  actions.set(action.name, action);
  return action;
}

function get(name) { return actions.get(name); }

// Compact catalog for the planner — names + descriptions + permissions only.
function catalog() {
  return [...actions.values()].map((a) => ({
    name: a.name,
    description: a.description || '',
    permissions: a.permissions || [],
  }));
}

module.exports = { register, get, catalog, actions };
