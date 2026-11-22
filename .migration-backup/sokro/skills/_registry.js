'use strict';

// ── Skill Registry ───────────────────────────────────────────────────────────
// A Skill is a reusable recipe that composes Actions into a higher-level
// capability (e.g. "research_report" = search_web + LLM synthesis). Skills share
// the same shape as Actions ({ name, description, permissions, run(ctx,input) }),
// so the planner and executor treat them uniformly. Adding a Skill = one file +
// one register() call.
const skills = new Map();

function register(skill) {
  if (!skill || !skill.name) throw new Error('[sokro/skills] skill needs a name');
  skills.set(skill.name, skill);
  return skill;
}
function get(name) { return skills.get(name); }
function catalog() {
  return [...skills.values()].map((s) => ({
    name: s.name,
    description: s.description || '',
    permissions: s.permissions || [],
    kind: 'skill',
  }));
}

module.exports = { register, get, catalog, skills };
