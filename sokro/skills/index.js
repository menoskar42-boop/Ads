'use strict';

// Loads built-in skills so they self-register, then re-exports the registry.
// Adding a Skill = a new file + one require() line here.
require('./ResearchReportSkill');

module.exports = require('./_registry');
