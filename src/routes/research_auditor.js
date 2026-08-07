// Research Data Auditor — routes.
//
// A standalone, independent tool: it touches no other module and owns no
// database tables. By design it does NOT persist the uploaded dataset — medical
// research data is sensitive, so it is parsed in memory, audited, reported, and
// dropped. The report page carries its own JSON/print exports client-side, so
// nothing sensitive is written to disk or DB.
//
// Flow: GET /research (upload UI) → POST /research/analyze (multipart) → report.
'use strict';

const express = require('express');
const multer = require('multer');

const { parseDataset } = require('../research/parser');
const { runAll } = require('../research/validators');
const { buildReport } = require('../research/report');
const ai = require('../research/ai');

const router = express.Router();

// In-memory only, hard size cap. A research sheet is small; anything huge is a
// mistake or abuse, not a dataset.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 3 },
}).fields([
  { name: 'dataset', maxCount: 1 },
  { name: 'protocol', maxCount: 1 },
  { name: 'guide', maxCount: 1 },
]);

const ALLOWED_DATA = /\.(xlsx|xls|csv)$/i;

// No ads on this tool — it is a utility page, and the report shows sensitive
// derived content. Keeps it AdSense-clean like /apply and /contact.
router.use((req, res, next) => { res.locals.showAds = false; next(); });

router.get('/', (req, res) => {
  res.render('research/upload', {
    title: 'مدقّق بيانات الأبحاث — Research Data Auditor',
    aiEnabled: ai.isEnabled(),
    error: req.query.error ? decodeURIComponent(req.query.error) : null,
  });
});

router.post('/analyze', (req, res) => {
  upload(req, res, async (uErr) => {
    if (uErr) {
      const msg = uErr.code === 'LIMIT_FILE_SIZE' ? 'الملف كبير جداً (الحد ١٥ ميجا).' : 'تعذّر رفع الملف.';
      return res.redirect('/research?error=' + encodeURIComponent(msg));
    }
    const f = req.files && req.files.dataset && req.files.dataset[0];
    if (!f) return res.redirect('/research?error=' + encodeURIComponent('ارفع ملف Excel أو CSV الأول.'));
    if (!ALLOWED_DATA.test(f.originalname || '')) {
      return res.redirect('/research?error=' + encodeURIComponent('النوع المدعوم دلوقتي: xlsx / xls / csv فقط.'));
    }

    // Optional custom rules pasted as JSON. Parsed defensively — a bad ruleset
    // must never break the audit, only be ignored with a note.
    let custom = {};
    let ruleError = null;
    const rawRules = (req.body && req.body.customRules || '').trim();
    if (rawRules) {
      try {
        const parsed = JSON.parse(rawRules);
        custom = {
          rules: Array.isArray(parsed.rules) ? parsed.rules : [],
          // Custom formulas/consistency need functions, which can't come from
          // JSON safely; phase 1 accepts only declarative field rules (min/max/
          // unit/decimals/allowed/integer) from JSON. Documented in the UI.
        };
      } catch (e) { ruleError = 'صيغة قواعد JSON غير صالحة — تم تجاهلها.'; }
    }

    let dataset;
    try {
      dataset = parseDataset(f.buffer, { filename: f.originalname });
    } catch (e) {
      return res.redirect('/research?error=' + encodeURIComponent(e.message || 'تعذّر قراءة الملف.'));
    }
    if (!dataset.rows.length) {
      return res.redirect('/research?error=' + encodeURIComponent('الملف مفيهوش صفوف بيانات.'));
    }

    const analysis = runAll(dataset, custom);
    const report = buildReport(dataset, analysis, null, {
      filename: f.originalname,
      hasProtocol: !!(req.files.protocol && req.files.protocol[0]),
      hasGuide: !!(req.files.guide && req.files.guide[0]),
      generatedAt: new Date().toISOString(),
    });

    // AI explanation is best-effort and never blocks the deterministic report.
    let aiResult = { text: '', model: null };
    try { aiResult = await ai.explain(report); } catch (e) { /* keep going */ }
    report.ai = aiResult.text || null;
    report.meta.aiModel = aiResult.model || null;
    report.meta.aiDisabled = !!aiResult.disabled;

    res.render('research/report', {
      title: 'تقرير التدقيق — ' + (f.originalname || 'dataset'),
      report,
      ruleError,
    });
  });
});

module.exports = router;
