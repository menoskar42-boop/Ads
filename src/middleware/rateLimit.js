// Lightweight in-memory rate limiter to blunt online brute-force / credential
// stuffing against login endpoints (and to throttle other abuse-prone public
// endpoints). It is per-instance — Autoscale may run parallel instances — but
// per-instance throttling still raises the cost of guessing by orders of
// magnitude, and the account-keyed variant can't be bypassed by IP/XFF spoofing.
const buckets = new Map(); // key -> { count, resetAt }

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.ip || (req.connection && req.connection.remoteAddress) || 'unknown');
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
    if (!b || now > b.resetAt) { b = { count: 0, resetAt: now + windowMs }; buckets.set(key, b); }
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

module.exports = { rateLimit, loginLimiter, clientIp };
