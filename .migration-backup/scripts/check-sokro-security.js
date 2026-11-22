'use strict';

// Focused regression checks for the Sokro trust boundaries. The DB-backed
// concurrency cases are exercised by the integration suite; these checks keep
// the security-critical source contracts visible in the fast suite.
const assert = require('assert');
const fs = require('fs');
const router = fs.readFileSync('sokro/router.js', 'utf8');
const memory = fs.readFileSync('sokro/memory/index.js', 'utf8');
const operate = fs.readFileSync('sokro/actions/OperateAction.js', 'utf8');
const guard = require('../sokro/lib/urlGuard');

assert(router.includes("status = 'awaiting_consent'"), 'resume must claim awaiting consent tasks');
assert(router.includes('confirmSensitive === true'), 'resume must require explicit confirmation');
assert(router.includes("status = 'running'"), 'resume must atomically claim the task');
assert(router.includes('getMessagesFor(req.sokroUser.id, convId'), 'run must verify conversation ownership');
assert(router.includes('addMessageFor(req.sokroUser.id'), 'API writes must be ownership-scoped');
assert(router.includes('addTurnFor(req.sokroUser.id'), 'booking turns must use atomic recording');
assert(memory.includes('INSERT INTO sokro_messages'), 'memory must write messages');
assert(memory.includes('pg_advisory_xact_lock'), 'turn recording must serialize retries');
assert(operate.includes("page.route('**/*'"), 'browser must validate every request');
assert(operate.includes('assertSafeUrl(requestUrl)'), 'browser request interception must use SSRF guard');
assert.strictEqual(guard.isPrivateIP('127.0.0.1'), true);
assert.strictEqual(guard.isPrivateIP('169.254.169.254'), true);
assert.strictEqual(guard.isPrivateIP('10.0.0.1'), true);
assert.strictEqual(guard.isPrivateIP('8.8.8.8'), false);
(async () => {
  await assert.rejects(() => guard.assertSafeUrl('http://localhost/'), /blocked host/);
  await assert.rejects(() => guard.assertSafeUrl('http://127.0.0.1/'), /blocked private address/);
  console.log('✅ Sokro consent, ownership, booking idempotency, and SSRF regressions');
})().catch((e) => { console.error(e); process.exitCode = 1; });