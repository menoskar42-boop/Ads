'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const audit = require('../src/lib/audit');

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
});
