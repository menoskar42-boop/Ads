// Encrypted store for each merchant's OWN payment-gateway credentials.
//
// These are not our secrets. A Paymob API key plus its HMAC secret is enough to
// take payments in that merchant's name and to forge the callbacks that mark
// their orders paid. They were stored as plaintext columns AND rendered back
// into the settings form's value="" — so they sat in the database, in the page
// source, in the browser's cache, and in any screen-share of that tab.
//
// The e-invoice credentials in src/einvoice/vault.js were already protected
// exactly this way. This is the same construction with its own salt, so the two
// stores cannot decrypt each other even under one key, and so payments can be
// re-keyed without touching tax credentials.
//
// Decrypted only at the moment a charge or a callback check needs it. Never
// logged. Never rendered in full.
'use strict';
const crypto = require('crypto');

function keyMaterial() {
  const src = process.env.PAYMENTS_SECRET_KEY || process.env.SESSION_SECRET || '';
  if (!src) return null;
  return crypto.scryptSync(src, 'oscardevs-payments-v1', 32);
}

/** False when no key is configured — callers must refuse to store rather than
 *  fall back to plaintext, which is the failure this module exists to end. */
function configured() { return !!keyMaterial(); }

function encrypt(plaintext) {
  const key = keyMaterial();
  if (!key) throw new Error('PAYMENTS_SECRET_KEY (or SESSION_SECRET) is not set');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(blob) {
  const key = keyMaterial();
  if (!key) throw new Error('PAYMENTS_SECRET_KEY (or SESSION_SECRET) is not set');
  const parts = String(blob || '').split(':');
  if (parts.length !== 3) throw new Error('stored credential is malformed');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'base64'));
  d.setAuthTag(Buffer.from(parts[1], 'base64'));
  return Buffer.concat([d.update(Buffer.from(parts[2], 'base64')), d.final()]).toString('utf8');
}

/**
 * Read a credential that may still be sitting in the old plaintext column.
 *
 * Rows written before this module existed have no `_enc` value, and refusing to
 * read them would break live merchants' checkouts on deploy. So: prefer the
 * encrypted column, fall back to the plaintext one, and let the caller re-save
 * to migrate. A decrypt failure returns null rather than throwing — a wrong key
 * must degrade to "gateway not configured", not to a 500 on every order.
 */
function read(encValue, legacyPlaintext) {
  if (encValue) {
    try { return decrypt(encValue); } catch (e) {
      console.error('[pay_vault] could not decrypt a stored credential:', e.message);
      return null;
    }
  }
  return legacyPlaintext || null;
}

/** Enough to recognise which credential is stored, never enough to use it. */
function hint(plaintext) {
  const s = String(plaintext || '');
  if (!s) return '';
  if (s.length <= 8) return '••••••••';
  return s.slice(0, 3) + '••••' + s.slice(-3);
}

module.exports = { encrypt, decrypt, configured, read, hint };
