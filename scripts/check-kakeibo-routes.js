#!/usr/bin/env node
/**
 * Actually serve the kakeibo routes and look at the answers.
 *
 * Everything else in this repo checks kakeibo one layer at a time:
 * render-kakeibo-pages.js renders templates with hand-written locals,
 * check-kakeibo-stats.js exercises the arithmetic, check-payday.js the dates.
 * Nothing had ever run the router — so a redirect pointing at the wrong path, a
 * route shadowed by one declared earlier, a query string dropped on the way
 * through, or a form field parsed the wrong way would all reach the live site
 * with every check green.
 *
 * The database is the only thing faked: `pg` is swapped for a stub that answers
 * from a small in-memory fixture and RECORDS what it was asked, so the
 * assertions can check the query the route built, not just the HTML that came
 * back. Express, the templates and the router are the real ones.
 *
 *   node scripts/check-kakeibo-routes.js
 */
'use strict';
const path = require('path');
const Module = require('module');
const ROOT = path.join(__dirname, '..');

// ── The fixture, and the log of what the routes asked for ──────────────────
const db = {
  user: { id: 1, email: 'a@b.com', display_name: 'Ali', is_guest: false },
  profile: { user_id: 1, monthly_income: 3000, saving_goal: 300, salary_day: 25,
    salary_type: 'fixed', weekend: 'fri_sat', country: 'EG', currency: 'EGP',
    lang: 'ar', onboarded: true },
  expenseCount: 9,
  queries: [],       // every [sql, params] the routes ran
};

function rows(sql, params) {
  db.queries.push([sql.replace(/\s+/g, ' ').trim(), params]);
  if (/FROM kkb_users/.test(sql)) return [db.user];
  if (/FROM kkb_profiles/.test(sql) && /^\s*SELECT/.test(sql)) return [db.profile];
  // Every COUNT in this tree is read as rows[0].<alias> with no guard, so the
  // stub must always hand back a row — gamify.js reads .n and .done off it.
  if (/COUNT\(/.test(sql)) return [{ n: db.expenseCount, done: 0 }];
  if (/SUM\(amount\)/.test(sql)) return [{ s: '0' }];
  if (/UPDATE kkb_profiles/.test(sql)) { db.lastProfileUpdate = params; return []; }
  return [];
}
class StubPool {
  async query(sql, params) { return { rows: rows(sql, params) }; }
  async connect() { return { query: this.query, release() {} }; }
  async end() {}
}
// Swap `pg` before the router is loaded — it builds its Pool at module scope.
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'pg') return { Pool: StubPool };
  return realLoad.apply(this, arguments);
};

let express;
try { express = require('express'); }
catch (e) {
  // Exit 2, not 0. This is the only check here that needs node_modules, and
  // reporting a green tick for a check that never ran is how an environment
  // problem gets mistaken for a passing suite. check-all.js renders 2 as
  // "skipped" and does not count it as a pass.
  console.log('⏭️  express مش منزّل — الفحص ده محتاج node_modules. (' + e.message.split('\n')[0] + ')');
  process.exit(2);
}
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@127.0.0.1:1/none';
const kakeibo = require(path.join(ROOT, 'src/kakeibo/router'));

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'src/views'));
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => { req.session = { kkbUserId: 1 }; next(); });
app.use(kakeibo);

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

(async () => {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (p) => fetch(base + p, { redirect: 'manual' });
  const post = (p, body) => fetch(base + p, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  try {
    // ── The merged page, and the two paths that used to serve it ───────────
    const sum = await get('/summary');
    check('/summary answers', sum.status === 200, String(sum.status));
    check('/summary is the month summary', (await sum.text()).includes('/summary?ym='));

    const rep = await get('/reports');
    check('/reports redirects to /summary',
      rep.status === 302 && rep.headers.get('location') === '/summary',
      `${rep.status} → ${rep.headers.get('location')}`);

    // The query string is the whole point of keeping the old paths alive: a
    // bookmark on /review?ym=2026-6 has to land on June, not on today.
    const rev = await get('/review?ym=2026-6');
    check('/review keeps its month through the redirect',
      rev.status === 302 && rev.headers.get('location') === '/summary?ym=2026-6',
      `${rev.status} → ${rev.headers.get('location')}`);
    const junk = await get('/review?ym=' + encodeURIComponent('"><script>'));
    check('/review drops a malformed month instead of forwarding it',
      junk.headers.get('location') === '/summary', String(junk.headers.get('location')));

    // A month in the past must actually be read as that month.
    db.queries.length = 0;
    await get('/summary?ym=2026-6');
    const ranges = db.queries.filter((q) => /SUM\(amount\)/.test(q[0])).map((q) => q[1].slice(1));
    check('/summary?ym=2026-6 queries June, not today',
      ranges.some(([f, t]) => f === '2026-06-01' && t === '2026-07-01'),
      JSON.stringify(ranges[0] || []));

    // ── The tools gate is a menu, never a guard ────────────────────────────
    db.expenseCount = 9;
    const profMany = await get('/profile');
    check('/profile lists the tools once there are 5+ expenses',
      (await profMany.text()).includes('href="/twin"'));
    db.expenseCount = 2;
    const profFew = await get('/profile');
    check('/profile hides the tools below 5 expenses',
      !(await profFew.text()).includes('href="/twin"'));
    const twin = await get('/twin');
    check('/twin still serves below the gate — hidden from the menu, not blocked',
      twin.status === 200, String(twin.status));

    // ── "I don't know yet" reaches the database as 0, not as an error ──────
    db.lastProfileUpdate = null;
    const skipped = await post('/onboarding', { monthly_income: '', saving_goal: '', salary_type: 'fixed', salary_day: '25' });
    check('onboarding accepts both money questions left blank',
      skipped.status === 302 && skipped.headers.get('location') === '/app',
      `${skipped.status} → ${skipped.headers.get('location')}`);
    check('blank money questions are stored as 0',
      db.lastProfileUpdate && Number(db.lastProfileUpdate[0]) === 0 && Number(db.lastProfileUpdate[1]) === 0,
      JSON.stringify((db.lastProfileUpdate || []).slice(0, 2)));

    // A typo must NOT be quietly zeroed — that would wipe an income already set.
    db.lastProfileUpdate = null;
    const typo = await post('/onboarding', { monthly_income: 'abc', saving_goal: '300', salary_type: 'fixed', salary_day: '25' });
    check('a filled-in but unreadable amount is still rejected',
      typo.status === 200 && !db.lastProfileUpdate, `${typo.status}, wrote ${!!db.lastProfileUpdate}`);

    // ── Freelance is a value the server will actually accept ───────────────
    db.lastProfileUpdate = null;
    await post('/onboarding', { monthly_income: '3000', saving_goal: '300', salary_type: 'irregular' });
    check('salary_type=irregular survives validation',
      db.lastProfileUpdate && db.lastProfileUpdate[3] === 'irregular',
      String(db.lastProfileUpdate && db.lastProfileUpdate[3]));
    db.lastProfileUpdate = null;
    await post('/onboarding', { monthly_income: '3000', saving_goal: '300', salary_type: 'nonsense' });
    check('an unknown salary_type falls back to fixed',
      db.lastProfileUpdate && db.lastProfileUpdate[3] === 'fixed',
      String(db.lastProfileUpdate && db.lastProfileUpdate[3]));

    // ── The home screen still builds ───────────────────────────────────────
    const home = await get('/app');
    check('/app answers', home.status === 200, String(home.status));
  } finally {
    server.close();
  }

  console.log(fail ? `\n${fail} فشل.` : '\nالراوتات بتردّ صح.');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ ' + e.stack); process.exit(1); });
