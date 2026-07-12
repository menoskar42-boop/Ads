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
const permissions = require('./permissions');
const voice = require('./voice');
const settings = require('./settings');
const reports = require('./reports');
const scheduler = require('./scheduler');
const extBridge = require('./extension-bridge');
const realtime = require('./realtime');
const path = require('path');
const multer = require('multer');
const uploadAudio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } }).single('audio');
const { loginLimiter } = require('../src/middleware/rateLimit');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = express.Router();

const TITLE = 'Sokro — مساعدك الذكي اللي بينفّذ المهام بصوتك';
const DESC = 'Sokro نظام ذكاء اصطناعي بينفّذ مهامك الحقيقية بأمر صوتي: بحث وتقارير، توليد صور، حجوزات، ونشر على السوشيال — إنت تقول، وهو ينفّذ.';

// Health + API smoke check (mobile app / uptime probes hit these).
router.get('/health', (_req, res) => res.json({ ok: true, service: 'sokro', env: config.env }));
router.get('/api/ping', (_req, res) => res.json({ ok: true, pong: true, features: config.features }));

// ── SEO: subdomain-specific robots.txt + sitemap ────────────────────────────
// The landing page ('/') is real content → indexable. Everything else on this
// subdomain (the app shell, all APIs, the extension, internal cron) has no
// crawlable content and must stay out of the index — mirrors the AdSense/SEO
// rule (no thin/app pages in search). Google treats a subdomain as its own
// property, so it needs its own robots + sitemap, not the main site's.
router.get('/robots.txt', (_req, res) => {
  res.type('text/plain').set('Cache-Control', 'public, max-age=86400').send(
    'User-agent: *\n' +
    'Allow: /$\n' +
    'Disallow: /app\n' +
    'Disallow: /api/\n' +
    'Disallow: /ext/\n' +
    'Disallow: /internal/\n' +
    'Sitemap: ' + config.origin + '/sitemap.xml\n'
  );
});
router.get('/sitemap.xml', (_req, res) => {
  res.type('application/xml').set('Cache-Control', 'public, max-age=86400').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    '  <url><loc>' + config.origin + '/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n' +
    '</urlset>\n'
  );
});

// LLM layer status (no API call / no cost) — confirms the active provider + key.
router.get('/api/llm/status', auth.requireAuth, (_req, res) => {
  const llm = require('./llm');
  try {
    const p = llm.get();
    res.json({ ok: true, provider: p.name, configured: !!p.configured, models: p.models, available: llm.available() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Auth API (mobile + web) ──────────────────────────────────────────────────
const COOKIE = { httpOnly: true, sameSite: 'lax', secure: config.env === 'production', path: '/', maxAge: 7 * 24 * 3600 * 1000 };

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
  // Consent gate: direct execution (used by the realtime tool-call bridge and
  // the actions UI) must NOT bypass the consent the planner enforces. Sensitive
  // actions (browser/login/social/payment…) can only run through /api/run, which
  // pauses for the user's confirmation first.
  if (permissions.isSensitive(action.permissions)) {
    return res.status(403).json({
      ok: false, requiresConsent: true,
      sensitive: (action.permissions || []).filter((p) => permissions.SENSITIVE.has(p)),
      error: 'هذا الإجراء يتطلب تأكيدًا — نفّذه من خلال طلب كامل (/api/run) عشان ياخد موافقتك الأول',
    });
  }
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
function sokroCtx(userId, taskId, prefs) {
  return {
    userId, taskId, prefs: prefs || {},
    llm: require('./llm'),
    memory, browser, actions: registry,
    log: (name, data) => console.log('[sokro:action]', name, JSON.stringify(data || {})),
  };
}
async function executePlan(ctx, goal, taskId, plan, res, convId) {
  await memory.updateTask(taskId, { status: 'running' });
  const results = await executor.execute(ctx, plan);
  const techOk = results.length > 0 && results.every((r) => r.result.ok);
  const s = await planner.summarize(ctx, goal, results); // { summary, achieved }
  const summary = s && s.summary;
  // Semantic success = technically ok AND the goal was actually achieved.
  const ok = techOk && (s ? s.achieved !== false : true);
  await memory.updateTask(taskId, { status: ok ? 'done' : 'failed', result: { summary, achieved: ok } });
  if (convId && summary) { try { await memory.addMessage(convId, 'assistant', summary); } catch (_) {} }
  res.json({ ok, taskId, conversationId: convId || null, plan: plan.steps, results, summary, achieved: ok });
}

// Plan the goal; if it needs SENSITIVE permissions, pause and ask for (voice)
// consent, otherwise execute immediately (e.g. search/report just runs).
router.post('/api/run', auth.requireAuth, async (req, res) => {
  const goal = String((req.body && req.body.goal) || '').trim();
  if (!goal) return res.status(400).json({ ok: false, error: 'goal required' });
  try {
    const prefs = await settings.get(req.sokroUser.id);
    // Resolve (or start) a conversation so the whole exchange is remembered.
    let convId = (req.body && req.body.conversationId) || null;
    if (!convId) convId = (await memory.createConversation(req.sokroUser.id, goal.slice(0, 60))).id;
    // Pull the recent turns BEFORE recording the new one, so the planner has the
    // conversation context (follow-up questions like "و كمان بالإنجليزي") without
    // duplicating the current goal it appends itself.
    let recentContext = [];
    try {
      const prev = await memory.getMessagesFor(req.sokroUser.id, convId, 8);
      if (Array.isArray(prev)) recentContext = prev.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1500) }));
    } catch (_) {}
    await memory.addMessage(convId, 'user', goal);
    const task = await memory.createTask(req.sokroUser.id, goal, convId);
    const ctx = sokroCtx(req.sokroUser.id, task.id, prefs);
    const plan = await planner.plan(ctx, goal, recentContext);
    const perms = permissions.forPlan(plan, registry);
    await memory.updateTask(task.id, { plan, status: perms.requiresConsent ? 'awaiting_consent' : 'running' });
    if (perms.requiresConsent) {
      return res.json({ ok: true, taskId: task.id, conversationId: convId, intent: plan.intent, plan: plan.steps, permissions: perms, requiresConsent: true, message: plan.message || null });
    }
    if (!plan.steps || !plan.steps.length) {
      await memory.updateTask(task.id, { status: 'failed' });
      const msg = plan.message || null;
      if (msg) { try { await memory.addMessage(convId, 'assistant', msg); } catch (_) {} }
      return res.json({ ok: false, taskId: task.id, conversationId: convId, plan: [], message: msg });
    }
    return await executePlan(ctx, goal, task.id, plan, res, convId);
  } catch (e) {
    console.error('[sokro] run:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Resume a paused task after the user grants (voice) consent.
router.post('/api/run/:taskId/execute', auth.requireAuth, async (req, res) => {
  try {
    const t = (await pool.query('SELECT id, goal, plan, conversation_id FROM sokro_tasks WHERE id = $1 AND user_id = $2', [parseInt(req.params.taskId, 10), req.sokroUser.id])).rows[0];
    if (!t) return res.status(404).json({ ok: false, error: 'task not found' });
    if (!t.plan || !Array.isArray(t.plan.steps)) return res.status(400).json({ ok: false, error: 'task has no plan' });
    const prefs = await settings.get(req.sokroUser.id);
    return await executePlan(sokroCtx(req.sokroUser.id, t.id, prefs), t.goal, t.id, t.plan, res, t.conversation_id);
  } catch (e) {
    console.error('[sokro] execute:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Voice → text (Whisper).
router.post('/api/voice', auth.requireAuth, (req, res) => uploadAudio(req, res, async () => {
  if (!req.file) return res.status(400).json({ ok: false, error: 'audio required' });
  try { res.json({ ok: true, text: await voice.transcribe(req.file.buffer, req.file.originalname || 'audio.webm') }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
}));

// Text → speech (high-quality Egyptian Arabic). Returns MP3 audio.
router.post('/api/speak', auth.requireAuth, async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'text required' });
  try {
    const s = await settings.get(req.sokroUser.id);
    const mp3 = await voice.speak(text, { voice: settings.ttsVoice(s.voice), lang: s.lang });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(mp3);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Per-user assistant settings (voice / language / personality / name) ──────
router.get('/api/settings', auth.requireAuth, async (req, res) => {
  res.json({ ok: true, settings: await settings.get(req.sokroUser.id), options: { voices: settings.VOICES, langs: settings.LANGS, personalities: settings.PERSONALITIES } });
});
router.put('/api/settings', auth.requireAuth, async (req, res) => {
  res.json({ ok: true, settings: await settings.update(req.sokroUser.id, req.body || {}) });
});

// Generate + download a report (Excel / Markdown / CSV / JSON) from content the
// assistant produced. Returned as a file attachment — no server storage needed.
router.post('/api/report', auth.requireAuth, async (req, res) => {
  const b = req.body || {};
  const payload = { title: String(b.title || 'report'), text: String(b.text || ''), rows: Array.isArray(b.rows) ? b.rows : null };
  try {
    const fmt = String(b.format || 'md').toLowerCase();
    const f = fmt === 'pdf' ? await reports.toPDF(payload) : reports.build(b.format, payload);
    const name = (payload.title || 'report').replace(/[^\w؀-ۿ -]/g, '').trim().slice(0, 60) || 'report';
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(name) + '.' + f.ext);
    res.send(f.buffer);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Scheduler / watchers (recurring goals) ───────────────────────────────────
router.post('/api/schedule', auth.requireAuth, async (req, res) => {
  const goal = String((req.body && req.body.goal) || '').trim();
  if (!goal) return res.status(400).json({ ok: false, error: 'goal required' });
  res.json({ ok: true, task: await scheduler.create(req.sokroUser.id, goal, req.body.everyMinutes) });
});
router.get('/api/schedule', auth.requireAuth, async (req, res) => {
  res.json({ ok: true, tasks: await scheduler.list(req.sokroUser.id) });
});
router.delete('/api/schedule/:id', auth.requireAuth, async (req, res) => {
  await scheduler.remove(req.sokroUser.id, req.params.id);
  res.json({ ok: true });
});
// Cron tick — hit by an external scheduler (e.g. Replit Scheduled Deployment /
// cron-job.org) every N minutes. Protected by the SOKRO_CRON_KEY header.
router.post('/internal/cron', async (req, res) => {
  const key = process.env.SOKRO_CRON_KEY;
  if (!key || req.headers['x-cron-key'] !== key) return res.status(403).json({ ok: false, error: 'forbidden' });
  try { res.json({ ok: true, ran: await scheduler.runDue(20) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Browser-extension bridge (uses the user's LIVE browser) ──────────────────
// The extension long-polls for a command, runs it in the user's real browser
// (logged-in sessions), and posts the result back.
router.post('/api/ext/poll', auth.requireAuth, async (req, res) => {
  extBridge.markSeen(req.sokroUser.id);
  try { res.json({ ok: true, command: await extBridge.next(req.sokroUser.id) }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
router.post('/api/ext/result', auth.requireAuth, async (req, res) => {
  const b = req.body || {};
  if (!b.id) return res.status(400).json({ ok: false, error: 'id required' });
  try { await extBridge.result(req.sokroUser.id, b.id, b.output, b.error); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
router.get('/api/ext/status', auth.requireAuth, (req, res) => {
  res.json({ ok: true, connected: extBridge.connected(req.sokroUser.id) });
});

// Mint an ephemeral Realtime session token (client connects to OpenAI directly).
router.post('/api/realtime/session', auth.requireAuth, async (req, res) => {
  try {
    const s = await realtime.session(req.sokroUser.id);
    res.json({ ok: true, model: s.model, clientSecret: s.clientSecret });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// The single voice app screen.
router.get('/app', (_req, res) => res.type('html').set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, 'ui', 'app.html')));

// Serve the Chrome extension files (zip these to load unpacked).
router.get('/ext/:file', (req, res) => {
  const safe = /^[a-zA-Z0-9._-]+$/.test(req.params.file) ? req.params.file : 'manifest.json';
  res.sendFile(path.join(__dirname, 'extension', safe));
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
  .cta{display:inline-block;margin-top:26px;background:linear-gradient(90deg,#5b6cff,#22d3ee);color:#08122b;font-weight:800;text-decoration:none;border-radius:100px;padding:13px 30px}
  section{max-width:820px;margin:0 auto;padding:0 22px 8px;text-align:right}
  section h2{font-size:clamp(1.3rem,4vw,1.7rem);margin:40px 0 12px;font-weight:900}
  section p,section li{color:#c3c9ee;line-height:1.95;font-size:1rem}
  section ul{margin:8px 24px}
  .steps{counter-reset:s;list-style:none;margin:8px 0;padding:0}
  .steps li{position:relative;padding:8px 44px 8px 0;margin-bottom:6px}
  .steps li::before{counter-increment:s;content:counter(s);position:absolute;right:0;top:6px;width:30px;height:30px;border-radius:50%;background:rgba(120,140,255,.18);border:1px solid rgba(120,140,255,.4);color:#aebbff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:.9rem}
  details{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px 18px;margin:10px 0}
  details summary{cursor:pointer;font-weight:700;color:#eef1ff}
  details p{margin-top:8px}
  footer{margin-top:44px;color:#8b93c0;font-size:.82rem;text-align:center;padding:24px;border-top:1px solid rgba(255,255,255,.06)}
  footer a{margin:0 8px}
  a{color:#8ea2ff}
</style>
</head>
<body>
  <main class="wrap">
    <span class="badge">نظام تشغيل ذكي بالأوامر الصوتية</span>
    <h1>قول لـ <span>Sokro</span> اللي عايزه… وهو ينفّذه</h1>
    <p class="sub">Sokro مش مجرد مساعد بيرد. ده نظام بينفّذ مهام حقيقية بأمر صوتي أو كتابي: يبحث ويعملّك تقرير، يخلق صورة، يجهّز حجز، أو يلخّص صفحة — إنت تقول، وهو يعمل. المحادثات بتتحفظ في حسابك، وأي خطوة حسّاسة ماتتنفّذش غير بموافقتك.</p>
    <a class="cta" href="${config.origin}/app">جرّب Sokro دلوقتي</a>
    <div class="grid">
      <div class="card"><div class="ico">🔎</div><h3>بحث + تقرير</h3><p>يبحث في الويب، يلخّص المصادر، ويطلّعلك تقرير Excel أو Markdown جاهز للتنزيل.</p></div>
      <div class="card"><div class="ico">🎨</div><h3>توليد صور</h3><p>تقوله يرسم أو يخلق صورة بوصف بسيط، ويرجّعهالك في المحادثة على طول.</p></div>
      <div class="card"><div class="ico">🗣️</div><h3>مكالمة صوتية مباشرة</h3><p>مكالمة حيّة زي المساعدات الصوتية — يسمعك ويرد بصوت، وينفّذ المهام أثناء الكلام.</p></div>
      <div class="card"><div class="ico">⚙️</div><h3>إعدادات شخصية</h3><p>تختار اسم المساعد، شخصيته، صوته (أنثى/ذكر)، ولغة الرد (مصري/فصحى/إنجليزي).</p></div>
    </div>
  </main>

  <section>
    <h2>Sokro إيه بالظبط؟</h2>
    <p>Sokro نظام مساعد ذكي بينفّذ مهام فعلية بدل ما يكتفي بالرد. بتديله هدف بصوتك أو بالكتابة — زي «ابحثلي عن أسعار كذا واعملّي تقرير» أو «ارسملي صورة لمنتج» — فيحلّل الطلب، يخطّط الخطوات، وينفّذها باستخدام أدوات متخصصة (بحث ويب، توليد صور، تلخيص، تقارير). هو أحد منتجات <a href="https://oscardevs.com/our-work">OscarDevs</a>، ومبني ليشتغل من المتصفح ومن الموبايل بنفس الحساب.</p>

    <h2>حالات استخدام</h2>
    <ul>
      <li><strong>بحث سوق سريع:</strong> يجمع أسعار/منتجات من الويب ويطلّعها في تقرير منظّم.</li>
      <li><strong>محتوى بصري:</strong> توليد صور لمنشور أو فكرة أو تصوّر مبدئي لمنتج.</li>
      <li><strong>تلخيص وأبحاث:</strong> يقرا صفحات ويطلّع خلاصة نقاط + مصادر.</li>
      <li><strong>مهام صوتية أثناء المشي/السواقة:</strong> تكلّمه وهو يرد وينفّذ من غير ما تكتب.</li>
    </ul>

    <h2>إزاي بيشتغل؟</h2>
    <ol class="steps">
      <li>بتقول أو تكتب اللي عايزه بلغتك الطبيعية.</li>
      <li>Sokro يفهم القصد ويرسم خطة خطوات واضحة.</li>
      <li>لو الخطة فيها خطوة حسّاسة (زي دخول حساب أو نشر)، بيوقف ويطلب موافقتك الأول.</li>
      <li>ينفّذ الأدوات المطلوبة ويرجّعلك النتيجة (نص/صورة/تقرير) — والمحادثة تتحفظ في حسابك.</li>
    </ol>

    <h2>الخصوصية والأمان</h2>
    <p>حسابك محميّ بكلمة سر مشفّرة، والجلسات موقّعة بمفتاح سرّي. أي بيانات اعتماد بتضيفها بتتخزّن مشفّرة (AES-256) وماتترجعش كنص ولا تتبعت للموديل. الأوامر الحسّاسة — زي تشغيل متصفح أو النشر على السوشيال — <strong>ماتتنفّذش إلا بموافقة صريحة منك</strong>، والوصول للمواقع الداخلية/الخاصة محجوب لأسباب أمنية. للتفاصيل الكاملة راجع <a href="https://oscardevs.com/privacy">سياسة الخصوصية</a>.</p>

    <h2>حدود التنفيذ</h2>
    <p>Sokro أداة مساعدة، مش بديل عن قرارك. ممكن نتائج البحث تكون ناقصة أو محتاجة مراجعة، وتوليد الصور له قيود المزوّد. الخطوات اللي تلمس حسابات أو مدفوعات بتحتاج تأكيدك، والمنتج قيد التطوير المستمر فبنضيف قدرات ونحسّن باستمرار.</p>

    <h2>أسئلة شائعة</h2>
    <details><summary>محتاج أعمل حساب؟</summary><p>أيوه، بتسجّل بإيميل وكلمة سر عشان محادثاتك وإعداداتك تتحفظ وترجعلك في أي جهاز.</p></details>
    <details><summary>بيتكلم مصري ولا فصحى ولا إنجليزي؟</summary><p>تقدر تختار لغة الرد من الإعدادات: مصري (الافتراضي)، فصحى، أو إنجليزي — وكمان صوت أنثى أو ذكر واسم وشخصية للمساعد.</p></details>
    <details><summary>هل ينفّذ أي حاجة من غير ما يسألني؟</summary><p>لأ. المهام العادية (بحث/صورة/تلخيص) بتتنفّذ على طول، لكن أي خطوة حسّاسة بتوقف وتطلب موافقتك الأول.</p></details>
    <details><summary>بيشتغل على الموبايل؟</summary><p>أيوه، بيشتغل من المتصفح على الموبايل والكمبيوتر بنفس الحساب.</p></details>
  </section>

  <footer>
    Sokro — أحد منتجات <a href="https://oscardevs.com/our-work">OscarDevs</a>.
    <br/>
    <a href="https://oscardevs.com/privacy">الخصوصية</a> ·
    <a href="https://oscardevs.com/terms">الشروط</a> ·
    <a href="https://oscardevs.com/contact">تواصل معنا</a>
  </footer>

  <script type="application/ld+json">{"@context":"https://schema.org","@type":"SoftwareApplication","name":"Sokro","applicationCategory":"BusinessApplication","operatingSystem":"Web","description":${JSON.stringify(DESC)},"url":"${config.origin}/","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},"publisher":{"@type":"Organization","name":"OscarDevs","url":"https://oscardevs.com"}}</script>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"محتاج أعمل حساب لاستخدام Sokro؟","acceptedAnswer":{"@type":"Answer","text":"أيوه، بتسجّل بإيميل وكلمة سر عشان المحادثات والإعدادات تتحفظ وترجعلك في أي جهاز."}},{"@type":"Question","name":"Sokro بيتكلم مصري ولا فصحى ولا إنجليزي؟","acceptedAnswer":{"@type":"Answer","text":"تقدر تختار لغة الرد من الإعدادات: مصري (الافتراضي)، فصحى، أو إنجليزي، وكمان صوت أنثى أو ذكر."}},{"@type":"Question","name":"هل ينفّذ أي مهمة من غير موافقة؟","acceptedAnswer":{"@type":"Answer","text":"لأ. المهام العادية زي البحث وتوليد الصور بتتنفّذ مباشرة، لكن أي خطوة حسّاسة بتوقف وتطلب موافقتك الأول."}}]}</script>
</body>
</html>`);
});

module.exports = router;
