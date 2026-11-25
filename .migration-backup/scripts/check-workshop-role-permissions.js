#!/usr/bin/env node
'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');
execFileSync(process.execPath, [
  '--test',
  path.join(__dirname, '../test/workshop_role_permissions.test.js'),
], { stdio: 'inherit' });
