// Paid add-ons.
//
// Modules are capability switches the platform gives away. Add-ons are
// different: each use costs us money (AI inference), so they are billed
// separately, can expire, and carry a monthly quota. Keeping them in their own
// table means a free module can never accidentally hand a clinic something we
// pay per call for.
//
// The quota counter resets by comparing the stored 'YYYY-MM' against the
// current Cairo month rather than by a scheduled job — a reset that depends on
// a cron is a reset that silently stops happening.
'use strict';

const ADDONS = [
  {
    key: 'voice_booking',
    label: 'الحجز الصوتي بالذكاء الاصطناعي',
    icon: '🎙️',
    desc: 'المريض يبعت رسالة صوتية بدل ما يكتب — النظام يفهمها ويحجز الموعد. '
        + 'مدفوعة لأن كل رسالة ليها تكلفة تشغيل.',
    defaultQuota: 200,
  },
];

const BY_KEY = new Map(ADDONS.map((a) => [a.key, a]));

function cairoMonth(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit',
  }).format(now).slice(0, 7);
}

/**
 * Current state of one add-on for a clinic.
 * @returns {Promise<{active:boolean, reason:string, used:number, quota:number, expiresAt:?string}>}
 */
async function addonState(pool, companyId, key) {
  const off = { active: false, used: 0, quota: 0, expiresAt: null };
  if (!BY_KEY.has(key)) return { ...off, reason: 'unknown' };
  let row;
  try {
    row = (await pool.query(
      'SELECT * FROM clinic_addons WHERE company_id=$1 AND addon_key=$2', [companyId, key]
    )).rows[0];
  } catch (e) {
    return { ...off, reason: 'error' };
  }
  if (!row || !row.enabled) return { ...off, reason: 'not_subscribed' };

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
  if (row.expires_at && String(row.expires_at).slice(0, 10) < today) {
    return { ...off, reason: 'expired', expiresAt: row.expires_at };
  }

  // A stale month means the counter belongs to a previous period — treat it as
  // zero here and let consume() write the reset, so a clinic that never uses
  // the feature does not need a background job to stay correct.
  const month = cairoMonth();
  const used = row.quota_month === month ? row.used_this_month : 0;
  if (used >= row.monthly_quota) {
    return { active: false, reason: 'quota_exhausted', used, quota: row.monthly_quota, expiresAt: row.expires_at };
  }
  return { active: true, reason: 'ok', used, quota: row.monthly_quota, expiresAt: row.expires_at };
}

/**
 * Record one paid use. Returns false if the clinic is not entitled — callers
 * MUST check the return before spending money on an API call.
 */
async function consume(pool, companyId, key) {
  const state = await addonState(pool, companyId, key);
  if (!state.active) return false;
  const month = cairoMonth();
  try {
    await pool.query(
      `UPDATE clinic_addons
          SET used_this_month = CASE WHEN quota_month = $3 THEN used_this_month + 1 ELSE 1 END,
              quota_month = $3,
              updated_at = now()
        WHERE company_id = $1 AND addon_key = $2`,
      [companyId, key, month]
    );
  } catch (e) {
    console.error('[addon consume]', key, e.message);
    return false;
  }
  return true;
}

// Express guard. Sends the clinic to the add-on page rather than a dead end, so
// "why is this not working" answers itself.
function requireAddon(pool, key) {
  return async (req, res, next) => {
    const state = await addonState(pool, req.company.id, key);
    if (state.active) { req.addonState = state; return next(); }
    res.redirect('/clinic/addons?need=' + encodeURIComponent(key) + '&why=' + encodeURIComponent(state.reason));
  };
}

module.exports = { ADDONS, addonState, consume, requireAddon, cairoMonth };
