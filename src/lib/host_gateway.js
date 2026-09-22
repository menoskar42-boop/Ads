// Host gateway ("البوّاب") — reverse-proxies a co-hosted app's subdomain to that
// app running as its OWN process on the same machine (an internal port). This
// lets one deployment (the Reserved VM) host several apps while each stays a
// fully separate, byte-for-byte unchanged process. Co-hosting mybille this way
// changes NOTHING about how it runs — same code, same database, same sessions —
// so its members feel no difference; OscarDevs just forwards the traffic.
//
// It follows the exact pattern already used in server.js for mykid/adhd:
// intercept the request BEFORE any OscarDevs middleware, so a co-hosted host is
// handled entirely by its own app and never touches OscarDevs' session/tenant/
// AdSense pipeline.
//
// DISABLED by default: the routes come from env vars, so with none set the
// gateway is a no-op and OscarDevs behaves exactly as before. Enable per host:
//   MYBIBLE_UPSTREAM=http://127.0.0.1:5001         (production mybible.*)
//   MYBIBLE2_UPSTREAM=http://127.0.0.1:5002         (optional staging mybible2.*)
//   DEALS_UPSTREAM=http://127.0.0.1:5002            (deals.oscardevs.com)
'use strict';
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { isMyBibleMaintenanceMode } = require('./mybible_database');
const { getCoHostStatus, describeCoHostStatus } = require('./cohost_status');

// Map public hostname -> upstream base URL (internal, same VM). Empty ⇒ disabled.
/** يقسّم قيمة نطاقات مفصولة بفواصل لقائمة نظيفة (متشالة المسافات وبحروف صغيرة). */
function parseHosts(value) {
  return String(value || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}

/* ── باب المسار: oscardevs.com/serviceflow ──────────────────────────────────
 *
 * ليه موجود: كل **نطاق فرعى** على oscardevs.com بيعدّى على Cloudflare Worker
 * وبياكل من كوتته — والكوتة مشتركة مع متاجر العملاء (وقعت فعلاً فى
 * ٢٠٢٦-٠٩-١٩ بـError 1027). أما الأبكس `oscardevs.com` فمستثنى من الـWorker
 * صراحةً وبيروح لريبليت مباشرة، فأى مسار تحته **بيكلّف صفر**.
 *
 * إزاى بيشتغل: التطبيق بيتبنى وكل ملفاته تحت المسار ده (SF_BASE_PATH فى
 * vite.config)، والبوّاب بيشيل المسار قبل ما يمرّر الطلب — فالسيرفر بتاع
 * Service Flow بيشوف `/` و`/api/x` زى ما هو متعوّد، من غير أى تعديل فيه.
 *
 * ⚠️ المسار هنا لازم يطابق SF_BASE_PATH اللى اتبنى بيه، وإلا الصفحة هتطلب
 *    ملفاتها من مكان البوّاب مش فاهمه. الحارس check-serviceflow-path بيمنع ده.
 */
/* مفتاح ثابت لحالة Service Flow، مستقل عن أى نطاق. باب المسار بيشتغل على
 * أى نطاق، فمحتاج مكان يلاقى فيه السبب حتى لو النطاق ده مالوش حالة مسجّلة. */
const SERVICEFLOW_STATUS_KEY = 'serviceflow';

function serviceFlowPathPrefix() {
  const raw = String(process.env.SF_BASE_PATH || '/serviceflow');
  const p = '/' + raw.replace(/^\/+|\/+$/g, '');
  return p === '/' ? '' : p;
}

/** المسار تحت البادئة؟ الحدّ لازم يكون على حدود مقطع — «/serviceflowX» مش منها. */
function underPrefix(url, prefix) {
  if (!prefix) return false;
  const path = String(url || '').split('?')[0];
  return path === prefix || path.startsWith(prefix + '/');
}

/** يشيل البادئة ويسيب الباقى مسار سليم (والـquery زى ما هى). */
function stripPrefix(url, prefix) {
  const q = String(url).indexOf('?');
  const path = q === -1 ? String(url) : String(url).slice(0, q);
  const search = q === -1 ? '' : String(url).slice(q);
  const rest = path.slice(prefix.length);
  return (rest.startsWith('/') ? rest : '/' + rest) + search;
}

/** يضيف بادئة لمسار مع الحفاظ على query string. */
function addPrefix(url, prefix) {
  const value = String(url || '/');
  const q = value.indexOf('?');
  const path = q === -1 ? value : value.slice(0, q);
  const search = q === -1 ? '' : value.slice(q);
  return prefix + (path.startsWith('/') ? path : '/' + path) + search;
}

function loadRoutes() {
  const routes = {};
  const mb = process.env.MYBIBLE_UPSTREAM;
  if (mb) {
    routes['mybible.oscardevs.com'] = mb;
    // Staging host for testing the cutover before the real one. Defaults to the
    // same upstream unless a separate staging process is given.
    routes['mybible2.oscardevs.com'] = process.env.MYBIBLE2_UPSTREAM || mb;
  }
  const deals = process.env.DEALS_UPSTREAM;
  if (deals) routes['deals.oscardevs.com'] = deals;

  /* Service Flow — أداة تشغيل داخلية (سنترال الغنايم، الشركة المصرية
   * للاتصالات). مستضافة بنفس نمط mybible، بس **الدومين بتاعها متغيّر
   * بيئة** مش مكتوب هنا: المالك بيشغّلها على نطاق فرعي هو اللي بيختاره،
   * وأثناء فترة التجربة النشر القديم على ريبليت بيفضل شغّال على نطاقه
   * الأصلي — فالاتنين موجودين مع بعض لحد ما يتأكد. */
  /* والدومين ممكن يبقى **أكتر من واحد**، مفصولين بفاصلة.
   *
   * السبب مش رفاهية: كل سَبدومين على oscardevs.com بيعدّى على Cloudflare
   * Worker، وكل طلب بياكل من كوتة الـWorker — وService Flow أداة تشغيل
   * بتنادى السيرفر كل ثوانى، فتاب واحد منها قدر يوصل الكوتة اليومية لحدّها
   * ويوقّع **كل** السَبدومينات ومنها متاجر العملاء (Error 1027، ٢٠٢٦-٠٩-١٩).
   *
   * ولينك ريبليت (`*.replit.app`) بيروح للنشر مباشرة — ما بيعدّيش على
   * Cloudflare أصلاً. فإضافته هنا بتدّى باب تانى للأداة بصفر طلب على
   * الـWorker، وبيفضل شغّال كمان لو Cloudflare وقعت أو عدّت حدّ الخطة.
   *
   * ⚠️ الهوست اللى بتحطه هنا بيروح لـService Flow **وخلاص** — أوسكار ديفز
   * مابقاش بيرد عليه. فمتحطّش هوست إنت محتاجه للموقع الأساسى. */
  const sf = process.env.SERVICEFLOW_UPSTREAM;
  const sfHosts = parseHosts(process.env.SERVICEFLOW_HOST);
  if (sf) for (const h of sfHosts) routes[h] = sf;
  return routes;
}

// Stream one request through to the upstream app untouched, and pipe the reply
// back. `publicHost` is forwarded as the Host header so the upstream app sees
// its real public domain (keeps its session cookie bound to mybible.*).
// ٣٠ ثانية: أطول من أي صفحة معقولة، وأقصر بكتير من «للأبد».
const UPSTREAM_TIMEOUT_MS = 30000;
// Keep the local child-app connection warm. Without an Agent, every public
// request creates a new loopback TCP connection between the gateway and
// MyBible, adding avoidable work when many users open the app together.
const upstreamHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 128,
  maxFreeSockets: 32,
  timeout: UPSTREAM_TIMEOUT_MS + 5000,
});
const upstreamHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 128,
  maxFreeSockets: 32,
  timeout: UPSTREAM_TIMEOUT_MS + 5000,
});

/* statusHost: مفتاح حالة التطبيق لو مختلف عن النطاق العام.
 * باب المسار بيشتغل على **أى** نطاق (ads-*.replit.app مثلاً)، والحالة
 * مسجّلة بأسم التطبيق مش بالنطاق ده — فمن غير المفتاح ده صفحة الوقوع
 * بترجع للرسالة العامة وتفقد السبب بالظبط فى المكان اللى محتاجينه فيه. */
function proxy(req, res, targetBase, publicHost, statusHost) {
  let base;
  try { base = new URL(targetBase); } catch (_e) {
    res.statusCode = 502; return res.end('bad upstream');
  }
  const lib = base.protocol === 'https:' ? https : http;
  const headers = Object.assign({}, req.headers);
  headers.host = publicHost;                       // upstream sees the real domain
  headers['x-forwarded-host'] = publicHost;
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || 'https';

  const upstream = lib.request({
    protocol: base.protocol,
    hostname: base.hostname,
    port: base.port || (base.protocol === 'https:' ? 443 : 80),
    method: req.method,
    // The Service Flow path gateway rewrites req.url from /serviceflow/…
    // to the child app's /… before calling proxy(). originalUrl is immutable
    // in Express, so using it here sends prefixed API and WebSocket requests
    // back to the child's SPA fallback instead of its real route.
    path: req.url || req.originalUrl,
    headers,
    agent: base.protocol === 'https:' ? upstreamHttpsAgent : upstreamHttpAgent,
    // مهلة.
    //
    // من غيرها، لو التطبيق المستضاف علّق (مش وقع — **علّق**)، الطلب بيفضل
    // مفتوح للأبد: العميل مستني، والاتصال محجوز عندنا، والاتصالات دي بتتراكم
    // لحد ما السيرفر مايقدرش يستقبل. الوقوع بيتعالج (`error` تحت)؛ التعليق
    // مكنش ليه علاج.
    timeout: UPSTREAM_TIMEOUT_MS,
  }, (upRes) => {
    res.writeHead(upRes.statusCode || 502, upRes.headers);
    upRes.pipe(res);
  });
  // `timeout` بتطلق الحدث بس مابتقفلش الاتصال — القفل لازم يتعمل بالإيد،
  // وإلا الاتصال بيفضل محجوز واحنا فاكرين إننا خلاص منه.
  upstream.on('timeout', () => { upstream.destroy(new Error('upstream timeout')); });
  upstream.on('error', () => {
    /* ٥٠٢ بيقول «مش رادّ»، ومابيقولش **ليه**. وأربع حالات مختلفة تماماً
     * كانت بتطلع بنفس الجملة: مااتبناش · ناقصه إعداد · بيقع في حلقة ·
     * علّق. الأولتين مش مؤقتين، و«حاول تاني بعد لحظات» كذب فيهم.
     * `server.js` بيسجّل السبب وقت الإقلاع، وإحنا بنقوله هنا. */
    /* ⚠️ **٥٠٣ مش ٥٠٢.**
     *
     * Cloudflare بتستبدل أي ٥٠٢ أو ٥٠٤ جاي من الأصل بصفحة الخطأ بتاعتها
     * («Bad gateway — Host Error»). يعني كل الشغل اللي اتعمل عشان الصفحة
     * تقول **السبب** كان بيتاكل في النص، وصاحب الموقع بيشوف صفحة عامة
     * مالهاش معنى — وده ضيّع ساعات في تشخيص غلط (افتكرنا إن الطلب
     * ماوصلش أصلاً، وهو كان واصل وبيترد عليه).
     *
     * ٥٠٣ بتعدّي زي ما هي. وهي كمان أدق: التطبيق المستضاف **غير متاح**،
     * مش بوّابة عطلانة. */
    const info = describeCoHostStatus(getCoHostStatus(statusHost || publicHost));
    if (!res.headersSent) {
      res.writeHead(503, {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        ...(info.permanent ? {} : { 'retry-after': '30' }),
      });
    }
    res.end(info.text);
  });
  // ولو العميل مشي، مانفضلش شادّين على الاتصال بتاع فوق.
  res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
  req.pipe(upstream);                              // raw request body, untouched
}

// Returns an Express middleware, or null when the gateway is disabled (no env).
function createHostGateway() {
  const routes = loadRoutes();
  const hosts = Object.keys(routes);
  const myBibleMaintenance = isMyBibleMaintenanceMode();
  const sfPrefix = serviceFlowPathPrefix();
  const sfUpstream = process.env.SERVICEFLOW_UPSTREAM;
  // The path gateway and its aliases are valid even without SERVICEFLOW_HOST.
  // Keep the middleware alive for the current ads-*.replit.app deployment, where
  // Service Flow is intentionally exposed under /serviceflow instead of a
  // separate subdomain.
  if (!hosts.length && !(sfUpstream && sfPrefix)) return null;
  console.log('🌉 Host gateway enabled for:', hosts.join(', '));
  if (sfUpstream && sfPrefix) console.log('🌉 Service Flow also on path:', sfPrefix + '/ (any host)');
  return function hostGateway(req, res, next) {
    // Same host source the mykid/tenant middleware uses (Replit's edge clobbers
    // the Host header; the real subdomain arrives in x-tenant-host).
    const host = String(req.headers['x-tenant-host'] || req.headers.host || '')
      .split(':')[0].toLowerCase();
    /* روابط قديمة/مختصرة من لوحة Service Flow:
     *   /maintenance → تطبيق الصيانة المدمج (يحتفظ بمساره الداخلي)
     *   /cfm         → النسخة المبنية تحت /serviceflow/cfm
     *
     * /cfm لازم يتحول للمسار المبني تحته التطبيق، وإلا Wouter لن يطابق
     * القاعدة وسيطلب الأصول وواجهات API من جذر غير صحيح. أما الصيانة فهي
     * تطبيق Express مستقل داخل Service Flow ومساره الطبيعي هو /maintenance. */
    if (sfUpstream && underPrefix(req.url, '/maintenance')) {
      return proxy(req, res, sfUpstream, host, SERVICEFLOW_STATUS_KEY);
    }
    if (sfUpstream && underPrefix(req.url, '/cfm')) {
      res.writeHead(302, {
        location: addPrefix(req.url, sfPrefix),
        'cache-control': 'no-store',
      });
      return res.end();
    }
    /* باب المسار **قبل** التوجيه بالنطاق، وعلى أى نطاق:
     *   · oscardevs.com/serviceflow/…            → مجانى (الأبكس برّه الـWorker)
     *   · ads-*.replit.app/serviceflow/…         → مجانى (ما بيعدّيش على Cloudflare)
     *   · serviceflow.oscardevs.com/serviceflow/… → شغّال برضه
     * والتالتة دى مش رفاهية: الصفحة اتبنت وملفاتها تحت البادئة، فحتى على
     * نطاقها الخاص بتطلبها بالبادئة — فلازم تتشال هنا كمان. */
    if (sfUpstream && underPrefix(req.url, sfPrefix)) {
      const childPath = stripPrefix(req.url, sfPrefix);
      // Maintenance has its own absolute /maintenance base path. Send users
      // there instead of allowing its /auth/login redirect to fall through to
      // the OscarDevs app at the root.
      if (underPrefix(childPath, '/maintenance')) {
        res.writeHead(302, {
          location: childPath,
          'cache-control': 'no-store',
        });
        return res.end();
      }
      req.url = stripPrefix(req.url, sfPrefix);
      return proxy(req, res, sfUpstream, host, SERVICEFLOW_STATUS_KEY);
    }
    const target = routes[host];
    if (!target) return next();                   // not co-hosted → normal OscarDevs
    /* نطاق Service Flow الخاص: التطبيق **اتبنى تحت المسار**، يعنى روابط ملفاته
     * والراوتر بتاعه كلهم بيتوقّعوا `/serviceflow` فى أول العنوان. فلو فتحته على
     * جذر النطاق، الصفحة بتيجى لكن الراوتر مابيطابقش والملفات بتتطلب من مكان
     * تانى — شاشة بيضا. التحويلة بتخلّى كل الأبواب تنتهى لنفس الشكل. */
    if (sfUpstream && sfPrefix && target === sfUpstream && !underPrefix(req.url, sfPrefix)) {
      res.writeHead(302, {
        location: sfPrefix + (req.url === '/' ? '/' : req.url),
        'cache-control': 'no-store',
      });
      return res.end();
    }
    if (myBibleMaintenance && (
      host === 'mybible.oscardevs.com' || host === 'mybible2.oscardevs.com'
    )) {
      res.statusCode = 503;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.setHeader('retry-after', '300');
      return res.end('الموقع تحت صيانة قصيرة لحماية بيانات القراءة. حاول مرة أخرى بعد دقائق.');
    }
    proxy(req, res, target, host);
  };
}

module.exports = {
  createHostGateway, loadRoutes, parseHosts, SERVICEFLOW_STATUS_KEY,
  serviceFlowPathPrefix, underPrefix, stripPrefix, addPrefix,
};
