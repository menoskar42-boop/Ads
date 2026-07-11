'use strict';

// Loads built-in actions so they self-register, then re-exports the registry.
// Adding a capability = a new Action file + one require() line here (Open/Closed).
require('./SearchWebAction');

module.exports = require('./_registry');
