// Encrypted credentials for a workshop's own third-party accounts.
// Secrets are decrypted only for the outbound request and are never rendered
// back into an admin page or written to logs.
'use strict';

const crypto = require('crypto');

function keyMaterial() {
  const source = process.env.WORKSHOP_SECRET_KEY || process.env.SESSION_SECRET || '';
  return source ? crypto.scryptSync(source, 'oscardevs-workshop-v1', 32) : null;
}

function configured() {
  return Boolean(keyMaterial());
}

function encrypt(value) {
  const key = keyMaterial();
  if (!key) throw new Error('WORKSHOP_SECRET_KEY (or SESSION_SECRET) is not set');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

function decrypt(value) {
  const key = keyMaterial();
  if (!key) throw new Error('WORKSHOP_SECRET_KEY (or SESSION_SECRET) is not set');
  const parts = String(value || '').split(':');
  if (parts.length !== 3) throw new Error('stored workshop credential is malformed');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[1], 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[2], 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function read(encrypted, legacyPlaintext) {
  if (encrypted) {
    try { return decrypt(encrypted); } catch (e) {
      console.error('[workshop_vault] could not decrypt stored credential:', e.message);
      return null;
    }
  }
  return legacyPlaintext || null;
}

function hint(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 8) return '••••••••';
  return text.slice(0, 3) + '••••' + text.slice(-3);
}

module.exports = { configured, encrypt, decrypt, read, hint };