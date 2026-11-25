'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  normalizeWorkshopRole,
  workshopCan,
} = require('../src/workshop/operations');

const ROOT = path.join(__dirname, '..');
const routes = fs.readFileSync(path.join(ROOT, 'src/routes/workshop_admin.js'), 'utf8');

test('workshop roles allow only their configured sensitive operations', () => {
  const roles = ['owner', 'manager', 'reception', 'technician', 'unrecognized'];
  const cases = [
    ['pricing', 'manage_job_pricing', [true, true, false, false, false]],
    ['payment', 'record_payment', [true, true, true, false, true]],
    ['quality', 'update_quality', [true, true, false, false, false]],
    ['delivery gate', 'manage_job_pricing', [true, true, false, false, false]],
    ['user management', 'manage_settings', [true, true, false, false, false]],
  ];

  for (const [label, permission, expected] of cases) {
    assert.deepEqual(
      roles.map((role) => workshopCan(role, permission)),
      expected,
      label
    );
  }
  assert.equal(normalizeWorkshopRole('unrecognized'), 'reception');
});

test('direct write routes retain their permission middleware', () => {
  const protectedRoutes = [
    ["/jobs/:id/change-orders", 'manage_job_pricing'],
    ["/jobs/:id/estimates", 'manage_job_pricing'],
    ["/change-orders/:id/status", 'manage_job_pricing'],
    ["/jobs/:id/approve", 'manage_job_pricing'],
    ["/jobs/:id/pay", 'record_payment'],
    ["/jobs/:id/quality", 'update_quality'],
    ["/jobs/:id/status", 'advance_job'],
    ["/settings/users/invite", 'manage_settings'],
    ["/settings/users/:id/role", 'manage_settings'],
  ];

  for (const [route, permission] of protectedRoutes) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const declaration = new RegExp(`router\\.post\\('${escaped}',([^\\n]*)`).exec(routes);
    assert.ok(declaration, `POST ${route} exists`);
    assert.match(declaration[1], new RegExp(`requireWorkshopPermission\\('${permission}'\\)`),
      `POST ${route} must require ${permission}`);
  }

  const delivery = routes.slice(
    routes.indexOf("router.post('/jobs/:id/status'"),
    routes.indexOf("router.post('/jobs/:id/portal/revoke'")
  );
  assert.match(delivery, /status === 'delivered'/);
  assert.match(delivery, /!req\.canWorkshop\('manage_job_pricing'\)/,
    'a role with advance_job alone must not deliver a vehicle');
});

test('role comes from the authenticated company_users row, not request input', () => {
  const guard = routes.slice(routes.indexOf('async function requireWorkshop('),
    routes.indexOf('// A section that is switched off'));
  assert.match(guard, /SELECT id, company_id, email, role FROM company_users/);
  assert.match(guard, /req\.workshopRole\s*=\s*req\.session\.demoReadOnly\s*\?\s*'demo'\s*:\s*normalizeWorkshopRole\(user && user\.role\)/);
  assert.doesNotMatch(guard, /req\.body\.role/);

  const roleEditor = routes.slice(routes.indexOf("router.post('/settings/users/:id/role'"),
    routes.indexOf('// ──', routes.indexOf("router.post('/settings/users/:id/role'") + 1));
  assert.match(roleEditor, /\['manager', 'reception', 'technician'\]\.includes\(role\)/);
  assert.match(roleEditor, /role NOT IN \('owner','admin'\)/);
});
