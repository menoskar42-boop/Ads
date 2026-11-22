'use strict';

const { pool } = require('./db');
const { getConfig, getItemsByAsins, publicConfigStatus } = require('./amazon');

const FRESHNESS_HOURS = 24;
const LOCK_KEY = 'deals-amazon-creators-sync-v1';
const FRESHNESS_WARNING_MAX_MS = 6 * 60 * 60 * 1000;
const FRESHNESS_WARNING_MIN_MS = 30 * 60 * 1000;

function freshnessWindowMs() {
  const configured = Number(process.env.DEALS_AMAZON_FRESHNESS_HOURS);
  if (!Number.isFinite(configured)) return FRESHNESS_HOURS * 60 * 60 * 1000;
  return Math.min(FRESHNESS_HOURS, Math.max(1, configured)) * 60 * 60 * 1000;
}

function isFreshAmazonProduct(product, now = Date.now()) {
  if (!product || product.source !== 'AMAZON_API') return true;
  if (!['success', 'partial'].includes(product.sync_status)) return false;
  const until = product.data_fresh_until && new Date(product.data_fresh_until).getTime();
  return Number.isFinite(until) && until > now;
}

function decorateProduct(product, now = Date.now()) {
  const amazon = product && product.source === 'AMAZON_API';
  const fresh = isFreshAmazonProduct(product, now);
  const hasPriceTimestamp = product && product.price_checked_at;
  const hasAvailabilityTimestamp = product && product.availability_checked_at;
  return {
    ...product,
    dynamic_data_fresh: fresh,
    show_price: Boolean(product && product.current_price != null && (!amazon || (fresh && hasPriceTimestamp))),
    show_availability: Boolean(product && product.availability && (!amazon || (fresh && hasAvailabilityTimestamp))),
    sync_status_effective: amazon && !fresh ? 'stale' : (product && product.sync_status) || 'manual',
  };
}

function syncStatusLabel(status) {
  return ({
    manual: 'بيانات يدوية',
    not_configured: 'مصدر Amazon غير مهيأ',
    running: 'جارٍ التحديث',
    success: 'محدّث',
    partial: 'محدّث جزئيًا',
    failed: 'فشل آخر تحديث',
    stale: 'بيانات قديمة',
    skipped: 'تم التخطي',
  })[status] || 'غير معروف';
}

function freshnessWarningWindowMs() {
  return Math.min(FRESHNESS_WARNING_MAX_MS, Math.max(FRESHNESS_WARNING_MIN_MS, freshnessWindowMs() / 4));
}

function buildSyncAlerts({ config, products, recentRuns, warningWindowHours }) {
  const alerts = [];
  const total = Number(products.amazon_total) || 0;
  const expiring = Number(products.amazon_expiring) || 0;
  const stale = Number(products.amazon_stale) || 0;

  if (config.configured && total > 0 && (expiring > 0 || stale > 0)) {
    alerts.push({
      alertKey: 'amazon_data_freshness',
      severity: stale > 0 ? 'critical' : 'warning',
      message: stale > 0
        ? `انتهت صلاحية بيانات ${stale} منتج من Amazon، وهناك ${expiring} منتج آخر يقترب من انتهاء الصلاحية.`
        : `بيانات ${expiring} منتج من Amazon ستقترب من انتهاء الصلاحية خلال ${warningWindowHours} ساعة.`,
      details: { amazonTotal: total, expiring, stale, warningWindowHours },
    });
  }

  const checkedRuns = (recentRuns || []).filter((run) => !['running', 'skipped'].includes(run.status)).slice(0, 2);
  const failedRuns = checkedRuns.filter((run) => Number(run.failure_count) > 0 || run.status === 'failed').length;
  const latestFailureCount = checkedRuns.length ? Number(checkedRuns[0].failure_count) || 0 : 0;
  if (config.configured && total > 0 && (failedRuns >= 2 || latestFailureCount >= 2)) {
    alerts.push({
      alertKey: 'amazon_repeated_failures',
      severity: 'critical',
      message: failedRuns >= 2
        ? 'فشلت مزامنتان متتاليتان لمنتجات Amazon. راجع حالة المزامنة قبل انتهاء صلاحية البيانات.'
        : `فشل تحديث ${latestFailureCount} من منتجات Amazon في آخر مزامنة.`,
      details: { failedRuns, latestFailureCount },
    });
  }

  return alerts;
}

function safeSyncError(error) {
  const code = error && error.code ? String(error.code) : 'SYNC_ERROR';
  const message = error && error.message ? String(error.message) : 'Amazon synchronization failed';
  return `${code}: ${message}`.slice(0, 240);
}

async function createRun(db, triggeredBy) {
  return (await db.query(
    `INSERT INTO deals_sync_runs (source, status, triggered_by)
     VALUES ('AMAZON_API','running',$1) RETURNING id`, [triggeredBy]
  )).rows[0].id;
}

async function finishRun(db, runId, status, counts, errorSummary = null) {
  await db.query(
    `UPDATE deals_sync_runs
        SET status=$1, finished_at=now(), success_count=$2, failure_count=$3,
            skipped_count=$4, error_summary=$5
      WHERE id=$6`,
    [status, counts.success, counts.failure, counts.skipped, errorSummary, runId],
  );
}

async function markNotConfigured(db, rows, now, message) {
  if (!rows.length) return;
  await db.query(
    `UPDATE deals_catalog_products
        SET sync_status='not_configured', sync_error=$1, last_sync_at=$2,
            last_sync_failure_at=$2, data_fresh_until=NULL, current_price=NULL,
            availability=NULL, price_checked_at=NULL, availability_checked_at=NULL,
            updated_at=now()
      WHERE source='AMAZON_API' AND external_id IS NOT NULL`,
    [message, now],
  );
}

async function markFailed(db, row, now, message) {
  await db.query(
    `UPDATE deals_catalog_products
        SET sync_status='failed', sync_error=$1, last_sync_at=$2,
            last_sync_failure_at=$2, data_fresh_until=NULL, current_price=NULL,
            availability=NULL, price_checked_at=NULL, availability_checked_at=NULL,
            updated_at=now()
      WHERE id=$3 AND source='AMAZON_API'`,
    [message, now, row.id],
  );
}

async function markSuccess(db, row, item, now) {
  const freshUntil = new Date(now.getTime() + freshnessWindowMs());
  const status = item.price != null && item.availability ? 'success' : 'partial';
  await db.query(
    `UPDATE deals_catalog_products
        SET image_url=$1, image_alt=COALESCE(image_alt, title),
            current_price=$2, availability=$3,
            price_checked_at=CASE WHEN $2 IS NULL THEN NULL ELSE $5 END,
            availability_checked_at=CASE WHEN $3 IS NULL THEN NULL ELSE $5 END,
            image_checked_at=CASE WHEN $1 IS NULL THEN NULL ELSE $5 END,
            data_fresh_until=$6, sync_status=$4, sync_error=NULL,
            last_sync_at=$5, last_sync_success_at=$5, last_sync_failure_at=NULL,
            amazon_product_url=COALESCE($7, amazon_product_url),
            affiliate_url=COALESCE($8, affiliate_url), updated_at=now()
      WHERE id=$9 AND source='AMAZON_API'`,
    [item.imageUrl, item.price, item.availability, status, now, freshUntil,
      item.detailUrl, item.affiliateUrl, row.id],
  );
  return status;
}

async function syncAmazonCatalog({ db = pool, triggeredBy = 'scheduled', logger = console } = {}) {
  let client = null;
  const runner = typeof db.connect === 'function' ? (client = await db.connect()) : db;
  let runId = null;
  const counts = { success: 0, failure: 0, skipped: 0 };
  const now = new Date();
  try {
    const lock = (await runner.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [LOCK_KEY])).rows[0];
    if (!lock || !lock.locked) {
      try {
        await runner.query(
          `INSERT INTO deals_sync_runs (source, status, finished_at, skipped_count, triggered_by, error_summary)
           VALUES ('AMAZON_API','skipped',now(),1,$1,'A synchronization is already running')`,
          [triggeredBy],
        );
      } catch (_error) { /* Another process owns the lock; never mask the original result. */ }
      return { status: 'skipped', reason: 'already_running', success: 0, failure: 0, skipped: 1 };
    }

    runId = await createRun(runner, triggeredBy);
    const products = (await runner.query(
      `SELECT id, external_id, title, image_url, sync_status
         FROM deals_catalog_products
        WHERE source='AMAZON_API' AND external_id IS NOT NULL
        ORDER BY id`
    )).rows;
    const config = getConfig();
    if (!config.configured) {
      counts.skipped = products.length;
      await markNotConfigured(runner, products, now, 'Amazon Creators API credentials are not configured');
      await finishRun(runner, runId, 'skipped', counts, 'Amazon Creators API credentials are not configured');
      return { status: 'skipped', reason: 'not_configured', ...counts };
    }
    if (!products.length) {
      await finishRun(runner, runId, 'success', counts, null);
      return { status: 'success', ...counts };
    }

    const byAsin = new Map(products.map((product) => [String(product.external_id).toUpperCase(), product]));
    try {
      const items = await getItemsByAsins([...byAsin.keys()]);
      const returned = new Set();
      for (const item of items) {
        const row = byAsin.get(item.asin);
        if (!row) continue;
        returned.add(item.asin);
        await markSuccess(runner, row, item, now);
        counts.success += 1;
      }
      for (const row of products) {
        if (!returned.has(String(row.external_id).toUpperCase())) {
          await markFailed(runner, row, now, 'Amazon did not return this ASIN');
          counts.failure += 1;
        }
      }
    } catch (error) {
      const safeError = safeSyncError(error);
      for (const row of products) {
        await markFailed(runner, row, now, safeError);
        counts.failure += 1;
      }
      logger.error('[deals amazon sync]', safeError);
    }

    const status = counts.failure === 0 ? 'success' : (counts.success ? 'partial' : 'failed');
    await finishRun(runner, runId, status, counts, counts.failure ? 'One or more products failed to refresh' : null);
    return { status, ...counts };
  } catch (error) {
    const safeError = safeSyncError(error);
    if (runId) await finishRun(runner, runId, 'failed', counts, safeError);
    logger.error('[deals amazon sync]', safeError);
    return { status: 'failed', ...counts, error: safeError };
  } finally {
    if (client) {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => {});
      client.release();
    } else {
      await runner.query('SELECT pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => {});
    }
  }
}

async function getSyncDashboard(db = pool) {
  const warningWindowMs = freshnessWarningWindowMs();
  const [config, runs, syncTimes, products] = await Promise.all([
    Promise.resolve(publicConfigStatus()),
    db.query(
      `SELECT * FROM deals_sync_runs
        WHERE source='AMAZON_API' ORDER BY started_at DESC LIMIT 10`
    ),
    db.query(
      `SELECT
         MAX(started_at) FILTER (WHERE status='success') AS last_success_at,
         MAX(started_at) FILTER (WHERE failure_count > 0 OR status='failed') AS last_failure_at
       FROM deals_sync_runs WHERE source='AMAZON_API'`
    ),
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE source='AMAZON_API')::int AS amazon_total,
         COUNT(*) FILTER (WHERE source='AMAZON_API' AND sync_status IN ('success','partial')
            AND data_fresh_until > now())::int AS amazon_fresh,
         COUNT(*) FILTER (WHERE source='AMAZON_API' AND data_fresh_until > now()
            AND data_fresh_until <= now() + ($1::double precision * interval '1 millisecond'))::int AS amazon_expiring,
         COUNT(*) FILTER (WHERE source='AMAZON_API' AND
            (data_fresh_until IS NULL OR data_fresh_until <= now())
            AND sync_status <> 'not_configured')::int AS amazon_stale,
         COUNT(*) FILTER (WHERE source='AMAZON_API' AND sync_status='failed')::int AS amazon_failed,
         COUNT(*) FILTER (WHERE source='AMAZON_API' AND sync_status='not_configured')::int AS amazon_not_configured
       FROM deals_catalog_products`, [warningWindowMs]
    ),
  ]);
  const lastRuns = runs.rows || [];
  const latestTimes = syncTimes.rows[0] || {};
  const alertList = buildSyncAlerts({
    config,
    products: products.rows[0] || {},
    recentRuns: lastRuns,
    warningWindowHours: Math.max(1, Math.round(warningWindowMs / (60 * 60 * 1000))),
  });

  for (const alert of alertList) {
    await db.query(
      `INSERT INTO deals_sync_alerts (alert_key, severity, message, details)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (alert_key) DO UPDATE SET
         first_seen_at = CASE WHEN deals_sync_alerts.is_active THEN deals_sync_alerts.first_seen_at ELSE now() END,
         last_seen_at = now(), severity=EXCLUDED.severity, message=EXCLUDED.message,
         details=EXCLUDED.details, is_active=true, resolved_at=NULL`,
      [alert.alertKey, alert.severity, alert.message, JSON.stringify(alert.details)],
    );
  }
  const activeKeys = alertList.map((alert) => alert.alertKey);
  await db.query(
    `UPDATE deals_sync_alerts SET is_active=false, resolved_at=now()
      WHERE is_active=true AND NOT (alert_key = ANY($1::text[]))`,
    [activeKeys],
  );
  const activeAlerts = await db.query(
    `SELECT alert_key, severity, message, details, first_seen_at, last_seen_at
       FROM deals_sync_alerts WHERE is_active=true ORDER BY severity DESC, first_seen_at ASC`
  );
  return {
    config,
    lastRun: lastRuns[0] || null,
    lastSuccessAt: latestTimes.last_success_at || null,
    lastFailureAt: latestTimes.last_failure_at || null,
    alerts: activeAlerts.rows || [],
    products: products.rows[0] || { amazon_total: 0, amazon_fresh: 0, amazon_expiring: 0, amazon_stale: 0, amazon_failed: 0, amazon_not_configured: 0 },
    freshnessHours: FRESHNESS_HOURS,
    freshnessWarningHours: Math.max(1, Math.round(warningWindowMs / (60 * 60 * 1000))),
  };
}

module.exports = {
  decorateProduct,
  buildSyncAlerts,
  getSyncDashboard,
  isFreshAmazonProduct,
  syncAmazonCatalog,
  syncStatusLabel,
};