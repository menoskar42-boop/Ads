'use strict';

const crypto = require('crypto');

const INSPECTION_DEFAULTS = [
  ['السلامة', 'الفرامل الأمامية', 'افحص التيل والأقراص والتسريب'],
  ['السلامة', 'الفرامل الخلفية', 'افحص التيل/الأقمشة والأقراص أو الطنابير'],
  ['الإطارات', 'حالة الإطارات والضغط', 'افحص التآكل والضغط والاستبن'],
  ['السوائل', 'زيت المحرك', 'افحص المستوى واللون والتسريب'],
  ['السوائل', 'سائل التبريد', 'افحص المستوى والتسريب وحالة الخراطيم'],
  ['المحرك', 'البطارية والشحن', 'افحص الجهد والأقطاب والسير'],
  ['التعليق', 'العفشة والتوجيه', 'افحص المساعدين والمقصات والبيضة'],
  ['الإضاءة', 'الأنوار والمساحات', 'افحص الأنوار الأمامية والخلفية والمساحات'],
  ['الهيكل', 'حالة السيارة الخارجية', 'سجّل أي خدوش أو كسر قبل بدء العمل'],
];

const INSPECTION_STATUSES = ['not_checked', 'good', 'attention', 'urgent', 'deferred'];

const QUALITY_DEFAULTS = [
  ['road_test', 'تجربة الطريق أو اختبار التشغيل'],
  ['repair_verified', 'مراجعة الإصلاحات مقابل أمر الشغل'],
  ['fluids_checked', 'مراجعة مستويات السوائل والتسريبات'],
  ['safety_checked', 'فحص السلامة والفرامل والإطارات'],
  ['handover_ready', 'السيارة نظيفة والمفاتيح والمستندات جاهزة'],
];
const QUALITY_STATUSES = ['pending', 'passed', 'failed'];

function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

async function ensureJobAccess(pool, companyId, jobId) {
  const existing = await pool.query(
    'SELECT token FROM workshop_job_access WHERE company_id=$1 AND job_id=$2',
    [companyId, jobId]
  );
  if (existing.rows[0]) return existing.rows[0].token;
  const token = newToken();
  await pool.query(
    `INSERT INTO workshop_job_access (company_id, job_id, token)
     VALUES ($1,$2,$3) ON CONFLICT (job_id) DO NOTHING`,
    [companyId, jobId, token]
  );
  const saved = await pool.query(
    'SELECT token FROM workshop_job_access WHERE company_id=$1 AND job_id=$2',
    [companyId, jobId]
  );
  return saved.rows[0] ? saved.rows[0].token : token;
}

async function ensureInspection(pool, companyId, jobId) {
  const existing = await pool.query(
    'SELECT COUNT(*)::int AS n FROM workshop_inspection_items WHERE company_id=$1 AND job_id=$2',
    [companyId, jobId]
  );
  if (Number(existing.rows[0].n) > 0) return;
  for (const [system, checkName, guidance] of INSPECTION_DEFAULTS) {
    await pool.query(
      `INSERT INTO workshop_inspection_items
        (company_id, job_id, system, check_name, guidance)
       VALUES ($1,$2,$3,$4,$5)`,
      [companyId, jobId, system, checkName, guidance]
    );
  }
}

async function ensureQuality(pool, companyId, jobId) {
  for (const [checkKey, checkName] of QUALITY_DEFAULTS) {
    await pool.query(
      `INSERT INTO workshop_quality_checks (company_id, job_id, check_key, check_name)
       VALUES ($1,$2,$3,$4) ON CONFLICT (job_id, check_key) DO NOTHING`,
      [companyId, jobId, checkKey, checkName]
    );
  }
}

function qualityReady(items) {
  const required = (items || []).filter((item) => item.required !== false);
  return required.length > 0 && required
    .every((item) => item.status === 'passed');
}

function reservationAvailable(stockQty, reservedByOthers, ownReservation, wanted) {
  return Number(stockQty || 0) - Number(reservedByOthers || 0) - Math.max(0, Number(wanted || 0) - Number(ownReservation || 0)) >= 0;
}

async function logActivity(pool, companyId, jobId, action, details, actorName) {
  try {
    await pool.query(
      `INSERT INTO workshop_activity (company_id, job_id, action, details, actor_name)
       VALUES ($1,$2,$3,$4,$5)`,
      [companyId, jobId || null, action, details || null, actorName || 'النظام']
    );
  } catch (err) {
    // Activity should never turn a successful workshop operation into a failure.
    console.error('[workshop activity]', err.message);
  }
}

module.exports = {
  INSPECTION_DEFAULTS,
  INSPECTION_STATUSES,
  QUALITY_DEFAULTS,
  QUALITY_STATUSES,
  ensureJobAccess,
  ensureInspection,
  ensureQuality,
  qualityReady,
  reservationAvailable,
  logActivity,
};