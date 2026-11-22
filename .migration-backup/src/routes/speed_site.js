// speed.oscardevs.com — موقع تطبيق «مراقب السرعة» لوحده (المالك ٢٠٢٦-١٠-٠٩):
// صفحة التطبيق وزرار تحميله (بدل Google Play — مؤجَّل)، ولوحة الشركات، وAPI التطبيق.
//
// بيتركّب فى server.js بالـhost (زى kakeibo/sokro) قبل خط الموقع الرئيسى (i18n/المتاجر/الإعلانات)،
// وأى مسار مش هنا بيرجع 404 — مايعدّيش لموقع OscarDevs ولا لمتجر اسمه speed.
// والجلسة هنا host-only: دخول لوحة الشركة مالوش علاقة بجلسة الموقع الرئيسى ولا العكس.
//
// ⚠️ لسه تجربة: noindex، من غير إعلانات، ومش فى سايت‌ماب ولا llms.txt (scripts/check-fleet.js).
'use strict';

const express = require('express');

const router = express.Router();

// الـAPK بيتبنى على GitHub (.github/workflows/speedguard-apk.yml) وبيتنشر كـ pre-release على
// تاج ثابت — مش «latest» عشان مايكسرش لينك NeuroPilot.
const APK_URL = process.env.SPEEDGUARD_APK_URL
  || 'https://github.com/menoskar42-boop/Ads/releases/download/speedguard-latest/speed-guard.apk';

router.use((req, res, next) => {
  res.locals.showAds = false;
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// مسموح يتزحف عشان الزاحف يشوف noindex (المنع فى robots.txt بيخفى الـnoindex نفسه) — ومفيش سايت‌ماب.
router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\n');
});

router.get('/', (req, res) => {
  res.render('fleet/landing', { notReady: req.query.e === 'notready', layout: false });
});

// لينكنا الثابت قدّام ملف GitHub. من غير ما نتبع التحويل: github.com بيرد 302 لو الملف موجود
// و404 لو لأ — التحويل نفسه رايح لرابط تخزين موقّع لـGET بس وHEAD عليه ممكن يترفض.
router.get('/download', async (req, res) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4000);
  try {
    const r = await fetch(APK_URL, { method: 'HEAD', redirect: 'manual', signal: ac.signal });
    if (!(r.ok || (r.status >= 300 && r.status < 400))) return res.redirect('/?e=notready');
    return res.redirect(302, APK_URL);
  } catch (e) {
    return res.redirect(302, APK_URL);   // GitHub بطىء — نوديه على الملف بدل ما نقفل الطريق
  } finally {
    clearTimeout(timer);
  }
});

router.use('/fleet', require('./fleet'));

router.use((req, res) => {
  res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">'
    + '<title>مش موجود</title><p style="font:16px/1.8 system-ui;padding:2rem;direction:rtl">'
    + 'الصفحة دى مش موجودة. <a href="/">صفحة مراقب السرعة</a></p>');
});

module.exports = router;
