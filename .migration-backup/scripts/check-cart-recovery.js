#!/usr/bin/env node
/**
 * The reminder that leaves by itself — and the one that must never claim to.
 *
 * The abandoned-cart page listed the carts and offered a WhatsApp link to
 * click. Useful, and only while somebody is sitting at the panel: a cart left
 * at 11pm was chased at 10am, if at all. Every competitor sells this as
 * automatic, so it had to become automatic — and the moment software starts
 * sending mail from a merchant's name, three things can go wrong, all of them
 * worse than the original gap:
 *
 *   · it sends twice (two instances, two timers, one cart);
 *   · it says «اتبعت» over a send that failed;
 *   · it says «تلقائي» about a channel that still needs a human to press send.
 *
 * So this file does not read the source and hope. It drives the real job with a
 * fake database and a fake sender, and checks the outcomes: a cart claimed once,
 * a failure written down as a failure, nothing at all when there is no sender,
 * and no WhatsApp sent anywhere.
 *
 *   node scripts/check-cart-recovery.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const R = require('../src/shop/cart_recovery');
const job = require('../src/shop/cart_recovery_job');
const { t, strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

// One async body: the job's own behaviour is the thing being tested, and that
// means awaiting it.
(async () => {

/* ── Off unless the merchant says otherwise ────────────────────────────── */
{
  check('مقفول افتراضياً', R.settingsFrom(null).enabled === false && R.DEFAULTS.enabled === false);
  const srv = stripComments(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'));
  check('وعمود الجدول نفسه افتراضيه false',
    /cart_recovery_settings[\s\S]{0,400}enabled\s+BOOLEAN NOT NULL DEFAULT false/.test(srv));
  const jsrc = stripComments(fs.readFileSync(path.join(ROOT, 'src/shop/cart_recovery_job.js'), 'utf8'));
  // A shop with no settings row is not in the query's result at all.
  check('ومتجر مالوش صف إعدادات مايدخلش الاستعلام أصلاً',
    /JOIN cart_recovery_settings s ON s\.company_id = a\.company_id AND s\.enabled = true/.test(jsrc));
  check('والمنطق مابيقولش due لمتجر مقفول',
    R.isDue({ item_count: 1, customer_email: 'a@b.c', updated_at: new Date(0) }, R.settingsFrom({ enabled: false }), new Date()).why === 'off');
}

/* ── The timing rules ──────────────────────────────────────────────────── */
{
  const s = R.settingsFrom({ enabled: true, delay_minutes: 60, cooldown_days: 7, max_attempts: 2 });
  const now = new Date('2026-08-19T12:00:00Z');
  const at = (mins) => new Date(now.getTime() - mins * 60000);
  const cart = (over) => Object.assign({ item_count: 2, customer_email: 'a@b.c', updated_at: at(120), reminder_attempts: 0 }, over);

  check('سلة قديمة كفاية بتتبعت', R.isDue(cart(), s, now).due === true);
  check('وسلة لسه جديدة لأ', R.isDue(cart({ updated_at: at(30) }), s, now).why === 'young');
  check('وسلة فاضية لأ', R.isDue(cart({ item_count: 0 }), s, now).why === 'empty');
  check('وعميل من غير إيميل بيتقال عليه كده صريح',
    R.isDue(cart({ customer_email: '' }), s, now).why === 'no_contact');
  check('واللي اتبعتله خلاص مايتبعتلوش تاني',
    R.isDue(cart({ reminder_state: 'sent', reminder_at: at(60), reminder_attempts: 1 }), s, now).why === 'sent');
  // A NEWER cart from the same customer, but inside the cooldown.
  // "Newer" means the cart moved AFTER the last reminder went out — the same
  // customer coming back and leaving again, not an older row.
  check('وسلة أجدد جوّه مدة الانتظار بتستنى',
    R.isDue(cart({ updated_at: at(120), reminder_state: 'sent', reminder_at: at(300), reminder_attempts: 1 }), s, now).why === 'cooldown');
  check('وسلة أجدد بعد مدة الانتظار بتتبعت',
    R.isDue(cart({ updated_at: at(120), reminder_state: 'sent', reminder_at: at(20 * 24 * 60), reminder_attempts: 1 }), s, now).due === true);
  check('واللي خلّص محاولاته بيتوقف',
    R.isDue(cart({ updated_at: at(20 * 24 * 60), reminder_state: 'failed', reminder_at: at(15 * 24 * 60), reminder_attempts: 2 }), s, now).why === 'attempts');
  check('واللي بيتبعت دلوقتي محدش يلمسه',
    R.isDue(cart({ reminder_state: 'sending', reminder_at: now, reminder_attempts: 1 }), s, now).why === 'sending');
}

/* ── The clamps that keep it from becoming spam ────────────────────────── */
{
  check('دقيقة واحدة مابتبقاش دقيقة واحدة', R.settingsFrom({ delay_minutes: 1 }).delayMinutes === 15);
  check('وشهر مابيبقاش شهر', R.settingsFrom({ delay_minutes: 999999 }).delayMinutes === 7 * 24 * 60);
  check('وعشر محاولات بتبقى تلاتة', R.settingsFrom({ max_attempts: 10 }).maxAttempts === 3);
  check('وصفر يوم بيبقى يوم', R.settingsFrom({ cooldown_days: 0 }).cooldownDays === 1);
  check('وكلام مش رقم بيرجع للافتراضي', R.settingsFrom({ delay_minutes: 'كتير' }).delayMinutes === R.DEFAULTS.delayMinutes);
}

/* ── The job itself, driven against a fake database ────────────────────── */
/**
 * A database that behaves like Postgres for the three statements this job runs.
 *
 * The important part is that the UPDATE honours the SQL IT IS GIVEN rather than
 * enforcing the rule on its own: a fake that always guards the row would pass
 * this check even after somebody deletes the guard from the real statement, and
 * that is the one regression that matters most here.
 *
 * `snapshot` makes every SELECT return the rows as they were at the start —
 * which is what a second instance sees when it reads at the same moment.
 */
function fakePool(carts, opts = {}) {
  const rows = carts.map((c) => Object.assign({}, c));
  const original = carts.map((c) => Object.assign({}, c));
  const log = [];
  return {
    rows,
    log,
    async query(sql, params) {
      log.push(sql.trim().split('\n')[0]);
      if (/^SELECT/i.test(sql.trim())) {
        const src = opts.snapshot ? original : rows;
        return { rows: src.filter((r) => r.item_count > 0 && r.reminder_state !== 'sending').map((r) => Object.assign({}, r)) };
      }
      if (/SET reminder_state = 'sending'/.test(sql)) {
        const [id, attempts] = params;
        const row = rows.find((r) => r.id === id);
        if (!row) return { rows: [] };
        // Only the conditions the statement actually asks for.
        if (/reminder_attempts = \$2/.test(sql) && (Number(row.reminder_attempts) || 0) !== Number(attempts)) return { rows: [] };
        if (/reminder_state <> 'sending'/.test(sql) && row.reminder_state === 'sending') return { rows: [] };
        row.reminder_state = 'sending';
        row.reminder_attempts = (Number(row.reminder_attempts) || 0) + 1;
        return { rows: [{ id }] };
      }
      if (/SET reminder_state = \$2/.test(sql)) {
        const [id, state, error] = params;
        const row = rows.find((r) => r.id === id);
        if (row) { row.reminder_state = state; row.reminder_error = error; }
        return { rows: [{ id }] };
      }
      return { rows: [] };
    },
  };
}

const baseCart = {
  id: 1, company_id: 9, customer_name: 'س', items_summary: 'كرسي×1', total: 100, item_count: 1,
  updated_at: new Date(Date.now() - 3 * 3600 * 1000), reminder_state: null, reminder_at: null, reminder_attempts: 0,
  customer_email: 'buyer@example.com', slug: 'hand', company_name: 'متجر',
  enabled: true, delay_minutes: 60, cooldown_days: 7, max_attempts: 2, subject: null, body: null, coupon_code: null,
};

{
  const pool = fakePool([baseCart]);
  const sent = [];
  const stats = (await job.runDue(pool, { send: async (m) => { sent.push(m); return true; } }));
  check('الجولة بتبعت الإيميل مرة', stats.sent === 1 && sent.length === 1, JSON.stringify(stats));
  check('والحالة بقت «اتبعت»', pool.rows[0].reminder_state === 'sent' && !pool.rows[0].reminder_error);
  check('والرسالة فيها لينك السلة الحقيقي',
    /\/shop\/hand\/cart/.test(sent[0].text || ''), (sent[0].text || '').slice(-40));
  check('وبتروح لإيميل العميل', sent[0].to === 'buyer@example.com');
}

{
  // The whole point: run it twice, as two instances would.
  const pool = fakePool([baseCart]);
  const sent = [];
  const send = async (m) => { sent.push(m); return true; };
  (await job.runDue(pool, { send }));
  const second = (await job.runDue(pool, { send }));
  check('جولة تانية مابتبعتش نفس السلة تاني', sent.length === 1 && second.sent === 0, sent.length + ' رسالة');
}

{
  // And the case the claim exists for: two instances that both READ the cart
  // before either of them wrote. The second is holding a row that says "never
  // reminded", and the only thing between that stale row and a duplicate email
  // is the compare-and-swap on the attempt count.
  const pool = fakePool([baseCart], { snapshot: true });
  const sent = [];
  const send = async (m) => { sent.push(m); return true; };
  await job.runDue(pool, { send });
  await job.runDue(pool, { send });
  check('ونسختين قرأوا في نفس اللحظة بيبعتوا مرة واحدة', sent.length === 1, sent.length + ' رسالة');
}

{
  // A send that fails must be written down as a failure, with the reason.
  const pool = fakePool([baseCart]);
  const stats = (await job.runDue(pool, { send: async () => { throw new Error('SMTP down'); } }));
  check('الإرسال اللي فشل بيتكتب فشل مش نجاح',
    stats.failed === 1 && pool.rows[0].reminder_state === 'failed', pool.rows[0].reminder_state);
  check('والسبب متسجّل', /SMTP down/.test(pool.rows[0].reminder_error || ''), pool.rows[0].reminder_error);
}

{
  // `sendMail` answers false when SMTP is not configured. Treating that as a
  // success is the exact lie this check exists for.
  const pool = fakePool([baseCart]);
  const stats = (await job.runDue(pool, { send: async () => false }));
  check('و«الميلر رفض» مابيتحسبش إرسال ناجح',
    stats.failed === 1 && pool.rows[0].reminder_state === 'failed', pool.rows[0].reminder_state);
}

{
  // Ran out of attempts → stays failed, no third send.
  const pool = fakePool([Object.assign({}, baseCart, { reminder_state: 'failed', reminder_attempts: 2, reminder_at: new Date(Date.now() - 40 * 24 * 3600 * 1000), updated_at: new Date(Date.now() - 30 * 24 * 3600 * 1000) })]);
  let calls = 0;
  const stats = (await job.runDue(pool, { send: async () => { calls++; return true; } }));
  check('واللي خلّص محاولاته مابيتبعتلوش تالتة', calls === 0 && stats.sent === 0);
}

{
  // No customer email → skipped, and never marked as anything.
  const pool = fakePool([Object.assign({}, baseCart, { customer_email: null })]);
  let calls = 0;
  (await job.runDue(pool, { send: async () => { calls++; return true; } }));
  check('وعميل من غير إيميل مابيتبعتلوش ومابيتعلّمش غلط',
    calls === 0 && pool.rows[0].reminder_state === null);
}

/* ── WhatsApp: not automatic, and said so ──────────────────────────────── */
{
  const jsrc = fs.readFileSync(path.join(ROOT, 'src/shop/cart_recovery_job.js'), 'utf8');
  const lsrc = fs.readFileSync(path.join(ROOT, 'src/shop/cart_recovery.js'), 'utf8');
  check('الجوب مابيبعتش واتساب', !/sendWhatsApp/.test(jsrc));
  check('والقنوات التلقائية هي الإيميل بس', R.AUTO_CHANNELS.join(',') === 'email');
  // The sentence a merchant reads must name the reason, in both languages.
  check('والصفحة بتقول للتاجر إن الواتساب بضغطة منه (عربي)',
    /Cloud API/.test(strings.ar['cr.whatsapp_manual'] || ''));
  check('وبالإنجليزي كمان', /Cloud API/.test(strings.en['cr.whatsapp_manual'] || ''));
  check('والسبب مكتوب في الكود نفسه', /Cloud API/.test(lsrc));
}

/* ── The link in the email is a route this app has ─────────────────────── */
{
  process.env.SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://oscardevs.com';
  const url = job.cartUrl('hand');
  const shop = fs.readFileSync(path.join(ROOT, 'src/routes/shop.js'), 'utf8');
  const srv = stripComments(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'));
  check('لينك السلة مبني على راوت موجود فعلاً',
    /\/shop\/hand\/cart$/.test(url) && /router\.get\('\/:slug\/cart'/.test(shop) && /app\.use\('\/shop', shopRouter\)/.test(srv), url);
  // The tempting wrong answer: the subdomain does not serve /cart.
  check('ومش بيوعد بعنوان مابيخدمش السلة', !/^https:\/\/hand\./.test(url));
}

/* ── The panel tells the truth about each cart ─────────────────────────── */
{
  // Derive every reason the logic can produce and demand a translation, rather
  // than listing them and finding the gap on a merchant's screen.
  const whys = new Set();
  const settings = [R.settingsFrom(null), R.settingsFrom({ enabled: true })];
  const now = new Date('2026-08-19T12:00:00Z');
  const ago = (m) => new Date(now.getTime() - m * 60000);
  for (const s of settings) {
    for (const item_count of [0, 2]) {
      for (const customer_email of ['', 'a@b.c']) {
        for (const updated_at of [ago(1), ago(600), ago(60 * 24 * 30)]) {
          for (const st of [null, 'sent', 'failed', 'sending']) {
            for (const reminder_attempts of [0, 1, 2, 3]) {
              for (const reminder_at of [null, ago(30), ago(60 * 24 * 20)]) {
                whys.add(R.isDue({ item_count, customer_email, updated_at, reminder_state: st, reminder_attempts, reminder_at }, s, now).why);
              }
            }
          }
        }
      }
    }
  }
  const keys = [...whys].map((w) => 'cr.why.' + w)
    .concat(['none', 'sent', 'failed', 'sending'].map((s) => 'cr.state.' + s));
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل سبب ممكن ليه نص (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }

  const view = path.join(ROOT, 'src/views/company/abandoned.ejs');
  const src = fs.readFileSync(view, 'utf8')
    .replace(/<%-\s*include\('_layout_top'\)\s*%>/, '')
    .replace(/<%-\s*include\('_layout_bottom'\)\s*%>/, '');
  const s = R.settingsFrom({ enabled: true });
  const carts = [
    { id: 1, customer_name: 'س', customer_phone: '01000000000', customer_email: 'a@b.c', items_summary: 'كرسي', total: 100, item_count: 1, updated_at: new Date(), reminderState: 'sent', verdict: { due: false, why: 'sent' }, dueAt: new Date() },
    { id: 2, customer_name: null, customer_phone: null, customer_email: null, items_summary: '', total: 0, item_count: 1, updated_at: new Date(), reminderState: 'failed', reminder_error: 'SMTP down', verdict: { due: false, why: 'no_contact' }, dueAt: new Date() },
    { id: 3, customer_name: 'ن', customer_phone: '0100', customer_email: 'x@y.z', items_summary: 'ترابيزة', total: 50, item_count: 2, updated_at: new Date(), reminderState: 'none', verdict: { due: true, why: 'due' }, dueAt: new Date() },
  ];
  for (const lang of ['ar', 'en']) {
    for (const [label, data] of Object.entries({ 'فيها سلات': { carts }, 'فاضية': { carts: [] } })) {
      let html = null, error = null;
      try {
        html = ejs.render(src, Object.assign({
          t: (k) => t(k, lang), cur: () => (lang === 'ar' ? 'ج.م' : 'EGP'), LOC: lang === 'en' ? 'en-GB' : 'ar-EG',
          company: { slug: 'hand', whatsapp_number: '0100', company_name: 'متجر', currency: 'EGP' },
          session: {}, settings: s, defaults: { subject: R.DEFAULT_SUBJECT, body: R.DEFAULT_BODY },
          saved: true, err: 'save', pageTitle: '', activePage: '',
        }, data), { filename: view });
      } catch (e) { error = e.message.split('\n')[0]; }
      check(`صفحة السلات بتتعرض (${lang} · ${label})`, !error, error || 'تمام');
      if (html) {
        const raw = html.match(/\bcr\.[a-z_.]+/g);
        check(`ومفيش مفتاح ترجمة طالع (${lang} · ${label})`, !raw, raw ? raw[0] : 'ولا واحد');
      }
    }
  }
}

/* ── Saving, and the answer when the save did not happen ───────────────── */
{
  const company = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8'));
  const from = company.indexOf("router.post('/abandoned/settings'");
  // To the next route, not to the first `});` — the handler has plenty of those.
  const body = company.slice(from, company.indexOf('router.', from + 20));
  check('حفظ فشل مابيقولش «اتحفظ»',
    /err=save/.test(body) && body.indexOf('err=save') < body.indexOf('saved=1'));
  check('والإعدادات بتتقرا من نفس الحدود اللي الجوب بيقراها',
    /cartRecovery\.settingsFrom\(\{/.test(body));
  // The interval must be no coarser than the shortest delay a merchant can set.
  const srv = stripComments(fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'));
  const m = srv.match(/cartRecoveryJob\.runDue[\s\S]{0,160}?\}, (\d+) \* 60 \* 1000\)/);
  check('والجوب بيدور كل مدة مش أطول من أقل تأخير مسموح',
    !!m && Number(m[1]) <= 15, m ? m[1] + ' دقيقة' : 'مش مربوط بمؤقّت');
}

console.log(fail === 0 ? '\n✅ استرجاع السلات بيبعت مرة، وبيقول الحقيقة.' : `\n❌ ${fail} مشكلة.`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('❌ الفحص نفسه وقع:', e.message); process.exit(1); });
