'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

process.env.DATABASE_URL = 'postgres://no-db.invalid/no-db';
process.env.WORKSHOP_SECRET_KEY = 'test-only-workshop-secret';
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;

const { sendWorkshopReminderHealthTest } = require('../src/lib/mailer');

function createFakeSmtpServer() {
  const messages = [];
  let behavior = 'accept';
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    let buffer = '';
    let dataMode = false;
    let authStep = '';
    let currentMessage = '';
    socket.write('220 fake-smtp.local ESMTP ready\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk;
      while (true) {
        if (dataMode) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) break;
          currentMessage += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          dataMode = false;
          messages.push(currentMessage);
          currentMessage = '';
          socket.write('250 2.0.0 queued\r\n');
          continue;
        }

        const lineEnd = buffer.indexOf('\r\n');
        if (lineEnd < 0) break;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const upper = line.toUpperCase();

        if (authStep === 'username') {
          authStep = 'password';
          socket.write('334 UGFzc3dvcmQ6\r\n');
        } else if (authStep === 'password') {
          authStep = '';
          socket.write(behavior === 'auth-reject' ? '535 5.7.8 authentication rejected\r\n' : '235 2.7.0 authenticated\r\n');
        } else if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-fake-smtp.local\r\n250 AUTH PLAIN LOGIN\r\n');
        } else if (upper.startsWith('AUTH PLAIN')) {
          socket.write(behavior === 'auth-reject' ? '535 5.7.8 authentication rejected\r\n' : '235 2.7.0 authenticated\r\n');
        } else if (upper === 'AUTH LOGIN') {
          authStep = 'username';
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (upper.startsWith('MAIL FROM:')) {
          socket.write('250 2.1.0 sender accepted\r\n');
        } else if (upper.startsWith('RCPT TO:')) {
          socket.write(behavior === 'recipient-reject' ? '550 5.1.1 recipient rejected\r\n' : '250 2.1.5 recipient accepted\r\n');
        } else if (upper === 'DATA') {
          dataMode = true;
          socket.write('354 end with <CRLF>.<CRLF>\r\n');
        } else if (upper === 'RSET' || upper === 'NOOP') {
          socket.write('250 2.0.0 ok\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 2.0.0 bye\r\n');
          socket.end();
        } else {
          socket.write('250 2.0.0 ok\r\n');
        }
      }
    });
  });

  return {
    messages,
    setBehavior(value) { behavior = value; },
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

test('reminder test mail succeeds or fails through loopback SMTP without exposing addresses or credentials', async (t) => {
  const server = createFakeSmtpServer();
  const port = await server.listen();
  t.after(() => server.close());

  const originalEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  };
  const output = [];
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    Object.assign(console, originalConsole);
  });
  console.log = (...args) => output.push(args.join(' '));
  console.warn = (...args) => output.push(args.join(' '));
  console.error = (...args) => output.push(args.join(' '));

  const unavailable = await sendWorkshopReminderHealthTest({
    companyId: 77,
    adminEmail: 'owner@example.test',
  });
  assert.deepEqual(unavailable, { channel: 'email', ok: false, status: 'unavailable' });

  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = 'smtp-test-user';
  process.env.SMTP_PASS = 'smtp-test-password';

  const sent = await sendWorkshopReminderHealthTest({
    companyId: 77,
    adminEmail: 'owner@example.test',
  });
  assert.deepEqual(sent, { channel: 'email', ok: true, status: 'sent' });
  assert.equal(server.messages.length, 1);
  const encodedText = server.messages[0].match(
    /Content-Type: text\/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n----_/,
  )?.[1];
  assert.ok(encodedText, 'SMTP message contains a plain-text test body');
  const decodedText = Buffer.from(encodedText.replace(/\s/g, ''), 'base64').toString('utf8');
  assert.match(decodedText, /رسالة اختبار من إعدادات ورشة الصيانة/);
  assert.doesNotMatch(decodedText, /customer|phone|عميل|010\d{8}/i);

  server.setBehavior('recipient-reject');
  const rejected = await sendWorkshopReminderHealthTest({
    companyId: 77,
    adminEmail: 'owner@example.test',
  });
  assert.deepEqual(rejected, { channel: 'email', ok: false, status: 'error' });
  assert.equal(server.messages.length, 1, 'a rejected SMTP recipient is not counted as sent');

  server.setBehavior('auth-reject');
  const invalidSmtp = await sendWorkshopReminderHealthTest({
    companyId: 77,
    adminEmail: 'owner@example.test',
  });
  assert.deepEqual(invalidSmtp, { channel: 'email', ok: false, status: 'error' });

  const logs = output.join('\n');
  assert.doesNotMatch(logs, /owner@example\.test|smtp-test-user|smtp-test-password/);
});
