'use strict';

const { randomUUID } = require('crypto');

const MAX_CONTACTS = 500;
const MAX_CONTACT_RECORDS = 1000;
const MAX_PHONES = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ContactInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContactInputError';
    this.status = 400;
  }
}

function normalizePhone(value) {
  const ascii = String(value || '').replace(/[٠-٩۰-۹]/g, (digit) =>
    String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹".indexOf(digit) % 10));
  return ascii.replace(/[^\d+]/g, '').replace(/^00/, '+');
}

function identityKey(contact) {
  const name = String(contact.name || '').normalize('NFKC').trim().toLocaleLowerCase();
  const firstPhone = normalizePhone((contact.tels || [])[0]);
  return name && firstPhone ? `${name}|${firstPhone}` : '';
}

function cleanContact(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ContactInputError('invalid contact');
  const id = String(raw.id || '').trim();
  if (!UUID_RE.test(id)) throw new ContactInputError('invalid contact id');

  const name = String(raw.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);
  if (!name) throw new ContactInputError('contact name is required');

  const values = Array.isArray(raw.tels) ? raw.tels : (Array.isArray(raw.phones) ? raw.phones : [raw.phone]);
  const tels = [...new Set(values.map((value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 30))
    .filter((value) => normalizePhone(value).length >= 3))].slice(0, MAX_PHONES);
  if (!tels.length) throw new ContactInputError('contact phone is required');

  const parsedUpdatedMs = Number(raw.updatedMs);
  const updatedMs = Number.isFinite(parsedUpdatedMs) && parsedUpdatedMs > 0
    ? Math.min(Math.floor(parsedUpdatedMs), now + 5 * 60 * 1000)
    : now;
  return { id, name, tels, updatedMs, deleted: raw.deleted === true };
}

function cleanContacts(raw, now = Date.now()) {
  if (!Array.isArray(raw) || raw.length > MAX_CONTACT_RECORDS) throw new ContactInputError('invalid contacts list');
  return raw.map((item) => cleanContact(item, now));
}

function mergeContacts(existingRaw, incomingRaw, now = Date.now()) {
  const existing = Array.isArray(existingRaw)
    ? existingRaw.map((item) => {
      try { return cleanContact(item, now); } catch (_) { return null; }
    }).filter(Boolean)
    : [];
  const incoming = cleanContacts(incomingRaw, now);
  const byId = new Map(existing.map((item) => [item.id, item]));
  const byIdentity = new Map();
  for (const item of existing) {
    const key = !item.deleted ? identityKey(item) : '';
    if (key && !byIdentity.has(key)) byIdentity.set(key, item);
  }

  const idMap = {};
  for (const next of incoming) {
    const current = byId.get(next.id);
    if (current) {
      if (next.deleted) {
        if (!current.deleted && next.updatedMs >= current.updatedMs) {
          current.deleted = true;
          current.updatedMs = next.updatedMs;
        }
      } else if (!current.deleted && next.updatedMs >= current.updatedMs) {
        current.name = next.name;
        current.tels = next.tels;
        current.updatedMs = next.updatedMs;
      }
      idMap[next.id] = current.id;
      continue;
    }

    const match = !next.deleted ? byIdentity.get(identityKey(next)) : null;
    if (match) {
      match.tels = [...new Set([...match.tels, ...next.tels])].slice(0, MAX_PHONES);
      match.updatedMs = Math.max(match.updatedMs, next.updatedMs);
      idMap[next.id] = match.id;
      continue;
    }
    const added = { ...next };
    byId.set(added.id, added);
    const key = !added.deleted ? identityKey(added) : '';
    if (key && !byIdentity.has(key)) byIdentity.set(key, added);
    idMap[added.id] = added.id;
  }

  const items = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (items.filter((item) => !item.deleted).length > MAX_CONTACTS || items.length > MAX_CONTACTS * 2) {
    throw new ContactInputError('contacts limit exceeded');
  }
  return { items, idMap };
}

module.exports = { MAX_CONTACTS, MAX_CONTACT_RECORDS, ContactInputError, cleanContact, cleanContacts, mergeContacts, identityKey, normalizePhone, randomUUID };
