'use strict';

// Loads built-in skills so they self-register, then re-exports the registry.
// Adding a Skill = a new file + one require() line here.
require('./ResearchReportSkill');
require('./GmailSkill');
require('./GmailApiSkill');
require('./FacebookSkill');

module.exports = require('./_registry');
