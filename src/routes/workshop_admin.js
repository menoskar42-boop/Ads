// Car workshop back-office.
//
// The shape follows src/routes/furniture_admin.js: a session guard that also
// confirms the page_type, flag-aware navigation, and every optional section
// gated by the same Set the sidebar reads — so hiding a section closes its URL
// too rather than merely removing the link.
'use strict';

const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { ref } = require('../lib/tenant_scope');
const payVault = require('../lib/pay_vault');
const workshopVault = require('../lib/workshop_vault');
const {
  sendWorkshopMessage,
  deliveryFromProvider,
  DELIVERY_STATUS_ORDER,
} = require('../lib/workshop_messaging');
const { loadPaySettings, gatewayReady } = require('../lib/gateways');
const { FLAGS, OPTIONAL_KEYS, getFlags, saveFlags, localized } = require('../workshop/flags');
const J = require('../workshop/jobs');
const {
  INSPECTION_STATUSES,
  QUALITY_STATUSES,
  ensureJobAccess,
  ensureInspection,
  ensureQuality,
  qualityReady,
  reservationAvailable,
  logActivity,
  WORKSHOP_ROLE_LABELS,
  MANAGEMENT_ROLES,
  normalizeWorkshopRole,
  workshopCan,
} = require('../workshop/operations');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const int = (v, d = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const text = (v, max = 200) => { const s = String(v == null ? '' : v).trim().slice(0, max); return s || null; };
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const phoneDigits = (v) => String(v || '').replace(/[^\d]/g, '').slice(0, 20);
const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
const DEFAULT_REMINDER_LEAD_DAYS = 7;
const DEFAULT_REMINDER_LEAD_KM = 500;
const CRM_LEAD_STAGES = ['new', 'contacted', 'qualified', 'booked', 'won', 'lost'];
const CRM_LEAD_STAGE_LABELS = {
  new: 'جديد', contacted: 'تم التواصل', qualified: 'مهتم', booked: 'حجز موعد',
  won: 'تم التحويل', lost: 'غير مهتم',
};
const CRM_PRIORITIES = ['low', 'normal', 'high'];
const CRM_PRIORITY_LABELS = { low: 'منخفضة', normal: 'عادية', high: 'عالية' };
const CRM_SEGMENTS = ['new', 'regular', 'vip', 'inactive'];
const CRM_SEGMENT_LABELS = { new: 'عميل جديد', regular: 'منتظم', vip: 'مميز', inactive: 'غير نشط' };
const CRM_LIFECYCLES = ['active', 'at_risk', 'lost'];
const CRM_LIFECYCLE_LABELS = { active: 'نشط', at_risk: 'معرّض للانقطاع', lost: 'منقطع' };
const CAMPAIGN_SEGMENTS = ['all', 'inactive', 'due', 'vip', 'at_risk'];
const CAMPAIGN_SEGMENT_LABELS = {
  all: 'كل العملاء الموافقين',
  inactive: 'العملاء غير النشطين',
  due: 'المستحقون للمتابعة',
  vip: 'العملاء المميزون',
  at_risk: 'المعرضون للانقطاع',
};
const WORKSHOP_SECTION_PERMISSIONS = {
  board: 'view_board',
  appointments: 'view_appointments',
  customers: 'view_customers',
  crm: 'view_crm',
  vehicles: 'view_vehicles',
  jobs: 'view_jobs',
  change_orders: 'view_change_orders',
  floor: 'view_floor',
  communications: 'view_communications',
  warranty_claims: 'view_warranty_claims',
  purchasing: 'view_purchasing',
  parts: 'view_parts',
  reminders: 'view_reminders',
  technicians: 'view_technicians',
  invoices: 'view_invoices',
  expenses: 'view_expenses',
  reports: 'view_reports',
  warranty: 'view_warranty',
};

function keepWorkshopSecret(current, typed, clear) {
  if (clear === '1') return null;
  const value = String(typed || '').trim();
  if (value) return workshopVault.encrypt(value);
  return current || null;
}

async function loadWorkshopMessagingConfig(companyId) {
  const row = (await pool.query(
    'SELECT * FROM workshop_message_settings WHERE company_id=$1', [companyId]
  )).rows[0];
  if (!row) return null;
  return {
    ...row,
    accountSid: workshopVault.read(row.twilio_account_sid_enc, null),
    authToken: workshopVault.read(row.twilio_auth_token_enc, null),
    metaAccessToken: workshopVault.read(row.meta_access_token_enc, null),
    metaAppSecret: workshopVault.read(row.meta_app_secret_enc, null),
    metaVerifyToken: workshopVault.read(row.meta_verify_token_enc, null),
  };
}

function workshopMessagingView(row) {
  const source = row || {};
  return {
    active: Boolean(source.active),
    sms_provider: source.sms_provider || 'none',
    whatsapp_provider: source.whatsapp_provider || 'none',
    twilio_sms_from: source.twilio_sms_from || '',
    twilio_whatsapp_from: source.twilio_whatsapp_from || '',
    meta_phone_number_id: source.meta_phone_number_id || '',
    twilio_account_sid_set: Boolean(source.twilio_account_sid_enc),
    twilio_auth_token_set: Boolean(source.twilio_auth_token_enc),
    meta_access_token_set: Boolean(source.meta_access_token_enc),
    meta_app_secret_set: Boolean(source.meta_app_secret_enc),
    meta_verify_token_set: Boolean(source.meta_verify_token_enc),
  };
}

function publicOrigin(req) {
  const configured = String(process.env.PUBLIC_BASE_DOMAINS || process.env.PUBLIC_BASE_DOMAIN || '')
    .split(',').map((value) => value.trim()).find(Boolean);
  if (configured) {
    return (configured.startsWith('http://') || configured.startsWith('https://')
      ? configured : `https://${configured}`).replace(/\/+$/, '');
  }
  if (!req) return '';
  const forwarded = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  return `${forwarded || req.protocol || 'https'}://${req.get('host')}`.replace(/\/+$/, '');
}

function workshopWebhookUrl(companyId, provider, req) {
  const origin = publicOrigin(req);
  return origin ? `${origin}/workshop/webhooks/${provider}/${encodeURIComponent(companyId)}` : null;
}

function safeSignatureEqual(expected, received) {
  const left = Buffer.from(String(expected || ''));
  const right = Buffer.from(String(received || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function twilioSignatureValid(req, authToken) {
  const received = req.get('x-twilio-signature');
  if (!received || !authToken) return false;
  const url = `${publicOrigin(req)}${req.originalUrl}`;
  const params = Object.keys(req.body || {}).sort().map((key) => {
    const value = req.body[key];
    return key + (Array.isArray(value) ? value.join(',') : String(value == null ? '' : value));
  }).join('');
  const expected = crypto.createHmac('sha1', authToken).update(url + params).digest('base64');
  return safeSignatureEqual(expected, received);
}

function metaSignatureValid(req, appSecret) {
  const received = req.get('x-hub-signature-256');
  if (!received || !appSecret || !/^sha256=[a-f0-9]+$/i.test(received)) return false;
  const payload = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(payload).digest('hex');
  return safeSignatureEqual(expected, received);
}

async function updateWorkshopDelivery(companyId, providerMessageId, provider, providerStatus, providerError) {
  const mapped = deliveryFromProvider(provider, providerStatus);
  if (!mapped || !providerMessageId) return { updated: false, reason: 'ignored' };
  const current = (await pool.query(
    `SELECT id, job_id, channel, status, provider_status, attempt_count
       FROM workshop_messages
      WHERE company_id=$1 AND provider_message_id=$2
      ORDER BY id DESC LIMIT 1`,
    [companyId, String(providerMessageId).slice(0, 250)]
  )).rows[0];
  if (!current) return { updated: false, reason: 'unknown_message' };
  if (provider === 'meta' && current.channel !== 'whatsapp') {
    return { updated: false, reason: 'channel_mismatch' };
  }

  const currentRank = DELIVERY_STATUS_ORDER[current.status] == null
    ? DELIVERY_STATUS_ORDER.sent : DELIVERY_STATUS_ORDER[current.status];
  const incomingRank = mapped.status
    ? DELIVERY_STATUS_ORDER[mapped.status] : currentRank;
  if (incomingRank < currentRank) return { updated: false, reason: 'stale' };

  const nextStatus = mapped.status || current.status;
  const failure = nextStatus === 'failed' ? text(providerError, 500) : null;
  const changed = (await pool.query(
    `UPDATE workshop_messages
        SET provider_status=$1,
            status=$2,
            error=CASE WHEN $2='failed' THEN $3 ELSE NULL END,
            delivered_at=CASE WHEN $2='delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
            failed_at=CASE WHEN $2='failed' THEN COALESCE(failed_at, now()) ELSE failed_at END,
            delivery_updated_at=now(),
            next_retry_at=CASE
              WHEN $2='failed' AND COALESCE(attempt_count,0) < 5
              THEN now() + INTERVAL '5 minutes'
              ELSE next_retry_at
            END
      WHERE id=$4 AND company_id=$5
        AND CASE status
          WHEN 'prepared' THEN 0
          WHEN 'queued' THEN 1
          WHEN 'sent' THEN 2
          WHEN 'failed' THEN 3
          WHEN 'delivered' THEN 4
          ELSE 2
        END <= $6
      RETURNING id, job_id, status`,
    [mapped.providerStatus, nextStatus, failure, current.id, companyId, incomingRank]
  )).rows[0];
  if (!changed) return { updated: false, reason: 'stale' };
  if (changed && changed.status !== current.status) {
    await logActivity(
      pool, companyId, changed.job_id,
      nextStatus === 'delivered' ? 'تم تأكيد وصول رسالة العميل من المزود'
        : nextStatus === 'failed' ? 'فشل وصول رسالة العميل بحسب المزود'
          : 'حدّث المزود حالة رسالة العميل',
      `${provider}: ${mapped.providerStatus}`
    );
  }
  return { updated: Boolean(changed), status: nextStatus };
}

// Provider callbacks are intentionally before the authenticated admin router:
// Twilio and Meta call these endpoints server-to-server, without a workshop
// session. The company id is only a lookup hint; the provider signature and
// stored account identity are the actual authorization checks.
router.get('/webhooks/meta/:companyId', async (req, res) => {
  const companyId = int(req.params.companyId);
  const config = companyId ? await loadWorkshopMessagingConfig(companyId) : null;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (!config || mode !== 'subscribe' || !config.metaVerifyToken
      || !safeSignatureEqual(config.metaVerifyToken, token)) {
    return res.status(403).send('forbidden');
  }
  return res.type('text/plain').send(String(challenge || '').slice(0, 200));
});

router.post('/webhooks/twilio/:companyId', async (req, res) => {
  try {
    const companyId = int(req.params.companyId);
    const config = companyId ? await loadWorkshopMessagingConfig(companyId) : null;
    const accountSid = String(req.body && req.body.AccountSid || '');
    if (!config || !config.accountSid || accountSid !== config.accountSid
        || !twilioSignatureValid(req, config.authToken)) {
      return res.status(403).send('forbidden');
    }
    const messageId = req.body.MessageSid || req.body.SmsSid;
    const status = req.body.MessageStatus || req.body.SmsStatus;
    const error = req.body.ErrorMessage || req.body.ErrorCode || null;
    await updateWorkshopDelivery(companyId, messageId, 'twilio', status, error);
    return res.type('text/plain').send('ok');
  } catch (e) {
    console.error('[workshop twilio callback]', e.message);
    return res.status(500).send('temporary failure');
  }
});

router.post('/webhooks/meta/:companyId', async (req, res) => {
  try {
    const companyId = int(req.params.companyId);
    const config = companyId ? await loadWorkshopMessagingConfig(companyId) : null;
    if (!config || !metaSignatureValid(req, config.metaAppSecret)) {
      return res.status(403).send('forbidden');
    }
    const entries = Array.isArray(req.body && req.body.entry) ? req.body.entry : [];
    let accepted = false;
    for (const entry of entries) {
      for (const change of (Array.isArray(entry.changes) ? entry.changes : [])) {
        const value = change && change.value;
        if (!value || !config.metaPhoneNumberId
          || String(value.metadata && value.metadata.phone_number_id || '') !== String(config.metaPhoneNumberId)) {
          continue;
        }
        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const item of statuses) {
          const error = Array.isArray(item.errors)
            ? item.errors.map((one) => one.title || one.message || one.code).filter(Boolean).join('; ')
            : null;
          await updateWorkshopDelivery(companyId, item.id, 'meta', item.status, error);
          accepted = true;
        }
      }
    }
    return res.type('text/plain').send(accepted ? 'ok' : 'ignored');
  } catch (e) {
    console.error('[workshop meta callback]', e.message);
    return res.status(500).send('temporary failure');
  }
});

async function deliverWorkshopMessage(companyId, messageId, force = false) {
  const claimed = (await pool.query(
    `UPDATE workshop_messages
        SET status='queued', attempt_count=COALESCE(attempt_count,0)+1,
            last_attempt_at=now(), error=NULL
      WHERE id=$1 AND company_id=$2
        AND status IN ('prepared','failed')
        AND COALESCE(attempt_count,0) < 5
        AND ($3 OR next_retry_at IS NULL OR next_retry_at <= now())
      RETURNING *`,
    [messageId, companyId, force]
  )).rows[0];
  if (!claimed) return { ok: false, error: 'message is already sending, sent, or has reached the retry limit' };

  const config = await loadWorkshopMessagingConfig(companyId);
  if (config) config.statusCallbackUrl = workshopWebhookUrl(companyId, 'twilio');
  const result = await sendWorkshopMessage(config, claimed.channel, claimed.recipient, claimed.body);
  const nextRetry = result.ok || Number(claimed.attempt_count) >= 5
    ? null : new Date(Date.now() + 5 * 60 * 1000);
  await pool.query(
    `UPDATE workshop_messages
        SET status=$1, sent_at=CASE WHEN $1='sent' THEN now() ELSE NULL END,
            provider_message_id=$2, provider_status=$3, error=$4, next_retry_at=$5
      WHERE id=$6 AND company_id=$7`,
    [result.ok ? 'sent' : 'failed', result.providerMessageId || null,
      result.providerStatus || null, result.ok ? null : result.error, nextRetry, messageId, companyId]
  );
  if (result.ok) {
    await logActivity(pool, companyId, claimed.job_id,
      `تم إرسال رسالة ${claimed.channel === 'sms' ? 'SMS' : 'WhatsApp'} للعميل`);
  }
  return result;
}

function serviceReminderBody(reminder) {
  const triggers = [];
  if (reminder.due_on) {
    triggers.push(`قبل أو في ${new Date(reminder.due_on).toLocaleDateString('ar-EG')}`);
  }
  if (reminder.due_odometer != null) {
    triggers.push(`عند ${Number(reminder.due_odometer).toLocaleString('ar-EG')} كم`);
  }
  const when = triggers.length ? ` (${triggers.join(' أو ')})` : '';
  return `تذكير صيانة لسيارتك ${reminder.plate || ''}${when}. ` +
    'نرجو التواصل مع الورشة لحجز الموعد المناسب.';
}

function reminderChannel(reminder) {
  const hasWhatsapp = phoneDigits(reminder.customer_whatsapp).length > 0;
  const hasSms = phoneDigits(reminder.customer_phone).length > 0;
  if (reminder.whatsapp_provider !== 'none' && hasWhatsapp) return 'whatsapp';
  if (reminder.sms_provider !== 'none' && hasSms) return 'sms';
  return hasWhatsapp ? 'whatsapp' : 'sms';
}

async function queueServiceReminderMessages({
  db = pool,
  deliver = deliverWorkshopMessage,
  activity = logActivity,
  runLog = true,
} = {}) {
  const candidates = (await db.query(
    `SELECT r.id, r.company_id, r.vehicle_id, r.job_id, v.customer_id,
            r.due_on, r.due_odometer, v.plate, v.odometer,
            c.phone AS customer_phone, c.whatsapp AS customer_whatsapp,
            COALESCE(ws.reminder_lead_days, ${DEFAULT_REMINDER_LEAD_DAYS}) AS reminder_lead_days,
            COALESCE(ws.reminder_lead_km, ${DEFAULT_REMINDER_LEAD_KM}) AS reminder_lead_km,
            COALESCE(ms.active, false) AS messaging_active,
            COALESCE(ms.sms_provider, 'none') AS sms_provider,
            COALESCE(ms.whatsapp_provider, 'none') AS whatsapp_provider
       FROM workshop_reminders r
       JOIN workshop_vehicles v ON v.id=r.vehicle_id AND v.company_id=r.company_id
       JOIN workshop_customers c ON c.id=v.customer_id AND c.company_id=r.company_id
       LEFT JOIN workshop_settings ws ON ws.company_id=r.company_id
       LEFT JOIN workshop_message_settings ms ON ms.company_id=r.company_id
      WHERE r.status='open'
        AND r.reminder_notified_at IS NULL
        AND (
          length(regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g')) > 0
          OR length(regexp_replace(COALESCE(c.whatsapp, ''), '[^0-9]', '', 'g')) > 0
        )
        AND NOT EXISTS (
          SELECT 1 FROM workshop_flags wf
           WHERE wf.company_id=r.company_id
             AND wf.flag_key='reminders' AND wf.enabled=false
        )
        AND (
          r.due_on BETWEEN CURRENT_DATE
            AND CURRENT_DATE + COALESCE(ws.reminder_lead_days, ${DEFAULT_REMINDER_LEAD_DAYS})::int
          OR (r.due_odometer IS NOT NULL AND v.odometer IS NOT NULL
              AND r.due_odometer - v.odometer BETWEEN 0
                AND COALESCE(ws.reminder_lead_km, ${DEFAULT_REMINDER_LEAD_KM})::int)
        )
      ORDER BY r.company_id, r.id
      LIMIT 300`
  )).rows;

  const runStats = new Map();
  if (runLog) {
    const allCompanies = await db.query(
      `SELECT id FROM companies WHERE page_type='workshop' AND is_active=true`
    );
    const companyIds = [...new Set([
      ...allCompanies.rows.map((row) => Number(row.id)),
      ...candidates.map((row) => Number(row.company_id)),
    ].filter(Boolean))];
    for (const companyId of companyIds) {
      try {
        const run = (await db.query(
          `INSERT INTO workshop_reminder_runs (company_id, candidate_count)
           VALUES ($1,$2) RETURNING id`,
          [companyId, candidates.filter((row) => Number(row.company_id) === companyId).length]
        )).rows[0];
        if (run) runStats.set(companyId, { id: run.id, queued: 0, skipped: 0, failed: 0 });
      } catch (e) {
        console.error('[workshop reminder run log]', e.message);
      }
    }
  }

  const updateRun = (companyId, key) => {
    const stats = runStats.get(Number(companyId));
    if (stats) stats[key] += 1;
  };
  const finishRuns = async () => {
    for (const stats of runStats.values()) {
      try {
        await db.query(
          `UPDATE workshop_reminder_runs
              SET finished_at=now(), queued_count=$1, skipped_count=$2, failed_count=$3
            WHERE id=$4`,
          [stats.queued, stats.skipped, stats.failed, stats.id]
        );
      } catch (e) {
        console.error('[workshop reminder run finish]', e.message);
      }
    }
  };

  let queued = 0;
  for (const reminder of candidates) {
    const client = await db.connect();
    let messageId = null;
    try {
      await client.query('BEGIN');
      const claimed = (await client.query(
        `UPDATE workshop_reminders
            SET reminder_notified_at=now()
          WHERE id=$1 AND company_id=$2 AND status='open'
            AND reminder_notified_at IS NULL
          RETURNING id`,
        [reminder.id, reminder.company_id]
      )).rows[0];
      if (!claimed) {
        await client.query('ROLLBACK');
        updateRun(reminder.company_id, 'skipped');
        continue;
      }

      const channel = reminderChannel(reminder);
      const recipient = channel === 'whatsapp'
        ? (reminder.customer_whatsapp || reminder.customer_phone)
        : reminder.customer_phone;
      const inserted = (await client.query(
        `INSERT INTO workshop_messages
          (company_id, job_id, customer_id, channel, recipient, event_key, body)
         VALUES ($1,$2,$3,$4,$5,'service_reminder',$6)
         RETURNING id`,
        [reminder.company_id, reminder.job_id, reminder.customer_id, channel,
          phoneDigits(recipient), serviceReminderBody(reminder)]
      )).rows[0];
      if (!inserted) throw new Error('reminder message was not created');
      messageId = inserted.id;
      await client.query(
        `UPDATE workshop_reminders SET reminder_message_id=$1
          WHERE id=$2 AND company_id=$3`,
        [messageId, reminder.id, reminder.company_id]
      );
      await client.query('COMMIT');
      queued += 1;
      updateRun(reminder.company_id, 'queued');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) { /* best effort */ }
      console.error('[workshop reminder queue]', e.message);
      updateRun(reminder.company_id, 'failed');
      continue;
    } finally {
      client.release();
    }

    const providerConfigured = reminder.messaging_active
      && (reminder[`${reminderChannel(reminder)}_provider`] !== 'none');
    if (providerConfigured) {
      try {
        await deliver(reminder.company_id, messageId);
      } catch (e) {
        console.error('[workshop reminder delivery]', e.message);
      }
    }
    await activity(
      db, reminder.company_id, reminder.job_id,
      'service_reminder_queued',
      `تم تجهيز تذكير الصيانة للسيارة ${reminder.plate || ''}`
    );
  }
  await finishRuns();
  return queued;
}

// Failed deliveries are retried without needing an admin to keep the page
// open. The manual button remains available for an immediate retry.
const workshopRetryTimer = setInterval(async () => {
  try {
    const rows = (await pool.query(
      `SELECT id, company_id
         FROM workshop_messages
        WHERE status='failed' AND next_retry_at IS NOT NULL
          AND next_retry_at <= now() AND attempt_count < 5
        ORDER BY next_retry_at LIMIT 25`
    )).rows;
    for (const row of rows) await deliverWorkshopMessage(row.company_id, row.id);
  } catch (e) {
    console.error('[workshop message retry]', e.message);
  }
}, 60 * 1000);
if (workshopRetryTimer.unref) workshopRetryTimer.unref();

const workshopReminderTimer = setInterval(async () => {
  try { await queueServiceReminderMessages(); }
  catch (e) { console.error('[workshop reminder scheduler]', e.message); }
}, 5 * 60 * 1000);
if (workshopReminderTimer.unref) workshopReminderTimer.unref();
setTimeout(() => {
  queueServiceReminderMessages().catch((e) => console.error('[workshop reminder startup]', e.message));
}, 15 * 1000).unref();

async function loadWorkshopInvoiceRows(companyId, options = {}) {
  const params = [companyId];
  let where = "j.company_id=$1 AND j.status <> 'cancelled'";
  if (options.q) {
    params.push('%' + options.q + '%');
    where += ` AND (CAST(j.id AS TEXT) ILIKE $${params.length} OR v.plate ILIKE $${params.length}
                    OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
  }
  if (options.status && J.STATUSES.includes(options.status)) {
    params.push(options.status);
    where += ` AND j.status=$${params.length}`;
  }
  if (options.customerId) {
    params.push(options.customerId);
    where += ` AND j.customer_id=$${params.length}`;
  }
  if (options.days) {
    params.push(options.days);
    where += ` AND j.received_at >= CURRENT_DATE - ($${params.length} || ' days')::interval`;
  }
  const rows = await pool.query(
    `SELECT j.id, j.customer_id, j.status, j.paid, j.discount, j.tax_percent, j.received_at, j.delivered_at,
            v.plate, c.name AS customer_name, c.phone AS customer_phone,
            COALESCE((SELECT SUM(qty*unit_price) FROM workshop_job_parts WHERE job_id=j.id),0)::float AS parts_rev,
            COALESCE((SELECT SUM(qty*unit_cost)  FROM workshop_job_parts WHERE job_id=j.id),0)::float AS parts_cost,
            COALESCE((SELECT SUM(amount) FROM workshop_job_labour WHERE job_id=j.id),0)::float AS labour_rev
       FROM workshop_jobs j
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id
      WHERE ${where}
      ORDER BY j.received_at DESC LIMIT 1000`, params);
  return rows.rows.map((r) => ({
    ...r,
    totals: J.jobTotals(r, [{ qty: 1, unit_price: r.parts_rev, unit_cost: r.parts_cost }],
      [{ amount: r.labour_rev }]),
  }));
}

function defaultWorkshopMessage(job, eventKey, portalPath) {
  const code = J.jobCode(job.id);
  const portal = portalPath ? `\nرابط المتابعة: ${portalPath}` : '';
  const labels = {
    received: `مرحبًا ${job.customer_name || 'بك'}، استلمنا سيارتك ${job.plate || ''} في ${job.company_name || 'الورشة'}، ورقم أمر الشغل ${code}.`,
    quoted: `تم تجهيز عرض السعر لأمر الشغل ${code} لسيارة ${job.plate || ''}. برجاء مراجعة التفاصيل والموافقة من الرابط.`,
    approved: `تم تسجيل موافقتك على أمر الشغل ${code}. سنرسل لك تحديثًا عند انتهاء العمل.`,
    in_progress: `بدأ فريق ${job.company_name || 'الورشة'} العمل على السيارة ${job.plate || ''} — أمر ${code}.`,
    done: `سيارتك ${job.plate || ''} جاهزة للمراجعة. تواصل معنا لترتيب الاستلام — أمر ${code}.`,
    delivered: `شكرًا لثقتك في ${job.company_name || 'الورشة'}. تم تسليم السيارة ${job.plate || ''}.`,
    change_order: `يوجد تعديل مطلوب على عرض السعر لأمر الشغل ${code}. برجاء مراجعة الرابط والموافقة قبل تنفيذ الإضافة.`,
  };
  return (labels[eventKey] || labels.received) + portal;
}

async function managerIdentity(req, companyId) {
  if (req.workshopUser && Number(req.workshopUser.company_id) === Number(companyId)
      && MANAGEMENT_ROLES.has(req.workshopRole)) {
    return { name: req.workshopUser.email, role: req.workshopRole };
  }
  const userId = req.session && int(req.session.companyUserId);
  if (!userId) return null;
  const user = (await pool.query(
    `SELECT email, role FROM company_users
      WHERE id=$1 AND company_id=$2`, [userId, companyId])).rows[0];
  const role = normalizeWorkshopRole(user && user.role);
  if (!user || !MANAGEMENT_ROLES.has(role)) return null;
  return { name: user.email, role };
}

function requireLogin(req, res, next) {
  if (req.session && req.session.companyId
      && (req.session.companyUserId || req.session.demoReadOnly)) return next();
  res.redirect('/company/login');
}

// Confirm the logged-in company really is a workshop before serving anything,
// so a shop owner cannot reach another product's admin by typing the URL.
async function requireWorkshop(req, res, next) {
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    const c = r.rows[0];
    if (!c || c.page_type !== 'workshop' || c.is_active === false) {
      return res.redirect('/company/login');
    }
    req.company = c;
    res.locals.company = c;

    const flags = await getFlags(pool, c.id);
    req.flags = flags;
    res.locals.flags = flags;
    const user = req.session && req.session.companyUserId
      ? (await pool.query(
        `SELECT id, company_id, email, role FROM company_users
          WHERE id=$1 AND company_id=$2`,
        [int(req.session.companyUserId), c.id]
      )).rows[0]
      : null;
    req.workshopUser = user || null;
    // Demo sessions intentionally have no company user and stay read-only.
    req.workshopRole = req.session.demoReadOnly
      ? 'demo'
      : normalizeWorkshopRole(user && user.role);
    const canWorkshop = (permission) => req.session.demoReadOnly
      ? String(permission || '').startsWith('view_')
      : workshopCan(req.workshopRole, permission);
    req.canWorkshop = canWorkshop;
    res.locals.workshopRole = req.workshopRole;
    res.locals.workshopRoleLabel = req.session.demoReadOnly
      ? 'عرض تجريبي للقراءة فقط'
      : (WORKSHOP_ROLE_LABELS[req.workshopRole] || WORKSHOP_ROLE_LABELS.reception);
    res.locals.canWorkshop = canWorkshop;
    res.locals.workshopNav = localized(FLAGS.filter((f) => flags.has(f.key)), res.locals.t)
      .filter((f) => canWorkshop(WORKSHOP_SECTION_PERMISSIONS[f.key] || 'view_dashboard'));

    const st = await pool.query('SELECT * FROM workshop_settings WHERE company_id = $1', [c.id]);
    req.settings = st.rows[0] || {};
    res.locals.settings = req.settings;

    // The bell number on every page: vehicles whose service is due. Computed,
    // never stored — a stale badge is worse than none. A failure here costs the
    // badge, not the page.
    if (flags.has('reminders')) {
      try {
        const d = await pool.query(
          `SELECT COUNT(*)::int AS n FROM workshop_reminders
            WHERE company_id=$1 AND status='open' AND due_on IS NOT NULL AND due_on <= CURRENT_DATE`,
          [c.id]
        );
        res.locals.dueCount = d.rows[0].n;
      } catch (e) { res.locals.dueCount = 0; }
    }
    next();
  } catch (e) {
    console.error('[workshop guard]', e.message);
    res.redirect('/company/login');
  }
}

// A section that is switched off must not be reachable by URL.
function requireFlag(key) {
  return (req, res, next) => (req.flags && req.flags.has(key)) ? next() : res.redirect('/workshop');
}

function requireWorkshopPermission(permission) {
  return (req, res, next) => {
    if (req.session && req.session.demoReadOnly && req.method === 'GET') return next();
    if (req.canWorkshop && req.canWorkshop(permission)) return next();
    return res.status(403).send(
      res.locals.t ? res.locals.t('wsh.err.role') : 'هذه العملية غير متاحة حسب دورك في الورشة.'
    );
  };
}

function requireAnyWorkshopPermission(...permissions) {
  return (req, res, next) => {
    if (req.session && req.session.demoReadOnly && req.method === 'GET') return next();
    if (req.canWorkshop && permissions.some((permission) => req.canWorkshop(permission))) return next();
    return res.status(403).send(
      res.locals.t ? res.locals.t('wsh.err.role') : 'هذه العملية غير متاحة حسب دورك في الورشة.'
    );
  };
}

router.use(requireLogin, requireWorkshop);

// ── Dashboard ────────────────────────────────────────────────────────────────
router.get('/', requireWorkshopPermission('view_dashboard'), async (req, res) => {
  const cid = req.company.id;
  const [open, promised, awaiting, dueRem, month, unpaid, low, appointmentsToday, recent] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int n FROM workshop_jobs WHERE company_id=$1 AND status = ANY($2)`,
      [cid, J.OPEN_STATUSES]),
    pool.query(`SELECT COUNT(*)::int n FROM workshop_jobs
                 WHERE company_id=$1 AND status = ANY($2) AND promised_at < now()`,
      [cid, J.OPEN_STATUSES]),
    pool.query(`SELECT COUNT(*)::int n FROM workshop_jobs
                 WHERE company_id=$1 AND status='quoted' AND approved_at IS NULL`, [cid]),
    pool.query(`SELECT COUNT(*)::int n FROM workshop_reminders
                 WHERE company_id=$1 AND status='open' AND due_on IS NOT NULL AND due_on <= CURRENT_DATE`, [cid]),
    pool.query(`SELECT COALESCE(SUM(amount),0)::float n FROM workshop_payments
                 WHERE company_id=$1 AND paid_at >= date_trunc('month', CURRENT_DATE)`, [cid]),
    pool.query(`SELECT COALESCE(SUM(GREATEST(0, t.total - j.paid)),0)::float n FROM workshop_jobs j
                 JOIN LATERAL (
                   SELECT COALESCE((SELECT SUM(qty*unit_price) FROM workshop_job_parts WHERE job_id=j.id),0)
                        + COALESCE((SELECT SUM(amount) FROM workshop_job_labour WHERE job_id=j.id),0)
                        - j.discount AS total
                 ) t ON true
                 WHERE j.company_id=$1 AND j.status <> 'cancelled'`, [cid]),
    pool.query(`SELECT COUNT(*)::int n FROM workshop_parts
                 WHERE company_id=$1 AND is_active AND min_qty > 0 AND qty <= min_qty`, [cid]),
    pool.query(`SELECT COUNT(*)::int n FROM workshop_appointments
                  WHERE company_id=$1 AND status IN ('booked','confirmed')
                    AND starts_at >= CURRENT_DATE
                    AND starts_at < CURRENT_DATE + interval '1 day'`, [cid]),
    pool.query(`SELECT j.*, v.plate, v.make, v.model, c.name AS customer_name
                  FROM workshop_jobs j
                  LEFT JOIN workshop_vehicles v ON v.id = j.vehicle_id
                  LEFT JOIN workshop_customers c ON c.id = j.customer_id
                 WHERE j.company_id=$1 ORDER BY j.received_at DESC LIMIT 8`, [cid]),
  ]);
  res.render('workshop_admin/dashboard', {
    title: req.t ? req.t('wsh.nav.dashboard') : 'Dashboard', tab: 'dashboard',
    stats: {
      open: open.rows[0].n, promised: promised.rows[0].n, awaiting: awaiting.rows[0].n,
       dueRem: dueRem.rows[0].n, appointmentsToday: appointmentsToday.rows[0].n,
       month: round2(month.rows[0].n),
      unpaid: round2(unpaid.rows[0].n), low: low.rows[0].n,
    },
    recent: recent.rows, J,
  });
});

// ── Operations board ──────────────────────────────────────────────────────────
router.get('/board', requireFlag('board'), requireWorkshopPermission('view_board'), async (req, res) => {
  const cid = req.company.id;
  const q = String(req.query.q || '').trim().slice(0, 80);
  const status = J.STATUSES.includes(String(req.query.status)) ? String(req.query.status) : '';
  const technician = int(req.query.technician);
  const due = ['overdue', 'today', 'all'].includes(String(req.query.due)) ? String(req.query.due) : 'all';
  const params = [cid];
  let where = "j.company_id=$1 AND j.status <> 'cancelled'";
  if (q) {
    params.push('%' + q + '%');
    where += ` AND (CAST(j.id AS TEXT) ILIKE $${params.length} OR v.plate ILIKE $${params.length}
                    OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length}
                    OR j.complaint ILIKE $${params.length})`;
  }
  if (status) { params.push(status); where += ` AND j.status=$${params.length}`; }
  if (technician) { params.push(technician); where += ` AND j.technician_id=$${params.length}`; }
  if (due === 'overdue') {
    where += " AND j.promised_at IS NOT NULL AND j.promised_at < now() AND j.status NOT IN ('delivered','cancelled')";
  } else if (due === 'today') {
    where += ' AND j.promised_at::date = CURRENT_DATE';
  }
  const [rows, technicians, lateJobs] = await Promise.all([
    pool.query(
    `SELECT j.id, j.status, j.complaint, j.promised_at, j.received_at,
            v.plate, v.make, v.model, c.name AS customer_name,
            t.name AS technician_name,
            COALESCE((SELECT SUM(qty*unit_price) FROM workshop_job_parts WHERE job_id=j.id),0)
              + COALESCE((SELECT SUM(amount) FROM workshop_job_labour WHERE job_id=j.id),0)
              - j.discount AS estimate_total,
            (SELECT COUNT(*)::int FROM workshop_inspection_items i
              WHERE i.job_id=j.id AND i.status IN ('attention','urgent')) AS findings
       FROM workshop_jobs j
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id
       LEFT JOIN workshop_technicians t ON t.id=j.technician_id
       WHERE ${where}
      ORDER BY COALESCE(j.promised_at, j.received_at), j.id`,
    params),
    pool.query(
      `SELECT id, name FROM workshop_technicians
        WHERE company_id=$1 AND is_active ORDER BY name`, [cid]),
    pool.query(
      `SELECT j.id, j.status, j.promised_at, v.plate, c.name AS customer_name, t.name AS technician_name,
              COUNT(*) OVER()::int AS total_late
         FROM workshop_jobs j
         LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
         LEFT JOIN workshop_customers c ON c.id=j.customer_id
         LEFT JOIN workshop_technicians t ON t.id=j.technician_id
        WHERE j.company_id=$1 AND j.status NOT IN ('delivered','cancelled')
          AND j.promised_at IS NOT NULL AND j.promised_at < now()
        ORDER BY j.promised_at ASC LIMIT 12`, [cid]),
  ]);
  const columns = J.FLOW.map((status) => ({
    status,
    jobs: rows.rows.filter((job) => job.status === status),
  }));
  res.render('workshop_admin/board', {
    title: 'لوحة التشغيل', tab: 'board', columns, J,
    technicians: technicians.rows, lateJobs: lateJobs.rows,
    q, status, technician: technician || '', due,
    today: new Date().toISOString().slice(0, 10),
  });
});

// ── Appointments ──────────────────────────────────────────────────────────────
router.get('/appointments', requireFlag('appointments'), requireWorkshopPermission('view_appointments'), async (req, res) => {
  const cid = req.company.id;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.day || ''))
    ? String(req.query.day) : new Date().toISOString().slice(0, 10);
  const [rows, vehicles] = await Promise.all([
    pool.query(
      `SELECT a.*, v.plate, v.make, v.model, c.name AS customer_name,
              c.phone AS customer_phone, j.id AS linked_job_id, j.status AS job_status
               ,(SELECT COUNT(*)::int FROM workshop_appointment_photos ap
                  WHERE ap.appointment_id=a.id AND ap.company_id=a.company_id) AS photo_count
         FROM workshop_appointments a
         LEFT JOIN workshop_vehicles v ON v.id=a.vehicle_id
         LEFT JOIN workshop_customers c ON c.id=a.customer_id
         LEFT JOIN workshop_jobs j ON j.id=a.job_id
        WHERE a.company_id=$1 AND a.starts_at::date=$2
        ORDER BY a.starts_at`,
      [cid, day]
    ),
    pool.query(
      `SELECT v.id, v.plate, v.make, v.model, c.name AS customer_name, v.customer_id
         FROM workshop_vehicles v
         LEFT JOIN workshop_customers c ON c.id=v.customer_id
        WHERE v.company_id=$1 AND v.is_active ORDER BY v.plate`,
      [cid]
    ),
  ]);
  const date = new Date(`${day}T12:00:00`);
  const previous = new Date(date); previous.setDate(date.getDate() - 1);
  const next = new Date(date); next.setDate(date.getDate() + 1);
  res.render('workshop_admin/appointments', {
    title: 'مواعيد الاستقبال', tab: 'appointments', appointments: rows.rows,
    vehicles: vehicles.rows, day,
    previous: previous.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10),
  });
});

router.post('/appointments', requireFlag('appointments'), requireWorkshopPermission('manage_appointments'), async (req, res) => {
  const b = req.body || {}, cid = req.company.id, vehicleId = int(b.vehicle_id);
  const starts = b.starts_at ? new Date(b.starts_at) : null;
  if (!vehicleId || !starts || isNaN(starts)) return res.redirect('/workshop/appointments');
  const vehicle = (await pool.query(
    'SELECT id, customer_id FROM workshop_vehicles WHERE id=$1 AND company_id=$2 AND is_active',
    [vehicleId, cid]
  )).rows[0];
  if (!vehicle) return res.redirect('/workshop/appointments');
  const ends = b.ends_at ? new Date(b.ends_at) : null;
  await pool.query(
    `INSERT INTO workshop_appointments
      (company_id, customer_id, vehicle_id, starts_at, ends_at, service_type, concern, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [cid, vehicle.customer_id, vehicle.id, starts, ends && !isNaN(ends) ? ends : null,
      text(b.service_type, 120), text(b.concern, 500), text(b.notes, 500)]
  );
  res.redirect('/workshop/appointments?day=' + starts.toISOString().slice(0, 10));
});

router.post('/appointments/:id/status', requireFlag('appointments'), requireWorkshopPermission('manage_appointments'), async (req, res) => {
  const allowed = ['booked', 'confirmed', 'arrived', 'no_show', 'cancelled'];
  const status = allowed.includes(String((req.body || {}).status)) ? String(req.body.status) : null;
  if (status) await pool.query(
    'UPDATE workshop_appointments SET status=$1, updated_at=now() WHERE id=$2 AND company_id=$3',
    [status, int(req.params.id), req.company.id]
  );
  res.redirect('/workshop/appointments?day=' + encodeURIComponent(String(req.query.day || new Date().toISOString().slice(0, 10))));
});

router.post('/appointments/:id/convert', requireFlag('appointments'), requireWorkshopPermission('manage_appointments'), async (req, res) => {
  const cid = req.company.id, appointmentId = int(req.params.id);
  const appointment = (await pool.query(
    `SELECT a.*, v.id AS safe_vehicle_id, v.customer_id AS safe_customer_id
       FROM workshop_appointments a
       JOIN workshop_vehicles v ON v.id=a.vehicle_id AND v.company_id=a.company_id
      WHERE a.id=$1 AND a.company_id=$2`, [appointmentId, cid]
  )).rows[0];
  if (!appointment || appointment.job_id) return res.redirect('/workshop/appointments');
  const created = await pool.query(
    `INSERT INTO workshop_jobs
      (company_id, vehicle_id, customer_id, complaint, promised_at, tax_percent)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [cid, appointment.safe_vehicle_id, appointment.safe_customer_id,
      appointment.concern || appointment.service_type || 'زيارة مجدولة',
      appointment.starts_at, num(req.settings.tax_percent, 0)]
  );
  const jobId = created.rows[0].id;
  const appointmentPhotos = (await pool.query(
    `SELECT image_url, caption FROM workshop_appointment_photos
      WHERE appointment_id=$1 AND company_id=$2 ORDER BY id`, [appointmentId, cid]
  )).rows;
  await Promise.all([
    pool.query(
      `UPDATE workshop_appointments SET job_id=$1, status='arrived', updated_at=now()
        WHERE id=$2 AND company_id=$3`, [jobId, appointmentId, cid]
    ),
    ensureJobAccess(pool, cid, jobId),
    ensureInspection(pool, cid, jobId),
    ensureQuality(pool, cid, jobId),
    ...appointmentPhotos.map((photo) => pool.query(
      `INSERT INTO workshop_job_photos (company_id, job_id, phase, image_url, caption)
       VALUES ($1,$2,'before',$3,$4)`, [cid, jobId, photo.image_url, photo.caption]
    )),
  ]);
  await logActivity(pool, cid, jobId, 'appointment_converted', 'تم تحويل الموعد إلى أمر شغل');
  res.redirect('/workshop/jobs/' + jobId);
});

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/settings', requireWorkshopPermission('view_settings'), async (req, res) => {
  const [messageRow, paymentRow, users, roleHistory, reminderRuns] = await Promise.all([
    pool.query('SELECT * FROM workshop_message_settings WHERE company_id=$1', [req.company.id]),
    loadPaySettings(pool, req.company.id),
    pool.query(
      'SELECT id, email, role, created_at FROM company_users WHERE company_id=$1 ORDER BY created_at, id',
      [req.company.id]
    ),
    pool.query(
      `SELECT h.*, COALESCE(u.email, h.email) AS current_email
         FROM workshop_role_history h
         LEFT JOIN company_users u ON u.id=h.user_id AND u.company_id=h.company_id
        WHERE h.company_id=$1
        ORDER BY h.created_at DESC, h.id DESC LIMIT 100`,
      [req.company.id]
    ),
    pool.query(
      `SELECT id, started_at, finished_at, candidate_count, queued_count, skipped_count, failed_count, error
         FROM workshop_reminder_runs
        WHERE company_id=$1
        ORDER BY started_at DESC, id DESC LIMIT 20`,
      [req.company.id]
    ),
  ]);
  const payment = Object.assign({}, paymentRow || { gateway: 'none', cod_enabled: true });
  payment.gateway_secret_set = Boolean(payment.gateway_secret_enc || payment.gateway_secret);
  payment.gateway_hmac_set = Boolean(payment.gateway_hmac_enc || payment.gateway_hmac);
  delete payment.gateway_secret; delete payment.gateway_secret_enc;
  delete payment.gateway_hmac; delete payment.gateway_hmac_enc;
  res.render('workshop_admin/settings', {
    title: res.locals.t('wsh.set.title'), tab: 'settings',
    FLAGS, OPTIONAL_KEYS, saved: req.query.saved === '1',
    messageSettings: workshopMessagingView(messageRow.rows[0]),
    payment, settingsError: req.query.err || '',
    users: users.rows,
    roleHistory: roleHistory.rows,
    reminderRuns: reminderRuns.rows,
    inviteLink: req.query.invite
      ? `${publicOrigin(req)}/company/workshop-invite/${encodeURIComponent(String(req.query.invite).slice(0, 200))}`
      : null,
    currentUserId: int(req.session.companyUserId),
    roleLabels: WORKSHOP_ROLE_LABELS,
    twilioWebhookUrl: workshopWebhookUrl(req.company.id, 'twilio', req),
    metaWebhookUrl: workshopWebhookUrl(req.company.id, 'meta', req),
  });
});

router.post('/settings/users/invite', requireWorkshopPermission('manage_settings'), async (req, res) => {
  const email = String(req.body && req.body.email || '').trim().toLowerCase();
  const role = normalizeWorkshopRole(req.body && req.body.role);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || !['manager', 'reception', 'technician'].includes(role)) {
    return res.redirect('/workshop/settings?err=invite_invalid');
  }
  const existing = (await pool.query(
    'SELECT id FROM company_users WHERE lower(email)=lower($1) LIMIT 1', [email]
  )).rows[0];
  if (existing) return res.redirect('/workshop/settings?err=invite_existing');

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE workshop_team_invitations
          SET accepted_at=now()
        WHERE company_id=$1 AND lower(email)=lower($2) AND accepted_at IS NULL`,
      [req.company.id, email]
    );
    await client.query(
      `INSERT INTO workshop_team_invitations
        (company_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,now() + interval '7 days')`,
      [req.company.id, email, role, tokenHash, int(req.session.companyUserId)]
    );
    await client.query('COMMIT');
    return res.redirect('/workshop/settings?saved=1&invite=' + encodeURIComponent(token));
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[workshop invite create]', e.message);
    return res.redirect('/workshop/settings?err=invite_save');
  } finally {
    client.release();
  }
});

router.post('/settings/users/:id/role', requireWorkshopPermission('manage_settings'), async (req, res) => {
  const id = int(req.params.id);
  const role = normalizeWorkshopRole(req.body && req.body.role);
  // A manager may delegate operational roles but cannot create another owner
  // or demote the account currently being used to administer the workshop.
  if (!id || !['manager', 'reception', 'technician'].includes(role)
      || id === int(req.session.companyUserId)) {
    return res.redirect('/workshop/settings?err=role_save');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = (await client.query(
      `SELECT id, email, role FROM company_users
        WHERE id=$1 AND company_id=$2 AND role NOT IN ('owner','admin')
        FOR UPDATE`,
      [id, req.company.id]
    )).rows[0];
    if (!current || current.role === role) {
      await client.query('ROLLBACK');
      return res.redirect(current ? '/workshop/settings?saved=1' : '/workshop/settings?err=role_save');
    }
    await client.query(
      `UPDATE company_users SET role=$1
        WHERE id=$2 AND company_id=$3 AND role NOT IN ('owner','admin')`,
      [role, id, req.company.id]
    );
    const actor = req.workshopUser && req.workshopUser.email
      ? req.workshopUser.email : 'إدارة الورشة';
    await client.query(
      `INSERT INTO workshop_role_history
        (company_id, user_id, email, from_role, to_role, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.company.id, current.id, current.email, current.role, role, actor]
    );
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[workshop role update]', e.message);
    return res.redirect('/workshop/settings?err=role_save');
  } finally {
    client.release();
  }
  res.redirect('/workshop/settings?saved=1');
});

router.post('/settings', requireWorkshopPermission('manage_settings'), async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const reminderDaysInput = String(b.reminder_lead_days == null ? '' : b.reminder_lead_days).trim();
  const reminderKmInput = String(b.reminder_lead_km == null ? '' : b.reminder_lead_km).trim();
  const reminderLeadDays = Number(reminderDaysInput);
  const reminderLeadKm = Number(reminderKmInput);
  if (!reminderDaysInput || !reminderKmInput
      || !Number.isInteger(reminderLeadDays) || reminderLeadDays < 0 || reminderLeadDays > 60
      || !Number.isInteger(reminderLeadKm) || reminderLeadKm < 0 || reminderLeadKm > 10000) {
    return res.redirect('/workshop/settings?err=reminder_invalid');
  }
  await pool.query(
    `INSERT INTO workshop_settings
       (company_id, business_name, address, phone, whatsapp, about, hours,
        tax_percent, labour_rate, service_km, service_months,
        reminder_lead_days, reminder_lead_km, booking_enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     ON CONFLICT (company_id) DO UPDATE SET
       business_name=EXCLUDED.business_name, address=EXCLUDED.address, phone=EXCLUDED.phone,
       whatsapp=EXCLUDED.whatsapp, about=EXCLUDED.about, hours=EXCLUDED.hours,
       tax_percent=EXCLUDED.tax_percent, labour_rate=EXCLUDED.labour_rate,
       service_km=EXCLUDED.service_km, service_months=EXCLUDED.service_months,
       reminder_lead_days=EXCLUDED.reminder_lead_days,
       reminder_lead_km=EXCLUDED.reminder_lead_km,
       booking_enabled=EXCLUDED.booking_enabled, updated_at=now()`,
    [cid, text(b.business_name, 120), text(b.address, 250), text(b.phone, 40), text(b.whatsapp, 40),
     text(b.about, 2000), text(b.hours, 120), Math.min(100, Math.max(0, num(b.tax_percent))),
     Math.max(0, num(b.labour_rate)), Math.max(0, int(b.service_km, 5000)),
     Math.max(0, int(b.service_months, 6)),
       reminderLeadDays,
       reminderLeadKm,
     /* خانة اختيار مش مختارة مابتتبعتش أصلاً في الفورم، فغيابها = مقفول.
      * لازم تتحسب من وجود الحقل نفسه — لو قريناها بـ`!== false` كانت
      * هتفضل مفتوحة على طول ومحدش يقدر يقفل. */
     b.booking_enabled === '1' || b.booking_enabled === 'on']
  );
  const wanted = Array.isArray(b.flags) ? b.flags : (b.flags ? [b.flags] : []);
  await saveFlags(pool, cid, wanted);
  res.redirect('/workshop/settings?saved=1');
});

router.post('/settings/messages', requireWorkshopPermission('manage_settings'), async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const current = (await pool.query(
    'SELECT * FROM workshop_message_settings WHERE company_id=$1', [cid]
  )).rows[0] || {};
  try {
    if (!workshopVault.configured()) {
      return res.redirect('/workshop/settings?err=secret_unavailable');
    }
    await pool.query(
      `INSERT INTO workshop_message_settings
        (company_id, active, sms_provider, whatsapp_provider,
         twilio_account_sid_enc, twilio_auth_token_enc, twilio_sms_from,
         twilio_whatsapp_from, meta_phone_number_id, meta_access_token_enc,
         meta_app_secret_enc, meta_verify_token_enc, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
       ON CONFLICT (company_id) DO UPDATE SET
         active=EXCLUDED.active, sms_provider=EXCLUDED.sms_provider,
         whatsapp_provider=EXCLUDED.whatsapp_provider,
         twilio_account_sid_enc=EXCLUDED.twilio_account_sid_enc,
         twilio_auth_token_enc=EXCLUDED.twilio_auth_token_enc,
         twilio_sms_from=EXCLUDED.twilio_sms_from,
         twilio_whatsapp_from=EXCLUDED.twilio_whatsapp_from,
         meta_phone_number_id=EXCLUDED.meta_phone_number_id,
         meta_access_token_enc=EXCLUDED.meta_access_token_enc,
          meta_app_secret_enc=EXCLUDED.meta_app_secret_enc,
          meta_verify_token_enc=EXCLUDED.meta_verify_token_enc,
         updated_at=now()`,
      [cid, b.active === '1',
        ['none', 'twilio'].includes(b.sms_provider) ? b.sms_provider : 'none',
        ['none', 'twilio', 'meta'].includes(b.whatsapp_provider) ? b.whatsapp_provider : 'none',
        keepWorkshopSecret(current.twilio_account_sid_enc, b.twilio_account_sid, b.twilio_account_sid_clear),
        keepWorkshopSecret(current.twilio_auth_token_enc, b.twilio_auth_token, b.twilio_auth_token_clear),
        text(b.twilio_sms_from, 40), text(b.twilio_whatsapp_from, 40),
        text(b.meta_phone_number_id, 120),
         keepWorkshopSecret(current.meta_access_token_enc, b.meta_access_token, b.meta_access_token_clear),
         keepWorkshopSecret(current.meta_app_secret_enc, b.meta_app_secret, b.meta_app_secret_clear),
         keepWorkshopSecret(current.meta_verify_token_enc, b.meta_verify_token, b.meta_verify_token_clear)]
    );
  } catch (e) {
    console.error('[workshop message settings]', e.message);
    return res.redirect('/workshop/settings?err=message_save');
  }
  res.redirect('/workshop/settings?saved=1');
});

router.post('/settings/payments', requireWorkshopPermission('manage_settings'), async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const cur = (await pool.query(
    'SELECT gateway_secret, gateway_secret_enc, gateway_hmac, gateway_hmac_enc FROM payment_settings WHERE company_id=$1',
    [cid]
  )).rows[0] || {};
  const keep = (name, clear, encrypted, legacy) => {
    if (b[clear] === '1') return null;
    const typed = String(b[name] || '').trim();
    if (typed) return payVault.encrypt(typed);
    const existing = payVault.read(cur[encrypted], cur[legacy]);
    return existing ? payVault.encrypt(existing) : null;
  };
  try {
    if (!payVault.configured()) return res.redirect('/workshop/settings?err=payment_secret_unavailable');
    const gateway = ['none', 'paymob', 'fawry', 'stripe', 'paypal'].includes(b.gateway) ? b.gateway : 'none';
    await pool.query(
      `INSERT INTO payment_settings
        (company_id, cod_enabled, cod_terms, gateway, payment_link, payment_link_label,
         gateway_public_key, gateway_secret_enc, gateway_hmac_enc, gateway_secret, gateway_hmac,
         gateway_integration_id, gateway_iframe_id, gateway_exclusive, instructions, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,$10,$11,$12,$13,now())
       ON CONFLICT (company_id) DO UPDATE SET
         cod_enabled=EXCLUDED.cod_enabled, cod_terms=EXCLUDED.cod_terms,
         gateway=EXCLUDED.gateway, payment_link=EXCLUDED.payment_link,
         payment_link_label=EXCLUDED.payment_link_label,
         gateway_public_key=EXCLUDED.gateway_public_key,
         gateway_secret_enc=EXCLUDED.gateway_secret_enc,
         gateway_hmac_enc=EXCLUDED.gateway_hmac_enc,
         gateway_secret=NULL, gateway_hmac=NULL,
         gateway_integration_id=EXCLUDED.gateway_integration_id,
         gateway_iframe_id=EXCLUDED.gateway_iframe_id,
         gateway_exclusive=EXCLUDED.gateway_exclusive,
         instructions=EXCLUDED.instructions, updated_at=now()`,
      [cid, b.cod_enabled === '1', text(b.cod_terms, 500), gateway,
        /^https?:\/\//i.test(String(b.payment_link || '').trim()) ? String(b.payment_link).trim() : null,
        text(b.payment_link_label, 80), text(b.gateway_public_key, 500),
        keep('gateway_secret', 'gateway_secret_clear', 'gateway_secret_enc', 'gateway_secret'),
        keep('gateway_hmac', 'gateway_hmac_clear', 'gateway_hmac_enc', 'gateway_hmac'),
        text(b.gateway_integration_id, 80), text(b.gateway_iframe_id, 80),
        b.gateway_exclusive === '1', text(b.instructions, 2000)]
    );
  } catch (e) {
    console.error('[workshop payment settings]', e.message);
    return res.redirect('/workshop/settings?err=payment_save');
  }
  res.redirect('/workshop/settings?saved=1');
});

// ── CRM ──────────────────────────────────────────────────────────────────────
function crmDate(value) {
  const s = String(value == null ? '' : value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function crmActor(req) {
  return (req.workshopUser && req.workshopUser.email) || 'فريق الورشة';
}

function campaignAudienceCondition(segment) {
  return ({
    all: 'TRUE',
    inactive: `(c.segment='inactive' OR c.lifecycle_stage='lost'
               OR (c.last_contacted_at IS NULL AND c.created_at < CURRENT_DATE - INTERVAL '90 days'))`,
    due: `c.next_followup_on IS NOT NULL AND c.next_followup_on <= CURRENT_DATE`,
    vip: `c.segment='vip'`,
    at_risk: `c.lifecycle_stage='at_risk'`,
  })[segment] || 'FALSE';
}

function campaignRecipient(customer) {
  const preference = String(customer.preferred_channel || 'whatsapp');
  if (!customer.marketing_consent) return { reason: 'لا توجد موافقة تسويقية' };
  if (preference === 'whatsapp') {
    return customer.whatsapp
      ? { channel: 'whatsapp', recipient: phoneDigits(customer.whatsapp) }
      : { reason: 'القناة المفضلة واتساب لكن الرقم غير مسجل' };
  }
  if (preference === 'sms') {
    return customer.phone
      ? { channel: 'sms', recipient: phoneDigits(customer.phone) }
      : { reason: 'القناة المفضلة SMS لكن الرقم غير مسجل' };
  }
  if (preference === 'phone') return { reason: 'الهاتف يحتاج اتصالًا يدويًا وليس رسالة آلية' };
  if (preference === 'email') return { reason: 'البريد الإلكتروني غير مدعوم في مزود رسائل الورشة' };
  return { reason: 'العميل أوقف الرسائل التسويقية' };
}

router.get('/crm', requireFlag('crm'), requireWorkshopPermission('view_crm'), async (req, res) => {
  const cid = req.company.id;
  const q = String(req.query.q || '').trim().slice(0, 80);
  const stage = CRM_LEAD_STAGES.includes(String(req.query.stage)) ? String(req.query.stage) : '';
  const customerId = int(req.query.customer_id);
  const campaignId = int(req.query.campaign_id);
  const params = [cid];
  const where = ['l.company_id=$1'];
  if (stage) { params.push(stage); where.push(`l.stage=$${params.length}`); }
  if (q) {
    params.push('%' + q + '%');
    where.push(`(l.name ILIKE $${params.length} OR l.phone ILIKE $${params.length}
                OR l.email ILIKE $${params.length} OR l.source ILIKE $${params.length})`);
  }
  const [leadRows, stageCounts, customerRows, selectedCustomer, leadActivities, campaignRows, selectedCampaign] = await Promise.all([
    pool.query(
      `SELECT l.*, c.name AS customer_name
         FROM workshop_crm_leads l
         LEFT JOIN workshop_customers c ON c.id=l.customer_id AND c.company_id=l.company_id
        WHERE ${where.join(' AND ')}
        ORDER BY (l.priority='high') DESC, (l.next_followup_on IS NULL), l.next_followup_on, l.updated_at DESC
        LIMIT 200`, params
    ),
    pool.query(
      `SELECT stage, COUNT(*)::int AS count
         FROM workshop_crm_leads WHERE company_id=$1 GROUP BY stage`, [cid]
    ),
    pool.query(
      `SELECT c.id, c.name, c.phone, c.segment, c.lifecycle_stage, c.preferred_channel,
              c.source, c.last_contacted_at, c.next_followup_on,
              (SELECT COUNT(*)::int FROM workshop_jobs j
                WHERE j.company_id=c.company_id AND j.customer_id=c.id AND j.status <> 'cancelled') AS jobs_count,
              (SELECT MAX(j.delivered_at) FROM workshop_jobs j
                WHERE j.company_id=c.company_id AND j.customer_id=c.id) AS last_visit
         FROM workshop_customers c
        WHERE c.company_id=$1 AND c.is_active
        ORDER BY (c.next_followup_on IS NULL), c.next_followup_on, c.name
        LIMIT 200`, [cid]
    ),
    customerId ? pool.query(
      `SELECT id, name, phone, whatsapp, segment, lifecycle_stage, preferred_channel, source,
              marketing_consent, last_contacted_at, next_followup_on, note
         FROM workshop_customers WHERE id=$1 AND company_id=$2`, [customerId, cid]
    ) : Promise.resolve({ rows: [] }),
    pool.query(
      `SELECT a.lead_id, a.kind, a.channel, a.body, a.followup_on, a.actor_name, a.created_at
         FROM workshop_crm_lead_activities a
         JOIN workshop_crm_leads l ON l.id=a.lead_id AND l.company_id=a.company_id
        WHERE a.company_id=$1
        ORDER BY a.created_at DESC LIMIT 40`, [cid]
    ),
    pool.query(
      `SELECT c.*,
              COUNT(r.id)::int AS recipient_count,
              COUNT(r.id) FILTER (WHERE r.status='sent')::int AS delivered_to_provider,
              COUNT(r.id) FILTER (WHERE r.status='failed')::int AS failed_recipients,
              COUNT(r.id) FILTER (WHERE r.status='skipped')::int AS skipped_recipients
         FROM workshop_crm_campaigns c
         LEFT JOIN workshop_crm_campaign_recipients r
           ON r.campaign_id=c.id AND r.company_id=c.company_id
        WHERE c.company_id=$1
        GROUP BY c.id
        ORDER BY c.created_at DESC LIMIT 30`, [cid]
    ),
    campaignId ? pool.query(
      `SELECT c.* FROM workshop_crm_campaigns c
        WHERE c.id=$1 AND c.company_id=$2`, [campaignId, cid]
    ) : Promise.resolve({ rows: [] }),
  ]);

  const counts = Object.fromEntries(CRM_LEAD_STAGES.map((key) => [key, 0]));
  stageCounts.rows.forEach((row) => { if (counts[row.stage] != null) counts[row.stage] = Number(row.count); });
  const leadsByStage = Object.fromEntries(CRM_LEAD_STAGES.map((key) => [
    key, leadRows.rows.filter((lead) => lead.stage === key),
  ]));
  let timeline = [];
  if (selectedCustomer.rows[0]) {
    timeline = (await pool.query(
      `SELECT created_at, kind, channel, body, followup_on, actor_name
         FROM workshop_customer_activities
        WHERE company_id=$1 AND customer_id=$2
       UNION ALL
       SELECT a.created_at, 'job' AS kind, NULL AS channel,
              COALESCE(a.details, a.action) AS body, NULL AS followup_on, a.actor_name
         FROM workshop_activity a
         JOIN workshop_jobs j ON j.id=a.job_id AND j.company_id=a.company_id
        WHERE a.company_id=$1 AND j.customer_id=$2
       UNION ALL
       SELECT m.created_at, 'message' AS kind, m.channel, m.body, NULL AS followup_on, NULL AS actor_name
         FROM workshop_messages m
        WHERE m.company_id=$1 AND m.customer_id=$2
        ORDER BY created_at DESC LIMIT 60`, [cid, customerId]
    )).rows;
  }
  let campaignRecipients = [];
  if (selectedCampaign.rows[0]) {
    campaignRecipients = (await pool.query(
      `SELECT r.*, c.name AS customer_name, c.phone, c.whatsapp, m.channel,
              m.status AS message_status, m.error AS message_error, m.attempt_count
         FROM workshop_crm_campaign_recipients r
         JOIN workshop_customers c ON c.id=r.customer_id AND c.company_id=r.company_id
         LEFT JOIN workshop_messages m ON m.id=r.message_id AND m.company_id=r.company_id
        WHERE r.campaign_id=$1 AND r.company_id=$2
        ORDER BY r.status='failed' DESC, r.status='skipped' DESC, c.name`,
      [campaignId, cid]
    )).rows;
  }

  res.render('workshop_admin/crm', {
    title: 'CRM والمتابعة', tab: 'crm', q, stage, customerId, campaignId,
    leads: leadRows.rows, leadsByStage, counts, customers: customerRows.rows,
    selectedCustomer: selectedCustomer.rows[0] || null, timeline,
    leadActivities: leadActivities.rows,
    campaigns: campaignRows.rows, selectedCampaign: selectedCampaign.rows[0] || null,
    campaignRecipients,
    leadStages: CRM_LEAD_STAGES, leadStageLabels: CRM_LEAD_STAGE_LABELS,
    priorities: CRM_PRIORITIES, priorityLabels: CRM_PRIORITY_LABELS,
    segments: CRM_SEGMENTS, segmentLabels: CRM_SEGMENT_LABELS,
    lifecycles: CRM_LIFECYCLES, lifecycleLabels: CRM_LIFECYCLE_LABELS,
    campaignSegments: CAMPAIGN_SEGMENTS, campaignSegmentLabels: CAMPAIGN_SEGMENT_LABELS,
  });
});

router.post('/crm/leads', requireFlag('crm'), requireWorkshopPermission('manage_crm'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  const stage = CRM_LEAD_STAGES.includes(String(b.stage)) ? String(b.stage) : 'new';
  const priority = CRM_PRIORITIES.includes(String(b.priority)) ? String(b.priority) : 'normal';
  if (name) {
    await pool.query(
      `INSERT INTO workshop_crm_leads
        (company_id, name, phone, email, source, stage, priority, notes, next_followup_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [req.company.id, name, text(b.phone, 40), text(b.email, 160), text(b.source, 80),
        stage, priority, text(b.notes, 1000), crmDate(b.next_followup_on)]
    );
  }
  res.redirect('/workshop/crm');
});

router.post('/crm/leads/:id', requireFlag('crm'), requireWorkshopPermission('manage_crm'), async (req, res) => {
  const b = req.body || {};
  const stage = CRM_LEAD_STAGES.includes(String(b.stage)) ? String(b.stage) : 'new';
  const priority = CRM_PRIORITIES.includes(String(b.priority)) ? String(b.priority) : 'normal';
  const id = int(req.params.id);
  await pool.query(
    `UPDATE workshop_crm_leads
        SET stage=$3, priority=$4, notes=$5, next_followup_on=$6, updated_at=now()
      WHERE id=$1 AND company_id=$2`,
    [id, req.company.id, stage, priority, text(b.notes, 1000), crmDate(b.next_followup_on)]
  );
  res.redirect('/workshop/crm');
});

router.post('/crm/leads/:id/activity', requireFlag('crm'), requireWorkshopPermission('manage_crm'), async (req, res) => {
  const b = req.body || {};
  const body = text(b.body, 1000);
  const channel = ['phone', 'whatsapp', 'sms', 'email', 'visit', 'note'].includes(String(b.channel))
    ? String(b.channel) : 'note';
  const id = int(req.params.id);
  if (body) {
    const lead = (await pool.query(
      'SELECT id FROM workshop_crm_leads WHERE id=$1 AND company_id=$2', [id, req.company.id]
    )).rows[0];
    if (lead) {
      await pool.query(
        `INSERT INTO workshop_crm_lead_activities
          (company_id, lead_id, kind, channel, body, followup_on, actor_name)
         VALUES ($1,$2,'contact',$3,$4,$5,$6)`,
        [req.company.id, id, channel, body, crmDate(b.followup_on), crmActor(req)]
      );
      await pool.query(
        `UPDATE workshop_crm_leads
            SET last_contacted_at=now(), next_followup_on=$3, updated_at=now()
          WHERE id=$1 AND company_id=$2`,
        [id, req.company.id, crmDate(b.followup_on)]
      );
    }
  }
  res.redirect('/workshop/crm');
});

router.post('/crm/leads/:id/convert', requireFlag('crm'), requireWorkshopPermission('manage_crm'), async (req, res) => {
  const client = await pool.connect();
  try {
    const cid = req.company.id;
    const id = int(req.params.id);
    await client.query('BEGIN');
    const lead = (await client.query(
      `SELECT * FROM workshop_crm_leads WHERE id=$1 AND company_id=$2 FOR UPDATE`, [id, cid]
    )).rows[0];
    if (!lead || lead.customer_id) {
      await client.query('ROLLBACK');
      return res.redirect('/workshop/crm');
    }
    let customer;
    if (lead.phone) {
      customer = (await client.query(
        `SELECT * FROM workshop_customers
          WHERE company_id=$1 AND (phone=$2 OR whatsapp=$2)
          ORDER BY is_active DESC, id LIMIT 1 FOR UPDATE`, [cid, lead.phone]
      )).rows[0];
    }
    if (!customer) {
      customer = (await client.query(
        `INSERT INTO workshop_customers
          (company_id, name, phone, source, segment, lifecycle_stage, preferred_channel)
         VALUES ($1,$2,$3,$4,'new','active','whatsapp') RETURNING *`,
        [cid, lead.name, lead.phone, lead.source]
      )).rows[0];
    }
    await client.query(
      `UPDATE workshop_crm_leads
          SET customer_id=$3, stage='won', converted_at=now(), updated_at=now()
        WHERE id=$1 AND company_id=$2`, [id, cid, customer.id]
    );
    await client.query(
      `INSERT INTO workshop_customer_activities
        (company_id, customer_id, kind, channel, body, actor_name)
       VALUES ($1,$2,'lead_converted','note',$3,$4)`,
      [cid, customer.id, `تم تحويل العميل المحتمل «${lead.name}» إلى عميل ورشة`, crmActor(req)]
    );
    await client.query('COMMIT');
    res.redirect('/workshop/crm?customer_id=' + customer.id);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[workshop CRM conversion]', e.message);
    res.redirect('/workshop/crm');
  } finally {
    client.release();
  }
});

router.post('/crm/customers/:id/profile', requireFlag('crm'), requireWorkshopPermission('manage_crm'), async (req, res) => {
  const b = req.body || {};
  const id = int(req.params.id);
  const segment = CRM_SEGMENTS.includes(String(b.segment)) ? String(b.segment) : 'regular';
  const lifecycle = CRM_LIFECYCLES.includes(String(b.lifecycle_stage)) ? String(b.lifecycle_stage) : 'active';
  const channel = ['whatsapp', 'phone', 'sms', 'email', 'none'].includes(String(b.preferred_channel))
    ? String(b.preferred_channel) : 'whatsapp';
  const followup = crmDate(b.next_followup_on);
  const consent = b.marketing_consent === '1';
  await pool.query(
    `UPDATE workshop_customers
        SET segment=$3, lifecycle_stage=$4, preferred_channel=$5, next_followup_on=$6,
            marketing_consent=$7,
            marketing_consent_at=CASE WHEN $7 THEN COALESCE(marketing_consent_at, now()) ELSE marketing_consent_at END,
            marketing_opted_out_at=CASE WHEN $7 THEN NULL ELSE now() END
      WHERE id=$1 AND company_id=$2`,
    [id, req.company.id, segment, lifecycle, channel, followup, consent]
  );
  res.redirect('/workshop/crm?customer_id=' + id);
});

router.post('/crm/customers/:id/activity', requireFlag('crm'), requireWorkshopPermission('manage_crm'), async (req, res) => {
  const b = req.body || {};
  const body = text(b.body, 1000);
  const channel = ['phone', 'whatsapp', 'sms', 'email', 'visit', 'note'].includes(String(b.channel))
    ? String(b.channel) : 'note';
  const id = int(req.params.id);
  if (body) {
    const customer = (await pool.query(
      'SELECT id FROM workshop_customers WHERE id=$1 AND company_id=$2', [id, req.company.id]
    )).rows[0];
    if (customer) {
      await pool.query(
        `INSERT INTO workshop_customer_activities
          (company_id, customer_id, kind, channel, body, followup_on, actor_name)
         VALUES ($1,$2,'contact',$3,$4,$5,$6)`,
        [req.company.id, id, channel, body, crmDate(b.followup_on), crmActor(req)]
      );
      await pool.query(
        `UPDATE workshop_customers
            SET last_contacted_at=now(), next_followup_on=$3
          WHERE id=$1 AND company_id=$2`,
        [id, req.company.id, crmDate(b.followup_on)]
      );
    }
  }
  res.redirect('/workshop/crm?customer_id=' + id);
});

router.post('/crm/campaigns', requireFlag('crm'), requireWorkshopPermission('manage_crm'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  const body = text(b.body, 2000);
  const segment = CAMPAIGN_SEGMENTS.includes(String(b.segment)) ? String(b.segment) : 'all';
  if (!name || !body) return res.redirect('/workshop/crm');

  const client = await pool.connect();
  try {
    const cid = req.company.id;
    await client.query('BEGIN');
    const campaign = (await client.query(
      `INSERT INTO workshop_crm_campaigns
        (company_id, name, segment, body, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [cid, name, segment, body, crmActor(req)]
    )).rows[0];
    const customers = (await client.query(
      `SELECT id, name, phone, whatsapp, preferred_channel, marketing_consent
         FROM workshop_customers c
        WHERE c.company_id=$1 AND c.is_active AND ${campaignAudienceCondition(segment)}
        ORDER BY c.name, c.id`, [cid]
    )).rows;
    let preparedCount = 0;
    let skippedCount = 0;
    for (const customer of customers) {
      const target = campaignRecipient(customer);
      if (!target.channel || !target.recipient) {
        await client.query(
          `INSERT INTO workshop_crm_campaign_recipients
            (company_id, campaign_id, customer_id, status, skip_reason)
           VALUES ($1,$2,$3,'skipped',$4)`,
          [cid, campaign.id, customer.id, target.reason]
        );
        skippedCount += 1;
        continue;
      }
      const personalizedBody = body.replace(/\{\{\s*name\s*\}\}/gi, customer.name);
      const message = (await client.query(
        `INSERT INTO workshop_messages
          (company_id, customer_id, campaign_id, channel, recipient, event_key, body)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [cid, customer.id, campaign.id, target.channel, target.recipient,
          `crm_campaign_${campaign.id}`, personalizedBody]
      )).rows[0];
      await client.query(
        `INSERT INTO workshop_crm_campaign_recipients
          (company_id, campaign_id, customer_id, message_id, status)
         VALUES ($1,$2,$3,$4,'prepared')`,
        [cid, campaign.id, customer.id, message.id]
      );
      preparedCount += 1;
    }
    await client.query(
      `UPDATE workshop_crm_campaigns
          SET audience_count=$2, prepared_count=$3, skipped_count=$4
        WHERE id=$1 AND company_id=$5`,
      [campaign.id, customers.length, preparedCount, skippedCount, cid]
    );
    await client.query('COMMIT');
    res.redirect('/workshop/crm?campaign_id=' + campaign.id);
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error('[workshop CRM campaign prepare]', e.message);
    res.redirect('/workshop/crm');
  } finally {
    client.release();
  }
});

router.post('/crm/campaigns/:id/send', requireFlag('crm'), requireWorkshopPermission('send_communications'), async (req, res) => {
  const cid = req.company.id;
  const id = int(req.params.id);
  const started = (await pool.query(
    `UPDATE workshop_crm_campaigns
        SET status='sending', started_at=COALESCE(started_at, now())
      WHERE id=$1 AND company_id=$2 AND status='prepared'
      RETURNING id`, [id, cid]
  )).rows[0];
  if (!started) return res.redirect('/workshop/crm?campaign_id=' + id);

  const recipients = (await pool.query(
    `SELECT r.id AS recipient_id, r.message_id, r.customer_id
       FROM workshop_crm_campaign_recipients r
      WHERE r.campaign_id=$1 AND r.company_id=$2 AND r.status='prepared'
      ORDER BY r.id`, [id, cid]
  )).rows;
  for (const recipient of recipients) {
    const claimed = (await pool.query(
      `UPDATE workshop_crm_campaign_recipients
          SET status='sending'
        WHERE id=$1 AND company_id=$2 AND status='prepared'
        RETURNING id`, [recipient.recipient_id, cid]
    )).rows[0];
    if (!claimed) continue;

    const customer = (await pool.query(
      `SELECT id, phone, whatsapp, preferred_channel, marketing_consent
         FROM workshop_customers WHERE id=$1 AND company_id=$2`, [recipient.customer_id, cid]
    )).rows[0];
    const target = customer ? campaignRecipient(customer) : { reason: 'العميل غير موجود' };
    if (!target.channel || !target.recipient || !customer.marketing_consent) {
      await pool.query(
        `UPDATE workshop_messages
            SET status='failed', attempt_count=5, failed_at=now(), error=$3
          WHERE id=$1 AND company_id=$2 AND status='prepared'`,
        [recipient.message_id, cid, target.reason || 'الموافقة التسويقية غير متاحة']
      );
      await pool.query(
        `UPDATE workshop_crm_campaign_recipients
            SET status='skipped', skip_reason=$3, result_note=$3
          WHERE id=$1 AND company_id=$2`,
        [recipient.recipient_id, cid, target.reason || 'الموافقة التسويقية غير متاحة']
      );
      continue;
    }
    let result;
    try {
      result = await deliverWorkshopMessage(cid, recipient.message_id);
    } catch (e) {
      result = { ok: false, error: e.message || 'تعذر الاتصال بمزود الرسائل' };
      console.error('[workshop CRM campaign send]', e.message);
      await pool.query(
        `UPDATE workshop_messages
            SET status='failed', failed_at=now(), error=$3
          WHERE id=$1 AND company_id=$2 AND status IN ('prepared','queued')`,
        [recipient.message_id, cid, result.error]
      );
    }
    await pool.query(
      `UPDATE workshop_crm_campaign_recipients
          SET status=$3, result_note=$4
        WHERE id=$1 AND company_id=$2`,
      [recipient.recipient_id, cid, result.ok ? 'sent' : 'failed',
        result.ok ? 'تم قبول الرسالة من المزود' : (result.error || 'فشل غير محدد من المزود')]
    );
  }
  const finalCounts = (await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('prepared','sending'))::int AS prepared_count,
       COUNT(*) FILTER (WHERE status='sent')::int AS sent_count,
       COUNT(*) FILTER (WHERE status='skipped')::int AS skipped_count,
       COUNT(*) FILTER (WHERE status='failed')::int AS failed_count
       FROM workshop_crm_campaign_recipients
      WHERE campaign_id=$1 AND company_id=$2`, [id, cid]
  )).rows[0];
  await pool.query(
    `UPDATE workshop_crm_campaigns
        SET status='completed', completed_at=now(),
            prepared_count=$3, sent_count=$4, skipped_count=$5, failed_count=$6
      WHERE id=$1 AND company_id=$2`,
    [id, cid, finalCounts.prepared_count, finalCounts.sent_count,
      finalCounts.skipped_count, finalCounts.failed_count]
  );
  res.redirect('/workshop/crm?campaign_id=' + id);
});

// ── Customers ────────────────────────────────────────────────────────────────
router.get('/customers', requireFlag('customers'), requireWorkshopPermission('view_customers'), async (req, res) => {
  const cid = req.company.id;
  const q = String(req.query.q || '').trim().slice(0, 80);
  const view = ['active', 'inactive', 'all'].includes(String(req.query.view)) ? String(req.query.view) : 'active';
  const params = [cid];
  let where = 'c.company_id=$1';
  if (view === 'active') where += ' AND c.is_active';
  if (view === 'inactive') where += ' AND NOT c.is_active';
  if (q) {
    params.push('%' + q + '%');
    where += ` AND (c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length}
                   OR c.whatsapp ILIKE $${params.length})`;
  }
  const rows = await pool.query(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM workshop_vehicles v
              WHERE v.company_id=c.company_id AND v.customer_id=c.id) AS vehicles_count,
            (SELECT COUNT(*)::int FROM workshop_jobs j
              WHERE j.company_id=c.company_id AND j.customer_id=c.id) AS jobs_count,
            COALESCE((SELECT SUM(GREATEST(0, t.total - j.paid))
              FROM workshop_jobs j
              JOIN LATERAL (
                SELECT COALESCE((SELECT SUM(qty*unit_price) FROM workshop_job_parts
                                  WHERE company_id=j.company_id AND job_id=j.id),0)
                     + COALESCE((SELECT SUM(amount) FROM workshop_job_labour
                                  WHERE company_id=j.company_id AND job_id=j.id),0)
                     - j.discount + (GREATEST(0, (
                         COALESCE((SELECT SUM(qty*unit_price) FROM workshop_job_parts
                                   WHERE company_id=j.company_id AND job_id=j.id),0)
                         + COALESCE((SELECT SUM(amount) FROM workshop_job_labour
                                   WHERE company_id=j.company_id AND job_id=j.id),0)
                         - j.discount) * j.tax_percent / 100)) AS total
              ) t ON true
              WHERE j.company_id=c.company_id AND j.customer_id=c.id AND j.status <> 'cancelled'),0)::float AS balance
       FROM workshop_customers c
      WHERE ${where}
      ORDER BY c.is_active DESC, c.name, c.id DESC
      LIMIT 300`, params
  );
  res.render('workshop_admin/customers', {
    title: res.locals.t('wsh.cust.title'), tab: 'customers',
    customers: rows.rows, q, view, error: String(req.query.error || ''),
    saved: String(req.query.saved || ''),
  });
});

router.post('/customers', requireFlag('customers'), requireWorkshopPermission('manage_customers'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO workshop_customers (company_id, name, phone, whatsapp, address, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.company.id, name, text(b.phone, 40), text(b.whatsapp, 40), text(b.address, 250), text(b.note, 500)]
    );
  }
  res.redirect(b.back || '/workshop/customers');
});

router.post('/customers/:id', requireFlag('customers'), requireWorkshopPermission('manage_customers'), async (req, res) => {
  const b = req.body || {};
  const id = int(req.params.id);
  const name = text(b.name, 120);
  if (!id || !name) return res.redirect('/workshop/customers?error=invalid');
  await pool.query(
    `UPDATE workshop_customers
        SET name=$3, phone=$4, whatsapp=$5, address=$6, note=$7
      WHERE id=$1 AND company_id=$2`,
    [id, req.company.id, name, text(b.phone, 40), text(b.whatsapp, 40),
      text(b.address, 250), text(b.note, 500)]
  );
  res.redirect('/workshop/customers?saved=1');
});

router.post('/customers/:id/toggle', requireFlag('customers'), requireWorkshopPermission('manage_customers'), async (req, res) => {
  await pool.query(
    `UPDATE workshop_customers SET is_active=NOT is_active
      WHERE id=$1 AND company_id=$2`,
    [int(req.params.id), req.company.id]
  );
  res.redirect('/workshop/customers');
});

router.post('/customers/:id/delete', requireFlag('customers'), requireWorkshopPermission('manage_customers'), async (req, res) => {
  const client = await pool.connect();
  try {
    const cid = req.company.id;
    const id = int(req.params.id);
    await client.query('BEGIN');
    const customer = await client.query(
      'SELECT id FROM workshop_customers WHERE id=$1 AND company_id=$2 FOR UPDATE',
      [id, cid]
    );
    if (!customer.rows[0]) {
      await client.query('ROLLBACK');
      return res.redirect('/workshop/customers?error=not_found');
    }
    const refs = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM workshop_vehicles WHERE company_id=$1 AND customer_id=$2) +
         (SELECT COUNT(*) FROM workshop_jobs WHERE company_id=$1 AND customer_id=$2) +
         (SELECT COUNT(*) FROM workshop_payments WHERE company_id=$1 AND customer_id=$2) +
         (SELECT COUNT(*) FROM workshop_appointments WHERE company_id=$1 AND customer_id=$2) +
         (SELECT COUNT(*) FROM workshop_warranty_claims WHERE company_id=$1 AND customer_id=$2) AS total`,
      [cid, id]
    );
    if (Number(refs.rows[0].total) > 0) {
      await client.query('ROLLBACK');
      return res.redirect('/workshop/customers?error=linked');
    }
    await client.query('DELETE FROM workshop_customers WHERE id=$1 AND company_id=$2', [id, cid]);
    await client.query('COMMIT');
    res.redirect('/workshop/customers?deleted=1');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    if (e && e.code === '23503') return res.redirect('/workshop/customers?error=linked');
    console.error('[workshop customer delete]', e.message);
    res.redirect('/workshop/customers?error=failed');
  } finally {
    client.release();
  }
});

// ── Vehicles ─────────────────────────────────────────────────────────────────
router.get('/vehicles', requireWorkshopPermission('view_vehicles'), async (req, res) => {
  const cid = req.company.id;
  const q = String(req.query.q || '').trim().slice(0, 60);
  const params = [cid];
  let where = 'v.company_id=$1 AND v.is_active';
  if (q) {
    params.push('%' + q + '%');
    where += ` AND (v.plate ILIKE $${params.length} OR v.vin ILIKE $${params.length}
                 OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`;
  }
  const [rows, customers] = await Promise.all([
    pool.query(
      `SELECT v.*, c.name AS customer_name, c.phone AS customer_phone,
              (SELECT COUNT(*)::int FROM workshop_jobs j WHERE j.vehicle_id=v.id) AS jobs_count,
              (SELECT MAX(j.received_at) FROM workshop_jobs j WHERE j.vehicle_id=v.id) AS last_seen
         FROM workshop_vehicles v
         LEFT JOIN workshop_customers c ON c.id = v.customer_id
        WHERE ${where} ORDER BY last_seen DESC NULLS LAST, v.id DESC LIMIT 300`, params),
    pool.query('SELECT id, name, phone FROM workshop_customers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
  ]);
  res.render('workshop_admin/vehicles', {
    title: res.locals.t('wsh.veh.title'), tab: 'vehicles',
    vehicles: rows.rows, customers: customers.rows, q,
  });
});

router.post('/vehicles', requireWorkshopPermission('manage_vehicles'), async (req, res) => {
  const b = req.body || {};
  const plate = text(b.plate, 30);
  if (!plate) return res.redirect('/workshop/vehicles');
  const cid = req.company.id;
  let customerId = int(b.customer_id);
  // A new customer typed straight into the vehicle form: one screen instead of
  // two, because a car arrives with its owner standing there.
  const newName = text(b.new_customer, 120);
  if (!customerId && newName) {
    const c = await pool.query(
      'INSERT INTO workshop_customers (company_id, name, phone) VALUES ($1,$2,$3) RETURNING id',
      [cid, newName, text(b.new_phone, 40)]
    );
    customerId = c.rows[0].id;
  }
  const odo = int(b.odometer);
  await pool.query(
    `INSERT INTO workshop_vehicles
       (company_id, customer_id, plate, make, model, model_year, colour, vin, engine, gearbox, fuel,
        odometer, odometer_at, service_km, service_months, note)
     VALUES ($1,${ref('workshop_customers', '$2', '$1')},$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [cid, customerId, plate, text(b.make, 60), text(b.model, 60), int(b.model_year),
     text(b.colour, 40), text(b.vin, 40), text(b.engine, 40), text(b.gearbox, 40), text(b.fuel, 30),
     odo, odo != null ? new Date() : null, int(b.service_km), int(b.service_months), text(b.note, 500)]
  );
  res.redirect('/workshop/vehicles');
});

router.get('/vehicles/:id', requireWorkshopPermission('view_vehicles'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const v = (await pool.query(
    `SELECT v.*, c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp
       FROM workshop_vehicles v LEFT JOIN workshop_customers c ON c.id=v.customer_id
      WHERE v.id=$1 AND v.company_id=$2`, [id, cid])).rows[0];
  if (!v) return res.redirect('/workshop/vehicles');
  const [jobs, reminders] = await Promise.all([
    pool.query(`SELECT j.*, t.name AS technician_name FROM workshop_jobs j
                 LEFT JOIN workshop_technicians t ON t.id=j.technician_id
                WHERE j.company_id=$1 AND j.vehicle_id=$2 ORDER BY j.received_at DESC`, [cid, id]),
    pool.query(`SELECT * FROM workshop_reminders WHERE company_id=$1 AND vehicle_id=$2
                 ORDER BY status, due_on NULLS LAST`, [cid, id]),
  ]);
  res.render('workshop_admin/vehicle', {
    title: v.plate, tab: 'vehicles', vehicle: v, jobs: jobs.rows,
    reminders: reminders.rows, J, next: J.nextService(v, req.settings),
  });
});

// ── Job cards ────────────────────────────────────────────────────────────────
router.get('/jobs', requireWorkshopPermission('view_jobs'), async (req, res) => {
  const cid = req.company.id;
  const status = J.STATUSES.includes(req.query.status) ? req.query.status : null;
  const params = [cid];
  let where = 'j.company_id=$1';
  if (status) { params.push(status); where += ` AND j.status=$${params.length}`; }
  else where += ` AND j.status <> 'cancelled'`;
  const [rows, vehicles, techs] = await Promise.all([
    pool.query(`SELECT j.*, v.plate, v.make, v.model, c.name AS customer_name, t.name AS technician_name
                  FROM workshop_jobs j
                  LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
                  LEFT JOIN workshop_customers c ON c.id=j.customer_id
                  LEFT JOIN workshop_technicians t ON t.id=j.technician_id
                 WHERE ${where} ORDER BY j.received_at DESC LIMIT 300`, params),
    pool.query(`SELECT v.id, v.plate, v.make, v.model, v.odometer, c.name AS customer_name, v.customer_id
                  FROM workshop_vehicles v LEFT JOIN workshop_customers c ON c.id=v.customer_id
                 WHERE v.company_id=$1 AND v.is_active ORDER BY v.plate`, [cid]),
    pool.query('SELECT id, name FROM workshop_technicians WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
  ]);
  res.render('workshop_admin/jobs', {
    title: res.locals.t('wsh.job.title'), tab: 'jobs',
    jobs: rows.rows, vehicles: vehicles.rows, technicians: techs.rows, status, J,
  });
});

router.post('/jobs', requireWorkshopPermission('create_jobs'), async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;
  const vehicleId = int(b.vehicle_id);
  if (!vehicleId) return res.redirect('/workshop/jobs');
  const v = (await pool.query(
    'SELECT * FROM workshop_vehicles WHERE id=$1 AND company_id=$2', [vehicleId, cid])).rows[0];
  if (!v) return res.redirect('/workshop/jobs');

  const odo = int(b.odometer_in);
  const r = await pool.query(
    `INSERT INTO workshop_jobs
       (company_id, vehicle_id, customer_id, technician_id, complaint, odometer_in,
        promised_at, tax_percent, warranty_months)
     VALUES ($1,$2,$3,${ref('workshop_technicians', '$4', '$1')},$5,$6,$7,$8,$9) RETURNING id`,
    // v.id, not vehicleId: the SELECT above is what proved this vehicle is ours.
    [cid, v.id, v.customer_id, int(b.technician_id), text(b.complaint, 1000), odo,
     b.promised_at ? new Date(b.promised_at) : null,
     num(req.settings.tax_percent, 0), int(b.warranty_months, 0) || 0]
  );
  await Promise.all([
    ensureJobAccess(pool, cid, r.rows[0].id),
    ensureInspection(pool, cid, r.rows[0].id),
    ensureQuality(pool, cid, r.rows[0].id),
  ]);
  await logActivity(pool, cid, r.rows[0].id, 'job_created', 'تم فتح أمر شغل جديد');
  if (req.flags.has('communications')) {
    try { await prepareWorkshopMessage(cid, r.rows[0].id, 'received'); } catch (e) { console.error('[workshop auto message]', e.message); }
  }
  // A newer odometer reading is worth keeping on the vehicle: every reminder is
  // computed from it, and this is the one moment somebody actually reads it.
  if (odo != null && (v.odometer == null || odo >= Number(v.odometer))) {
    await pool.query('UPDATE workshop_vehicles SET odometer=$1, odometer_at=now() WHERE id=$2 AND company_id=$3',
      [odo, vehicleId, cid]);
  }
  res.redirect('/workshop/jobs/' + r.rows[0].id);
});

async function loadJob(cid, id) {
  const job = (await pool.query(
    `SELECT j.*, v.plate, v.make, v.model, v.model_year, v.odometer, v.service_km, v.service_months,
            c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp,
            t.name AS technician_name
       FROM workshop_jobs j
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id
       LEFT JOIN workshop_technicians t ON t.id=j.technician_id
      WHERE j.id=$1 AND j.company_id=$2`, [id, cid])).rows[0];
  if (!job) return null;
  const [parts, labour, photos, payments, inspection, quality, activity, access, partReservations, changeOrders, timeEntries, estimateVersions] = await Promise.all([
    pool.query('SELECT * FROM workshop_job_parts WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_job_labour WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_job_photos WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_payments WHERE company_id=$1 AND job_id=$2 ORDER BY paid_at', [cid, id]),
    pool.query('SELECT * FROM workshop_inspection_items WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_quality_checks WHERE company_id=$1 AND job_id=$2 ORDER BY id', [cid, id]),
    pool.query('SELECT * FROM workshop_activity WHERE company_id=$1 AND job_id=$2 ORDER BY created_at DESC LIMIT 30', [cid, id]),
    pool.query('SELECT token FROM workshop_job_access WHERE company_id=$1 AND job_id=$2', [cid, id]),
    pool.query(
      `SELECT r.*, p.name, p.part_number
         FROM workshop_part_reservations r
         JOIN workshop_parts p ON p.id=r.part_id
        WHERE r.company_id=$1 AND r.job_id=$2 AND r.status='reserved'
        ORDER BY r.created_at`, [cid, id]),
    pool.query(
      `SELECT co.*,
              COALESCE(SUM(i.qty*i.unit_price),0)::float AS total,
              COUNT(i.id)::int AS item_count
         FROM workshop_change_orders co
         LEFT JOIN workshop_change_order_items i
           ON i.change_order_id=co.id AND i.company_id=co.company_id
        WHERE co.company_id=$1 AND co.job_id=$2
        GROUP BY co.id
        ORDER BY co.created_at DESC`, [cid, id]),
    pool.query(
      `SELECT e.*, t.name AS technician_name,
              ROUND(EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now())-e.started_at))/60.0, 1)::float AS minutes
         FROM workshop_time_entries e
         LEFT JOIN workshop_technicians t
           ON t.id=e.technician_id AND t.company_id=e.company_id
        WHERE e.company_id=$1 AND e.job_id=$2
        ORDER BY e.started_at DESC`, [cid, id]),
    pool.query(
      `SELECT * FROM workshop_estimate_versions
        WHERE company_id=$1 AND job_id=$2
        ORDER BY version_no DESC LIMIT 30`, [cid, id]),
  ]);
  return {
    job, parts: parts.rows, labour: labour.rows, photos: photos.rows, payments: payments.rows,
    inspection: inspection.rows, quality: quality.rows, activity: activity.rows, access: access.rows[0] || null,
    partReservations: partReservations.rows, changeOrders: changeOrders.rows,
    timeEntries: timeEntries.rows, estimateVersions: estimateVersions.rows,
  };
}

router.get('/jobs/:id', requireWorkshopPermission('view_jobs'), async (req, res) => {
  const cid = req.company.id;
  const jobId = int(req.params.id);
  const data = await loadJob(cid, jobId);
  if (!data) return res.redirect('/workshop/jobs');
  await ensureJobAccess(pool, cid, jobId);
  await ensureInspection(pool, cid, jobId);
  await ensureQuality(pool, cid, jobId);
  // The first load happens before additive child rows are ensured. Reload so
  // the page includes the access token and the default inspection checklist.
  const freshData = await loadJob(cid, jobId);
  const [stock, techs] = await Promise.all([
    pool.query(`SELECT id, name, part_number, qty, avg_cost, sell_price FROM workshop_parts
                 WHERE company_id=$1 AND is_active ORDER BY name LIMIT 500`, [cid]),
    pool.query('SELECT id, name FROM workshop_technicians WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
  ]);
  res.render('workshop_admin/job', {
    title: J.jobCode(freshData.job.id), tab: 'jobs', ...freshData,
    /* A code the server knows plus one number, never text from the URL. */
    err: String(req.query.err || '') === 'stock' ? 'stock' : null,
    errHave: Math.max(0, parseInt(req.query.have, 10) || 0),
    stock: stock.rows, technicians: techs.rows, J,
     totals: J.jobTotals(freshData.job, freshData.parts, freshData.labour),
    labourRate: num(req.settings.labour_rate, 0),
     inspectionStatuses: INSPECTION_STATUSES, qualityStatuses: QUALITY_STATUSES,
     portalPath: data.access ? `/workshop/status/${data.access.token}` : null,
     qualityReady: qualityReady(freshData.quality),
     canQualityOverride: Boolean(await managerIdentity(req, cid)),
  });
});

router.get('/jobs/:id/report', requireWorkshopPermission('view_jobs'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const data = await loadJob(cid, id);
  if (!data) return res.redirect('/workshop/jobs');
  await ensureQuality(pool, cid, id);
  const freshData = await loadJob(cid, id);
  res.render('workshop_admin/report', {
    title: `تقرير تسليم ${J.jobCode(id)}`, ...freshData, J,
    totals: J.jobTotals(freshData.job, freshData.parts, freshData.labour),
  });
});

// ── Change orders / estimate versions ───────────────────────────────────────
router.get('/change-orders', requireFlag('change_orders'), requireWorkshopPermission('view_change_orders'), async (req, res) => {
  const cid = req.company.id;
  const [orders, jobs] = await Promise.all([
    pool.query(
      `SELECT co.*, j.status AS job_status,
              v.plate, c.name AS customer_name,
              COALESCE(SUM(i.qty*i.unit_price),0)::float AS total
         FROM workshop_change_orders co
         JOIN workshop_jobs j ON j.id=co.job_id AND j.company_id=co.company_id
         LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id AND v.company_id=j.company_id
         LEFT JOIN workshop_customers c ON c.id=j.customer_id AND c.company_id=j.company_id
         LEFT JOIN workshop_change_order_items i
           ON i.change_order_id=co.id AND i.company_id=co.company_id
        WHERE co.company_id=$1
        GROUP BY co.id, j.status, v.plate, c.name
        ORDER BY co.created_at DESC LIMIT 300`, [cid]),
    pool.query(
      `SELECT j.id, v.plate, c.name AS customer_name
         FROM workshop_jobs j
         LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id AND v.company_id=j.company_id
         LEFT JOIN workshop_customers c ON c.id=j.customer_id AND c.company_id=j.company_id
        WHERE j.company_id=$1 AND j.status NOT IN ('delivered','cancelled')
        ORDER BY j.received_at DESC LIMIT 300`, [cid]),
  ]);
  res.render('workshop_admin/change_orders', {
    title: 'موافقات الإصلاحات الإضافية', tab: 'change_orders',
    orders: orders.rows, jobs: jobs.rows,
  });
});

router.post('/jobs/:id/change-orders', requireFlag('change_orders'), requireWorkshopPermission('manage_job_pricing'), async (req, res) => {
  const cid = req.company.id, jobId = int(req.params.id), b = req.body || {};
  const job = (await pool.query(
    `SELECT j.id FROM workshop_jobs j WHERE j.id=$1 AND j.company_id=$2`, [jobId, cid])).rows[0];
  const description = text(b.description, 300);
  const amount = Math.max(0, num(b.unit_price, 0));
  if (!job || !description || amount <= 0) return res.redirect(`/workshop/jobs/${jobId}#change-orders`);
  const client = await pool.connect();
  let orderId = null;
  try {
    await client.query('BEGIN');
    const order = (await client.query(
      `INSERT INTO workshop_change_orders (company_id, job_id, reason, customer_note)
       SELECT $1,$2,$3,$4
        WHERE EXISTS (SELECT 1 FROM workshop_jobs WHERE id=$2 AND company_id=$1)
       RETURNING id`,
      [cid, jobId, text(b.reason, 500) || description, text(b.customer_note, 500)] )).rows[0];
    orderId = order.id;
    await client.query(
      `INSERT INTO workshop_change_order_items
        (company_id, change_order_id, kind, description, qty, unit_price, unit_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [cid, orderId, b.kind === 'part' ? 'part' : 'labour', description,
       Math.max(0.001, num(b.qty, 1)), amount, Math.max(0, num(b.unit_cost, 0))]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[workshop change order]', e.message);
  } finally { client.release(); }
  if (orderId) await logActivity(pool, cid, jobId, 'change_order_created', `تم إنشاء موافقة إصلاح إضافي #${orderId}`);
  res.redirect(`/workshop/jobs/${jobId}#change-orders`);
});

router.post('/jobs/:id/estimates', requireFlag('change_orders'), requireWorkshopPermission('manage_job_pricing'), async (req, res) => {
  const cid = req.company.id, jobId = int(req.params.id);
  const data = await loadJob(cid, jobId);
  if (!data) return res.redirect('/workshop/jobs');
  const totals = J.jobTotals(data.job, data.parts, data.labour);
  const snapshot = [
    ...data.parts.map((p) => ({ kind: 'part', description: p.name, qty: Number(p.qty), unit_price: Number(p.unit_price), unit_cost: Number(p.unit_cost || 0) })),
    ...data.labour.map((l) => ({ kind: 'labour', description: l.description, qty: Number(l.hours || 0), unit_price: Number(l.amount || 0), unit_cost: 0 })),
  ];
  const next = (await pool.query(
    `SELECT COALESCE(MAX(version_no),0)+1 AS n FROM workshop_estimate_versions
      WHERE company_id=$1 AND job_id=$2`, [cid, jobId])).rows[0].n;
  const actor = (await managerIdentity(req, cid)) || { name: 'فريق الورشة' };
  await pool.query(
    `INSERT INTO workshop_estimate_versions
      (company_id, job_id, version_no, status, subtotal, total, snapshot, created_by, approved_by, approved_at)
     SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,CASE WHEN $4='approved' THEN now() ELSE NULL END
      WHERE EXISTS (SELECT 1 FROM workshop_jobs WHERE id=$2 AND company_id=$1)`,
    [cid, jobId, next, data.job.approved_at ? 'approved' : 'draft',
     totals.subtotal, totals.total, JSON.stringify(snapshot), actor.name,
     data.job.approved_at ? data.job.approved_by || actor.name : null]);
  await logActivity(pool, cid, jobId, 'estimate_version_created', `تم حفظ نسخة العرض رقم ${next}`, actor.name);
  res.redirect(`/workshop/jobs/${jobId}#change-orders`);
});

router.post('/change-orders/:id/status', requireFlag('change_orders'), requireWorkshopPermission('manage_job_pricing'), async (req, res) => {
  const cid = req.company.id, orderId = int(req.params.id), status = req.body && req.body.status;
  if (!['approved', 'rejected'].includes(status)) return res.redirect('/workshop/change-orders');
  const actor = (await managerIdentity(req, cid)) || { name: 'فريق الورشة' };
  const row = (await pool.query(
    `UPDATE workshop_change_orders
        SET status=$1,
            approved_by=CASE WHEN $1='approved' THEN $2 ELSE NULL END,
            approved_at=CASE WHEN $1='approved' THEN now() ELSE NULL END,
            rejected_by=CASE WHEN $1='rejected' THEN $2 ELSE NULL END,
            rejected_at=CASE WHEN $1='rejected' THEN now() ELSE NULL END,
            updated_at=now()
      WHERE id=$3 AND company_id=$4
      RETURNING job_id`, [status, actor.name, orderId, cid])).rows[0];
  if (row) await logActivity(pool, cid, row.job_id, `change_order_${status}`, `تم ${status === 'approved' ? 'اعتماد' : 'رفض'} التعديل #${orderId}`, actor.name);
  res.redirect(req.get('referer') || '/workshop/change-orders');
});

// ── Floor, bays and actual technician time ──────────────────────────────────
router.get('/floor', requireFlag('floor'), requireWorkshopPermission('view_floor'), async (req, res) => {
  const cid = req.company.id;
  const [bays, jobs, technicians, active] = await Promise.all([
    pool.query('SELECT * FROM workshop_work_bays WHERE company_id=$1 ORDER BY is_active DESC, name', [cid]),
    pool.query(
      `SELECT j.id, j.status, j.bay_id, v.plate, v.make, v.model, c.name AS customer_name,
              t.name AS technician_name
         FROM workshop_jobs j
         LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id AND v.company_id=j.company_id
         LEFT JOIN workshop_customers c ON c.id=j.customer_id AND c.company_id=j.company_id
         LEFT JOIN workshop_technicians t ON t.id=j.technician_id AND t.company_id=j.company_id
        WHERE j.company_id=$1 AND j.status IN ('approved','in_progress','done')
        ORDER BY j.bay_id NULLS FIRST, j.received_at`, [cid]),
    pool.query('SELECT id, name FROM workshop_technicians WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
    pool.query(
      `SELECT e.*, j.id AS job_id, v.plate, t.name AS technician_name
         FROM workshop_time_entries e
         JOIN workshop_jobs j ON j.id=e.job_id AND j.company_id=e.company_id
         LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id AND v.company_id=j.company_id
         LEFT JOIN workshop_technicians t ON t.id=e.technician_id AND t.company_id=e.company_id
        WHERE e.company_id=$1 AND e.ended_at IS NULL
        ORDER BY e.started_at`, [cid]),
  ]);
  res.render('workshop_admin/floor', {
    title: 'الفنيون والرافعات', tab: 'floor',
    bays: bays.rows, jobs: jobs.rows, technicians: technicians.rows, active: active.rows,
  });
});

router.post('/bays', requireFlag('floor'), requireWorkshopPermission('manage_bays'), async (req, res) => {
  const name = text(req.body && req.body.name, 80);
  if (name) await pool.query(
    `INSERT INTO workshop_work_bays (company_id, name, bay_type) VALUES ($1,$2,$3)`,
    [req.company.id, name, text(req.body && req.body.bay_type, 60)]);
  res.redirect('/workshop/floor');
});

router.post('/jobs/:id/bay', requireFlag('floor'), requireWorkshopPermission('manage_bays'), async (req, res) => {
  const cid = req.company.id, jobId = int(req.params.id), bayId = int(req.body && req.body.bay_id);
  await pool.query(
    `UPDATE workshop_jobs SET bay_id=$1 WHERE id=$2 AND company_id=$3
       AND ($1 IS NULL OR EXISTS (SELECT 1 FROM workshop_work_bays b WHERE b.id=$1 AND b.company_id=$3 AND b.is_active))`,
    [bayId, jobId, cid]);
  res.redirect(req.get('referer') || '/workshop/floor');
});

router.post('/time/start', requireFlag('floor'), requireWorkshopPermission('manage_time'), async (req, res) => {
  const cid = req.company.id, jobId = int(req.body && req.body.job_id), techId = int(req.body && req.body.technician_id);
  const valid = (await pool.query(
    `SELECT j.id FROM workshop_jobs j
      WHERE j.id=$1 AND j.company_id=$2
        AND EXISTS (SELECT 1 FROM workshop_technicians t WHERE t.id=$3 AND t.company_id=$2 AND t.is_active)`,
    [jobId, cid, techId])).rows.length;
  if (valid) {
    try {
      await pool.query(
        `INSERT INTO workshop_time_entries (company_id, job_id, technician_id, note)
         SELECT $1,$2,$3,$4
          WHERE EXISTS (SELECT 1 FROM workshop_jobs WHERE id=$2 AND company_id=$1)
            AND EXISTS (SELECT 1 FROM workshop_technicians WHERE id=$3 AND company_id=$1 AND is_active)`,
        [cid, jobId, techId, text(req.body && req.body.note, 300)]);
      await logActivity(pool, cid, jobId, 'time_started', 'بدأ الفني تسجيل الوقت');
    } catch (e) { console.error('[workshop time start]', e.message); }
  }
  res.redirect(req.get('referer') || '/workshop/floor');
});

router.post('/time/:id/stop', requireFlag('floor'), requireWorkshopPermission('manage_time'), async (req, res) => {
  const cid = req.company.id, entryId = int(req.params.id);
  const row = (await pool.query(
    `UPDATE workshop_time_entries SET ended_at=now(), note=COALESCE($1,note)
      WHERE id=$2 AND company_id=$3 AND ended_at IS NULL RETURNING job_id`,
    [text(req.body && req.body.note, 300), entryId, cid])).rows[0];
  if (row) await logActivity(pool, cid, row.job_id, 'time_stopped', 'تم إيقاف جلسة وقت الفني');
  res.redirect(req.get('referer') || '/workshop/floor');
});

// ── Customer communications ─────────────────────────────────────────────────
async function prepareWorkshopMessage(companyId, jobId, eventKey) {
  const row = (await pool.query(
    `SELECT j.id, j.plate, c.name AS customer_name, c.phone AS customer_phone,
            co.company_name, a.token
       FROM workshop_jobs j
       LEFT JOIN workshop_customers c ON c.id=j.customer_id AND c.company_id=j.company_id
       JOIN companies co ON co.id=j.company_id
       LEFT JOIN workshop_job_access a ON a.job_id=j.id AND a.company_id=j.company_id
      WHERE j.id=$1 AND j.company_id=$2
      ORDER BY a.created_at DESC NULLS LAST LIMIT 1`, [jobId, companyId])).rows[0];
  if (!row) return null;
  const portal = row.token ? `/workshop/status/${row.token}` : null;
  const body = defaultWorkshopMessage(row, eventKey, portal);
  const settings = (await pool.query(
    `SELECT active, sms_provider, whatsapp_provider
       FROM workshop_message_settings WHERE company_id=$1`, [companyId]
  )).rows[0] || {};
  const channel = settings.whatsapp_provider !== 'none' ? 'whatsapp'
    : settings.sms_provider !== 'none' ? 'sms' : 'whatsapp';
  const inserted = (await pool.query(
    `INSERT INTO workshop_messages
      (company_id, job_id, customer_id, channel, recipient, event_key, body)
       SELECT $1,$2,customer_id,$3,$4,$5,$6
         FROM workshop_jobs
        WHERE id=$2 AND company_id=$1
          AND EXISTS (SELECT 1 FROM workshop_jobs WHERE id=$2 AND company_id=$1)
     RETURNING id`, [companyId, jobId, channel, row.customer_phone, eventKey, body])).rows[0];
  const channelConfigured = channel === 'whatsapp'
    ? settings.whatsapp_provider !== 'none'
    : settings.sms_provider !== 'none';
  if (inserted && settings.active && channelConfigured) {
    await deliverWorkshopMessage(companyId, inserted.id);
  }
  return inserted;
}

router.get('/communications', requireFlag('communications'), requireWorkshopPermission('view_communications'), async (req, res) => {
  const cid = req.company.id;
  const [messages, jobs, finalFailures] = await Promise.all([
    pool.query(
      `SELECT m.*, j.id AS job_id, v.plate, c.name AS customer_name, c.phone AS customer_phone
         FROM workshop_messages m
         LEFT JOIN workshop_jobs j ON j.id=m.job_id AND j.company_id=m.company_id
         LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id AND v.company_id=j.company_id
         LEFT JOIN workshop_customers c ON c.id=m.customer_id AND c.company_id=m.company_id
        WHERE m.company_id=$1 ORDER BY m.created_at DESC LIMIT 200`, [cid]),
    pool.query(
      `SELECT j.id, v.plate, c.name AS customer_name
         FROM workshop_jobs j
         LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id AND v.company_id=j.company_id
         LEFT JOIN workshop_customers c ON c.id=j.customer_id AND c.company_id=j.company_id
        WHERE j.company_id=$1 AND j.status <> 'cancelled'
        ORDER BY j.received_at DESC LIMIT 300`, [cid]),
    pool.query(
      `SELECT COUNT(*)::int AS n
         FROM workshop_messages
        WHERE company_id=$1 AND status='failed' AND COALESCE(attempt_count,0) >= 5`,
      [cid]),
  ]);
  res.render('workshop_admin/communications', {
    title: 'رسائل العملاء', tab: 'communications', messages: messages.rows, jobs: jobs.rows,
    sent: req.query.sent === '1', error: req.query.error || '',
    finalFailureCount: finalFailures.rows[0].n,
    messaging: workshopMessagingView(await pool.query(
      'SELECT * FROM workshop_message_settings WHERE company_id=$1', [cid]
    ).then((r) => r.rows[0])),
  });
});

router.post('/communications/prepare', requireFlag('communications'), requireWorkshopPermission('prepare_communications'), async (req, res) => {
  const cid = req.company.id, jobId = int(req.body && req.body.job_id);
  const job = (await pool.query(
    `SELECT j.*, v.plate, c.name AS customer_name, c.phone AS customer_phone,
            co.company_name, a.token
       FROM workshop_jobs j
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id AND v.company_id=j.company_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id AND c.company_id=j.company_id
       JOIN companies co ON co.id=j.company_id
       LEFT JOIN workshop_job_access a ON a.job_id=j.id AND a.company_id=j.company_id
      WHERE j.id=$1 AND j.company_id=$2 ORDER BY a.created_at DESC NULLS LAST LIMIT 1`,
    [jobId, cid])).rows[0];
  if (job) {
    const eventKey = text(req.body && req.body.event_key, 40) || 'received';
    const body = text(req.body && req.body.body, 2000) ||
      defaultWorkshopMessage(job, eventKey, job.token ? `/workshop/status/${job.token}` : null);
    const inserted = (await pool.query(
      `INSERT INTO workshop_messages
        (company_id, job_id, customer_id, channel, recipient, event_key, body)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [cid, job.id, job.customer_id, ['whatsapp','sms'].includes(req.body.channel) ? req.body.channel : 'whatsapp',
       job.customer_phone, eventKey, body])).rows[0];
    if (inserted && req.body.send_now === '1') {
      await deliverWorkshopMessage(cid, inserted.id);
    }
  }
  res.redirect('/workshop/communications');
});

router.post('/communications/:id/send', requireFlag('communications'), requireWorkshopPermission('send_communications'), async (req, res) => {
  const result = await deliverWorkshopMessage(req.company.id, int(req.params.id));
  const suffix = result.ok ? 'sent=1' : 'error=send';
  res.redirect((req.get('referer') || '/workshop/communications').split('?')[0] + '?' + suffix);
});

router.post('/communications/:id/retry', requireFlag('communications'), requireWorkshopPermission('send_communications'), async (req, res) => {
  const result = await deliverWorkshopMessage(req.company.id, int(req.params.id), true);
  const suffix = result.ok ? 'sent=1' : 'error=retry';
  res.redirect((req.get('referer') || '/workshop/communications').split('?')[0] + '?' + suffix);
});

// This legacy endpoint is intentionally not a success transition. Opening a
// deep link or clicking a button cannot prove delivery at the provider.
router.post('/communications/:id/sent', requireFlag('communications'), requireWorkshopPermission('send_communications'), async (req, res) => {
  await pool.query(
    `UPDATE workshop_messages SET status='prepared', sent_at=NULL,
            error='manual send was not verified by a provider'
      WHERE id=$1 AND company_id=$2`, [int(req.params.id), req.company.id]);
  res.redirect(req.get('referer') || '/workshop/communications');
});

// ── Warranty returns / claims ───────────────────────────────────────────────
router.get('/warranty-claims', requireFlag('warranty_claims'), requireWorkshopPermission('view_warranty_claims'), async (req, res) => {
  const cid = req.company.id;
  const [claims, jobs, returnJobs] = await Promise.all([
    pool.query(
      `SELECT wc.*, v.plate, c.name AS customer_name
         FROM workshop_warranty_claims wc
         LEFT JOIN workshop_vehicles v ON v.id=wc.vehicle_id AND v.company_id=wc.company_id
         LEFT JOIN workshop_customers c ON c.id=wc.customer_id AND c.company_id=wc.company_id
        WHERE wc.company_id=$1 ORDER BY wc.opened_at DESC LIMIT 300`, [cid]),
    pool.query(
      `SELECT j.id, j.delivered_at, v.plate, c.name AS customer_name
         FROM workshop_jobs j
         LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id AND v.company_id=j.company_id
         LEFT JOIN workshop_customers c ON c.id=j.customer_id AND c.company_id=j.company_id
        WHERE j.company_id=$1 AND j.status='delivered'
        ORDER BY j.delivered_at DESC LIMIT 300`, [cid]),
    pool.query(
      `SELECT j.id, j.status, j.received_at, v.plate, c.name AS customer_name
         FROM workshop_jobs j
         LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id AND v.company_id=j.company_id
         LEFT JOIN workshop_customers c ON c.id=j.customer_id AND c.company_id=j.company_id
        WHERE j.company_id=$1
        ORDER BY j.received_at DESC LIMIT 300`, [cid]),
  ]);
  res.render('workshop_admin/warranty_claims', {
    title: 'مطالبات الضمان وعودة السيارة', tab: 'warranty_claims',
    claims: claims.rows, jobs: jobs.rows, returnJobs: returnJobs.rows,
  });
});

router.post('/warranty-claims', requireFlag('warranty_claims'), requireWorkshopPermission('manage_warranty_claims'), async (req, res) => {
  const cid = req.company.id, jobId = int(req.body && req.body.original_job_id);
  const complaint = text(req.body && req.body.complaint, 1000);
  const original = (await pool.query(
    `SELECT customer_id, vehicle_id FROM workshop_jobs WHERE id=$1 AND company_id=$2`, [jobId, cid])).rows[0];
  if (original && complaint) {
    await pool.query(
      `INSERT INTO workshop_warranty_claims
        (company_id, original_job_id, vehicle_id, customer_id, complaint)
       SELECT $1,$2,$3,$4,$5
        WHERE EXISTS (SELECT 1 FROM workshop_jobs WHERE id=$2 AND company_id=$1)`,
      [cid, jobId, original.vehicle_id, original.customer_id, complaint]);
    await logActivity(pool, cid, jobId, 'warranty_claim_opened', 'تم فتح مطالبة ضمان لعودة السيارة');
  }
  res.redirect('/workshop/warranty-claims');
});

router.post('/warranty-claims/:id/return-job', requireFlag('warranty_claims'), requireWorkshopPermission('manage_warranty_claims'), async (req, res) => {
  const cid = req.company.id, claimId = int(req.params.id);
  const claim = (await pool.query(
    `SELECT wc.*, j.technician_id
       FROM workshop_warranty_claims wc
       LEFT JOIN workshop_jobs j ON j.id=wc.original_job_id AND j.company_id=wc.company_id
      WHERE wc.id=$1 AND wc.company_id=$2`, [claimId, cid])).rows[0];
  if (claim && !claim.return_job_id && claim.vehicle_id) {
    const job = (await pool.query(
      `INSERT INTO workshop_jobs
        (company_id, vehicle_id, customer_id, technician_id, complaint, warranty_months)
       VALUES ($1,$2,$3,$4,$5,0) RETURNING id`,
      [cid, claim.vehicle_id, claim.customer_id, claim.technician_id,
       `عودة ضمان: ${claim.complaint}`])).rows[0];
    await Promise.all([
      ensureJobAccess(pool, cid, job.id),
      ensureInspection(pool, cid, job.id),
      ensureQuality(pool, cid, job.id),
    ]);
    await pool.query(
      `UPDATE workshop_warranty_claims
          SET return_job_id=$1, status='approved', updated_at=now()
        WHERE id=$2 AND company_id=$3`, [job.id, claimId, cid]);
    await logActivity(pool, cid, job.id, 'warranty_return_job_created', `تم فتح أمر عودة من مطالبة الضمان #${claimId}`);
  }
  res.redirect('/workshop/warranty-claims');
});

router.post('/warranty-claims/:id', requireFlag('warranty_claims'), requireWorkshopPermission('manage_warranty_claims'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id), b = req.body || {};
  const status = ['open','approved','rejected','resolved'].includes(b.status) ? b.status : 'open';
  await pool.query(
    `UPDATE workshop_warranty_claims
        SET status=$1, decision=$2, diagnosis=$3, resolution=$4,
            return_job_id=CASE WHEN $5 IS NULL OR EXISTS
              (SELECT 1 FROM workshop_jobs rj WHERE rj.id=$5 AND rj.company_id=$7) THEN $5 ELSE NULL END,
            closed_at=CASE WHEN $1 IN ('rejected','resolved') THEN now() ELSE NULL END,
            updated_at=now()
      WHERE id=$6 AND company_id=$7`,
    [status, text(b.decision, 500), text(b.diagnosis, 1000), text(b.resolution, 1000),
     int(b.return_job_id), id, cid]);
  res.redirect('/workshop/warranty-claims');
});

router.post('/jobs/:id/quality', requireWorkshopPermission('update_quality'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id), b = req.body || {};
  const exists = await pool.query('SELECT 1 FROM workshop_jobs WHERE id=$1 AND company_id=$2', [id, cid]);
  if (!exists.rows.length) return res.redirect('/workshop/jobs');
  const status = QUALITY_STATUSES.includes(b.status) ? b.status : 'pending';
  const checkedBy = text(b.checked_by, 120);
  await pool.query(
    `UPDATE workshop_quality_checks
        SET status=$1, note=$2,
            checked_by=CASE WHEN $1='pending' THEN NULL ELSE $3 END,
            checked_at=CASE WHEN $1='pending' THEN NULL ELSE now() END,
            updated_at=now()
      WHERE id=$4 AND job_id=$5 AND company_id=$6`,
    [status, text(b.note, 500), checkedBy, int(b.check_id), id, cid]
  );
  await logActivity(pool, cid, id, 'quality_updated', `تم تحديث فحص الجودة إلى ${status}`, checkedBy);
  res.redirect(`/workshop/jobs/${id}?quality_saved=1#quality`);
});

router.post('/jobs/:id/inspection/items', requireFlag('inspections'), requireWorkshopPermission('update_inspection'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id), b = req.body || {};
  const exists = await pool.query('SELECT 1 FROM workshop_jobs WHERE id=$1 AND company_id=$2', [id, cid]);
  if (!exists.rows.length) return res.redirect('/workshop/jobs');
  const allowed = INSPECTION_STATUSES.includes(b.status) ? b.status : 'not_checked';
  await pool.query(
    `UPDATE workshop_inspection_items
        SET status=$1, note=$2, recommendation=$3, estimated_amount=$4,
            customer_visible=$5, updated_at=now()
      WHERE id=$6 AND job_id=$7 AND company_id=$8`,
    [allowed, text(b.note, 500), text(b.recommendation, 500),
      b.estimated_amount === '' ? null : Math.max(0, num(b.estimated_amount, 0)),
      b.customer_visible === '1', int(b.item_id), id, cid]
  );
  await logActivity(pool, cid, id, 'inspection_updated', `تم تحديث بند فحص إلى ${allowed}`);
  res.redirect(`/workshop/jobs/${id}#inspection`);
});

router.post('/jobs/:id/inspection/promote/:itemId', requireFlag('inspections'), requireWorkshopPermission('manage_job_pricing'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id), itemId = int(req.params.itemId);
  const exists = await pool.query('SELECT 1 FROM workshop_jobs WHERE id=$1 AND company_id=$2', [id, cid]);
  if (!exists.rows.length) return res.redirect('/workshop/jobs');
  const item = (await pool.query(
    `SELECT * FROM workshop_inspection_items
      WHERE id=$1 AND job_id=$2 AND company_id=$3`, [itemId, id, cid])).rows[0];
  if (item && !item.promoted_at && (item.recommendation || Number(item.estimated_amount) > 0)) {
    await pool.query(
      `INSERT INTO workshop_job_labour
        (company_id, job_id, description, hours, rate, amount)
       VALUES ($1,$2,$3,0,0,$4)`,
      [cid, id, item.recommendation || item.check_name, Math.max(0, num(item.estimated_amount, 0))]
    );
    await pool.query(
      'UPDATE workshop_inspection_items SET promoted_at=now(), updated_at=now() WHERE id=$1 AND job_id=$2 AND company_id=$3',
      [itemId, id, cid]
    );
    await logActivity(pool, cid, id, 'inspection_promoted', `تم تحويل ${item.check_name} إلى بند في عرض السعر`);
  }
  res.redirect(`/workshop/jobs/${id}#inspection`);
});

// ── Purchasing and reservations ──────────────────────────────────────────────
router.get('/purchasing', requireFlag('purchasing'), requireWorkshopPermission('view_purchasing'), async (req, res) => {
  const cid = req.company.id;
  const [suppliers, orders, items, parts, lowParts] = await Promise.all([
    pool.query('SELECT * FROM workshop_suppliers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
    pool.query(
      `SELECT po.*, s.name AS supplier_name,
              COALESCE(SUM(i.qty_ordered * i.unit_cost),0)::float AS total,
              COUNT(i.id)::int AS item_count
         FROM workshop_purchase_orders po
         LEFT JOIN workshop_suppliers s ON s.id=po.supplier_id AND s.company_id=po.company_id
         LEFT JOIN workshop_purchase_order_items i ON i.purchase_order_id=po.id
        WHERE po.company_id=$1
        GROUP BY po.id, s.name
        ORDER BY po.created_at DESC LIMIT 100`, [cid]),
    pool.query(
      `SELECT i.*, p.qty AS stock_qty, p.part_number
         FROM workshop_purchase_order_items i
         JOIN workshop_parts p ON p.id=i.part_id AND p.company_id=i.company_id
        WHERE i.company_id=$1 ORDER BY i.purchase_order_id, i.id`, [cid]),
    pool.query(
      'SELECT id, name, part_number, qty, avg_cost FROM workshop_parts WHERE company_id=$1 AND is_active ORDER BY name LIMIT 500',
      [cid]),
    pool.query(
      `SELECT id, name, part_number, qty, min_qty
         FROM workshop_parts
        WHERE company_id=$1 AND is_active AND min_qty > 0 AND qty <= min_qty
        ORDER BY qty ASC, name LIMIT 30`, [cid]),
  ]);
  const itemsByOrder = {};
  for (const item of items.rows) (itemsByOrder[item.purchase_order_id] ||= []).push(item);
  res.render('workshop_admin/purchasing', {
    title: 'الموردون والشراء', tab: 'purchasing',
    suppliers: suppliers.rows, orders: orders.rows, itemsByOrder, parts: parts.rows,
    lowParts: lowParts.rows,
  });
});

router.post('/suppliers', requireFlag('purchasing'), requireWorkshopPermission('manage_purchasing'), async (req, res) => {
  const b = req.body || {}, name = text(b.name, 160);
  if (name) {
    await pool.query(
      `INSERT INTO workshop_suppliers (company_id, name, phone, whatsapp, address, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.company.id, name, text(b.phone, 40), text(b.whatsapp, 40), text(b.address, 240), text(b.note, 500)]);
  }
  res.redirect('/workshop/purchasing');
});

router.post('/purchase-orders', requireFlag('purchasing'), requireWorkshopPermission('manage_purchasing'), async (req, res) => {
  const b = req.body || {}, supplierId = int(b.supplier_id);
  const supplier = supplierId && (await pool.query(
    'SELECT id FROM workshop_suppliers WHERE id=$1 AND company_id=$2 AND is_active', [supplierId, req.company.id])).rows[0];
  if (!supplier) return res.redirect('/workshop/purchasing');
  await pool.query(
    `INSERT INTO workshop_purchase_orders (company_id, supplier_id, expected_on, notes)
     VALUES ($1,$2,$3,$4)`,
    [req.company.id, supplierId, b.expected_on || null, text(b.notes, 500)]);
  res.redirect('/workshop/purchasing');
});

router.post('/purchase-orders/:id/items', requireFlag('purchasing'), requireWorkshopPermission('manage_purchasing'), async (req, res) => {
  const cid = req.company.id, poId = int(req.params.id), partId = int(req.body && req.body.part_id);
  const qty = Math.max(0, num(req.body && req.body.qty, 0));
  const unitCost = Math.max(0, num(req.body && req.body.unit_cost, 0));
  const part = partId && (await pool.query(
    'SELECT id, name FROM workshop_parts WHERE id=$1 AND company_id=$2 AND is_active', [partId, cid])).rows[0];
  const po = (await pool.query(
    `SELECT id FROM workshop_purchase_orders
      WHERE id=$1 AND company_id=$2 AND status IN ('draft','ordered')`, [poId, cid])).rows[0];
  if (part && po && qty > 0) {
    await pool.query(
      `INSERT INTO workshop_purchase_order_items
        (company_id, purchase_order_id, part_id, name, qty_ordered, unit_cost)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (purchase_order_id, part_id)
       DO UPDATE SET qty_ordered=workshop_purchase_order_items.qty_ordered + EXCLUDED.qty_ordered,
                     unit_cost=EXCLUDED.unit_cost`,
      [cid, poId, part.id, part.name, qty, unitCost]);
  }
  res.redirect('/workshop/purchasing');
});

router.post('/purchase-orders/:id/status', requireFlag('purchasing'), requireWorkshopPermission('manage_purchasing'), async (req, res) => {
  const status = ['ordered', 'cancelled'].includes(req.body && req.body.status) ? req.body.status : null;
  if (status) await pool.query(
    `UPDATE workshop_purchase_orders SET status=$1, updated_at=now()
      WHERE id=$2 AND company_id=$3 AND status IN ('draft','ordered','partially_received')`,
    [status, int(req.params.id), req.company.id]);
  res.redirect('/workshop/purchasing');
});

router.post('/purchase-orders/:poId/items/:itemId/receive', requireFlag('purchasing'), requireWorkshopPermission('manage_purchasing'), async (req, res) => {
  const cid = req.company.id, poId = int(req.params.poId), itemId = int(req.params.itemId);
  const requested = Math.max(0, num(req.body && req.body.qty, 0));
  if (!requested) return res.redirect('/workshop/purchasing');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(
      `SELECT i.*, po.status AS po_status, p.qty AS stock_qty, p.avg_cost
         FROM workshop_purchase_order_items i
         JOIN workshop_purchase_orders po ON po.id=i.purchase_order_id AND po.company_id=i.company_id
         JOIN workshop_parts p ON p.id=i.part_id AND p.company_id=i.company_id
        WHERE i.id=$1 AND i.purchase_order_id=$2 AND i.company_id=$3
          AND po.status IN ('ordered','partially_received')
        FOR UPDATE OF i, po, p`, [itemId, poId, cid])).rows[0];
    const remaining = row ? Math.max(0, Number(row.qty_ordered) - Number(row.qty_received)) : 0;
    const received = Math.min(requested, remaining);
    if (!row || !received) {
      await client.query('ROLLBACK');
      return res.redirect('/workshop/purchasing');
    }
    const oldQty = Math.max(0, Number(row.stock_qty));
    const oldCost = Math.max(0, Number(row.avg_cost));
    const newQty = oldQty + received;
    const avg = round2((oldQty * oldCost + received * Number(row.unit_cost)) / newQty);
    await client.query('UPDATE workshop_parts SET qty=$1, avg_cost=$2 WHERE id=$3 AND company_id=$4',
      [newQty, avg, row.part_id, cid]);
    await client.query(
      `INSERT INTO workshop_part_moves (company_id, part_id, kind, qty, unit_cost, note)
       SELECT $1, p.id, 'purchase_receive', $3, $4, $5
         FROM workshop_parts p
        WHERE p.id=$2 AND p.company_id=$1`,
      [cid, row.part_id, received, row.unit_cost, `استلام أمر شراء #${poId}`]);
    await client.query(
      `UPDATE workshop_purchase_order_items SET qty_received=qty_received+$1 WHERE id=$2 AND company_id=$3`,
      [received, itemId, cid]);
    await client.query(
      `UPDATE workshop_purchase_orders po SET
         status=(SELECT CASE WHEN SUM(qty_received) = 0 THEN 'ordered'
                             WHEN SUM(qty_received) >= SUM(qty_ordered) THEN 'received'
                             ELSE 'partially_received' END
                   FROM workshop_purchase_order_items WHERE purchase_order_id=po.id),
         updated_at=now()
       WHERE po.id=$1 AND po.company_id=$2`, [poId, cid]);
    await client.query('COMMIT');
    await logActivity(pool, cid, null, 'purchase_received', `تم استلام ${received} من أمر شراء #${poId}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[workshop purchase receive]', e.message);
  } finally { client.release(); }
  res.redirect('/workshop/purchasing');
});

router.post('/jobs/:id/parts/reserve', requireFlag('parts'), requireWorkshopPermission('reserve_parts'), async (req, res) => {
  const cid = req.company.id, jobId = int(req.params.id), partId = int(req.body && req.body.part_id);
  const qty = Math.max(0, num(req.body && req.body.qty, 0));
  if (!partId || !qty) return res.redirect(`/workshop/jobs/${jobId}#reservations`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const job = (await client.query(
      'SELECT id FROM workshop_jobs WHERE id=$1 AND company_id=$2 FOR UPDATE', [jobId, cid])).rows[0];
    const part = (await client.query(
      'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 AND is_active FOR UPDATE', [partId, cid])).rows[0];
    const own = (await client.query(
      `SELECT * FROM workshop_part_reservations
        WHERE part_id=$1 AND job_id=$2 AND company_id=$3 FOR UPDATE`, [partId, jobId, cid])).rows[0];
    const other = (await client.query(
      `SELECT COALESCE(SUM(qty),0)::float AS qty FROM workshop_part_reservations
        WHERE part_id=$1 AND company_id=$2 AND status='reserved' AND job_id<>$3`,
      [partId, cid, jobId])).rows[0];
    if (!job || !part || !reservationAvailable(part.qty, other.qty, own && own.qty, qty)) {
      await client.query('ROLLBACK');
      return res.redirect(`/workshop/jobs/${jobId}?reserve=stock#reservations`);
    }
    await client.query(
      `INSERT INTO workshop_part_reservations (company_id, part_id, job_id, qty, status)
       VALUES ($1,$2,$3,$4,'reserved')
       ON CONFLICT (part_id, job_id)
       DO UPDATE SET qty=workshop_part_reservations.qty+EXCLUDED.qty,
                     status='reserved', updated_at=now()`,
      [cid, partId, jobId, qty]);
    await client.query('COMMIT');
    await logActivity(pool, cid, jobId, 'part_reserved', `تم حجز ${qty} من ${part.name}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[workshop reservation]', e.message);
  } finally { client.release(); }
  res.redirect(`/workshop/jobs/${jobId}#reservations`);
});

router.post('/jobs/:id/parts/release/:reservationId', requireFlag('parts'), requireWorkshopPermission('release_parts'), async (req, res) => {
  await pool.query(
    `UPDATE workshop_part_reservations SET status='released', qty=0, updated_at=now()
      WHERE id=$1 AND job_id=$2 AND company_id=$3 AND status='reserved'`,
    [int(req.params.reservationId), int(req.params.id), req.company.id]);
  res.redirect(`/workshop/jobs/${int(req.params.id)}#reservations`);
});

// Add a part to a job. Issuing stock and recording the line are one
// transaction: a part that leaves the shelf without appearing on the job is
// exactly how a workshop loses money it cannot trace.
router.post('/jobs/:id/parts', requireFlag('parts'), requireWorkshopPermission('manage_job_parts'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const b = req.body || {};
  const qty = Math.max(0, num(b.qty, 0));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const job = (await client.query(
      'SELECT id FROM workshop_jobs WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid])).rows[0];
    if (!job || qty <= 0) { await client.query('ROLLBACK'); return res.redirect('/workshop/jobs/' + id); }

    const partId = int(b.part_id);
    let name = text(b.name, 120), unitCost = Math.max(0, num(b.unit_cost, 0));
    let unitPrice = Math.max(0, num(b.unit_price, 0));
    if (partId) {
      const p = (await client.query(
        'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 FOR UPDATE', [partId, cid])).rows[0];
      if (p) {
        name = name || p.name;
        // Cost is captured HERE, at issue. Reading it back from the shelf later
        // would re-price an old job at today's cost and rewrite history.
        unitCost = Number(p.avg_cost);
        if (!unitPrice) unitPrice = Number(p.sell_price);
        const ownReservation = (await client.query(
          `SELECT * FROM workshop_part_reservations
            WHERE part_id=$1 AND job_id=$2 AND company_id=$3 AND status='reserved'
            FOR UPDATE`, [partId, id, cid])).rows[0];
        const reservedOther = (await client.query(
          `SELECT COALESCE(SUM(qty),0)::float AS qty FROM workshop_part_reservations
            WHERE part_id=$1 AND company_id=$2 AND status='reserved' AND job_id<>$3`,
          [partId, cid, id])).rows[0].qty;
        if (!reservationAvailable(p.qty, reservedOther, ownReservation && ownReservation.qty, qty)) {
          await client.query('ROLLBACK');
          return res.redirect(`/workshop/jobs/${id}?err=stock&have=${Math.max(0, Number(p.qty) - Number(reservedOther))}`);
        }
        /* `qty = qty - $1` with no floor issued five from a shelf of two and
         * left the part at minus three. Nothing errored; the parts screen then
         * showed a negative number that no purchase could explain, and every
         * report built on it was wrong from that moment.
         *
         * Unlike an offline pharmacy sale — a fact that already happened at the
         * counter — this is somebody at a desk with the system open. The right
         * answer is to refuse and say what the shelf shows: correcting the
         * count is a normal thing to do, issuing stock that is not there is not.
         */
        const took = await client.query(
          'UPDATE workshop_parts SET qty = qty - $1 WHERE id=$2 AND company_id=$3 AND qty >= $1 RETURNING id',
          [qty, partId, cid]
        );
        if (!took.rows.length) {
          await client.query('ROLLBACK');
          return res.redirect(`/workshop/jobs/${id}?err=stock&have=${Math.max(0, Number(p.qty) || 0)}`);
        }
        await client.query(
          // p.id — the locked row this branch already proved is ours.
          `INSERT INTO workshop_part_moves (company_id, part_id, job_id, kind, qty, unit_cost)
           VALUES ($1,$2,$3,'issue',$4,$5)`, [cid, p.id, id, qty, unitCost]);
        if (ownReservation) {
          const used = Math.min(qty, Number(ownReservation.qty));
          await client.query(
            `UPDATE workshop_part_reservations
                SET qty=qty-$1, status=CASE WHEN qty-$1 <= 0 THEN 'consumed' ELSE 'reserved' END, updated_at=now()
              WHERE id=$2 AND company_id=$3`,
            [used, ownReservation.id, cid]);
        }
      }
    }
    if (name) {
      await client.query(
        // This line is written even when the part is not on our shelf (a part
        // bought for the job and typed by name), so partId is not proven here
        // the way it is inside the branch above — it gets scoped in the
        // statement instead of trusted.
        `INSERT INTO workshop_job_parts (company_id, job_id, part_id, name, qty, unit_cost, unit_price)
         VALUES ($1,$2,${ref('workshop_parts', '$3', '$1')},$4,$5,$6,$7)`, [cid, id, partId, name, qty, unitCost, unitPrice]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[workshop job parts]', e.message);
  } finally { client.release(); }
  res.redirect('/workshop/jobs/' + id);
});

router.post('/jobs/:id/labour', requireWorkshopPermission('manage_job_pricing'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const b = req.body || {};
  const hours = Math.max(0, num(b.hours, 0));
  const rate = Math.max(0, num(b.rate, num(req.settings.labour_rate, 0)));
  // An explicit amount wins over hours × rate: some jobs are quoted as a lump
  // sum and forcing them through an hourly rate invents a number.
  const amount = b.amount !== undefined && String(b.amount).trim() !== ''
    ? Math.max(0, num(b.amount, 0)) : round2(hours * rate);
  const desc = text(b.description, 200);
  if (desc) {
    await pool.query(
      `INSERT INTO workshop_job_labour (company_id, job_id, technician_id, description, hours, rate, amount)
       VALUES ($1,$2,${ref('workshop_technicians', '$3', '$1')},$4,$5,$6,$7)`,
      [cid, id, int(b.technician_id), desc, hours, rate, amount]);
  }
  res.redirect('/workshop/jobs/' + id);
});

router.post('/jobs/:id/update', requireAnyWorkshopPermission('manage_job_details', 'update_technician_note', 'update_job_note'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const b = req.body || {};
  if (!req.canWorkshop('manage_job_details')) {
    await pool.query(
      `UPDATE workshop_jobs SET technician_note=$1
        WHERE id=$2 AND company_id=$3`,
      [text(b.technician_note, 2000), id, cid]
    );
    return res.redirect('/workshop/jobs/' + id);
  }
  await pool.query(
    `UPDATE workshop_jobs SET diagnosis=$1, note=$2, technician_note=$3,
            technician_id=CASE
              WHEN $4 IS NULL THEN NULL
              WHEN EXISTS (
                SELECT 1 FROM workshop_technicians t
                 WHERE t.id=$4 AND t.company_id=$10 AND t.is_active
              ) THEN $4
              ELSE technician_id
            END,
            discount=$5,
            tax_percent=$6, warranty_months=$7, promised_at=$8
      WHERE id=$9 AND company_id=$10`,
    [text(b.diagnosis, 2000), text(b.note, 1000), text(b.technician_note, 2000), int(b.technician_id),
     Math.max(0, num(b.discount, 0)), Math.min(100, Math.max(0, num(b.tax_percent, 0))),
     Math.max(0, int(b.warranty_months, 0) || 0),
      b.promised_at ? new Date(b.promised_at) : null, id, cid]);
  res.redirect('/workshop/jobs/' + id);
});

// Record the customer's approval of the quote. The timestamp is the point:
// "I never agreed to that" is the most common argument in a workshop.
router.post('/jobs/:id/approve', requireWorkshopPermission('manage_job_pricing'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const data = await loadJob(cid, id);
  if (data) {
    const totals = J.jobTotals(data.job, data.parts, data.labour);
    await pool.query(
      `UPDATE workshop_jobs SET status='approved', approved_at=now(), approved_by=$1, quote_total=$2
        WHERE id=$3 AND company_id=$4`,
      [text((req.body || {}).approved_by, 120) || data.job.customer_name, totals.total, id, cid]);
    await logActivity(pool, cid, id, 'quote_approved',
      `تم اعتماد عرض سعر بقيمة ${totals.total}`, text((req.body || {}).approved_by, 120) || data.job.customer_name);
    if (req.flags.has('communications')) {
      try { await prepareWorkshopMessage(cid, id, 'approved'); } catch (e) { console.error('[workshop auto message]', e.message); }
    }
  }
  res.redirect('/workshop/jobs/' + id);
});

router.post('/jobs/:id/status', requireWorkshopPermission('advance_job'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const status = J.STATUSES.includes((req.body || {}).status) ? req.body.status : null;
  if (!status) return res.redirect('/workshop/jobs/' + id);
  // Reception can move the operational queue forward, but approval,
  // cancellation, and delivery remain explicit management decisions.
  if (!req.canWorkshop('manage_job_pricing')
      && !['diagnosing', 'in_progress', 'done', 'ready_for_pickup'].includes(status)) {
    return res.status(403).send(
      res.locals.t ? res.locals.t('wsh.err.role') : 'هذه العملية غير متاحة حسب دورك في الورشة.'
    );
  }

  let data = await loadJob(cid, id);
  if (!data) return res.redirect('/workshop/jobs');
  // Existing job cards predate the checklist. Seed them before checking the
  // gate; otherwise an empty child table would accidentally look "ready".
  await ensureQuality(pool, cid, id);
  data = await loadJob(cid, id);

  if (status === 'delivered') {
    if (!req.canWorkshop('deliver_job')) {
      return res.status(403).send(
        res.locals.t ? res.locals.t('wsh.err.manager') : 'تسليم السيارة متاح لإدارة الورشة فقط.'
      );
    }
    if (!qualityReady(data.quality)) {
      const b = req.body || {};
      const reason = text(b.quality_override_reason, 500);
      const manager = b.quality_override === '1' && reason ? await managerIdentity(req, cid) : null;
      if (!manager) return res.redirect('/workshop/jobs/' + id + '?quality=1#quality');
      await logActivity(pool, cid, id, 'quality_override',
        `تم السماح بالتسليم استثنائيًا. السبب: ${reason}`, manager.name);
    }
    const totals = J.jobTotals(data.job, data.parts, data.labour);
    const check = J.deliveryCheck(totals, { allowCredit: (req.body || {}).allow_credit === '1' });
    // The car is the only leverage a workshop has. Handing it over with money
    // outstanding is allowed, but it has to be a decision, not an accident.
    if (!check.ok) return res.redirect('/workshop/jobs/' + id + '?due=1');
  }

  const stamps = {
    diagnosing: 'diagnosed_at',
    in_progress: 'started_at',
    quality_check: 'quality_checked_at',
    done: 'done_at',
    ready_for_pickup: 'ready_at',
    delivered: 'delivered_at',
  };
  const col = stamps[status];
  const handoverNote = status === 'delivered' ? text((req.body || {}).handover_note, 1000) : null;
  const handoverBy = status === 'delivered' ? text((req.body || {}).handover_by, 120) : null;
  await pool.query(
    `UPDATE workshop_jobs SET status=$1${col ? `, ${col}=COALESCE(${col}, now())` : ''}${status === 'delivered' ? ', handover_note=$4, handover_by=$5' : ''}
      WHERE id=$2 AND company_id=$3`,
    status === 'delivered' ? [status, id, cid, handoverNote, handoverBy] : [status, id, cid]);
  await logActivity(pool, cid, id, 'status_changed', `تغيرت الحالة إلى ${status}`);
  if (req.flags.has('communications') && ['quoted', 'in_progress', 'done', 'delivered'].includes(status)) {
    try { await prepareWorkshopMessage(cid, id, status); } catch (e) { console.error('[workshop auto message]', e.message); }
  }

  // Handover is what schedules the next visit, and what closes any reminder the
  // car came back for.
  if (status === 'delivered' && data.job.vehicle_id && req.flags.has('reminders')) {
    const v = (await pool.query('SELECT * FROM workshop_vehicles WHERE id=$1 AND company_id=$2',
      [data.job.vehicle_id, cid])).rows[0];
    if (v) {
      await pool.query(
        `UPDATE workshop_reminders SET status='closed', closed_at=now()
          WHERE company_id=$1 AND vehicle_id=$2 AND status='open'`, [cid, v.id]);
      const next = J.nextService(v, req.settings, new Date());
      if (next.dueOn || next.dueOdometer) {
        await pool.query(
          `INSERT INTO workshop_reminders (company_id, vehicle_id, job_id, kind, due_on, due_odometer)
           VALUES ($1,$2,$3,'service',$4,$5)`,
          [cid, v.id, id, next.dueOn ? next.dueOn.toISOString().slice(0, 10) : null, next.dueOdometer]);
      }
    }
  }
  if (['delivered', 'cancelled'].includes(status)) {
    await pool.query(
      `UPDATE workshop_part_reservations SET status='released', qty=0, updated_at=now()
        WHERE company_id=$1 AND job_id=$2 AND status='reserved'`, [cid, id]);
  }
  res.redirect('/workshop/jobs/' + id);
});

router.post('/jobs/:id/pay', requireWorkshopPermission('record_payment'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const amount = Math.max(0, num((req.body || {}).amount, 0));
  if (amount > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO workshop_payments (company_id, job_id, customer_id, amount, method)
         SELECT $1, $2, customer_id, $3, $4 FROM workshop_jobs WHERE id=$2 AND company_id=$1`,
        [cid, id, amount, text((req.body || {}).method, 20) || 'cash']);
      await client.query('UPDATE workshop_jobs SET paid = paid + $1 WHERE id=$2 AND company_id=$3',
        [amount, id, cid]);
      await client.query('COMMIT');
      await logActivity(pool, cid, id, 'payment_recorded', `تم تسجيل دفعة بقيمة ${amount}`);
    } catch (e) { await client.query('ROLLBACK'); console.error('[workshop pay]', e.message); }
    finally { client.release(); }
  }
  res.redirect('/workshop/jobs/' + id);
});

// ── Parts ────────────────────────────────────────────────────────────────────
router.get('/parts', requireFlag('parts'), requireWorkshopPermission('view_parts'), async (req, res) => {
  const cid = req.company.id;
  const barcode = text(req.query && req.query.barcode, 80);
  const q = barcode || String(req.query.q || '').trim().slice(0, 60);
  const low = String(req.query.low || '') === '1';
  const params = [cid];
  let where = 'company_id=$1 AND is_active';
  if (barcode) {
    params.push(barcode);
    where += ` AND barcode=$${params.length}`;
  } else if (q) {
    params.push('%' + q + '%');
    where += ` AND (name ILIKE $${params.length} OR part_number ILIKE $${params.length} OR barcode ILIKE $${params.length} OR fits ILIKE $${params.length})`;
  }
  if (low) where += ' AND min_qty > 0 AND qty <= min_qty';
  const rows = await pool.query(
    `SELECT * FROM workshop_parts WHERE ${where} ORDER BY (min_qty > 0 AND qty <= min_qty) DESC, name LIMIT 500`, params);
  const lowCount = await pool.query(
    'SELECT COUNT(*)::int AS n FROM workshop_parts WHERE company_id=$1 AND is_active AND min_qty > 0 AND qty <= min_qty',
    [cid]);
  res.render('workshop_admin/parts', {
    title: res.locals.t('wsh.part.title'), tab: 'parts', parts: rows.rows, q, barcode, low,
    lowCount: lowCount.rows[0].n, error: String(req.query.error || ''),
  });
});

router.post('/parts', requireFlag('parts'), requireWorkshopPermission('manage_parts'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO workshop_parts (company_id, name, part_number, brand, category, unit, qty, min_qty, avg_cost, sell_price, fits, barcode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [req.company.id, name, text(b.part_number, 60), text(b.brand, 60), text(b.category, 60),
       text(b.unit, 20) || 'قطعة', Math.max(0, num(b.qty, 0)), Math.max(0, num(b.min_qty, 0)),
       Math.max(0, num(b.avg_cost, 0)), Math.max(0, num(b.sell_price, 0)), text(b.fits, 200),
       text(b.barcode, 80)]);
  }
  res.redirect('/workshop/parts');
});

// A hardware scanner acts like a keyboard: scan into this field and the
// server takes the same scoped search path as a hand-entered part number.
router.get('/parts/scan', requireFlag('barcodes'), requireWorkshopPermission('view_parts'), async (req, res) => {
  const code = text(req.query && req.query.barcode, 80);
  res.redirect('/workshop/parts' + (code ? `?barcode=${encodeURIComponent(code)}` : ''));
});

// Receiving stock recomputes the moving average. Not the last purchase price:
// the average is what the shelf is actually worth, and pricing a job off the
// newest invoice shows a margin the workshop does not have the moment prices
// move.
router.post('/parts/:id/receive', requireFlag('parts'), requireWorkshopPermission('manage_parts'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const b = req.body || {};
  const qty = Math.max(0, num(b.qty, 0));
  const cost = Math.max(0, num(b.unit_cost, 0));
  if (qty > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const p = (await client.query(
        'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 FOR UPDATE', [id, cid])).rows[0];
      if (p) {
        const oldQty = Math.max(0, Number(p.qty));
        const newQty = oldQty + qty;
        const avg = newQty > 0
          ? round2((oldQty * Number(p.avg_cost) + qty * cost) / newQty)
          : Number(p.avg_cost);
        await client.query('UPDATE workshop_parts SET qty=$1, avg_cost=$2 WHERE id=$3 AND company_id=$4',
          [newQty, avg, id, cid]);
        await client.query(
          `INSERT INTO workshop_part_moves (company_id, part_id, kind, qty, unit_cost, note)
           SELECT $1, p.id, 'receive', $3, $4, $5
             FROM workshop_parts p
            WHERE p.id=$2 AND p.company_id=$1`, [cid, id, qty, cost, text(b.note, 200)]);
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); console.error('[workshop receive]', e.message); }
    finally { client.release(); }
  }
  res.redirect('/workshop/parts');
});

// A physical count is an explicit correction, never an invisible overwrite.
// The movement ledger keeps the before/after reason available for review.
router.post('/parts/:id/adjust', requireFlag('parts'), requireWorkshopPermission('manage_parts'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const counted = Math.max(0, num(req.body && req.body.counted_qty, 0));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const part = (await client.query(
      'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 AND is_active FOR UPDATE', [id, cid])).rows[0];
    if (part) {
      const current = Number(part.qty || 0);
      const delta = round2(counted - current);
      await client.query('UPDATE workshop_parts SET qty=$1 WHERE id=$2 AND company_id=$3', [counted, id, cid]);
      await client.query(
        `INSERT INTO workshop_part_moves (company_id, part_id, kind, qty, unit_cost, note)
         SELECT $1, p.id, 'adjustment', $3, $4, $5
           FROM workshop_parts p
          WHERE p.id=$2 AND p.company_id=$1`,
        [cid, id, delta, Number(part.avg_cost || 0), text(req.body && req.body.note, 240) || `جرد: ${current} → ${counted}`]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[workshop stock adjustment]', e.message);
  } finally { client.release(); }
  res.redirect('/workshop/parts');
});

// Supplier returns reduce available stock and remain distinct from a job issue.
router.post('/parts/:id/return', requireFlag('parts'), requireWorkshopPermission('manage_parts'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  const qty = Math.max(0, num(req.body && req.body.qty, 0));
  if (!qty) return res.redirect('/workshop/parts');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const part = (await client.query(
      'SELECT * FROM workshop_parts WHERE id=$1 AND company_id=$2 AND is_active FOR UPDATE', [id, cid])).rows[0];
    if (!part || Number(part.qty) < qty) {
      await client.query('ROLLBACK');
      return res.redirect('/workshop/parts?error=return_stock');
    }
    await client.query('UPDATE workshop_parts SET qty=qty-$1 WHERE id=$2 AND company_id=$3', [qty, id, cid]);
    await client.query(
      `INSERT INTO workshop_part_moves (company_id, part_id, kind, qty, unit_cost, note)
       SELECT $1, p.id, 'return', $3, $4, $5
         FROM workshop_parts p
        WHERE p.id=$2 AND p.company_id=$1`,
      [cid, id, qty, Number(part.avg_cost || 0), text(req.body && req.body.note, 240)]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[workshop stock return]', e.message);
  } finally { client.release(); }
  res.redirect('/workshop/parts');
});

// ── Service reminders ────────────────────────────────────────────────────────
router.get('/reminders', requireFlag('reminders'), requireWorkshopPermission('view_reminders'), async (req, res) => {
  const cid = req.company.id;
  const rows = await pool.query(
    `SELECT r.*, v.plate, v.make, v.model, v.odometer,
            c.name AS customer_name, c.phone AS customer_phone, c.whatsapp AS customer_whatsapp,
            m.status AS message_status, m.provider_status AS message_provider_status,
            m.error AS message_error, m.delivered_at AS message_delivered_at,
            m.failed_at AS message_failed_at
       FROM workshop_reminders r
       JOIN workshop_vehicles v ON v.id=r.vehicle_id AND v.company_id=r.company_id
       LEFT JOIN workshop_customers c ON c.id=v.customer_id AND c.company_id=r.company_id
       LEFT JOIN workshop_messages m ON m.id=r.reminder_message_id AND m.company_id=r.company_id
      WHERE r.company_id=$1 AND r.status='open'
      ORDER BY r.due_on NULLS LAST LIMIT 300`, [cid]);
  const list = rows.rows.map((r) => ({ ...r, state: J.reminderState(r, r, new Date()) }));
  res.render('workshop_admin/reminders', {
    title: res.locals.t('wsh.rem.title'), tab: 'reminders',
    due: list.filter((r) => r.state.due), upcoming: list.filter((r) => !r.state.due),
  });
});

router.post('/reminders/:id/:action', requireFlag('reminders'), requireWorkshopPermission('manage_reminders'), async (req, res) => {
  const cid = req.company.id, id = int(req.params.id);
  if (req.params.action === 'contacted') {
    await pool.query(
      `UPDATE workshop_reminders
          SET contacted_at=now(), reminder_notified_at=COALESCE(reminder_notified_at, now())
        WHERE id=$1 AND company_id=$2`,
      [id, cid]
    );
  } else if (req.params.action === 'close') {
    await pool.query(`UPDATE workshop_reminders SET status='closed', closed_at=now()
                       WHERE id=$1 AND company_id=$2`, [id, cid]);
  }
  res.redirect('/workshop/reminders');
});

// ── Technicians ──────────────────────────────────────────────────────────────
router.get('/technicians', requireFlag('technicians'), requireWorkshopPermission('view_technicians'), async (req, res) => {
  const rows = await pool.query(
    `SELECT t.*,
            (SELECT COALESCE(SUM(l.amount),0)::float FROM workshop_job_labour l
              WHERE l.technician_id=t.id AND l.created_at >= date_trunc('month', CURRENT_DATE)) AS month_labour
            (SELECT COUNT(*)::int FROM workshop_jobs j
              WHERE j.company_id=t.company_id AND j.technician_id=t.id) AS jobs_count,
            (SELECT COUNT(*)::int FROM workshop_job_labour l
              WHERE l.company_id=t.company_id AND l.technician_id=t.id) AS labour_count,
            (SELECT COUNT(*)::int FROM workshop_time_entries e
              WHERE e.company_id=t.company_id AND e.technician_id=t.id) AS time_count
       FROM workshop_technicians t
      WHERE t.company_id=$1
      ORDER BY t.is_active DESC, t.name`,
    [req.company.id]);
  res.render('workshop_admin/technicians', {
    title: res.locals.t('wsh.tech.title'), tab: 'technicians', technicians: rows.rows,
    error: String(req.query.error || ''),
  });
});

router.post('/technicians', requireFlag('technicians'), requireWorkshopPermission('manage_technicians'), async (req, res) => {
  const b = req.body || {};
  const name = text(b.name, 120);
  if (name) {
    await pool.query(
      `INSERT INTO workshop_technicians (company_id, name, phone, speciality, pay_type, pay_rate, commission_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.company.id, name, text(b.phone, 40), text(b.speciality, 80),
       b.pay_type === 'job' ? 'job' : 'daily', Math.max(0, num(b.pay_rate, 0)),
       Math.min(100, Math.max(0, num(b.commission_pct, 0)))]);
  }
  res.redirect('/workshop/technicians');
});

router.post('/technicians/:id', requireFlag('technicians'), requireWorkshopPermission('manage_technicians'), async (req, res) => {
  const b = req.body || {};
  const id = int(req.params.id);
  const name = text(b.name, 120);
  if (!id || !name) return res.redirect('/workshop/technicians?error=invalid');
  await pool.query(
    `UPDATE workshop_technicians
        SET name=$3, phone=$4, speciality=$5, pay_type=$6, pay_rate=$7, commission_pct=$8
      WHERE id=$1 AND company_id=$2`,
    [id, req.company.id, name, text(b.phone, 40), text(b.speciality, 80),
      b.pay_type === 'job' ? 'job' : 'daily',
      Math.max(0, num(b.pay_rate, 0)), Math.min(100, Math.max(0, num(b.commission_pct, 0)))]
  );
  res.redirect('/workshop/technicians?saved=1');
});

router.post('/technicians/:id/toggle', requireFlag('technicians'), requireWorkshopPermission('manage_technicians'), async (req, res) => {
  await pool.query(
    `UPDATE workshop_technicians SET is_active=NOT is_active
      WHERE id=$1 AND company_id=$2`,
    [int(req.params.id), req.company.id]
  );
  res.redirect('/workshop/technicians');
});

router.post('/technicians/:id/delete', requireFlag('technicians'), requireWorkshopPermission('manage_technicians'), async (req, res) => {
  const client = await pool.connect();
  try {
    const cid = req.company.id;
    const id = int(req.params.id);
    await client.query('BEGIN');
    const technician = await client.query(
      'SELECT id FROM workshop_technicians WHERE id=$1 AND company_id=$2 FOR UPDATE',
      [id, cid]
    );
    if (!technician.rows[0]) {
      await client.query('ROLLBACK');
      return res.redirect('/workshop/technicians?error=not_found');
    }
    const refs = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM workshop_jobs WHERE company_id=$1 AND technician_id=$2) +
         (SELECT COUNT(*) FROM workshop_job_labour WHERE company_id=$1 AND technician_id=$2) +
         (SELECT COUNT(*) FROM workshop_time_entries WHERE company_id=$1 AND technician_id=$2) AS total`,
      [cid, id]
    );
    if (Number(refs.rows[0].total) > 0) {
      await client.query('ROLLBACK');
      return res.redirect('/workshop/technicians?error=linked');
    }
    await client.query('DELETE FROM workshop_technicians WHERE id=$1 AND company_id=$2', [id, cid]);
    await client.query('COMMIT');
    res.redirect('/workshop/technicians?deleted=1');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    if (e && e.code === '23503') return res.redirect('/workshop/technicians?error=linked');
    console.error('[workshop technician delete]', e.message);
    res.redirect('/workshop/technicians?error=failed');
  } finally {
    client.release();
  }
});

// ── Invoices ─────────────────────────────────────────────────────────────────
router.get('/invoices', requireFlag('invoices'), requireWorkshopPermission('view_invoices'), async (req, res) => {
  const cid = req.company.id;
  const q = String(req.query.q || '').trim().slice(0, 80);
  const status = J.STATUSES.includes(String(req.query.status)) ? String(req.query.status) : '';
  const customerId = int(req.query.customer_id);
  const [list, customers] = await Promise.all([
    loadWorkshopInvoiceRows(cid, { q, status, customerId }),
    pool.query('SELECT id, name, phone FROM workshop_customers WHERE company_id=$1 ORDER BY name', [cid]),
  ]);
  res.render('workshop_admin/invoices', {
    title: res.locals.t('wsh.inv.title'), tab: 'invoices', rows: list, J, q, status,
    customerId: customerId || '', customers: customers.rows,
    sum: {
      total: round2(list.reduce((a, r) => a + r.totals.total, 0)),
      paid: round2(list.reduce((a, r) => a + r.totals.paid, 0)),
      due: round2(list.reduce((a, r) => a + r.totals.due, 0)),
      partsMargin: round2(list.reduce((a, r) => a + r.totals.partsMargin, 0)),
      labour: round2(list.reduce((a, r) => a + r.totals.labourRevenue, 0)),
    },
  });
});

router.get('/invoices.csv', requireFlag('invoices'), requireWorkshopPermission('view_invoices'), async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  const status = J.STATUSES.includes(String(req.query.status)) ? String(req.query.status) : '';
  const customerId = int(req.query.customer_id);
  const rows = await loadWorkshopInvoiceRows(req.company.id, { q, status, customerId });
  const lines = [
    ['رقم الأمر', 'الحالة', 'اللوحة', 'العميل', 'تاريخ الاستلام', 'الإجمالي', 'المدفوع', 'المتبقي'],
    ...rows.map((r) => [
      J.jobCode(r.id), r.status, r.plate, r.customer_name, r.received_at,
      r.totals.total, r.totals.paid, r.totals.due,
    ]),
  ];
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="workshop-invoices.csv"');
  res.send('\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\n'));
});

router.get('/customers/:id/statement', requireFlag('invoices'), requireWorkshopPermission('view_invoices'), async (req, res) => {
  const cid = req.company.id, customerId = int(req.params.id);
  const customer = (await pool.query(
    'SELECT id, name, phone, whatsapp, address FROM workshop_customers WHERE id=$1 AND company_id=$2',
    [customerId, cid])).rows[0];
  if (!customer) return res.redirect('/workshop/invoices');
  const [jobs, payments] = await Promise.all([
    loadWorkshopInvoiceRows(cid, { customerId }),
    pool.query(
      `SELECT p.*, j.id AS job_number FROM workshop_payments p
        LEFT JOIN workshop_jobs j ON j.id=p.job_id AND j.company_id=p.company_id
       WHERE p.company_id=$1 AND p.customer_id=$2 ORDER BY p.paid_at DESC LIMIT 500`,
      [cid, customerId]),
  ]);
  const total = round2(jobs.reduce((sum, job) => sum + job.totals.total, 0));
  const paid = round2(payments.rows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  res.render('workshop_admin/customer_statement', {
    title: `كشف حساب ${customer.name}`, tab: 'invoices', customer, jobs,
    payments: payments.rows, total, paid, due: round2(Math.max(0, total - paid)),
    print: String(req.query.print || '') === '1',
  });
});

// ── Expenses ─────────────────────────────────────────────────────────────────
router.get('/expenses', requireFlag('expenses'), requireWorkshopPermission('view_expenses'), async (req, res) => {
  const rows = await pool.query(
    `SELECT * FROM workshop_expenses WHERE company_id=$1 ORDER BY spent_on DESC, id DESC LIMIT 300`,
    [req.company.id]);
  res.render('workshop_admin/expenses', {
    title: res.locals.t('wsh.exp.title'), tab: 'expenses', rows: rows.rows,
    total: round2(rows.rows.reduce((a, r) => a + Number(r.amount || 0), 0)),
  });
});

router.post('/expenses', requireFlag('expenses'), requireWorkshopPermission('manage_expenses'), async (req, res) => {
  const b = req.body || {};
  const amount = Math.max(0, num(b.amount, 0));
  if (amount > 0) {
    await pool.query(
      `INSERT INTO workshop_expenses (company_id, category, description, amount, spent_on)
       VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE))`,
      [req.company.id, text(b.category, 60), text(b.description, 200), amount,
       b.spent_on || null]);
  }
  res.redirect('/workshop/expenses');
});

// ── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports', requireFlag('reports'), requireWorkshopPermission('view_reports'), async (req, res) => {
  const cid = req.company.id;
  const days = Math.min(365, Math.max(7, int(req.query.days, 30)));
  const [summary, faults, parts, expenses, capacity] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS jobs,
              COALESCE(SUM((SELECT SUM(qty*unit_price) FROM workshop_job_parts WHERE job_id=j.id)),0)::float AS parts_rev,
              COALESCE(SUM((SELECT SUM(qty*unit_cost)  FROM workshop_job_parts WHERE job_id=j.id)),0)::float AS parts_cost,
              COALESCE(SUM((SELECT SUM(amount) FROM workshop_job_labour WHERE job_id=j.id)),0)::float AS labour_rev,
              COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(e.ended_at, now())-e.started_at))/3600 * COALESCE(t.pay_rate,0))
                          FROM workshop_time_entries e
                          LEFT JOIN workshop_technicians t ON t.id=e.technician_id AND t.company_id=e.company_id
                         WHERE e.company_id=j.company_id AND e.job_id=j.id
                           AND e.started_at >= CURRENT_DATE - ($2 || ' days')::interval),0)::float AS labour_cost
         FROM workshop_jobs j
        WHERE j.company_id=$1 AND j.status <> 'cancelled'
          AND j.received_at >= CURRENT_DATE - ($2 || ' days')::interval`, [cid, days]),
    pool.query(
      `SELECT lower(trim(complaint)) AS fault, COUNT(*)::int AS n FROM workshop_jobs
        WHERE company_id=$1 AND complaint IS NOT NULL AND trim(complaint) <> ''
          AND received_at >= CURRENT_DATE - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY n DESC LIMIT 10`, [cid, days]),
    pool.query(
      `SELECT p.name, SUM(jp.qty)::float AS qty, SUM(jp.qty*jp.unit_price)::float AS revenue
         FROM workshop_job_parts jp
         JOIN workshop_jobs j ON j.id=jp.job_id
         LEFT JOIN workshop_parts p ON p.id=jp.part_id
        WHERE jp.company_id=$1 AND j.received_at >= CURRENT_DATE - ($2 || ' days')::interval
        GROUP BY p.name ORDER BY qty DESC NULLS LAST LIMIT 10`, [cid, days]),
    pool.query(
      `SELECT COALESCE(SUM(amount),0)::float AS total
         FROM workshop_expenses
        WHERE company_id=$1 AND spent_on >= CURRENT_DATE - ($2 || ' days')::interval`, [cid, days]),
    pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM workshop_work_bays WHERE company_id=$1 AND is_active) AS bays,
          (SELECT COUNT(*)::int FROM workshop_jobs WHERE company_id=$1 AND status NOT IN ('received','diagnosing','quoted','delivered','cancelled')) AS active_jobs,
         COALESCE((SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now())-started_at))/3600)
                     FROM workshop_time_entries
                    WHERE company_id=$1 AND started_at >= CURRENT_DATE - ($2 || ' days')::interval),0)::float AS worked_hours`,
      [cid, days]),
  ]);
  const s = summary.rows[0];
  const expenseTotal = round2(expenses.rows[0].total);
  const c = capacity.rows[0];
  const availableHours = round2(Number(c.bays || 0) * 8 * days);
  res.render('workshop_admin/reports', {
    title: res.locals.t('wsh.rep.title'), tab: 'reports', days,
    summary: {
      jobs: s.jobs,
      partsRevenue: round2(s.parts_rev), partsCost: round2(s.parts_cost),
      partsMargin: round2(s.parts_rev - s.parts_cost),
      labourRevenue: round2(s.labour_rev),
      labourCost: round2(s.labour_cost),
      revenue: round2(s.parts_rev + s.labour_rev),
      expenses: expenseTotal,
      grossAfterParts: round2(s.parts_rev + s.labour_rev - s.parts_cost - s.labour_cost),
      operatingResult: round2(s.parts_rev + s.labour_rev - s.parts_cost - s.labour_cost - expenseTotal),
    },
    faults: faults.rows, topParts: parts.rows,
    capacity: { bays: Number(c.bays || 0), activeJobs: Number(c.active_jobs || 0),
      workedHours: round2(c.worked_hours), availableHours,
      utilization: availableHours ? round2((Number(c.worked_hours || 0) / availableHours) * 100) : 0 },
  });
});

router.get('/reports.csv', requireFlag('reports'), requireWorkshopPermission('view_reports'), async (req, res) => {
  const days = Math.min(365, Math.max(7, int(req.query.days, 30)));
  const rows = await loadWorkshopInvoiceRows(req.company.id, { days });
  const lines = [
    ['رقم الأمر', 'الحالة', 'اللوحة', 'العميل', 'تاريخ الاستلام', 'الإجمالي', 'المدفوع', 'المتبقي'],
    ...rows.map((r) => [
      J.jobCode(r.id), r.status, r.plate, r.customer_name, r.received_at,
      r.totals.total, r.totals.paid, r.totals.due,
    ]),
  ];
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="workshop-report-${days}d.csv"`);
  res.send('\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\n'));
});

// ── Warranty ─────────────────────────────────────────────────────────────────
router.get('/warranty', requireFlag('warranty'), requireWorkshopPermission('view_warranty'), async (req, res) => {
  const cid = req.company.id;
  const rows = await pool.query(
    `SELECT j.id, j.warranty_months, j.delivered_at, v.plate, v.make, v.model,
            c.name AS customer_name, c.phone AS customer_phone
       FROM workshop_jobs j
       LEFT JOIN workshop_vehicles v ON v.id=j.vehicle_id
       LEFT JOIN workshop_customers c ON c.id=j.customer_id
      WHERE j.company_id=$1 AND j.warranty_months > 0 AND j.delivered_at IS NOT NULL
      ORDER BY j.delivered_at DESC LIMIT 300`, [cid]);
  const now = new Date();
  const list = rows.rows.map((r) => {
    // Starts on handover, never on the invoice date. A car invoiced in January
    // and collected in March is under warranty from March.
    const ends = J.addMonths(r.delivered_at, r.warranty_months);
    // Calendar days, not elapsed milliseconds. `ends` is midnight on the last
    // day and `now` is the middle of an afternoon, so the old subtraction made
    // a warranty whose last day is TODAY come out at −1 — and the screen told
    // the workshop it had expired. See J.daysBetween.
    const daysLeft = ends ? J.daysBetween(now, ends) : null;
    return { ...r, ends, daysLeft,
      state: daysLeft == null ? 'unknown' : daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'expiring' : 'active' };
  });
  res.render('workshop_admin/warranty', {
    title: res.locals.t('wsh.wr.title'), tab: 'warranty', rows: list, J,
  });
});

module.exports = router;
module.exports.pool = pool;
module.exports.helpers = {
  num, int, text, round2, requireFlag, queueServiceReminderMessages,
  campaignRecipient, campaignAudienceCondition,
};
