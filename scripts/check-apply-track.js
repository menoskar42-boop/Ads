#!/usr/bin/env node
/**
 * Assert that following an application needs the token, and that the email form
 * gives nothing away.
 *
 * /apply/status used to answer an email address directly: "under review",
 * "approved", or "no application with this email" were three different screens.
 * That made a public form into an oracle — anyone with a list of addresses could
 * learn who had applied to OscarDevs and how it went. The rate limit made that
 * slow, not impossible, and a slow leak is still a leak.
 *
 * The fix only works if the page is IDENTICAL for an address that has an
 * application and one that does not. That is not something you can eyeball once
 * and trust: the next person to add a friendly "we couldn't find that" message
 * re-opens it, and the tests would still pass. So this diffs the two responses
 * byte for byte.
 *
 * Express and the templates are real; `pg` is a stub, so no database is needed.
 *
 *   node scripts/check-apply-track.js
 */
'use strict';
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');

const KNOWN = 'known@example.com';
const TOKEN = 'a'.repeat(64);
const db = { sent: [], queries: [] };

function rows(sql, params) {
  db.queries.push([sql.replace(/\s+/g, ' ').trim(), params]);
  // The email lookup: only the known address has a row.
  if (/UPDATE signup_applications/.test(sql)) {
    return params[0] === KNOWN ? [{ track_token: TOKEN, full_name: 'Ali', country: 'مصر' }] : [];
  }
  if (/FROM signup_applications sa/.test(sql)) {
    return params[0] === TOKEN
      ? [{ status: 'approved', created_at: new Date('2026-08-01'), business_name: 'Ali Store', company_slug: 'ali' }]
      : [];
  }
  return [];
}
class StubPool {
  async query(sql, params) { return { rows: rows(sql, params) }; }
  async connect() { return { query: this.query, release() {} }; }
  async end() {}
}
const realLoad = Module._load;
Module._load = function (request) {
  if (request === 'pg') return { Pool: StubPool };
  // Never actually send: record the call so the assertions can tell whether a
  // link would have gone out, without needing SMTP.
  if (/lib\/mailer$/.test(request)) {
    const real = realLoad.apply(this, arguments);
    return Object.assign({}, real, {
      sendApplicationTrackLink: async (a) => { db.sent.push(a); },
      sendApplicationReceived: async () => {},
      sendAdminNewApplication: async () => {},
    });
  }
  return realLoad.apply(this, arguments);
};

let express;
try { express = require('express'); }
catch (e) {
  console.log('⏭️  express مش منزّل — الفحص ده محتاج node_modules.');
  process.exit(2);
}
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@127.0.0.1:1/none';
const applyRouter = require(path.join(ROOT, 'src/routes/apply'));

const app = express();
// Node's fetch refuses to send a manual Host header, so a production hostname
// has to arrive the way it does in production — through the proxy header.
app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'src/views'));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  res.locals.siteOrigin = 'https://oscardevs.com';
  res.locals.canonicalUrl = 'https://oscardevs.com' + req.path;
  res.locals.showAds = true;          // start true, so the route must turn it off
  next();
});
app.use(applyRouter);

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  // A production hostname, so canonicalCompanyUrl builds the subdomain form
  // rather than the local-development /view/ fallback.
  const H = { 'X-Forwarded-Host': 'oscardevs.com', 'X-Forwarded-Proto': 'https' };
  const get = (p) => fetch(base + p, { headers: H });
  const post = (p, body) => fetch(base + p, {
    method: 'POST', redirect: 'manual',
    headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, H),
    body: new URLSearchParams(body).toString(),
  });

  try {
    // ── The email form must be an identical page either way ────────────────
    db.sent = [];
    const hit = await post('/apply/status', { email: KNOWN });
    const hitBody = await hit.text();
    const miss = await post('/apply/status', { email: 'nobody@example.com' });
    const missBody = await miss.text();

    check('the two answers are the same status code', hit.status === miss.status, `${hit.status}/${miss.status}`);
    // The typed address is echoed into the form field, so compare with it removed.
    const norm = (s, email) => s.split(email).join('«email»');
    check('the two answers are byte-for-byte identical',
      norm(hitBody, KNOWN) === norm(missBody, 'nobody@example.com'),
      `${hitBody.length} vs ${missBody.length} bytes`);
    check('neither answer states whether an application exists',
      !/قيد المراجعة|تمت الموافقة|لم يتم القبول|مفيش طلب مسجّل بهذا البريد/.test(hitBody + missBody));
    check('a link is emailed only to the address that has an application',
      db.sent.length === 1 && db.sent[0].to === KNOWN,
      `${db.sent.length} sent`);
    check('the emailed link carries the token, not the email',
      db.sent[0] && /\/apply\/track\/[a-f0-9]{64}$/.test(db.sent[0].trackUrl), db.sent[0] && db.sent[0].trackUrl);

    // ── The token is what shows a status ───────────────────────────────────
    const good = await get('/apply/track/' + TOKEN);
    const goodBody = await good.text();
    check('a valid token shows the status', good.status === 200 && /تمت الموافقة/.test(goodBody));
    check('the approved link points at the subdomain, not /view/',
      /ali\.oscardevs\.com/.test(goodBody) && !/href="\/view\//.test(goodBody));

    // An unknown or malformed token must look exactly like a valid-but-absent
    // one, or probing tells an attacker which tokens are real.
    const bad = await get('/apply/track/' + 'b'.repeat(64));
    const badBody = await bad.text();
    const junk = await get('/apply/track/not-a-token');
    const junkBody = await junk.text();
    check('an unknown token is a normal page, not a 404',
      bad.status === 200 && junk.status === 200, `${bad.status}/${junk.status}`);
    check('unknown and malformed tokens are indistinguishable', badBody === junkBody);
    check('neither leaks that the token was well-formed', !/تمت الموافقة|قيد المراجعة/.test(badBody + junkBody));

    /* ── الرد واحد، بس بيقول للعميل الصح ───────────────────────────────
     *
     * الرد الموحّد مقصود: التوكن هو كلمة السر، ورد مختلف على «موجود بس
     * انتهت صلاحيته» بيقول للّي بيجرّب إن التوكن ده حقيقي. ده يفضل.
     *
     * اللي كان غلط هو **النص**: «مفيش طلب مسجّل بهذا البريد». العميل جه
     * من رابط وماكتبش بريد أصلاً — والفرع ده أثبتناه إنه مايتفتحش غير من
     * مسار التوكن (نموذج البريد بقى بيبعت مش بيجاوب، فبيمرّر `sent`
     * من غير `result`). فالرسالة كانت بتوَدّي العميل يراجع حاجة ماعملهاش.
     *
     * الفحص بيقفل الاتنين مع بعض: مايرجعش للنص الغلط، ولا يفرّق الرد. */
    check('the broken-link card does not blame an email nobody typed',
      !/مفيش طلب مسجّل بهذا البريد/.test(badBody),
      'العميل وصل من رابط — الرسالة دي بتخليه يدوّر في حتة مالهاش لازمة.');
    check('and it names the link as the problem',
      /الرابط ده مش شغّال/.test(badBody),
      'من غير سبب واضح العميل مش عارف يعمل إيه بعد كده.');
    check('the valid-token page never shows the broken-link card',
      !/الرابط ده مش شغّال/.test(goodBody));

    /* وانتهاء الصلاحية بيتفلتر **في SQL** مش في JS. لو اتنقل لفرع في
     * الكود (`if (row.expired) …`) يبقى فيه رد تاني ممكن يتولد — وساعتها
     * الرد مايبقاش موحّد مهما كان النص. الشرط جوّه نفس الـWHERE معناه إن
     * الصف المنتهي مابيرجعش أصلاً، فهو نفس «مش موجود» بالظبط. */
    const tokenSql = (db.queries.find((q) => /FROM signup_applications sa/.test(q[0])) || [''])[0];
    check('expiry is filtered in the same query, not in a second branch',
      /track_expires_at/.test(tokenSql) && /WHERE[\s\S]*track_expires_at/.test(tokenSql),
      'صف منتهي لازم يرجع فاضي زي المش موجود — مش يوصل للكود ويترندر رد تاني.');
    const routeSrc = require('fs')
      .readFileSync(path.join(ROOT, 'src/routes/apply.js'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    check('and the route has no separate "expired" answer',
      !/(منتهي|منتهية|expired)/i.test(routeSrc),
      'أي رد مخصوص لـ«انتهت صلاحيته» بيأكّد للّي بيجرّب إن التوكن حقيقي.');

    // ── AdSense: this is a form, so no ad unit may load ────────────────────
    check('the token never appears in a canonical tag',
      !new RegExp('rel="canonical"[^>]*' + TOKEN).test(goodBody)
      && /rel="canonical" href="[^"]*\/apply\/status"/.test(goodBody));
    check('third parties are not told the token via Referer',
      /<meta name="referrer" content="no-referrer"/.test(goodBody));
    check('no AdSense loader on the status page',
      !/adsbygoogle|pagead2\.googlesyndication/.test(goodBody + hitBody));
    check('the page is not indexable', /noindex/.test(goodBody));
  } finally {
    server.close();
  }

  console.log(fail ? `\n${fail} فشل — ده كشف بيانات، مش تفصيلة.` : '\nمتابعة الطلب بالتوكن سليمة، والفورم مابيكشفش.');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ ' + e.stack); process.exit(1); });
