'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const http = require('node:http');

process.env.DATABASE_URL = 'postgres://no-db.invalid/no-db';
process.env.WORKSHOP_SECRET_KEY = 'test-only-workshop-secret';

const router = require('../src/routes/workshop_admin');
const pool = router.pool;

test('role changes are recorded atomically and scoped to the current workshop', async (t) => {
  const initialQuery = pool.query;
  const initialConnect = pool.connect;
  const users = new Map([
    [9, { id: 9, company_id: 41, email: 'manager@example.test', role: 'owner' }],
    [20, { id: 20, company_id: 41, email: 'technician@example.test', role: 'technician' }],
    [21, { id: 21, company_id: 41, email: 'admin@example.test', role: 'admin' }],
    [30, { id: 30, company_id: 99, email: 'other@example.test', role: 'technician' }],
  ]);
  const history = [];
  const transactions = [];

  pool.query = async (sql, params = []) => {
    if (sql.includes('SELECT * FROM companies WHERE id = $1')) {
      const id = Number(params[0]);
      return { rows: [{ id, page_type: 'workshop', is_active: true }] };
    }
    if (sql.includes('SELECT flag_key, enabled FROM workshop_flags WHERE company_id = $1')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT id, company_id, email, role FROM company_users')) {
      return { rows: [users.get(Number(params[0]))] };
    }
    if (sql.includes('SELECT * FROM workshop_settings WHERE company_id = $1')) return { rows: [] };
    if (sql.includes('FROM workshop_reminders') && sql.includes('COUNT(*)')) return { rows: [{ n: 0 }] };
    throw new Error(`unexpected fake workshop query: ${sql.slice(0, 100)}`);
  };

  pool.connect = async () => ({
    async query(sql, params = []) {
      transactions.push({ sql, params });
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
      if (sql.includes('SELECT id, email, role FROM company_users')) {
        const [id, companyId] = params.map(Number);
        const user = users.get(id);
        return {
          rows: user && user.company_id === companyId && !['owner', 'admin'].includes(user.role)
            ? [{ id: user.id, email: user.email, role: user.role }]
            : [],
        };
      }
      if (sql.includes('UPDATE company_users SET role=$1')) {
        const [role, id, companyId] = params;
        const user = users.get(Number(id));
        if (user && user.company_id === Number(companyId) && !['owner', 'admin'].includes(user.role)) {
          users.set(user.id, { ...user, role });
        }
        return { rowCount: 1, rows: [] };
      }
      if (sql.includes('INSERT INTO workshop_role_history')) {
        const [companyId, userId, email, fromRole, toRole, changedBy] = params;
        history.push({
          company_id: companyId,
          user_id: userId,
          email,
          from_role: fromRole,
          to_role: toRole,
          changed_by: changedBy,
          created_at: new Date().toISOString(),
        });
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected fake transaction query: ${sql.slice(0, 100)}`);
    },
    release() {},
  });
  t.after(async () => {
    pool.query = initialQuery;
    pool.connect = initialConnect;
    await pool.end();
  });

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { companyId: Number(req.get('x-test-company') || 41), companyUserId: 9 };
    res.locals.t = (key) => key;
    next();
  });
  app.use('/workshop', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function changeRole(userId, role, companyId = 41) {
    return fetch(`${origin}/workshop/settings/users/${userId}/role`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-test-company': String(companyId),
      },
      body: new URLSearchParams({ role }),
      redirect: 'manual',
    });
  }

  const changed = await changeRole(20, 'manager');
  assert.equal(changed.headers.get('location'), '/workshop/settings?saved=1');
  assert.equal(users.get(20).role, 'manager');
  assert.deepEqual(
    (({ company_id, user_id, email, from_role, to_role, changed_by }) =>
      ({ company_id, user_id, email, from_role, to_role, changed_by }))(history[0]),
    {
      company_id: 41,
      user_id: 20,
      email: 'technician@example.test',
      from_role: 'technician',
      to_role: 'manager',
      changed_by: 'manager@example.test',
    },
  );
  assert.ok(history[0].created_at);
  assert.equal(transactions[0].sql, 'BEGIN');
  assert.equal(transactions.at(-1).sql, 'COMMIT');

  const otherCompany = await changeRole(30, 'manager');
  assert.equal(otherCompany.headers.get('location'), '/workshop/settings?err=role_save');
  const protectedAdmin = await changeRole(21, 'technician');
  assert.equal(protectedAdmin.headers.get('location'), '/workshop/settings?err=role_save');
  const noChange = await changeRole(20, 'manager');
  assert.equal(noChange.headers.get('location'), '/workshop/settings?saved=1');
  assert.equal(history.length, 1, 'only actual role changes are recorded');

  const sourceDir = path.join(__dirname, '..');
  const routeSource = fs.readFileSync(path.join(sourceDir, 'src/routes/workshop_admin.js'), 'utf8');
  const settingsView = fs.readFileSync(path.join(sourceDir, 'src/views/workshop_admin/settings.ejs'), 'utf8');
  const schema = fs.readFileSync(path.join(sourceDir, 'src/workshop/schema.js'), 'utf8');
  assert.match(routeSource, /WHERE h\.company_id=\$1/);
  assert.match(settingsView, /سجل تغييرات الأدوار/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS workshop_role_history/);
  assert.doesNotMatch(JSON.stringify(history), /password|secret|token/i);
});
