#!/usr/bin/env node
/**
 * «الطلب ده جاي منين؟» — سؤالين كانت الإجابة عليهم بتيجي من العميل نفسه.
 *
 * ── ١) الاستثناء من CSRF كان بيتطابق بـ`endsWith` ────────────────────────
 *
 * كولباك بوابة الدفع مستثنى من حارس الـCSRF (وده صح — بيتتحقّق بـHMAC).
 * بس الفحص كان `p.endsWith(e)`، يعني **أي** مسار بينتهي بمسار مستثنى بيعدّي:
 *
 *     /evil/shop/pay/paymob/callback   ← بينتهي بالمسار المستثنى
 *
 * فالحارس كله بيتخطّى على مسار المهاجم بيختاره هو. والمطابقة بقت تامة.
 *
 * ── ٢) عنوان العميل كان أول عنوان في `X-Forwarded-For` ───────────────────
 *
 * وده أسوأ قراية ممكنة: **العميل** هو اللي بيكتب أول عنوان. يعني أي حد يبعت
 * `X-Forwarded-For: 1.2.3.4` يبقى شخص جديد كل طلب — وحدّ المعدّل كله
 * (تسجيل الدخول · الحجز العام · رسايل المرضى) بيتخطّى بسطر واحد.
 *
 * التلات قواعد اللي بقت شغّالة:
 *   · العميل اللي بيكلّمنا **على طول** (مافيش بروكسي محلي) — هيدرات العناوين
 *     بتاعته بتتجاهل تماماً، عنوان السوكت هو الحقيقة.
 *   · `cf-connecting-ip` بس لما `cf-ray` تكون موجودة (يعني الطلب فعلاً عدّى
 *     من كلاودفلير، وهو بيكتب فوق أي واحدة العميل بعتها).
 *   · **آخر** عنوان في `X-Forwarded-For` مش أول واحد — اللي العميل بيضيفه
 *     بيتزقّ لأول القايمة، واللي في الآخر أقرب بروكسي شافه بنفسه.
 *
 * ── ٣) وخريطة الحدود كانت بتكبر بلا سقف ──────────────────────────────────
 *
 * الكنس كل ٥ دقايق مابيكفيش قدام واحد بيولّد مفاتيح أسرع منه.
 *
 *   node scripts/check-request-identity.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const RL = require('../src/middleware/rateLimit');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const ip = (headers, peer) => RL.clientIp({ headers, socket: { remoteAddress: peer || '10.0.0.5' } });

/* ── ١. المطابقة التامة في CSRF ────────────────────────────────────────── */
{
  const c = code('src/middleware/csrf.js');
  check('الاستثناء بمطابقة تامة مش بنهاية المسار',
    /exempt\.some\(\(e\) => p === e \|\| p === e \+ '\/'\)/.test(c));
  check('ومفيش `endsWith` فاضلة في الحارس', !/endsWith/.test(c));

  // الحارس نفسه، مشغّل: مسار ملزوق بالمسار المستثنى لازم **مايعدّيش**.
  const guard = require('../src/middleware/csrf').guard();
  const run = (p) => {
    let passed = false, status = 0;
    const req = { method: 'POST', path: p, headers: { origin: 'https://evil.example', host: 'oscardevs.com' },
      accepts: () => false };
    const res = { status: (s) => { status = s; return res; }, send: () => res, json: () => res, setHeader: () => {} };
    guard(req, res, () => { passed = true; });
    return { passed, status };
  };
  check('الكولباك الحقيقي بيعدّي', run('/shop/pay/paymob/callback').passed === true);
  check('والمسار الملزوق قدّامه **مابيعدّيش**',
    run('/evil/shop/pay/paymob/callback').passed === false, 'status ' + run('/evil/shop/pay/paymob/callback').status);
  check('وأي مسار تاني من موقع تاني بيتوقف', run('/company/products').passed === false);
}

/* ── ٢. عنوان العميل ───────────────────────────────────────────────────── */
{
  check('الاتصال المباشر: هيدرات العناوين بتتجاهل تماماً',
    ip({ 'x-forwarded-for': '1.2.3.4', 'cf-ray': 'x', 'cf-connecting-ip': '8.8.8.8' }, '203.0.113.9') === '203.0.113.9');
  check('وIPv4 المغلّفة في IPv6 بتترجع نضيفة',
    ip({}, '::ffff:203.0.113.9') === '203.0.113.9');
  check('ومن ورا بروكسي: آخر عنوان في السلسلة مش أول واحد',
    ip({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }) === '203.0.113.7');
  check('وكلاودفلير بتتصدّق لما تكون علامتها موجودة',
    ip({ 'cf-ray': 'x', 'cf-connecting-ip': '8.8.8.8', 'x-forwarded-for': '1.2.3.4' }) === '8.8.8.8');
  check('و`cf-connecting-ip` لوحدها من غير `cf-ray` مابتتصدّقش',
    ip({ 'cf-connecting-ip': '8.8.8.8' }) === '10.0.0.5');
  check('ومفيش هيدرات خالص → السوكت', ip({}) === '10.0.0.5');

  const rl = code('src/middleware/rateLimit.js');
  check('ومفيش قراية لأول عنصر في السلسلة',
    !/split\(','\)\[0\]/.test(rl));

  // والقاعدة دي لازم تكون في **كل** مكان بيقرا عنوان، مش في الوحدة بس.
  // كان فيه تلات أماكن تانية بتاخد أول عنصر بإيدها: حدّ شات الذكاء
  // الاصطناعي (وده بيكلّف فلوس على كل نداء)، وعنوان طلب التقديم، وسجل
  // الوصول للبيانات الطبية — سجل بيسجّل كلام المتّهم مش سجل.
  const readers = ['src/routes/tenant.js', 'src/routes/apply.js', 'src/lib/audit.js'];
  const raw = readers.filter((f) => /x-forwarded-for'\]([\s\S]{0,80})split\(','\)\[0\]/.test(code(f)));
  check('ومفيش ملف تاني بيقرا العنوان بإيده', raw.length === 0, raw.join(', ') || 'كلهم على القراية المشتركة');
  check('وحدّ شات الذكاء الاصطناعي على القراية المشتركة',
    /const ip = clientIp\(req\);/.test(code('src/routes/tenant.js')));
  check('وسجل الوصول كمان',
    /require\('\.\.\/middleware\/rateLimit'\)\.clientIp\(req\)/.test(code('src/lib/audit.js')));
  check('والقراية دي هي اللي حدّ الدخول بيستعملها',
    /clientIp\(req\)/.test(rl) && /keyFn: \(req\) =>[\s\S]*clientIp\(req\)/.test(rl));
}

/* ── ٣. سقف الذاكرة ───────────────────────────────────────────────────── */
{
  const rl = code('src/middleware/rateLimit.js');
  check('فيه سقف لعدد المفاتيح', /const MAX_KEYS = \d+/.test(rl) && RL.MAX_KEYS > 0);
  check('والسقف بيتفحص قبل ما يتضاف مفتاح جديد',
    /if \(buckets\.size >= MAX_KEYS\) evictOldest\(\);/.test(rl));
  check('والكنس الدوري لسه موجود (المنتهي بيتمسح)',
    /setInterval\(/.test(rl) && /now > v\.resetAt/.test(rl));

  // مشغّل: املا فوق السقف وشوف الخريطة وقفت عند حدّها.
  const mw = RL.rateLimit({ name: 'evict-test', windowMs: 60000, max: 100000 });
  const before = RL._buckets.size;
  for (let i = 0; i < RL.MAX_KEYS + 500; i++) {
    mw({ headers: {}, socket: { remoteAddress: '10.0.0.' + (i % 250) },
      ip: 'k' + i, accepts: () => false }, { setHeader: () => {}, status: () => ({ send: () => {}, json: () => {} }) }, () => {});
  }
  check('والخريطة مابتعديش السقف تحت الضغط',
    RL._buckets.size <= RL.MAX_KEYS, RL._buckets.size + ' مفتاح (كانت ' + before + ')');
}

console.log(fail === 0
  ? '\n✅ «الطلب جاي منين» بقى من عندنا مش من كلام العميل.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
