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

test('reminder settings validate bounds, accept individual zero values, and stay isolated by company', async (t) => {
  const saved = new Map();
  const initialQuery = pool.query;
  const initialConnect = pool.connect;
  pool.query = async (sql, params = []) => {
    if (sql.includes('SELECT * FROM companies WHERE id = $1')) {
      return { rows: [{ id: Number(params[0]), page_type: 'workshop', is_active: true }] };
    }
    if (sql.includes('SELECT flag_key, enabled FROM workshop_flags WHERE company_id = $1')) {
      return { rows: [] };
    }
    if (sql.includes('SELECT id, company_id, email, role FROM company_users')) {
      return { rows: [{ id: 9, company_id: Number(params[1]), email: 'owner@example.test', role: 'owner' }] };
    }
    if (sql.includes('SELECT * FROM workshop_settings WHERE company_id = $1')) {
      return { rows: saved.has(Number(params[0])) ? [saved.get(Number(params[0]))] : [] };
    }
    if (sql.includes('FROM workshop_reminders') && sql.includes('COUNT(*)')) {
      return { rows: [{ n: 0 }] };
    }
    if (sql.includes('INSERT INTO workshop_flags')) return { rows: [] };
    throw new Error(`unexpected fake pool query: ${sql.slice(0, 100)}`);
  };
  pool.connect = async () => ({
    query: async (sql, params = []) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('SELECT admin_alert_email') && sql.includes('FROM workshop_settings')) {
        const current = saved.get(Number(params[0]));
        return { rows: current ? [{ admin_alert_email: current.admin_alert_email || null }] : [] };
      }
      if (sql.includes('INSERT INTO workshop_settings')) {
        saved.set(Number(params[0]), {
          company_id: Number(params[0]),
          reminder_lead_days: params[12],
          reminder_lead_km: params[13],
          admin_alert_email: null,
        });
        return { rows: [] };
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

  async function save(days, km, companyId = 41) {
    const body = new URLSearchParams({
      reminder_lead_days: String(days),
      reminder_lead_km: String(km),
    });
    const response = await fetch(`${origin}/workshop/settings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-test-company': String(companyId),
      },
      body,
      redirect: 'manual',
    });
    return response;
  }

  assert.equal((await save(0, 500)).headers.get('location'), '/workshop/settings?saved=1');
  assert.deepEqual(
    [saved.get(41).reminder_lead_days, saved.get(41).reminder_lead_km],
    [0, 500],
    'zero days is accepted while the kilometer threshold remains active',
  );
  assert.equal((await save(7, 0)).headers.get('location'), '/workshop/settings?saved=1');
  assert.deepEqual([saved.get(41).reminder_lead_days, saved.get(41).reminder_lead_km], [7, 0]);
  assert.equal((await save(60, 10000)).headers.get('location'), '/workshop/settings?saved=1');

  for (const [days, km] of [[61, 500], [7, 10001], [-1, 500], [7.5, 500], [0, 0], ['', 500]]) {
    const response = await save(days, km);
    assert.equal(response.headers.get('location'), '/workshop/settings?err=reminder_invalid', `${days}/${km}`);
  }

  assert.equal((await save(14, 1200, 42)).headers.get('location'), '/workshop/settings?saved=1');
  assert.deepEqual([saved.get(41).reminder_lead_days, saved.get(41).reminder_lead_km], [60, 10000]);
  assert.deepEqual([saved.get(42).reminder_lead_days, saved.get(42).reminder_lead_km], [14, 1200]);
});

test('workshop schema declares safe reminder defaults for new and existing tables', () => {
  const schema = fs.readFileSync(path.join(__dirname, '../src/workshop/schema.js'), 'utf8');
  assert.match(schema, /reminder_lead_days INTEGER NOT NULL DEFAULT 7/);
  assert.match(schema, /reminder_lead_km\s+INTEGER NOT NULL DEFAULT 500/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS reminder_lead_days INTEGER NOT NULL DEFAULT 7/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS reminder_lead_km INTEGER NOT NULL DEFAULT 500/);
});
