import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { initAICaller } from './utils/aiCaller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ── Security headers (lightweight helmet-equivalent) ──────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
});

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

// ── In-memory rate limiter ─────────────────────────────────────
const _rateBuckets = new Map(); // key → { count, resetAt }
function rateLimiter(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const bucket = _rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      _rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count++;
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests — please slow down.' });
    }
    next();
  };
}
// Clean up stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rateBuckets) { if (now > v.resetAt) _rateBuckets.delete(k); }
}, 5 * 60 * 1000);

// AI routes rate limiter: 10 req/min per IP (applied centrally to avoid per-route duplication)
const _AI_PATHS = new Set([
  '/api/detect-specialty', '/api/doctor-suitability', '/api/ai-specialty-consult',
  '/api/generate-soap-note', '/api/suggest-medications', '/api/clinic-insights',
  '/api/generate-message', '/api/analyze-feedback', '/api/medical-search',
  '/api/generate-protocol', '/api/assess-urgency', '/api/drug-autofill',
  '/api/smart-patient-search', '/api/ai-scribe', '/api/ai/medical-assistant',
  '/api/doctor-coach', '/api/ai-action',
]);
const _aiLimiter = rateLimiter(10, 60_000);
app.use((req, res, next) => {
  if (_AI_PATHS.has(req.path)) return _aiLimiter(req, res, next);
  next();
});
// STEP 5: usage limit check on AI routes (applied after subscription system initialises)
app.use((req, res, next) => {
  if (req.method === 'POST' && _AI_PATHS.has(req.path)) {
    return requireWithinLimit('ai_requests')(req, res, next);
  }
  next();
});

// ── Input sanitiser helper ─────────────────────────────────────
function sanitiseString(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '')
          .trim();
}

// ── Server-side audit log helper ──────────────────────────────
function serverAudit({ userId, clinicId, action, entity, entityId, description, req, severity = 'info' }) {
  const entry = {
    ts: new Date().toISOString(),
    userId, clinicId, action, entity, entityId, description, severity,
    ip: req?.ip, ua: req?.headers?.['user-agent'],
  };
  if (severity === 'warn' || severity === 'critical') {
    console.warn('[AUDIT]', JSON.stringify(entry));
  }
  // If Supabase is ready, write async (non-blocking)
  if (supabaseReady && supabaseAdmin) {
    supabaseAdmin.from('audit_logs').insert({
      user_id: userId, clinic_id: clinicId, action, entity, entity_id: entityId,
      description, ip_address: req?.ip, user_agent: req?.headers?.['user-agent'],
      severity, metadata: entry,
    }).then().catch(() => {});
  }
}

// ── Supabase clients ─────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

let supabaseAdmin = null;
let supabaseReady = false;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_ANON_KEY) {
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  supabaseReady = true;
  console.log('Supabase connected:', SUPABASE_URL);
} else {
  console.warn('Supabase env vars missing — DB routes will return 503');
}

function supabaseAs(jwt) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function requireSupabase(req, res, next) {
  if (!supabaseReady) {
    return res.status(503).json({ error: 'Database not configured' });
  }
  next();
}

// ── Auth middleware ───────────────────────────────────────────
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }
  const jwt = header.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .select('role, clinic_id, is_active')
    .eq('id', user.id)
    .single();
  if (profileErr || !profile) {
    return res.status(401).json({ error: 'User profile not found' });
  }
  if (!profile.is_active) {
    return res.status(403).json({ error: 'Account is deactivated' });
  }
  req.auth = { userId: user.id, clinicId: profile.clinic_id, role: profile.role, jwt };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (req.auth?.role === 'super_admin') return next();
    if (!roles.includes(req.auth?.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

async function requireActiveSubscription(req, res, next) {
  const { clinicId, role } = req.auth;
  if (role === 'super_admin') return next();
  if (!clinicId) return next();
  const { data, error } = await supabaseAdmin
    .rpc('clinic_subscription_active', { p_clinic_id: clinicId });
  if (error || !data) {
    return res.status(403).json({ error: 'Clinic subscription has expired.' });
  }
  next();
}

const guard = [requireSupabase, authenticate, requireActiveSubscription];

// Soft auth: extracts clinic identity from JWT when present, but never blocks.
// Used on AI routes (which must remain accessible in demo mode without a token).
async function tryAuthenticate(req, res, next) {
  try {
    if (!supabaseReady) return next();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return next();
    const jwt = header.slice(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(jwt);
    if (error || !user) return next();
    const { data: profile } = await supabaseAdmin
      .from('users').select('role, clinic_id').eq('id', user.id).single();
    if (profile) req.auth = { id: user.id, clinicId: profile.clinic_id, role: profile.role, jwt };
  } catch {}
  next();
}

// ── Input validation helpers (STEP 8) ─────────────────────────
function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const val = req.body?.[field];
      if (rules.required && (val === undefined || val === null || val === '')) {
        errors.push(`${field} is required`);
      } else if (val !== undefined) {
        if (rules.type === 'string' && typeof val !== 'string') errors.push(`${field} must be a string`);
        if (rules.type === 'number' && typeof val !== 'number') errors.push(`${field} must be a number`);
        if (rules.maxLen && typeof val === 'string' && val.length > rules.maxLen) errors.push(`${field} max length ${rules.maxLen}`);
        if (rules.min !== undefined && typeof val === 'number' && val < rules.min) errors.push(`${field} min ${rules.min}`);
        if (rules.pattern && typeof val === 'string' && !rules.pattern.test(val)) errors.push(`${field} invalid format`);
      }
      // Sanitise string fields in-place
      if (typeof req.body?.[field] === 'string') req.body[field] = sanitiseString(req.body[field]);
    }
    if (errors.length > 0) return res.status(400).json({ error: errors.join('; ') });
    next();
  };
}

// Audit log API endpoints (STEP 7 — admin only)
app.get('/api/audit-logs', guard, requireRole('admin', 'super_admin'), async (req, res) => {
  const { clinicId } = req.auth;
  const limit  = Math.min(parseInt(req.query.limit) || 200, 500);
  const action = req.query.action;
  const entity = req.query.entity;
  const userId = req.query.userId;
  if (!supabaseReady) return res.json({ logs: [] });
  let q = supabaseAdmin.from('audit_logs')
    .select('*').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(limit);
  if (action) q = q.eq('action', action);
  if (entity) q = q.eq('entity', entity);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  serverAudit({ userId: req.auth.userId, clinicId, action: 'view', entity: 'report', description: 'Viewed audit logs', req });
  res.json({ logs: data });
});

app.get('/api/security-events', guard, requireRole('admin', 'super_admin'), async (req, res) => {
  const { clinicId } = req.auth;
  if (!supabaseReady) return res.json({ events: [] });
  const { data, error } = await supabaseAdmin.from('security_events')
    .select('*').eq('clinic_id', clinicId).eq('resolved', false).order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ events: data });
});


// ═══════════════════════════════════════════════════════════
// OpenAI routes
// ═══════════════════════════════════════════════════════════
const openaiReady = !!process.env.OPENAI_API_KEY;
const openai = openaiReady ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ─── Server-side AI config (synced from SuperAdmin UI) ───────────────────────
let serverAiConfig = {
  globallyEnabled: true,
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 800,
  systemPromptEn: 'You are a smart medical booking assistant for Egyptian clinics. Help patients find suitable appointment slots, answer questions about clinic services, and guide them through the booking process professionally.',
  systemPromptAr: 'أنت مساعد حجز طبي ذكي للعيادات المصرية. ساعد المرضى في إيجاد مواعيد مناسبة والإجابة على أسئلتهم حول خدمات العيادة وإرشادهم خلال عملية الحجز باحترافية.',
  bookingInstructions: 'Always confirm patient name, preferred date, and doctor specialty. Suggest available slots within working hours (9 AM – 9 PM). Mention examination fees when asked.',
};

// Central AI caller — wraps every openai.chat.completions.create with logging + config
const callAI = initAICaller(openai, () => serverAiConfig, () => ({ supabaseAdmin, supabaseReady }), (cId, f) => _incrementUsage(cId, f));

app.get('/api/ai-config', tryAuthenticate, (req, res) => {
  res.json({ ...serverAiConfig, apiKeyStatus: openaiReady ? 'configured' : 'missing' });
});

app.post('/api/ai-config', tryAuthenticate, requireRole('super_admin'), (req, res) => {
  const { globallyEnabled, model, temperature, maxTokens, systemPromptEn, systemPromptAr, bookingInstructions } = req.body || {};
  if (typeof globallyEnabled === 'boolean') serverAiConfig.globallyEnabled = globallyEnabled;
  if (model && ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'].includes(model)) serverAiConfig.model = model;
  if (typeof temperature === 'number' && temperature >= 0 && temperature <= 1) serverAiConfig.temperature = temperature;
  if (typeof maxTokens === 'number' && maxTokens >= 100 && maxTokens <= 4000) serverAiConfig.maxTokens = maxTokens;
  if (systemPromptEn) serverAiConfig.systemPromptEn = systemPromptEn;
  if (systemPromptAr) serverAiConfig.systemPromptAr = systemPromptAr;
  if (bookingInstructions) serverAiConfig.bookingInstructions = bookingInstructions;
  res.json({ ok: true, config: { ...serverAiConfig, apiKeyStatus: openaiReady ? 'configured' : 'missing' } });
});

// STEP 6 — AI cost + event dashboard
app.get('/api/ai/dashboard', tryAuthenticate, requireRole('super_admin'), async (req, res) => {
  try {
    // Try Supabase first (persistent data), fall back to in-memory buffer
    if (supabaseReady && supabaseAdmin) {
      const [logsRes, eventsRes] = await Promise.all([
        supabaseAdmin.from('ai_logs').select('feature, total_tokens, cost_usd, response_ms, created_at').order('created_at', { ascending: false }).limit(5000),
        supabaseAdmin.from('ai_events').select('event_type, status, created_at').order('created_at', { ascending: false }).limit(1000),
      ]);
      const logs   = logsRes.data   || [];
      const events = eventsRes.data || [];
      return res.json(_buildDashboard(logs, events));
    }
    // In-memory fallback
    const { getAILogBuffer } = await import('./utils/aiCaller.js');
    const logs   = getAILogBuffer();
    const events = [..._aiEvents.values()];
    return res.json(_buildDashboard(logs, events));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function _buildDashboard(logs, events) {
  const totalCalls = logs.length;
  const totalTokens = logs.reduce((s, l) => s + (l.total_tokens || 0), 0);
  const totalCostUsd = logs.reduce((s, l) => s + parseFloat(l.cost_usd || 0), 0);
  const avgResponseMs = totalCalls > 0
    ? Math.round(logs.reduce((s, l) => s + (l.response_ms || 0), 0) / totalCalls)
    : 0;

  // Feature breakdown
  const featureMap = {};
  for (const l of logs) {
    const f = l.feature || 'unknown';
    if (!featureMap[f]) featureMap[f] = { calls: 0, tokens: 0, cost: 0 };
    featureMap[f].calls++;
    featureMap[f].tokens += l.total_tokens || 0;
    featureMap[f].cost   += parseFloat(l.cost_usd || 0);
  }
  const features = Object.entries(featureMap)
    .map(([name, v]) => ({ name, ...v, cost: +v.cost.toFixed(6) }))
    .sort((a, b) => b.calls - a.calls);
  const topFeature = features[0]?.name || null;

  // Event stats
  const intentCount    = events.filter(e => e.event_type === 'intent_booking').length;
  const completedCount = events.filter(e => e.status === 'completed').length;
  const nudgedCount    = events.filter(e => e.status === 'nudged').length;
  const conversionRate = intentCount > 0 ? Math.round((completedCount / intentCount) * 100) : 0;

  return {
    totalCalls,
    totalTokens,
    totalCostUsd: +totalCostUsd.toFixed(4),
    avgResponseMs,
    topFeature,
    features,
    events: { intentCount, completedCount, nudgedCount, conversionRate },
  };
}

// ═══════════════════════════════════════════════════════════
// Subscription System — Plans, Limits, Expiration
// ═══════════════════════════════════════════════════════════

// STEP 1 — Plan definitions (matches frontend subscriptionPlanStore)
const PLAN_LIMITS = {
  basic:    { ai_requests: 50,    whatsapp_messages: 200   },
  pro:      { ai_requests: 500,   whatsapp_messages: 2000  },
  ai:       { ai_requests: 5000,  whatsapp_messages: 10000 },
  advanced: { ai_requests: 2000,  whatsapp_messages: 5000  },
  elite:    { ai_requests: 5000,  whatsapp_messages: 10000 },
};
const DEFAULT_PLAN = 'basic';

// STEP 2 — In-memory monthly usage cache (clinic_id → { month, ai_requests, whatsapp_messages })
const _usageCache = new Map();

function _currentMonth() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function _getUsage(clinicId) {
  const month = _currentMonth();
  const cached = _usageCache.get(clinicId);
  if (cached && cached.month === month) return cached;
  const fresh = { month, ai_requests: 0, whatsapp_messages: 0 };
  _usageCache.set(clinicId, fresh);
  return fresh;
}

// Increment counter; persist to Supabase fire-and-forget
function _incrementUsage(clinicId, field) {
  if (!clinicId) return;
  const usage = _getUsage(clinicId);
  usage[field] = (usage[field] || 0) + 1;
  _usageCache.set(clinicId, usage);

  if (supabaseReady) {
    supabaseAdmin.rpc('upsert_subscription_usage', {
      p_clinic_id: clinicId,
      p_month:     usage.month,
      p_field:     field,
    }).catch(() => {});
  }
}

// STEP 4 — GET /api/subscription/usage (multi-role aware)
app.get('/api/subscription/usage', tryAuthenticate, async (req, res) => {
  if (!req.auth) return res.status(401).json({ error: 'authentication required' });

  const { plan, scope, ownerId } = await getEffectivePlan(req.auth);
  let planExpiresAt = null;

  if (supabaseReady && ownerId) {
    if (scope === 'doctor') {
      const { data: u } = await supabaseAdmin
        .from('users').select('plan_expires_at').eq('id', ownerId).single().catch(() => ({ data: null }));
      planExpiresAt = u?.plan_expires_at || null;
    } else if (scope === 'clinic') {
      const { data: c } = await supabaseAdmin
        .from('clinics').select('plan_expires_at').eq('id', ownerId).single().catch(() => ({ data: null }));
      planExpiresAt = c?.plan_expires_at || null;
    }
  }

  const limits   = PLAN_LIMITS[plan] || PLAN_LIMITS[DEFAULT_PLAN];
  const cacheKey = ownerId || req.auth.clinicId;
  const usage    = _getUsage(cacheKey);

  // Also try Supabase for persistent counters (clinic-scoped only — keeps storage simple)
  if (supabaseReady && scope === 'clinic') {
    const { data: row } = await supabaseAdmin
      .from('subscription_usage')
      .select('ai_requests, whatsapp_messages')
      .eq('clinic_id', cacheKey).eq('month', _currentMonth()).single();
    if (row) {
      usage.ai_requests       = Math.max(usage.ai_requests,       row.ai_requests       || 0);
      usage.whatsapp_messages = Math.max(usage.whatsapp_messages, row.whatsapp_messages || 0);
      _usageCache.set(cacheKey, usage);
    }
  }

  res.json({
    plan,
    scope,                   // 'doctor' | 'clinic' | 'default'
    planExpiresAt,
    month: usage.month,
    usage: { ai_requests: usage.ai_requests, whatsapp_messages: usage.whatsapp_messages },
    limits,
  });
});

// STEP 5 — Upsell suggestion: solo doctor with many patients → suggest clinic upgrade
app.get('/api/subscription/upsell-suggestion', tryAuthenticate, async (req, res) => {
  if (!req.auth || req.auth.role !== 'doctor') return res.json({ suggest: false });
  if (!supabaseReady) return res.json({ suggest: false });

  const doctorId = req.auth.id || req.auth.userId;
  const { data: u } = await supabaseAdmin
    .from('users').select('practice_type, subscription_plan').eq('id', doctorId).single().catch(() => ({ data: null }));
  if (u?.practice_type !== 'solo') return res.json({ suggest: false });

  // Count distinct patients seen in last 30 days
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: visits } = await supabaseAdmin
    .from('visits').select('patient_id')
    .eq('doctor_id', doctorId).gte('created_at', since);

  const patientCount = new Set((visits || []).map(v => v.patient_id)).size;
  const THRESHOLD = 100;

  res.json({
    suggest:      patientCount >= THRESHOLD,
    patientCount,
    threshold:    THRESHOLD,
    currentPlan:  u.subscription_plan || DEFAULT_PLAN,
    suggestedTier: 'clinic',
    messageAr:    patientCount >= THRESHOLD
      ? `لديك ${patientCount} مريض هذا الشهر — فكّر في الترقية إلى اشتراك عيادة لإدارة فريقك ومرضاك بشكل أفضل.`
      : null,
    messageEn:    patientCount >= THRESHOLD
      ? `You have ${patientCount} patients this month — consider upgrading to a clinic subscription for team and patient management.`
      : null,
  });
});

// ── Multi-Role: resolve effective plan for the authenticated user ──────────────
// Solo doctor → uses their own user-level plan
// clinic_admin or clinic-member doctor → inherits clinic plan
async function getEffectivePlan(auth) {
  if (!auth || !supabaseReady) return { plan: DEFAULT_PLAN, scope: 'default', ownerId: null };

  // Solo doctor path: check user record first
  // auth.id is set by tryAuthenticate; auth.userId is set by authenticate (full guard)
  const authUserId = auth.id || auth.userId;
  if (auth.role === 'doctor' && authUserId) {
    const { data: u } = await supabaseAdmin
      .from('users').select('practice_type, subscription_plan, plan_expires_at')
      .eq('id', authUserId).single().catch(() => ({ data: null }));
    if (u?.practice_type === 'solo') {
      const expired = u.plan_expires_at && new Date(u.plan_expires_at) < new Date();
      return {
        plan:    expired ? DEFAULT_PLAN : (u.subscription_plan || DEFAULT_PLAN),
        scope:   'doctor',
        ownerId: authUserId,
      };
    }
  }

  // clinic-scoped (admin / clinic_member doctor / reception)
  if (auth.clinicId) {
    const { data: c } = await supabaseAdmin
      .from('clinics').select('subscription_plan').eq('id', auth.clinicId).single().catch(() => ({ data: null }));
    return { plan: c?.subscription_plan || DEFAULT_PLAN, scope: 'clinic', ownerId: auth.clinicId };
  }

  return { plan: DEFAULT_PLAN, scope: 'default', ownerId: null };
}

// STEP 5 — limit-check middleware factory (now multi-role aware)
function requireWithinLimit(field) {
  return async (req, res, next) => {
    const auth = req.auth;
    if (!auth) return next(); // unauthenticated → let requireModule handle it

    const { plan, ownerId } = await getEffectivePlan(auth);
    // Use ownerId for usage cache key (doctor-id for solo, clinic-id for clinic-scoped)
    const cacheKey = ownerId || auth.clinicId;
    if (!cacheKey) return next();

    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS[DEFAULT_PLAN];
    const limit  = limits[field];
    if (!limit) return next(); // unlimited or unknown field

    const usage = _getUsage(cacheKey);
    if (usage[field] >= limit) {
      return res.status(429).json({
        error:     'usage_limit_reached',
        field,
        used:      usage[field],
        limit,
        plan,
        messageAr: `لقد وصلت إلى الحد الأقصى لـ "${field === 'ai_requests' ? 'طلبات الذكاء الاصطناعي' : 'رسائل واتساب'}" هذا الشهر. قم بترقية اشتراكك.`,
        messageEn: `You have reached the monthly limit for ${field.replace('_', ' ')}. Upgrade your subscription.`,
      });
    }
    next();
  };
}

// STEP 6 — daily expiration job: if plan_expires_at < now → downgrade to basic
function scheduleExpirationCheck() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(2, 30, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  setTimeout(async function expirationCheck() {
    if (!supabaseReady) return setTimeout(expirationCheck, 86_400_000);
    try {
      const nowIso = new Date().toISOString();

      // Clinics
      const { data: expiredClinics } = await supabaseAdmin
        .from('clinics')
        .select('id')
        .lt('plan_expires_at', nowIso)
        .neq('subscription_plan', DEFAULT_PLAN)
        .not('plan_expires_at', 'is', null);

      if (expiredClinics?.length) {
        const ids = expiredClinics.map(c => c.id);
        await supabaseAdmin
          .from('clinics')
          .update({ subscription_plan: DEFAULT_PLAN, updated_at: nowIso })
          .in('id', ids);
        console.log(`[Subscription] downgraded ${ids.length} expired clinic(s) to ${DEFAULT_PLAN}`);
      }

      // Solo doctors (multi-role)
      const { data: expiredDocs } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('practice_type', 'solo')
        .lt('plan_expires_at', nowIso)
        .neq('subscription_plan', DEFAULT_PLAN)
        .not('plan_expires_at', 'is', null);

      if (expiredDocs?.length) {
        const ids = expiredDocs.map(u => u.id);
        await supabaseAdmin
          .from('users')
          .update({ subscription_plan: DEFAULT_PLAN, updated_at: nowIso })
          .in('id', ids);
        console.log(`[Subscription] downgraded ${ids.length} expired solo doctor(s) to ${DEFAULT_PLAN}`);
      }
    } catch (err) {
      console.warn('[Subscription] expiration check error:', err.message);
    }
    setTimeout(expirationCheck, 86_400_000);
  }, next - now);
}
scheduleExpirationCheck();

// ═══════════════════════════════════════════════════════════
// Doctor Learning AI
// ═══════════════════════════════════════════════════════════

// In-memory profile cache — refreshed daily from Supabase (or computed from visits)
const _doctorProfiles = new Map(); // doctorId → { avgVisitTime, commonMedications, bookingStyle, visitCount }

// ── STEP 3: compute avg visit time from last N completed visits ───────────────
async function computeAvgVisitTime(doctorId, n = 20) {
  if (!supabaseReady) return 20;
  const { data } = await supabaseAdmin
    .from('visits')
    .select('visit_start_time, visit_end_time')
    .eq('doctor_id', doctorId)
    .eq('status', 'completed')
    .not('visit_start_time', 'is', null)
    .not('visit_end_time',   'is', null)
    .order('updated_at', { ascending: false })
    .limit(n);
  if (!data?.length) return 20;
  const durations = data
    .map(v => (new Date(v.visit_end_time) - new Date(v.visit_start_time)) / 60000)
    .filter(d => d > 0 && d < 180); // ignore outliers (>3h)
  if (!durations.length) return 20;
  return Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
}

// ── STEP 4: derive booking_style from avg visit time ─────────────────────────
function bookingStyleFromAvg(avgMin) {
  if (avgMin <= 12) return 'fast';
  if (avgMin <= 25) return 'standard';
  return 'thorough';
}

// ── STEP 7: build or refresh one doctor's profile ────────────────────────────
async function refreshDoctorProfile(doctorId, clinicId) {
  try {
    const avgVisitTime     = await computeAvgVisitTime(doctorId);
    const bookingStyle     = bookingStyleFromAvg(avgVisitTime);

    // STEP 4: pull medication names from last 50 suggestions logged in ai_logs meta
    // (we track them via the doctor_medication_log table updated in suggest-medications)
    let commonMedications = [];
    if (supabaseReady) {
      const { data: medRows } = await supabaseAdmin
        .from('doctor_medication_log')
        .select('medication_name')
        .eq('doctor_id', doctorId)
        .order('use_count', { ascending: false })
        .limit(8);
      commonMedications = (medRows || []).map(r => r.medication_name);
    }

    const { data: visitCount } = await supabaseAdmin
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('status', 'completed');

    const profile = {
      doctorId,
      clinicId,
      avgVisitTime,
      bookingStyle,
      commonMedications,
      visitCount: visitCount ?? 0,
      updatedAt: new Date().toISOString(),
    };

    _doctorProfiles.set(doctorId, profile);

    // Persist to Supabase
    if (supabaseReady) {
      await supabaseAdmin.from('doctor_ai_profiles').upsert({
        doctor_id:          doctorId,
        clinic_id:          clinicId,
        avg_visit_time:     avgVisitTime,
        common_medications: commonMedications,
        booking_style:      bookingStyle,
        visit_count:        profile.visitCount,
        updated_at:         profile.updatedAt,
      }, { onConflict: 'doctor_id' });
    }

    return profile;
  } catch (err) {
    console.warn('[DoctorAI] refresh failed for', doctorId, err.message);
    return _doctorProfiles.get(doctorId) || null;
  }
}

// ── STEP 1: load all profiles from Supabase into memory on startup ─────────────
async function loadDoctorProfiles() {
  if (!supabaseReady) return;
  try {
    const { data } = await supabaseAdmin
      .from('doctor_ai_profiles').select('*').limit(500);
    for (const row of (data || [])) {
      _doctorProfiles.set(row.doctor_id, {
        doctorId:          row.doctor_id,
        clinicId:          row.clinic_id,
        avgVisitTime:      row.avg_visit_time,
        bookingStyle:      row.booking_style,
        commonMedications: row.common_medications || [],
        visitCount:        row.visit_count,
        updatedAt:         row.updated_at,
      });
    }
    console.log(`[DoctorAI] loaded ${_doctorProfiles.size} doctor profiles`);
  } catch (err) {
    console.warn('[DoctorAI] load failed:', err.message);
  }
}
// Kick off load once Supabase is confirmed ready
if (supabaseReady) setImmediate(loadDoctorProfiles);

// ── STEP 5: build dynamic system prompt injection for a doctor ────────────────
function buildDoctorPromptContext(doctorId) {
  const p = _doctorProfiles.get(doctorId);
  if (!p) return '';
  const medList = p.commonMedications.length
    ? `Common medications this doctor prescribes: ${p.commonMedications.join(', ')}.`
    : '';
  return (
    `\n[Doctor Context] Avg consultation: ${p.avgVisitTime} min. Style: ${p.bookingStyle}.` +
    (medList ? ` ${medList}` : '')
  );
}

// ── GET /api/doctor-ai-profile/:doctorId — fetch profile ─────────────────────
app.get('/api/doctor-ai-profile/:doctorId', tryAuthenticate, requireRole('admin', 'doctor', 'super_admin'), async (req, res) => {
  const { doctorId } = req.params;
  const cached = _doctorProfiles.get(doctorId);
  if (cached) return res.json(cached);
  // Not cached — compute on demand
  const clinicId = req.auth?.clinicId || null;
  const profile = await refreshDoctorProfile(doctorId, clinicId);
  if (!profile) return res.status(404).json({ error: 'No data for this doctor yet' });
  res.json(profile);
});

// ── STEP 7: daily refresh job — runs at 03:00 server time ────────────────────
function scheduleDailyProfileRefresh() {
  const now = new Date();
  const next3am = new Date(now);
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);
  const msUntil3am = next3am - now;

  setTimeout(async function dailyRefresh() {
    if (!supabaseReady) return setTimeout(dailyRefresh, 86_400_000);
    console.log('[DoctorAI] running daily profile refresh');
    try {
      const { data: doctors } = await supabaseAdmin
        .from('users').select('id, clinic_id').eq('role', 'doctor').eq('is_active', true).limit(200);
      for (const doc of (doctors || [])) {
        await refreshDoctorProfile(doc.id, doc.clinic_id);
      }
      console.log(`[DoctorAI] refreshed ${doctors?.length || 0} profiles`);
    } catch (err) {
      console.warn('[DoctorAI] daily refresh error:', err.message);
    }
    setTimeout(dailyRefresh, 86_400_000); // schedule next day
  }, msUntil3am);
}
scheduleDailyProfileRefresh();

// ─── Shared keyword fallback (no OpenAI needed) ───────────────────────────────
const SPECIALTY_KW = {
  'Dentistry':          ['أسنان','سن','ضرس','اسنان','dentist','dental','teeth','tooth'],
  'Dermatology':        ['جلدية','جلد','بشرة','حبوب','طفح','derma','skin','rash','حكة','eczema'],
  'Cardiology':         ['قلب','صدر','cardio','heart','chest','نبض','ضغط الدم','ضغط'],
  'Orthopedics':        ['عظام','مفاصل','ظهر','عظم','ortho','bone','joint','back','ركبة','كسر'],
  'Ophthalmology':      ['عيون','عين','نظر','eye','vision','ophthal','بصر'],
  'ENT':                ['أنف','أذن','حنجرة','انف','اذن','ear','nose','throat','ent','لوز'],
  'Neurology':          ['أعصاب','صداع','اعصاب','neuro','headache','migraine','دوخة','شلل'],
  'Gastroenterology':   ['معدة','هضمي','بطن','أمعاء','امعاء','gastro','stomach','digest','اسهال','قولون'],
  'General Medicine':   ['عام','باطنة','حرارة','برد','انفلونزا','general','fever','cold','flu','internal','كحة','سعال'],
  'Pediatrics':         ['أطفال','اطفال','طفل','pediatr','child','kid','رضيع'],
  'Urology':            ['مسالك','بول','كلى','urol','urinary','kidney','بروستاتا'],
  'Gynecology':         ['نساء','نسا','توليد','gyn','obstet','women','حمل','دورة'],
  'Psychiatry':         ['نفسي','نفسية','اكتئاب','قلق','psych','mental','depression','anxiety','توتر','وسواس'],
  'Pulmonology':        ['رئة','رئتين','تنفس','ربو','pulmon','lung','breath','asthma'],
  'Endocrinology':      ['سكر','غدة','هرمون','diabete','thyroid','endocrin','سكري'],
};

function localDetectSpecialty(text) {
  const lower = text.toLowerCase();
  for (const [spec, kws] of Object.entries(SPECIALTY_KW)) {
    if (kws.some(kw => lower.includes(kw))) return spec;
  }
  return null;
}

const TRIAGE_PROMPT = `You are a medical triage assistant.
Given a patient complaint, return ONLY the most relevant medical specialty name in English.
Do not explain. Do not add any other text.
If multiple specialties could match, return the most likely one.
Valid specialties: General Medicine, Dentistry, Dermatology, Cardiology, Orthopedics, Ophthalmology, ENT, Neurology, Gastroenterology, Pediatrics, Urology, Gynecology, Psychiatry, Pulmonology, Endocrinology, Nephrology, Rheumatology, Oncology, Hematology, Allergy`;

app.post('/api/detect-specialty', async (req, res) => {
  try {
    const { complaint } = req.body;
    if (!complaint || typeof complaint !== 'string') {
      return res.status(400).json({ error: 'complaint is required' });
    }
    // Local keyword fallback when OpenAI is unavailable or AI disabled
    if (!openaiReady || !serverAiConfig.globallyEnabled) {
      const local = localDetectSpecialty(complaint);
      return res.json({ specialty: local || 'General Medicine', tokens: { prompt: 0, completion: 0, total: 0 } });
    }
    const response = await callAI({ type: 'detect-specialty',
      messages: [
        { role: 'system', content: TRIAGE_PROMPT },
        { role: 'user', content: complaint }
      ],
      max_tokens: 20,
      temperature: 0,
    });
    const specialty = response.choices[0]?.message?.content?.trim() || '';
    const usage = response.usage;
    res.json({
      specialty,
      tokens: {
        prompt: usage?.prompt_tokens || 0,
        completion: usage?.completion_tokens || 0,
        total: usage?.total_tokens || 0,
      }
    });
  } catch (error) {
    console.error('OpenAI API error:', error.message);
    res.status(500).json({ error: 'Failed to detect specialty' });
  }
});

// ─── AI Specialty Consultation ────────────────────────────────────────────────
app.post('/api/ai-specialty-consult', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { symptoms, availableSpecialties, language } = req.body;
    // availableSpecialties: [{id, name, nameAr}]
    if (!symptoms || typeof symptoms !== 'string') {
      return res.status(400).json({ error: 'symptoms required' });
    }

    const specList = Array.isArray(availableSpecialties) ? availableSpecialties : [];

    // ── Local keyword fallback when OpenAI is unavailable ──────────────────────
    if (!openaiReady || !serverAiConfig.globallyEnabled) {
      const detectedName = localDetectSpecialty(symptoms);
      const isSymptoms = !!detectedName;
      if (!isSymptoms) {
        return res.json({ isSymptoms: false, detectedSpecialtyName: null, matchedId: null, suggestedId: null, suggestedName: null,
          messageAr: 'المدخل لا يبدو أعراضاً طبية. يرجى وصف شكواك الصحية.',
          messageEn: 'The input does not appear to be medical symptoms. Please describe your health complaint.' });
      }
      const matched = specList.find(s => s.name === detectedName || s.name.toLowerCase().includes(detectedName.toLowerCase()));
      const suggested = !matched && specList.length > 0 ? specList[0] : null;
      return res.json({
        isSymptoms: true,
        detectedSpecialtyName: detectedName,
        matchedId: matched?.id || null,
        suggestedId: suggested?.id || null,
        suggestedName: suggested?.name || null,
        messageAr: matched ? `بناءً على الأعراض، التخصص المناسب هو: ${matched.nameAr || matched.name}.` : `تخصص "${detectedName}" غير متاح حالياً. يُنصح بـ${suggested?.nameAr || suggested?.name || 'الطب العام'}.`,
        messageEn: matched ? `Based on symptoms, the best specialty is: ${matched.name}.` : `Specialty "${detectedName}" is not available. Suggested: ${suggested?.name || 'General Medicine'}.`,
      });
    }
    const specListText = specList.map(s => `- ${s.name} (id: ${s.id})`).join('\n');
    const lang = language === 'ar' ? 'Arabic' : 'English';

    const systemPrompt = `You are a bilingual (Arabic/English) medical triage assistant for an Egyptian clinic platform.
A patient has entered text in the symptoms/notes field of a booking form.

Available specialties at this clinic:
${specListText || '(none configured)'}

Your tasks:
1. Determine if the input is medical symptoms/complaint. If not (e.g. random text, greetings), set isSymptoms=false.
2. If symptoms: detect the best matching specialty from the available list above.
3. If no exact match is available, pick the closest available specialty that could help.
4. If the list is empty, suggest based on general knowledge.
5. You may ask 1-2 clarifying questions if needed to better determine the specialty.

Respond ONLY with this exact JSON (no markdown, no extra text):
{
  "isSymptoms": true,
  "detectedSpecialtyName": "detected specialty in English",
  "matchedId": "id from list or null if not available",
  "suggestedId": "id of closest available alternative or null",
  "suggestedName": "name of closest alternative or null",
  "messageAr": "رسالة عربية للمريض (موجزة، واضحة، ودية)",
  "messageEn": "Short English message to patient (friendly)"
}

Language for messages: ${lang}`;

    const response = await callAI({ type: 'specialty-consult',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: symptoms }
      ],
      max_tokens: 350,
      temperature: 0.1,
    });

    const raw = response.choices[0]?.message?.content?.trim() || '';
    let result;
    try {
      result = JSON.parse(raw);
    } catch {
      // Fallback if JSON parse fails
      result = {
        isSymptoms: true,
        detectedSpecialtyName: '',
        matchedId: null,
        suggestedId: specList[0]?.id || null,
        suggestedName: specList[0]?.name || null,
        messageAr: 'عذراً، لم أتمكن من تحديد التخصص. يرجى الاختيار يدوياً.',
        messageEn: 'Sorry, could not detect specialty. Please select manually.',
      };
    }
    res.json(result);
  } catch (error) {
    console.error('AI specialty consult error:', error.message);
    res.status(500).json({ error: 'AI detection failed' });
  }
});


app.post('/api/doctor-suitability', async (req, res) => {
  try {
    const { symptoms, doctorName, doctorSpecialty } = req.body;
    if (!symptoms || !doctorSpecialty) {
      return res.status(400).json({ error: 'symptoms and doctorSpecialty are required' });
    }

    // ── Local keyword fallback (no OpenAI key required) ──────────────────
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      const detectedSpecialty = localDetectSpecialty(symptoms);
      // Normalize both to lowercase for comparison
      const docSpecLower = doctorSpecialty.toLowerCase();
      const isMatch = !detectedSpecialty
        ? true  // can't tell → give benefit of the doubt
        : detectedSpecialty.toLowerCase() === docSpecLower ||
          docSpecLower.includes(detectedSpecialty.toLowerCase()) ||
          detectedSpecialty.toLowerCase().includes(docSpecLower.split(' ')[0]);
      if (isMatch) {
        return res.json({
          isMatch: true,
          message: `بناءً على الأعراض المذكورة، يبدو أن ${doctorName} مناسب لحالتك. يُنصح بحجز موعد.`,
        });
      } else {
        return res.json({
          isMatch: false,
          message: `الأعراض المذكورة قد تشير إلى تخصص ${detectedSpecialty}. يمكنك استشارة ${doctorName} ليقيّم حالتك.`,
        });
      }
    }

    // ── OpenAI path ───────────────────────────────────────────────────────
    // Detect language from symptoms: if Arabic characters present → respond in Arabic
    const isArabic = /[\u0600-\u06FF]/.test(symptoms);
    const langInstruction = isArabic
      ? 'IMPORTANT: The patient wrote in Arabic. You MUST respond entirely in Arabic.'
      : 'Respond in English.';
    const systemPrompt = `You are a helpful medical guidance assistant on a clinic platform.
A patient is asking whether Dr. ${doctorName} (${doctorSpecialty} specialist) is suitable for their condition.
${langInstruction}
Your job:
- Analyze the symptoms against the doctor's specialty.
- If they match: confirm the doctor can help, be encouraging.
- If they do NOT match: gently suggest a more appropriate specialty.
- NEVER diagnose or prescribe. Only guide.
- Keep your response to 2-3 short sentences.
- End with either "suitability: match" or "suitability: mismatch" on the last line.`;
    const response = await callAI({ type: 'doctor-suitability',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `My symptoms: ${symptoms}` }
      ],
      max_tokens: 120,
      temperature: 0.3,
    });
    const raw = response.choices[0]?.message?.content?.trim() || '';
    const lines = raw.split('\n');
    const suitabilityLine = lines.find(l => l.toLowerCase().includes('suitability:')) || '';
    const isMatch = suitabilityLine.toLowerCase().includes('match') && !suitabilityLine.toLowerCase().includes('mismatch');
    const message = lines.filter(l => !l.toLowerCase().startsWith('suitability:')).join(' ').trim();
    res.json({ message, isMatch });
  } catch (error) {
    console.error('OpenAI API error:', error.message);
    res.status(500).json({ error: 'Failed to evaluate suitability' });
  }
});

app.post('/api/generate-soap-note', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { template, consultationNotes, patientName, specialty, refinePrompt, existingNote } = req.body;
    if (!consultationNotes && !refinePrompt) {
      return res.status(400).json({ error: 'consultationNotes is required' });
    }
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      // Fallback: return structured placeholder when no API key
      const templateLabels = {
        soap: 'SOAP Note',
        treatment_note: 'Treatment Note',
        referral_letter: 'Referral Letter',
        patient_summary: 'Patient Summary',
      };
      const fallback = generateFallbackNote(template, consultationNotes, patientName, specialty);
      return res.json({ content: fallback });
    }

    const templateGuides = {
      soap: `Generate a SOAP clinical note with these exact sections:
S (Subjective): Patient's chief complaint, history, and symptoms in their own words.
O (Objective): Vital signs, physical examination findings, lab/test results.
A (Assessment): Diagnosis or differential diagnoses.
P (Plan): Treatment plan, medications, follow-up.`,
      treatment_note: `Generate a professional Treatment Note with these sections:
1. Patient History: Current complaints, medical history, medications.
2. Observations: General appearance, relevant exam findings.
3. Assessment: Clinical impression and diagnosis.
4. Treatment Plan: Interventions performed, prescribed medications, lifestyle advice.
5. Follow-up: Next steps and review date.`,
      referral_letter: `Generate a formal medical Referral Letter addressed to "Dear Colleague," including:
- Reason for referral
- Brief patient history and current symptoms
- Relevant examination findings
- Current medications
- Specific request to the specialist
- Thank you closing`,
      patient_summary: `Generate a concise Patient Summary including:
- Chief Complaint
- Relevant Medical History
- Current Findings
- Clinical Impression
- Recommendations and Plan`,
    };

    const isRefinement = !!(refinePrompt && existingNote);
    const doctorCtx = req.body?.doctorId ? buildDoctorPromptContext(req.body.doctorId) : '';
    const systemPrompt = `You are an expert bilingual medical documentation AI specializing in Egyptian healthcare.
You generate structured, professional clinical notes in English (Arabic terms acceptable where standard in Egyptian practice).
Be concise, medically accurate, and use proper clinical language.
Specialty context: ${specialty || 'General Medicine'}.
Patient: ${patientName || 'the patient'}.${doctorCtx}`;

    const userMessage = isRefinement
      ? `Refine the following clinical note according to this instruction: "${refinePrompt}"\n\nExisting note:\n${existingNote}`
      : `${templateGuides[template] || templateGuides.soap}\n\nConsultation notes from doctor:\n${consultationNotes}`;

    const response = await callAI({ type: 'generate-soap-note',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 600,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content?.trim() || '';
    res.json({ content });
  } catch (error) {
    console.error('OpenAI SOAP note error:', error.message);
    res.status(500).json({ error: 'Failed to generate note' });
  }
});

function generateFallbackNote(template, notes, patientName, specialty) {
  const name = patientName || 'Patient';
  const today = new Date().toLocaleDateString('en-GB');
  if (template === 'soap') {
    return `S (Subjective):\n${notes}\n\nO (Objective):\nVitals: BP —/— mmHg, HR — bpm, Temp —°C, RR — /min\nGeneral: [Examination findings]\n\nA (Assessment):\n[Clinical impression and diagnosis]\n\nP (Plan):\n- [Treatment / medications]\n- Follow-up in [X] weeks`;
  }
  if (template === 'referral_letter') {
    return `Date: ${today}\n\nDear Colleague,\n\nI am referring ${name} for specialist evaluation.\n\nReason for referral: ${notes}\n\nPlease assess and advise on further management.\n\nThank you for your assistance.\n\nSincerely,\n[Referring Physician]`;
  }
  if (template === 'patient_summary') {
    return `PATIENT SUMMARY — ${today}\nPatient: ${name}\n\nChief Complaint:\n${notes}\n\nRelevant History:\n[Past medical history]\n\nCurrent Findings:\n[Examination findings]\n\nImpression:\n[Clinical impression]\n\nRecommendations:\n[Plan and follow-up]`;
  }
  // treatment_note default
  return `TREATMENT NOTE — ${today}\nPatient: ${name}\n\n1. Patient History:\n${notes}\n\n2. Observations:\n[Examination findings]\n\n3. Assessment:\n[Diagnosis]\n\n4. Treatment Plan:\n[Interventions and medications]\n\n5. Follow-up:\n[Review date and instructions]`;
}

// ── F2: AI Drug Suggestions ──────────────────────────────────
app.post('/api/suggest-medications', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { diagnosis, symptoms, patientAge, patientGender, currentMedications, specialty } = req.body;
    if (!diagnosis && !symptoms) {
      return res.status(400).json({ error: 'diagnosis or symptoms required' });
    }
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      return res.json({ suggestions: [
        { name: 'Paracetamol', nameAr: 'باراسيتامول', dosage: '500mg', frequency: 'three_times_daily', duration: '5 days', instructions: 'Take with food', instructionsAr: 'تناول مع الطعام', reason: 'Pain relief and fever reduction' },
        { name: 'Ibuprofen', nameAr: 'إيبوبروفين', dosage: '400mg', frequency: 'twice_daily', duration: '3 days', instructions: 'Take after meals', instructionsAr: 'تناول بعد الوجبات', reason: 'Anti-inflammatory' },
      ]});
    }
    const systemPrompt = `You are an expert pharmacist and clinician in an Egyptian medical context.
Given a diagnosis and patient details, suggest appropriate medications commonly available in Egypt.
Respond ONLY with a valid JSON array of medication objects. No explanation, no markdown.
Each object must have: name (English), nameAr (Arabic), dosage, frequency (one of: once_daily|twice_daily|three_times_daily|four_times_daily|as_needed|weekly), duration, instructions (English), instructionsAr (Arabic), reason (why this medication).
Suggest 2-4 medications maximum. Be conservative and evidence-based.`;
    const userMsg = `Diagnosis: ${diagnosis || 'not specified'}
Symptoms: ${symptoms || 'not specified'}
Patient: ${patientAge || 'unknown'} years old, ${patientGender || 'unknown'}
Current medications: ${currentMedications || 'none'}
Specialty: ${specialty || 'General Medicine'}`;
    const response = await callAI({ type: 'suggest-medications',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
      max_tokens: 500,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    const raw = response.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(raw);
    const suggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions || parsed.medications || []);
    res.json({ suggestions });

    // STEP 4: track medication usage per doctor (fire-and-forget)
    const doctorId = req.body?.doctorId || req.auth?.userId;
    if (doctorId && supabaseReady && suggestions.length) {
      setImmediate(async () => {
        try {
          for (const s of suggestions) {
            const medName = (s.name || '').slice(0, 100);
            if (!medName) continue;
            await supabaseAdmin.from('doctor_medication_log').upsert({
              doctor_id:       doctorId,
              medication_name: medName,
              use_count:       1,
              last_used_at:    new Date().toISOString(),
            }, { onConflict: 'doctor_id,medication_name' }).then(({ error: uErr }) => {
              if (!uErr) {
                // increment use_count
                supabaseAdmin.rpc('increment_med_count', {
                  p_doctor_id: doctorId,
                  p_med_name:  medName,
                }).catch(() => {});
              }
            });
          }
        } catch { /* non-blocking */ }
      });
    }
  } catch (error) {
    console.error('suggest-medications error:', error.message);
    res.status(500).json({ error: 'Failed to suggest medications', suggestions: [] });
  }
});

// ── F3: AI Clinic Insights ───────────────────────────────────
app.post('/api/clinic-insights', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { period, totalPatients, totalRevenue, completionRate, topSpecialty, totalAppointments, cancelledCount, language: lang } = req.body;
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      return res.json({ insights: [
        { type: 'revenue', titleAr: 'الإيرادات', titleEn: 'Revenue', textAr: 'الإيرادات ضمن المعدل الطبيعي للعيادات المشابهة.', textEn: 'Revenue is within normal range for similar clinics.' },
        { type: 'patients', titleAr: 'المرضى', titleEn: 'Patients', textAr: 'حجم المرضى مستقر.', textEn: 'Patient volume is stable.' },
        { type: 'tip', titleAr: 'نصيحة', titleEn: 'Tip', textAr: 'تواصل مع المرضى الذين لم يحضروا لتقليل نسبة الإلغاء.', textEn: 'Follow up with no-show patients to reduce cancellation rates.' },
      ]});
    }
    const systemPrompt = `You are a healthcare business intelligence analyst specializing in Egyptian private clinics.
Analyze the clinic statistics and provide 3-4 actionable insights in BOTH Arabic and English.
Respond ONLY with valid JSON: { "insights": [ { "type": "revenue|patients|efficiency|tip", "titleAr": "...", "titleEn": "...", "textAr": "...", "textEn": "..." } ] }
Be specific, practical, and encouraging. Focus on Egyptian market context.`;
    const userMsg = `Period: ${period || 'this month'}
Total appointments: ${totalAppointments || 0}
Completed appointments: ${Math.round((completionRate || 0) * (totalAppointments || 0) / 100)}
Cancelled: ${cancelledCount || 0}
Total patients: ${totalPatients || 0}
Revenue: ${totalRevenue || 0} EGP
Completion rate: ${completionRate || 0}%
Top specialty: ${topSpecialty || 'General Medicine'}`;
    const response = await callAI({ type: 'clinic-insights',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
      max_tokens: 400,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
    const raw = response.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(raw);
    res.json(parsed);
  } catch (error) {
    console.error('clinic-insights error:', error.message);
    res.status(500).json({ error: 'Failed to generate insights', insights: [] });
  }
});

// ── F4: Generate Patient Message ─────────────────────────────
app.post('/api/generate-message', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { messageType, patientName, appointmentDate, appointmentTime, doctorName, clinicName, language: lang, customNote } = req.body;
    if (!messageType || !patientName) {
      return res.status(400).json({ error: 'messageType and patientName required' });
    }
    const templates = {
      reminder: `Generate a friendly appointment reminder WhatsApp message for an Egyptian patient.
Patient: ${patientName}, Date: ${appointmentDate}, Time: ${appointmentTime}, Doctor: ${doctorName}, Clinic: ${clinicName}.
${customNote ? `Additional note: ${customNote}` : ''}
Write in ${lang === 'ar' ? 'Arabic' : 'English'}. Keep it brief and warm. Include all key details.`,
      followup: `Generate a caring follow-up WhatsApp message for an Egyptian patient after their visit.
Patient: ${patientName}, Doctor: ${doctorName}, Clinic: ${clinicName}.
${customNote ? `Additional note: ${customNote}` : ''}
Write in ${lang === 'ar' ? 'Arabic' : 'English'}. Ask about their health, remind them to take medications.`,
      confirmation: `Generate an appointment confirmation WhatsApp message.
Patient: ${patientName}, Date: ${appointmentDate}, Time: ${appointmentTime}, Doctor: ${doctorName}, Clinic: ${clinicName}.
Write in ${lang === 'ar' ? 'Arabic' : 'English'}. Be professional and include contact info placeholder.`,
      no_show: `Generate a gentle re-engagement message for a patient who missed their appointment.
Patient: ${patientName}, Doctor: ${doctorName}, Clinic: ${clinicName}.
Write in ${lang === 'ar' ? 'Arabic' : 'English'}. Be understanding and invite them to reschedule.`,
    };
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      const fallbacks = {
        reminder: lang === 'ar'
          ? `مرحباً ${patientName}،\nتذكير بموعدك غداً ${appointmentDate} الساعة ${appointmentTime} مع ${doctorName} في ${clinicName}.\nنتمنى لك صحة وعافية 🌿`
          : `Hi ${patientName},\nReminder: your appointment is on ${appointmentDate} at ${appointmentTime} with ${doctorName} at ${clinicName}.\nWe look forward to seeing you!`,
        followup: lang === 'ar'
          ? `مرحباً ${patientName}، نتمنى أن تكون بصحة جيدة بعد زيارتك مع ${doctorName}. لا تتردد في التواصل معنا إذا احتجت لأي شيء. 💙`
          : `Hi ${patientName}, we hope you're feeling better after your visit with ${doctorName}. Don't hesitate to reach out if you need anything!`,
        confirmation: lang === 'ar'
          ? `تم تأكيد موعدك ${patientName}\nالتاريخ: ${appointmentDate}\nالوقت: ${appointmentTime}\nالدكتور: ${doctorName}\n${clinicName}`
          : `Appointment confirmed for ${patientName}\nDate: ${appointmentDate}\nTime: ${appointmentTime}\nDr. ${doctorName}\n${clinicName}`,
        no_show: lang === 'ar'
          ? `مرحباً ${patientName}، لاحظنا أنك لم تتمكن من حضور موعدك. نحن هنا لمساعدتك، يمكنك التواصل معنا لإعادة الحجز في أي وقت. 🙏`
          : `Hi ${patientName}, we noticed you couldn't make your appointment. We're here to help — feel free to contact us to reschedule at your convenience.`,
      };
      return res.json({ message: fallbacks[messageType] || fallbacks.reminder });
    }
    const response = await callAI({ type: 'generate-message',
      messages: [
        { role: 'system', content: 'You are a friendly medical clinic communication assistant in Egypt. Generate WhatsApp messages only — no explanation, just the message text.' },
        { role: 'user', content: templates[messageType] || templates.reminder },
      ],
      max_tokens: 200,
      temperature: 0.5,
    });
    const message = response.choices[0]?.message?.content?.trim() || '';
    res.json({ message });
  } catch (error) {
    console.error('generate-message error:', error.message);
    res.status(500).json({ error: 'Failed to generate message' });
  }
});

// ── Doctor Coach — AI-generated contextual step guidance ─────────
app.post('/api/doctor-coach', tryAuthenticate, async (req, res) => {
  try {
    const { stage = 'new', missingSteps = [], doctorName = 'دكتور' } = req.body;

    const nextStep = Array.isArray(missingSteps) ? missingSteps[0] : '';
    const FALLBACKS = {
      new:      `أهلاً د. ${doctorName}! ابدأ بإضافة أول مريض وجرّب طابور الانتظار — ستلاحظ الفرق فوراً.`,
      started:  `رائع يا د. ${doctorName}! ${nextStep ? `الخطوة التالية: ${nextStep}.` : 'استمر في تطوير عيادتك!'}`,
      active:   `أداؤك ممتاز يا د. ${doctorName}! ${nextStep ? `جرّب ${nextStep} لتوفير وقت أكثر.` : 'عيادتك تعمل بشكل رائع!'}`,
      inactive: `نفتقدك يا د. ${doctorName}! عيادتك في انتظارك — جرّب ميزة جديدة النهارده. 🌟`,
    };

    if (!openaiReady || !serverAiConfig.globallyEnabled) {
      return res.json({ message: FALLBACKS[stage] || FALLBACKS.new });
    }

    const stepsText = Array.isArray(missingSteps) ? missingSteps.slice(0, 2).join(' و') : '';
    const prompt = `حالة الطبيب في النظام: ${stage}. الخطوات الناقصة: ${stepsText || 'لا شيء'}.
اكتب جملة تشجيع واحدة فقط بالعربي المصري العامي، لا تتجاوز 18 كلمة، ودافئة وعملية.`;

    const response = await callAI({
      type: 'doctor-coach',
      messages: [
        { role: 'system', content: 'مساعد ذكي لنظام إدارة عيادة مصري. ردك جملة واحدة فقط، قصيرة وودية.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 80,
      temperature: 0.7,
    });

    const message = response.choices[0]?.message?.content?.trim() || FALLBACKS[stage] || FALLBACKS.new;
    res.json({ message });
  } catch (error) {
    console.error('doctor-coach error:', error.message);
    res.json({ message: `أهلاً د. ${req.body?.doctorName || 'دكتور'}، استمر في العمل الرائع! 💪` });
  }
});

// ── AI Action Engine — parse intent + execute real system actions ─
app.post('/api/ai-action', tryAuthenticate, async (req, res) => {
  // Must be authenticated
  if (!req.auth) return res.status(401).json({ success: false, message: 'يجب تسجيل الدخول أولاً.' });

  try {
    const { command, doctorId, doctorName = 'الدكتور' } = req.body;
    if (!command || !command.trim()) {
      return res.status(400).json({ success: false, message: 'الأمر فارغ.' });
    }

    const clinicId = req.auth.clinicId;
    const today = new Date().toISOString().slice(0, 10);
    // Compute tomorrow for relative date parsing
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);

    // ── STEP 1: Parse intent ─────────────────────────────────────
    let intent = { action: 'unknown', data: {} };

    if (openaiReady && serverAiConfig.globallyEnabled) {
      const parsePrompt = `أنت محلل أوامر لنظام عيادة طبي مصري. استخرج النية والبيانات من الأمر التالي كـ JSON فقط.
الأفعال المتاحة:
- create_patient: إضافة مريض جديد. البيانات: {"name":"...","nameAr":"...","phone":"...","gender":"male|female"}
- create_booking: حجز موعد. البيانات: {"patientName":"...","date":"YYYY-MM-DD","time":"HH:MM"}
- add_to_queue: إضافة مريض لطابور الانتظار. البيانات: {"patientName":"..."}
- unknown: إذا لم يكن الأمر واضحاً

اليوم: ${today}. غداً: ${tomorrow}.
أيام الأسبوع: السبت، الأحد، الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة.
استخرج الوقت بصيغة HH:MM (24 ساعة). إذا قيل "الساعة 10" افترض "10:00"، "الساعة 3 العصر" = "15:00".
أعد JSON فقط بدون أي نص آخر: {"action":"...","data":{...}}`;

      try {
        const parseRes = await callAI({
          type: 'ai-action-parse',
          messages: [
            { role: 'system', content: parsePrompt },
            { role: 'user', content: command.trim() },
          ],
          max_tokens: 150,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        });
        const raw = parseRes.choices[0]?.message?.content?.trim() || '{}';
        intent = JSON.parse(raw);
      } catch (parseErr) {
        console.warn('ai-action parse error:', parseErr.message);
      }
    } else {
      // ── Simple keyword fallback (no AI) ────────────────────────
      const t = command.trim();
      if (/أضف\s+مريض|مريض\s+جديد|سجّل\s+مريض/.test(t)) {
        intent.action = 'create_patient';
        const nameMatch = t.match(/اسمه?\s+([\u0600-\u06FF\s]{2,30})/);
        const phoneMatch = t.match(/(01[0-9]{9})/);
        intent.data = {
          name: nameMatch ? nameMatch[1].trim() : '',
          nameAr: nameMatch ? nameMatch[1].trim() : '',
          phone: phoneMatch ? phoneMatch[1] : '',
        };
      } else if (/طابور|انتظار/.test(t)) {
        intent.action = 'add_to_queue';
        const nameMatch = t.match(/^(?:أضف|ضيف)\s+([\u0600-\u06FF\s]{2,30})/);
        intent.data = { patientName: nameMatch ? nameMatch[1].trim() : '' };
      } else if (/احجز|حجز|موعد/.test(t)) {
        intent.action = 'create_booking';
      }
    }

    console.log(`[ai-action] clinic=${clinicId} doctor=${doctorId} action=${intent.action} cmd="${command.slice(0, 80)}"`);

    // ── STEP 2: Execute action ────────────────────────────────────

    // ── Action: create_patient ────────────────────────────────────
    if (intent.action === 'create_patient') {
      const { name, nameAr, phone, gender } = intent.data || {};
      if (!name || !name.trim()) {
        return res.json({ success: false, action: 'create_patient', message: 'لم أتمكن من تحديد اسم المريض. مثال: أضف مريض اسمه محمد علي رقمه 01012345678' });
      }
      if (!phone || !/^01[0-9]{9}$/.test(phone.replace(/\s/g, ''))) {
        return res.json({ success: false, action: 'create_patient', message: `فهمت الاسم: "${name}" — بس محتاج رقم الموبايل (11 رقم يبدأ بـ 01).` });
      }

      // Check duplicate
      const { data: existing } = await supabaseAdmin
        .from('patients')
        .select('id, name')
        .eq('clinic_id', clinicId)
        .eq('phone', phone.replace(/\s/g, ''))
        .maybeSingle();

      if (existing) {
        return res.json({ success: false, action: 'create_patient', message: `يوجد مريض بنفس الرقم بالفعل: ${existing.name}.` });
      }

      const { data, error } = await supabaseAdmin
        .from('patients')
        .insert({
          clinic_id: clinicId,
          name: name.trim(),
          name_ar: (nameAr || name).trim(),
          phone: phone.replace(/\s/g, ''),
          gender: gender || 'male',
        })
        .select('id, name, name_ar, phone')
        .single();

      if (error) {
        console.error('[ai-action] create_patient error:', error.message);
        return res.json({ success: false, action: 'create_patient', message: 'حصل خطأ أثناء إضافة المريض. حاول تاني.' });
      }

      console.log(`[ai-action] ✓ patient created id=${data.id} name=${data.name}`);
      return res.json({ success: true, action: 'create_patient', data, message: `تم إضافة المريض "${data.name_ar || data.name}" بنجاح! ✓` });
    }

    // ── Action: add_to_queue ──────────────────────────────────────
    if (intent.action === 'add_to_queue') {
      const { patientName } = intent.data || {};
      if (!patientName || !patientName.trim()) {
        return res.json({ success: false, action: 'add_to_queue', message: 'لم أتمكن من تحديد اسم المريض. مثال: أضف محمد للطابور.' });
      }

      // Find patient by name
      const { data: patients } = await supabaseAdmin
        .from('patients')
        .select('id, name, name_ar, phone')
        .eq('clinic_id', clinicId)
        .or(`name.ilike.%${patientName.trim()}%,name_ar.ilike.%${patientName.trim()}%`)
        .limit(1);

      if (!patients || patients.length === 0) {
        return res.json({ success: false, action: 'add_to_queue', message: `لم أجد مريضاً باسم "${patientName}" في النظام. تأكد من الاسم أو أضفه أولاً.` });
      }

      const patient = patients[0];

      // Check not already in queue today
      const { data: existing } = await supabaseAdmin
        .from('visits')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('patient_id', patient.id)
        .eq('date', today)
        .in('status', ['waiting', 'in_consultation'])
        .maybeSingle();

      if (existing) {
        return res.json({ success: false, action: 'add_to_queue', message: `"${patient.name_ar || patient.name}" موجود بالفعل في الطابور اليوم.` });
      }

      const { data, error } = await supabaseAdmin
        .from('visits')
        .insert({
          clinic_id:  clinicId,
          patient_id: patient.id,
          doctor_id:  doctorId,
          date:       today,
          status:     'waiting',
        })
        .select('id')
        .single();

      if (error) {
        console.error('[ai-action] add_to_queue error:', error.message);
        return res.json({ success: false, action: 'add_to_queue', message: 'حصل خطأ أثناء إضافة المريض للطابور. حاول تاني.' });
      }

      console.log(`[ai-action] ✓ added to queue visit=${data.id} patient=${patient.name}`);
      return res.json({ success: true, action: 'add_to_queue', data, message: `تم إضافة "${patient.name_ar || patient.name}" لطابور الانتظار بنجاح! ✓` });
    }

    // ── Action: create_booking ────────────────────────────────────
    if (intent.action === 'create_booking') {
      const { patientName, date, time } = intent.data || {};
      if (!patientName || !patientName.trim()) {
        return res.json({ success: false, action: 'create_booking', message: 'لم أتمكن من تحديد اسم المريض. مثال: احجز موعد لأحمد غداً الساعة 10:00.' });
      }
      if (!date) {
        return res.json({ success: false, action: 'create_booking', message: `فهمت: حجز لـ"${patientName}" — بس محتاج التاريخ. مثال: احجز موعد لأحمد غداً الساعة 10.` });
      }
      if (!time) {
        return res.json({ success: false, action: 'create_booking', message: `فهمت: حجز لـ"${patientName}" يوم ${date} — بس محتاج الوقت. مثال: الساعة 10:00.` });
      }

      // Find patient
      const { data: patients } = await supabaseAdmin
        .from('patients')
        .select('id, name, name_ar')
        .eq('clinic_id', clinicId)
        .or(`name.ilike.%${patientName.trim()}%,name_ar.ilike.%${patientName.trim()}%`)
        .limit(1);

      if (!patients || patients.length === 0) {
        return res.json({ success: false, action: 'create_booking', message: `لم أجد مريضاً باسم "${patientName}". أضفه أولاً أو تأكد من الاسم.` });
      }

      const patient = patients[0];

      const { data, error } = await supabaseAdmin
        .from('appointments')
        .insert({
          clinic_id:  clinicId,
          patient_id: patient.id,
          doctor_id:  doctorId,
          date,
          time,
          status: 'scheduled',
        })
        .select('id, date, time')
        .single();

      if (error) {
        console.error('[ai-action] create_booking error:', error.message);
        return res.json({ success: false, action: 'create_booking', message: 'حصل خطأ أثناء إنشاء الموعد. حاول تاني.' });
      }

      console.log(`[ai-action] ✓ booking created id=${data.id} patient=${patient.name} date=${date} time=${time}`);
      return res.json({ success: true, action: 'create_booking', data, message: `تم حجز موعد لـ"${patient.name_ar || patient.name}" يوم ${date} الساعة ${time} ✓` });
    }

    // ── Unknown intent ────────────────────────────────────────────
    return res.json({
      success: false,
      action: 'unknown',
      message: 'لم أفهم الأمر. جرّب: "أضف مريض اسمه أحمد رقمه 01012345678" أو "أضف محمد للطابور" أو "احجز موعد لفاطمة غداً الساعة 11".',
    });

  } catch (error) {
    console.error('[ai-action] unexpected error:', error.message);
    res.status(500).json({ success: false, message: 'حصل خطأ غير متوقع. حاول مرة أخرى.' });
  }
});

// ── F5: Analyze Feedback ─────────────────────────────────────
app.post('/api/analyze-feedback', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { feedbacks } = req.body;
    if (!feedbacks || !Array.isArray(feedbacks) || feedbacks.length === 0) {
      return res.status(400).json({ error: 'feedbacks array required' });
    }
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      return res.json({
        sentiment: 'positive',
        summary: 'Patients are generally satisfied with the service.',
        summaryAr: 'المرضى راضون بشكل عام عن الخدمة.',
        themes: ['Friendly staff', 'Short waiting time'],
        themesAr: ['كادر لطيف', 'وقت انتظار قصير'],
        suggestions: ['Consider adding online booking reminders'],
        suggestionsAr: ['فكّر في إضافة تذكيرات الحجز الإلكترونية'],
      });
    }
    const feedbackText = feedbacks.map((f) => `Rating: ${f.stars}/5 - ${f.comment || 'No comment'}`).join('\n');
    const response = await callAI({ type: 'analyze-feedback',
      messages: [
        { role: 'system', content: `You are a patient experience analyst for an Egyptian medical clinic.
Analyze patient feedback and respond with JSON only:
{ "sentiment": "positive|neutral|negative", "summary": "English summary", "summaryAr": "Arabic summary", "themes": ["theme1","theme2"], "themesAr": ["موضوع1","موضوع2"], "suggestions": ["suggestion1"], "suggestionsAr": ["اقتراح1"] }` },
        { role: 'user', content: `Patient feedback to analyze:\n${feedbackText}` },
      ],
      max_tokens: 400,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });
    const raw = response.choices[0]?.message?.content?.trim() || '{}';
    res.json(JSON.parse(raw));
  } catch (error) {
    console.error('analyze-feedback error:', error.message);
    res.status(500).json({ error: 'Failed to analyze feedback' });
  }
});

// ── F7: Medical Search ───────────────────────────────────────
app.post('/api/medical-search', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { query, specialty } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      return res.json({ results: [{
        title: query,
        titleAr: query,
        content: 'Medical search requires an OpenAI API key for AI-powered results.',
        contentAr: 'البحث الطبي يتطلب مفتاح API للذكاء الاصطناعي.',
        category: 'general',
      }]});
    }
    const response = await callAI({ type: 'medical-search',
      messages: [
        { role: 'system', content: `You are a medical knowledge assistant for Egyptian healthcare professionals.
Provide concise, evidence-based medical information in both English and Arabic.
Respond with JSON only: { "results": [ { "title": "...", "titleAr": "...", "content": "...", "contentAr": "...", "category": "diagnosis|treatment|drug|guideline|anatomy" } ] }
Provide 2-3 relevant results maximum.` },
        { role: 'user', content: `Medical query: ${query}\nSpecialty context: ${specialty || 'General Medicine'}` },
      ],
      max_tokens: 600,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });
    const raw = response.choices[0]?.message?.content?.trim() || '{}';
    res.json(JSON.parse(raw));
  } catch (error) {
    console.error('medical-search error:', error.message);
    res.status(500).json({ error: 'Failed to search', results: [] });
  }
});

// ── F7: Generate Protocol ────────────────────────────────────
app.post('/api/generate-protocol', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { condition, specialty, language: lang } = req.body;
    if (!condition) return res.status(400).json({ error: 'condition required' });
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      return res.json({ protocol: `Clinical Protocol: ${condition}\n\n1. Assessment\n2. Diagnosis\n3. Treatment\n4. Follow-up\n\n[OpenAI API key required for AI-generated protocols]` });
    }
    const isArabic = lang === 'ar';
    const response = await callAI({ type: 'generate-protocol',
      messages: [
        { role: 'system', content: `You are a senior clinical specialist creating evidence-based protocols for Egyptian healthcare settings.
Generate a structured clinical management protocol ${isArabic ? 'in Arabic' : 'in English'}.
Use clear numbered sections: Assessment, Investigations, Diagnosis, Treatment, Follow-up, Red Flags.
Keep it practical for a private Egyptian clinic context.` },
        { role: 'user', content: `Generate a clinical protocol for: ${condition}\nSpecialty: ${specialty || 'General Medicine'}` },
      ],
      max_tokens: 600,
      temperature: 0.2,
    });
    const protocol = response.choices[0]?.message?.content?.trim() || '';
    res.json({ protocol });
  } catch (error) {
    console.error('generate-protocol error:', error.message);
    res.status(500).json({ error: 'Failed to generate protocol' });
  }
});

// ── B1: Assess Urgency ───────────────────────────────────────
app.post('/api/assess-urgency', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { symptoms } = req.body;
    if (!symptoms) return res.status(400).json({ error: 'symptoms required' });
    const URGENT_KEYWORDS = [
      'chest pain', 'difficulty breathing', 'stroke', 'unconscious', 'severe bleeding',
      'heart attack', 'أزمة قلبية', 'جلطة',
      // Arabic with and without prepositions
      'ألم صدر', 'ألم في الصدر', 'ألم بالصدر',
      'صعوبة تنفس', 'صعوبة في التنفس', 'صعوبة بالتنفس', 'ضيقة في النفس', 'ضيق تنفس',
      'فقدان وعي', 'فقدان الوعي',
      'نزيف شديد', 'نزيف لا يتوقف', 'نزيف ما بيوقف',
    ];
    const isUrgentLocal = URGENT_KEYWORDS.some(kw => symptoms.toLowerCase().includes(kw.toLowerCase()));
    if (isUrgentLocal) {
      return res.json({ isUrgent: true, level: 'emergency', messageEn: 'This sounds like a medical emergency. Please seek immediate care.', messageAr: 'هذه تبدو حالة طوارئ طبية. يرجى طلب الرعاية الفورية.' });
    }
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      return res.json({ isUrgent: false, level: 'routine', messageEn: 'Your symptoms appear routine. Please book an appointment.', messageAr: 'الأعراض تبدو عادية. يرجى حجز موعد.' });
    }
    const response = await callAI({ type: 'assess-urgency',
      messages: [
        { role: 'system', content: `You are a medical triage assistant. Assess symptom urgency.
Respond with JSON only: { "isUrgent": boolean, "level": "emergency|urgent|routine", "messageEn": "...", "messageAr": "..." }
emergency = life-threatening, urgent = needs same-day care, routine = can wait for scheduled appointment.` },
        { role: 'user', content: `Patient symptoms: ${symptoms}` },
      ],
      max_tokens: 150,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    const raw = response.choices[0]?.message?.content?.trim() || '{}';
    res.json(JSON.parse(raw));
  } catch (error) {
    console.error('assess-urgency error:', error.message);
    res.json({ isUrgent: false, level: 'routine', messageEn: 'Please proceed to book your appointment.', messageAr: 'يرجى المتابعة لحجز موعدك.' });
  }
});

// ═══════════════════════════════════════════════════════════
// AUTH routes
// ═══════════════════════════════════════════════════════════

// POST /api/auth/login  (rate-limited: 10 attempts per 15 min per IP)
app.post('/api/auth/login', rateLimiter(10, 15 * 60 * 1000), requireSupabase, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const safeEmail = sanitiseString(email).toLowerCase();
  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email: safeEmail, password });
  if (error) {
    serverAudit({ action: 'login', entity: 'user', description: `Failed login: ${safeEmail}`, req, severity: 'warn' });
    return res.status(401).json({ error: error.message });
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('id, name, name_ar, role, clinic_id, specialty_id, is_active')
    .eq('id', data.user.id)
    .single();

  if (!profile?.is_active) {
    serverAudit({ userId: data.user.id, action: 'login', entity: 'user', description: 'Login blocked: deactivated account', req, severity: 'warn' });
    return res.status(403).json({ error: 'Account is deactivated' });
  }

  serverAudit({ userId: profile.id, clinicId: profile.clinic_id, action: 'login', entity: 'user', entityId: profile.id, description: `Login: ${safeEmail} (${profile.role})`, req });
  res.json({
    token: data.session.access_token,
    refresh: data.session.refresh_token,
    user: profile,
  });
});

// POST /api/auth/refresh
app.post('/api/auth/refresh', requireSupabase, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
  if (error) return res.status(401).json({ error: error.message });
  res.json({
    token: data.session.access_token,
    refresh: data.session.refresh_token,
  });
});

// POST /api/auth/logout
app.post('/api/auth/logout', requireSupabase, authenticate, async (req, res) => {
  await supabaseAdmin.auth.admin.signOut(req.auth.userId);
  res.json({ message: 'Logged out' });
});

// GET /api/auth/clinics — super admin
app.get('/api/auth/clinics', requireSupabase, authenticate, requireRole('super_admin'), async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/auth/clinics — super admin
app.post('/api/auth/clinics', requireSupabase, authenticate, requireRole('super_admin'), async (req, res) => {
  const { name, nameAr, address, phone, city, subscriptionPlan, maxDoctors, planExpiresAt, aiEnabled, advancedReports } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const { data, error } = await supabaseAdmin
    .from('clinics')
    .insert({
      name,
      name_ar: nameAr || '',
      address: address || '',
      phone: phone || '',
      city: city || '',
      subscription_plan: subscriptionPlan || 'basic',
      max_doctors: maxDoctors || 3,
      plan_expires_at: planExpiresAt || null,
      ai_enabled: aiEnabled || false,
      advanced_reports: advancedReports || false,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET /api/auth/clinics/:id — get clinic info (any authenticated staff)
app.get('/api/auth/clinics/:id', requireSupabase, authenticate, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select('id, name, name_ar, subscription_plan, is_active, city, city_ar')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Clinic not found' });
  res.json(data);
});

// PATCH /api/auth/clinics/:id/subscription
app.patch('/api/auth/clinics/:id/subscription', requireSupabase, authenticate, requireRole('super_admin'), async (req, res) => {
  const { id } = req.params;
  const { subscriptionPlan, planExpiresAt, maxDoctors, aiEnabled, advancedReports, isActive } = req.body;

  const updates = {};
  if (subscriptionPlan !== undefined) updates.subscription_plan = subscriptionPlan;
  if (planExpiresAt !== undefined) updates.plan_expires_at = planExpiresAt;
  if (maxDoctors !== undefined) updates.max_doctors = maxDoctors;
  if (aiEnabled !== undefined) updates.ai_enabled = aiEnabled;
  if (advancedReports !== undefined) updates.advanced_reports = advancedReports;
  if (isActive !== undefined) updates.is_active = isActive;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('clinics')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/superadmin/provision-user
// Called by SuperAdmin approval flow to create users in Supabase when it is available.
// Auth: super admin password in body (no JWT needed — super admin has no Supabase session).
// Returns 200 {ok:false} when Supabase is offline (graceful — local fallback handles login).
app.post('/api/superadmin/provision-user', async (req, res) => {
  const SA_PASS = process.env.SUPER_ADMIN_PASSWORD || 'Mon_oskar11';
  const { superAdminPassword, email, password, name, nameAr, role, clinicId, specialtyId } = req.body;
  if (!superAdminPassword || superAdminPassword !== SA_PASS) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'email, password, name, role required' });
  }
  if (!supabaseReady) {
    return res.json({ ok: false, reason: 'supabase_offline' });
  }
  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
  });
  if (authErr) {
    // User may already exist in Supabase auth — not a fatal error
    if (authErr.message.includes('already')) return res.json({ ok: false, reason: 'already_exists' });
    return res.status(400).json({ error: authErr.message });
  }
  const { error: profileErr } = await supabaseAdmin.from('users').insert({
    id:           authData.user.id,
    name,
    name_ar:      nameAr || name,
    email:        email.trim().toLowerCase(),
    role,
    clinic_id:    clinicId || null,
    specialty_id: specialtyId || null,
    is_active:    true,
  });
  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
    return res.status(500).json({ error: profileErr.message });
  }
  serverAudit({ action: 'create', entity: 'user', description: `SuperAdmin provisioned: ${email} (${role})`, req });
  res.json({ ok: true, userId: authData.user.id });
});

// POST /api/auth/users — create user (admin or super_admin)
app.post('/api/auth/users', requireSupabase, authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  const { email, password, name, nameAr, role, clinicId, specialtyId } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).json({ error: 'email, password, name, role required' });
  }

  const targetClinicId = clinicId || req.auth.clinicId;

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr) return res.status(400).json({ error: authErr.message });

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('users')
    .insert({
      id: authData.user.id,
      name,
      name_ar: nameAr || '',
      email,
      role,
      clinic_id: targetClinicId || null,
      specialty_id: specialtyId || null,
      is_active: true,
    })
    .select()
    .single();

  if (profileErr) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(500).json({ error: profileErr.message });
  }

  res.status(201).json(profile);
});

// GET /api/auth/me
app.get('/api/auth/me', requireSupabase, authenticate, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('*, clinic:clinics(*)')
    .eq('id', req.auth.userId)
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// PATIENTS routes
// ═══════════════════════════════════════════════════════════

// GET /api/patients
app.get('/api/patients', ...guard, async (req, res) => {
  const db = supabaseAs(req.auth.jwt);
  const { search, page = 1, limit = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let query = db
    .from('patients')
    .select('*', { count: 'exact' })
    .eq('clinic_id', req.auth.clinicId)
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,national_id.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count, page: Number(page), limit: Number(limit) });
});

// GET /api/patients/:id
app.get('/api/patients/:id', ...guard, async (req, res) => {
  const db = supabaseAs(req.auth.jwt);
  const { data, error } = await db
    .from('patients')
    .select(`
      *,
      visits(id, status, date, doctor:users(name, name_ar), visit_type:visit_types(name, name_ar)),
      appointments(id, status, date, time, doctor:users(name, name_ar))
    `)
    .eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId)
    .single();
  if (error) return res.status(404).json({ error: 'Patient not found' });
  res.json(data);
});

// POST /api/patients
app.post('/api/patients', ...guard, requireRole('admin', 'reception'), async (req, res) => {
  const { name, nameAr, phone, email, dateOfBirth, gender, nationalId } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });

  const { data, error } = await supabaseAdmin
    .from('patients')
    .insert({
      clinic_id: req.auth.clinicId,
      name,
      name_ar: nameAr || '',
      phone,
      email: email || null,
      date_of_birth: dateOfBirth || null,
      gender: gender || null,
      national_id: nationalId || null,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/patients/:id
app.patch('/api/patients/:id', ...guard, requireRole('admin', 'reception'), async (req, res) => {
  const { name, nameAr, phone, email, dateOfBirth, gender, nationalId } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (nameAr !== undefined) updates.name_ar = nameAr;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (dateOfBirth !== undefined) updates.date_of_birth = dateOfBirth;
  if (gender !== undefined) updates.gender = gender;
  if (nationalId !== undefined) updates.national_id = nationalId;

  const { data, error } = await supabaseAdmin
    .from('patients')
    .update(updates)
    .eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// APPOINTMENTS routes
// ═══════════════════════════════════════════════════════════

// GET /api/appointments
app.get('/api/appointments', ...guard, async (req, res) => {
  const db = supabaseAs(req.auth.jwt);
  const { date, doctorId, status, patientId } = req.query;

  let query = db
    .from('appointments')
    .select(`
      *,
      patient:patients(id, name, name_ar, phone),
      doctor:users(id, name, name_ar),
      visit_type:visit_types(id, name, name_ar, price)
    `)
    .eq('clinic_id', req.auth.clinicId)
    .order('date', { ascending: true })
    .order('time', { ascending: true });

  if (date) query = query.eq('date', date);
  if (doctorId) query = query.eq('doctor_id', doctorId);
  if (status) query = query.eq('status', status);
  if (patientId) query = query.eq('patient_id', patientId);

  if (req.auth.role === 'doctor') {
    query = query.eq('doctor_id', req.auth.userId);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/appointments/slots
app.get('/api/appointments/slots', requireSupabase, async (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) {
    return res.status(400).json({ error: 'doctorId and date required' });
  }

  const dayOfWeek = new Date(date).getDay();

  const [scheduleResult, blockedResult, appointmentsResult] = await Promise.all([
    supabaseAdmin
      .from('doctor_schedules')
      .select('start_time, end_time')
      .eq('doctor_id', doctorId)
      .eq('day_of_week', dayOfWeek)
      .eq('is_active', true)
      .single(),
    supabaseAdmin
      .from('blocked_dates')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .single(),
    supabaseAdmin
      .from('appointments')
      .select('time')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .in('status', ['scheduled', 'confirmed']),
  ]);

  if (blockedResult.data) {
    return res.json({ slots: [], blocked: true });
  }

  if (!scheduleResult.data) {
    return res.json({ slots: [], blocked: false, noSchedule: true });
  }

  const { start_time, end_time } = scheduleResult.data;
  const bookedTimes = new Set((appointmentsResult.data || []).map(a => a.time));

  const slots = [];
  const [startH, startM] = start_time.split(':').map(Number);
  const [endH, endM] = end_time.split(':').map(Number);
  let current = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (current < endMinutes) {
    const h = String(Math.floor(current / 60)).padStart(2, '0');
    const m = String(current % 60).padStart(2, '0');
    const time = `${h}:${m}`;
    slots.push({ time, available: !bookedTimes.has(time) });
    current += 20;
  }

  res.json({ slots, blocked: false });
});

// POST /api/appointments
app.post('/api/appointments', ...guard, requireRole('admin', 'reception', 'patient'), async (req, res) => {
  const { patientId, doctorId, visitTypeId, date, time, notes } = req.body;
  if (!patientId || !doctorId || !date || !time) {
    return res.status(400).json({ error: 'patientId, doctorId, date, time required' });
  }

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      clinic_id: req.auth.clinicId,
      patient_id: patientId,
      doctor_id: doctorId,
      visit_type_id: visitTypeId || null,
      date,
      time,
      notes: notes || null,
      status: 'scheduled',
    })
    .select(`
      *,
      patient:patients(id, name, name_ar, phone),
      doctor:users(id, name, name_ar),
      visit_type:visit_types(id, name, name_ar, price)
    `)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
  // Notification: booking_created
  setImmediate(async () => {
    try {
      const phone = data.patient?.phone;
      if (!phone) return;
      const { count } = await supabaseAdmin
        .from('appointments').select('*', { count: 'exact', head: true })
        .eq('doctor_id', data.doctor_id || doctorId).eq('date', date)
        .in('status', ['scheduled', 'confirmed']);
      await notifyQueueEvent('booking_created', data.patient_id || patientId, phone, req.auth.clinicId, {
        position: count ?? 1,
        doctorName: data.doctor?.name_ar || data.doctor?.name,
        date, time,
      });
    } catch (e) { console.error('[QueueNotif] booking_created:', e.message); }
  });
});

// PATCH /api/appointments/:id/reschedule
app.patch('/api/appointments/:id/reschedule', ...guard, requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  const { date, time } = req.body;
  if (!date && !time) return res.status(400).json({ error: 'date or time required' });
  const updates = { updated_at: new Date().toISOString() };
  if (date) updates.date = date;
  if (time) updates.time = time;
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update(updates)
    .eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/users/:id/home-visit
app.patch('/api/users/:id/home-visit', ...guard, requireRole('admin', 'doctor', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { homeVisitEnabled, homeVisitPrice, homeVisitDurationMinutes, homeVisitRadiusKm, homeVisitDailyLimit, homeVisitAreas } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (homeVisitEnabled !== undefined) updates.home_visit_enabled = homeVisitEnabled;
  if (homeVisitPrice !== undefined)   updates.home_visit_price = homeVisitPrice;
  if (homeVisitDurationMinutes !== undefined) updates.home_visit_duration_minutes = homeVisitDurationMinutes;
  if (homeVisitRadiusKm !== undefined) updates.home_visit_radius_km = homeVisitRadiusKm;
  if (homeVisitDailyLimit !== undefined) updates.home_visit_daily_limit = homeVisitDailyLimit;
  if (homeVisitAreas !== undefined)   updates.home_visit_areas = homeVisitAreas;
  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', req.params.id)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/appointments/:id/status
app.patch('/api/appointments/:id/status', ...guard, requireRole('admin', 'reception'), async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// VISITS routes
// ═══════════════════════════════════════════════════════════

// GET /api/visits
app.get('/api/visits', ...guard, async (req, res) => {
  const db = supabaseAs(req.auth.jwt);
  const { date, doctorId, status, patientId } = req.query;
  const clinicId = req.auth.clinicId;

  // ── Safeguard: rescue checked_in visits with paid invoices (STEP 6) ──────────
  // Runs only when fetching today's visits to keep the heal targeted and fast.
  if (date && supabaseReady) {
    try {
      // Find visits stuck in 'checked_in' or 'booked' that have a paid invoice
      const { data: stuck } = await supabaseAdmin
        .from('visits')
        .select('id, invoice_id, arrival_time')
        .eq('clinic_id', clinicId)
        .eq('date', date)
        .in('status', ['checked_in', 'booked']);

      if (stuck?.length) {
        const visitIds = stuck.map(v => v.invoice_id).filter(Boolean);
        const { data: paidInvoices } = await supabaseAdmin
          .from('invoices')
          .select('id, visit_id')
          .in('id', visitIds)
          .eq('status', 'paid');

        for (const inv of (paidInvoices || [])) {
          const stuckVisit = stuck.find(v => v.invoice_id === inv.id);
          if (stuckVisit) {
            await supabaseAdmin
              .from('visits')
              .update({
                status:       'waiting',
                arrival_time: stuckVisit.arrival_time ?? new Date().toISOString(),
                updated_at:   new Date().toISOString(),
              })
              .eq('id', stuckVisit.id);
          }
        }
      }
    } catch (_) { /* non-blocking */ }
  }

  let query = db
    .from('visits')
    .select(`
      *,
      patient:patients(id, name, name_ar, phone),
      doctor:users(id, name, name_ar),
      visit_type:visit_types(id, name, name_ar),
      invoices(id, status, total_amount, paid_amount)
    `)
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false });

  if (date) query = query.eq('date', date);
  if (status) query = query.eq('status', status);
  if (patientId) query = query.eq('patient_id', patientId);

  if (doctorId) {
    query = query.eq('doctor_id', doctorId);
  } else if (req.auth.role === 'doctor') {
    query = query.eq('doctor_id', req.auth.userId);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/visits/:id
app.get('/api/visits/:id', ...guard, async (req, res) => {
  const db = supabaseAs(req.auth.jwt);
  const { data, error } = await db
    .from('visits')
    .select(`
      *,
      patient:patients(id, name, name_ar, phone, date_of_birth, gender),
      doctor:users(id, name, name_ar),
      visit_type:visit_types(id, name, name_ar, price),
      invoices(*)
    `)
    .eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId)
    .single();
  if (error) return res.status(404).json({ error: 'Visit not found' });
  res.json(data);
});

// POST /api/visits
app.post('/api/visits', ...guard, requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  const { patientId, doctorId, visitTypeId, date, notes, appointmentId } = req.body;
  if (!patientId || !doctorId) {
    return res.status(400).json({ error: 'patientId and doctorId required' });
  }

  const { data, error } = await supabaseAdmin
    .from('visits')
    .insert({
      clinic_id:      req.auth.clinicId,
      patient_id:     patientId,
      doctor_id:      doctorId,
      visit_type_id:  visitTypeId || null,
      appointment_id: appointmentId || null,
      date:           date || new Date().toISOString().slice(0, 10),
      notes:          notes || null,
      status:         'waiting',
    })
    .select(`
      *,
      patient:patients(id, name, name_ar, phone),
      doctor:users(id, name, name_ar)
    `)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Update appointment status if linked
  if (appointmentId) {
    await supabaseAdmin
      .from('appointments')
      .update({ status: 'arrived', updated_at: new Date().toISOString() })
      .eq('id', appointmentId);
  }

  res.status(201).json(data);
});

// PATCH /api/visits/:id
app.patch('/api/visits/:id', ...guard, requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  const allowed = ['status', 'notes', 'diagnosis', 'prescription', 'vital_signs', 'visit_type_id'];
  const updates = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabaseAdmin
    .from('visits')
    .update(updates)
    .eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
  // Notification: no_show
  if (req.body.status === 'no_show' && data?.patient_id) {
    setImmediate(async () => {
      try {
        const phone = await getPatientPhone(data.patient_id);
        if (phone) await notifyQueueEvent('no_show', data.patient_id, phone, data.clinic_id);
        if (data.doctor_id && data.clinic_id) await notifyNearTurnPositions(data.doctor_id, data.clinic_id);
      } catch (e) { console.error('[QueueNotif] no_show visit:', e.message); }
    });
  }
});

// ═══════════════════════════════════════════════════════════
// INVOICES routes
// ═══════════════════════════════════════════════════════════

// GET /api/invoices
app.get('/api/invoices', ...guard, requireModule('finance'), async (req, res) => {
  const db = supabaseAs(req.auth.jwt);
  const { visitId, patientId, status } = req.query;

  let query = db
    .from('invoices')
    .select(`
      *,
      patient:patients(id, name, name_ar, phone),
      visit:visits(id, date, doctor:users(name, name_ar)),
      invoice_items(*)
    `)
    .eq('clinic_id', req.auth.clinicId)
    .order('created_at', { ascending: false });

  if (visitId) query = query.eq('visit_id', visitId);
  if (patientId) query = query.eq('patient_id', patientId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/invoices
app.post('/api/invoices', ...guard, requireModule('finance'), requireRole('admin', 'reception'), async (req, res) => {
  const { visitId, patientId, items, discountAmount, discountPercent, notes } = req.body;
  if (!patientId || !items?.length) {
    return res.status(400).json({ error: 'patientId and items required' });
  }

  const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
  const discount = discountAmount || (discountPercent ? subtotal * discountPercent / 100 : 0);
  const total = subtotal - discount;

  const { data: invoice, error: invErr } = await supabaseAdmin
    .from('invoices')
    .insert({
      clinic_id:        req.auth.clinicId,
      visit_id:         visitId || null,
      patient_id:       patientId,
      subtotal_amount:  subtotal,
      discount_amount:  discount,
      total_amount:     total,
      paid_amount:      0,
      status:           'pending',
      notes:            notes || null,
    })
    .select()
    .single();

  if (invErr) return res.status(500).json({ error: invErr.message });

  const { error: itemsErr } = await supabaseAdmin
    .from('invoice_items')
    .insert(items.map(i => ({
      invoice_id:  invoice.id,
      name:        i.name,
      name_ar:     i.name_ar || '',
      quantity:    i.quantity,
      unit_price:  i.unit_price,
      total_price: i.quantity * i.unit_price,
    })));

  if (itemsErr) return res.status(500).json({ error: itemsErr.message });

  res.status(201).json(invoice);
});

// PATCH /api/invoices/:id/payment
app.patch('/api/invoices/:id/payment', ...guard, requireModule('finance'), requireRole('admin', 'reception'), async (req, res) => {
  const { paidAmount, paymentMethod } = req.body;
  if (paidAmount === undefined) return res.status(400).json({ error: 'paidAmount required' });

  const { data: current } = await supabaseAdmin
    .from('invoices')
    .select('total_amount, paid_amount, visit_id, status')
    .eq('id', req.params.id)
    .single();

  if (!current) return res.status(404).json({ error: 'Invoice not found' });

  const wasPending = current.status === 'pending' || current.status === 'partially_paid';
  const newPaid    = (current.paid_amount || 0) + Number(paidAmount);
  const total      = current.total_amount || 0;
  const newStatus  = (total > 0 && newPaid >= total) ? 'paid'
                   : newPaid > 0 ? 'partially_paid' : 'pending';
  const nowPaid    = newStatus === 'paid' && wasPending;

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({
      paid_amount:    newPaid,
      status:         newStatus,
      payment_method: paymentMethod || null,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // ── QUEUE TRANSITION: payment = arrival in Egyptian workflow ──
  // When invoice becomes fully paid, move visit → 'waiting' so doctor can see patient.
  if (nowPaid && current.visit_id) {
    const { data: visit } = await supabaseAdmin
      .from('visits')
      .select('id, status, is_urgent')
      .eq('id', current.visit_id)
      .single();

    if (visit && (visit.status === 'checked_in' || visit.status === 'booked')) {
      await supabaseAdmin
        .from('visits')
        .update({
          status:       'waiting',
          arrival_time: new Date().toISOString(),
          updated_at:   new Date().toISOString(),
        })
        .eq('id', current.visit_id);

      serverAudit({
        userId:    req.auth.userId, clinicId: req.auth.clinicId,
        action: 'update', entity: 'appointment',
        entityId: current.visit_id,
        description: `Visit ${current.visit_id} moved to waiting queue after payment`,
        req,
      });
    }
  }

  res.json(data);
});

// GET /api/billing/invoices — alias used by useInvoices hook (includes payments + items)
app.get('/api/billing/invoices', ...guard, requireModule('finance'), async (req, res) => {
  const db = supabaseAs(req.auth.jwt);
  const { visitId, patientId, status } = req.query;
  let query = db
    .from('invoices')
    .select(`*, patient:patients(id, name, name_ar, phone), visit:visits(id, date, doctor:users(name, name_ar)), invoice_items(*), payments(*)`)
    .eq('clinic_id', req.auth.clinicId)
    .order('created_at', { ascending: false });
  if (visitId)   query = query.eq('visit_id', visitId);
  if (patientId) query = query.eq('patient_id', patientId);
  if (status)    query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/billing/invoices/:id/items — add service to invoice
app.post('/api/billing/invoices/:id/items', ...guard, requireModule('finance'), requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  const { serviceId, quantity = 1 } = req.body;
  if (!serviceId) return res.status(400).json({ error: 'serviceId required' });
  const { data: svc } = await supabaseAdmin.from('services').select('*').eq('id', serviceId).single();
  if (!svc) return res.status(404).json({ error: 'service not found' });
  const totalPrice  = svc.price * quantity;
  const doctorShare = Math.round(totalPrice * (svc.doctor_percentage || 0) / 100);
  const { data, error } = await supabaseAdmin.from('invoice_items').insert({
    invoice_id: req.params.id, service_id: serviceId,
    quantity, unit_price: svc.price, total_price: totalPrice, doctor_share: doctorShare,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /api/billing/invoices/:id/discount
app.patch('/api/billing/invoices/:id/discount', ...guard, requireModule('finance'), requireRole('admin', 'reception'), async (req, res) => {
  const { discountType, discountValue } = req.body;
  if (!discountType) return res.status(400).json({ error: 'discountType required' });
  const { data, error } = await supabaseAdmin.from('invoices')
    .update({ discount_type: discountType, discount_value: discountValue ?? 0, updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/billing/invoices/:id/refund
app.post('/api/billing/invoices/:id/refund', ...guard, requireModule('finance'), requireRole('admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin.from('invoices')
    .update({ status: 'refunded', updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/billing/invoices/:id/pay  (alias used by useInvoices hook)
app.post('/api/billing/invoices/:id/pay', ...guard, requireModule('finance'), requireRole('admin', 'reception'), async (req, res) => {
  const { amount, method } = req.body;
  if (!amount) return res.status(400).json({ error: 'amount required' });

  const { data: current } = await supabaseAdmin
    .from('invoices')
    .select('total_amount, paid_amount, visit_id, status')
    .eq('id', req.params.id)
    .single();

  if (!current) return res.status(404).json({ error: 'Invoice not found' });

  const wasPending = current.status === 'pending' || current.status === 'partially_paid';
  const newPaid    = (current.paid_amount || 0) + Number(amount);
  const total      = current.total_amount || 0;
  const newStatus  = (total > 0 && newPaid >= total) ? 'paid'
                   : newPaid > 0 ? 'partially_paid' : 'pending';
  const nowPaid    = newStatus === 'paid' && wasPending;

  // Insert payment record
  await supabaseAdmin.from('payments').insert({
    invoice_id: req.params.id,
    clinic_id:  req.auth.clinicId,
    amount:     Number(amount),
    method:     method || 'cash',
    received_by: req.auth.userId,
  });

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({ paid_amount: newPaid, status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // ── QUEUE TRANSITION ──────────────────────────────────────────
  if (nowPaid && current.visit_id) {
    const { data: visit } = await supabaseAdmin
      .from('visits')
      .select('id, status')
      .eq('id', current.visit_id)
      .single();

    if (visit && (visit.status === 'checked_in' || visit.status === 'booked')) {
      await supabaseAdmin
        .from('visits')
        .update({ status: 'waiting', arrival_time: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', current.visit_id);
    }
  }

  serverAudit({ userId: req.auth.userId, clinicId: req.auth.clinicId, action: 'update', entity: 'invoice', entityId: req.params.id, description: `Payment recorded: ${amount} — status: ${newStatus}`, req });
  if (newStatus === 'paid') {
    fireWebhooks(req.auth.clinicId, 'payment_done', { invoiceId: req.params.id, amount, method, newStatus });
  }
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// SERVICES / VISIT TYPES routes
// ═══════════════════════════════════════════════════════════

// GET /api/services
app.get('/api/services', requireSupabase, async (req, res) => {
  const { specialtyId } = req.query;
  let query = supabaseAdmin.from('services').select('*').eq('is_active', true);
  if (specialtyId) query = query.eq('specialty_id', specialtyId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// DOCTOR SCHEDULE routes
// ═══════════════════════════════════════════════════════════

// GET /api/schedule/:doctorId
app.get('/api/schedule/:doctorId', requireSupabase, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('doctor_schedules')
    .select('*')
    .eq('doctor_id', req.params.doctorId)
    .eq('is_active', true)
    .order('day_of_week');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /api/schedule/:doctorId
app.put('/api/schedule/:doctorId', ...guard, requireRole('admin', 'doctor'), async (req, res) => {
  const { schedule } = req.body;
  if (!Array.isArray(schedule)) return res.status(400).json({ error: 'schedule array required' });

  await supabaseAdmin
    .from('doctor_schedules')
    .delete()
    .eq('doctor_id', req.params.doctorId);

  if (schedule.length === 0) return res.json([]);

  const { data, error } = await supabaseAdmin
    .from('doctor_schedules')
    .insert(schedule.map(s => ({
      doctor_id:   req.params.doctorId,
      day_of_week: s.dayOfWeek,
      start_time:  s.startTime,
      end_time:    s.endTime,
      is_active:   true,
    })))
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// CLINIC PROFILE routes
// ═══════════════════════════════════════════════════════════

// GET /api/clinics/:id/public  — public profile
app.get('/api/clinics/:id/public', requireSupabase, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('clinics')
    .select(`
      id, name, name_ar, address, address_ar, phone, city, city_ar,
      description, description_ar, cover_image_url, working_hours, working_hours_ar,
      latitude, longitude, website, social_links,
      users!users_clinic_id_fkey(
        id, name, name_ar, specialty_id,
        specialties(name, name_ar)
      )
    `)
    .eq('id', req.params.id)
    .eq('is_active', true)
    .single();
  if (error) return res.status(404).json({ error: 'Clinic not found' });
  res.json(data);
});

// PATCH /api/clinics/:id/profile — admin update clinic profile
app.patch('/api/clinics/:id/profile', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  const allowed = ['name', 'name_ar', 'address', 'address_ar', 'phone', 'city', 'city_ar',
    'description', 'description_ar', 'cover_image_url', 'working_hours', 'working_hours_ar',
    'latitude', 'longitude', 'website', 'social_links'];
  const updates = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabaseAdmin
    .from('clinics')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// AI DRUG AUTOFILL
// ═══════════════════════════════════════════════════════════
app.post('/api/drug-autofill', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { drugName, indication, language } = req.body;
    if (!drugName) return res.status(400).json({ error: 'drugName required' });

    if (!openaiReady || !serverAiConfig.globallyEnabled) {
      return res.json({
        dosage: '500mg',
        frequency: 'Twice daily',
        duration: '5-7 days',
        notes: '',
      });
    }

    const prompt = `You are a clinical pharmacist. For the drug "${drugName}"${indication ? ` used for "${indication}"` : ''}, provide the standard Egyptian adult dosage in JSON format with fields: dosage (e.g. "500mg"), frequency (e.g. "Twice daily"), duration (e.g. "7 days"), notes (short safety note or empty string). Reply ONLY with valid JSON, no markdown.`;

    const completion = await callAI({ type: 'drug-autofill',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 150,
    });

    const text = completion.choices[0].message.content?.trim() || '{}';
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { parsed = { dosage: text, frequency: '', duration: '', notes: '' }; }
    res.json(parsed);
  } catch (err) {
    console.error('drug-autofill error:', err);
    res.status(500).json({ error: 'AI error' });
  }
});

// ═══════════════════════════════════════════════════════════
// AI SMART PATIENT SEARCH
// ═══════════════════════════════════════════════════════════
app.post('/api/smart-patient-search', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { query, patients } = req.body;
    if (!query || !Array.isArray(patients)) return res.status(400).json({ error: 'query and patients required' });

    if (!openaiReady || !serverAiConfig.globallyEnabled) {
      // Fallback: keyword match on name/tags
      const q = query.toLowerCase();
      const ids = patients
        .filter(p =>
          p.name?.toLowerCase().includes(q) ||
          p.nameAr?.includes(query) ||
          p.tags?.some((t) => t.toLowerCase().includes(q))
        )
        .map(p => p.id);
      return res.json({ ids });
    }

    const patientSummary = patients.slice(0, 200).map(p =>
      `ID:${p.id} Name:${p.name} Age:${p.age} Gender:${p.gender} Tags:${(p.tags || []).join(',')}`
    ).join('\n');

    const prompt = `You are a medical assistant. Given this natural language query: "${query}", find matching patient IDs from the list below. Return ONLY a JSON array of matching IDs, e.g. ["id1","id2"]. If none match, return []. Consider age, gender, tags, and names.\n\nPatients:\n${patientSummary}`;

    const completion = await callAI({ type: 'smart-patient-search',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 300,
    });

    const text = completion.choices[0].message.content?.trim() || '[]';
    let ids = [];
    try { ids = JSON.parse(text); } catch { ids = []; }
    res.json({ ids: Array.isArray(ids) ? ids : [] });
  } catch (err) {
    console.error('smart-patient-search error:', err);
    res.status(500).json({ error: 'AI error' });
  }
});

// ═══════════════════════════════════════════════════════════
// AI SCRIBE
// ═══════════════════════════════════════════════════════════
app.post('/api/ai-scribe', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { text, language } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    if (!openaiReady || !serverAiConfig.globallyEnabled) {
      return res.json({ structured: `SOAP Note:\nSubjective: ${text}\nObjective: -\nAssessment: -\nPlan: -` });
    }

    const isAr = language === 'ar';
    const prompt = isAr
      ? `أنت طبيب. حوّل النص التالي إلى ملاحظة SOAP منظمة باللغة العربية:\n\n${text}\n\nاستخدم تنسيق:\nالشكوى (S):\nالفحص (O):\nالتشخيص (A):\nالخطة (P):`
      : `You are a physician. Convert the following free-text clinical note into a structured SOAP note:\n\n${text}\n\nFormat:\nSubjective:\nObjective:\nAssessment:\nPlan:`;

    const completion = await callAI({ type: 'ai-scribe',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 400,
    });

    res.json({ structured: completion.choices[0].message.content?.trim() || '' });
  } catch (err) {
    console.error('ai-scribe error:', err);
    res.status(500).json({ error: 'AI error' });
  }
});

// ─── AI Medical Copilot (STEP 2+3) ───────────────────────────
// POST /api/ai/medical-assistant
// Input:  { patient_notes, language? }
// Output: { summary, diagnosis, treatment, icd_code }
app.post('/api/ai/medical-assistant', tryAuthenticate, requireModule('ai'), async (req, res) => {
  try {
    const { patient_notes, language } = req.body;
    if (!patient_notes || !patient_notes.trim()) {
      return res.status(400).json({ error: 'patient_notes is required' });
    }

    // STEP 3 — mock fallback when no API key (demo-safe)
    if (!openaiReady || !serverAiConfig.globallyEnabled) {
      const isAr = language === 'ar';
      return res.json({
        summary:   isAr
          ? `المريض يعاني من الأعراض التالية: ${patient_notes.slice(0, 120)}...`
          : `Patient presents with the following: ${patient_notes.slice(0, 120)}...`,
        diagnosis: isAr
          ? 'التشخيص المحتمل: يحتاج إلى مزيد من الفحوصات — (هذا رد تجريبي بدون مفتاح AI)'
          : 'Likely diagnosis: Requires further workup — (demo response, no AI key)',
        treatment: isAr
          ? 'يُنصح بالراحة، وزيارة طبيب مختص، والفحوصات اللازمة.'
          : 'Rest, follow-up with specialist, order relevant investigations.',
        icd_code: 'R69',   // ICD-10: Unknown and unspecified causes of morbidity
      });
    }

    const isAr = language === 'ar';
    const doctorCtx = req.body?.doctorId ? buildDoctorPromptContext(req.body.doctorId) : '';
    const systemPrompt = (isAr
      ? `أنت مساعد طبي خبير. بناءً على ملاحظات الطبيب، قدّم ردًا منظمًا بصيغة JSON فقط (بدون ماركداون) يحتوي على:
{
  "summary": "ملخص موجز للحالة",
  "diagnosis": "التشخيص المحتمل أو التفاضلي",
  "treatment": "خطة العلاج المقترحة",
  "icd_code": "رمز ICD-10 الأنسب"
}
كن دقيقاً طبياً. هذا للمساعدة فقط وليس بديلاً عن قرار الطبيب.`
      : `You are an expert medical AI assistant. Based on the physician's notes, return a structured JSON response only (no markdown) with:
{
  "summary": "Concise case summary",
  "diagnosis": "Most likely or differential diagnosis",
  "treatment": "Suggested treatment plan",
  "icd_code": "Most appropriate ICD-10 code"
}
Be medically accurate. This is for assistance only, not a replacement for physician judgment.`) + doctorCtx;

    const completion = await callAI({ type: 'medical-assistant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: patient_notes },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content?.trim() || '{}';
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    return res.json({
      summary:   parsed.summary   || '',
      diagnosis: parsed.diagnosis || '',
      treatment: parsed.treatment || '',
      icd_code:  parsed.icd_code  || '',
    });
  } catch (err) {
    console.error('[medical-assistant error]', err.message);
    res.status(500).json({ error: 'AI service error' });
  }
});

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK
// ── Finance Reports API (STEP 6) ──────────────────────────────

// GET /api/finance/daily?date=YYYY-MM-DD
app.get('/api/finance/daily', ...guard, requireModule('finance'), async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'database_unavailable' });
  const clinicId = req.auth.clinicId;
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const from = `${date}T00:00:00Z`;
  const to   = `${date}T23:59:59Z`;

  const [incomeRes, expenseRes, cashboxRes] = await Promise.all([
    supabaseAdmin.from('transactions').select('amount,category,payment_method')
      .eq('clinic_id', clinicId).eq('type', 'income').gte('created_at', from).lte('created_at', to),
    supabaseAdmin.from('transactions').select('amount,category')
      .eq('clinic_id', clinicId).eq('type', 'expense').gte('created_at', from).lte('created_at', to),
    supabaseAdmin.from('cashbox_sessions').select('*')
      .eq('clinic_id', clinicId).gte('opened_at', from).order('opened_at', { ascending: false }).limit(1),
  ]);

  const income  = (incomeRes.data  ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const expense = (expenseRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  res.json({
    date, income, expense, net: income - expense,
    incomeByMethod: groupBy(incomeRes.data ?? [], 'payment_method'),
    incomeByCategory: groupBy(incomeRes.data ?? [], 'category'),
    expenseByCategory: groupBy(expenseRes.data ?? [], 'category'),
    cashboxSession: cashboxRes.data?.[0] ?? null,
  });
});

// GET /api/finance/monthly?month=YYYY-MM
app.get('/api/finance/monthly', ...guard, requireModule('finance'), async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'database_unavailable' });
  const clinicId = req.auth.clinicId;
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const from  = `${month}-01T00:00:00Z`;
  const to    = `${month}-31T23:59:59Z`;

  const [incomeRes, expenseRes, earningsRes] = await Promise.all([
    supabaseAdmin.from('transactions').select('amount,category,created_at')
      .eq('clinic_id', clinicId).eq('type', 'income').gte('created_at', from).lte('created_at', to),
    supabaseAdmin.from('transactions').select('amount,category,created_at')
      .eq('clinic_id', clinicId).eq('type', 'expense').gte('created_at', from).lte('created_at', to),
    supabaseAdmin.from('doctor_earnings').select('earned_amount,doctor_id,status')
      .eq('clinic_id', clinicId).gte('created_at', from).lte('created_at', to),
  ]);

  const income  = (incomeRes.data  ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const expense = (expenseRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const doctorPayout = (earningsRes.data ?? []).reduce((s, r) => s + Number(r.earned_amount), 0);

  // Build daily breakdown for chart
  const dailyMap = {};
  [...(incomeRes.data ?? []), ...(expenseRes.data ?? [])].forEach(r => {
    const d = r.created_at.slice(0, 10);
    if (!dailyMap[d]) dailyMap[d] = { income: 0, expense: 0 };
    if (r.amount) dailyMap[d][incomeRes.data?.includes(r) ? 'income' : 'expense'] += Number(r.amount);
  });

  res.json({
    month, income, expense, net: income - expense, doctorPayout,
    profitMargin: income > 0 ? (((income - expense) / income) * 100).toFixed(1) : '0',
    expenseByCategory: groupBy(expenseRes.data ?? [], 'category'),
    daily: Object.entries(dailyMap).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
  });
});

// GET /api/finance/doctor-earnings?doctorId=...
app.get('/api/finance/doctor-earnings', ...guard, requireModule('finance'), async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'database_unavailable' });
  const { doctorId, status } = req.query;
  let query = supabaseAdmin.from('doctor_earnings').select('*')
    .eq('clinic_id', req.auth.clinicId).order('created_at', { ascending: false });
  if (doctorId) query = query.eq('doctor_id', doctorId);
  if (status)   query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// PATCH /api/finance/doctor-earnings/:id/pay — mark earning as paid
app.patch('/api/finance/doctor-earnings/:id/pay', ...guard, requireModule('finance'), requireRole('admin'), async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'database_unavailable' });
  const { data, error } = await supabaseAdmin
    .from('doctor_earnings').update({ status: 'paid' }).eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Cashbox endpoints
app.get('/api/finance/cashbox', ...guard, requireModule('finance'), async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'database_unavailable' });
  const { data, error } = await supabaseAdmin.from('cashbox_sessions').select('*')
    .eq('clinic_id', req.auth.clinicId).order('opened_at', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/finance/cashbox/open', ...guard, requireModule('finance'), requireRole('admin', 'reception'), async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'database_unavailable' });
  const { startAmount = 0 } = req.body;
  const existing = await supabaseAdmin.from('cashbox_sessions').select('id')
    .eq('clinic_id', req.auth.clinicId).eq('status', 'open').maybeSingle();
  if (existing.data) return res.status(409).json({ error: 'shift_already_open' });
  const { data, error } = await supabaseAdmin.from('cashbox_sessions')
    .insert({ clinic_id: req.auth.clinicId, user_id: req.auth.userId, start_amount: startAmount })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/finance/cashbox/close', ...guard, requireModule('finance'), requireRole('admin', 'reception'), async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'database_unavailable' });
  const { endAmount } = req.body;
  const session = await supabaseAdmin.from('cashbox_sessions').select('*')
    .eq('clinic_id', req.auth.clinicId).eq('status', 'open').maybeSingle();
  if (!session.data) return res.status(404).json({ error: 'no_open_session' });
  const s = session.data;
  const expected = Number(s.start_amount) + Number(s.total_income) - Number(s.total_expense);
  const { data, error } = await supabaseAdmin.from('cashbox_sessions')
    .update({ end_amount: endAmount, difference: endAmount - expected, closed_at: new Date().toISOString(), status: 'closed' })
    .eq('id', s.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

function groupBy(arr, key) {
  const map = {};
  arr.forEach(item => {
    const k = item[key] || 'other';
    map[k] = (map[k] || 0) + Number(item.amount || 0);
  });
  return map;
}

// ── Financial Forecast (AI) ───────────────────────────────────
app.post('/api/financial-forecast', ...guard, requireModule('finance'), async (req, res) => {
  try {
    const { currentMonthRevenue, lastMonthRevenue, avgDailyPatients, totalDebt, topExpenseCategory, language } = req.body;
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      const growth = lastMonthRevenue > 0 ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1) : 0;
      const projected = Math.round(currentMonthRevenue * 1.05);
      return res.json({
        forecastEn: `Based on current trends, projected revenue for next month is approximately ${projected.toLocaleString()} ج.م (estimated ${growth}% growth). Focus on reducing ${topExpenseCategory || 'operational'} costs to improve margins.`,
        forecastAr: `بناءً على الاتجاهات الحالية، الإيرادات المتوقعة للشهر القادم تقريباً ${projected.toLocaleString()} ج.م (نمو مقدر ${growth}٪). ركز على تقليل تكاليف ${topExpenseCategory || 'التشغيل'} لتحسين هوامش الربح.`,
        projectedRevenue: projected,
        growthRate: parseFloat(growth),
      });
    }
    const prompt = `You are a financial analyst for an Egyptian medical clinic.
Current month revenue: ${currentMonthRevenue} EGP
Last month revenue: ${lastMonthRevenue} EGP
Average daily patients: ${avgDailyPatients}
Outstanding debt: ${totalDebt} EGP
Top expense category: ${topExpenseCategory}

Provide a concise financial forecast for next month in JSON:
{
  "forecastEn": "2-3 sentence forecast in English",
  "forecastAr": "2-3 sentence forecast in Arabic",
  "projectedRevenue": <number>,
  "growthRate": <number, percentage>
}
Only return valid JSON. No extra text.`;
    const response = await callAI({ type: 'financial-forecast',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });
    const data = JSON.parse(response.choices[0]?.message?.content || '{}');
    res.json(data);
  } catch (error) {
    console.error('financial-forecast error:', error.message);
    res.status(500).json({ error: 'Forecast failed' });
  }
});

// ── Chatbot booking session store ──────────────────────────────
// Keyed by sessionId; each entry: { state, specialties, doctors, slots, chosenSpecialty,
// chosenDoctor, clinicId, lastAt }. Expires after 30 minutes of inactivity.
const _cbkSessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _cbkSessions) {
    if (now - v.lastAt > 30 * 60_000) _cbkSessions.delete(k);
  }
}, 10 * 60_000);

// Expire pending_confirmation reservations after exactly 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _cbkSessions) {
    if (v.state === 'pending_confirmation' && now - v.reservedAt > 2 * 60_000) {
      _cbkSessions.delete(k);
      console.log(`[chatbot] Reservation expired — session ${k}`);
    }
  }
}, 30_000);

const CBK_BOOKING_INTENTS = [
  'احجز', 'اكشف', 'عاوز', 'عايز', 'محتاج موعد', 'موعد', 'حجز',
  'عندي وجع', 'عندي ألم', 'مريض', 'فيه دكتور', 'book', 'appointment',
];
const CBK_CONFIRM = ['تمام', 'أيوه', 'ايوه', 'نعم', 'موافق', 'أكيد', 'اكيد', 'yes', 'confirm', 'ok', 'okay', 'sure'];
const CBK_CANCEL  = ['لا', 'بطل', 'إلغاء', 'الغاء', 'cancel', 'no', 'stop'];

function pickByNumber(arr, n) { const i = parseInt(n, 10) - 1; return (i >= 0 && i < arr.length) ? arr[i] : null; }
function cbkLang(msg) { return /[؀-ۿ]/.test(msg) ? 'ar' : 'en'; }

// ── Chatbot Reply ─────────────────────────────────────────────
app.post('/api/chatbot-reply', async (req, res) => {
  try {
    const { message, scenarios, settings: botSettings, sessionId, clinicId: reqClinicId } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    // STEP 3/6: normalize + arabizi conversion before any matching
    const msgLower = preprocess(message);
    const lang = cbkLang(message);
    const bUrl = botSettings?.bookingUrl || '';

    // ── Session-based booking state machine ───────────────────────────────
    if (sessionId) {
      const session = _cbkSessions.get(sessionId);

      // Cancel intent clears session at any point
      if (session && CBK_CANCEL.some(k => msgLower.includes(k))) {
        _cbkSessions.delete(sessionId);
        return res.json({
          reply: lang === 'ar' ? 'تم الإلغاء. هل تريد البدء من جديد؟' : 'Cancelled. Would you like to start over?',
          source: 'booking_engine', state: 'idle',
        });
      }

      // ── State: choosing_specialty ────────────────────────────────────────
      if (session?.state === 'choosing_specialty') {
        _cbkSessions.set(sessionId, { ...session, lastAt: Date.now() });
        const specs = session.specialties;
        let chosen = pickByNumber(specs, message.trim())
          || specs.find(s => (s.name_ar || '').includes(message.trim()) || (s.name || '').toLowerCase().includes(msgLower));
        if (!chosen) {
          return res.json({
            reply: lang === 'ar'
              ? `الرجاء إرسال رقم بين 1 و${specs.length} أو اكتب اسم التخصص.`
              : `Send a number between 1–${specs.length} or type a specialty name.`,
            source: 'booking_engine', state: 'choosing_specialty',
          });
        }
        if (!supabaseReady) {
          _cbkSessions.delete(sessionId);
          return res.json({
            reply: lang === 'ar'
              ? `ممتاز! اختار ${chosen.name_ar || chosen.name}. لإتمام الحجز: ${bUrl || 'تواصل مع الاستقبال.'}`
              : `Great! You chose ${chosen.name}. To book: ${bUrl || 'Contact reception.'}`,
            source: 'booking_engine', state: 'done',
          });
        }
        const { data: doctors } = await supabaseAdmin
          .from('users').select('id, name, name_ar')
          .eq('specialty_id', chosen.id).eq('role', 'doctor').eq('is_active', true).limit(6);
        if (!doctors?.length) {
          _cbkSessions.delete(sessionId);
          return res.json({
            reply: lang === 'ar'
              ? `عذراً، لا يوجد أطباء متاحون في ${chosen.name_ar || chosen.name} حالياً.`
              : `Sorry, no doctors available in ${chosen.name} currently.`,
            source: 'booking_engine', state: 'idle',
          });
        }
        _cbkSessions.set(sessionId, { state: 'choosing_doctor', specialty: chosen, doctors, clinicId: session.clinicId, lastAt: Date.now() });
        return res.json({
          reply: lang === 'ar'
            ? `الأطباء المتاحون في ${chosen.name_ar || chosen.name}:\n${numberedList(doctors, d => d.name_ar || d.name)}\n\nأرسل رقم الطبيب.`
            : `Doctors in ${chosen.name}:\n${numberedList(doctors, d => d.name)}\n\nSend the doctor number.`,
          source: 'booking_engine', state: 'choosing_doctor',
        });
      }

      // ── State: choosing_doctor ───────────────────────────────────────────
      if (session?.state === 'choosing_doctor') {
        _cbkSessions.set(sessionId, { ...session, lastAt: Date.now() });
        const docs = session.doctors;
        let chosenDoc = pickByNumber(docs, message.trim())
          || docs.find(d => (d.name_ar || '').includes(message.trim()) || (d.name || '').toLowerCase().includes(msgLower));
        if (!chosenDoc) {
          return res.json({
            reply: lang === 'ar'
              ? `الرجاء إرسال رقم بين 1 و${docs.length}.`
              : `Send a number between 1–${docs.length}.`,
            source: 'booking_engine', state: 'choosing_doctor',
          });
        }
        const docName = lang === 'ar' ? (chosenDoc.name_ar || chosenDoc.name) : chosenDoc.name;
        // Try to fetch upcoming booked appointment slots to show as options
        const from = new Date(); from.setDate(from.getDate() + 1);
        const to   = new Date(); to.setDate(to.getDate() + 8);
        const { data: booked } = supabaseReady ? await supabaseAdmin
          .from('appointments').select('date, time')
          .eq('doctor_id', chosenDoc.id)
          .gte('date', from.toISOString().split('T')[0])
          .lte('date', to.toISOString().split('T')[0])
          .in('status', ['scheduled', 'pending'])
          .order('date').limit(6) : { data: null };
        if (!booked?.length) {
          _cbkSessions.set(sessionId, { state: 'confirming', doctor: chosenDoc, specialty: session.specialty, slot: null, clinicId: session.clinicId, lastAt: Date.now() });
          return res.json({
            reply: lang === 'ar'
              ? `${docName} متاح للحجز. لإتمام الموعد:\n${bUrl || 'تواصل مع الاستقبال.'}\n\nاكتب "تمام" للتأكيد.`
              : `${docName} is available. Complete your booking:\n${bUrl || 'Contact reception.'}\n\nType "confirm" to proceed.`,
            source: 'booking_engine', state: 'confirming',
          });
        }
        _cbkSessions.set(sessionId, { state: 'choosing_time', doctor: chosenDoc, specialty: session.specialty, slots: booked, clinicId: session.clinicId, lastAt: Date.now() });
        return res.json({
          reply: lang === 'ar'
            ? `المواعيد المتاحة مع ${docName}:\n${numberedList(booked, s => `${s.date}  ${s.time}`)}\n\nأرسل رقم الموعد.`
            : `Available slots with ${docName}:\n${numberedList(booked, s => `${s.date}  ${s.time}`)}\n\nSend the slot number.`,
          source: 'booking_engine', state: 'choosing_time',
        });
      }

      // ── State: choosing_time ─────────────────────────────────────────────
      if (session?.state === 'choosing_time') {
        _cbkSessions.set(sessionId, { ...session, lastAt: Date.now() });
        const slots = session.slots;
        const chosenSlot = pickByNumber(slots, message.trim());
        if (!chosenSlot) {
          return res.json({
            reply: lang === 'ar'
              ? `الرجاء إرسال رقم بين 1 و${slots.length}.`
              : `Send a number between 1–${slots.length}.`,
            source: 'booking_engine', state: 'choosing_time',
          });
        }
        const docName  = lang === 'ar' ? (session.doctor.name_ar || session.doctor.name) : session.doctor.name;
        const specName = lang === 'ar' ? (session.specialty.name_ar || session.specialty.name) : session.specialty.name;
        const reservedAt = Date.now();
        _cbkSessions.set(sessionId, { state: 'pending_confirmation', doctor: session.doctor, specialty: session.specialty, slot: chosenSlot, clinicId: session.clinicId, reservedAt, lastAt: reservedAt });
        return res.json({
          reply: lang === 'ar'
            ? `ممتاز! تفاصيل حجزك:\n🩺 ${specName}\n👨‍⚕️ ${docName}\n📅 ${chosenSlot.date} — ${chosenSlot.time}\n\nاكتب "تمام" للتأكيد أو "بطل" للإلغاء — المهلة دقيقتان.`
            : `Perfect! Booking details:\n🩺 ${specName}\n👨‍⚕️ ${docName}\n📅 ${chosenSlot.date} — ${chosenSlot.time}\n\nType "confirm" to book or "cancel" to abort — expires in 2 minutes.`,
          source: 'booking_engine', state: 'pending_confirmation',
        });
      }

      // ── State: pending_confirmation ──────────────────────────────────────
      if (session?.state === 'pending_confirmation') {
        const now = Date.now();
        const secsLeft = Math.max(0, Math.ceil((2 * 60_000 - (now - session.reservedAt)) / 1000));
        if (secsLeft === 0) {
          _cbkSessions.delete(sessionId);
          return res.json({
            reply: lang === 'ar'
              ? 'انتهت مهلة تأكيد الحجز. ابدأ من جديد إذا أردت.'
              : 'Reservation expired. Start over if you\'d like to book.',
            source: 'booking_engine', state: 'expired',
          });
        }
        if (CBK_CANCEL.some(k => msgLower.includes(k))) {
          _cbkSessions.delete(sessionId);
          return res.json({
            reply: lang === 'ar' ? 'تم إلغاء الحجز. يمكنك البدء من جديد في أي وقت.' : 'Booking cancelled. Feel free to start again anytime.',
            source: 'booking_engine', state: 'cancelled',
          });
        }
        if (CBK_CONFIRM.some(k => msgLower.includes(k))) {
          const { doctor, specialty, slot, clinicId: cId } = session;
          let reservationId = null;
          if (supabaseReady && cId && doctor?.id) {
            try {
              const { data: appt, error: apptErr } = await supabaseAdmin
                .from('appointments')
                .insert({
                  clinic_id: cId,
                  doctor_id: doctor.id,
                  specialty_id: specialty?.id || null,
                  date: slot.date,
                  time: slot.time,
                  status: 'chatbot_pending',
                  source: 'chatbot',
                  created_at: new Date().toISOString(),
                })
                .select('id')
                .single();
              if (!apptErr && appt?.id) reservationId = appt.id;
            } catch (_) { /* non-critical — still give user the booking URL */ }
          }
          _cbkSessions.delete(sessionId);
          const refParam = reservationId ? `?ref=${reservationId}` : '';
          const finalUrl = bUrl ? `${bUrl}${refParam}` : null;
          return res.json({
            reply: lang === 'ar'
              ? `🎉 تم تأكيد طلب حجزك!\n${finalUrl ? `أتمّ التسجيل هنا:\n${finalUrl}` : 'تواصل مع الاستقبال لإتمام الحجز.'}\nشكراً لاختيارك عيادتنا.`
              : `🎉 Booking request confirmed!\n${finalUrl ? `Complete registration here:\n${finalUrl}` : 'Contact reception to finalise.'}\nThank you!`,
            source: 'booking_engine', state: 'done',
            reservationId,
            bookingUrl: finalUrl,
          });
        }
        // Any other message — show reminder with countdown
        _cbkSessions.set(sessionId, { ...session, lastAt: now });
        const docName  = lang === 'ar' ? (session.doctor.name_ar || session.doctor.name) : session.doctor.name;
        return res.json({
          reply: lang === 'ar'
            ? `تفضّل بكتابة "تمام" لتأكيد الموعد مع ${docName}، أو "بطل" للإلغاء.\n(متبقّي ${secsLeft} ثانية)`
            : `Type "confirm" to book with ${docName}, or "cancel".\n(${secsLeft} seconds remaining)`,
          source: 'booking_engine', state: 'pending_confirmation',
        });
      }

      // ── State: confirming (legacy — kept for in-flight sessions) ─────────
      if (session?.state === 'confirming') {
        if (CBK_CONFIRM.some(k => msgLower.includes(k))) {
          _cbkSessions.delete(sessionId);
          return res.json({
            reply: lang === 'ar'
              ? `🎉 تم تأكيد طلب حجزك! أتمّ التسجيل هنا:\n${bUrl || 'تواصل مع الاستقبال.'}\nشكراً لاختيارك عيادتنا.`
              : `🎉 Booking request confirmed! Complete registration here:\n${bUrl || 'Contact reception.'}\nThank you!`,
            source: 'booking_engine', state: 'done',
          });
        }
        _cbkSessions.set(sessionId, { ...session, lastAt: Date.now() });
        return res.json({
          reply: lang === 'ar'
            ? 'هل تريد تأكيد الحجز؟ اكتب "تمام"، أو "بطل" للإلغاء.'
            : 'Confirm booking? Type "confirm", or "cancel" to abort.',
          source: 'booking_engine', state: 'confirming',
        });
      }

      // ── No active session → detect booking intent to start flow ──────────
      // STEP 6: use extractIntent for smart specialty/date/time detection
      const cbkIsBooking = CBK_BOOKING_INTENTS.some(k => msgLower.includes(k));
      if (cbkIsBooking) {
        const cId = reqClinicId || botSettings?.clinicId;
        if (supabaseReady && cId) {
          const { data: specs } = await supabaseAdmin
            .from('specialties').select('id, name, name_ar')
            .eq('is_active', true).eq('clinic_id', cId).order('name').limit(10);
          if (specs?.length) {
            // Smart: run extractIntent to detect specialty already in message
            // STEP 4/6: AI-powered extraction (keyword fallback built-in)
            const cbkIntent = await extractIntentAI(msgLower, specs);
            if (cbkIntent.specialty) {
              // Specialty already known → jump straight to slot selection
              const { data: docs } = await supabaseAdmin
                .from('doctor_clinic_links').select('doctor_id, users!inner(id,name,name_ar)')
                .eq('clinic_id', cId).eq('specialty_id', cbkIntent.specialty.id).limit(3);
              const doctorList = (docs || []).map(d => d.users);
              if (doctorList.length === 1) {
                // Single doctor — skip doctor step, show hint + confirm
                _cbkSessions.set(sessionId, { state: 'choosing_doctor', specialty: cbkIntent.specialty, doctors: doctorList, clinicId: cId, lastAt: Date.now() });
                const hint = buildDateHint(cbkIntent.date, cbkIntent.time);
                return res.json({
                  reply: lang === 'ar'
                    ? `تمام! ${cbkIntent.specialty.name_ar}${hint}\nالطبيب: ${doctorList[0].name_ar || doctorList[0].name}\nأرسل "1" لتأكيد الطبيب.`
                    : `Great! ${cbkIntent.specialty.name}${hint}\nDoctor: ${doctorList[0].name}\nSend "1" to confirm.`,
                  source: 'booking_engine', state: 'choosing_doctor',
                });
              }
              if (doctorList.length > 1) {
                _cbkSessions.set(sessionId, { state: 'choosing_doctor', specialty: cbkIntent.specialty, doctors: doctorList, clinicId: cId, lastAt: Date.now() });
                return res.json({
                  reply: lang === 'ar'
                    ? `تخصص ${cbkIntent.specialty.name_ar} — اختار الطبيب:\n${numberedList(doctorList, d => d.name_ar || d.name)}`
                    : `${cbkIntent.specialty.name} — choose a doctor:\n${numberedList(doctorList, d => d.name)}`,
                  source: 'booking_engine', state: 'choosing_doctor',
                });
              }
            }
            // No specialty in message → show full list
            _cbkSessions.set(sessionId, { state: 'choosing_specialty', specialties: specs, clinicId: cId, lastAt: Date.now() });
            return res.json({
              reply: lang === 'ar'
                ? `أهلاً! هساعدك تحجز موعد. اختار التخصص:\n${numberedList(specs, s => s.name_ar || s.name)}\n\nأرسل رقم الاختيار.`
                : `Hello! I'll help you book. Choose a specialty:\n${numberedList(specs, s => s.name)}\n\nSend the number.`,
              source: 'booking_engine', state: 'choosing_specialty',
            });
          }
        }
        if (bUrl) {
          return res.json({
            reply: lang === 'ar'
              ? `يسعدنا مساعدتك في الحجز! اضغط هنا لاختيار موعد:\n${bUrl}`
              : `Happy to help you book! Choose a slot here:\n${bUrl}`,
            source: 'booking_engine', state: 'done',
          });
        }
      }
    }
    // ── ─────────────────────────────────────────────────────────────────────

    // Try local scenario match first
    const matched = (scenarios || []).find((s) =>
      s.isActive && msgLower.includes(s.trigger.toLowerCase())
    );
    if (matched) {
      const reply = (matched.reply || '')
        .replace('{bookingUrl}', botSettings?.bookingUrl || '')
        .replace('{phone}', botSettings?.clinicPhone || '')
        .replace('{address}', botSettings?.address || '');
      return res.json({ reply, source: 'scenario' });
    }

    // Emergency check — always runs before AI or fallback
    const CHATBOT_EMERGENCY_KW = [
      'ألم في الصدر', 'ألم بالصدر', 'ألم صدر', 'chest pain',
      'ألم في صدري', 'ألم بصدري', 'وجع في صدري', 'وجع صدري',
      'صدري بيوجعني', 'صدري بوجعني', 'صدري واجعني', 'صدري بيتعب',
      'صعوبة في التنفس', 'صعوبة تنفس', 'ضيقة في النفس', 'difficulty breathing',
      'مش قادر اتنفس', 'مش قادر أتنفس', 'نفسي بينقطع',
      'فقدان وعي', 'فقدان الوعي', 'unconscious',
      'نزيف شديد', 'severe bleeding',
      'جلطة', 'أزمة قلبية', 'heart attack',
    ];
    const isEmergency = CHATBOT_EMERGENCY_KW.some(kw => msgLower.includes(kw.toLowerCase()));
    if (isEmergency) {
      return res.json({
        reply: 'هذه قد تكون حالة طوارئ طبية. يرجى الاتصال بالإسعاف فوراً على 123 أو التوجه لأقرب طوارئ. لا تنتظر.',
        source: 'emergency_local',
      });
    }

    // Fallback to AI
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      return res.json({ reply: botSettings?.outOfHoursMessage || 'شكراً على تواصلك، سنرد عليك قريباً.', source: 'fallback' });
    }
    const hasArabic = /[؀-ۿ]/.test(message);
    const systemPrompt = `You are a friendly bilingual clinic assistant chatbot for an Egyptian medical clinic.
Clinic phone: ${botSettings?.clinicPhone || ''}
Booking URL: ${botSettings?.bookingUrl || ''}
Respond helpfully and concisely (2-3 sentences max).${hasArabic ? ' The user wrote in Arabic — you MUST reply in Arabic only.' : ' Match the language of the user\'s message.'}`;
    const response = await callAI({ type: 'chatbot-reply',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 120,
      temperature: 0.5,
    });
    const reply = response.choices[0]?.message?.content?.trim() || '';
    res.json({ reply, source: 'ai' });
  } catch (error) {
    console.error('chatbot-reply error:', error.message);
    res.status(500).json({ error: 'Chatbot failed' });
  }
});

// ── Chatbot Scenario Generator ────────────────────────────────
app.post('/api/chatbot-scenarios', async (req, res) => {
  try {
    const { clinicType, language: lang } = req.body;
    if (!process.env.OPENAI_API_KEY || !serverAiConfig.globallyEnabled) {
      return res.status(503).json({ error: 'OpenAI not configured' });
    }
    const prompt = `Generate 5 useful WhatsApp chatbot scenarios for a ${clinicType || 'general'} medical clinic in Egypt.
Return JSON array: [{ "trigger": "...", "reply": "..." }]
Mix Arabic and English triggers. Keep replies under 200 chars. Use {phone} and {bookingUrl} placeholders.
Only return valid JSON array.`;
    const response = await callAI({ type: 'chatbot-scenarios',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });
    const raw = response.choices[0]?.message?.content || '{"scenarios":[]}';
    const parsed = JSON.parse(raw);
    const scenarios = Array.isArray(parsed) ? parsed : (parsed.scenarios || []);
    res.json({ scenarios });
  } catch (error) {
    console.error('chatbot-scenarios error:', error.message);
    res.status(500).json({ error: 'Generation failed' });
  }
});

// ═══════════════════════════════════════════════════════════
// SMART QUEUE ENGINE API  (STEP 4)
// ═══════════════════════════════════════════════════════════

// GET /api/queue/:clinicId — ordered in_queue appointments
app.get('/api/queue/:clinicId', ...guard, async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const clinicId = req.params.clinicId;
  if (req.auth.clinicId !== clinicId && req.auth.role !== 'super_admin') {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { data: settings } = await supabaseAdmin
    .from('queue_settings')
    .select('strategy_type, custom_pattern, allow_emergency')
    .eq('clinic_id', clinicId)
    .maybeSingle();

  const strategy   = settings?.strategy_type || 'fifo';
  const allowEmerg = settings?.allow_emergency ?? true;
  const customPat  = settings?.custom_pattern || [];

  const { data: rows, error } = await supabaseAdmin
    .from('appointments')
    .select('id, patient_id, doctor_id, specialty_id, date, time, is_urgent, is_emergency, checked_in_at, visit_type, visit_type_id, notes')
    .eq('clinic_id', clinicId)
    .eq('status', 'in_queue')
    .not('checked_in_at', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  const appts = rows || [];
  // Dedup by id (STEP 8 safety)
  const seen = new Set();
  const unique = appts.filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });

  const byCheckin = (a, b) => (a.checked_in_at || '').localeCompare(b.checked_in_at || '');
  const emergencies = unique.filter(a => a.is_emergency).sort(byCheckin);
  const urgents     = unique.filter(a => !a.is_emergency && a.is_urgent).sort(byCheckin);
  const normals     = unique.filter(a => !a.is_emergency && !a.is_urgent).sort(byCheckin);

  const priorityBlock = allowEmerg ? [...emergencies, ...urgents] : [...urgents, ...emergencies];

  let sortedNormals;
  switch (strategy) {
    case 'consult_first': {
      sortedNormals = [
        ...normals.filter(a => a.visit_type === 'consultation').sort(byCheckin),
        ...normals.filter(a => a.visit_type !== 'consultation').sort(byCheckin),
      ];
      break;
    }
    case 'consult_mix': {
      const c = normals.filter(a => a.visit_type === 'consultation').sort(byCheckin);
      const o = normals.filter(a => a.visit_type !== 'consultation').sort(byCheckin);
      sortedNormals = [];
      for (let i = 0; i < Math.max(c.length, o.length); i++) {
        if (i < c.length) sortedNormals.push(c[i]);
        if (i < o.length) sortedNormals.push(o[i]);
      }
      break;
    }
    case 'custom': {
      if (!customPat.length) { sortedNormals = normals; break; }
      const buckets = {};
      customPat.forEach(cat => { buckets[cat] = []; });
      buckets['_other'] = [];
      normals.forEach(a => { (buckets[a.visit_type] || buckets['_other']).push(a); });
      Object.values(buckets).forEach(b => b.sort(byCheckin));
      const maxB = Math.max(...Object.values(buckets).map(b => b.length), 0);
      sortedNormals = [];
      for (let i = 0; i < maxB; i++) {
        customPat.forEach(cat => { if (i < (buckets[cat]||[]).length) sortedNormals.push(buckets[cat][i]); });
        if (i < buckets['_other'].length) sortedNormals.push(buckets['_other'][i]);
      }
      break;
    }
    default: sortedNormals = normals;
  }

  return res.json({ queue: [...priorityBlock, ...sortedNormals], strategy, total: unique.length });
});

// PATCH /api/queue/:id/status — update visit status (used by useVisits hook)
app.patch('/api/queue/:id/status', ...guard, requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  const updates = { status, updated_at: new Date().toISOString() };
  if (status === 'waiting') updates.arrival_time = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from('visits')
    .update(updates).eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
  // Notifications: in_consultation → turn_now + shift others; waiting → near_turn if ≤ 3; no_show → notify + shift
  setImmediate(async () => {
    try {
      if (!data?.patient_id || !data?.clinic_id) return;
      const phone = await getPatientPhone(data.patient_id);
      if (status === 'in_consultation') {
        if (phone) await notifyQueueEvent('turn_now', data.patient_id, phone, data.clinic_id);
        await notifyNearTurnPositions(data.doctor_id, data.clinic_id);
      } else if (status === 'waiting') {
        const queue = await getWaitingQueueForDoctor(data.doctor_id, data.clinic_id);
        const pos = queue.findIndex(v => v.id === req.params.id) + 1;
        if (pos > 0 && pos <= 3 && phone) {
          await notifyQueueEvent('near_turn', data.patient_id, phone, data.clinic_id, { remaining: pos - 1 });
        }
      } else if (status === 'no_show') {
        if (phone) await notifyQueueEvent('no_show', data.patient_id, phone, data.clinic_id);
        await notifyNearTurnPositions(data.doctor_id, data.clinic_id);
      }
    } catch (e) { console.error('[QueueNotif] queue status:', e.message); }
  });
});

// PATCH /api/queue/:id/confirm-checkin — staff override: bypass payment gate
app.patch('/api/queue/:id/confirm-checkin', ...guard, requireRole('admin', 'reception'), async (req, res) => {
  const { data, error } = await supabaseAdmin.from('visits')
    .update({ status: 'waiting', arrival_time: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
  // Notification: near_turn if position ≤ 3 after check-in
  setImmediate(async () => {
    try {
      if (!data?.patient_id || !data?.doctor_id || !data?.clinic_id) return;
      const queue = await getWaitingQueueForDoctor(data.doctor_id, data.clinic_id);
      const pos = queue.findIndex(v => v.id === req.params.id) + 1;
      if (pos > 0 && pos <= 3) {
        const phone = await getPatientPhone(data.patient_id);
        if (phone) await notifyQueueEvent('near_turn', data.patient_id, phone, data.clinic_id, { remaining: pos - 1 });
      }
    } catch (e) { console.error('[QueueNotif] confirm-checkin:', e.message); }
  });
});

// POST /api/queue/:id/add — add visit to waiting queue
app.post('/api/queue/:id/add', ...guard, requireRole('admin', 'reception'), async (req, res) => {
  const { data: visit } = await supabaseAdmin.from('visits').select('status').eq('id', req.params.id).single();
  if (!visit) return res.status(404).json({ error: 'visit not found' });
  if (['waiting', 'in_consultation', 'completed'].includes(visit.status)) {
    return res.json({ ok: false, reason: 'already_in_queue' });
  }
  const { data, error } = await supabaseAdmin.from('visits')
    .update({ status: 'waiting', arrival_time: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
  // Notification: near_turn if position ≤ 3 after joining queue
  setImmediate(async () => {
    try {
      if (!data?.patient_id || !data?.doctor_id || !data?.clinic_id) return;
      const queue = await getWaitingQueueForDoctor(data.doctor_id, data.clinic_id);
      const pos = queue.findIndex(v => v.id === req.params.id) + 1;
      if (pos > 0 && pos <= 3) {
        const phone = await getPatientPhone(data.patient_id);
        if (phone) await notifyQueueEvent('near_turn', data.patient_id, phone, data.clinic_id, { remaining: pos - 1 });
      }
    } catch (e) { console.error('[QueueNotif] queue-add:', e.message); }
  });
});

// PATCH /api/queue/:id/priority — set visit priority
app.patch('/api/queue/:id/priority', ...guard, requireRole('admin', 'reception', 'doctor'), async (req, res) => {
  const { priority } = req.body;
  if (!['normal', 'urgent', 'emergency'].includes(priority)) return res.status(400).json({ error: 'invalid priority' });
  const { data, error } = await supabaseAdmin.from('visits')
    .update({ priority, is_urgent: priority !== 'normal', updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/queue-settings/:clinicId
app.get('/api/queue-settings/:clinicId', ...guard, requireRole('admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { data, error } = await supabaseAdmin
    .from('queue_settings').select('*')
    .eq('clinic_id', req.params.clinicId).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || null);
});

// POST /api/queue-settings/:clinicId — upsert
app.post('/api/queue-settings/:clinicId', ...guard, requireRole('admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const clinicId = req.params.clinicId;
  if (req.auth.clinicId !== clinicId && req.auth.role !== 'super_admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  const { strategy_type, custom_pattern, allow_emergency } = req.body;
  if (!['fifo','urgent_first','consult_mix','consult_first','custom'].includes(strategy_type)) {
    return res.status(400).json({ error: 'invalid_strategy' });
  }
  const { data, error } = await supabaseAdmin
    .from('queue_settings')
    .upsert({ clinic_id: clinicId, strategy_type, custom_pattern: custom_pattern || [], allow_emergency: allow_emergency ?? true, updated_at: new Date().toISOString() }, { onConflict: 'clinic_id' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// PATIENT PORTAL API  (STEP 7 + 8)
// ═══════════════════════════════════════════════════════════

// STEP 8 — phone-based patient auth guard
async function authenticatePatient(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ error: 'database_unavailable' });
  const phone = req.headers['x-patient-phone'];
  if (!phone) return res.status(401).json({ error: 'x-patient-phone header required' });
  const { data, error } = await supabaseAdmin
    .from('patients')
    .select('id, name, phone, email, date_of_birth, gender, clinic_id')
    .eq('phone', phone.trim())
    .maybeSingle();
  if (error || !data) return res.status(401).json({ error: 'patient_not_found' });
  req.patient = data;
  next();
}

// GET /api/patient/data — profile + summary stats
app.get('/api/patient/data', authenticatePatient, async (req, res) => {
  const pid = req.patient.id;
  const [aptsRes, visitsRes, prescRes] = await Promise.all([
    supabaseAdmin.from('appointments').select('id,status,date').eq('patient_id', pid),
    supabaseAdmin.from('visits').select('id,status').eq('patient_id', pid),
    supabaseAdmin.from('prescriptions').select('id,status').eq('patient_id', pid),
  ]);
  res.json({
    patient: req.patient,
    stats: {
      totalAppointments: aptsRes.data?.length ?? 0,
      totalVisits: visitsRes.data?.length ?? 0,
      activePrescriptions: prescRes.data?.filter(p => p.status === 'active').length ?? 0,
    },
  });
});

// GET /api/patient/prescriptions
app.get('/api/patient/prescriptions', authenticatePatient, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('prescriptions')
    .select('*, prescription_items(*)')
    .eq('patient_id', req.patient.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// GET /api/patient/appointments
app.get('/api/patient/appointments', authenticatePatient, async (req, res) => {
  const { status } = req.query;
  let query = supabaseAdmin
    .from('appointments')
    .select('*, doctors(name, name_ar), specialties(name, name_ar)')
    .eq('patient_id', req.patient.id)
    .order('date', { ascending: false })
    .order('time', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// ═══════════════════════════════════════════════════════════
// WHATSAPP SETTINGS API
// ═══════════════════════════════════════════════════════════

// GET /api/settings/whatsapp — fetch current settings for the authed clinic
app.get('/api/settings/whatsapp', ...guard, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_settings')
    .select('id, clinic_id, verify_token, api_token, phone_number_id, is_active, updated_at')
    .eq('clinic_id', req.auth.clinicId)
    .single();
  if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
    return res.status(500).json({ error: error.message });
  }
  res.json(data || null);
});

// POST /api/settings/whatsapp — create or update settings (upsert)
app.post('/api/settings/whatsapp', ...guard, requireRole('admin'), async (req, res) => {
  const { verifyToken, apiToken, phoneNumberId, isActive } = req.body;
  if (verifyToken === undefined && apiToken === undefined && phoneNumberId === undefined) {
    return res.status(400).json({ error: 'At least one field required' });
  }

  const payload = {
    clinic_id:       req.auth.clinicId,
    updated_at:      new Date().toISOString(),
    ...(verifyToken    !== undefined && { verify_token:    verifyToken }),
    ...(apiToken       !== undefined && { api_token:       apiToken }),
    ...(phoneNumberId  !== undefined && { phone_number_id: phoneNumberId }),
    ...(isActive       !== undefined && { is_active:       isActive }),
  };

  const { data, error } = await supabaseAdmin
    .from('whatsapp_settings')
    .upsert(payload, { onConflict: 'clinic_id' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// WHATSAPP BOOKING BOT
// ═══════════════════════════════════════════════════════════

// ── Configuration ────────────────────────────────────────────
// Env vars serve as fallback when the DB table is not yet populated.
const WA_VERIFY_TOKEN_ENV = process.env.WHATSAPP_VERIFY_TOKEN || 'clinicflow_verify';
const WA_TOKEN_ENV        = process.env.WHATSAPP_TOKEN;
const WA_PHONE_ID_ENV     = process.env.WHATSAPP_PHONE_ID;
const WA_CLINIC_ID        = process.env.WHATSAPP_CLINIC_ID;

// ── Load live settings from DB (STEP 4) ──────────────────────
// Returns null with a warning when not configured (STEP 5 fallback).
async function loadWASettings(clinicId) {
  if (!supabaseReady || !clinicId) {
    console.warn('[WhatsApp] Supabase not ready or no clinic_id — using env fallback');
    return null;
  }
  const { data, error } = await supabaseAdmin
    .from('whatsapp_settings')
    .select('verify_token, api_token, phone_number_id, is_active')
    .eq('clinic_id', clinicId)
    .single();
  if (error && error.code !== 'PGRST116') {
    console.warn('[WhatsApp] DB settings error:', error.message);
  }
  return data || null;
}

// ═══════════════════════════════════════════════════════════
// AI EVENTS — booking intent tracking + lost-revenue recovery
// ═══════════════════════════════════════════════════════════
// In-memory map: eventId → event object (Supabase is best-effort)
const _aiEvents = new Map();

function _aiEventId() { return `ev-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }

async function recordAIEvent({ clinicId, phone, patientId, eventType, meta = {} }) {
  const id = _aiEventId();
  const entry = { id, clinic_id: clinicId || null, phone, patient_id: patientId || null,
    event_type: eventType, status: 'pending', meta, created_at: new Date().toISOString() };
  _aiEvents.set(id, entry);
  if (supabaseReady && supabaseAdmin) {
    supabaseAdmin.from('ai_events').insert({
      ...entry, meta: JSON.stringify(meta),
    }).then(({ error }) => { if (error) console.warn('[AI-EVT] insert failed:', error.message); });
  }
  return id;
}

async function resolveAIEvent(eventId, status) {
  const ev = _aiEvents.get(eventId);
  if (ev) { ev.status = status; ev.updated_at = new Date().toISOString(); }
  if (supabaseReady && supabaseAdmin) {
    supabaseAdmin.from('ai_events').update({ status, updated_at: new Date().toISOString() })
      .eq('id', eventId).then(({ error }) => { if (error) console.warn('[AI-EVT] update failed:', error.message); });
  }
}

// phone → pending booking intent eventId (one active intent per phone)
const _pendingIntents = new Map();

// ── Voice Reminder Call Logs ───────────────────────────────────
// callSid → { apptId, phone, patientName, doctorName, apptTime, clinicId, status, attempt, createdAt, digit, respondedAt }
const _voiceCallLog  = new Map();
const _recentlyCalled = new Set(); // apptId set — prevents duplicate calls within 2h
setInterval(() => _recentlyCalled.clear(), 2 * 60 * 60 * 1000);

// ── Growth Engine ─────────────────────────────────────────────
const _growthLog      = []; // [{ id, clinicId, patientId, patientName, phone, segment, message, status, sentAt }]
const _growthCooldown = new Map(); // phone → lastSentAt ms
const GROWTH_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days per patient

const GROWTH_TEMPLATES = {
  inactive:    (name)        => `مرحباً ${name}! افتقدناك 🏥 فيه مواعيد متاحة الأسبوع ده. ابعتلنا "حجز" للحجز الآن.`,
  no_show:     (name)        => `${name}، فاتك موعدك. حابب تعيد الحجز؟ ابعت "حجز" وهنرتب ليك.`,
  recent:      (name)        => `شكراً لزيارتك ${name}! 🌟 مش نسيت موعد المتابعة؟ ابعت "حجز".`,
  high_value:  (name)        => `${name}، انت من أحسن مرضانا! 🙏 فيه أولوية حجز خاصة ليك الأسبوع ده. ابعت "حجز".`,
  empty_slots: (name, doc)   => `🏥 ${name}، فيه مواعيد فاضية دلوقتى مع ${doc}. ابعت "حجز" قبل ما يخلصوا!`,
};

const TWILIO_SID  = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;
const twilioReady = !!(TWILIO_SID && TWILIO_AUTH && TWILIO_FROM);
if (twilioReady) console.log('[Twilio] Voice reminders ready');
else console.log('[Twilio] Not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER');

// ── In-memory session store (state machine per phone number) ─
// State: idle → choosing_specialty → choosing_time → confirmed
// Sessions expire after 30 minutes of inactivity.
const waSessions = new Map(); // phone → session

const SESSION_TTL_MS = 30 * 60 * 1000;

function getSession(phone) {
  const s = waSessions.get(phone);
  if (s && Date.now() > s.expiresAt) { waSessions.delete(phone); return null; }
  return s || null;
}

function setSession(phone, data) {
  waSessions.set(phone, { ...data, expiresAt: Date.now() + SESSION_TTL_MS });
}

function clearSession(phone) { waSessions.delete(phone); }

// ── Send WhatsApp message (STEP 4 & 5) ───────────────────────
// Loads credentials from DB first; falls back to env vars.
// Logs a warning and skips sending if neither is configured (safe fallback).
async function sendWhatsAppMessage(phone, text, clinicId) {
  console.log(`[WhatsApp → ${phone}] ${text}`);

  // Prefer DB settings; fall back to env
  let token    = WA_TOKEN_ENV;
  let phoneId  = WA_PHONE_ID_ENV;
  let isActive = true;

  const dbSettings = await loadWASettings(clinicId || WA_CLINIC_ID);
  if (dbSettings) {
    // DB record exists — use it (STEP 4)
    if (!dbSettings.is_active) {
      console.log('[WhatsApp] Bot is disabled for this clinic — message suppressed');
      return; // STEP 5: is_active = false → do nothing
    }
    token   = dbSettings.api_token   || token;
    phoneId = dbSettings.phone_number_id || phoneId;
  } else if (!token || !phoneId) {
    // STEP 5: no DB settings and no env vars → warn and skip
    console.warn('[WhatsApp] No credentials configured — message not sent');
    return;
  }

  if (!token || !phoneId) {
    console.warn('[WhatsApp] Missing token or phone_number_id — message not sent');
    return;
  }

  try {
    await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to:   phone,
        type: 'text',
        text: { body: text },
      }),
    });
    // STEP 4: track WhatsApp usage
    _incrementUsage(clinicId || WA_CLINIC_ID, 'whatsapp_messages');
  } catch (err) {
    console.error('[WhatsApp send error]', err.message);
  }
}

// ── Queue notification: anti-spam cooldown ────────────────────────────────────
const _qNotifCooldown = new Map(); // `${patientId}:${event}` → timestamp (ms)
const _Q_COOLDOWN_MS  = 5 * 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of _qNotifCooldown) { if (now - ts > _Q_COOLDOWN_MS) _qNotifCooldown.delete(k); }
}, 10 * 60_000);

// ── Build Arabic queue notification message ───────────────────────────────────
function buildQueueMessage(event, data = {}) {
  const { position, remaining, doctorName, date, time } = data;
  switch (event) {
    case 'booking_created': {
      const rem = remaining ?? 0;
      const posLabel = position ? `ترتيبك في القائمة رقم ${position}.` : '';
      return `مرحباً! تم تأكيد حجزك${doctorName ? ` مع الدكتور ${doctorName}` : ''} بتاريخ ${date || ''} الساعة ${time || ''}.\n${posLabel}`;
    }
    case 'near_turn': {
      const rem = remaining ?? 0;
      if (rem === 0) return 'أنت التالي مباشرة! يرجى الاستعداد والتوجه للعيادة.';
      const remLabel = rem === 1 ? 'مريض واحد' : rem === 2 ? 'مريضين' : `${rem} مرضى`;
      return `دورك قرب! فاضل ${remLabel} قبلك.`;
    }
    case 'turn_now':
      return 'دورك الآن! يرجى التوجه لغرفة الطبيب فوراً.';
    case 'no_show':
      return 'لم يتم تسجيل حضورك في الوقت المحدد. إذا وصلت للعيادة تواصل مع الاستقبال لإعادة ترتيبك.';
    default:
      return '';
  }
}

// ── Send queue notification with cooldown guard ───────────────────────────────
// Logs only when WhatsApp is not configured (safe fallback — never crashes).
async function notifyQueueEvent(event, patientId, phone, clinicId, data = {}) {
  if (!phone) return;
  const ck = `${patientId}:${event}`;
  const last = _qNotifCooldown.get(ck);
  if (last && Date.now() - last < _Q_COOLDOWN_MS) {
    console.log(`[QueueNotif] cooldown active — skipping ${ck}`);
    return;
  }
  const msg = buildQueueMessage(event, data);
  if (!msg) return;
  _qNotifCooldown.set(ck, Date.now());
  console.log(`[QueueNotif] ${event} → patient ${patientId}`);
  await sendWhatsAppMessage(phone, msg, clinicId);
}

// ── Fetch a patient's phone number ────────────────────────────────────────────
async function getPatientPhone(patientId) {
  if (!supabaseReady || !patientId) return null;
  try {
    const { data } = await supabaseAdmin.from('patients').select('phone').eq('id', patientId).single();
    return data?.phone || null;
  } catch { return null; }
}

// ── Fetch today's sorted waiting queue for a doctor ───────────────────────────
async function getWaitingQueueForDoctor(doctorId, clinicId) {
  if (!supabaseReady || !doctorId || !clinicId) return [];
  const today = new Date().toISOString().split('T')[0];
  try {
    const { data } = await supabaseAdmin
      .from('visits')
      .select('id, patient_id, arrival_time, priority, is_urgent')
      .eq('doctor_id', doctorId)
      .eq('clinic_id', clinicId)
      .eq('date', today)
      .eq('status', 'waiting')
      .order('arrival_time', { ascending: true });
    if (!data) return [];
    const w = (v) => v.priority === 'emergency' ? 3 : (v.priority === 'urgent' || v.is_urgent ? 2 : 1);
    return data.sort((a, b) => w(b) - w(a) || (a.arrival_time || '').localeCompare(b.arrival_time || ''));
  } catch { return []; }
}

// ── Notify patients now at positions 1, 2, 3 after any queue shift ────────────
async function notifyNearTurnPositions(doctorId, clinicId) {
  const queue = await getWaitingQueueForDoctor(doctorId, clinicId);
  for (let i = 0; i < Math.min(3, queue.length); i++) {
    const v = queue[i];
    const phone = await getPatientPhone(v.patient_id);
    if (!phone) continue;
    await notifyQueueEvent('near_turn', v.patient_id, phone, clinicId, { remaining: i });
  }
}

// ── Rule-based intent detection ───────────────────────────────
// ── STEP 1: Text normalization ─────────────────────────────────────────────────
function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[!؟?،;.,"'\-_*#@$%^&()[\]{}|\\/<>~`+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── STEP 2: Arabizi → Arabic letter mapping ────────────────────────────────────
// Skips purely numeric strings (menu selections like "1", "2") to avoid
// breaking the numbered-list state machine.
const _ARABIZI_MAP = [
  [/3/g, 'ع'], [/7/g, 'ح'], [/5/g, 'خ'], [/8/g, 'ق'], [/2/g, 'ء'],
  [/4/g, 'ش'], [/6/g, 'ط'], [/9/g, 'ص'],
];
function arabiziToArabic(text) {
  if (/^\s*\d+\s*$/.test(text)) return text; // pure digit = menu selection, keep as-is
  let out = text;
  for (const [re, ar] of _ARABIZI_MAP) out = out.replace(re, ar);
  return out;
}

// Pre-process any inbound message: arabizi conversion then normalise
function preprocess(text) {
  return normalize(arabiziToArabic(text || ''));
}

function isBookingIntent(text) {
  const t = text.trim().toLowerCase();
  return t.includes('حجز') || t.includes('book') || t.includes('موعد') || t === '1';
}

function isCancelIntent(text) {
  const t = text.trim().toLowerCase();
  return t.includes('إلغ') || t.includes('الغ') || t.includes('cancel') || t === '0';
}

// ── STEP 5: keyword-based intent extractor (fast, free, no AI) ───────────────
function extractIntent(text, specialties = []) {
  if (isCancelIntent(text)) return { intent: 'cancel', specialty: null, date: null, time: null };
  const specialty = detectSpecialty(text, specialties);
  const date      = detectDatePreference(text);
  const time      = detectTimePreference(text);
  const isBook = isBookingIntent(text) || !!specialty ||
    /دكتور|طبيب|كشف|عايز.*موعد|عاوز.*موعد|ابغى|ابي.*موعد|appointment/i.test(text);
  return { intent: isBook ? 'booking' : 'inquiry', specialty, date, time };
}

// Time label → slot object map for AI response parsing
const _AI_TIME_MAP = {
  morning:   { label: 'الصبح',  start: '07:00', end: '12:00' },
  afternoon: { label: 'العصر',  start: '14:00', end: '17:00' },
  evening:   { label: 'المسا',  start: '17:00', end: '21:00' },
  noon:      { label: 'الضهر',  start: '12:00', end: '14:00' },
};

// ── STEP 4: AI-powered intent extractor with keyword fallback (STEP 5) ────────
// Returns the same shape as extractIntent().
// AI is called ONLY when keyword extraction returns 'inquiry' (ambiguous).
async function extractIntentAI(text, specialties = []) {
  // STEP 5: run keyword extraction first — fast + free
  const local = extractIntent(text, specialties);

  // If local is confident OR AI unavailable → return local result
  if (local.intent !== 'inquiry' || !callAI || !serverAiConfig.globallyEnabled) return local;

  // STEP 4: AI call for ambiguous Egyptian dialect / Arabizi input
  try {
    const specList = specialties.slice(0, 15).map(s => s.name_ar || s.name).join('، ');
    const response = await callAI({
      type: 'extract-intent',
      messages: [{
        role: 'user',
        content:
          `أنت نظام تحليل نية في تطبيق عيادات طبية مصرية.\n` +
          `حلل النص التالي وأرجع JSON فقط بدون أي شرح:\n` +
          `النص: "${text}"\n` +
          `التخصصات المتاحة: ${specList || 'عام، قلب، أسنان، عظام، جلدية'}\n\n` +
          `{"intent":"booking|cancel|inquiry","specialty":"اسم التخصص بالعربي أو null","date":"today|tomorrow|day_after|null","time":"morning|afternoon|evening|noon|null"}`,
      }],
      max_tokens: 120,
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');

    // Resolve AI specialty string → specialty object
    const spStr = (parsed.specialty || '').toLowerCase().trim();
    const resolvedSpec = spStr
      ? specialties.find(s =>
          (s.name_ar || '').includes(spStr) ||
          (s.name || '').toLowerCase().includes(spStr) ||
          spStr.includes((s.name_ar || '').slice(0, 3))
        )
      : null;

    const validIntents = ['booking', 'cancel', 'inquiry'];
    return {
      intent:    validIntents.includes(parsed.intent) ? parsed.intent : local.intent,
      specialty: resolvedSpec || local.specialty,
      date:      ['today', 'tomorrow', 'day_after'].includes(parsed.date) ? parsed.date : local.date,
      time:      _AI_TIME_MAP[parsed.time] || local.time,
    };
  } catch {
    return local; // STEP 5: fall back to keyword result on any error
  }
}

// ── Format numbered list for WhatsApp ─────────────────────────
function numberedList(items, labelFn) {
  return items.map((item, i) => `${i + 1}. ${labelFn(item)}`).join('\n');
}

// ── Smart entity extraction (keyword + regex — no AI) ─────────
// Maps common Arabic specialty keywords to canonical name fragments.
const _SPEC_KEYWORDS = [
  { keys: ['قلب', 'cardio'],              frag: 'قلب'     },
  { keys: ['سنان', 'أسنان', 'دنت', 'dent'], frag: 'أسنان'  },
  { keys: ['عظ', 'كسر', 'orthop'],        frag: 'عظام'    },
  { keys: ['نساء', 'ولادة', 'gynec'],      frag: 'نساء'    },
  { keys: ['أطفال', 'طفل', 'pediatr'],     frag: 'أطفال'   },
  { keys: ['عيون', 'نظر', 'ophthal'],      frag: 'عيون'    },
  { keys: ['جلد', 'dermat'],               frag: 'جلد'     },
  { keys: ['عصب', 'neuro'],                frag: 'عصب'     },
  { keys: ['عام', 'general'],              frag: 'عام'     },
];

function detectSpecialty(text, specialties) {
  const t = text.toLowerCase();
  // 1. Direct name match (fastest)
  for (const sp of specialties) {
    const ar = (sp.name_ar || '').toLowerCase();
    const en = (sp.name || '').toLowerCase();
    if (t.includes(ar) || t.includes(en)) return sp;
  }
  // 2. Keyword alias → fragment → specialty name match
  for (const { keys, frag } of _SPEC_KEYWORDS) {
    if (keys.some(k => t.includes(k))) {
      const found = specialties.find(sp =>
        (sp.name_ar || '').includes(frag) || (sp.name || '').toLowerCase().includes(frag)
      );
      if (found) return found;
    }
  }
  return null;
}

function detectDatePreference(text) {
  const t = text;
  if (/النهارده|اليوم|today/i.test(t))         return 'today';
  if (/بعد بكره|بعد غد/i.test(t))              return 'day_after';
  if (/بكره|غداً|غدا|غد[^ا]|tomorrow/i.test(t)) return 'tomorrow';
  return null;
}

function detectTimePreference(text) {
  const t = text;
  if (/صبح|صباح|بدري|morning/i.test(t))          return { label: 'الصبح',  start: '07:00', end: '12:00' };
  if (/ضهر|ظهر|noon|midday/i.test(t))            return { label: 'الضهر',  start: '12:00', end: '14:00' };
  if (/عصر|بعد الضهر|afternoon/i.test(t))        return { label: 'العصر',  start: '14:00', end: '17:00' };
  if (/مسا|مساء|ليل|evening|night/i.test(t))     return { label: 'المسا',  start: '17:00', end: '21:00' };
  return null;
}

// Filter slots; if nothing remains after filter → return all (safe fallback)
function filterSlotsByDate(slots, datePref) {
  if (!datePref) return slots;
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 172800000).toISOString().slice(0, 10);
  const target   = datePref === 'today' ? today : datePref === 'tomorrow' ? tomorrow : dayAfter;
  const filtered = slots.filter(s => s.date === target);
  return filtered.length ? filtered : slots;
}

function filterSlotsByTime(slots, timePref) {
  if (!timePref) return slots;
  const filtered = slots.filter(s => s.time >= timePref.start && s.time < timePref.end);
  return filtered.length ? filtered : slots;
}

function buildDateHint(datePref, timePref) {
  const parts = [];
  if (datePref === 'today')    parts.push('اليوم');
  if (datePref === 'tomorrow') parts.push('غداً');
  if (datePref === 'day_after') parts.push('بعد غد');
  if (timePref)                 parts.push(timePref.label);
  return parts.length ? ` (${parts.join(' — ')})` : '';
}

// ── Fetch specialties for a clinic via Supabase ───────────────
async function fetchClinicSpecialties(clinicId) {
  if (!supabaseReady) return [];
  const { data } = await supabaseAdmin
    .from('clinic_specialties')
    .select('specialty:specialties(id, name, name_ar)')
    .eq('clinic_id', clinicId)
    .eq('is_active', true);
  return (data || []).map(r => r.specialty).filter(Boolean);
}

// ── Fetch first available doctor for a specialty ─────────────
async function fetchDoctorForSpecialty(clinicId, specialtyId) {
  if (!supabaseReady) return null;
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, name, name_ar')
    .eq('clinic_id', clinicId)
    .eq('specialty_id', specialtyId)
    .eq('role', 'doctor')
    .eq('is_active', true)
    .limit(1)
    .single();
  return data || null;
}

// ── Fetch next available slots for a doctor (next 3 days) ─────
async function fetchAvailableSlots(doctorId) {
  if (!supabaseReady) return [];
  const slots = [];
  for (let d = 0; d < 3; d++) {
    const date = new Date(Date.now() + d * 86400000).toISOString().split('T')[0];
    const dayOfWeek = new Date(date).getDay();
    const [schedResult, blockedResult, bookedResult] = await Promise.all([
      supabaseAdmin
        .from('doctor_schedules').select('start_time, end_time')
        .eq('doctor_id', doctorId).eq('day_of_week', dayOfWeek).eq('is_active', true).single(),
      supabaseAdmin
        .from('blocked_dates').select('id')
        .eq('doctor_id', doctorId).eq('date', date).single(),
      supabaseAdmin
        .from('appointments').select('time')
        .eq('doctor_id', doctorId).eq('date', date).in('status', ['scheduled', 'confirmed']),
    ]);
    if (!schedResult.data || blockedResult.data) continue;
    const { start_time, end_time } = schedResult.data;
    const booked = new Set((bookedResult.data || []).map(a => a.time));
    // STEP 6: use doctor's avg visit time as slot stride (min 10, max 60)
    const profile = _doctorProfiles.get(doctorId);
    const slotStride = profile ? Math.min(60, Math.max(10, profile.avgVisitTime)) : 20;
    let cur = parseInt(start_time) * 60 + parseInt(start_time.split(':')[1]);
    const end = parseInt(end_time) * 60 + parseInt(end_time.split(':')[1]);
    while (cur < end && slots.length < 8) {
      const h = String(Math.floor(cur / 60)).padStart(2, '0');
      const m = String(cur % 60).padStart(2, '0');
      const time = `${h}:${m}`;
      if (!booked.has(time)) slots.push({ date, time, label: `${date} ${time}` });
      cur += slotStride;
    }
    if (slots.length >= 8) break;
  }
  return slots;
}

// ── Find or create patient by phone ───────────────────────────
async function resolvePatient(phone) {
  if (!supabaseReady) return null;
  const { data: existing } = await supabaseAdmin
    .from('patients').select('id').eq('phone', phone).single();
  if (existing) return existing.id;
  const { data: created } = await supabaseAdmin
    .from('patients')
    .insert({ name: phone, phone, created_at: new Date().toISOString() })
    .select('id').single();
  return created?.id || null;
}

// ── Create appointment ────────────────────────────────────────
async function createWhatsappAppointment({ clinicId, patientId, doctorId, specialtyId, date, time }) {
  if (!supabaseReady) return null;
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .insert({
      clinic_id:    clinicId,
      patient_id:   patientId,
      doctor_id:    doctorId,
      specialty_id: specialtyId,
      date,
      time,
      status:  'scheduled',
      source:  'whatsapp',
      created_at: new Date().toISOString(),
    })
    .select('id').single();
  if (error) { console.error('[WhatsApp appt error]', error.message); return null; }
  return data;
}

// ── Core message handler (state machine) ─────────────────────
async function handleWhatsappMessage(phone, text) {
  const clinicId = WA_CLINIC_ID;
  if (!clinicId) {
    return sendWhatsAppMessage(phone, 'عذراً، الخدمة غير متاحة حالياً.', clinicId);
  }

  // STEP 8: log every incoming message
  console.log(`[WhatsApp ← ${phone}] ${text}`);
  // STEP 3: normalize + arabizi conversion before any matching
  text = preprocess(text);

  const session = getSession(phone);

  // Cancel at any time
  if (isCancelIntent(text)) {
    clearSession(phone);
    return sendWhatsAppMessage(phone, 'تم الإلغاء. أرسل "حجز" للبدء من جديد.', clinicId);
  }

  // ── STATE: idle (or no session) ──────────────────────────────
  if (!session || session.state === 'idle' || isBookingIntent(text)) {
    // STEP 4: record booking intent event for lost-revenue tracking
    if (isBookingIntent(text) && !_pendingIntents.has(phone)) {
      recordAIEvent({ clinicId, phone, eventType: 'intent_booking', meta: { text } })
        .then(evId => _pendingIntents.set(phone, evId));
    }

    const specialties = await fetchClinicSpecialties(clinicId);
    if (specialties.length === 0) {
      return sendWhatsAppMessage(phone, 'عذراً، لا توجد تخصصات متاحة حالياً. يرجى التواصل مع الاستقبال.', clinicId);
    }
    // SMART: extract entities from initial message and skip steps if possible
    const detectedSp  = detectSpecialty(text, specialties);
    const datePref    = detectDatePreference(text);
    const timePref    = detectTimePreference(text);
    if (detectedSp) {
      const doctor = await fetchDoctorForSpecialty(clinicId, detectedSp.id);
      if (doctor) {
        let slots = await fetchAvailableSlots(doctor.id);
        slots = filterSlotsByDate(filterSlotsByTime(slots, timePref), datePref);
        if (slots.length) {
          setSession(phone, { state: 'choosing_time', clinicId, specialtyId: detectedSp.id, doctorId: doctor.id, doctorName: doctor.name_ar || doctor.name, slots });
          const hint = buildDateHint(datePref, timePref);
          return sendWhatsAppMessage(phone,
            `تمام! 👍 ${detectedSp.name_ar || detectedSp.name}${hint}\nالطبيب: ${doctor.name_ar || doctor.name}\nاختر الموعد:\n${numberedList(slots, s => s.label)}\n\nأرسل رقم الاختيار أو 0 للإلغاء.`, clinicId
          );
        }
      }
    }
    // Fallback: show specialty list
    setSession(phone, { state: 'choosing_specialty', clinicId, specialties });
    const list = numberedList(specialties, s => `${s.name_ar || s.name}`);
    return sendWhatsAppMessage(phone,
      `مرحباً! اختر التخصص:\n${list}\n\nأرسل رقم الاختيار. أرسل 0 للإلغاء.`, clinicId
    );
  }

  // ── STATE: choosing_specialty ────────────────────────────────
  if (session.state === 'choosing_specialty') {
    // Accept number OR text name
    const byText  = detectSpecialty(text, session.specialties);
    const idx     = byText
      ? session.specialties.indexOf(byText)
      : parseInt(text.trim(), 10) - 1;
    if (idx < 0 || idx >= session.specialties.length) {
      return sendWhatsAppMessage(phone, `الرجاء إرسال رقم بين 1 و ${session.specialties.length} أو اكتب اسم التخصص.`, clinicId);
    }
    const specialty = session.specialties[idx];
    const doctor = await fetchDoctorForSpecialty(clinicId, specialty.id);
    if (!doctor) {
      return sendWhatsAppMessage(phone, 'عذراً، لا يوجد طبيب متاح لهذا التخصص حالياً.', clinicId);
    }
    const slots = await fetchAvailableSlots(doctor.id);
    if (slots.length === 0) {
      return sendWhatsAppMessage(phone, 'عذراً، لا توجد مواعيد متاحة خلال الأيام القادمة.', clinicId);
    }
    setSession(phone, {
      ...session,
      state: 'choosing_time',
      specialtyId: specialty.id,
      doctorId: doctor.id,
      doctorName: doctor.name_ar || doctor.name,
      slots,
    });
    const list = numberedList(slots, s => s.label);
    return sendWhatsAppMessage(phone,
      `الطبيب: ${doctor.name_ar || doctor.name}\nاختر الموعد:\n${list}\n\nأرسل رقم الاختيار.`, clinicId
    );
  }

  // ── STATE: choosing_time ─────────────────────────────────────
  if (session.state === 'choosing_time') {
    const idx = parseInt(text.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= session.slots.length) {
      return sendWhatsAppMessage(phone, `الرجاء إرسال رقم بين 1 و ${session.slots.length}.`, clinicId);
    }
    const slot = session.slots[idx];
    const patientId = await resolvePatient(phone);
    if (!patientId) {
      return sendWhatsAppMessage(phone, 'حدث خطأ أثناء إنشاء الحجز. يرجى التواصل مع الاستقبال.', clinicId);
    }
    const appt = await createWhatsappAppointment({
      clinicId,
      patientId,
      doctorId:    session.doctorId,
      specialtyId: session.specialtyId,
      date:        slot.date,
      time:        slot.time,
    });
    if (!appt) {
      return sendWhatsAppMessage(phone, 'حدث خطأ أثناء إنشاء الحجز. يرجى التواصل مع الاستقبال.', clinicId);
    }
    setSession(phone, { ...session, state: 'confirmed' });
    // Resolve pending booking intent event — booking completed, not lost
    const evId = _pendingIntents.get(phone);
    if (evId) { resolveAIEvent(evId, 'completed'); _pendingIntents.delete(phone); }
    return sendWhatsAppMessage(phone,
      `✅ تم الحجز بنجاح!\nالطبيب: ${session.doctorName}\nالموعد: ${slot.label}\n\nأرسل "حجز" لحجز موعد آخر.`, clinicId
    );
  }

  // ── STATE: confirmed ─────────────────────────────────────────
  if (session.state === 'confirmed') {
    if (isBookingIntent(text)) {
      clearSession(phone);
      return handleWhatsappMessage(phone, text); // restart
    }
    return sendWhatsAppMessage(phone, 'تم تأكيد حجزك. أرسل "حجز" لحجز موعد جديد أو 0 للإلغاء.', clinicId);
  }
}

// ─── WhatsApp Booking Bot Simulator ──────────────────────────────────────────
// ── STEP 3/4/5: Voice → Intent-Based Booking ─────────────────────────────────
// Routes voice transcript through extractIntent then directly into the booking
// engine — skipping or reducing unnecessary steps based on available data.
async function handleVoiceBooking(phone, clinicId, transcript) {
  console.log(`[Voice ← ${phone}] ${transcript}`);
  if (!clinicId) {
    return sendWhatsAppMessage(phone, 'عذراً، الخدمة غير متاحة حالياً.', clinicId);
  }

  // STEP 3: normalize + arabizi before matching
  transcript = preprocess(transcript);

  // STEP 8: Emergency check — NEVER auto-book; route to immediate help
  const _VOICE_EMERGENCY_KW = [
    'ألم في الصدر', 'صعوبة في التنفس', 'فقدان وعي', 'نزيف شديد',
    'جلطة', 'أزمة قلبية', 'chest pain', 'heart attack', 'unconscious',
  ];
  if (_VOICE_EMERGENCY_KW.some(kw => transcript.includes(kw))) {
    console.log(`[Voice 🚨 emergency ← ${phone}] "${transcript.slice(0, 80)}"`);
    return sendWhatsAppMessage(
      phone,
      '🚨 هذه قد تكون حالة طوارئ طبية. اتصل بالإسعاف فوراً على 123 أو اذهب لأقرب طوارئ. لا تنتظر.',
      clinicId
    );
  }

  const specialties = await fetchClinicSpecialties(clinicId);
  // STEP 4: AI-powered extraction with keyword fallback (STEP 5)
  const { intent, specialty, date, time } = await extractIntentAI(transcript, specialties);

  // CANCEL
  if (intent === 'cancel') {
    clearSession(phone);
    return sendWhatsAppMessage(phone, 'تم الإلغاء. أرسل "حجز" للبدء من جديد.', clinicId);
  }

  // INQUIRY — voice doesn't map to booking, fall back to normal handler
  if (intent !== 'booking') {
    return handleWhatsappMessage(phone, transcript);
  }

  // Record booking intent event
  if (!_pendingIntents.has(phone)) {
    recordAIEvent({ clinicId, phone, eventType: 'intent_booking', meta: { text: transcript, source: 'voice' } })
      .then(evId => _pendingIntents.set(phone, evId));
  }

  // STEP 4a — no specialty detected → ask
  if (!specialty) {
    if (!specialties.length) {
      return sendWhatsAppMessage(phone, 'عذراً، لا توجد تخصصات متاحة حالياً.', clinicId);
    }
    setSession(phone, { state: 'choosing_specialty', clinicId, specialties });
    return sendWhatsAppMessage(phone,
      `فهمت إنك عايز تحجز 🎤\nاختار التخصص:\n${numberedList(specialties, s => s.name_ar || s.name)}\n\nأرسل رقم الاختيار أو 0 للإلغاء.`,
      clinicId
    );
  }

  // Specialty known → fetch doctor
  const doctor = await fetchDoctorForSpecialty(clinicId, specialty.id);
  if (!doctor) {
    setSession(phone, { state: 'choosing_specialty', clinicId, specialties });
    return sendWhatsAppMessage(phone,
      `مافيش طبيب ${specialty.name_ar || specialty.name} متاح دلوقتى.\nاختار تخصص تاني:\n${numberedList(specialties, s => s.name_ar || s.name)}`,
      clinicId
    );
  }

  let slots = await fetchAvailableSlots(doctor.id);
  slots = filterSlotsByDate(filterSlotsByTime(slots, time), date);

  if (!slots.length) {
    setSession(phone, { state: 'choosing_specialty', clinicId, specialties });
    return sendWhatsAppMessage(phone,
      `مافيش مواعيد متاحة مع ${doctor.name_ar || doctor.name}.\nاختار تخصص تاني:\n${numberedList(specialties, s => s.name_ar || s.name)}`,
      clinicId
    );
  }

  // STEP 5 — full data (specialty + date + time) → auto-select first slot
  if (date && time) {
    const slot = slots[0];
    setSession(phone, { state: 'choosing_time', clinicId, specialtyId: specialty.id,
      doctorId: doctor.id, doctorName: doctor.name_ar || doctor.name, slots: [slot] });
    // Auto-confirm: simulate the user typing "1"
    return handleWhatsappMessage(phone, '1');
  }

  // STEP 4b — partial data (has specialty, missing date/time) → show filtered list
  const hint = buildDateHint(date, time);
  setSession(phone, { state: 'choosing_time', clinicId, specialtyId: specialty.id,
    doctorId: doctor.id, doctorName: doctor.name_ar || doctor.name, slots });
  return sendWhatsAppMessage(phone,
    `تمام! 🎤 ${specialty.name_ar || specialty.name}${hint}\nالطبيب: ${doctor.name_ar || doctor.name}\nاختر الموعد:\n${numberedList(slots, s => s.label)}\n\nأرسل رقم الاختيار أو 0 للإلغاء.`,
    clinicId
  );
}

// Mirrors handleWhatsappMessage exactly, but:
//  • uses waSessions keyed by "sim:<userId>" (no collision with real sessions)
//  • returns { reply, state } as JSON instead of calling sendWhatsAppMessage
//  • falls back to MOCK data when Supabase is unavailable (dev-friendly)

const _SIM_MOCK_SPECIALTIES = [
  { id: 'mock-sp-1', name: 'Cardiology',    name_ar: 'القلب والأوعية الدموية' },
  { id: 'mock-sp-2', name: 'Dentistry',     name_ar: 'طب الأسنان' },
  { id: 'mock-sp-3', name: 'General',       name_ar: 'طب عام' },
  { id: 'mock-sp-4', name: 'Orthopedics',   name_ar: 'جراحة العظام' },
];

const _SIM_MOCK_DOCTOR = { id: 'mock-doc-1', name: 'Dr. Ahmed', name_ar: 'د. أحمد محمود' };

function _simMockSlots() {
  const slots = [];
  for (let d = 1; d <= 2; d++) {
    const date = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    ['09:00', '10:00', '11:00', '14:00'].forEach(t =>
      slots.push({ date, time: t, label: `${date}  ${t}` })
    );
  }
  return slots;
}

async function handleSimulatedMessage(userId, text, clinicId) {
  const key = `sim:${userId}`;
  const cid = clinicId || WA_CLINIC_ID || 'sim-clinic';
  const session = getSession(key);

  // Cancel intent
  if (isCancelIntent(text)) {
    clearSession(key);
    return { reply: 'تم الإلغاء. أرسل "حجز" للبدء من جديد.', state: 'idle' };
  }

  // ── STATE: idle / booking intent ─────────────────────────────
  if (!session || session.state === 'idle' || isBookingIntent(text)) {
    const specialties = supabaseReady ? await fetchClinicSpecialties(cid) : _SIM_MOCK_SPECIALTIES;
    if (specialties.length === 0) {
      return { reply: 'عذراً، لا توجد تخصصات متاحة حالياً.', state: 'idle' };
    }
    // SMART: extract entities and skip steps when possible
    const detectedSp = detectSpecialty(text, specialties);
    const datePref   = detectDatePreference(text);
    const timePref   = detectTimePreference(text);
    if (detectedSp) {
      const doctor = supabaseReady
        ? await fetchDoctorForSpecialty(cid, detectedSp.id)
        : _SIM_MOCK_DOCTOR;
      if (doctor) {
        let slots = supabaseReady ? await fetchAvailableSlots(doctor.id) : _simMockSlots();
        slots = filterSlotsByDate(filterSlotsByTime(slots, timePref), datePref);
        if (slots.length) {
          setSession(key, { state: 'choosing_time', clinicId: cid, specialtyId: detectedSp.id, doctorId: doctor.id, doctorName: doctor.name_ar || doctor.name, slots });
          const hint = buildDateHint(datePref, timePref);
          return {
            reply: `تمام! 👍 ${detectedSp.name_ar || detectedSp.name}${hint}\nالطبيب: ${doctor.name_ar || doctor.name}\nاختر الموعد:\n${numberedList(slots, s => s.label)}\n\nأرسل رقم الاختيار أو 0 للإلغاء.`,
            state: 'choosing_time',
          };
        }
      }
    }
    // Fallback: show specialty list
    setSession(key, { state: 'choosing_specialty', clinicId: cid, specialties });
    const list = numberedList(specialties, s => s.name_ar || s.name);
    return {
      reply: `مرحباً! اختر التخصص:\n${list}\n\nأرسل رقم الاختيار. أرسل 0 للإلغاء.`,
      state: 'choosing_specialty',
    };
  }

  // ── STATE: choosing_specialty ────────────────────────────────
  if (session.state === 'choosing_specialty') {
    // Accept number OR typed specialty name
    const byText = detectSpecialty(text, session.specialties);
    const idx    = byText
      ? session.specialties.indexOf(byText)
      : parseInt(text.trim(), 10) - 1;
    if (idx < 0 || idx >= session.specialties.length) {
      return {
        reply: `الرجاء إرسال رقم بين 1 و ${session.specialties.length} أو اكتب اسم التخصص.`,
        state: 'choosing_specialty',
      };
    }
    const specialty = session.specialties[idx];
    const doctor = supabaseReady
      ? await fetchDoctorForSpecialty(cid, specialty.id)
      : _SIM_MOCK_DOCTOR;
    if (!doctor) {
      return { reply: 'عذراً، لا يوجد طبيب متاح لهذا التخصص حالياً.', state: 'idle' };
    }
    let slots = supabaseReady ? await fetchAvailableSlots(doctor.id) : _simMockSlots();
    // Apply date/time hint from specialty message if user included one
    const spDatePref = detectDatePreference(text);
    const spTimePref = detectTimePreference(text);
    slots = filterSlotsByDate(filterSlotsByTime(slots, spTimePref), spDatePref);
    if (slots.length === 0) {
      return { reply: 'عذراً، لا توجد مواعيد متاحة خلال الأيام القادمة.', state: 'idle' };
    }
    const hint = buildDateHint(spDatePref, spTimePref);
    setSession(key, { ...session, state: 'choosing_time', specialtyId: specialty.id, doctorId: doctor.id, doctorName: doctor.name_ar || doctor.name, slots });
    return {
      reply: `الطبيب: ${doctor.name_ar || doctor.name}${hint}\nاختر الموعد:\n${numberedList(slots, s => s.label)}\n\nأرسل رقم الاختيار.`,
      state: 'choosing_time',
    };
  }

  // ── STATE: choosing_time ─────────────────────────────────────
  if (session.state === 'choosing_time') {
    const idx = parseInt(text.trim(), 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= session.slots.length) {
      return {
        reply: `الرجاء إرسال رقم بين 1 و ${session.slots.length}.`,
        state: 'choosing_time',
      };
    }
    const slot = session.slots[idx];
    let booked = false;
    if (supabaseReady) {
      const patientId = await resolvePatient(userId); // userId as phone placeholder
      const appt = patientId
        ? await createWhatsappAppointment({ clinicId: cid, patientId, doctorId: session.doctorId, specialtyId: session.specialtyId, date: slot.date, time: slot.time })
        : null;
      booked = !!appt;
    } else {
      booked = true; // simulation: always succeeds
    }
    if (!booked) {
      return { reply: 'حدث خطأ أثناء إنشاء الحجز. يرجى التواصل مع الاستقبال.', state: 'choosing_time' };
    }
    setSession(key, { ...session, state: 'confirmed', slot });
    return {
      reply: `✅ تم الحجز بنجاح!\nالطبيب: ${session.doctorName}\nالموعد: ${slot.label}\n\nأرسل "حجز" لحجز موعد آخر.`,
      state: 'confirmed',
    };
  }

  // ── STATE: confirmed ─────────────────────────────────────────
  if (session.state === 'confirmed') {
    if (isBookingIntent(text)) {
      clearSession(key);
      return handleSimulatedMessage(userId, text, clinicId);
    }
    return { reply: 'تم تأكيد حجزك. أرسل "حجز" لحجز موعد جديد أو 0 للإلغاء.', state: 'confirmed' };
  }

  // Fallback
  return { reply: 'أرسل "حجز" لبدء الحجز.', state: 'idle' };
}

// POST /api/whatsapp-message — Simulation endpoint (no real WhatsApp needed)
// Input: { userId, message, clinicId? }           — text message
//     OR { userId, audioMediaId, clinicId? }       — voice message (real WA media ID)
// Output: { reply, state, session?, transcription? }
app.post('/api/whatsapp-message', tryAuthenticate, async (req, res) => {
  const { userId, message, audioMediaId, clinicId } = req.body || {};
  if (!userId || (!message && !audioMediaId)) {
    return res.status(400).json({ error: 'userId and (message or audioMediaId) are required' });
  }
  try {
    let text = message ? String(message).trim() : null;
    let transcription = null;

    // Voice path: transcribe first, then treat as text
    if (audioMediaId && !text) {
      transcription = await transcribeWhatsappAudio(String(audioMediaId), clinicId);
      if (!transcription) {
        return res.json({ reply: 'عذراً، لم أتمكن من فهم الرسالة الصوتية. ممكن تعيد الرسالة أو تكتبها؟', state: 'idle', transcription: null });
      }
      text = transcription;
    }

    const result = await handleSimulatedMessage(String(userId).trim(), text, clinicId);
    const sessionData = getSession(`sim:${userId}`);
    res.json({ ...result, session: sessionData ? { state: sessionData.state } : null, ...(transcription ? { transcription } : {}) });
  } catch (err) {
    console.error('[whatsapp-message sim]', err.message);
    res.status(500).json({ error: 'internal_error', detail: err.message });
  }
});

// ── AI Call Center — text or browser-recorded audio → booking ────
// Accepts: { phone, text?, audioBase64?, audioMimeType?, clinicId? }
// Returns: { reply, state, isEmergency, transcription? }
app.post('/api/call-center/process', tryAuthenticate, async (req, res) => {
  try {
    const { phone = 'cc-test', text, audioBase64, audioMimeType = 'audio/ogg', clinicId } = req.body;

    let transcript = typeof text === 'string' ? text.trim() : null;
    let fromVoice = false;

    // STEP 2: Transcribe uploaded audio (base64) — no WhatsApp token needed
    if (audioBase64 && !transcript) {
      if (!openaiReady) {
        return res.json({ reply: 'خدمة التعرف على الصوت غير متاحة. أكتب طلبك بدلاً من ذلك.', isEmergency: false, state: 'idle' });
      }
      try {
        const buf = Buffer.from(String(audioBase64), 'base64');
        const audioFile = new File([buf], 'recording.ogg', { type: audioMimeType || 'audio/ogg' });
        const result = await openai.audio.transcriptions.create({ file: audioFile, model: 'whisper-1', language: 'ar' });
        transcript = result?.text?.trim() || null;
        fromVoice = !!transcript;
        console.log(`[call-center voice → "${transcript}"]`);
      } catch (err) {
        console.error('[call-center transcription error]', err.message);
        return res.json({ reply: 'لم أتمكن من فهم الرسالة الصوتية. ممكن تكتب طلبك؟', isEmergency: false, state: 'idle' });
      }
    }

    if (!transcript) return res.status(400).json({ error: 'text or audioBase64 required' });

    // STEP 3: Normalize
    const normalized = preprocess(transcript);

    // STEP 8: Emergency check — never auto-book emergencies
    const _CC_EMERGENCY = [
      'ألم في الصدر', 'صعوبة في التنفس', 'فقدان وعي', 'نزيف شديد',
      'جلطة', 'أزمة قلبية', 'chest pain', 'heart attack', 'unconscious',
    ];
    if (_CC_EMERGENCY.some(kw => normalized.includes(kw))) {
      console.log(`[call-center 🚨 EMERGENCY] phone=${phone} "${transcript.slice(0, 80)}"`);
      return res.json({
        reply: '🚨 هذه قد تكون حالة طوارئ طبية. اتصل بالإسعاف فوراً على 123 أو اذهب لأقرب طوارئ. لا تنتظر.',
        isEmergency: true,
        state: 'emergency',
        ...(fromVoice ? { transcription: transcript } : {}),
      });
    }

    // STEP 5/6: Route through existing booking simulation engine
    const cid = clinicId || req.auth?.clinicId || WA_CLINIC_ID;
    const result = await handleSimulatedMessage(String(phone).trim(), normalized, cid);

    // STEP 9: Log every interaction
    console.log(`[call-center] phone=${phone} text="${transcript.slice(0, 60)}" → state=${result.state}`);

    res.json({ ...result, isEmergency: false, ...(fromVoice ? { transcription: transcript } : {}) });
  } catch (err) {
    console.error('[call-center/process error]', err.message);
    res.status(500).json({ error: 'internal_error', reply: 'حدث خطأ. يرجى المحاولة مرة أخرى.', isEmergency: false });
  }
});

// ═══════════════════════════════════════════════════════════════
// VOICE REMINDER CALL SYSTEM
// ═══════════════════════════════════════════════════════════════

// STEP 2: Build TwiML — Arabic IVR message using Twilio's built-in TTS
function _buildReminderTwiml(apptTime, apptDate, doctorName, webhookUrl) {
  const dateLabel = apptDate === new Date().toISOString().slice(0, 10)
    ? 'النهارده'
    : 'غداً';
  const msg = `أهلاً، معاك نظام العيادة. ميعادك ${dateLabel} الساعة ${apptTime} مع ${doctorName}. اضغط 1 للتأكيد، أو 2 للإلغاء.`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Gather action="${webhookUrl}" method="POST" numDigits="1" timeout="12"><Say language="ar-EG" voice="Polly.Zeina">${msg}</Say></Gather><Say language="ar-EG" voice="Polly.Zeina">لم نتلقَّ ردك. شكراً، وإلى اللقاء.</Say></Response>`;
}

// STEP 3: Initiate Twilio REST call (no SDK — plain fetch)
async function _initiateTwilioCall({ to, twiml }) {
  const url  = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`;
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64');
  const res  = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ To: to, From: TWILIO_FROM, Twiml: twiml }),
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Twilio ${res.status}: ${err}`); }
  return res.json();
}

// STEP 1: Find appointments + call patients
async function runVoiceReminders(clinicId) {
  if (!twilioReady)   return { skipped: true, reason: 'twilio_not_configured' };
  if (!supabaseReady) return { skipped: true, reason: 'db_not_connected' };

  // Fetch appointments for today + tomorrow
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const { data: appts, error } = await supabaseAdmin
    .from('appointments')
    .select('id, date, time, status, patient:patients(id, name, name_ar, phone), doctor:users(name, name_ar)')
    .eq('clinic_id', clinicId)
    .in('date', [today, tomorrow])
    .eq('status', 'scheduled')   // STEP 8: only scheduled — skip confirmed/cancelled
    .limit(50);

  if (error) { console.error('[VoiceReminder] DB error:', error.message); return { error: error.message }; }

  const publicHost   = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`);
  const webhookUrl   = `${publicHost}/api/voice-reminders/webhook`;
  const results      = { called: 0, skipped: 0, errors: 0, details: [] };

  for (const appt of (appts || [])) {
    // STEP 8: Safety checks
    if (_recentlyCalled.has(appt.id)) { results.skipped++; continue; }
    const phone = appt.patient?.phone;
    if (!phone) { results.skipped++; continue; }

    const patientName = appt.patient?.name_ar || appt.patient?.name || 'المريض';
    const doctorName  = appt.doctor?.name_ar  || appt.doctor?.name  || 'الطبيب';

    try {
      const twiml = _buildReminderTwiml(appt.time || '', appt.date, doctorName, webhookUrl);
      const call  = await _initiateTwilioCall({ to: phone, twiml });

      const entry = { callSid: call.sid, apptId: appt.id, phone, patientName, doctorName,
        apptTime: appt.time || '', apptDate: appt.date, clinicId,
        status: 'initiated', attempt: 1, createdAt: new Date().toISOString(), digit: null, respondedAt: null };
      _voiceCallLog.set(call.sid, entry);
      _recentlyCalled.add(appt.id);

      // STEP 7: log
      recordAIEvent({ clinicId, phone, patientId: appt.patient?.id, eventType: 'voice_reminder_initiated',
        meta: { callSid: call.sid, apptId: appt.id, apptDate: appt.date, apptTime: appt.time, doctorName } });

      console.log(`[VoiceReminder] Called ${phone} (${patientName}) appt=${appt.id} sid=${call.sid}`);
      results.called++;
      results.details.push({ phone, patientName, apptId: appt.id, callSid: call.sid, status: 'initiated' });
    } catch (err) {
      console.error(`[VoiceReminder] Failed for ${phone}:`, err.message);
      results.errors++;
      results.details.push({ phone, patientName, apptId: appt.id, status: 'error', error: err.message });
    }
    // Throttle: avoid rate-limiting
    await new Promise(r => setTimeout(r, 700));
  }
  return results;
}

// POST /api/voice-reminders/run — Admin trigger (authenticated)
app.post('/api/voice-reminders/run', ...guard, requireRole('admin', 'reception'), async (req, res) => {
  if (!twilioReady) {
    return res.status(503).json({
      error: 'twilio_not_configured',
      hint:  'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in Secrets',
    });
  }
  try {
    const clinicId = req.auth.clinicId;
    console.log(`[VoiceReminder] Run triggered by user=${req.auth.userId} clinic=${clinicId}`);
    const result = await runVoiceReminders(clinicId);
    res.json(result);
  } catch (err) {
    console.error('[VoiceReminder] run error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/voice-reminders/status — Recent call log + stats for clinic
app.get('/api/voice-reminders/status', ...guard, requireRole('admin', 'reception'), (req, res) => {
  const logs = [..._voiceCallLog.values()]
    .filter(l => l.clinicId === req.auth.clinicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  res.json({
    twilioConfigured: twilioReady,
    stats: {
      total:     logs.length,
      initiated: logs.filter(l => l.status === 'initiated').length,
      confirmed: logs.filter(l => l.status === 'confirmed').length,
      cancelled: logs.filter(l => l.status === 'cancelled').length,
      noAnswer:  logs.filter(l => l.status === 'no_answer').length,
    },
    logs,
  });
});

// POST /api/voice-reminders/webhook — Twilio DTMF + status callback (no auth — Twilio signs requests)
app.post('/api/voice-reminders/webhook', async (req, res) => {
  try {
    const { CallSid, Digits, CallStatus } = req.body || {};
    const log = _voiceCallLog.get(CallSid);

    // STEP 4: Handle DTMF response
    if (Digits && log) {
      log.digit       = Digits;
      log.respondedAt = new Date().toISOString();

      if (Digits === '1') {
        log.status = 'confirmed';
        if (supabaseReady) {
          supabaseAdmin.from('appointments')
            .update({ status: 'confirmed', updated_at: new Date().toISOString() })
            .eq('id', log.apptId)
            .then(({ error }) => { if (error) console.error('[VoiceReminder] confirm DB error:', error.message); });
        }
        console.log(`[VoiceReminder] ✅ CONFIRMED appt=${log.apptId} phone=${log.phone}`);
        recordAIEvent({ clinicId: log.clinicId, phone: log.phone, eventType: 'voice_reminder_confirmed',
          meta: { apptId: log.apptId, callSid: CallSid } });
        res.set('Content-Type', 'text/xml');
        return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say language="ar-EG" voice="Polly.Zeina">شكراً لتأكيدك. نراك قريباً إن شاء الله.</Say></Response>`);
      }

      if (Digits === '2') {
        log.status = 'cancelled';
        if (supabaseReady) {
          supabaseAdmin.from('appointments')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', log.apptId)
            .then(({ error }) => { if (error) console.error('[VoiceReminder] cancel DB error:', error.message); });
        }
        console.log(`[VoiceReminder] ❌ CANCELLED appt=${log.apptId} phone=${log.phone}`);
        recordAIEvent({ clinicId: log.clinicId, phone: log.phone, eventType: 'voice_reminder_cancelled',
          meta: { apptId: log.apptId, callSid: CallSid } });
        res.set('Content-Type', 'text/xml');
        return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say language="ar-EG" voice="Polly.Zeina">حسناً، تم إلغاء موعدك. بالسلامة.</Say></Response>`);
      }
    }

    // STEP 6: No digits → check for terminal status → retry once
    if (log && log.status === 'initiated') {
      const terminal = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
      if (!Digits && terminal.includes(CallStatus)) {
        log.status      = 'no_answer';
        log.respondedAt = new Date().toISOString();
        console.log(`[VoiceReminder] ⚠ no_answer appt=${log.apptId} attempt=${log.attempt}`);

        // STEP 6: Retry once after 5 minutes
        if (log.attempt < 2) {
          const retryLog = { ...log };
          setTimeout(async () => {
            if (_recentlyCalled.has(retryLog.apptId) && retryLog.status === 'confirmed') return;
            try {
              const publicHost = process.env.REPLIT_DEV_DOMAIN
                ? `https://${process.env.REPLIT_DEV_DOMAIN}`
                : (process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3001}`);
              const twiml = _buildReminderTwiml(retryLog.apptTime, retryLog.apptDate, retryLog.doctorName,
                `${publicHost}/api/voice-reminders/webhook`);
              const call = await _initiateTwilioCall({ to: retryLog.phone, twiml });
              _voiceCallLog.set(call.sid, { ...retryLog, callSid: call.sid, status: 'initiated',
                attempt: 2, createdAt: new Date().toISOString(), digit: null, respondedAt: null });
              console.log(`[VoiceReminder] Retry placed sid=${call.sid} phone=${retryLog.phone}`);
            } catch (err) {
              console.error('[VoiceReminder] Retry failed:', err.message);
            }
          }, 5 * 60 * 1000);
        }
      }
    }

    // Default empty TwiML (status callbacks require 2xx)
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  } catch (err) {
    console.error('[VoiceReminder webhook]', err.message);
    res.set('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }
});

// ── Growth Engine: run + status ──────────────────────────────
async function runGrowthEngine(clinicId) {
  if (!supabaseReady) return { error: 'db_not_connected' };

  const now  = Date.now();
  const d7   = new Date(now - 7   * 86400000).toISOString().slice(0, 10);
  const d30  = new Date(now - 30  * 86400000).toISOString().slice(0, 10);
  const d180 = new Date(now - 180 * 86400000).toISOString().slice(0, 10);

  // Fetch recent (last 30 days) and older (30-180 days) appointments to segment patients
  const [{ data: recentAppts }, { data: oldAppts }] = await Promise.all([
    supabaseAdmin.from('appointments')
      .select('id, date, status, patient_id, patient:patients(id, name, name_ar, phone)')
      .eq('clinic_id', clinicId)
      .gte('date', d30)
      .in('status', ['scheduled', 'confirmed', 'completed', 'no_show'])
      .limit(500),
    supabaseAdmin.from('appointments')
      .select('patient_id, date, patient:patients(id, name, name_ar, phone)')
      .eq('clinic_id', clinicId)
      .lt('date', d30)
      .gte('date', d180)
      .in('status', ['scheduled', 'confirmed', 'completed'])
      .limit(500),
  ]);

  // Build patient map: id → { id, name, name_ar, phone, noShow, recent, count, inactive }
  const patientMap = new Map();
  for (const appt of (recentAppts || [])) {
    const p = appt.patient;
    if (!p?.phone) continue;
    const ex = patientMap.get(p.id);
    patientMap.set(p.id, {
      id: p.id, name: p.name, name_ar: p.name_ar, phone: p.phone,
      noShow:   (ex?.noShow  || appt.status === 'no_show'),
      recent:   (ex?.recent  || appt.date >= d7),
      count:    (ex?.count   || 0) + 1,
      inactive: false,
    });
  }
  // Inactive = had visits 30-180 days ago but nothing recent
  for (const appt of (oldAppts || [])) {
    const p = appt.patient;
    if (!p?.phone || patientMap.has(p.id)) continue;
    patientMap.set(p.id, {
      id: p.id, name: p.name, name_ar: p.name_ar, phone: p.phone,
      noShow: false, recent: false, count: 1, inactive: true,
    });
  }

  // Find doctor with available slots for empty_slots message
  let slotDoctor = null;
  const { data: docs } = await supabaseAdmin
    .from('users')
    .select('id, name, name_ar')
    .eq('clinic_id', clinicId)
    .eq('role', 'doctor')
    .eq('is_active', true)
    .limit(8);
  for (const doc of (docs || [])) {
    const slots = await fetchAvailableSlots(doc.id);
    if (slots.length) { slotDoctor = { ...doc, slots }; break; }
  }

  const results = { sent: 0, skipped: 0, segments: {} };

  for (const [, patient] of patientMap) {
    const { id: pid, phone, name_ar, name, noShow, recent, count, inactive } = patient;
    if (!phone) { results.skipped++; continue; }

    // Spam guard: 7-day cooldown per phone number
    const lastSent = _growthCooldown.get(phone);
    if (lastSent && (now - lastSent) < GROWTH_COOLDOWN_MS) { results.skipped++; continue; }

    // Segment priority: no_show > inactive > high_value (with empty slots) > recent
    const displayName = name_ar || name || 'عزيزي المريض';
    let segment, message;
    if (noShow) {
      segment = 'no_show';
      message = GROWTH_TEMPLATES.no_show(displayName);
    } else if (inactive) {
      segment = 'inactive';
      message = GROWTH_TEMPLATES.inactive(displayName);
    } else if (count >= 3 && slotDoctor) {
      segment = 'high_value';
      message = GROWTH_TEMPLATES.empty_slots(displayName, slotDoctor.name_ar || slotDoctor.name);
    } else if (recent) {
      segment = 'recent';
      message = GROWTH_TEMPLATES.recent(displayName);
    } else {
      results.skipped++;
      continue;
    }

    results.segments[segment] = (results.segments[segment] || 0) + 1;

    // Send via WhatsApp (logs internally; if WA not configured it warns and skips send)
    let status = 'pending';
    try {
      await sendWhatsAppMessage(phone, message, clinicId);
      status = 'sent';
      _growthCooldown.set(phone, now);
    } catch {
      status = 'pending';
    }
    results.sent++;

    // Log entry
    const entry = {
      id: `gr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      clinicId, patientId: pid, patientName: displayName, phone,
      segment, message, status, sentAt: new Date().toISOString(),
    };
    _growthLog.unshift(entry);
    if (_growthLog.length > 300) _growthLog.length = 300;

    recordAIEvent({ clinicId, phone, patientId: pid,
      eventType: `growth_${segment}`, meta: { segment, status } });

    await new Promise(r => setTimeout(r, 300)); // throttle
  }

  return results;
}

app.post('/api/growth/run', ...guard, requireRole('admin', 'reception'), async (req, res) => {
  try {
    const result = await runGrowthEngine(req.auth.clinicId);
    if (result.error) return res.status(503).json(result);
    res.json(result);
  } catch (err) {
    console.error('[Growth] run error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/growth/status', ...guard, requireRole('admin', 'reception'), (req, res) => {
  const clinicId = req.auth.clinicId;
  const logs = _growthLog.filter(l => l.clinicId === clinicId).slice(0, 50);
  const stats = {
    total:   logs.length,
    sent:    logs.filter(l => l.status === 'sent').length,
    pending: logs.filter(l => l.status === 'pending').length,
    segments: {
      inactive:   logs.filter(l => l.segment === 'inactive').length,
      no_show:    logs.filter(l => l.segment === 'no_show').length,
      recent:     logs.filter(l => l.segment === 'recent').length,
      high_value: logs.filter(l => l.segment === 'high_value').length,
    },
  };
  res.json({ stats, logs });
});

// ── GET /api/whatsapp/webhook — Meta verification challenge ───
app.get('/api/whatsapp/webhook', async (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode !== 'subscribe') return res.sendStatus(403);

  // Accept if token matches DB setting OR env fallback
  const dbSettings = await loadWASettings(WA_CLINIC_ID);
  const expectedToken = (dbSettings?.verify_token) || WA_VERIFY_TOKEN_ENV;

  if (token === expectedToken) {
    console.log('[WhatsApp] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── Voice transcription via Whisper ──────────────────────────
// Downloads the audio binary from WhatsApp's media API, sends it to
// Whisper, returns the Arabic transcription or null on any failure.
async function transcribeWhatsappAudio(mediaId, clinicId) {
  if (!openaiReady) return null;

  // Resolve token (prefer DB settings, fall back to env)
  let token = WA_TOKEN_ENV;
  const dbSettings = await loadWASettings(clinicId || WA_CLINIC_ID).catch(() => null);
  if (dbSettings?.api_token) token = dbSettings.api_token;
  if (!token) return null;

  try {
    // STEP 1: get download URL from Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const audioUrl = meta?.url;
    if (!audioUrl) return null;

    // STEP 2: download the audio binary
    const audioRes = await fetch(audioUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!audioRes.ok) return null;
    const arrayBuf  = await audioRes.arrayBuffer();
    const audioFile = new File([arrayBuf], 'audio.ogg', { type: meta.mime_type || 'audio/ogg' });

    // STEP 3: transcribe with Whisper (Arabic primary, auto-detect fallback)
    const result = await openai.audio.transcriptions.create({
      file:     audioFile,
      model:    'whisper-1',
      language: 'ar',
    });
    const transcript = result?.text?.trim() || null;
    console.log(`[WhatsApp voice → ${mediaId}] "${transcript}"`);
    return transcript;
  } catch (err) {
    console.error('[voice transcription error]', err.message);
    return null;
  }
}

// ── POST /api/whatsapp/webhook — Incoming messages ───────────
app.post('/api/whatsapp/webhook', async (req, res) => {
  // Always respond 200 immediately so Meta doesn't retry
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    if (!Array.isArray(messages)) return;

    const clinicId = WA_CLINIC_ID; // resolved once per batch

    for (const msg of messages) {
      const phone = msg.from;

      // ── Text messages ─────────────────────────────────────────
      if (msg.type === 'text') {
        const text = msg.text?.body?.trim() || '';
        if (text) await handleWhatsappMessage(phone, text);
        continue;
      }

      // ── Voice / Audio messages — STEP 1: transcribe then route
      if (msg.type === 'audio') {
        const mediaId = msg.audio?.id;
        if (!mediaId) continue;

        const transcript = await transcribeWhatsappAudio(mediaId, clinicId);
        if (transcript) {
          // STEP 1/3: route through intent-based booking — NOT directly to chatbot
          await handleVoiceBooking(phone, clinicId, transcript);
        } else {
          await sendWhatsAppMessage(phone, 'عذراً، لم أتمكن من فهم الرسالة الصوتية. ممكن تعيد الرسالة أو تكتبها؟', clinicId);
        }
        continue;
      }
    }
  } catch (err) {
    console.error('[WhatsApp webhook error]', err.message);
  }
});

// ═══════════════════════════════════════════════════════════
// EXTERNAL API — API Key authentication + v1 routes
// ═══════════════════════════════════════════════════════════

// ── In-memory API key cache (TTL 60 s, avoids per-request DB round-trip) ─────
const _apiKeyCache = new Map(); // apiKey → { clinicId, keyId, scopes, expiresAt }
const API_KEY_TTL  = 60 * 1000;

async function resolveApiKey(rawKey) {
  const cached = _apiKeyCache.get(rawKey);
  if (cached && Date.now() < cached.expiresAt) return cached;

  if (!supabaseReady) return null;
  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, clinic_id, scopes, is_active')
    .eq('api_key', rawKey)
    .eq('is_active', true)
    .single();
  if (error || !data) return null;

  const entry = { clinicId: data.clinic_id, keyId: data.id, scopes: data.scopes, expiresAt: Date.now() + API_KEY_TTL };
  _apiKeyCache.set(rawKey, entry);

  // update last_used_at (fire-and-forget)
  supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then().catch(() => {});
  return entry;
}

async function authenticateApiKey(req, res, next) {
  const rawKey = req.headers['x-api-key'];
  if (!rawKey) return res.status(401).json({ error: 'X-API-Key header required' });
  const resolved = await resolveApiKey(rawKey);
  if (!resolved) return res.status(401).json({ error: 'Invalid or revoked API key' });
  req.apiAuth = resolved;
  next();
}

function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiAuth?.scopes?.includes(scope)) {
      return res.status(403).json({ error: `Scope required: ${scope}` });
    }
    next();
  };
}

// ── STEP 6: API request logging ───────────────────────────────────────────────
// In-memory buffer; flushes to Supabase in batches of 20 or every 30 s
const _apiLogBuffer = [];
function logApiRequest(req, res, keyId, clinicId) {
  const start = Date.now();
  res.on('finish', () => {
    const entry = {
      clinic_id:   clinicId,
      api_key_id:  keyId,
      method:      req.method,
      path:        req.path,
      status_code: res.statusCode,
      duration_ms: Date.now() - start,
      ip:          req.ip,
      logged_at:   new Date().toISOString(),
    };
    _apiLogBuffer.push(entry);
    if (_apiLogBuffer.length >= 20) flushApiLogs();
  });
}
function flushApiLogs() {
  if (!supabaseReady || _apiLogBuffer.length === 0) return;
  const batch = _apiLogBuffer.splice(0, _apiLogBuffer.length);
  supabaseAdmin.from('api_request_logs').insert(batch).then().catch(() => {});
}
setInterval(flushApiLogs, 30_000);

// ── STEP 5: Lost-booking nudge job ────────────────────────────────────────────
// Every 60s: if a booking intent has been pending > 5 min → send a WhatsApp nudge
const INTENT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

setInterval(async () => {
  const now = Date.now();
  for (const [phone, evId] of _pendingIntents.entries()) {
    const ev = _aiEvents.get(evId);
    if (!ev || ev.status !== 'pending') { _pendingIntents.delete(phone); continue; }
    const age = now - new Date(ev.created_at).getTime();
    if (age < INTENT_TIMEOUT_MS) continue;
    // Mark as nudged so we don't send again
    ev.status = 'nudged';
    _pendingIntents.delete(phone);
    if (supabaseReady && supabaseAdmin) {
      supabaseAdmin.from('ai_events')
        .update({ status: 'nudged', updated_at: new Date().toISOString() })
        .eq('id', evId).then(({ error }) => { if (error) console.warn('[AI-EVT nudge]', error.message); });
    }
    const clinicId = ev.clinic_id || WA_CLINIC_ID;
    console.log(`[AI-EVT] nudge → ${phone} (intent pending ${Math.round(age/1000)}s)`);
    await sendWhatsAppMessage(phone,
      'مرحباً 👋 هل لا تزال تريد حجز موعد؟ أرسل "حجز" وسنساعدك فوراً.',
      clinicId
    ).catch(() => {});
    // Log as nudge event
    recordAIEvent({ clinicId, phone, eventType: 'nudge_sent', meta: { originalEventId: evId } }).catch(() => {});
  }
}, 60_000);

// ── STEP 4: Webhook delivery ──────────────────────────────────────────────────
async function fireWebhooks(clinicId, eventType, payload) {
  if (!supabaseReady) return;
  try {
    const { data: hooks } = await supabaseAdmin
      .from('webhooks')
      .select('id, url, secret')
      .eq('clinic_id', clinicId)
      .eq('event_type', eventType)
      .eq('is_active', true);
    if (!hooks?.length) return;

    for (const hook of hooks) {
      const deliveryId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`;
      const body = JSON.stringify({ event: eventType, clinicId, deliveryId, ts: new Date().toISOString(), data: payload });
      const headers = {
        'Content-Type': 'application/json',
        'X-Clinic-Event': eventType,
        'X-Delivery-Id': deliveryId,
      };
      if (hook.secret) headers['X-Webhook-Secret'] = hook.secret;

      fetch(hook.url, { method: 'POST', headers, body })
        .then(r => {
          supabaseAdmin.from('webhook_deliveries').insert({
            webhook_id: hook.id, event_type: eventType,
            payload: payload, status_code: r.status, delivered_at: new Date().toISOString(),
          }).then().catch(() => {});
        })
        .catch(err => {
          supabaseAdmin.from('webhook_deliveries').insert({
            webhook_id: hook.id, event_type: eventType,
            payload: payload, error: String(err), delivered_at: new Date().toISOString(),
          }).then().catch(() => {});
          console.warn(`[webhook] delivery failed to ${hook.url}:`, err.message);
        });
    }
  } catch (err) {
    console.warn('[webhook] fireWebhooks error:', err.message);
  }
}

// ── STEP 3: External v1 routes ────────────────────────────────────────────────
const apiV1 = express.Router();
apiV1.use(rateLimiter(120, 60 * 1000)); // 120 req/min per IP on external API
apiV1.use(authenticateApiKey);
apiV1.use((req, _res, next) => { logApiRequest(req, _res, req.apiAuth.keyId, req.apiAuth.clinicId); next(); });

// GET /api/v1/patients
apiV1.get('/patients', requireScope('patients:read'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { search, page = 1, limit = 50 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  let q = supabaseAdmin.from('patients')
    .select('id, name, name_ar, phone, email, gender, date_of_birth, created_at', { count: 'exact' })
    .eq('clinic_id', req.apiAuth.clinicId)
    .order('created_at', { ascending: false })
    .range(offset, offset + Number(limit) - 1);
  if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
  const { data, error, count } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data, total: count, page: Number(page), limit: Number(limit) });
});

// POST /api/v1/patients
apiV1.post('/patients', requireScope('patients:write'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, phone, email, dateOfBirth, gender, nationalId } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name and phone required' });
  const { data, error } = await supabaseAdmin.from('patients').insert({
    clinic_id: req.apiAuth.clinicId, name, name_ar: nameAr || '',
    phone, email: email || null, date_of_birth: dateOfBirth || null,
    gender: gender || null, national_id: nationalId || null,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  // fire webhook
  fireWebhooks(req.apiAuth.clinicId, 'patient_created', { patient: data });
  res.status(201).json(data);
});

// GET /api/v1/appointments
apiV1.get('/appointments', requireScope('appointments:read'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { date, doctorId, status } = req.query;
  let q = supabaseAdmin.from('appointments')
    .select('id, date, time, status, notes, patient:patients(id,name,phone), doctor:users(id,name)')
    .eq('clinic_id', req.apiAuth.clinicId)
    .order('date', { ascending: true });
  if (date) q = q.eq('date', date);
  if (doctorId) q = q.eq('doctor_id', doctorId);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

// POST /api/v1/appointments
apiV1.post('/appointments', requireScope('appointments:write'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { patientId, doctorId, date, time, visitTypeId, notes } = req.body;
  if (!patientId || !doctorId || !date || !time) {
    return res.status(400).json({ error: 'patientId, doctorId, date, time required' });
  }
  const { data, error } = await supabaseAdmin.from('appointments').insert({
    clinic_id: req.apiAuth.clinicId, patient_id: patientId, doctor_id: doctorId,
    visit_type_id: visitTypeId || null, date, time, notes: notes || null, status: 'scheduled',
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  fireWebhooks(req.apiAuth.clinicId, 'appointment_created', { appointment: data });
  res.status(201).json(data);
});

// GET /api/v1/invoices
apiV1.get('/invoices', requireScope('invoices:read'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { status, patientId } = req.query;
  let q = supabaseAdmin.from('invoices')
    .select('id, total_amount, paid_amount, status, created_at, patient:patients(id,name,phone)')
    .eq('clinic_id', req.apiAuth.clinicId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (status)    q = q.eq('status', status);
  if (patientId) q = q.eq('patient_id', patientId);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data });
});

app.use('/api/v1', apiV1);

// ── STEP 5: Integration hooks ─────────────────────────────────────────────────

// Lab results push (from external LIS systems)
app.post('/api/integrations/lab-results', authenticateApiKey, async (req, res) => {
  const { patientId, orderId, results, testedAt } = req.body;
  if (!patientId || !results) return res.status(400).json({ error: 'patientId and results required' });
  logApiRequest(req, res, req.apiAuth.keyId, req.apiAuth.clinicId);
  // Store in lab_order_results if Supabase ready
  if (supabaseReady) {
    await supabaseAdmin.from('lab_order_results').upsert({
      clinic_id:   req.apiAuth.clinicId,
      patient_id:  patientId,
      order_id:    orderId || null,
      results:     results,
      tested_at:   testedAt || new Date().toISOString(),
    }).then().catch(() => {});
  }
  // fire lab_result webhook to any registered consumers
  fireWebhooks(req.apiAuth.clinicId, 'lab_result', { patientId, orderId, results, testedAt });
  serverAudit({ clinicId: req.apiAuth.clinicId, action: 'create', entity: 'lab_result', entityId: patientId, description: `Lab result pushed via API for patient ${patientId}`, req });
  res.status(202).json({ received: true });
});

// Payment gateway notify (Paymob / Stripe-style callback)
app.post('/api/integrations/payment-notify', async (req, res) => {
  // Verified by shared secret in header (PAYMENT_WEBHOOK_SECRET env var)
  const secret = req.headers['x-payment-secret'];
  if (!secret) {
    return res.status(401).json({ error: 'Missing x-payment-secret header' });
  }
  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (expectedSecret && secret !== expectedSecret) {
    return res.status(401).json({ error: 'Invalid payment secret' });
  }
  if (!expectedSecret) {
    console.warn('[SECURITY] PAYMENT_WEBHOOK_SECRET not configured — secret header present but unverified. Set this env var in production.');
  }
  const { clinicId, invoiceId, amount, method, transactionId, success } = req.body;
  if (!clinicId || !invoiceId || !amount) {
    return res.status(400).json({ error: 'clinicId, invoiceId, amount required' });
  }
  if (!success) {
    console.warn(`[payment-notify] Failed payment for invoice ${invoiceId}`);
    return res.json({ processed: false });
  }
  if (supabaseReady) {
    const { data: current } = await supabaseAdmin
      .from('invoices').select('total_amount, paid_amount, visit_id, status').eq('id', invoiceId).single();
    if (current) {
      const newPaid  = (current.paid_amount || 0) + Number(amount);
      const total    = current.total_amount || 0;
      const newStatus = (total > 0 && newPaid >= total) ? 'paid' : newPaid > 0 ? 'partially_paid' : 'pending';
      await supabaseAdmin.from('invoices')
        .update({ paid_amount: newPaid, status: newStatus, payment_method: method || 'online', updated_at: new Date().toISOString() })
        .eq('id', invoiceId).eq('clinic_id', clinicId);
      if (newStatus === 'paid' && current.visit_id) {
        await supabaseAdmin.from('visits')
          .update({ status: 'waiting', arrival_time: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', current.visit_id).in('status', ['checked_in', 'booked']);
      }
      fireWebhooks(clinicId, 'payment_done', { invoiceId, amount, method, transactionId, newStatus });
    }
  }
  res.json({ processed: true });
});

// ── API Key management (admin-authenticated, NOT api-key-authenticated) ────────

// GET /api/api-keys  — list clinic's keys
app.get('/api/api-keys', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.json({ data: [] });
  const { data, error } = await supabaseAdmin.from('api_keys')
    .select('id, name, api_key, scopes, is_active, last_used_at, created_at')
    .eq('clinic_id', req.auth.clinicId)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data || [] });
});

// POST /api/api-keys  — create new key
app.post('/api/api-keys', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, scopes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  // Generate secure 48-char hex key with cfk_ prefix
  const randomHex = [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
  const apiKey = `cfk_${randomHex}`;
  const defaultScopes = scopes || ['patients:read', 'appointments:read', 'invoices:read'];
  const { data, error } = await supabaseAdmin.from('api_keys').insert({
    clinic_id: req.auth.clinicId, name, api_key: apiKey, scopes: defaultScopes, is_active: true,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  serverAudit({ userId: req.auth.userId, clinicId: req.auth.clinicId, action: 'create', entity: 'api_key', entityId: data.id, description: `API key created: ${name}`, req });
  res.status(201).json(data);
});

// DELETE /api/api-keys/:id
app.delete('/api/api-keys/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin.from('api_keys')
    .update({ is_active: false }).eq('id', req.params.id).eq('clinic_id', req.auth.clinicId);
  if (error) return res.status(500).json({ error: error.message });
  _apiKeyCache.forEach((v, k) => { if (v.keyId === req.params.id) _apiKeyCache.delete(k); });
  serverAudit({ userId: req.auth.userId, clinicId: req.auth.clinicId, action: 'delete', entity: 'api_key', entityId: req.params.id, description: 'API key revoked', req });
  res.json({ revoked: true });
});

// GET /api/webhooks
app.get('/api/webhooks', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.json({ data: [] });
  const { data, error } = await supabaseAdmin.from('webhooks')
    .select('id, name, event_type, url, is_active, created_at')
    .eq('clinic_id', req.auth.clinicId).order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data || [] });
});

// POST /api/webhooks
app.post('/api/webhooks', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, eventType, url, secret } = req.body;
  if (!eventType || !url) return res.status(400).json({ error: 'eventType and url required' });
  const { data, error } = await supabaseAdmin.from('webhooks').insert({
    clinic_id: req.auth.clinicId, name: name || '', event_type: eventType, url, secret: secret || null, is_active: true,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// DELETE /api/webhooks/:id
app.delete('/api/webhooks/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin.from('webhooks')
    .delete().eq('id', req.params.id).eq('clinic_id', req.auth.clinicId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ deleted: true });
});

// GET /api/api-request-logs
app.get('/api/api-request-logs', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.json({ data: [] });
  const { data, error } = await supabaseAdmin.from('api_request_logs')
    .select('*').eq('clinic_id', req.auth.clinicId)
    .order('logged_at', { ascending: false }).limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data || [] });
});


// ═══════════════════════════════════════════════════════════
// MODULE SYSTEM (Feature Toggle)
// ═══════════════════════════════════════════════════════════

const MODULE_NAMES = ['finance', 'inventory', 'ai', 'insurance', 'reports'];

// Helper: returns true if module is enabled for clinic (defaults to true if no record)
async function isModuleEnabled(clinicId, moduleName) {
  if (!supabaseReady || !clinicId) return true;
  const { data } = await supabaseAdmin
    .from('clinic_modules')
    .select('is_enabled')
    .eq('clinic_id', clinicId)
    .eq('module_name', moduleName)
    .maybeSingle();
  return data ? data.is_enabled : true; // default = enabled
}

// Middleware factory: blocks route with 403 if module disabled for clinic.
// Fail-safe: if module record is missing or DB is unavailable → allow (default true).
function requireModule(moduleName) {
  return async (req, res, next) => {
    try {
      const clinicId = req.auth?.clinicId;
      const enabled = await isModuleEnabled(clinicId, moduleName);
      if (!enabled) {
        console.warn(`[MODULE_BLOCKED] module=${moduleName} clinic_id=${clinicId} path=${req.method} ${req.path} user=${req.auth?.id}`);
        return res.status(403).json({
          error: 'module_disabled',
          module: moduleName,
          message: `The '${moduleName}' module is disabled for this clinic. Contact your administrator.`,
          messageAr: `وحدة '${moduleName}' غير مفعّلة لهذه العيادة. تواصل مع المسؤول.`,
        });
      }
      next();
    } catch {
      next(); // fail-safe: never block on unexpected error
    }
  };
}

// GET /api/modules/:clinicId — return all modules with enabled status for clinic
app.get('/api/modules/:clinicId', ...guard, async (req, res) => {
  const { clinicId } = req.params;
  if (req.auth.clinicId !== clinicId && req.auth.role !== 'super_admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!supabaseReady) {
    // Demo mode: all enabled
    return res.json(MODULE_NAMES.map(name => ({ module_name: name, is_enabled: true })));
  }
  const { data, error } = await supabaseAdmin
    .from('clinic_modules')
    .select('module_name, is_enabled')
    .eq('clinic_id', clinicId);
  if (error) return res.status(500).json({ error: error.message });
  // Fill in any missing modules with default true
  const map = Object.fromEntries((data || []).map(r => [r.module_name, r.is_enabled]));
  const result = MODULE_NAMES.map(name => ({
    module_name: name,
    is_enabled: map[name] !== undefined ? map[name] : true,
  }));
  res.json(result);
});

// POST /api/modules/toggle — enable or disable a module for a clinic
app.post('/api/modules/toggle', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  const { clinic_id, module_name, is_enabled } = req.body;
  if (!clinic_id || !module_name || is_enabled === undefined) {
    return res.status(400).json({ error: 'clinic_id, module_name, is_enabled required' });
  }
  if (!MODULE_NAMES.includes(module_name)) {
    return res.status(400).json({ error: 'invalid module_name' });
  }
  if (req.auth.clinicId !== clinic_id && req.auth.role !== 'super_admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  if (!supabaseReady) {
    return res.json({ clinic_id, module_name, is_enabled }); // demo: no-op
  }
  // Manual upsert: check if row exists, then UPDATE or INSERT
  // (avoids requiring a unique constraint added separately from the main schema)
  const { data: existing } = await supabaseAdmin
    .from('clinic_modules')
    .select('id')
    .eq('clinic_id', clinic_id)
    .eq('module_name', module_name)
    .maybeSingle();

  let data, error;
  if (existing) {
    ({ data, error } = await supabaseAdmin
      .from('clinic_modules')
      .update({ is_enabled })
      .eq('id', existing.id)
      .select()
      .single());
  } else {
    ({ data, error } = await supabaseAdmin
      .from('clinic_modules')
      .insert({ clinic_id, module_name, is_enabled })
      .select()
      .single());
  }
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});


// POST /api/plan/change — sync all clinic_modules rows to match a plan's module set
// Plan → modules mapping mirrors PLAN_MODULE_MAP in subscriptionPlanStore.ts
const PLAN_MODULE_MAP = {
  'plan-1': [],
  'plan-2': ['finance', 'inventory'],
  'plan-3': ['finance', 'inventory', 'insurance', 'reports'],
  'plan-4': ['finance', 'inventory', 'ai', 'insurance', 'reports'],
};

app.post('/api/plan/change', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  const { plan_id } = req.body;
  if (!plan_id) return res.status(400).json({ error: 'plan_id required' });
  if (!PLAN_MODULE_MAP[plan_id]) return res.status(400).json({ error: 'unknown plan_id' });

  const clinicId = req.auth.clinicId;
  const enabledModules = PLAN_MODULE_MAP[plan_id];

  // Demo mode: return the computed state without DB writes
  if (!supabaseReady) {
    const result = MODULE_NAMES.map(name => ({ module_name: name, is_enabled: enabledModules.includes(name) }));
    return res.json({ plan_id, clinic_id: clinicId, modules: result });
  }

  // Upsert all module rows in parallel
  const upserts = MODULE_NAMES.map(async (name) => {
    const is_enabled = enabledModules.includes(name);
    const { data: existing } = await supabaseAdmin
      .from('clinic_modules').select('id')
      .eq('clinic_id', clinicId).eq('module_name', name).maybeSingle();

    if (existing) {
      await supabaseAdmin.from('clinic_modules')
        .update({ is_enabled }).eq('id', existing.id);
    } else {
      await supabaseAdmin.from('clinic_modules')
        .insert({ clinic_id: clinicId, module_name: name, is_enabled });
    }
    return { module_name: name, is_enabled };
  });

  try {
    const modules = await Promise.all(upserts);
    console.log(`[PLAN_CHANGE] clinic=${clinicId} plan=${plan_id} by=${req.auth?.id}`);
    res.json({ plan_id, clinic_id: clinicId, modules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
// SPECIALTIES routes
// ═══════════════════════════════════════════════════════════

app.get('/api/specialties', async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { data, error } = await supabaseAdmin
    .from('specialties').select('*').eq('is_active', true).order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/specialties', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, formSchema } = req.body;
  if (!name || !nameAr) return res.status(400).json({ error: 'name and nameAr required' });
  const { data, error } = await supabaseAdmin
    .from('specialties')
    .insert({ name, name_ar: nameAr, form_schema: formSchema || [], is_active: true })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/specialties/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, isActive, formSchema } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (nameAr !== undefined) updates.name_ar = nameAr;
  if (isActive !== undefined) updates.is_active = isActive;
  if (formSchema !== undefined) updates.form_schema = formSchema;
  const { data, error } = await supabaseAdmin
    .from('specialties').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/specialties/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin
    .from('specialties').update({ is_active: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// SERVICES CRUD (GET already defined above)
// ═══════════════════════════════════════════════════════════

app.post('/api/services', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, specialtyId, price, doctorPercentage } = req.body;
  if (!name || !specialtyId) return res.status(400).json({ error: 'name and specialtyId required' });
  const { data, error } = await supabaseAdmin
    .from('services')
    .insert({
      name, name_ar: nameAr || '', specialty_id: specialtyId,
      price: price || 0, doctor_percentage: doctorPercentage ?? 60, is_active: true,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/services/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, specialtyId, price, doctorPercentage, isActive } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (nameAr !== undefined) updates.name_ar = nameAr;
  if (specialtyId !== undefined) updates.specialty_id = specialtyId;
  if (price !== undefined) updates.price = price;
  if (doctorPercentage !== undefined) updates.doctor_percentage = doctorPercentage;
  if (isActive !== undefined) updates.is_active = isActive;
  const { data, error } = await supabaseAdmin
    .from('services').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/services/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin
    .from('services').update({ is_active: false }).eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// VISIT TYPES routes
// ═══════════════════════════════════════════════════════════

app.get('/api/visit-types', async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { clinicId } = req.query;
  let query = supabaseAdmin.from('visit_types').select('*').order('sort_order');
  if (clinicId) query = query.eq('clinic_id', clinicId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/visit-types', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, price, durationMinutes, isUrgent, sortOrder } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabaseAdmin
    .from('visit_types')
    .insert({
      clinic_id: req.auth.clinicId, name, name_ar: nameAr || '',
      price: price || 0, duration_minutes: durationMinutes || 20,
      is_urgent: isUrgent || false, is_enabled: true, sort_order: sortOrder || 1,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/visit-types/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, price, durationMinutes, isUrgent, isEnabled, sortOrder } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (nameAr !== undefined) updates.name_ar = nameAr;
  if (price !== undefined) updates.price = price;
  if (durationMinutes !== undefined) updates.duration_minutes = durationMinutes;
  if (isUrgent !== undefined) updates.is_urgent = isUrgent;
  if (isEnabled !== undefined) updates.is_enabled = isEnabled;
  if (sortOrder !== undefined) updates.sort_order = sortOrder;
  const { data, error } = await supabaseAdmin
    .from('visit_types').update(updates).eq('id', req.params.id)
    .eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/visit-types/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin
    .from('visit_types').delete().eq('id', req.params.id).eq('clinic_id', req.auth.clinicId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// VITAL SIGNS routes
// ═══════════════════════════════════════════════════════════

app.get('/api/vital-signs', ...guard, async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { patientId, visitId } = req.query;
  if (!patientId) return res.status(400).json({ error: 'patientId required' });
  let query = supabaseAdmin.from('vital_signs').select('*')
    .eq('patient_id', patientId).order('recorded_at', { ascending: false });
  if (visitId) query = query.eq('visit_id', visitId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/vital-signs', ...guard, requireRole('admin', 'doctor', 'reception'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { patientId, visitId, systolic, diastolic, heartRate, temperature, weight, height, oxygenSaturation, notes } = req.body;
  if (!patientId) return res.status(400).json({ error: 'patientId required' });
  const { data, error } = await supabaseAdmin
    .from('vital_signs')
    .insert({
      patient_id: patientId, visit_id: visitId || null, doctor_id: req.auth.userId,
      systolic: systolic || null, diastolic: diastolic || null,
      heart_rate: heartRate || null, temperature: temperature || null,
      weight: weight || null, height: height || null,
      oxygen_saturation: oxygenSaturation || null, notes: notes || null,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ═══════════════════════════════════════════════════════════
// MEDICAL NOTES routes
// ═══════════════════════════════════════════════════════════

app.get('/api/medical-notes', ...guard, async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { patientId, visitId } = req.query;
  if (!patientId) return res.status(400).json({ error: 'patientId required' });
  let query = supabaseAdmin.from('medical_notes').select('*')
    .eq('patient_id', patientId).order('created_at', { ascending: false });
  if (visitId) query = query.eq('visit_id', visitId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/medical-notes', ...guard, requireRole('admin', 'doctor'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { patientId, visitId, category, title, content, attachments } = req.body;
  if (!patientId || !title) return res.status(400).json({ error: 'patientId and title required' });
  const { data, error } = await supabaseAdmin
    .from('medical_notes')
    .insert({
      patient_id: patientId, visit_id: visitId || null, doctor_id: req.auth.userId,
      category: category || 'general', title, content: content || '', attachments: attachments || [],
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/medical-notes/:id', ...guard, requireRole('admin', 'doctor'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { category, title, content, attachments } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (category !== undefined) updates.category = category;
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (attachments !== undefined) updates.attachments = attachments;
  const { data, error } = await supabaseAdmin
    .from('medical_notes').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/medical-notes/:id', ...guard, requireRole('admin', 'doctor'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin.from('medical_notes').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// PRESCRIPTIONS routes (staff side — patient portal GET defined elsewhere)
// ═══════════════════════════════════════════════════════════

app.get('/api/prescriptions', ...guard, async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { patientId, visitId } = req.query;
  let query = supabaseAdmin.from('prescriptions').select('*')
    .order('created_at', { ascending: false });
  if (patientId) query = query.eq('patient_id', patientId);
  if (visitId)   query = query.eq('visit_id', visitId);
  if (req.auth.role === 'doctor') query = query.eq('doctor_id', req.auth.userId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/prescriptions', ...guard, requireRole('admin', 'doctor'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { patientId, visitId, status, medications, notes, expiresAt } = req.body;
  if (!patientId || !medications) return res.status(400).json({ error: 'patientId and medications required' });
  const { data, error } = await supabaseAdmin
    .from('prescriptions')
    .insert({
      patient_id: patientId, visit_id: visitId || null, doctor_id: req.auth.userId,
      status: status || 'active', medications: medications || [],
      notes: notes || null, expires_at: expiresAt || null,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/prescriptions/:id', ...guard, requireRole('admin', 'doctor'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { status, medications, notes } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (status !== undefined) updates.status = status;
  if (medications !== undefined) updates.medications = medications;
  if (notes !== undefined) updates.notes = notes;
  const { data, error } = await supabaseAdmin
    .from('prescriptions').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/prescriptions/:id', ...guard, requireRole('admin', 'doctor'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin.from('prescriptions').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// LAB ORDERS routes
// ═══════════════════════════════════════════════════════════

app.get('/api/lab-orders', ...guard, async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { patientId, visitId } = req.query;
  let query = supabaseAdmin.from('orders').select('*')
    .eq('clinic_id', req.auth.clinicId).order('created_at', { ascending: false });
  if (patientId) query = query.eq('patient_id', patientId);
  if (visitId)   query = query.eq('visit_id', visitId);
  if (req.auth.role === 'doctor') query = query.eq('doctor_id', req.auth.userId);
  const { data, error } = await query;
  if (error) {
    if (error.message?.includes('does not exist')) return res.json([]);
    return res.status(500).json({ error: error.message });
  }
  res.json(data ?? []);
});

app.post('/api/lab-orders', ...guard, requireRole('admin', 'doctor', 'reception'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { patientId, visitId, type, description, notes } = req.body;
  if (!patientId || !visitId) return res.status(400).json({ error: 'patientId and visitId required' });
  const { data, error } = await supabaseAdmin
    .from('orders')
    .insert({
      clinic_id: req.auth.clinicId, patient_id: patientId, visit_id: visitId,
      doctor_id: req.auth.userId, type: type || 'lab', status: 'requested',
      description: description || notes || '', notes: notes || null,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/lab-orders/:id', ...guard, requireRole('admin', 'doctor', 'reception'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { status, notes } = req.body;
  const updates = {};
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  const { data, error } = await supabaseAdmin
    .from('orders').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// OFFERS routes
// ═══════════════════════════════════════════════════════════

app.get('/api/offers', async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { clinicId } = req.query;
  let query = supabaseAdmin.from('offers').select('*').order('created_at', { ascending: false });
  if (clinicId) query = query.eq('clinic_id', clinicId);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/offers', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { title, titleAr, description, descriptionAr, offerType, serviceType, startDate, expiresAt, originalPrice, discountedPrice, discountPercent, maxUses, conditions, doctorId } = req.body;
  if (!title || !offerType || !startDate || !expiresAt) return res.status(400).json({ error: 'title, offerType, startDate, expiresAt required' });
  const { data, error } = await supabaseAdmin
    .from('offers')
    .insert({
      clinic_id: req.auth.clinicId, doctor_id: doctorId || null,
      title, title_ar: titleAr || '', description: description || '', description_ar: descriptionAr || '',
      offer_type: offerType, service_type: serviceType || 'all',
      start_date: startDate, expires_at: expiresAt,
      original_price: originalPrice || null, discounted_price: discountedPrice || null,
      discount_percent: discountPercent || null, max_uses: maxUses || null,
      conditions: conditions || {}, is_active: true,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/offers/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { isActive, title, titleAr, description, discountedPrice, discountPercent, expiresAt } = req.body;
  const updates = {};
  if (isActive !== undefined)       updates.is_active = isActive;
  if (title !== undefined)          updates.title = title;
  if (titleAr !== undefined)        updates.title_ar = titleAr;
  if (description !== undefined)    updates.description = description;
  if (discountedPrice !== undefined) updates.discounted_price = discountedPrice;
  if (discountPercent !== undefined) updates.discount_percent = discountPercent;
  if (expiresAt !== undefined)      updates.expires_at = expiresAt;
  const { data, error } = await supabaseAdmin
    .from('offers').update(updates).eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/offers/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin
    .from('offers').delete().eq('id', req.params.id).eq('clinic_id', req.auth.clinicId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// RATINGS routes
// ═══════════════════════════════════════════════════════════

app.get('/api/ratings', async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { targetId, targetType } = req.query;
  let query = supabaseAdmin.from('ratings').select('*').order('created_at', { ascending: false });
  if (targetId)   query = query.eq('target_id', targetId);
  if (targetType) query = query.eq('target_type', targetType);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/ratings', async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { targetId, targetType, patientId, stars, comment } = req.body;
  if (!targetId || !targetType || !patientId || !stars) return res.status(400).json({ error: 'targetId, targetType, patientId, stars required' });
  const { data, error } = await supabaseAdmin
    .from('ratings')
    .insert({ target_id: targetId, target_type: targetType, patient_id: patientId, stars, comment: comment || null })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ═══════════════════════════════════════════════════════════
// DOCTOR PROFILES routes
// ═══════════════════════════════════════════════════════════

app.get('/api/doctor-profiles/:doctorId', async (req, res) => {
  if (!supabaseReady) return res.json(null);
  const { data, error } = await supabaseAdmin
    .from('doctor_profiles').select('*').eq('id', req.params.doctorId).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || null);
});

app.put('/api/doctor-profiles/:doctorId', ...guard, requireRole('admin', 'doctor', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { bio, bioAr, photoUrl, graduationYear, graduationUniversity, graduationUniversityAr, postgrad, certifications, conferences, positions, achievements, additionalInfo, additionalInfoAr, socialLinks, allowAdminEdit, allowReceptionEdit } = req.body;
  const payload = {
    id: req.params.doctorId,
    bio: bio || '', bio_ar: bioAr || '', photo_url: photoUrl || null,
    graduation_year: graduationYear || null, graduation_univ: graduationUniversity || null,
    graduation_univ_ar: graduationUniversityAr || null,
    postgrad: postgrad || [], certifications: certifications || [],
    conferences: conferences || [], positions: positions || [],
    achievements: achievements || [],
    additional_info: additionalInfo || '', additional_info_ar: additionalInfoAr || '',
    social_links: socialLinks || {},
    allow_admin_edit: allowAdminEdit ?? true, allow_reception_edit: allowReceptionEdit ?? false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from('doctor_profiles').upsert(payload, { onConflict: 'id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// EXPENSES routes (stored as transactions type='expense')
// ═══════════════════════════════════════════════════════════

app.get('/api/expenses', ...guard, async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { month } = req.query;
  let query = supabaseAdmin.from('transactions').select('*')
    .eq('clinic_id', req.auth.clinicId).eq('type', 'expense')
    .order('created_at', { ascending: false });
  if (month) {
    query = query.gte('created_at', `${month}-01T00:00:00Z`).lte('created_at', `${month}-31T23:59:59Z`);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.post('/api/expenses', ...guard, requireRole('admin', 'reception'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { category, categoryAr, description, amount, paymentMethod, date } = req.body;
  if (!category || !amount) return res.status(400).json({ error: 'category and amount required' });
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .insert({
      clinic_id: req.auth.clinicId, type: 'expense', category,
      amount, payment_method: paymentMethod || 'cash',
      description: description || category,
      description_ar: categoryAr || category,
      created_by: req.auth.userId,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ═══════════════════════════════════════════════════════════
// FINANCE TRANSACTIONS list (for ledger tab)
// ═══════════════════════════════════════════════════════════

app.get('/api/finance/transactions', ...guard, requireModule('finance'), async (req, res) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'database_unavailable' });
  const { month, limit: lim = 50 } = req.query;
  let query = supabaseAdmin.from('transactions').select('*')
    .eq('clinic_id', req.auth.clinicId)
    .order('created_at', { ascending: false })
    .limit(Number(lim));
  if (month) {
    query = query.gte('created_at', `${month}-01T00:00:00Z`).lte('created_at', `${month}-31T23:59:59Z`);
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

// ═══════════════════════════════════════════════════════════
// ROOMS routes
// ═══════════════════════════════════════════════════════════

app.get('/api/rooms', ...guard, async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { data, error } = await supabaseAdmin
    .from('rooms').select('*').eq('clinic_id', req.auth.clinicId).eq('is_active', true).order('name');
  if (error) {
    if (error.message?.includes('does not exist')) return res.json([]);
    return res.status(500).json({ error: error.message });
  }
  res.json(data ?? []);
});

app.post('/api/rooms', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, number, type, color, floor } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });
  const { data, error } = await supabaseAdmin
    .from('rooms')
    .insert({
      clinic_id: req.auth.clinicId, name, name_ar: nameAr || '', number: number || '',
      type, status: 'available', color: color || '#6366f1', floor: floor || null, is_active: true,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/rooms/:id', ...guard, requireRole('admin', 'super_admin', 'reception'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, status, currentPatientId, currentVisitId, isActive, color } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (name !== undefined)             updates.name = name;
  if (nameAr !== undefined)           updates.name_ar = nameAr;
  if (status !== undefined)           updates.status = status;
  if (currentPatientId !== undefined) updates.current_patient_id = currentPatientId;
  if (currentVisitId !== undefined)   updates.current_visit_id = currentVisitId;
  if (isActive !== undefined)         updates.is_active = isActive;
  if (color !== undefined)            updates.color = color;
  const { data, error } = await supabaseAdmin
    .from('rooms').update(updates).eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/rooms/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin
    .from('rooms').update({ is_active: false }).eq('id', req.params.id).eq('clinic_id', req.auth.clinicId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// INVENTORY routes
// ═══════════════════════════════════════════════════════════

app.get('/api/inventory', ...guard, requireModule('inventory'), async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { data, error } = await supabaseAdmin
    .from('products').select('*').eq('clinic_id', req.auth.clinicId).eq('is_active', true).order('name');
  if (error) {
    if (error.message?.includes('does not exist')) return res.json([]);
    return res.status(500).json({ error: error.message });
  }
  res.json(data ?? []);
});

app.post('/api/inventory', ...guard, requireModule('inventory'), requireRole('admin', 'reception'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, category, unit, minStock, currentStock, unitPrice, expiryDate, barcode, supplier } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert({
      clinic_id: req.auth.clinicId, name, name_ar: nameAr || '', category: category || 'medication',
      unit: unit || 'piece', min_stock: minStock || 0, current_stock: currentStock || 0,
      unit_price: unitPrice || 0, expiry_date: expiryDate || null,
      barcode: barcode || null, supplier: supplier || null, is_active: true,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/inventory/:id', ...guard, requireModule('inventory'), requireRole('admin', 'reception'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const body = req.body;
  const updates = {};
  if (body.name !== undefined)         updates.name = body.name;
  if (body.nameAr !== undefined)       updates.name_ar = body.nameAr;
  if (body.category !== undefined)     updates.category = body.category;
  if (body.unit !== undefined)         updates.unit = body.unit;
  if (body.minStock !== undefined)     updates.min_stock = body.minStock;
  if (body.currentStock !== undefined) updates.current_stock = body.currentStock;
  if (body.unitPrice !== undefined)    updates.unit_price = body.unitPrice;
  if (body.expiryDate !== undefined)   updates.expiry_date = body.expiryDate;
  if (body.isActive !== undefined)     updates.is_active = body.isActive;
  const { data, error } = await supabaseAdmin
    .from('products').update(updates).eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// INSURANCE routes
// ═══════════════════════════════════════════════════════════

app.get('/api/insurance/companies', ...guard, requireModule('insurance'), async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { data, error } = await supabaseAdmin
    .from('insurance_companies').select('*').eq('is_active', true).order('name');
  if (error) {
    if (error.message?.includes('does not exist')) return res.json([]);
    return res.status(500).json({ error: error.message });
  }
  res.json(data ?? []);
});

app.post('/api/insurance/companies', ...guard, requireModule('insurance'), requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, contactPhone, contactEmail, address, coverageTypes } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabaseAdmin
    .from('insurance_companies')
    .insert({
      name, name_ar: nameAr || '', contact_phone: contactPhone || null,
      contact_email: contactEmail || null, address: address || null,
      coverage_types: coverageTypes || [], is_active: true,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.get('/api/insurance/contracts', ...guard, requireModule('insurance'), async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { patientId } = req.query;
  let query = supabaseAdmin.from('contracts').select('*, insurance_companies(*)');
  if (patientId) query = query.eq('patient_id', patientId);
  const { data, error } = await query;
  if (error) {
    if (error.message?.includes('does not exist')) return res.json([]);
    return res.status(500).json({ error: error.message });
  }
  res.json(data ?? []);
});

app.post('/api/insurance/contracts', ...guard, requireModule('insurance'), requireRole('admin', 'reception'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { patientId, companyId, policyNumber, coveragePercent, startDate, expiryDate } = req.body;
  if (!patientId || !companyId) return res.status(400).json({ error: 'patientId and companyId required' });
  const { data, error } = await supabaseAdmin
    .from('contracts')
    .insert({
      patient_id: patientId, insurance_company_id: companyId,
      policy_number: policyNumber || null, coverage_percent: coveragePercent || 80,
      start_date: startDate || null, expiry_date: expiryDate || null, is_active: true,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// ═══════════════════════════════════════════════════════════
// BRANCHES routes
// ═══════════════════════════════════════════════════════════

app.get('/api/branches', ...guard, async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { data, error } = await supabaseAdmin
    .from('branches').select('*').eq('clinic_id', req.auth.clinicId).eq('is_active', true).order('name');
  if (error) {
    if (error.message?.includes('does not exist')) return res.json([]);
    return res.status(500).json({ error: error.message });
  }
  res.json(data ?? []);
});

app.post('/api/branches', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, address, phone, city, isMain } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const { data, error } = await supabaseAdmin
    .from('branches')
    .insert({
      clinic_id: req.auth.clinicId, name, name_ar: nameAr || '', address: address || '',
      phone: phone || null, is_active: true,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/branches/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { name, nameAr, address, phone, isActive } = req.body;
  const updates = {};
  if (name !== undefined)     updates.name = name;
  if (nameAr !== undefined)   updates.name_ar = nameAr;
  if (address !== undefined)  updates.address = address;
  if (phone !== undefined)    updates.phone = phone;
  if (isActive !== undefined) updates.is_active = isActive;
  const { data, error } = await supabaseAdmin
    .from('branches').update(updates).eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/branches/:id', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin
    .from('branches').update({ is_active: false }).eq('id', req.params.id).eq('clinic_id', req.auth.clinicId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// FEEDBACK routes
// ═══════════════════════════════════════════════════════════

app.get('/api/feedback', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { data, error } = await supabaseAdmin
    .from('patient_feedback').select('*').eq('clinic_id', req.auth.clinicId)
    .order('created_at', { ascending: false });
  if (error) {
    if (error.message?.includes('does not exist')) return res.json([]);
    return res.status(500).json({ error: error.message });
  }
  res.json(data ?? []);
});

app.post('/api/feedback', async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { clinicId, patientId, doctorId, rating, comment, visitId } = req.body;
  if (!clinicId || !rating) return res.status(400).json({ error: 'clinicId and rating required' });
  const { data, error } = await supabaseAdmin
    .from('patient_feedback')
    .insert({
      clinic_id: clinicId, patient_id: patientId || null, doctor_id: doctorId || null,
      visit_id: visitId || null, rating, comment: comment || null,
    })
    .select().single();
  if (error) {
    if (error.message?.includes('does not exist')) return res.status(503).json({ error: 'table_not_ready' });
    return res.status(500).json({ error: error.message });
  }
  res.status(201).json(data);
});

// ═══════════════════════════════════════════════════════════
// TASKS routes
// ═══════════════════════════════════════════════════════════

app.get('/api/tasks', ...guard, async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { data, error } = await supabaseAdmin
    .from('tasks').select('*').eq('clinic_id', req.auth.clinicId)
    .order('created_at', { ascending: false });
  if (error) {
    if (error.message?.includes('does not exist')) return res.json([]);
    return res.status(500).json({ error: error.message });
  }
  res.json(data ?? []);
});

app.post('/api/tasks', ...guard, async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { title, titleAr, description, priority, assignedTo, dueDate, patientId } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      clinic_id: req.auth.clinicId, created_by: req.auth.userId,
      title, title_ar: titleAr || '', description: description || null,
      priority: priority || 'normal', assigned_to: assignedTo || null,
      due_date: dueDate || null, patient_id: patientId || null, status: 'pending',
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

app.patch('/api/tasks/:id', ...guard, async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { status, title, priority, dueDate, assignedTo } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (status !== undefined)     updates.status = status;
  if (title !== undefined)      updates.title = title;
  if (priority !== undefined)   updates.priority = priority;
  if (dueDate !== undefined)    updates.due_date = dueDate;
  if (assignedTo !== undefined) updates.assigned_to = assignedTo;
  const { data, error } = await supabaseAdmin
    .from('tasks').update(updates).eq('id', req.params.id).eq('clinic_id', req.auth.clinicId).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/tasks/:id', ...guard, async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { error } = await supabaseAdmin
    .from('tasks').delete().eq('id', req.params.id).eq('clinic_id', req.auth.clinicId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
// HR / ATTENDANCE routes
// ═══════════════════════════════════════════════════════════

app.get('/api/hr/staff', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { data, error } = await supabaseAdmin
    .from('users').select('id, name, name_ar, role, email, is_active, created_at, specialty_id')
    .eq('clinic_id', req.auth.clinicId).order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

app.get('/api/hr/attendance', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.json([]);
  const { userId, month } = req.query;
  let query = supabaseAdmin.from('attendance').select('*')
    .eq('clinic_id', req.auth.clinicId).order('check_in', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  if (month) query = query.gte('check_in', `${month}-01T00:00:00Z`).lte('check_in', `${month}-31T23:59:59Z`);
  const { data, error } = await query;
  if (error) {
    if (error.message?.includes('does not exist')) return res.json([]);
    return res.status(500).json({ error: error.message });
  }
  res.json(data ?? []);
});

app.post('/api/hr/attendance', ...guard, async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const { action } = req.body;
  const now = new Date().toISOString();
  if (action === 'check_in') {
    const { data, error } = await supabaseAdmin
      .from('attendance')
      .insert({ clinic_id: req.auth.clinicId, user_id: req.auth.userId, check_in: now })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  } else if (action === 'check_out') {
    const { data: existing } = await supabaseAdmin.from('attendance')
      .select('id').eq('user_id', req.auth.userId).is('check_out', null)
      .order('check_in', { ascending: false }).limit(1).single();
    if (!existing) return res.status(404).json({ error: 'No open check-in found' });
    const { data, error } = await supabaseAdmin.from('attendance')
      .update({ check_out: now }).eq('id', existing.id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  res.status(400).json({ error: 'action must be check_in or check_out' });
});

// ═══════════════════════════════════════════════════════════
// CLINIC SETTINGS routes
// ═══════════════════════════════════════════════════════════

app.get('/api/clinic-settings', ...guard, async (req, res) => {
  if (!supabaseReady) return res.json(null);
  const { data, error } = await supabaseAdmin
    .from('clinic_settings').select('*').eq('clinic_id', req.auth.clinicId).maybeSingle();
  if (error) {
    if (error.message?.includes('does not exist')) return res.json(null);
    return res.status(500).json({ error: error.message });
  }
  res.json(data || null);
});

app.put('/api/clinic-settings', ...guard, requireRole('admin', 'super_admin'), async (req, res) => {
  if (!supabaseReady) return res.status(503).json({ error: 'database_unavailable' });
  const payload = { clinic_id: req.auth.clinicId, ...req.body, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin
    .from('clinic_settings').upsert(payload, { onConflict: 'clinic_id' }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ═══════════════════════════════════════════════════════════
// Static + SPA fallback
// ═══════════════════════════════════════════════════════════
app.use(express.static(path.join(__dirname, 'dist')));

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ── Startup env var validation ─────────────────────────────────
const _IS_PROD = process.env.NODE_ENV === 'production';
const _REQUIRED_PROD_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PAYMENT_WEBHOOK_SECRET', 'OPENAI_API_KEY'];
const _missingVars = _REQUIRED_PROD_VARS.filter(v => !process.env[v]);
if (_IS_PROD && _missingVars.length > 0) {
  console.error(`[STARTUP] Missing required production env vars: ${_missingVars.join(', ')}. Server may be insecure or degraded.`);
} else if (!_IS_PROD && _missingVars.length > 0) {
  console.warn(`[STARTUP] Dev mode — missing optional env vars: ${_missingVars.join(', ')}`);
}

// ── Clinic Automation Engine event receiver ───────────────────────────────────
// Frontend fires events here after local store mutations; we dispatch WhatsApp
// notifications via the existing notifyQueueEvent / notifyNearTurnPositions.
// Auth is soft (tryAuthenticate): works with or without Supabase.
const _VALID_CLINIC_EVENTS = new Set([
  'booking_created', 'patient_checked_in', 'queue_updated',
  'patient_turn_near', 'patient_turn_now', 'no_show',
]);
app.post('/api/clinic-event', tryAuthenticate, async (req, res) => {
  const { event, patientId, doctorId, clinicId, data = {} } = req.body || {};
  if (!event || !patientId || !clinicId || !_VALID_CLINIC_EVENTS.has(event)) {
    return res.status(400).json({ error: 'invalid_event' });
  }
  res.json({ ok: true }); // respond immediately; notifications are async
  setImmediate(async () => {
    try {
      const phone = await getPatientPhone(patientId);
      if (phone) await notifyQueueEvent(event, patientId, phone, clinicId, { ...data, doctorId });
      if (doctorId && (event === 'patient_turn_now' || event === 'patient_checked_in' || event === 'no_show')) {
        await notifyNearTurnPositions(doctorId, clinicId);
      }
    } catch (e) {
      console.error('[clinic-event]', e?.message);
    }
  });
});

// ── Campaign batch sender ─────────────────────────────────────────────────────
// Frontend sends resolved { phone, message } list; server fires WhatsApp delivery.
// Responds 200 immediately; sends in background with 100 ms inter-message delay
// to avoid rate-limiting. Capped at 500 messages per call for safety.
const CAMPAIGN_BATCH_CAP = 500;
const CAMPAIGN_MSG_DELAY = 100; // ms between sends

app.post('/api/campaigns/send-batch', tryAuthenticate, async (req, res) => {
  const { messages, clinicId } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }
  const batch = messages.slice(0, CAMPAIGN_BATCH_CAP);
  res.json({ queued: batch.length });

  setImmediate(async () => {
    let sent = 0, failed = 0;
    for (const { phone, message } of batch) {
      if (!phone || !message) { failed++; continue; }
      try {
        await sendWhatsAppMessage(String(phone), String(message), clinicId);
        sent++;
      } catch {
        failed++;
      }
      if (CAMPAIGN_MSG_DELAY > 0) await new Promise(r => setTimeout(r, CAMPAIGN_MSG_DELAY));
    }
    console.log(`[campaign batch] sent=${sent} failed=${failed} clinic=${clinicId}`);
  });
});

// ─── Installment WhatsApp Reminders ──────────────────────────────────────────
app.post('/api/installments/send-reminder', tryAuthenticate, async (req, res) => {
  const { phone, message, clinicId } = req.body || {};
  if (!phone || !message) {
    return res.status(400).json({ error: 'phone and message are required' });
  }
  try {
    await sendWhatsAppMessage(String(phone), String(message), clinicId);
    res.json({ success: true });
  } catch (err) {
    console.error('[installment reminder]', err);
    res.status(500).json({ error: 'Failed to send WhatsApp reminder' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});
