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

  // جملة من تأليف السواق بصوت أوسكار (تتولّد مرة واحدة وتتحفظ على الشاشة). محدودة: ٢٠ فى اليوم لكل عنوان، ١٢٠ حرف.
  const voice = require('../drive/voice');
  router.post('/api/car/voice', rateLimit({ name: 'od-voice', windowMs: 24 * 60 * 60000, max: 20 }), json, carAuth, async (req, res) => {
    const text = String((req.body && req.body.text) || '').trim().slice(0, 120);
    // جمل السواق بتتولّد بـOpenAI (ElevenLabs المجانى للجمل الثابتة بس) — نفس النوع (راجل/ست) لو الشاشة على صوت ElevenLabs
    const v = /female$/.test(String((req.body && req.body.voice) || '')) ? 'female' : 'male';
    const lang = req.body && req.body.lang === 'en' ? 'en' : 'ar';
    if (!text) return fail(res, 400, 'empty');
    try {
      const buf = await voice.tts(text, v, lang);
      res.type('audio/mpeg').send(buf);
    } catch (e) { fail(res, 503, 'voice unavailable'); }
  });

  // صور الطريق لتدريب موديل المطبات (٢٠٢٦-١١-١٨) — src/drive/shots.js
  const shots = require('../drive/shots');
  const shotJson = express.json({ limit: '1200kb' });
  router.post('/api/car/shot', rateLimit({ name: 'od-shot', windowMs: 60 * 60000, max: 400 }), shotJson, carAuth, async (req, res) => {
    const p = shots.parse(req.body);
    if (p.error) return fail(res, p.error === 'too big' ? 413 : 400, p.error);
    try { await shots.save(pool, req.car.id, p); res.json({ ok: true }); }
    catch (e) { fail(res, 500, 'shot failed'); }
  });

  // ذاكرة الطريق (٢٠٢٦-١١-١٨) — src/drive/hazards.js: رفع بالـuuid (من غير تكرار)، و`pull` بيرجّع ذاكرة العربية كلها.
  const hz = require('../drive/hazards');
  router.post('/api/car/hazards', rateLimit({ name: 'od-hazards', windowMs: 60 * 60000, max: 240 }), json, carAuth, async (req, res) => {
    try {
      const saved = await hz.save(pool, req.car.id, hz.parseItems(req.body));
      const out = { ok: true, saved };
      if (req.body && req.body.pull === true) {
        out.items = await hz.list(pool, req.car.id);
        out.deleted = await hz.deletedUuids(pool, req.car.id);
      }
      res.json(out);
    } catch (e) { fail(res, 500, 'hazards failed'); }
  });
  // شاشة اتسطّبت من جديد بتكتب كود من صفحة الموبايل ⇒ تاخد نفس العربية. التخمين: ٦ أرقام × ١٠ دقايق × ١٠ محاولات.
  router.post('/api/car/relink', rateLimit({ name: 'od-relink', windowMs: 10 * 60000, max: 10 }), json, carAuth, async (req, res) => {
    try {
      const r = await hz.relink(pool, req.car, req.body && req.body.code);
      if (!r) return fail(res, 400, 'الكود غلط أو خلص وقته — اطلب كود جديد من صفحة الموبايل');
      res.json({ ok: true, name: r.name });
    } catch (e) { fail(res, 500, 'relink failed'); }
  });

  // الموبايلات اللى بتشارك GPS دلوقتى (الشاشة بتقرّر تثق فيهم ولا لأ).
  router.post('/api/car/companions', json, carAuth, (req, res) => {
    res.json({ ok: true, devices: require('../drive/companions').list(req.car.id), inbox: inbox.hasPending(req.car.id) });
  });
  // «🩺 فحص الشاشة» للمقارنة مع الموبايل — src/drive/diag.js
  const diag = require('../drive/diag');
  router.post('/api/car/diag', rateLimit({ name: 'od-diag-car', windowMs: 60 * 60000, max: 30 }), json, carAuth, async (req, res) => {
    const d = diag.clean(req.body);
    if (!d) return fail(res, 400, 'empty');
    try { await diag.saveCar(pool, req.car.id, d); res.json({ ok: true }); } catch (e) { fail(res, 500, 'diag failed'); }
  });
  // «📲 ابعت للشاشة»: الشاشة بتأكّد اللى استلمته وبتاخد الجديد — src/drive/inbox.js
  const inbox = require('../drive/inbox');
  router.post('/api/car/inbox', rateLimit({ name: 'od-inbox-car', windowMs: 60 * 60000, max: 600 }), json, carAuth, async (req, res) => {
    try { res.json({ ok: true, items: await inbox.take(pool, req.car.id, req.body && req.body.ack) }); }
    catch (e) { fail(res, 500, 'inbox failed'); }
  });

  // الربط بـQR: الشاشة بتطلب رقم (بيتعرض QR) وبتسأل لحد ما الموبايل يأكّده.
  router.post('/api/car/claim', rateLimit({ name: 'od-claim', windowMs: 10 * 60000, max: 10 }), json, carAuth, async (req, res) => {
    try {
      const code = await hz.newClaim(pool, req.car.id);
      res.json({ ok: true, code, url: 'https://drive.oscardevs.com/#claim=' + code, minutes: 10 });
    } catch (e) { fail(res, 500, 'claim failed'); }
  });
  router.post('/api/car/claim-status', json, carAuth, (req, res) => res.json({ ok: true, ...hz.claimStatus(req.car) }));

  // manifest صوت أوسكار (بيتحسب من الملفات الموجودة — لو السكربت ماتشغّلش لسه، الجمل من غير ملفات والتطبيق بيقول بصوت الشاشة)
  router.get('/voice/:v/manifest.json', (req, res) => {
    const v = voice.ALL_VOICES.includes(req.params.v) ? req.params.v : 'male';
    res.set('Cache-Control', 'no-cache').json(voice.manifest(v));
  });

  /* ───────── صفحة المالك ───────── */

  // تخمين الكود: ٦ أرقام × ١٠ دقايق × ١٠ محاولات فى ١٠ دقايق لكل عنوان.
  router.post('/api/web/pair', rateLimit({ name: 'od-pair', windowMs: 10 * 60000, max: 10 }), json, async (req, res) => {
    try {
      const r = await store.pairOwner(pool, req.body && req.body.code);
      if (!r) return fail(res, 400, 'الكود غلط أو خلص وقته — اطلب كود جديد من شاشة العربية');
      // كان شغّال «لوحده» ⇒ مطباته وصوره ورسايله للشاشة بتتنقل للعربية دى
      const prev = await store.ownerByToken(pool, bearer(req)).catch(() => null);
      const moved = prev ? await store.absorbSolo(pool, prev.car_id, r.carId).catch(() => false) : false;
      res.json({ ok: true, token: r.token, moved });
    } catch (e) { fail(res, 500, 'pair failed'); }
  });

  // «الموبايل لوحده»: الصفحة بتفتح على طول من غير ربط — بتاخد توكن لعربية افتراضية، والربط بشاشة اختيارى بعدين.
  router.post('/api/web/solo', rateLimit({ name: 'od-solo', windowMs: 60 * 60000, max: 10 }), async (req, res) => {
    try { res.json({ ok: true, token: (await store.createSolo(pool)).token }); }
    catch (e) { fail(res, 500, 'solo failed'); }
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

  router.get('/api/web/shots', ownerAuth, async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json({ ok: true, ...(await shots.list(pool, req.owner.car_id)) }); }
    catch (e) { fail(res, 500, 'shots failed'); }
  });
  router.post('/api/web/shots/clear-test', ownerAuth, async (req, res) => {
    try { res.json({ ok: true, cleared: await shots.clearTest(pool, req.owner.car_id) }); }
    catch (e) { fail(res, 500, 'clear failed'); }
  });
  router.post('/api/web/shots/:id/delete', ownerAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return fail(res, 400, 'bad id');
    try { res.json({ ok: true, deleted: await shots.remove(pool, req.owner.car_id, id) }); }
    catch (e) { fail(res, 500, 'delete failed'); }
  });
  router.get('/api/web/shots/:id/jpg', ownerAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return fail(res, 400, 'bad id');
    try {
      const b = await shots.jpg(pool, req.owner.car_id, id);
      if (!b) return fail(res, 404, 'not found');
      res.set('Cache-Control', 'private, max-age=86400').type('image/jpeg').send(b);
    } catch (e) { fail(res, 500, 'shot failed'); }
  });
  // zip بالصور الجديدة (?all=1 = كلها) — لحد ٢٠ ميجا، والباقى فى المرة الجاية
  router.get('/api/web/shots.zip', ownerAuth, async (req, res) => {
    try {
      const z = await shots.exportZip(pool, req.owner.car_id, req.query.all === '1', undefined, req.query.test === '1');
      if (!z.count) return fail(res, 404, 'مفيش صور جديدة');
      const name = `oscar-road-shots-${new Date().toISOString().slice(0, 10)}.zip`;
      res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'X-Shots': String(z.count),
        'X-More': z.more ? '1' : '0', 'Cache-Control': 'no-store' });
      res.send(z.buf);
    } catch (e) { fail(res, 500, 'zip failed'); }
  });

  // الموبايل لوحده (المرحلة ٣ — ٢٠٢٦-١١-١٨): يسجّل/يمسح مطبات على نفس ذاكرة العربية، ووضع تجربة مابينزلش على الشاشة.
  router.get('/api/web/hazards', ownerAuth, async (req, res) => {
    try { res.json({ ok: true, items: await hz.list(pool, req.owner.car_id, true) }); }
    catch (e) { fail(res, 500, 'hazards failed'); }
  });
  router.post('/api/web/hazards', rateLimit({ name: 'od-web-hazards', windowMs: 60 * 60000, max: 600 }), json, ownerAuth, async (req, res) => {
    try {
      if (req.body && req.body.clearTest === true) return res.json({ ok: true, cleared: await hz.clearTest(pool, req.owner.car_id) });
      res.json({ ok: true, saved: await hz.save(pool, req.owner.car_id, hz.parseItems(req.body)) });
    } catch (e) { fail(res, 500, 'hazards failed'); }
  });

  // «أوسكار مش فاهم» ⇒ ذكاء اصطناعى (المالك ٢٠٢٦-١١-٢٠) — src/drive/intent.js. النص بس، ٣٠٠ مرة فى اليوم بالكتير.
  const intent = require('../drive/intent');
  const intentRoute = async (req, res) => {
    const text = String((req.body && req.body.text) || '').slice(0, 200);
    if (!text.trim()) return fail(res, 400, 'no text');
    try { res.json({ ok: true, ai: intent.available(), ...((await intent.understand(text)) || { cmd: null }) }); }
    catch (e) { fail(res, 500, 'intent failed'); }
  };
  router.post('/api/web/intent', rateLimit({ name: 'od-web-intent', windowMs: 24 * 60 * 60000, max: 300 }), json, ownerAuth, intentRoute);
  const contactNameRoute = async (req, res) => {
    const body = req.body || {};
    if (Object.keys(body).some((key) => key !== 'name')) return fail(res, 400, 'invalid contact name request');
    const name = String(body.name || '').trim();
    if (!name || name.length > 60) return fail(res, 400, 'invalid contact name');
    try { res.json({ ok: true, ai: intent.available(), latin: await intent.suggestLatinName(name) }); }
    catch (e) { fail(res, 500, 'contact name suggestion failed'); }
  };
  router.post('/api/web/contact-name', rateLimit({ name: 'od-web-contact-name', windowMs: 24 * 60 * 60000, max: 300 }), json, ownerAuth, contactNameRoute);
  // «أقرب …» من صفحة الموبايل بداتا جوجل (src/drive/places.js) — من غير GOOGLE_PLACES_KEY ⇒ { places:false }
  const places = require('../drive/places');
  router.get('/api/web/nearest', rateLimit({ name: 'od-web-nearest', windowMs: 24 * 60 * 60000, max: 200 }), ownerAuth, async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json({ ok: true, ...(await places.nearest(String(req.query.kind || ''), Number(req.query.lat), Number(req.query.lng))) }); }
    catch (e) { fail(res, 500, 'nearest failed'); }
  });
  router.post('/api/car/intent', rateLimit({ name: 'od-car-intent', windowMs: 24 * 60 * 60000, max: 300 }), json, carAuth, intentRoute);

  // «أوسكار خد اسكرين شوت» من الموبايل لوحده (المرحلة ٣): نفس صور الطريق (R2 لو متظبّط) — الشاشة مش لازم تكون مربوطة.
  router.post('/api/web/shot', rateLimit({ name: 'od-web-shot', windowMs: 60 * 60000, max: 400 }), shotJson, ownerAuth, async (req, res) => {
    const p = shots.parse(req.body);
    if (p.error) return fail(res, p.error === 'too big' ? 413 : 400, p.error);
    try { await shots.save(pool, req.owner.car_id, p); res.json({ ok: true }); }
    catch (e) { fail(res, 500, 'shot failed'); }
  });

  // «📡 شارك GPS مع العربية» (المرحلة ٢): آخر قراءة بس فى الذاكرة — src/drive/companions.js
  const comp = require('../drive/companions');
  router.post('/api/web/fix', rateLimit({ name: 'od-fix', windowMs: 60 * 60000, max: 4000 }), json, ownerAuth, (req, res) => {
    if (req.body && req.body.stop === true) { comp.stop(req.owner.car_id, req.owner.owner_id); return res.json({ ok: true }); }
    const f = comp.parseFix(req.body);
    if (!f) return fail(res, 400, 'bad fix');
    comp.put(req.owner.car_id, req.owner.owner_id, f);
    res.json({ ok: true });
  });

  // «ربط شاشة جديدة بنفس العربية» (بعد مسح التطبيق) — كود لمرة واحدة ١٠ دقايق.
  router.post('/api/web/relink', ownerAuth, async (req, res) => {
    try { res.json({ ok: true, code: await hz.newRelinkCode(pool, req.owner.car_id), minutes: 10 }); }
    catch (e) { fail(res, 500, 'relink failed'); }
  });

  // الموبايل مسح QR الشاشة الجديدة (أو كتب رقمها) ⇒ الشاشة بتبقى نفس العربية. التخمين: ٨ أرقام × ١٠ دقايق × ١٠ محاولات.
  router.post('/api/web/claim', rateLimit({ name: 'od-claim-web', windowMs: 10 * 60000, max: 10 }), json, ownerAuth, async (req, res) => {
    try {
      const r = await hz.claim(pool, req.owner.car_id, req.body && req.body.code);
      if (!r) return fail(res, 400, 'الرقم غلط أو خلص وقته — اعرض QR جديد على الشاشة');
      res.json({ ok: true, name: r.name });
    } catch (e) { fail(res, 500, 'claim failed'); }
  });

  router.post('/api/web/diag', rateLimit({ name: 'od-diag-web', windowMs: 60 * 60000, max: 30 }), json, ownerAuth, async (req, res) => {
    const d = diag.clean(req.body);
    if (!d) return fail(res, 400, 'empty');
    try { await diag.saveOwner(pool, req.owner.owner_id, d); res.json({ ok: true }); } catch (e) { fail(res, 500, 'diag failed'); }
  });
  router.get('/api/web/diag', ownerAuth, async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json({ ok: true, ...(await diag.compare(pool, req.owner.car_id, req.owner.owner_id)) }); }
    catch (e) { fail(res, 500, 'diag failed'); }
  });
  router.get('/api/web/inbox', ownerAuth, async (req, res) => {
    try { res.set('Cache-Control', 'no-store'); res.json({ ok: true, items: await inbox.recent(pool, req.owner.car_id) }); }
    catch (e) { fail(res, 500, 'inbox failed'); }
  });
  router.post('/api/web/inbox', rateLimit({ name: 'od-inbox-web', windowMs: 60 * 60000, max: 300 }), json, ownerAuth, async (req, res) => {
    const it = inbox.parse(req.body);
    if (it.error) return fail(res, 400, it.error);
    try {
      const r = await inbox.add(pool, req.owner.car_id, it);
      if (r.error) return fail(res, 429, r.error);
      res.json({ ok: true });
    } catch (e) { fail(res, 500, 'inbox failed'); }
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
