// One Postgres pool for the whole process.
//
// 81 files in this app each do `new Pool({ connectionString: DATABASE_URL })`.
// Each pool holds up to 10 connections, so the process can in theory open 800+
// against a server that allows ~100 — and in practice a normal crawl of the
// admin panels hit "sorry, too many clients already" and the hall dashboard
// returned 500. Nothing in a single file looks wrong, which is exactly why the
// bug survived every per-feature review: it only exists in the aggregate.
//
// Same medicine as the async-routes patch: fix it at the library boundary once,
// rather than editing 81 call sites and hoping the 82nd file copies the right
// pattern. After this patch, every `new Pool(...)` for the same connection
// string returns ONE shared pool with a bounded max, and the next copy-pasted
// file gets the fix automatically.
//
// Two deliberate behaviours:
//
//   - end() on the shared pool is a no-op. Several boot-time schema functions
//     tidily `await pool.end()` when they finish — correct for the throwaway
//     pools they thought they had, fatal for a pool the whole app shares. The
//     process owns this pool for its lifetime; exit closes the sockets.
//
//   - The pool carries an error listener. An idle client dropped by the server
//     (a restart, a network blip) otherwise surfaces as an uncaught 'error'
//     event, and with one shared pool that would take the process down.
'use strict';

module.exports = function applySharedPool(pg) {
  if (pg.Pool && pg.Pool.__shared) return pg.Pool;
  const RealPool = pg.Pool;
  const cache = new Map();

  function SharedPool(opts) {
    const key = String((opts && opts.connectionString) || process.env.DATABASE_URL || '');
    if (!cache.has(key)) {
      const pool = new RealPool(Object.assign({
        // Bounded for the whole process. 20 is generous for one node handling
        // web traffic, and safely under every managed-Postgres plan's ceiling.
        max: parseInt(process.env.PG_POOL_MAX, 10) || 20,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
      }, opts || {}));
      pool.end = async () => {};
      pool.on('error', (e) => console.error('[pg pool]', e.message));
      cache.set(key, pool);
    }
    return cache.get(key);
  }
  // `instanceof pg.Pool` keeps working for the shared instances.
  SharedPool.prototype = RealPool.prototype;
  SharedPool.__shared = true;
  SharedPool.__cache = cache;      // exposed for tests/diagnostics only

  pg.Pool = SharedPool;
  return SharedPool;
};
