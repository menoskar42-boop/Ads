'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const Contacts = require('../src/drive/contacts');
const store = require('../src/drive/store');

const idA = '11111111-1111-4111-8111-111111111111';
const idB = '22222222-2222-4222-8222-222222222222';
const contact = (id, extra = {}) => ({
  id, name: 'Mother Mobile', tels: ['+20 100 111 2222'], updatedMs: 1000, ...extra,
});

test('contact validation accepts only bounded names and phone numbers', () => {
  assert.equal(Contacts.cleanContact(contact(idA)).name, 'Mother Mobile');
  assert.equal(Contacts.normalizePhone('٠١٠ ١١١ ٢٢٢٢'), '0101112222');
  assert.throws(() => Contacts.cleanContact({ ...contact(idA), name: '  ' }), { status: 400 });
  assert.throws(() => Contacts.cleanContact({ ...contact(idA), tels: [] }), { status: 400 });
  assert.throws(() => Contacts.cleanContact({ ...contact('not-an-id') }), { status: 400 });
  assert.equal(Contacts.cleanContacts(Array(20000).fill(contact(idA))).length, 20000);
  assert.throws(() => Contacts.cleanContacts(Array(40001).fill(contact(idA))), { status: 400 });
});

test('contact sync accepts up to 20,000 active contacts and caps older tombstones', () => {
  assert.equal(Contacts.MAX_CONTACTS, 20000);
  assert.equal(Contacts.MAX_CONTACT_RECORDS, 40000);
  const items = Array.from({ length: Contacts.MAX_CONTACTS }, (_, index) => contact(
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    { name: `Contact ${index + 1}` },
  ));
  assert.equal(Contacts.mergeContacts([], items).items.length, 20000);
  assert.throws(
    () => Contacts.mergeContacts([], [...items, contact('00000000-0000-4000-8000-000000020001', { name: 'Overflow' })]),
    { status: 400 },
  );
});

test('sync merges duplicate imports and maps them to one stable contact id', () => {
  const merged = Contacts.mergeContacts([contact(idA)], [
    contact(idB, { tels: ['+20 100 111 2222', '+20 122 333 4444'], updatedMs: 2000 }),
  ], 3000);
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].id, idA);
  assert.deepEqual(merged.items[0].tels, ['+20 100 111 2222', '+20 122 333 4444']);
  assert.equal(merged.idMap[idB], idA);
});

test('a tombstone is not resurrected by a stale copy from another device', () => {
  const deleted = contact(idA, { updatedMs: 3000, deleted: true });
  const merged = Contacts.mergeContacts([deleted], [contact(idA, { updatedMs: 2000 })], 4000);
  assert.equal(merged.items.length, 1);
  assert.equal(merged.items[0].deleted, true);
});

test('server contact lists are isolated by the authenticated car id', async () => {
  const cars = new Map([
    [1, { contacts: [], contacts_sync_enabled: false }],
    [2, { contacts: [], contacts_sync_enabled: false }],
  ]);
  const pool = {
    async connect() {
      return {
        async query(sql, params = []) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.startsWith('SELECT contacts, contacts_sync_enabled')) {
            const row = cars.get(params[0]);
            return { rows: row ? [{ ...row }] : [] };
          }
          if (sql.startsWith('UPDATE od_cars SET contacts = $2::jsonb, contacts_sync_enabled = true')) {
            cars.get(params[0]).contacts = JSON.parse(params[1]);
            cars.get(params[0]).contacts_sync_enabled = true;
            return { rows: [] };
          }
          if (sql.startsWith('UPDATE od_cars SET contacts_sync_enabled = false')) {
            cars.get(params[0]).contacts = [];
            cars.get(params[0]).contacts_sync_enabled = false;
            return { rows: [] };
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
        release() {},
      };
    },
  };

  await store.syncContacts(pool, 1, { enable: true, items: [contact(idA)] });
  const otherCar = await store.syncContacts(pool, 2, { items: [contact(idB)] });
  assert.deepEqual(otherCar, { enabled: false, items: [], idMap: {} });
  assert.equal(cars.get(2).contacts.length, 0);
  await assert.rejects(store.syncContacts(pool, 1, { carId: 2 }), { status: 400 });
});

test('revoking contact sync clears the server copy without affecting another car', async () => {
  const cars = new Map([
    [1, { contacts: [contact(idA)], contacts_sync_enabled: true }],
    [2, { contacts: [], contacts_sync_enabled: false }],
  ]);
  const pool = {
    async connect() {
      return {
        async query(sql, params = []) {
          if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
          if (sql.startsWith('SELECT contacts, contacts_sync_enabled')) return { rows: [{ ...cars.get(params[0]) }] };
          if (sql.startsWith('UPDATE od_cars SET contacts_sync_enabled = false')) {
            cars.get(params[0]).contacts = [];
            cars.get(params[0]).contacts_sync_enabled = false;
            return { rows: [] };
          }
          throw new Error(`Unexpected query: ${sql}`);
        },
        release() {},
      };
    },
  };

  assert.deepEqual(await store.syncContacts(pool, 1, { disable: true }), { enabled: false, items: [], idMap: {} });
  assert.equal(cars.get(1).contacts.length, 0);
  assert.equal(cars.get(2).contacts_sync_enabled, false);
});
