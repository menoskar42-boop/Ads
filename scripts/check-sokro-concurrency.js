#!/usr/bin/env node
'use strict';

// Database integration smoke test. It is opt-in because it creates and removes
// short-lived rows in the configured development database.
const { Pool } = require('pg');
const crypto = require('crypto');
const assert = require('assert');
const url = process.env.DATABASE_URL;
if (!url) { console.log('SKIP: DATABASE_URL is not configured'); process.exit(0); }
const pool = new Pool({ connectionString: url });
(async () => {
  const email = `sokro-concurrency-${crypto.randomUUID()}@invalid.test`;
  const c = await pool.connect();
  let uid, bid, eid;
  try {
    await c.query('BEGIN');
    uid = (await c.query('INSERT INTO sokro_users(email,password_hash) VALUES($1,$2) RETURNING id', [email, 'test'])).rows[0].id;
    bid = (await c.query(`INSERT INTO sokro_bookings(user_id,kind,status,fields,confirmed_fingerprint)
      VALUES($1,'hotel','confirmed','{}','fp') RETURNING id`, [uid])).rows[0].id;
    eid = (await c.query(`INSERT INTO sokro_ext_commands(user_id,kind,status) VALUES($1,'test','pending') RETURNING id`, [uid])).rows[0].id;
    await c.query('COMMIT');
    const a = await pool.connect(), b = await pool.connect();
    await a.query('BEGIN'); await b.query('BEGIN');
    const first = await a.query(`UPDATE sokro_bookings SET status='submitting' WHERE id=$1 AND user_id=$2
      AND status='confirmed' AND confirmed_fingerprint='fp' RETURNING id`, [bid, uid]);
    const secondPromise = b.query(`UPDATE sokro_bookings SET status='submitting' WHERE id=$1 AND user_id=$2
      AND status='confirmed' AND confirmed_fingerprint='fp' RETURNING id`, [bid, uid]);
    await a.query('COMMIT'); const second = await secondPromise; await b.query('COMMIT');
    const claims = [first, second];
    assert.equal(claims.filter(x => x.rows.length).length, 1);
    a.release(); b.release();
    const ext = await pool.query(`WITH candidate AS (
      SELECT id FROM sokro_ext_commands WHERE user_id=$1 AND status='pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE sokro_ext_commands AS c SET status='running' FROM candidate WHERE c.id=candidate.id RETURNING c.id`, [uid]);
    assert.equal(ext.rows.length, 1);
    console.log('✅ concurrent booking and extension claims are single-winner');
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    await pool.query('DELETE FROM sokro_users WHERE email=$1', [email]).catch(() => {});
    await c.release();
    await pool.end();
  }
})().catch((e) => { console.error('❌ concurrency integration:', e.message); process.exitCode = 1; });