/* «خلّى القاعدة تنام» — المالك ٢٠٢٦-١٠-١٣ (فاتورة ريبليت كلها ساعات Compute).
 *
 * قاعدة Service Flow بتنام بعد ٥ دقايق من غير استعلامات، والفاتورة على كل ساعة هى صاحية فيها.
 * قبل كده كل طلب للسيرفر — حتى التحديث التلقائى كل دقيقة — كان بيعمل ٣ عمليات على القاعدة
 * قبل شغله نفسه: قراية الجلسة (sf_session) + إعادة حفظها (rolling) + قراية المستخدم.
 * هنا:
 *   • الجلسة بتتقرا من الذاكرة بعد أول مرة، وتمديدها بيتكتب فى القاعدة مرة كل ٦ ساعات بالكتير
 *     (عمرها أسبوع، فمفيش فرق للمستخدم). تسجيل الدخول/الخروج بيكتب فوراً زى الأول.
 *   • المستخدم (deserializeUser) من الذاكرة ١٥ دقيقة — وأى كتابة فى جدول users من العملية دى
 *     بتمسح الذاكرة فوراً (تعديل صلاحية/إيقاف/كلمة سر بيتطبّق على طول).
 *   • تنضيف الجلسات المنتهية مرة فى اليوم، وبس لما القاعدة صاحية أصلاً (مش مؤقّت كل ساعة بيصحّيها).
 */
import session from "express-session";
import type { Pool, PoolClient } from "pg";

/** آخر مرة اتبعت فيها استعلام للقاعدة (أى استعلام) — يعنى القاعدة صاحية دلوقتى. */
export let lastDbQueryAt = 0;
const USERS_WRITE = /\b(insert\s+into|update|delete\s+from)\s+"?users"?\b/i;

const userCache = new Map<number, { user: any; at: number }>();
export const USER_CACHE_MS = 15 * 60 * 1000;

function noteQuery(text: unknown): void {
  lastDbQueryAt = Date.now();
  if (typeof text === "string" && text.includes("users") && USERS_WRITE.test(text)) userCache.clear();
}

/** بيتنادى مرة على الـpool: كل استعلام (pool.query، withTx، drizzle) بيعدّى من هنا. */
export function watchPool(pool: Pool): void {
  pool.on("connect", (client: PoolClient) => {
    const orig = client.query.bind(client) as any;
    (client as any).query = (...args: any[]) => {
      const a = args[0];
      noteQuery(typeof a === "string" ? a : a?.text);
      return orig(...args);
    };
  });
}

/** deserializeUser من الذاكرة (١٥ دقيقة)، وإلا من القاعدة. */
export async function cachedUser<T>(id: number, load: (id: number) => Promise<T>): Promise<T> {
  const c = userCache.get(id);
  if (c && Date.now() - c.at < USER_CACHE_MS) return c.user;
  const user = await load(id);
  if (user) userCache.set(id, { user, at: Date.now() });
  else userCache.delete(id);
  return user;
}
export const forgetUsers = () => userCache.clear();

/** الجلسة: ذاكرة قدّام connect-pg-simple. */
export const SESSION_TOUCH_EVERY_MS = 6 * 60 * 60 * 1000;
export const SESSION_PRUNE_EVERY_MS = 24 * 60 * 60 * 1000;
const SESSION_CACHE_MAX = 5000;

export class QuietSessionStore extends session.Store {
  private cache = new Map<string, { json: string; touchedAt: number }>();
  private lastPrune = Date.now();
  constructor(private inner: any) { super(); }

  private remember(sid: string, sess: any, touchedAt = Date.now()) {
    if (this.cache.size >= SESSION_CACHE_MAX && !this.cache.has(sid)) {
      const first = this.cache.keys().next().value;
      if (first !== undefined) this.cache.delete(first);
    }
    this.cache.set(sid, { json: JSON.stringify(sess), touchedAt });
  }

  get(sid: string, cb: (err: any, sess?: session.SessionData | null) => void) {
    const c = this.cache.get(sid);
    if (c) {
      const sess = JSON.parse(c.json);
      const exp = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Infinity;
      if (exp > Date.now()) return cb(null, sess);
      this.cache.delete(sid);
    }
    this.inner.get(sid, (err: any, sess: any) => {
      if (!err && sess) this.remember(sid, sess);
      cb(err, sess);
    });
  }

  set(sid: string, sess: session.SessionData, cb?: (err?: any) => void) {
    this.inner.set(sid, sess, (err: any) => {
      if (!err) this.remember(sid, sess); else this.cache.delete(sid);
      cb?.(err);
    });
  }

  destroy(sid: string, cb?: (err?: any) => void) {
    this.cache.delete(sid);
    this.inner.destroy(sid, cb);
  }

  touch(sid: string, sess: session.SessionData, cb?: (err?: any) => void) {
    const c = this.cache.get(sid);
    if (c && Date.now() - c.touchedAt < SESSION_TOUCH_EVERY_MS) {
      this.remember(sid, sess, c.touchedAt);   // الكوكى الجديد فى الذاكرة بس
      return cb?.();
    }
    this.inner.touch(sid, sess, (err: any) => {
      if (!err) this.remember(sid, sess);
      cb?.(err);
    });
  }

  /** تنضيف الجلسات المنتهية: مرة فى اليوم، ولما القاعدة صاحية أصلاً (استعلام فى آخر ٣٠ ثانية). */
  maybePrune() {
    const now = Date.now();
    if (now - this.lastPrune < SESSION_PRUNE_EVERY_MS || now - lastDbQueryAt > 30_000) return;
    this.lastPrune = now;
    try { this.inner.pruneSessions?.(); } catch {}
  }
}
