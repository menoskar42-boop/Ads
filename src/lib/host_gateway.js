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
  const sf = process.env.SERVICEFLOW_UPSTREAM;
  const sfHost = String(process.env.SERVICEFLOW_HOST || '').trim().toLowerCase();
  if (sf && sfHost) routes[sfHost] = sf;
  return routes;
}

// Stream one request through to the upstream app untouched, and pipe the reply
// back. `publicHost` is forwarded as the Host header so the upstream app sees
// its real public domain (keeps its session cookie bound to mybible.*).
// ٣٠ ثانية: أطول من أي صفحة معقولة، وأقصر بكتير من «للأبد».
const UPSTREAM_TIMEOUT_MS = 30000;

function proxy(req, res, targetBase, publicHost) {
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
    path: req.originalUrl,
    headers,
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
    const info = describeCoHostStatus(getCoHostStatus(publicHost));
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
  if (!hosts.length) return null;
  const myBibleMaintenance = isMyBibleMaintenanceMode();
  console.log('🌉 Host gateway enabled for:', hosts.join(', '));
  return function hostGateway(req, res, next) {
    // Same host source the mykid/tenant middleware uses (Replit's edge clobbers
    // the Host header; the real subdomain arrives in x-tenant-host).
    const host = String(req.headers['x-tenant-host'] || req.headers.host || '')
      .split(':')[0].toLowerCase();
    const target = routes[host];
    if (!target) return next();                   // not co-hosted → normal OscarDevs
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

module.exports = { createHostGateway, loadRoutes };
