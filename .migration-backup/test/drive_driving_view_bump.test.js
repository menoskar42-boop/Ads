'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'drive-web/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'drive-web/app.js'), 'utf8');

test('driving view shows separate two-way and one-way bump buttons', () => {
  assert.match(html, /id="dvBump">[^<]*مطب اتجاهين/);
  assert.match(html, /id="dvBump1">[^<]*مطب اتجاه واحد/);
  assert.match(html, /id="markBump1"/);
});

test('driving view routes the one-way button to the existing action', () => {
  assert.match(app, /dvBump1:\s*'markBump1'/);
});
