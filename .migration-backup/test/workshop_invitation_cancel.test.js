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

test('only managers can cancel a pending invitation within their own company', async (t) => {
  const initialQuery = pool.query;
  const invitations = new Map([
    [10, { id: 10, company_id: 41, status: 'pending' }],
    [11, { id: 11, company_id: 41, status: 'accepted' }],
    [12, { id: 12, company_id: 99, status: 'pending' }],
    [13, { id: 13, company_id: 41, status: 'pending' }],
  ]);
  const updates = [];
  let role = 'owner';

  pool.query = async (sql, params = []) => {
    if (sql.includes('SELECT * FROM companies WHERE id = $1')) {
      const id = Number(params[0]);
      return { rows: [{ id, page_type: 'workshop', is_active: true }] };
    }
    if (sql.includes('SELECT flag_key, enabled FROM workshop_flags WHERE company_id = $1')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT id, company_id, email, role FROM company_users')) {
      return { rows: [{ id: 9, company_id: Number(params[1]), email: 'owner@example.test', role }] };
    }
    if (sql.includes('SELECT * FROM workshop_settings WHERE company_id = $1')) {
      return { rows: [] };
    }
    if (sql.includes('UPDATE workshop_team_invitations') && sql.includes('RETURNING id')) {
      updates.push({ sql, params });
      const [id, companyId] = params.map(Number);
      const invitation = invitations.get(id);
      if (!invitation || invitation.company_id !== companyId || invitation.status !== 'pending') {
        return { rowCount: 0, rows: [] };
      }
      invitations.set(id, { ...invitation, status: 'revoked', revoked_at: new Date().toISOString() });
      return { rowCount: 1, rows: [{ id }] };
    }
    throw new Error(`unexpected fake workshop query: ${sql.slice(0, 100)}`);
  };
  t.after(async () => {
    pool.query = initialQuery;
    await pool.end();
  });

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = {
      companyId: Number(req.get('x-test-company') || 41),
      companyUserId: 9,
    };
    res.locals.t = (key) => key;
    next();
  });
  app.use('/workshop', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function cancel(id, companyId = 41) {
    return fetch(`${origin}/workshop/settings/users/invitations/${id}/cancel`, {
      method: 'POST',
      headers: { 'x-test-company': String(companyId) },
      redirect: 'manual',
    });
  }

  const cancelled = await cancel(10);
  assert.equal(cancelled.status, 302);
  assert.equal(cancelled.headers.get('location'), '/workshop/settings?invite_cancel=cancelled');
  assert.equal(invitations.get(10).status, 'revoked');

  for (const id of [10, 11, 12]) {
    const response = await cancel(id);
    assert.equal(response.headers.get('location'), '/workshop/settings?invite_cancel=unavailable');
  }
  assert.equal(updates.length, 4);
  assert.deepEqual(updates[0].params, [10, 41]);
  assert.match(updates[0].sql, /id=\$1 AND company_id=\$2/);
  assert.match(updates[0].sql, /accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now\(\)/);

  role = 'reception';
  const forbidden = await cancel(13);
  assert.equal(forbidden.status, 403);
  assert.equal(updates.length, 4, 'permission denial occurs before the update');

  const sourceDir = path.join(__dirname, '..');
  const view = fs.readFileSync(path.join(sourceDir, 'src/views/workshop_admin/settings.ejs'), 'utf8');
  const publicInviteRoute = fs.readFileSync(path.join(sourceDir, 'src/routes/company.js'), 'utf8');
  assert.match(view, /if \(invitation\.status === 'pending'\)[\s\S]*?settings\/users\/invitations\/<%= invitation\.id %>\/cancel/);
  assert.match(view, /inviteCancelStatus === 'cancelled'/);
  assert.match(publicInviteRoute, /token_hash=\$1 AND i\.accepted_at IS NULL AND i\.revoked_at IS NULL/);
});
