'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { describe, it } = require('node:test');
const audit = require('../src/lib/audit');
const adminRouteSource = fs.readFileSync(require.resolve('../src/routes/admin'), 'utf8');
const securityViewSource = fs.readFileSync(
  require.resolve('../src/views/admin/workshop_alert_security.ejs'),
  'utf8'
);

const cursorAt = '2026-11-09T12:00:00.123456Z';

describe('workshop security audit pagination', () => {
  it('uses a fixed page size and keeps tenant/date filters bound to the query', async () => {
    let call;
    const pool = {
      query: async (sql, params) => {
        call = { sql, params };
        return { rows: [] };
      },
    };

    const page = await audit.recentSecurity(pool, {
      companyId: '24',
      from: '2026-11-01',
      to: '2026-11-09',
      limit: 999999,
    });

    assert.equal(audit.SECURITY_REVIEW_PAGE_SIZE, 50);
    assert.match(call.sql, /LIMIT 51$/);
    assert.match(call.sql, /ORDER BY created_at DESC, id DESC/);
    assert.deepEqual(call.params, ['workshop', 'workshop_alert_email_history', 'access_denied', 24, '2026-11-01', '2026-11-09']);
    assert.deepEqual(page, { rows: [], hasOlder: false, hasNewer: false });
  });

  it('accepts a strict cursor while retaining all active filters', () => {
    assert.deepEqual(
      audit.normalizeSecurityFilters({
        companyId: '24',
        from: '2026-11-01',
        to: '2026-11-09',
        cursorAt,
        cursorId: '9223372036854775807',
        direction: 'older',
      }),
      {
        companyId: 24,
        from: '2026-11-01',
        to: '2026-11-09',
        cursorAt,
        cursorId: '9223372036854775807',
        direction: 'older',
      }
    );
  });

  it('rejects malformed cursor values and does not accept an unbounded limit', () => {
    for (const options of [
      { cursorAt, direction: 'older' },
      { cursorAt, cursorId: '0', direction: 'older' },
      { cursorAt: '2026-02-30T12:00:00Z', cursorId: '7', direction: 'older' },
      { cursorAt, cursorId: '9223372036854775808', direction: 'older' },
      { cursorAt, cursorId: '7', direction: 'sideways' },
      { direction: 'older' },
    ]) {
      assert.throws(() => audit.normalizeSecurityFilters(options), /invalid security cursor/);
    }
    assert.equal(
      audit.normalizeSecurityFilters({ limit: '999999999999999999' }).limit,
      undefined
    );
  });

  it('continues older in descending timestamp/id order and detects another page', async () => {
    let call;
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: String(100 - index),
      cursor_created_at: cursorAt,
    }));
    const pool = {
      query: async (sql, params) => {
        call = { sql, params };
        return { rows };
      },
    };

    const page = await audit.recentSecurity(pool, {
      companyId: '24',
      from: '2026-11-01',
      to: '2026-11-09',
      cursorAt,
      cursorId: '100',
      direction: 'older',
    });

    assert.match(call.sql, /created_at, id\) < \(\$7::timestamptz, \$8::bigint\)/);
    assert.deepEqual(call.params.slice(-2), [cursorAt, '100']);
    assert.equal(page.rows.length, 50);
    assert.equal(page.rows[0].id, '100');
    assert.equal(page.hasOlder, true);
    assert.equal(page.hasNewer, true);
  });

  it('returns the nearest newer events in newest-first display order', async () => {
    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: String(index + 1),
      cursor_created_at: cursorAt,
    }));
    const pool = { query: async () => ({ rows }) };
    const page = await audit.recentSecurity(pool, {
      cursorAt,
      cursorId: '100',
      direction: 'newer',
    });

    assert.equal(page.rows.length, 50);
    assert.equal(page.rows[0].id, '50');
    assert.equal(page.rows[49].id, '1');
    assert.equal(page.hasNewer, true);
    assert.equal(page.hasOlder, true);
  });

  it('keeps company/date filters on both page links and applies filters from a fresh page', () => {
    const pageUrlStart = adminRouteSource.indexOf('const pageUrl = (row, direction) =>');
    const pageUrlEnd = adminRouteSource.indexOf('\n    };', pageUrlStart);
    const pageUrl = adminRouteSource.slice(pageUrlStart, pageUrlEnd);
    assert.ok(pageUrlStart >= 0 && pageUrlEnd > pageUrlStart);
    assert.match(pageUrl, /params\.set\('company_id', String\(filters\.companyId\)\)/);
    assert.match(pageUrl, /params\.set\('from', filters\.from\)/);
    assert.match(pageUrl, /params\.set\('to', filters\.to\)/);
    assert.match(pageUrl, /params\.set\('cursor_at', row\.cursor_created_at\)/);
    assert.match(pageUrl, /params\.set\('cursor_id', String\(row\.id\)\)/);
    assert.match(pageUrl, /params\.set\('direction', direction\)/);
    assert.match(adminRouteSource, /olderUrl: securityPage\.hasOlder && lastRow \? pageUrl\(lastRow, 'older'\)/);
    assert.match(adminRouteSource, /newerUrl: securityPage\.hasNewer && firstRow \? pageUrl\(firstRow, 'newer'\)/);

    const filterFormStart = securityViewSource.indexOf('<form method="get" action="/admin/security/workshop-alert-email"');
    const filterFormEnd = securityViewSource.indexOf('</form>', filterFormStart);
    const filterForm = securityViewSource.slice(filterFormStart, filterFormEnd);
    assert.ok(filterFormStart >= 0 && filterFormEnd > filterFormStart);
    assert.match(filterForm, /name="company_id"/);
    assert.match(filterForm, /name="from"/);
    assert.match(filterForm, /name="to"/);
    assert.doesNotMatch(filterForm, /cursor_at|cursor_id|direction/);
  });
});
