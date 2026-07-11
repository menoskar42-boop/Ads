'use strict';

// ── Sokro — AI Operating System (sokro.oscardevs.com) ────────────────────────
// Host-routed sub-app on the OscarDevs platform (mounted like mykid/kakeibo).
// Phase 2 = runnable skeleton: a public landing page + health/API smoke checks.
// Later phases add auth, memory, the LLM layer, browser automation, the planner
// (with validator + retry), skills/workflows, permissions, scheduler and voice.
const express = require('express');
const config = require('./core/config');

const router = express.Router();

const TITLE = 'Sokro — مساعدك الذكي اللي بينفّذ المهام بصوتك';
const DESC = 'Sokro نظام ذكاء اصطناعي بينفّذ مهامك الحقيقية بأمر صوتي: بحث وتقارير، توليد صور، حجوزات، ونشر على السوشيال — إنت تقول، وهو ينفّذ.';

// Health + API smoke check (mobile app / uptime probes hit these).
router.get('/health', (_req, res) => res.json({ ok: true, service: 'sokro', env: config.env }));
router.get('/api/ping', (_req, res) => res.json({ ok: true, pong: true, features: config.features }));

// Public landing page (indexable, SEO/AdSense-aware — real content, no ads yet).
router.get('/', (_req, res) => {
  res.type('html').set('Cache-Control', 'no-cache').send(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${TITLE}</title>
<meta name="description" content="${DESC}" />
<link rel="canonical" href="${config.origin}/" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${TITLE}" />
<meta property="og:description" content="${DESC}" />
<meta property="og:url" content="${config.origin}/" />
<meta property="og:locale" content="ar_EG" />
<meta name="theme-color" content="#0b1020" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet" />
<style>
  *{box-sizing:border-box;font-family:'Cairo',system-ui,sans-serif;margin:0}
  body{background:radial-gradient(1200px 600px at 50% -10%,#1b2550,#0b1020);color:#eef1ff;min-height:100vh}
  .wrap{max-width:820px;margin:0 auto;padding:64px 22px;text-align:center}
  .badge{display:inline-block;background:rgba(120,140,255,.15);border:1px solid rgba(120,140,255,.35);color:#aebbff;border-radius:999px;padding:6px 14px;font-size:.82rem;font-weight:700}
  h1{font-size:clamp(1.9rem,6vw,3rem);font-weight:900;line-height:1.25;margin:18px 0 10px}
  h1 span{background:linear-gradient(90deg,#7c8bff,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}
  p.sub{color:#c3c9ee;font-size:1.08rem;line-height:1.9;max-width:620px;margin:0 auto 26px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:34px;text-align:right}
  .card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px}
  .card .ico{font-size:1.6rem}
  .card h3{margin:8px 0 4px;font-size:1.02rem}
  .card p{color:#b9c0e6;font-size:.9rem;line-height:1.7}
  footer{margin-top:44px;color:#8b93c0;font-size:.82rem}
  a{color:#8ea2ff}
</style>
</head>
<body>
  <main class="wrap">
    <span class="badge">🚧 قيد التطوير — نظام تشغيل ذكي</span>
    <h1>قول لـ <span>Sokro</span> اللي عايزه… وهو ينفّذه</h1>
    <p class="sub">Sokro مش مجرد مساعد بيرد. ده نظام بينفّذ مهام حقيقية بأمر صوتي: يبحث ويعملّك تقرير، يخلق صورة، يحجز، أو ينشر بوست — إنت تقول، وهو يعمل.</p>
    <div class="grid">
      <div class="card"><div class="ico">🔎</div><h3>بحث + تقرير</h3><p>يبحث ويلخّص ويطلّعلك تقرير Excel/PDF جاهز.</p></div>
      <div class="card"><div class="ico">🎨</div><h3>توليد صور</h3><p>يخلق الصورة اللي في دماغك ويبعتهالك.</p></div>
      <div class="card"><div class="ico">✈️</div><h3>حجوزات</h3><p>يدوّر ويجهّز حجز التذكرة أو الفندق لحد التأكيد.</p></div>
      <div class="card"><div class="ico">📱</div><h3>نشر سوشيال</h3><p>ينشر بوستاتك على حساباتك بأمان بإذنك.</p></div>
    </div>
    <footer>Sokro — أحد منتجات <a href="https://oscardevs.com/our-work">OscarDevs</a>.</footer>
  </main>
</body>
</html>`);
});

module.exports = router;
