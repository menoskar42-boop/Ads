'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertMyBibleCutoverSecrets,
  buildSharedMyBibleDatabaseUrl,
  isMyBibleMaintenanceMode,
  resolveMyBibleDatabaseUrl,
  sha256,
} = require('./mybible_database');

function validCutoverEnv() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const sessionSecret = 'existing-session-secret';
  const publicKey = ecdh.getPublicKey().toString('base64url');
  return {
    MYBIBLE_DATABASE_TARGET: 'ads-supabase',
    MYBIBLE_SESSION_SECRET: sessionSecret,
    MYBIBLE_SESSION_SECRET_SHA256: sha256(sessionSecret),
    MYBIBLE_VAPID_PUBLIC_KEY: publicKey,
    MYBIBLE_VAPID_PUBLIC_KEY_SHA256: sha256(publicKey),
    MYBIBLE_VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString('base64url'),
    MYBIBLE_VAPID_EMAIL: 'mailto:owner@example.com',
  };
}

test('keeps the existing MyBible database by default', () => {
  const source = 'postgresql://source.example/mybible';
  assert.equal(resolveMyBibleDatabaseUrl({ MYBIBLE_DATABASE_URL: source }), source);
});

test('uses the Supabase session pooler and isolated schema when selected', () => {
  const resolved = resolveMyBibleDatabaseUrl({
    MYBIBLE_DATABASE_TARGET: 'ads-supabase',
    ADS_DATABASE_URL: 'postgresql://user:pass@aws-0.pooler.supabase.com:6543/postgres',
  });
  const url = new URL(resolved);
  assert.equal(url.port, '5432');
  assert.equal(url.searchParams.get('sslmode'), 'require');
  assert.equal(url.searchParams.get('uselibpqcompat'), 'true');
  assert.equal(
    url.searchParams.get('options'),
    '-c search_path=mybible,pg_catalog -c timezone=Africa/Cairo'
  );
});

test('requires the shared database URL when the shared target is selected', () => {
  assert.throws(
    () => buildSharedMyBibleDatabaseUrl(''),
    /ADS_DATABASE_URL is required/
  );
});

test('recognizes explicit maintenance mode values', () => {
  assert.equal(isMyBibleMaintenanceMode({ MYBIBLE_MAINTENANCE_MODE: 'true' }), true);
  assert.equal(isMyBibleMaintenanceMode({ MYBIBLE_MAINTENANCE_MODE: '0' }), false);
});

test('blocks shared-database startup when identity secrets are missing', () => {
  assert.throws(
    () => assertMyBibleCutoverSecrets({
      MYBIBLE_DATABASE_TARGET: 'ads-supabase',
      MYBIBLE_SESSION_SECRET: 'session',
    }),
    /MYBIBLE_VAPID_PUBLIC_KEY/
  );
});

test('accepts shared-database startup only with all identity secrets', () => {
  assert.doesNotThrow(() => assertMyBibleCutoverSecrets(validCutoverEnv()));
});

test('blocks a changed non-empty session secret', () => {
  const env = validCutoverEnv();
  env.MYBIBLE_SESSION_SECRET = `${env.MYBIBLE_SESSION_SECRET}-rotated`;
  assert.throws(
    () => assertMyBibleCutoverSecrets(env),
    /MYBIBLE_SESSION_SECRET fingerprint changed/
  );
});

test('blocks a VAPID private key that does not match the preserved public key', () => {
  const env = validCutoverEnv();
  const different = crypto.createECDH('prime256v1');
  different.generateKeys();
  env.MYBIBLE_VAPID_PRIVATE_KEY = different.getPrivateKey().toString('base64url');
  assert.throws(
    () => assertMyBibleCutoverSecrets(env),
    /VAPID private\/public keys do not match/
  );
});