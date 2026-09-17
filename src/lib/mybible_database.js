'use strict';

const crypto = require('crypto');

const SHARED_ADS_TARGET = 'ads-supabase';
const SHARED_MYBIBLE_SCHEMA = 'mybible';
const REQUIRED_CUTOVER_SECRETS = [
  'MYBIBLE_SESSION_SECRET',
  'MYBIBLE_VAPID_PUBLIC_KEY',
  'MYBIBLE_VAPID_PRIVATE_KEY',
  'MYBIBLE_VAPID_EMAIL',
];
const REQUIRED_CUTOVER_FINGERPRINTS = [
  'MYBIBLE_SESSION_SECRET_SHA256',
  'MYBIBLE_VAPID_PUBLIC_KEY_SHA256',
];

function envFlag(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

function isMyBibleMaintenanceMode(env = process.env) {
  return envFlag(env.MYBIBLE_MAINTENANCE_MODE);
}

function isSharedAdsTarget(env = process.env) {
  return String(env.MYBIBLE_DATABASE_TARGET || '').trim() === SHARED_ADS_TARGET;
}

function assertMyBibleCutoverSecrets(env = process.env) {
  if (!isSharedAdsTarget(env)) return;
  const missing = REQUIRED_CUTOVER_SECRETS.filter(
    (key) => !String(env[key] || '').trim()
  );
  const missingFingerprints = REQUIRED_CUTOVER_FINGERPRINTS.filter(
    (key) => !/^[a-f0-9]{64}$/i.test(String(env[key] || '').trim())
  );
  if (missing.length) {
    throw new Error(
      `MyBible Supabase cutover blocked: missing ${missing.join(', ')}`
    );
  }
  if (missingFingerprints.length) {
    throw new Error(
      `MyBible Supabase cutover blocked: missing valid ${missingFingerprints.join(', ')}`
    );
  }

  assertFingerprint(
    'MYBIBLE_SESSION_SECRET',
    env.MYBIBLE_SESSION_SECRET,
    env.MYBIBLE_SESSION_SECRET_SHA256
  );
  assertFingerprint(
    'MYBIBLE_VAPID_PUBLIC_KEY',
    env.MYBIBLE_VAPID_PUBLIC_KEY,
    env.MYBIBLE_VAPID_PUBLIC_KEY_SHA256
  );
  assertVapidKeyPair(
    env.MYBIBLE_VAPID_PRIVATE_KEY,
    env.MYBIBLE_VAPID_PUBLIC_KEY
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function assertFingerprint(label, value, expected) {
  const actualBuffer = Buffer.from(sha256(value), 'hex');
  const expectedBuffer = Buffer.from(String(expected), 'hex');
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error(`MyBible Supabase cutover blocked: ${label} fingerprint changed`);
  }
}

function assertVapidKeyPair(privateKey, publicKey) {
  try {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(String(privateKey), 'base64url'));
    const derived = ecdh.getPublicKey();
    const configured = Buffer.from(String(publicKey), 'base64url');
    if (
      derived.length !== configured.length ||
      !crypto.timingSafeEqual(derived, configured)
    ) {
      throw new Error('key mismatch');
    }
  } catch (_error) {
    throw new Error(
      'MyBible Supabase cutover blocked: VAPID private/public keys do not match'
    );
  }
}

function buildSharedMyBibleDatabaseUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    throw new Error(
      'ADS_DATABASE_URL is required when MYBIBLE_DATABASE_TARGET=ads-supabase'
    );
  }

  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('ADS_DATABASE_URL must be a PostgreSQL URI');
  }

  // MyBible keeps long-lived pools and session storage. Supabase's session
  // pooler (5432) is the correct endpoint; the transaction pooler (6543) is not.
  if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543') {
    url.port = '5432';
  }

  url.searchParams.set('sslmode', 'require');
  url.searchParams.set('uselibpqcompat', 'true');
  url.searchParams.set(
    'options',
    `-c search_path=${SHARED_MYBIBLE_SCHEMA},pg_catalog -c timezone=Africa/Cairo`
  );
  return url.toString();
}

function resolveMyBibleDatabaseUrl(env = process.env) {
  if (isSharedAdsTarget(env)) {
    return buildSharedMyBibleDatabaseUrl(env.ADS_DATABASE_URL);
  }
  return String(env.MYBIBLE_DATABASE_URL || '').trim();
}

module.exports = {
  SHARED_ADS_TARGET,
  SHARED_MYBIBLE_SCHEMA,
  assertMyBibleCutoverSecrets,
  buildSharedMyBibleDatabaseUrl,
  envFlag,
  isSharedAdsTarget,
  isMyBibleMaintenanceMode,
  resolveMyBibleDatabaseUrl,
  sha256,
};