/**
 * قراية الجلسة من الذاكرة — بدل استعلام على Supabase مع كل طلب.
 *
 * `express-session` بيقرا صف الجلسة من القاعدة مع **كل** طلب لعضو عنده كوكي
 * (الصفحة والـJS والصور والـAPI)، وفي آخر الطلب بيعمل touch (UPDATE). كل ده
 * بيتحسب من حصة Supabase المجانية، والجلسة نفسها بتتغيّر نادراً جداً.
 *
 * هنا:
 *   - `get` من الذاكرة لمدة `ttlMs` (العملية واحدة، فمفيش حد تاني بيغيّرها).
 *   - `set` / `destroy` بيكتبوا في القاعدة زي الأول **وبيحدّثوا الذاكرة**.
 *   - `touch` مرة كل `touchEveryMs` للجلسة الواحدة بدل كل طلب — عمر الكوكي سنة،
 *     فتأخير تجديد الانتهاء كام ساعة مالوش أي أثر.
 *
 * 🔴 هوية العضو: مفيش حاجة هنا بتغيّر الكوكي ولا رقم الجلسة ولا محتواها — نفس
 * البيانات اللي في القاعدة بالظبط، بس من غير ما تتقري كل مرة.
 */
import type session from "express-session";

type Store = session.Store;

export function cacheSessionReads<S extends Store>(
  store: S,
  { ttlMs = 10 * 60_000, touchEveryMs = 6 * 60 * 60_000, max = 5000 } = {},
): S {
  const cache = new Map<string, { at: number; json: string | null }>();
  const touched = new Map<string, number>();

  const put = (sid: string, sess: unknown) => {
    cache.delete(sid);
    cache.set(sid, { at: Date.now(), json: sess ? JSON.stringify(sess) : null });
    while (cache.size > max) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  };

  const get = store.get.bind(store);
  store.get = (sid, cb) => {
    const hit = cache.get(sid);
    if (hit && Date.now() - hit.at < ttlMs) {
      // نسخة جديدة كل مرة — express-session بيعدّل الكائن اللي بياخده
      return cb(null, hit.json ? JSON.parse(hit.json) : null);
    }
    get(sid, (err: any, sess?: session.SessionData | null) => {
      if (!err) put(sid, sess ?? null);
      cb(err, sess);
    });
  };

  const set = store.set.bind(store);
  store.set = (sid, sess, cb) => {
    set(sid, sess, (err?: any) => {
      if (err) cache.delete(sid);
      else put(sid, sess);
      cb?.(err);
    });
  };

  const destroy = store.destroy.bind(store);
  store.destroy = (sid, cb) => {
    cache.delete(sid);
    touched.delete(sid);
    destroy(sid, cb);
  };

  if (store.touch) {
    const touch = store.touch.bind(store);
    store.touch = (sid, sess, cb) => {
      const last = touched.get(sid) || 0;
      if (Date.now() - last < touchEveryMs) return cb?.();
      touched.set(sid, Date.now());
      if (touched.size > max) touched.delete(touched.keys().next().value as string);
      touch(sid, sess, (err?: any) => {
        if (err) touched.delete(sid);
        (cb as ((err?: any) => void) | undefined)?.(err);
      });
    };
  }

  return store;
}
