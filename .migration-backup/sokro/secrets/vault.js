'use strict';

// ── Encrypted Secrets Vault (AES-256-GCM) ────────────────────────────────────
// Stores third-party site credentials so actions can log in on the user's
// behalf. Plaintext is NEVER persisted and NEVER sent to the LLM — values are
// decrypted only at run-time, inside the action that needs them.
//
// The 32-byte key is derived (scrypt) from SOKRO_SECRET_KEY (preferred) or
// SESSION_SECRET. If neither is set, the vault is disabled and callers get a
// clear error instead of weak encryption.
const crypto = require('crypto');

function keyMaterial() {
  const src = process.env.SOKRO_SECRET_KEY || process.env.SESSION_SECRET || '';
  if (!src) return null;
  return crypto.scryptSync(src, 'sokro-vault-v1', 32);
}

function configured() { return !!keyMaterial(); }

function encrypt(plaintext) {
  const key = keyMaterial();
  if (!key) throw new Error('vault key not configured (set SOKRO_SECRET_KEY)');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(blob) {
  const key = keyMaterial();
  if (!key) throw new Error('vault key not configured (set SOKRO_SECRET_KEY)');
  const [ivB, tagB, dataB] = String(blob).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, configured };
