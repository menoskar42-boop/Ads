'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.DEALS_DATABASE_URL = 'postgres://unused.invalid/no-db';
process.env.AMAZON_CREATORS_API_CLIENT_ID = 'test-client-id';
process.env.AMAZON_CREATORS_API_CLIENT_SECRET = 'test-client-secret';
delete process.env.AMAZON_CREATORS_API_ACCESS_TOKEN;

const { getSyncDashboard } = require('../deals/catalog_sync');
const { pool } = require('../deals/db');

class FakeDealsDb {
  constructor() {
    this.alerts = new Map();
    this.queries = [];
    this.products = {
      amazon_total: 4,
      amazon_fresh: 2,
      amazon_expiring: 2,
      amazon_stale: 0,
      amazon_failed: 0,
      amazon_not_configured: 0,
    };
    this.runs = [{ status: 'success', failure_count: 0, started_at: '2026-11-26T10:00:00.000Z' }];
    this.times = { last_success_at: '2026-11-26T10:00:00.000Z', last_failure_at: null };
  }

  async query(sql, params = []) {
    this.queries.push({ sql, params });
    if (sql.includes('SELECT * FROM deals_sync_runs')) return { rows: this.runs };
    if (sql.includes('MAX(started_at) FILTER')) return { rows: [this.times] };
    if (sql.includes('FROM deals_catalog_products')) return { rows: [this.products] };

    if (sql.includes('INSERT INTO deals_sync_alerts')) {
      const [alertKey, severity, message, details] = params;
      const current = this.alerts.get(alertKey);
      this.alerts.set(alertKey, {
        alert_key: alertKey,
        severity,
        message,
        details: JSON.parse(details),
        is_active: true,
        first_seen_at: current && current.is_active ? current.first_seen_at : new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        resolved_at: null,
      });
      return { rows: [] };
    }

    if (sql.includes('UPDATE deals_sync_alerts SET is_active=false')) {
      const activeKeys = params[0] || [];
      for (const [alertKey, alert] of this.alerts) {
        if (alert.is_active && !activeKeys.includes(alertKey)) {
          this.alerts.set(alertKey, { ...alert, is_active: false, resolved_at: new Date().toISOString() });
        }
      }
      return { rows: [] };
    }

    if (sql.includes('FROM deals_sync_alerts WHERE is_active=true')) {
      return {
        rows: [...this.alerts.values()]
          .filter((alert) => alert.is_active)
          .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1)),
      };
    }

    throw new Error(`unexpected deals dashboard query: ${sql.slice(0, 100)}`);
  }
}

test('Amazon sync alerts are stored, shown to admins, and resolved after fresh data returns', async (t) => {
  t.after(() => pool.end());
  const db = new FakeDealsDb();
  const dashboardSource = fs.readFileSync(
    path.join(__dirname, '..', 'deals/views/admin/dashboard.ejs'),
    'utf8',
  );

  const staleDashboard = await getSyncDashboard(db);
  assert.equal(staleDashboard.alerts.length, 1);
  assert.equal(staleDashboard.alerts[0].alert_key, 'amazon_data_freshness');
  assert.equal(staleDashboard.alerts[0].is_active, true);
  assert.equal(db.alerts.get('amazon_data_freshness').is_active, true);
  assert.match(dashboardSource, /syncInfo\.alerts/);

  db.products = {
    amazon_total: 4,
    amazon_fresh: 4,
    amazon_expiring: 0,
    amazon_stale: 0,
    amazon_failed: 0,
    amazon_not_configured: 0,
  };
  db.runs = [{ status: 'success', failure_count: 0, started_at: '2026-11-26T11:00:00.000Z' }];

  const freshDashboard = await getSyncDashboard(db);
  assert.deepEqual(freshDashboard.alerts, []);
  assert.equal(db.alerts.get('amazon_data_freshness').is_active, false);
  assert.ok(db.alerts.get('amazon_data_freshness').resolved_at);
  assert.doesNotMatch(JSON.stringify(db.queries), /test-client-secret/);
});
