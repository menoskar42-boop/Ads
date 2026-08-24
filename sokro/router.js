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
const content = require('./content');
const booking = require('./booking');
const bookingStore = booking.store;
const whatsappCloud = require('./channels/whatsapp-cloud');
const phone = require('./channels/phone');
const audit = require('./audit');
const timeParser = require('./time-parser');
const bookingProviders = require('./booking/providers');
const path = require('path');
const multer = require('multer');
const uploadAudio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } }).single('audio');
const uploadFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }).single('file');
const { loginLimiter } = require('../src/middleware/rateLimit');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = express.Router();

const TITLE = 'Sokro — وكيل ذكاء اصطناعي عربي للبحث والتقارير';
const DESC = 'Sokro وكيل ذكاء اصطناعي عربي (AI agent) ينفّذ مهامك بأمر صوتي أو نصّي: بحث في الويب وتقارير Excel/PDF، توليد صور، وتلخيص — إنت تقول، وهو ينفّذ ويطلّع النتيجة.';

// Health + API smoke check (mobile app / uptime probes hit these).
router.get('/health', (_req, res) => res.json({ ok: true, service: 'sokro', env: config.env }));
router.get('/api/ping', (_req, res) => res.json({ ok: true, pong: true, features: config.features }));

// ── Business WhatsApp Cloud API ─────────────────────────────────────────────
router.get('/api/channels/whatsapp/webhook', (req, res) => {
  if (!process.env.SOKRO_WHATSAPP_VERIFY_TOKEN || String(req.query['hub.verify_token'] || '') !== String(process.env.SOKRO_WHATSAPP_VERIFY_TOKEN)) return res.sendStatus(403);
  res.type('text/plain').send(String(req.query['hub.challenge'] || ''));
});
router.post('/api/channels/whatsapp/webhook', async (req, res) => {
  try {
    if (process.env.SOKRO_WHATSAPP_APP_SECRET && !whatsappCloud.verifySignature(req.rawBody || JSON.stringify(req.body || {}), req.headers['x-hub-signature-256'])) return res.sendStatus(403);
    const messages = whatsappCloud.incoming(req.body);
    for (const m of messages) {
      if (!m.messageId || !m.phoneId || !m.text) continue;
      const account = (await pool.query('SELECT user_id FROM sokro_channel_accounts WHERE provider=$1 AND external_id=$2', ['whatsapp_cloud', m.phoneId])).rows[0];
      if (!account) continue;
      const fresh = (await pool.query(
        `INSERT INTO sokro_channel_messages (user_id,provider,external_message_id,sender,body,direction)
         VALUES ($1,'whatsapp_cloud',$2,$3,$4,'inbound') ON CONFLICT (external_message_id) DO NOTHING RETURNING id`,
        [account.user_id, m.messageId, m.from, m.text]
      )).rows[0];
      if (fresh) {
        const conv = await memory.createConversation(account.user_id, 'WhatsApp');
        await memory.addMessage(conv.id, 'user', m.text);
      }
    }
    res.sendStatus(200);
  } catch (e) { console.error('[sokro] whatsapp webhook:', e.message); res.sendStatus(500); }
});

// ── SEO: subdomain-specific robots.txt + sitemap ────────────────────────────
// The landing page ('/') is real content → indexable. Everything else on this
// subdomain (the app shell, all APIs, the extension, internal cron) has no
// crawlable content and must stay out of the index — mirrors the AdSense/SEO
// rule (no thin/app pages in search). Google treats a subdomain as its own
// property, so it needs its own robots + sitemap, not the main site's.
router.get('/robots.txt', (_req, res) => {
  // NOTE: /app is intentionally NOT disallowed. It carries a <meta noindex>, and
  // Google can only honor noindex if it's allowed to crawl the page (blocking it
  // in robots would leave a bare, description-less /app URL indexable via inbound
  // links). Only non-content endpoints are disallowed.
  res.type('text/plain').set('Cache-Control', 'public, max-age=86400').send(
    'User-agent: *\n' +
    'Disallow: /api/\n' +
    'Disallow: /ext/\n' +
    'Disallow: /internal/\n' +
    'Sitemap: ' + config.origin + '/sitemap.xml\n'
  );
});
router.get('/sitemap.xml', (_req, res) => {
  const urls = ['  <url><loc>' + config.origin + '/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>']
    .concat(content.PAGES.map((p) => '  <url><loc>' + config.origin + '/guides/' + p.slug + '</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>'));
  res.type('application/xml').set('Cache-Control', 'public, max-age=86400').send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n'
  );
});

// Public content guides (indexable, real content, internal-linked).
router.get('/guides/:slug', (req, res) => {
  const page = content.get(String(req.params.slug || ''));
  if (!page) return res.status(404).type('text/plain; charset=utf-8').send('الصفحة غير موجودة');
  res.type('html').set('Cache-Control', 'public, max-age=3600').send(content.render(page));
});

// LLM layer status (no API call / no cost) — confirms the active provider + key.
router.get('/api/llm/status', auth.requireAuth, (_req, res) => {
  const llm = require('./llm');
  try {
    const p = llm.get();
    res.json({ ok: true, provider: p.name, configured: !!p.configured, models: p.models, available: llm.available() });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
// Real LLM health check — makes a tiny actual call so you can tell if the API key
// is out of quota/credits (which would make every plan/summary silently generic).
router.get('/api/llm/test', auth.requireAuth, async (_req, res) => {
  try {
    const llm = require('./llm');
    const { text } = await llm.chat({ messages: [{ role: 'user', content: 'Reply with the single word: OK' }], maxTokens: 5 });
    res.json({ ok: true, working: /ok/i.test(text || ''), reply: (text || '').slice(0, 40) });
  } catch (e) {
    // Surface the real provider error (e.g. 429 insufficient_quota / 401 invalid key).
    res.json({ ok: false, working: false, error: String(e.message || e).slice(0, 300) });
  }
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

// ── Gmail API (OAuth2) — connect once, then the gmail_api skill reads/sends mail
// through the official API (reliable, no scraping). We store ONLY the encrypted
// refresh token in the vault (sokro_secrets 'gmail_refresh'); access tokens are
// minted on demand and never persisted. Needs GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET.
const gmail = require('./integrations/gmail');
const GMAIL_SECRET_NAME = 'gmail_refresh';

router.get('/api/gmail/status', auth.requireAuth, async (req, res) => {
  const row = (await pool.query('SELECT 1 FROM sokro_secrets WHERE user_id=$1 AND name=$2', [req.sokroUser.id, GMAIL_SECRET_NAME])).rows[0];
  res.json({ ok: true, configured: gmail.configured(), connected: !!row });
});

// Start the OAuth flow. state = a short-lived signed token carrying the user id
// (CSRF protection: the callback only accepts a state it signed for THIS user).
router.get('/api/gmail/connect', auth.requireAuth, (req, res) => {
  if (!gmail.configured()) return res.status(503).type('text/plain; charset=utf-8').send('Gmail API غير مُفعّل — لازم يتضبط GMAIL_CLIENT_ID و GMAIL_CLIENT_SECRET في الإعدادات الأول.');
  if (!vault.configured()) return res.status(503).type('text/plain; charset=utf-8').send('الخزنة غير مضبوطة (SOKRO_SECRET_KEY) — مش ممكن نخزّن التوكن بأمان.');
  const state = auth.sign({ sub: req.sokroUser.id, purpose: 'gmail_oauth' }, 600);
  res.redirect(gmail.authUrl(state));
});

// Google redirects back here with ?code + ?state. Verify state, exchange the
// code for a refresh token, encrypt + store it, then bounce back to the app.
router.get('/api/gmail/callback', async (req, res) => {
  try {
    if (req.query.error) return res.redirect('/app?gmail=denied');
    const claims = auth.verify(String(req.query.state || ''));
    if (!claims || claims.purpose !== 'gmail_oauth' || !claims.sub) return res.status(400).type('text/plain; charset=utf-8').send('state غير صالح — ابدأ الربط من جديد.');
    const code = String(req.query.code || '');
    if (!code) return res.redirect('/app?gmail=denied');
    const tok = await gmail.exchangeCode(code);
    if (!tok.refresh_token) {
      // Google only returns a refresh_token on the first consent. Force re-consent
      // by sending them through again (authUrl already sets prompt=consent).
      return res.redirect('/app?gmail=retry');
    }
    const ciphertext = vault.encrypt(tok.refresh_token);
    await pool.query(
      `INSERT INTO sokro_secrets (user_id, name, ciphertext) VALUES ($1,$2,$3)
       ON CONFLICT (user_id, name) DO UPDATE SET ciphertext = EXCLUDED.ciphertext, updated_at = now()`,
      [claims.sub, GMAIL_SECRET_NAME, ciphertext]
    );
    res.redirect('/app?gmail=connected');
  } catch (e) {
    console.error('[sokro] gmail callback:', e.message);
    res.redirect('/app?gmail=error');
  }
});

router.delete('/api/gmail', auth.requireAuth, async (req, res) => {
  await pool.query('DELETE FROM sokro_secrets WHERE user_id=$1 AND name=$2', [req.sokroUser.id, GMAIL_SECRET_NAME]);
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

// ── Is there a browser, and which one? ───────────────────────────────────────
//
// The app showed one static «🧩 المتصفح» chip whether the extension was
// connected or had never been installed. So a user asked Sokro to open a site,
// waited, and got an apology — the one fact that would have explained it was
// on the screen the whole time, saying nothing.
//
// Three honest states: the user's own browser (their logged-in sessions), the
// server's Chromium (public pages only), or nothing — and the last one says
// what to do about it.
router.get('/api/browser/status', auth.requireAuth, (req, res) => {
  const ext = extBridge.connected(req.sokroUser.id);
  const srv = browser.status();
  const mode = ext ? 'extension' : (srv.ok ? 'server' : 'none');
  res.json({
    ok: true, mode, extension: ext, server: srv.ok,
    label: { extension: 'متصل بمتصفّحك', server: 'متصفّح السيرفر', none: 'وصّل الإضافة' }[mode],
    hint: mode === 'extension' ? 'الجلسات اللي مسجّل دخولك فيها متاحة.'
      : mode === 'server' ? 'بيفتح الصفحات العامة بس — من غير حساباتك.'
        : (browser.unavailableMessage(srv.why) + ' أو ثبّت إضافة سوكرو من /ext ووصّلها.'),
  });
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
  // Browser tools may run mid-call once the user CONFIRMS (by voice/tap) — the
  // client re-sends with consent:true. Truly high-risk scopes (login/payment/
  // social) still can't be self-approved here and must go through /api/run.
  const IN_CALL_OK = new Set(['browse', 'navigate_site', 'operate', 'extract_table', 'fill_submit']);
  if (permissions.isSensitive(action.permissions)) {
    const consented = req.body && req.body.consent === true && IN_CALL_OK.has(req.params.name);
    if (!consented) {
      return res.status(403).json({
        ok: false, requiresConsent: true,
        sensitive: (action.permissions || []).filter((p) => permissions.SENSITIVE.has(p)),
        error: 'هذا الإجراء يتطلب تأكيدًا — أكّد بصوتك أو من خلال طلب كامل (/api/run) عشان ياخد موافقتك الأول',
      });
    }
  }
  const ctx = {
    userId: req.sokroUser.id,
    // The user already confirmed here (voice/tap) → the extension must NOT ask again.
    consented: !!(req.body && req.body.consent === true),
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
  try { await audit.record(ctx.userId, 'execution', { taskId, permissions: permissions.forPlan(plan, registry).required, outcome: ok ? 'success' : 'failed' }); } catch (_) {}
  await memory.updateTask(taskId, { status: ok ? 'done' : 'failed', result: { summary, achieved: ok } });
  if (convId && summary) { try { await memory.addMessageFor(ctx.userId, convId, 'assistant', summary); } catch (_) {} }
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
    else if (!(await memory.getMessagesFor(req.sokroUser.id, convId, 1))) {
      return res.status(403).json({ ok: false, error: 'conversation not found' });
    }
    // Pull the recent turns BEFORE recording the new one, so the planner has the
    // conversation context (follow-up questions like "و كمان بالإنجليزي") without
    // duplicating the current goal it appends itself.
    let recentContext = [];
    try {
      const prev = await memory.getMessagesFor(req.sokroUser.id, convId, 8);
      if (Array.isArray(prev)) recentContext = prev.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 1500) }));
    } catch (_) {}
    await memory.addMessageFor(req.sokroUser.id, convId, 'user', goal);
    const task = await memory.createTask(req.sokroUser.id, goal, convId);
    const ctx = sokroCtx(req.sokroUser.id, task.id, prefs);
    const plan = await planner.plan(ctx, goal, recentContext);
    const perms = permissions.forPlan(plan, registry);
    // WHERE, before "confirm?". Approving "book me a ticket" is not approving a
    // form on a site the user has never heard of, and these domains become the
    // allowlist the run is held to.
    const writeGuard = require('./lib/writeGuard');
    const domains = writeGuard.domainsOf(plan);
    ctx.allowedDomains = domains;
    await memory.updateTask(task.id, { plan, status: perms.requiresConsent ? 'awaiting_consent' : 'running' });
    if (perms.requiresConsent) {
      try { await audit.record(req.sokroUser.id, 'consent_requested', { taskId: task.id, permissions: perms.required, domains }); } catch (_) {}
      return res.json({ ok: true, taskId: task.id, conversationId: convId, intent: plan.intent, plan: plan.steps, permissions: perms, requiresConsent: true, domains, sites: writeGuard.consentLine(domains), message: plan.message || null });
    }
    if (!plan.steps || !plan.steps.length) {
      await memory.updateTask(task.id, { status: 'failed' });
      const msg = plan.message || null;
      if (msg) { try { await memory.addMessageFor(req.sokroUser.id, convId, 'assistant', msg); } catch (_) {} }
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
    if (!(req.body && req.body.confirmSensitive === true)) {
      return res.status(403).json({ ok: false, error: 'explicit confirmation required' });
    }
    const t = (await pool.query(
      `UPDATE sokro_tasks
          SET status = 'running', updated_at = now()
        WHERE id = $1 AND user_id = $2 AND status = 'awaiting_consent'
        RETURNING id, goal, plan, conversation_id`,
      [parseInt(req.params.taskId, 10), req.sokroUser.id]
    )).rows[0];
    if (!t) return res.status(404).json({ ok: false, error: 'task not found' });
    if (!t.plan || !Array.isArray(t.plan.steps)) return res.status(400).json({ ok: false, error: 'task has no plan' });
    const taskPerms = permissions.forPlan(t.plan, registry);
    if (!taskPerms.requiresConsent) {
      return res.status(409).json({ ok: false, error: 'task does not require consent' });
    }
    try { await audit.record(req.sokroUser.id, 'consent_granted', { taskId: t.id, permissions: taskPerms.required, domains: require('./lib/writeGuard').domainsOf(t.plan), outcome: 'granted' }); } catch (_) {}
    // Sensitive-action confirmation (the user just approved a pay/delete step —
    // by voice or button): resume the operate step and let it press the button.
    if (req.body && req.body.confirmSensitive) {
      t.plan.steps.forEach((s) => { if (s.action === 'operate') { s.input = Object.assign({}, s.input, { resume: true, confirmSensitive: true }); } });
    }
    // Proceed despite a predicted-failure warning (user chose "كمّل بأي حال").
    const prefs = await settings.get(req.sokroUser.id);
    const resumeCtx = sokroCtx(req.sokroUser.id, t.id, prefs);
    // The same allowlist on resume: the consent that was given was for THESE
    // sites, and the plan stored with the task is where they come from.
    resumeCtx.allowedDomains = require('./lib/writeGuard').domainsOf(t.plan);
    return await executePlan(resumeCtx, t.goal, t.id, t.plan, res, t.conversation_id);
  } catch (e) {
    console.error('[sokro] execute:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Voice → text (Whisper).
router.post('/api/voice', auth.requireAuth, (req, res) => uploadAudio(req, res, async (err) => {
  if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'audio too large' : err.message });
  if (!req.file) return res.status(400).json({ ok: false, error: 'audio required' });
  try { res.json({ ok: true, text: await voice.transcribe(req.file.buffer, req.file.originalname || 'audio.webm') }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
}));

// Vision: the user attaches an image (+ optional text) and the model "reads" it.
// Used by the text composer's 📎 attach button (the live call sends images
// straight over the data channel instead). Accepts a data: URL or an http(s) URL.
router.post('/api/vision', auth.requireAuth, async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  const image = String((req.body && req.body.image) || '').trim();
  if (!/^(data:image\/|https?:\/\/)/i.test(image)) return res.status(400).json({ ok: false, error: 'valid image required' });
  try {
    const prefs = await settings.get(req.sokroUser.id);
    const AP = require('./assistant-profile');
    const lang = require('./core/lang');
    const sys = AP.buildPreamble(prefs) + ' ' + lang.replyInstruction(prefs.lang) + ' The user shared an image — look at it and answer helpfully.';
    const messages = [
      { role: 'system', content: sys },
      { role: 'user', content: [{ type: 'text', text: text || 'بُص الصورة دي وقوللي فيها إيه أو رأيك فيها.' }, { type: 'image_url', image_url: { url: image } }] },
    ];
    const out = await require('./llm').chat({ messages });
    let convId = (req.body && req.body.conversationId) || null;
    try {
      if (!convId) convId = (await memory.createConversation(req.sokroUser.id, (text || 'صورة').slice(0, 60))).id;
      else if (!(await memory.getMessagesFor(req.sokroUser.id, convId, 1))) return res.status(403).json({ ok: false, error: 'conversation not found' });
      await memory.addMessageFor(req.sokroUser.id, convId, 'user', '[صورة] ' + text);
      if (out && out.text) await memory.addMessageFor(req.sokroUser.id, convId, 'assistant', out.text);
    } catch (_) {}
    res.json({ ok: true, answer: (out && out.text) || '', conversationId: convId });
  } catch (e) { console.error('[sokro] vision:', e.message); res.status(500).json({ ok: false, error: e.message }); }
});

// File → answer: the user attaches a document / zip / text file (📎). We extract
// its readable content (text + any images inside) server-side and let the model
// use it. Images alone go through /api/vision instead.
router.post('/api/file', auth.requireAuth, (req, res) => uploadFile(req, res, async (err) => {
  if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'file too large' : err.message });
  if (!req.file) return res.status(400).json({ ok: false, error: 'file required' });
  const name = req.file.originalname || 'file';
  const promptText = String((req.body && req.body.text) || '').trim();
  try {
    const filesLib = require('./lib/files');
    const isRar = /\.rar$/i.test(name);
    const got = isRar ? await filesLib.extractRar(req.file.buffer) : filesLib.extract(name, req.file.buffer);
    if (got.needLib) return res.json({ ok: false, error: 'ملفات RAR محتاجة تفعيل (ثبّت node-unrar-js على السيرفر) — لحد كده استخدم ZIP.' });
    if (!got.text && !got.images.length) {
      return res.json({ ok: false, error: 'النوع ده مش مقدر أقراه (جرّب صورة، نص، Word، أو ملف مضغوط zip/rar). ملفات PDF لسه مش مدعومة.' });
    }
    const prefs = await settings.get(req.sokroUser.id);
    const AP = require('./assistant-profile');
    const lang = require('./core/lang');
    const sys = AP.buildPreamble(prefs) + ' ' + lang.replyInstruction(prefs.lang) + ' The user shared a file; use its extracted content to answer.';
    const userContent = [{ type: 'text', text: (promptText || 'لخّصلي أو حلّلي محتوى الملف ده.') + '\n\n[ملف: ' + name + ']\n' + (got.text || '(بدون نص — صور فقط)').slice(0, 60000) }];
    for (const im of got.images.slice(0, 4)) userContent.push({ type: 'image_url', image_url: { url: im } });
    const out = await require('./llm').chat({ messages: [{ role: 'system', content: sys }, { role: 'user', content: userContent }] });
    let convId = (req.body && req.body.conversationId) || null;
    try {
      if (!convId) convId = (await memory.createConversation(req.sokroUser.id, name.slice(0, 60))).id;
      else if (!(await memory.getMessagesFor(req.sokroUser.id, convId, 1))) return res.status(403).json({ ok: false, error: 'conversation not found' });
      await memory.addMessageFor(req.sokroUser.id, convId, 'user', '[ملف: ' + name + '] ' + promptText);
      if (out && out.text) await memory.addMessageFor(req.sokroUser.id, convId, 'assistant', out.text);
    } catch (_) {}
    res.json({ ok: true, answer: (out && out.text) || '', conversationId: convId });
  } catch (e) { console.error('[sokro] file:', e.message); res.status(500).json({ ok: false, error: e.message }); }
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
  const fmt = String(b.format || 'md').toLowerCase();
  try {
    const f = fmt === 'pdf' ? await reports.toPDF(payload) : reports.build(b.format, payload);
    const name = (payload.title || 'report').replace(/[^\w؀-ۿ -]/g, '').trim().slice(0, 60) || 'report';
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', "attachment; filename*=UTF-8''" + encodeURIComponent(name) + '.' + f.ext);
    res.send(f.buffer);
  } catch (e) {
    // PDF depends on the browser engine; if it's missing/unlaunchable, return a
    // clear, friendly message (422) so the client can offer Excel/Markdown.
    if (fmt === 'pdf') return res.status(422).json({ ok: false, error: 'تعذّر إنشاء PDF على الخادم حاليًا — استخدم Excel أو Markdown' });
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Scheduler / watchers (recurring goals) ───────────────────────────────────
router.post('/api/schedule', auth.requireAuth, async (req, res) => {
  const b = req.body || {};
  const goal = String(b.goal || '').trim();
  if (!goal) return res.status(400).json({ ok: false, error: 'goal required' });
  // A moment («فكّرني الساعة ٥») or a rhythm («كل ساعة»). A time that already
  // passed is a typo, and saying so beats firing immediately.
  const when = { runAt: b.runAt || b.at, everyMinutes: b.everyMinutes };
  Object.assign(when, { whenText: b.whenText || b.when, timezone: b.timezone });
  const task = await scheduler.create(req.sokroUser.id, goal, when, b.title);
  if (task && task.error) {
    return res.status(400).json({ ok: false, error: task.error,
      message: task.error === 'past' ? 'الميعاد ده عدّى خلاص — اكتب وقت جاي.' : 'مش فاهم الوقت ده. اكتبه كتاريخ وساعة.' });
  }
  res.json({ ok: true, task });
});

// Natural-language reminder parsing is deterministic and never guesses a date.
router.post('/api/schedule/parse', auth.requireAuth, (req, res) => {
  const out = timeParser.parseNatural(String((req.body || {}).text || ''));
  res.status(out.error ? 400 : 200).json({ ok: !out.error, ...out });
});

// ── Meeting agenda: built one point at a time ────────────────────────────────
const agenda = require('./agenda');
const agendaStore = require('./agenda/store');

router.get('/api/agenda', auth.requireAuth, async (req, res) => {
  const a = await agendaStore.open(req.sokroUser.id);
  if (!a) return res.json({ ok: true, agenda: null, items: [], text: '' });
  const items = await agendaStore.items(req.sokroUser.id, a.id);
  res.json({ ok: true, agenda: a, items, text: agenda.render(a, items) });
});

router.post('/api/agenda', auth.requireAuth, async (req, res) => {
  const b = req.body || {};
  const a = await agendaStore.create(req.sokroUser.id, b.title, b.whenAt || null);
  res.json({ ok: true, agenda: a });
});

// One point. The duplicate answer is a real answer — «دي عندي خلاص» is useful,
// a silently ignored tap is not.
router.post('/api/agenda/:id([0-9]+)/items', auth.requireAuth, async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  const parsed = agenda.parseAdd(text) || text;   // «ضيف بند: كذا» or the bare point
  const out = await agendaStore.addItem(req.sokroUser.id, parseInt(req.params.id, 10), parsed);
  if (!out.added) {
    return res.json({ ok: true, added: false, why: out.why,
      message: out.why === 'duplicate' ? 'البند ده موجود في الأجندة خلاص.' : 'اكتب البند.' });
  }
  res.json({ ok: true, added: true, item: out.item });
});

router.post('/api/agenda/:id([0-9]+)/items/:itemId([0-9]+)/done', auth.requireAuth, async (req, res) => {
  await agendaStore.setDone(req.sokroUser.id, req.params.itemId, (req.body || {}).done !== false);
  res.json({ ok: true });
});

router.delete('/api/agenda/:id([0-9]+)/items/:itemId([0-9]+)', auth.requireAuth, async (req, res) => {
  await agendaStore.removeItem(req.sokroUser.id, parseInt(req.params.id, 10), req.params.itemId);
  res.json({ ok: true });
});

router.post('/api/agenda/:id([0-9]+)/close', auth.requireAuth, async (req, res) => {
  await agendaStore.close(req.sokroUser.id, parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// Structured booking flow. It collects and confirms details deterministically;
// it does not submit anything to an external provider.
router.post('/api/booking/turn', auth.requireAuth, async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'text required' });
  try {
    let conversationId = (req.body && req.body.conversationId) || null;
    if (!conversationId) {
      conversationId = (await memory.createConversation(req.sokroUser.id, text.slice(0, 60))).id;
    } else if (!(await memory.getMessagesFor(req.sokroUser.id, conversationId, 1))) {
      return res.status(403).json({ ok: false, error: 'conversation not found' });
    }
    let current = await bookingStore.open(req.sokroUser.id, conversationId);
    if (!current) {
      const kind = booking.detectKind(text);
      if (!kind) return res.status(400).json({ ok: false, error: 'booking type not understood' });
      current = await bookingStore.create(req.sokroUser.id, conversationId, kind, {});
    }
    const out = await booking.turn({
      userId: req.sokroUser.id,
      llm: require('./llm'),
      memory,
      log: () => {},
    }, current, text);
    const saved = await bookingStore.save(req.sokroUser.id, current.id, {
      fields: out.state.fields,
      status: out.state.status,
      fingerprint: out.state.confirmed_fingerprint === null ? '' : out.state.confirmed_fingerprint,
    });
    if (!saved) return res.status(404).json({ ok: false, error: 'booking not found' });
    await memory.addTurnFor(req.sokroUser.id, conversationId, text, out.say || '');
    res.json({
      ok: true, booking: saved, conversationId, say: out.say,
      done: out.done, answer: out.answer || null,
    });
  } catch (e) {
    console.error('[sokro] booking turn:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Submit only after a confirmed booking has been atomically claimed. A provider
// timeout leaves it in `submitting`, which is intentionally not retryable.
router.post('/api/booking/:id([0-9]+)/submit', auth.requireAuth, async (req, res) => {
  if (!(req.body && req.body.confirmSensitive === true)) return res.status(403).json({ ok: false, error: 'explicit confirmation required' });
  try {
    const id = parseInt(req.params.id, 10);
    const bookingRow = (await pool.query('SELECT * FROM sokro_bookings WHERE id=$1 AND user_id=$2', [id, req.sokroUser.id])).rows[0];
    if (!bookingRow || bookingRow.status !== 'confirmed') return res.status(409).json({ ok: false, error: 'booking is not confirmed or is already being processed' });
    const claimed = await bookingStore.claimForSubmit(req.sokroUser.id, id, bookingRow.confirmed_fingerprint);
    if (!claimed) return res.status(409).json({ ok: false, error: 'booking was already claimed' });
    const result = await bookingProviders.submit(claimed);
    if (result.uncertain) return res.status(502).json({ ok: false, uncertain: true, error: result.error, message: 'النتيجة غير مؤكدة؛ لن أعيد الإرسال تلقائيًا.' });
    await bookingStore.finishSubmit(req.sokroUser.id, id, result.ok, result);
    try { await audit.record(req.sokroUser.id, 'booking_submit', { permissions: ['submit'], outcome: result.ok ? 'success' : 'failed' }); } catch (_) {}
    res.status(result.ok ? 200 : 502).json({ ok: result.ok, result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ── Consent audit and optional external channels ─────────────────────────────
router.get('/api/audit/consent', auth.requireAuth, async (req, res) => {
  res.json({ ok: true, entries: await audit.list(req.sokroUser.id, req.query.limit) });
});
router.post('/api/channels/whatsapp/account', auth.requireAuth, async (req, res) => {
  const id = String((req.body || {}).phoneNumberId || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'phoneNumberId required' });
  await pool.query(`INSERT INTO sokro_channel_accounts (user_id,provider,external_id) VALUES ($1,'whatsapp_cloud',$2)
    ON CONFLICT (provider,external_id) DO UPDATE SET user_id=EXCLUDED.user_id`, [req.sokroUser.id, id]);
  res.json({ ok: true, phoneNumberId: id, configured: whatsappCloud.configured() });
});
router.post('/api/channels/whatsapp/send', auth.requireAuth, async (req, res) => {
  if (!(req.body && req.body.confirmSensitive === true)) return res.status(403).json({ ok: false, requiresConsent: true, error: 'explicit confirmation required' });
  const to = String(req.body.to || '').trim(), text = String(req.body.text || '').trim();
  if (!to || !text) return res.status(400).json({ ok: false, error: 'to and text required' });
  try {
    const out = await whatsappCloud.send(to, text);
    await pool.query(`INSERT INTO sokro_channel_messages (user_id,provider,external_message_id,sender,body,direction)
      VALUES ($1,'whatsapp_cloud',$2,$3,$4,'outbound') ON CONFLICT DO NOTHING`,
      [req.sokroUser.id, (out.messages && out.messages[0] && out.messages[0].id) || 'wa-' + Date.now(), process.env.SOKRO_WHATSAPP_PHONE_ID, text]);
    await audit.record(req.sokroUser.id, 'whatsapp_send', { permissions: ['social', 'submit'], outcome: 'success' });
    res.json({ ok: true, messageId: out.messages && out.messages[0] && out.messages[0].id });
  } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
router.post('/api/calls', auth.requireAuth, async (req, res) => {
  if (!(req.body && req.body.confirmSensitive === true)) return res.status(403).json({ ok: false, requiresConsent: true, error: 'explicit confirmation required' });
  const to = String(req.body.to || '').trim();
  if (!/^\+?[0-9()\-\s]{8,20}$/.test(to)) return res.status(400).json({ ok: false, error: 'valid phone number required' });
  if (!phone.configured()) return res.status(503).json({ ok: false, error: 'phone provider is not configured' });
  try {
    const row = (await pool.query(`INSERT INTO sokro_phone_calls (user_id,provider,to_number) VALUES ($1,'twilio',$2) RETURNING id`, [req.sokroUser.id, to])).rows[0];
    const out = await phone.call(to, `${config.origin}/api/calls/${row.id}/twiml`, `${config.origin}/api/calls/status`);
    await pool.query('UPDATE sokro_phone_calls SET external_id=$2,status=$3,updated_at=now() WHERE id=$1', [row.id, out.id, out.status || 'queued']);
    await audit.record(req.sokroUser.id, 'phone_call', { permissions: ['submit'], outcome: 'requested' });
    res.json({ ok: true, callId: row.id, status: out.status });
  } catch (e) { res.status(502).json({ ok: false, error: e.message }); }
});
router.post('/api/calls/status', async (req, res) => {
  const sid = String(req.body && (req.body.CallSid || req.body.callSid) || '');
  if (!sid) return res.sendStatus(400);
  await pool.query('UPDATE sokro_phone_calls SET status=$2,updated_at=now() WHERE external_id=$1', [sid, String(req.body.CallStatus || 'unknown')]);
  res.sendStatus(204);
});
router.post('/api/calls/:id([0-9]+)/twiml', (_req, res) => {
  res.type('text/xml').send('<Response><Say language="ar-SA">مرحبًا، هذه مكالمة من سوكرو.</Say><Hangup/></Response>');
});

// ── The inbox a reminder lands in ────────────────────────────────────────────
router.get('/api/notifications', auth.requireAuth, async (req, res) => {
  const rows = await scheduler.notifications(req.sokroUser.id, req.query.limit);
  res.json({ ok: true, unread: rows.filter((r) => !r.read_at).length, notifications: rows });
});
router.post('/api/notifications/:id/read', auth.requireAuth, async (req, res) => {
  await scheduler.markRead(req.sokroUser.id, req.params.id);
  res.json({ ok: true });
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
  // Long-poll: hold up to 25s (under Cloudflare's ~100s cap) so the extension gets
  // commands instantly and its service worker stays awake.
  try { res.json({ ok: true, command: await extBridge.nextWait(req.sokroUser.id, 25000) }); }
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

// ── PWA: make /app installable as a mobile/desktop app (no native client) ─────
router.get('/manifest.webmanifest', (_req, res) => {
  res.type('application/manifest+json').set('Cache-Control', 'no-cache').json({
    name: 'Sokro', short_name: 'Sokro', start_url: '/app', scope: '/app',
    display: 'standalone', background_color: '#0b1020', theme_color: '#0b1020',
    lang: 'ar', dir: 'rtl', description: 'مساعدك الذكي اللي بينفّذ المهام بصوتك',
    icons: [{ src: '/sokro-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  });
});
router.get('/sokro-icon.svg', (_req, res) => {
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=604800').send(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b6cff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="192" height="192" rx="42" fill="#0b1020"/><circle cx="96" cy="96" r="52" fill="url(#g)"/><text x="96" y="120" font-size="70" font-family="sans-serif" font-weight="900" text-anchor="middle" fill="#08122b">S</text></svg>'
  );
});
router.get('/sw.js', (_req, res) => {
  // App-shell service worker for installability. Network-first (so a redeploy is
  // picked up immediately), with a cached fallback when offline.
  res.type('application/javascript').set('Cache-Control', 'no-cache').send(
    "const C='sokro-v1';" +
    "self.addEventListener('install',e=>self.skipWaiting());" +
    "self.addEventListener('activate',e=>self.clients.claim());" +
    "self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;" +
    "if(e.request.url.indexOf('/api/')>-1)return;" +
    "e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)));});"
  );
});

// ── Chrome extension: install page + one-click ZIP download ──────────────────
const _fs = require('fs');
function extFiles() {
  const dir = path.join(__dirname, 'extension');
  return _fs.readdirSync(dir).filter((f) => /\.(json|js|html|png|svg)$/i.test(f))
    .map((name) => ({ name, buffer: _fs.readFileSync(path.join(dir, name)) }));
}
router.get('/ext.zip', (_req, res) => {
  try {
    let ver = 'x';
    try { ver = JSON.parse(_fs.readFileSync(path.join(__dirname, 'extension', 'manifest.json'), 'utf8')).version || 'x'; } catch (_) {}
    const buf = require('./lib/zip').zipStore(extFiles());
    res.setHeader('Content-Type', 'application/zip');
    // Never cache the download, and put the version in the filename, so the user
    // always gets the LATEST build (a cached sokro-extension.zip was serving stale).
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Disposition', 'attachment; filename="sokro-extension-' + ver + '.zip"');
    res.send(buf);
  } catch (e) { res.status(500).send('zip error: ' + e.message); }
});
router.get('/ext', (_req, res) => {
  // Chrome blocks one-click install of self-hosted extensions — a real
  // "Add to Chrome" button only works from the Chrome Web Store. Once the
  // extension is published there, set SOKRO_EXT_STORE_URL and this page swaps the
  // ZIP download for a proper store button, no code change needed.
  const storeUrl = process.env.SOKRO_EXT_STORE_URL || '';
  // Show the version the SERVER is currently serving, so the user can confirm the
  // ZIP they download matches the latest (a stale deploy = old extension).
  let extVersion = '?';
  try { extVersion = JSON.parse(_fs.readFileSync(path.join(__dirname, 'extension', 'manifest.json'), 'utf8')).version || '?'; } catch (_) {}
  const cta = storeUrl
    ? `<a class="dl" href="${storeUrl}" target="_blank" rel="noopener">➕ إضافة إلى كروم</a>
       <ol>
         <li>اضغط <b>➕ إضافة إلى كروم</b> فوق، وبعدها <b>Add extension</b> في النافذة اللي هتظهر.</li>
         <li>ارجع لـ <a href="/app">Sokro /app</a> وسجّل دخولك — الإضافة هتتوصّل تلقائياً. أول مهمة تصفّح هتظهرلك نافذة تأكيد بالدومين.</li>
       </ol>`
    : `<a class="dl" href="/ext.zip">⬇︎ تحميل الإضافة (ZIP)</a>
       <div class="note" style="color:#c3c9ee;background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);margin-top:14px">ℹ️ كروم مبيسمحش بتثبيت مباشر من أي موقع لأسباب أمان — التثبيت بضغطة «إضافة إلى كروم» بيبقى متاح بس بعد نشر الإضافة على Chrome Web Store.</div>
       <ol>
         <li>نزّل ملف <code>sokro-extension.zip</code> من الزر فوق، وفُكّ الضغط (Extract) في فولدر.</li>
         <li>افتح كروم على <code>chrome://extensions</code></li>
         <li>فعّل <b>Developer mode</b> (المفتاح أعلى اليمين).</li>
         <li>اضغط <b>Load unpacked</b> واختار الفولدر اللي فكيت فيه الملفات.</li>
         <li>ارجع لـ <a href="/app">Sokro /app</a> وسجّل دخولك — الإضافة هتتوصّل تلقائياً. أول مهمة تصفّح هتظهرلك نافذة تأكيد بالدومين.</li>
       </ol>`;
  res.type('html').set('Cache-Control', 'no-cache').send(`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Sokro — تثبيت إضافة المتصفح</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;font-family:'Cairo',sans-serif;margin:0}body{background:radial-gradient(1000px 600px at 50% -10%,#1b2550,#0b1020);color:#eef1ff;min-height:100vh}
.wrap{max-width:640px;margin:0 auto;padding:48px 22px}h1{font-size:clamp(1.6rem,5vw,2.2rem);font-weight:900;margin-bottom:8px}
h1 span{background:linear-gradient(90deg,#7c8bff,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent}
p.sub{color:#c3c9ee;line-height:1.9;margin-bottom:22px}
.dl{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(90deg,#5b6cff,#22d3ee);color:#08122b;font-weight:900;text-decoration:none;border-radius:100px;padding:15px 32px;font-size:1.05rem}
ol{counter-reset:s;list-style:none;padding:0;margin:28px 0 0}
li{position:relative;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px 60px 16px 16px;margin-bottom:12px;line-height:1.9}
li::before{counter-increment:s;content:counter(s);position:absolute;right:16px;top:14px;width:32px;height:32px;border-radius:50%;background:rgba(120,140,255,.18);border:1px solid rgba(120,140,255,.4);color:#aebbff;font-weight:900;display:flex;align-items:center;justify-content:center}
code{background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:2px 8px;font-family:monospace;direction:ltr;display:inline-block}
.note{margin-top:20px;color:#ffd58a;font-size:.9rem;background:rgba(255,213,138,.08);border:1px solid rgba(255,213,138,.25);border-radius:12px;padding:12px 14px;line-height:1.8}
a{color:#8ea2ff}</style></head><body><div class="wrap">
<h1>ثبّت إضافة <span>Sokro</span> للمتصفح</h1>
<p class="sub">الإضافة بتخلّي Sokro ينفّذ مهام (يفتح مواقع، يملأ نماذج، يسحب بيانات) <b>في متصفحك الحي بجلساتك المسجّلة</b>.</p>
<div class="note" style="color:#a7f3d0;background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.35)">📦 النسخة المتاحة على السيرفر دلوقتي: <b style="direction:ltr;display:inline-block">v${extVersion}</b> — بعد ما تحمّل وتعمل Reload، اتأكد إن نفس الرقم ده ظاهر في <code>chrome://extensions</code>. لو رقم أقل، يبقى السيرفر محتاج <b>Republish</b> الأول.</div>
${cta}
<div class="note">🔒 خصوصية: الإضافة بتتصفّح بس لما Sokro يطلب. القراءة/الفتح مش بتطلب نافذة؛ بس الكتابة (إرسال فورم) بعد تأكيدك في التطبيق.</div>
</div></body></html>`);
});
// Serve individual extension files (used by the manifest / manual loading).
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
<meta property="og:image" content="https://oscardevs.com/og-default.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${TITLE}" />
<meta name="twitter:description" content="${DESC}" />
<meta name="twitter:image" content="https://oscardevs.com/og-default.png" />
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
    <span class="badge">وكيل ذكاء اصطناعي عربي — بحث · تقارير · صور</span>
    <h1>قول لـ <span>Sokro</span> اللي عايزه… وهو ينفّذه</h1>
    <p class="sub">Sokro مش مجرد مساعد بيرد. ده وكيل ذكاء اصطناعي عربي بينفّذ مهام حقيقية بأمر صوتي أو نصّي: يبحث في الويب ويعملّك تقرير Excel/PDF، يخلق صورة، أو يلخّص صفحة — إنت تقول، وهو ينفّذ ويطلّع النتيجة. المحادثات بتتحفظ في حسابك، وأي خطوة حسّاسة ماتتنفّذش غير بموافقتك.</p>
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
    <p>Sokro وكيل ذكاء اصطناعي عربي (AI agent) بينفّذ مهام فعلية بدل ما يكتفي بالرد. بتديله هدف بصوتك أو بالكتابة — زي «ابحثلي عن أسعار كذا واعملّي تقرير» أو «ارسملي صورة لمنتج» — فيحلّل الطلب، يخطّط الخطوات، وينفّذها باستخدام أدوات متخصصة (بحث ويب، توليد صور، تلخيص، تقارير). هو أحد منتجات <a href="https://oscardevs.com/our-work">OscarDevs</a>، ومبني ليشتغل من المتصفح ومن الموبايل بنفس الحساب.</p>

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
    <p>حسابك محميّ بكلمة سر مشفّرة، والجلسات موقّعة بمفتاح سرّي. أي بيانات اعتماد بتضيفها بتتخزّن مشفّرة (AES-256) وماتترجعش كنص ولا تتبعت للموديل. الأوامر الحسّاسة — زي تشغيل متصفّح أو تعبئة نموذج على موقع — <strong>ماتتنفّذش إلا بموافقة صريحة منك</strong>، والوصول للمواقع الداخلية/الخاصة محجوب لأسباب أمنية. للتفاصيل الكاملة راجع <a href="https://oscardevs.com/privacy">سياسة الخصوصية</a>.</p>

    <h2>حدود التنفيذ</h2>
    <p>Sokro أداة مساعدة، مش بديل عن قرارك. ممكن نتائج البحث تكون ناقصة أو محتاجة مراجعة، وتوليد الصور له قيود المزوّد. الخطوات اللي تلمس حسابات أو مدفوعات بتحتاج تأكيدك، والمنتج قيد التطوير المستمر فبنضيف قدرات ونحسّن باستمرار.</p>

    <h2>أسئلة شائعة</h2>
    <details><summary>محتاج أعمل حساب؟</summary><p>أيوه، بتسجّل بإيميل وكلمة سر عشان محادثاتك وإعداداتك تتحفظ وترجعلك في أي جهاز.</p></details>
    <details><summary>بيتكلم مصري ولا فصحى ولا إنجليزي؟</summary><p>تقدر تختار لغة الرد من الإعدادات: مصري (الافتراضي)، فصحى، أو إنجليزي — وكمان صوت أنثى أو ذكر واسم وشخصية للمساعد.</p></details>
    <details><summary>هل ينفّذ أي حاجة من غير ما يسألني؟</summary><p>لأ. المهام العادية (بحث/صورة/تلخيص) بتتنفّذ على طول، لكن أي خطوة حسّاسة بتوقف وتطلب موافقتك الأول.</p></details>
    <details><summary>بيشتغل على الموبايل؟</summary><p>أيوه، بيشتغل من المتصفح على الموبايل والكمبيوتر بنفس الحساب.</p></details>

    <h2>أدلة ومقالات</h2>
    <ul>
      <li><a href="${config.origin}/guides/market-research">بحث سوق وتقارير Excel بالذكاء الاصطناعي</a></li>
      <li><a href="${config.origin}/guides/voice-to-report">من أمر صوتي لمخرجات جاهزة</a></li>
      <li><a href="${config.origin}/guides/ai-agent-arabic-business">دليل عملي: وكيل ذكاء اصطناعي للشركات العربية</a></li>
    </ul>
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
