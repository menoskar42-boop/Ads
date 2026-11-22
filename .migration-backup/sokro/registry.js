'use strict';

// ── Unified capability registry ──────────────────────────────────────────────
// Actions (atomic) and Skills (composed recipes) share the same shape
// ({ name, description, permissions, run(ctx, input) }), so the planner and the
// executor resolve them uniformly. The planner sees BOTH in one catalog and can
// pick a high-level skill or wire raw actions itself.
const actions = require('./actions');
const skills = require('./skills');

function get(name) { return actions.get(name) || skills.get(name); }
function catalog() { return [...actions.catalog(), ...skills.catalog()]; }

module.exports = { get, catalog, actions, skills };
