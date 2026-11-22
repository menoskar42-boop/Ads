// Encrypted store for each merchant's Egyptian Tax Authority credentials.
//
// These are not our secrets. They are a taxpayer's own API credentials, and
// whoever holds them can submit documents to the tax authority in that
// taxpayer's name. So: encrypted at rest with AES-256-GCM, decrypted only in
// the moment a submission is made, never logged, and never rendered back to a
// screen in full.
//
// Same construction as sokro/secrets/vault.js, with its own salt so the two
// stores cannot decrypt each other even under one key.
'use strict';
const crypto = require('crypto');

function keyMaterial() {
  const src = process.env.EINVOICE_SECRET_KEY || process.env.SESSION_SECRET || '';
  if (!src) return null;
  return crypto.scryptSync(src, 'oscardevs-einvoice-v1', 32);
}

/** False when no key is configured — callers must refuse to store, not fall
 *  back to plaintext. */
function configured() { return !!keyMaterial(); }

function encrypt(plaintext) {
  const key = keyMaterial();
  if (!key) throw new Error('EINVOICE_SECRET_KEY (or SESSION_SECRET) is not set');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(blob) {
  const key = keyMaterial();
  if (!key) throw new Error('EINVOICE_SECRET_KEY (or SESSION_SECRET) is not set');
  const parts = String(blob || '').split(':');
  if (parts.length !== 3) throw new Error('stored credential is malformed');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'base64'));
  d.setAuthTag(Buffer.from(parts[1], 'base64'));
  return Buffer.concat([d.update(Buffer.from(parts[2], 'base64')), d.final()]).toString('utf8');
}

/**
 * What a screen is allowed to show: enough to recognise which credential is
 * stored, never enough to use it. Short values are masked completely rather
 * than partly revealed.
 */
function hint(plaintext) {
  const s = String(plaintext || '');
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 3) + '••••' + s.slice(-3);
}

module.exports = { encrypt, decrypt, configured, hint };
