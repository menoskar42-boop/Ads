// drive.oscardevs.com — Oscar Drive + Oscar Security (المالك ٢٠٢٦-١١-٠٥).
//
// ١) API الشاشة (/api/car/*) — بتوكن الجهاز: تسجيل · دفعة أماكن وأحداث · كود ربط موبايل.
// ٢) صفحة المالك (/) — PWA تتثبّت على الآيفون/الأندرويد: مكان العربية · خط السير · الحماية · التنبيهات.
//    الدخول بكود ٦ أرقام بيظهر على الشاشة (مفيش إيميل ولا باسورد)، والتوكن فى الموبايل.
// ٣) الإشعارات (Web Push بنفس مفاتيح VAPID بتاعة الموقع).
//
// noindex ومن غير إعلانات ومش فى السايت‌ماب: أداة خاصة بصاحب العربية (scripts/check-oscardrive.js).
// بيتركّب فى server.js بالـhost قبل خط الموقع الرئيسى، وأى مسار مش هنا = 404 هنا.
'use strict';

const path = require('path');
const express = require('express');
const store = require('../drive/store');
const L = require('../drive/logic');
const { rateLimit } = require('../middleware/rateLimit');

const WEB_DIR = path.join(__dirname, '..', '..', 'drive-web');

function createDriveSite({ pool, push } = {}) {
  const router = express.Router();
  const json = express.json({ limit: '1mb' });

  router.use((req, res, next) => {
    res.locals.showAds = false;
    res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });

  router.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\n'));

  const bearer = (req) => {
    const h = String(req.headers.authorization || '');
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  };
  const fail = (res, code, msg) => res.status(code).json({ ok: false, error: msg });

  async function notify(carId, payload) {
    if (!push || !push.isEnabled()) return;
    const subs = await store.subsForCar(pool, carId).catch(() => []);
    await Promise.all(subs.map((s) => push.send({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      .catch((e) => { if (e && (e.statusCode === 404 || e.statusCode === 410)) return store.removeSub(pool, s.endpoint); })));
  }

  /* ───────── الشاشة ───────── */

  // تسجيل شاشة جديدة — مرة واحدة فى عمر التطبيق. محدود عشان محدش يملا القاعدة.
  router.post('/api/car/register', rateLimit({ name: 'od-register', windowMs: 60 * 60000, max: 10 }), json, async (req, res) => {
    try {
      const r = await store.registerCar(pool, req.body && req.body.app);
      res.json({ ok: true, token: r.token });
    } catch (e) { fail(res, 500, 'register failed'); }
  });

  async function carAuth(req, res, next) {
    try {
      const car = await store.carByToken(pool, bearer(req));
      if (!car) return fail(res, 401, 'unknown device');
      req.car = car;
      next();
    } catch (e) { fail(res, 500, 'auth failed'); }
  }

  router.post('/api/car/sync', json, carAuth, async (req, res) => {
    try {
      const r = await store.sync(pool, req.car, req.body || {});
      for (const ev of r.fresh) {
        const p = L.pushFor(ev, r.car.name);
        if (p) notify(r.car.id, { title: p.title, body: p.body, tag: 'od-' + ev.kind, url: '/' }).catch(() => {});
      }
      res.json({ ok: true, armed: r.car.armed, armedVer: r.car.armed_ver, name: r.car.name, saved: r.counts });
    } catch (e) { fail(res, 500, 'sync failed'); }
  });

  router.post('/api/car/pair', json, carAuth, async (req, res) => {
    try { res.json({ ok: true, code: await store.newPairCode(pool, req.car.id), minutes: 10 }); }
    catch (e) { fail(res, 500, 'pair failed'); }
  });

  /* ───────── صفحة المالك ───────── */

  // تخمين الكود: ٦ أرقام × ١٠ دقايق × ١٠ محاولات فى ١٠ دقايق لكل عنوان.
  router.post('/api/web/pair', rateLimit({ name: 'od-pair', windowMs: 10 * 60000, max: 10 }), json, async (req, res) => {
    try {
      const r = await store.pairOwner(pool, req.body && req.body.code);
      if (!r) return fail(res, 400, 'الكود غلط أو خلص وقته — اطلب كود جديد من شاشة العربية');
      res.json({ ok: true, token: r.token });
    } catch (e) { fail(res, 500, 'pair failed'); }
  });

  async function ownerAuth(req, res, next) {
    try {
      const o = await store.ownerByToken(pool, bearer(req));
      if (!o) return fail(res, 401, 'not paired');
      req.owner = o;
      next();
    } catch (e) { fail(res, 500, 'auth failed'); }
  }

  router.get('/api/web/state', ownerAuth, async (req, res) => {
    try {
      const s = await store.state(pool, req.owner.car_id);
      if (!s) return fail(res, 404, 'car gone');
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, ...s, push: { enabled: !!(push && push.isEnabled()), key: push ? push.publicKey() : '' } });
    } catch (e) { fail(res, 500, 'state failed'); }
  });

  router.get('/api/web/track', ownerAuth, async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json({ ok: true, points: await store.track(pool, req.owner.car_id, req.query.hours) }); }
    catch (e) { fail(res, 500, 'track failed'); }
  });

  router.post('/api/web/arm', json, ownerAuth, async (req, res) => {
    try {
      const r = await store.setArmed(pool, req.owner.car_id, !!(req.body && req.body.armed));
      res.json({ ok: true, armed: r.armed });
    } catch (e) { fail(res, 500, 'arm failed'); }
  });

  router.post('/api/web/rename', json, ownerAuth, async (req, res) => {
    try { res.json({ ok: await store.rename(pool, req.owner.car_id, req.body && req.body.name) }); }
    catch (e) { fail(res, 500, 'rename failed'); }
  });

  router.post('/api/web/push', json, ownerAuth, async (req, res) => {
    try { res.json({ ok: await store.saveSub(pool, req.owner.owner_id, req.body && req.body.subscription) }); }
    catch (e) { fail(res, 500, 'push failed'); }
  });

  router.post('/api/web/logout', ownerAuth, async (req, res) => {
    try { await store.logoutOwner(pool, req.owner.owner_id); res.json({ ok: true }); }
    catch (e) { fail(res, 500, 'logout failed'); }
  });

  // الصفحة نفسها (PWA) — ملفات ثابتة. الـservice worker لازم من الجذر عشان يغطّى الصفحة كلها.
  router.use(express.static(WEB_DIR, { index: 'index.html', maxAge: 0, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

  router.use((req, res) => {
    res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
      + '<title>مش موجود</title><p style="font:16px/1.8 system-ui;padding:2rem;direction:rtl">'
      + 'الصفحة دى مش موجودة. <a href="/">Oscar Drive</a></p>');
  });

  /** «انقطع الاتصال»: كل دقيقة — عربية كانت ماشية وسكتت فجأة. */
  function startJobs() {
    const lost = setInterval(async () => {
      try {
        for (const c of await store.claimLostCars(pool)) {
          const where = c.last_lat != null ? ` آخر مكان: ${(+c.last_lat).toFixed(5)}, ${(+c.last_lng).toFixed(5)}` : '';
          await notify(c.id, { title: '📡 انقطع الاتصال بالعربية', body: `${c.name} كانت ماشية ووقفت تبعت فجأة.${where}`, tag: 'od-lost', url: '/' });
        }
      } catch (e) { /* القاعدة نايمة — الدورة الجاية */ }
    }, 60 * 1000);
    const prune = setInterval(() => { store.prune(pool).catch(() => {}); }, 6 * 60 * 60 * 1000);
    lost.unref(); prune.unref();
  }

  return { router, startJobs };
}

module.exports = { createDriveSite };
