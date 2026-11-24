(function (root) {
  'use strict';

  function indexedDbStore() {
    let dbPromise;
    function open() {
      if (!root.indexedDB) throw new Error('IndexedDB unavailable');
      if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
          const request = root.indexedDB.open('od_shot_queue', 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'uuid' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
          request.onblocked = () => reject(new Error('IndexedDB open blocked'));
        });
      }
      return dbPromise;
    }
    async function transact(mode, run) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('items', mode);
        let result;
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        try { run(tx.objectStore('items'), (value) => { result = value; }); }
        catch (e) { reject(e); }
      });
    }
    return {
      open,
      get: (uuid) => transact('readonly', (store, set) => {
        const request = store.get(uuid); request.onsuccess = () => set(request.result || null);
      }),
      list: () => transact('readonly', (store, set) => {
        const request = store.getAll(); request.onsuccess = () => set(request.result || []);
      }),
      put: (item) => transact('readwrite', (store) => { store.put(item); }),
      remove: (uuid) => transact('readwrite', (store) => { store.delete(uuid); }),
    };
  }

  function canUpload(conn, policy) {
    if (policy === 'any') return true;
    if (policy !== 'wifi' || !conn || !conn.type) return false;
    return conn.type === 'wifi' || conn.type === 'ethernet';
  }

  function createQueue(store) {
    if (!store) throw new Error('A queue store is required');
    async function open() {
      if (typeof store.open !== 'function') throw new Error('Queue store cannot open');
      return store.open();
    }
    async function sortedItems() {
      await open();
      const items = await store.list();
      return items.slice().sort((a, b) => Number(a.addedAt) - Number(b.addedAt));
    }
    return {
      open,
      async add(item) {
        if (!item || typeof item.uuid !== 'string' || !item.uuid) throw new Error('A shot uuid is required');
        await open();
        if (await store.get(item.uuid)) return { dropped: 0 };
        await store.put(item);
        const items = await sortedItems();
        const droppedItems = items.slice(0, Math.max(0, items.length - 200));
        for (const old of droppedItems) await store.remove(old.uuid);
        return { dropped: droppedItems.length };
      },
      async count() { return (await sortedItems()).length; },
      async list(limit) {
        const items = await sortedItems();
        return limit == null ? items : items.slice(0, Math.max(0, Number(limit) || 0));
      },
      async remove(uuid) { await open(); return store.remove(uuid); },
      async purgeOlderThan(ageMs) {
        const age = Number(ageMs);
        if (!Number.isFinite(age) || age < 0) throw new Error('Invalid queue retention age');
        const cutoff = Date.now() - age;
        const old = (await sortedItems()).filter((item) => Number(item.addedAt) < cutoff);
        for (const item of old) await store.remove(item.uuid);
        return old.length;
      },
      canUpload,
    };
  }

  const queue = createQueue(indexedDbStore());
  queue.createQueue = createQueue;
  queue.canUpload = canUpload;
  if (typeof module !== 'undefined' && module.exports) module.exports = queue;
  if (root && typeof root === 'object') root.OscarShotQueue = queue;
})(typeof window !== 'undefined' ? window : globalThis);
