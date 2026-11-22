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
//
// `without` DROPS every action that needs one of the named permissions. On a
// phone with no extension and no server Chromium, the browser tools cannot do
// anything — and a tool that is merely discouraged in the prompt still gets
// chosen, then fails, and the user is told about an extension they were never
// offered. A capability that is not there is not in the list.
function catalog(opts) {
  const without = (opts && opts.without) || [];
  return [...actions.values()]
    .filter((a) => !(a.permissions || []).some((p) => without.includes(p)))
    .map((a) => ({
      name: a.name,
      description: a.description || '',
      permissions: a.permissions || [],
    }));
}

module.exports = { register, get, catalog, actions };
