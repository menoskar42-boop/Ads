// Persistent session store backed by Postgres (no extra dependency — uses the
// pg Pool already in the app). The default express-session MemoryStore keeps
// sessions in process memory, which is wiped on every cold start / instance
// recycle. On Replit Autoscale that means merchants get silently logged out and
// their POST saves redirect to /login (200 with nothing saved) — the exact
// intermittent "saves don't work / login drops across tabs" bug reported in QA.
// Storing sessions in the shared database makes them survive restarts + scaling.

module.exports = function createPgSessionStore(session, pool) {
  const Store = session.Store;

  class PgStore extends Store {
    constructor() {
      super();
      this.ready = pool.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          sid TEXT PRIMARY KEY,
          sess JSONB NOT NULL,
          expire TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions (expire);
      `).catch((e) => console.error('[session store] init error:', e.message));
      // Prune expired rows hourly (best-effort).
      this._timer = setInterval(() => {
        pool.query('DELETE FROM user_sessions WHERE expire < now()').catch(() => {});
      }, 60 * 60 * 1000);
      if (this._timer.unref) this._timer.unref();
    }

    _expireAt(sess) {
      const ms = (sess && sess.cookie && sess.cookie.expires)
        ? new Date(sess.cookie.expires).getTime()
        : Date.now() + (sess && sess.cookie && sess.cookie.originalMaxAge ? sess.cookie.originalMaxAge : 7 * 24 * 60 * 60 * 1000);
      return new Date(ms);
    }

    get(sid, cb) {
      pool.query('SELECT sess FROM user_sessions WHERE sid = $1 AND expire > now()', [sid])
        .then((r) => cb(null, r.rows.length ? r.rows[0].sess : null))
        .catch((e) => cb(e));
    }

    set(sid, sess, cb) {
      const expire = this._expireAt(sess);
      pool.query(
        `INSERT INTO user_sessions (sid, sess, expire) VALUES ($1, $2, $3)
         ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
        [sid, sess, expire]
      ).then(() => cb && cb(null)).catch((e) => cb && cb(e));
    }

    destroy(sid, cb) {
      pool.query('DELETE FROM user_sessions WHERE sid = $1', [sid])
        .then(() => cb && cb(null)).catch((e) => cb && cb(e));
    }

    touch(sid, sess, cb) {
      pool.query('UPDATE user_sessions SET expire = $2 WHERE sid = $1', [sid, this._expireAt(sess)])
        .then(() => cb && cb(null)).catch(() => cb && cb(null));
    }
  }

  return new PgStore();
};
