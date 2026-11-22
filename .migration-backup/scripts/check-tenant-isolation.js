#!/usr/bin/env node
/**
 * The most dangerous finding in the external reviews, and the only one they
 * both found independently.
 *
 * A route takes `patient_id` / `doctor_id` / `visit_id` off the URL or the form
 * and writes a row with `company_id` from the session next to it. Nothing
 * checks the two belong together. Change the number in the address bar and one
 * clinic records a vital sign, a prescription, a lab result or an invoice
 * against ANOTHER clinic's patient. The row then belongs to neither: our
 * company_id, their patient. It appears on no file and nobody can account for
 * it — and this is medical data with a person's name on it.
 *
 * Two rules asserted, matching the two shapes an id arrives in:
 *
 *   · a URL id is covered by ownerGuard on the path prefix, so every route
 *     under /patients/<n>/ inherits the check — including routes written after
 *     this file. The bug was never one careless route; it was many routes each
 *     re-deriving the same check, and one of them not.
 *
 *   · a body id is scoped INSIDE the statement that writes it (ref()), not by
 *     a SELECT beforehand. A separate SELECT reads correctly and still races.
 *
 * No database and no dependencies — this reads the routers.
 *
 *   node scripts/check-tenant-isolation.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The helper behaves ────────────────────────────────────────────────── */
const { ref } = require('../src/lib/tenant_scope');
{
  const sql = ref('clinic_visits', '$3', '$1');
  check('ref() يقيّد الصف بالشركة في نفس الجملة',
    /SELECT id FROM clinic_visits WHERE id=\$3 AND company_id=\$1/.test(sql));
  // Table names come from our source, but a typo that reached SQL would be a
  // silent hole rather than an error.
  let threw = false;
  try { ref('clinic_visits; DROP TABLE x', '$1', '$2'); } catch (e) { threw = true; }
  check('واسم جدول غلط بيرمي استثناء مش بيتحط في SQL', threw);
}

/* ── URL ids are guarded on the prefix ─────────────────────────────────── */
const clinic = fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8');
const nutrition = fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_admin.js'), 'utf8');

check('العيادة: كل /patients/<رقم>/ ورا حارس ملكية',
  /router\.use\('\/patients\/:id\(\\\\d\+\)',\s*ownerGuard\(pool, 'clinic_patients'/.test(clinic)
  && /router\.use\('\/patients\/:pid\(\\\\d\+\)',\s*ownerGuard\(pool, 'clinic_patients'/.test(clinic));
check('التغذية: نفس الحارس على /patients/<رقم>/',
  /router\.use\('\/patients\/:id\(\\\\d\+\)',\s*ownerGuard\(pool, 'nutrition_patients'/.test(nutrition));

// The guard has to run before the sub-routers, or a route inside one of them
// reaches the data first.
{
  const g = nutrition.indexOf("ownerGuard(pool, 'nutrition_patients'");
  const sub = nutrition.indexOf("require('./nutrition_plans')");
  check('وحارس التغذية قبل الراوترات الفرعية', g > 0 && sub > 0 && g < sub);
}

/* ── Body ids are scoped inside the write ──────────────────────────────── */
// Every medical write that takes a visit or a doctor off the form.
const SCOPED = [
  ['clinic_vitals', 'العلامات الحيوية'],
  ['clinic_notes', 'الملاحظات'],
  ['clinic_prescriptions', 'الروشتات'],
  ['clinic_visits', 'الزيارات'],
  ['clinic_invoices', 'الفواتير'],
];
for (const [table, ar] of SCOPED) {
  // The statement runs to the closing backtick of the template literal.
  const m = new RegExp('INSERT INTO ' + table + '[\\s\\S]{0,600}?`', 'm').exec(clinic);
  const body = m ? m[0] : '';
  const usesRef = /\$\{ref\(/.test(body);
  const usesExists = /EXISTS \(SELECT 1 FROM clinic_patients WHERE id=\$2 AND company_id=\$1\)/.test(body);
  check(`${ar}: المعرّفات الجاية من الفورم متقيّدة جوّه الجملة`, usesRef || usesExists,
    body ? '' : 'مالقيتش الجملة');
}

// A visit or an invoice must REFUSE a foreign patient, not null it out: both
// rows are the thing the record hangs from.
for (const [table, ar] of [['clinic_visits', 'الزيارة'], ['clinic_invoices', 'الفاتورة']]) {
  const m = new RegExp('INSERT INTO ' + table + '[\\s\\S]{0,600}?`', 'm').exec(clinic);
  check(`${ar} بترفض مريض مش بتاع العيادة دي (مش بتخليه NULL)`,
    !!m && /EXISTS \(SELECT 1 FROM clinic_patients WHERE id=\$2 AND company_id=\$1\)/.test(m[0]));
}
check('ورفض الكتابة بيوصل للمستخدم مش بيعدّي كنجاح',
  /if \(!ins\.rowCount\) return res\.redirect\('\/clinic\/queue\?error=patient'\)/.test(clinic)
  && /if \(!inv\.rows\.length\)[\s\S]{0,120}error=patient/.test(clinic));

// clinic_invoice_items has no company_id column of its own, so its service_id
// is the one link that could point at another clinic's price list.
{
  const m = /INSERT INTO clinic_invoice_items[\s\S]{0,400}?`/.exec(clinic);
  check('بنود الفاتورة: الخدمة متقيّدة بالشركة كمان', !!m && /\$\{ref\('clinic_services'/.test(m[0]));
}

/* ── The old shape must not come back ──────────────────────────────────── */
// `VALUES ($1,$2,$3,` right after a company_id/patient_id column list is the
// exact fingerprint of the bug.
{
  const back = [];
  for (const m of clinic.matchAll(/INSERT INTO (\w+) \(company_id, patient_id, visit_id[^)]*\)\s*\n?\s*VALUES \(\$1,\$2,\$3/g)) {
    back.push(m[1]);
  }
  check('مفيش INSERT رجع ياخد visit_id خام جنب company_id', back.length === 0, back.join(', '));
}

/* ── A failed save must not report success ─────────────────────────────── */
// Root cause ج٣: `catch { console.error }` followed by `redirect('?saved=1')`.
// The server knew the write failed and the page said "done".
{
  const nutrition2 = fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_admin.js'), 'utf8');
  const company = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  const liars = [];
  // A catch that RETURNS has handled it; the success redirect below is then
  // unreachable on failure. Only a catch that falls through is the bug.
  const RE = /catch \([^)]*\) \{([^{}]*)\}\s*\n\s*res\.redirect\('([^']*saved=1)'\)/g;
  for (const [file, src] of [['clinic_admin.js', clinic], ['nutrition_admin.js', nutrition2],
    ['company.js', company]]) {
    for (const m of src.matchAll(RE)) {
      if (!/\breturn\b/.test(m[1])) liars.push(`${file}: ${m[2]}`);
    }
  }
  check('مفيش حفظ فاشل بيقول «اتحفظ»', liars.length === 0, liars.join(' | '));
  check('والعيادة بتحوّل لـerror=save بدل ما تكمّل', /error=save/.test(clinic));
  check('وفيه بانر بيعرضه في كل صفحات العيادة',
    /__qs\.error === 'save'/.test(fs.readFileSync(path.join(ROOT, 'src/views/clinic_admin/head.ejs'), 'utf8')));
}

console.log(fail
  ? `\n${fail} مشكلة — دي بيانات طبية باسم إنسان، والصف بيتكتب على مريض عيادة تانية.`
  : '\nعزل المستأجرين: المعرّفات من الطلب متقيّدة بالشركة في نفس الجملة.');
process.exit(fail ? 1 : 0);
