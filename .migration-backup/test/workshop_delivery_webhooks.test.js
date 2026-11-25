'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const http = require('node:http');

// This test process uses a deliberately invalid DB URL and replaces every
// query with an in-memory fake before serving a request. These are test-only
// credentials; no workspace secret or real database is read.
process.env.DATABASE_URL = 'postgres://no-db.invalid/no-db';
process.env.WORKSHOP_SECRET_KEY = 'test-only-workshop-secret';
delete process.env.PUBLIC_BASE_DOMAIN;

const router = require('../src/routes/workshop_admin');
const pool = router.pool;
const workshopVault = require('../src/lib/workshop_vault');

const testConfig = {
  twilio_account_sid_enc: workshopVault.encrypt('AC-test-only'),
  twilio_auth_token_enc: workshopVault.encrypt('twilio-test-only'),
  meta_app_secret_enc: workshopVault.encrypt('meta-test-only'),
  meta_verify_token_enc: workshopVault.encrypt('verify-test-only'),
  meta_phone_number_id: 'phone-test-only',
};

function rank(status) {
  return ({ prepared: 0, queued: 1, sent: 2, failed: 3, delivered: 4 })[status] ?? 2;
}

test('signed Twilio and Meta callbacks update only their company and ignore invalid, unknown, or stale callbacks', async (t) => {
  const initialQuery = pool.query;
  const state = {
    message: {
      id: 7, job_id: 11, company_id: 1, provider_message_id: 'SM-valid',
      channel: 'whatsapp', provider: 'twilio', status: 'sent',
      provider_status: 'sent', attempt_count: 0,
    },
    updates: [],
    lookups: [],
  };

  pool.query = async (sql, params = []) => {
    if (sql.includes('SELECT * FROM workshop_message_settings')) {
      return { rows: ['1', '2'].includes(String(params[0])) ? [testConfig] : [] };
    }
    if (sql.includes('FROM workshop_messages') && sql.includes('provider_message_id=$2')) {
      state.lookups.push(params.slice(0, 2));
      const msg = state.message;
      return {
        rows: msg && String(msg.company_id) === String(params[0]) &&
          msg.provider_message_id === String(params[1]) ? [{ ...msg }] : [],
      };
    }
    if (sql.includes('UPDATE workshop_messages')) {
      state.updates.push({ sql, params: [...params] });
      const msg = state.message;
      if (!msg || String(msg.company_id) !== String(params[4]) || msg.id !== params[3] ||
          rank(msg.status) > params[5]) return { rows: [] };
      msg.status = params[1];
      msg.provider_status = params[0];
      return { rows: [{ id: msg.id, job_id: msg.job_id, status: msg.status }] };
    }
    if (sql.includes('INSERT INTO workshop_activity')) return { rows: [] };
    throw new Error('Unexpected mocked DB query in delivery webhook test');
  };
  t.after(async () => {
    pool.query = initialQuery;
    await pool.end();
  });

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = Buffer.from(buf); } }));
  app.use('/workshop', router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;

  function twilioSignature(pathname, fields) {
    const canonical = Object.keys(fields).sort().map((key) => key + String(fields[key])).join('');
    return crypto.createHmac('sha1', 'twilio-test-only')
      .update(origin + pathname + canonical).digest('base64');
  }
  function metaSignature(body) {
    return 'sha256=' + crypto.createHmac('sha256', 'meta-test-only')
      .update(JSON.stringify(body)).digest('hex');
  }
  async function postTwilio(companyId, fields, signatureOverride) {
    const pathname = `/workshop/webhooks/twilio/${companyId}`;
    const response = await fetch(origin + pathname, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': signatureOverride || twilioSignature(pathname, fields),
      },
      body: new URLSearchParams(fields),
    });
    return response;
  }
  async function postMeta(companyId, body, signatureOverride) {
    const response = await fetch(`${origin}/workshop/webhooks/meta/${companyId}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signatureOverride || metaSignature(body),
      },
      body: JSON.stringify(body),
    });
    return response;
  }

  const twilioFields = {
    AccountSid: 'AC-test-only',
    MessageSid: 'SM-valid',
    MessageStatus: 'delivered',
  };
  const twilioValid = await postTwilio(1, twilioFields);
  assert.equal(twilioValid.status, 200);
  assert.equal(state.message.status, 'delivered');
  assert.equal(state.updates.length, 1);
  assert.equal(state.updates[0].params[4], 1, 'company_id is bound in the update');

  const updatesAfterValid = state.updates.length;
  assert.equal((await postTwilio(1, twilioFields, 'invalid-signature')).status, 403);
  assert.equal(state.updates.length, updatesAfterValid, 'bad Twilio signature does not write');

  const unknown = await postTwilio(1, { ...twilioFields, MessageSid: 'SM-unknown' });
  assert.equal(unknown.status, 200);
  assert.equal(state.updates.length, updatesAfterValid, 'unknown provider id is ignored');

  const metaBody = {
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: 'phone-test-only' },
          statuses: [{ id: 'SM-valid', status: 'read' }],
        },
      }],
    }],
  };
  const metaValid = await postMeta(1, metaBody);
  assert.equal(metaValid.status, 200);
  assert.equal(state.message.status, 'delivered');
  const afterMeta = state.updates.length;
  assert.equal((await postMeta(1, metaBody, 'sha256=bad')).status, 403);
  assert.equal(state.updates.length, afterMeta, 'bad Meta signature does not write');

  // A correctly signed callback for company 2 cannot see or update company 1's id.
  assert.equal((await postTwilio(2, twilioFields)).status, 200);
  assert.equal(state.updates.length, afterMeta);
  assert.ok(state.lookups.some(([companyId, messageId]) => companyId === 2 && messageId === 'SM-valid'));

  // Older status callbacks cannot replace a later failure or delivery.
  state.message.status = 'failed';
  const afterFailure = state.updates.length;
  await postTwilio(1, { ...twilioFields, MessageStatus: 'sent' });
  assert.equal(state.message.status, 'failed');
  assert.equal(state.updates.length, afterFailure);
  state.message.status = 'delivered';
  await postTwilio(1, { ...twilioFields, MessageStatus: 'undelivered' });
  assert.equal(state.message.status, 'delivered');
  assert.equal(state.updates.length, afterFailure);
});
