'use strict';

// Loads built-in actions so they self-register, then re-exports the registry.
// Adding a capability = a new Action file + one require() line here (Open/Closed).
require('./SearchWebAction');
require('./GenerateImageAction');

module.exports = require('./_registry');
