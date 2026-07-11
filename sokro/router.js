'use strict';

// ── Sokro — AI Operating System (sokro.oscardevs.com) ────────────────────────
// Host-routed sub-app on the OscarDevs platform (mounted like mykid/kakeibo).
// Phase 2 = runnable skeleton: a public landing page + health/API smoke checks.
// Later phases add auth, memory, the LLM layer, browser automation, the planner
// (with validator + retry), skills/workflows, permissions, scheduler and voice.
const express = require('express');
const { Pool } = require('pg');
const config = require('./core/config');
const auth = require('./auth');
const vault = require('./secrets/vault');
const memory = require('./memory');
const actions = require('./actions'); // registers built-in actions on load
const registry = require('./registry'); // unified Actions + Skills resolver
const browser = require('./browser');
const planner = require('./ai/planner');
const executor = require('./workflows/executor');
const { loginLimiter } = require('../src/middleware/rateLimit');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = express.Router();

const TITLE = 'Sokro — مساعدك الذكي اللي بينفّذ المهام بصوتك';
const DESC = 'Sokro نظام ذكاء اصطناعي بينفّذ مهامك الحقيقية بأمر صوتي: بحث وتقارير، توليد صور، حجوزات، ونشر على السوشيال — إنت تقول، وهو ينفّذ.';

// Health + API smoke check (mobile app / uptime probes hit these).
router.get('/health', (_req, res) => res.json({ ok: true, service: 'sokro', env: config.env }));
router.get('/api/ping', (_req, res) => res.json({ ok: true, pong: true, features: config.features }));

// LLM layer status (no API call / no cost) — confirms the active provider + key.
router.get('/api/llm/status', auth.requireAuth, (_req, res) => {
  const llm = require('./llm');
  try {
    const p = llm.get();
    res.json({ ok: true, provider: p.name, configured: !!p.configured, models: p.models, available: llm.available() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Auth API (mobile + web) ──────────────────────────────────────────────────
const COOKIE = { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 };

router.post('/api/auth/signup', loginLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const name = String(req.body.name || '').trim().slice(0, 80) || null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8) {
      return res.status(400).json({ ok: false, error: 'email صحيح + كلمة سر 8 أحرف على الأقل' });
    }
    const hash = await auth.hashPassword(password);
    let row;
    try {
      row = (await pool.query(
        'INSERT INTO sokro_users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id, email',
        [email, hash, name]
      )).rows[0];
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ ok: false, error: 'الإيميل مسجّل بالفعل' });
      throw e;
    }
    const token = auth.sign({ sub: row.id, email: row.email });
    res.cookie('sokro_token', token, COOKIE);
    res.json({ ok: true, token, user: { id: row.id, email: row.email } });
  } catch (e) { console.error('[sokro] signup:', e.message); res.status(500).json({ ok: false, error: 'server error' }); }
});

router.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const u = (await pool.query('SELECT id, email, password_hash FROM sokro_users WHERE email = $1', [email])).rows[0];
    if (!u || !(await auth.checkPassword(password, u.password_hash))) {
      return res.status(401).json({ ok: false, error: 'بيانات الدخول غير صحيحة' });
    }
    const token = auth.sign({ sub: u.id, email: u.email });
    res.cookie('sokro_token', token, COOKIE);
    res.json({ ok: true, token, user: { id: u.id, email: u.email } });
  } catch (e) { console.error('[sokro] login:', e.message); res.status(500).json({ ok: false, error: 'server error' }); }
});

router.post('/api/auth/logout', (_req, res) => { res.clearCookie('sokro_token'); res.json({ ok: true }); });

router.get('/api/auth/me', auth.requireAuth, async (req, res) => {
  const u = (await pool.query('SELECT id, email, display_name, created_at FROM sokro_users WHERE id = $1', [req.sokroUser.id])).rows[0];
  if (!u) return res.status(404).json({ ok: false });
  res.json({ ok: true, user: u });
});

// ── Secrets vault API — store/list/delete. Values are AES-256-GCM encrypted and
// NEVER returned in plaintext or sent to the AI. Listing exposes names only. ───
router.post('/api/secrets', auth.requireAuth, async (req, res) => {
  try {
    if (!vault.configured()) return res.status(503).json({ ok: false, error: 'vault key not configured (SOKRO_SECRET_KEY)' });
    const name = String(req.body.name || '').trim().toLowerCase().slice(0, 60);
    const value = String(req.body.value || '');
    if (!name || !value) return res.status(400).json({ ok: false, error: 'name + value مطلوبين' });
    const ciphertext = vault.encrypt(value);
    await pool.query(
      `INSERT INTO sokro_secrets (user_id, name, ciphertext) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, name) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = now()`,
      [req.sokroUser.id, name, ciphertext]
    );
    res.json({ ok: true, name });
  } catch (e) { console.error('[sokro] secret save:', e.message); res.status(500).json({ ok: false, error: 'server error' }); }
});

router.get('/api/secrets', auth.requireAuth, async (req, res) => {
  const rows = (await pool.query('SELECT name, updated_at FROM sokro_secrets WHERE user_id = $1 ORDER BY name', [req.sokroUser.id])).rows;
  res.json({ ok: true, secrets: rows }); // names only — never values
});

router.delete('/api/secrets/:name', auth.requireAuth, async (req, res) => {
  await pool.query('DELETE FROM sokro_secrets WHERE user_id = $1 AND name = $2', [req.sokroUser.id, String(req.params.name).toLowerCase()]);
  res.json({ ok: true });
});

// ── Memory API (read) ────────────────────────────────────────────────────────
router.get('/api/conversations', auth.requireAuth, async (req, res) => {
  res.json({ ok: true, conversations: await memory.listConversations(req.sokroUser.id) });
});
router.get('/api/conversations/:id/messages', auth.requireAuth, async (req, res) => {
  const msgs = await memory.getMessagesFor(req.sokroUser.id, parseInt(req.params.id, 10), 100);
  if (msgs === null) return res.status(404).json({ ok: false, error: 'not found' });
  res.json({ ok: true, messages: msgs });
});
router.get('/api/context', auth.requireAuth, async (req, res) => {
  res.json({ ok: true, context: await memory.getContext(req.sokroUser.id) });
});

// ── Actions API ──────────────────────────────────────────────────────────────
router.get('/api/actions', auth.requireAuth, (_req, res) => {
  res.json({ ok: true, browserAvailable: browser.available(), actions: registry.catalog() });
});
router.post('/api/actions/:name/run', auth.requireAuth, async (req, res) => {
  const action = registry.get(req.params.name);
  if (!action) return res.status(404).json({ ok: false, error: 'unknown action' });
  const ctx = {
    userId: req.sokroUser.id,
    llm: require('./llm'),
    memory,
    browser,
    actions: registry,
    log: (name, data) => console.log('[sokro:action]', name, JSON.stringify(data || {})),
  };
  try {
    const result = await action.run(ctx, req.body || {});
    res.json(result && typeof result.ok !== 'undefined' ? result : { ok: true, output: result });
  } catch (e) {
    console.error('[sokro] action run:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Orchestrator: plan → execute (validate + retry) → summarize ──────────────
router.post('/api/run', auth.requireAuth, async (req, res) => {
  const goal = String((req.body && req.body.goal) || '').trim();
  if (!goal) return res.status(400).json({ ok: false, error: 'goal required' });
  const ctx = {
    userId: req.sokroUser.id,
    llm: require('./llm'),
    memory, browser, actions: registry,
    log: (name, data) => console.log('[sokro:action]', name, JSON.stringify(data || {})),
  };
  try {
    const task = await memory.createTask(req.sokroUser.id, goal, (req.body && req.body.conversationId) || null);
    ctx.taskId = task.id;
    const plan = await planner.plan(ctx, goal);
    await memory.updateTask(task.id, { plan, status: 'running' });
    const results = await executor.execute(ctx, plan);
    const ok = results.length > 0 && results.every((r) => r.result.ok);
    const summary = await planner.summarize(ctx, goal, results);
    await memory.updateTask(task.id, { status: ok ? 'done' : 'failed', result: { summary } });
    res.json({ ok, taskId: task.id, intent: plan.intent, plan: plan.steps, message: plan.message, results, summary });
  } catch (e) {
    console.error('[sokro] run:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

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
