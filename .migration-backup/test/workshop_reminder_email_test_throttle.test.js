'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
process.env.DATABASE_URL = 'postgres://no-db.invalid/no-db';
process.env.WORKSHOP_SECRET_KEY = 'test-only-workshop-secret';
const workshopAdmin = require('../src/routes/workshop_admin');

const ROOT = path.join(__dirname, '..');
const routes = fs.readFileSync(path.join(ROOT, 'src/routes/workshop_admin.js'), 'utf8');
const settingsPage = fs.readFileSync(path.join(ROOT, 'src/views/workshop_admin/settings.ejs'), 'utf8');

test('the reminder email test is limited per company for one minute', async (t) => {
  const claimSlot = workshopAdmin.helpers.claimReminderEmailTestSlot;
  const now = 1_000_000;

  assert.equal(claimSlot(41, now), true);
  assert.equal(claimSlot(41, now + 59_999), false);
  assert.equal(claimSlot(42, now + 59_999), true, 'another workshop has its own cooldown');
  assert.equal(claimSlot(41, now + 60_000), true, 'the same workshop can retry after one minute');
  assert.equal(claimSlot(0, now), false);
  assert.equal(claimSlot('not-a-company', now), false);

  const route = routes.slice(
    routes.indexOf("router.post('/settings/reminder-email-test'"),
    routes.indexOf("router.post('/settings/messages'")
  );
  assert.match(route, /requireWorkshopPermission\('manage_settings'\)/);
  assert.match(route, /claimReminderEmailTestSlot\(req\.company\.id\)/);
  assert.match(route, /test_email=rate_limited/);
  assert.match(settingsPage, /testEmailStatus === 'rate_limited'/);

  t.after(async () => workshopAdmin.pool.end());
});
