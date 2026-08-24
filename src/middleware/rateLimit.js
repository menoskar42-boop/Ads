// Lightweight in-memory rate limiter to blunt online brute-force / credential
// stuffing against login endpoints (and to throttle other abuse-prone public
// endpoints). It is per-instance — Autoscale may run parallel instances — but
// per-instance throttling still raises the cost of guessing by orders of
// magnitude, and the account-keyed variant can't be bypassed by IP/XFF spoofing.
const buckets = new Map(); // key -> { count, resetAt }

// سقف لعدد المفاتيح. الكنس كل ٥ دقايق مابيكفيش لوحده: اللي بينتحل الـIP يقدر
// يولّد مفاتيح أسرع من الكنس ويملا الذاكرة. لما نوصل السقف، بنمسح أقدم ربع —
// وده معناه إن أقدم مهاجم بيرجع من الأول، مش إن السيرفر بيقع.
const MAX_KEYS = 50000;

/**
 * عنوان العميل، بأقل قابلية للانتحال.
 *
 * الشكل القديم كان بياخد **أول** عنوان في `X-Forwarded-For` — ودي أسوأ قراية
 * ممكنة: العميل هو اللي بيكتب أول عنوان، فأي حد يقدر يبعت
 * `X-Forwarded-For: 1.2.3.4` ويبقى شخص جديد كل طلب. يعني حدّ المعدّل كله
 * كان بيتخطّى بسطر واحد في الطلب.
 *
 * الترتيب هنا:
 *
 * ١) **`cf-connecting-ip` لما يكون الطلب فعلاً عدّى من كلاودفلير** — علامته
 *    `cf-ray` اللي كلاودفلير بيحطّها ويكتب فوق أي واحدة جاية من العميل. لو
 *    الاتنين موجودين، ده أصدق عنوان عندنا.
 * ٢) **آخر عنوان في `X-Forwarded-For`** مش أول واحد. البروكسي بيضيف من
 *    الآخر، فاللي بيضيفه العميل بيتزقّ لأول القايمة، واللي في الآخر هو اللي
 *    أقرب بروكسي شافه بنفسه.
 * ٣) وبعدين السوكت نفسه.
 */
/** العنوان ده جاي من بروكسي جوّانا ولا من الإنترنت على طول؟ */
function isLocalPeer(ip) {
  const a = String(ip || '').replace(/^::ffff:/, '');
  return a === '' || a === '::1' || a === '127.0.0.1'
    || /^10\./.test(a) || /^192\.168\./.test(a) || /^127\./.test(a)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(a)
    || /^f[cd]/i.test(a);            // fc00::/7 — عناوين محلية في IPv6
}

function clientIp(req) {
  const h = req.headers || {};
  const peer = (req.socket && req.socket.remoteAddress)
    || (req.connection && req.connection.remoteAddress) || '';

  // العميل بيكلّمنا على طول (مافيش بروكسي بينّا) → أي هيدر عناوين كتبه هو
  // بإيده، فمابنقراهوش أصلاً. ده بيقفل الحالة اللي فيها الطلب بيوصل للسيرفر
  // من غير ما يعدّي على كلاودفلير.
  if (peer && !isLocalPeer(peer)) return peer.replace(/^::ffff:/, '');

  if (h['cf-ray'] && h['cf-connecting-ip']) return String(h['cf-connecting-ip']).trim();
  const xff = h['x-forwarded-for'];
  if (xff) {
    const parts = String(xff).split(',').map((x) => x.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return (req.ip || (req.socket && req.socket.remoteAddress)
    || (req.connection && req.connection.remoteAddress) || 'unknown');
}

// opts: { windowMs, max, keyFn(req)->string, name }
function rateLimit(opts) {
  const windowMs = opts.windowMs || 60000;
  const max = opts.max || 30;
  const name = opts.name || 'rl';
  const keyFn = opts.keyFn || ((req) => clientIp(req));
  return function (req, res, next) {
    const key = name + ':' + keyFn(req);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.resetAt) {
      if (buckets.size >= MAX_KEYS) evictOldest();
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count++;
    if (b.count > max) {
      res.setHeader('Retry-After', Math.ceil((b.resetAt - now) / 1000));
      if (req.accepts && req.accepts('html')) {
        return res.status(429).send('طلبات كثيرة جداً — انتظر قليلاً ثم حاول مرة أخرى.');
      }
      return res.status(429).json({ error: 'Too many requests — slow down.' });
    }
    next();
  };
}

/**
 * الطوارئ: امسح المنتهي، ولو لسه فوق السقف امسح أقدم ربع.
 * `Map` في جافاسكريبت بتحافظ على ترتيب الإضافة، فأول المفاتيح هي أقدمها.
 */
function evictOldest() {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  if (buckets.size < MAX_KEYS) return;
  let drop = Math.ceil(buckets.size / 4);
  for (const k of buckets.keys()) {
    buckets.delete(k);
    if (--drop <= 0) break;
  }
}

// Bound memory: drop expired buckets every 5 minutes.
const _sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
}, 5 * 60000);
if (_sweep.unref) _sweep.unref();

// Login limiter: key on the TARGETED account (email/username) so guessing a
// single account is capped regardless of source IP (unspoofable), combined with
// the client IP to also slow mass attempts. 12 tries / 10 min.
const loginLimiter = rateLimit({
  name: 'login',
  windowMs: 10 * 60000,
  max: 12,
  keyFn: (req) => String((req.body && (req.body.email || req.body.username)) || '').toLowerCase().trim() + '|' + clientIp(req),
});

module.exports = { rateLimit, loginLimiter, clientIp, MAX_KEYS, _buckets: buckets };
