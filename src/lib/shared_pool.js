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
        /* عشر دقايق مش نص دقيقة.
         *
         * القاعدة بقت على سوبابيز، وفتح اتصال جديد بيكلّف ~٨٠٠ مللي
         * (مصافحة TLS + مصادقة على مسافة قارة) مقابل ~١٠٥ للاستعلام على
         * اتصال مفتوح. وبـ٣٠ ثانية، أي هدوء نص دقيقة بيرمي الاتصالات
         * فأول زائر بعده بيدفع الثمن ده. `keepAlive` بيمنع أي وسيط في
         * النص من قفل السوكيت وهو ساكت. */
        idleTimeoutMillis: 10 * 60 * 1000,
        keepAlive: true,
      }, opts || {}));
      pool.end = async () => {};
      pool.on('error', (e) => console.error('[pg pool]', e.message));

      /* توقيت القاهرة على **كل** اتصال جديد.
       *
       * `server.js` بيحقن `options=-c timezone=Africa/Cairo` في رابط
       * الاتصال. ده بيشتغل على اتصال بوستجرس مباشر — وبيترمي بصمت على
       * pooler زي بتاع Supabase، لأن الـpooler مابيمرّرش بارامترات بدء
       * الاتصال. اتقاس بعد النقل يوم ٢٠٢٦-٠٩-١٧: `SHOW timezone` رجّعت
       * **GMT**.
       *
       * والنتيجة مش خطأ — النتيجة أرقام غلط بهدوء. `CURRENT_DATE`
       * و`timestamptz::date` و`date_trunc('month', …)` كلهم بيجاوبوا
       * بتوقيت الجلسة، فبين نص الليل والتانية صباحاً بتوقيت القاهرة
       * القاعدة لسه شايفة إمبارح: اشتراك بيخلص النهاردة بيتقرا بكره،
       * وحضور الساعة واحدة بالليل بيتسجّل على اليوم اللي فات، وبيعة أول
       * ساعتين في الشهر بتتحسب على الشهر اللي قبله.
       *
       * الحدث `connect` بيجري مرة على كل عميل جديد في البول، فالضبط
       * بيحصل هنا **مرة واحدة لكل العملية** — نفس منطق الملف ده: نصلّح
       * عند الحدود مرة، بدل ما نعدّل تسعة وسبعين ملف ونستنى الملف
       * التمانين يفتكر.
       *
       * ⚠️ ولسه الأفضل تضبطه على القاعدة نفسها كمان
       * (`ALTER DATABASE … SET timezone`) — ساعتها حتى الاتصالات اللي
       * مابتعدّيش من هنا بتاخده. الاتنين مع بعض حزام وحمّالة. */
      /* ⚠️ **ده بيطلّع DeprecationWarning على pg 8 وهيقع على pg 9.**
       *
       *   Calling client.query() when the client is already executing a
       *   query is deprecated and will be removed in pg@9.0
       *
       * السبب إن `pg-pool` بيطلق `connect` جوّه `_acquireClient` قبل ما
       * يسلّم العميل للاستعلام المنتظر، فالـ`SET` والاستعلام بيتحطّوا في
       * طابور العميل مع بعض. الترتيب مضمون النهاردة (الطابور FIFO
       * فالـ`SET` بتسبق، ومقيس على القاعدة الحيّة: `SHOW timezone` رجّعت
       * `Africa/Cairo`) — بس التداخل ده هو اللي pg 9 هيشيله.
       *
       * 🔴 **لو حد رقّى `pg` للإصدار ٩، لازم يتغيّر المكان ده.** والباج لو
       * رجع مش هيرمي خطأ — هيرجّع تواريخ غلطانة بساعتين في صمت. الحماية
       * التانية هي إعداد القاعدة نفسها:
       *
       *     ALTER DATABASE postgres SET timezone TO 'Africa/Cairo';
       *
       * واتنفّذ فعلاً على Supabase يوم ٢٠٢٦-٠٩-١٧. الاتنين مع بعض معناه
       * إن سقوط واحد منهم مايسيبش الموقع بتوقيت UTC. */
      pool.on('connect', (client) => {
        client.query("SET TIME ZONE 'Africa/Cairo'").catch((e) => {
          console.error('[pg pool] تعذّر ضبط توقيت القاهرة:', e.message);
        });
      });
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
