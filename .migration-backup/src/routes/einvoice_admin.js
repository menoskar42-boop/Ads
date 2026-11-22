// E-invoicing admin, shared by every vertical.
//
// Mounted at /einvoice for any logged-in merchant. It is opt-in: a merchant who
// has never enabled it sees the settings page and nothing else, and no other
// screen in the product changes for them.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const Q = require('../einvoice/queue');
const S = require('../einvoice/sources');
const V = require('../einvoice/vault');
const T = require('../einvoice/transport');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const text = (v, max = 200) => { const s = String(v == null ? '' : v).trim().slice(0, max); return s || null; };
const int = (v, d = null) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

function requireLogin(req, res, next) {
  if (req.session && req.session.companyId) return next();
  res.redirect('/company/login');
}

router.use(requireLogin, async (req, res, next) => {
  try {
    const c = (await pool.query('SELECT * FROM companies WHERE id=$1', [req.session.companyId])).rows[0];
    if (!c || c.is_active === false) return res.redirect('/company/login');
    req.company = c;
    res.locals.company = c;
    req.settings = await Q.settingsFor(pool, c.id);
    res.locals.eiSettings = req.settings;
    next();
  } catch (e) {
    console.error('[einvoice guard]', e.message);
    res.redirect('/company/login');
  }
});

// ── Settings ─────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const st = req.settings;
  const summary = st ? await Q.summary(pool, req.company.id) : null;
  res.render('einvoice/settings', {
    title: 'الفاتورة الإلكترونية',
    st, summary,
    // The stored credentials are never sent to the browser — only a hint that
    // something is stored, so the merchant can tell "saved" from "empty".
    hasClientId: !!(st && st.client_id_enc),
    hasSecret: !!(st && st.client_secret_enc),
    hasSignerToken: !!(st && st.signer_token_enc),
    vaultReady: V.configured(),
    saved: req.query.saved === '1',
    checked: req.query.checked === '1',
  });
});

router.post('/settings', async (req, res) => {
  const b = req.body || {};
  const cid = req.company.id;

  if (!V.configured()) {
    // Refusing is the only safe answer. Storing a taxpayer's API credentials in
    // plaintext because a key is missing would be worse than not storing them.
    return res.redirect('/einvoice?error=vault');
  }

  const enabled = b.enabled === '1';
  const environment = b.environment === 'production' ? 'production' : 'preprod';
  const signingMode = ['none', 'local', 'remote'].includes(b.signing_mode) ? b.signing_mode : 'none';

  // A blank credential field means "leave what is stored" — otherwise every
  // save of an unrelated field would wipe the secret.
  const newClientId = text(b.client_id, 200);
  const newSecret = text(b.client_secret, 400);
  const newSignerToken = text(b.signer_token, 400);

  const cur = req.settings || {};
  const clientIdEnc = newClientId ? V.encrypt(newClientId) : (cur.client_id_enc || null);
  const secretEnc = newSecret ? V.encrypt(newSecret) : (cur.client_secret_enc || null);
  const signerTokenEnc = newSignerToken ? V.encrypt(newSignerToken) : (cur.signer_token_enc || null);

  await pool.query(
    `INSERT INTO einvoice_settings
       (company_id, enabled, environment, tax_id, activity_code, branch_code, issuer_name,
        issuer_governate, issuer_city, issuer_street, issuer_building,
        client_id_enc, client_secret_enc, signing_mode, signer_url, signer_token_enc, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
     ON CONFLICT (company_id) DO UPDATE SET
       enabled=EXCLUDED.enabled, environment=EXCLUDED.environment, tax_id=EXCLUDED.tax_id,
       activity_code=EXCLUDED.activity_code, branch_code=EXCLUDED.branch_code,
       issuer_name=EXCLUDED.issuer_name, issuer_governate=EXCLUDED.issuer_governate,
       issuer_city=EXCLUDED.issuer_city, issuer_street=EXCLUDED.issuer_street,
       issuer_building=EXCLUDED.issuer_building, client_id_enc=EXCLUDED.client_id_enc,
       client_secret_enc=EXCLUDED.client_secret_enc, signing_mode=EXCLUDED.signing_mode,
       signer_url=EXCLUDED.signer_url, signer_token_enc=EXCLUDED.signer_token_enc,
       updated_at=now()`,
    [cid, enabled, environment, text(b.tax_id, 40), text(b.activity_code, 20),
     text(b.branch_code, 20) || '0', text(b.issuer_name, 150), text(b.issuer_governate, 80),
     text(b.issuer_city, 80), text(b.issuer_street, 150), text(b.issuer_building, 40),
     clientIdEnc, secretEnc, signingMode, text(b.signer_url, 300), signerTokenEnc]
  );
  // The chip in every panel reads a cached answer; switching the feature on or
  // off has to change it now, not in a minute.
  require('../middleware/pay_status').forget(cid);
  res.redirect('/einvoice?saved=1');
});

/** Test the connection, so "is it set up?" is answerable without issuing an invoice. */
router.post('/check', async (req, res) => {
  const st = req.settings;
  let out = { ok: false, note: 'الإعدادات فاضية.' };
  if (st) {
    try { out = await T.check(st); }
    catch (e) { out = { ok: false, note: 'مش قادرين نوصل للمنظومة: ' + e.message }; }
  }
  await pool.query(
    `UPDATE einvoice_settings SET last_check_at=now(), last_check_ok=$1, last_check_note=$2
      WHERE company_id=$3`, [out.ok, String(out.note).slice(0, 400), req.company.id]);
  res.redirect('/einvoice?checked=1');
});

// ── Item codes ───────────────────────────────────────────────────────────────
router.get('/codes', async (req, res) => {
  const rows = await pool.query(
    'SELECT * FROM einvoice_item_codes WHERE company_id=$1 ORDER BY label', [req.company.id]);
  res.render('einvoice/codes', { title: 'أكواد الأصناف', rows: rows.rows });
});

router.post('/codes', async (req, res) => {
  const b = req.body || {};
  const label = text(b.label, 200);
  const code = text(b.item_code, 60);
  if (label && code) {
    await pool.query(
      `INSERT INTO einvoice_item_codes (company_id, label, code_type, item_code, unit_type)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (company_id, lower(label)) DO UPDATE SET
         code_type=EXCLUDED.code_type, item_code=EXCLUDED.item_code, unit_type=EXCLUDED.unit_type`,
      [req.company.id, label, b.code_type === 'GS1' ? 'GS1' : 'EGS', code, text(b.unit_type, 10) || 'EA']);
  }
  res.redirect('/einvoice/codes');
});

router.post('/codes/:id/delete', async (req, res) => {
  await pool.query('DELETE FROM einvoice_item_codes WHERE id=$1 AND company_id=$2',
    [int(req.params.id), req.company.id]);
  res.redirect('/einvoice/codes');
});

// ── The queue ────────────────────────────────────────────────────────────────
router.get('/documents', async (req, res) => {
  const cid = req.company.id;
  const status = Q.STATUSES.includes(req.query.status) ? req.query.status : null;
  const params = [cid];
  let where = 'company_id=$1';
  if (status) { params.push(status); where += ` AND status=$${params.length}`; }
  const rows = await pool.query(
    `SELECT * FROM einvoice_documents WHERE ${where} ORDER BY created_at DESC LIMIT 300`, params);
  res.render('einvoice/documents', {
    title: 'المستندات', rows: rows.rows, status, KINDS: S.KINDS,
    summary: await Q.summary(pool, cid), Q,
  });
});

/** Build one document from its source invoice. */
router.post('/build', async (req, res) => {
  const b = req.body || {};
  const out = await Q.build(pool, req.company.id, String(b.kind || ''), int(b.source_id));
  const q = out.ok ? 'built=1' : 'error=' + encodeURIComponent((out.errors || ['فشل'])[0]);
  res.redirect((b.back || '/einvoice/documents') + (String(b.back || '').includes('?') ? '&' : '?') + q);
});

router.post('/documents/:id/submit', async (req, res) => {
  const out = await Q.submit(pool, req.company.id, int(req.params.id), T);
  const q = out.ok ? 'sent=1' : 'error=' + encodeURIComponent(out.error || 'فشل');
  res.redirect('/einvoice/documents?' + q);
});

/** Rebuild after fixing whatever the errors named. */
router.post('/documents/:id/rebuild', async (req, res) => {
  const doc = (await pool.query('SELECT * FROM einvoice_documents WHERE id=$1 AND company_id=$2',
    [int(req.params.id), req.company.id])).rows[0];
  if (doc) await Q.build(pool, req.company.id, doc.source_kind, doc.source_id);
  res.redirect('/einvoice/documents');
});

// ── The report that keeps a merchant out of trouble ──────────────────────────
router.get('/report', async (req, res) => {
  const days = int(req.query.days, 30);
  const rows = await Q.unsubmitted(pool, req.company.id, days);
  res.render('einvoice/report', {
    title: 'فواتير لسه ما اتبعتتش', rows, days, KINDS: S.KINDS,
  });
});

module.exports = router;
