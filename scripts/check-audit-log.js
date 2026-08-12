#!/usr/bin/env node
/**
 * "Who deleted that reading?" had no answer. Not a bad answer — none.
 *
 * Three external reviews asked for an audit trail separately (the clinic, the
 * nutrition practice, the radiology tool), for the same reason: this is a named
 * person's health record, and nothing recorded who opened it, changed it or
 * removed something from it.
 *
 * The properties that make a trail worth having, asserted here:
 *
 *   · **append only** — no UPDATE and no DELETE against the log anywhere in the
 *     codebase. A log a user can edit says whatever the last person to edit it
 *     wanted it to say.
 *   · **never breaks the request** — a doctor recording a blood pressure must
 *     not be stopped because the log could not be written, so every write is
 *     caught inside the helper.
 *   · **reads are logged too** — "who opened this file" is half the question.
 *   · **the contents are not copied** — duplicating a prescription into a
 *     second table to protect prescriptions is not a trade worth making.
 *   · **someone can read it** — a log with no screen is a table.
 *
 *   node scripts/check-audit-log.js
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
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const lib = read('src/lib/audit.js');
const clinic = read('src/routes/clinic_admin.js');
const nutrition = read('src/routes/nutrition_admin.js');

/* ── The table ─────────────────────────────────────────────────────────── */
// The table name is interpolated in the source, so this reads the DDL the app
// actually runs rather than the text that produces it.
const { SCHEMA, TABLE } = require('../src/lib/audit');
check('السجل له جدول وindex على الشركة والوقت',
  new RegExp('CREATE TABLE IF NOT EXISTS ' + TABLE).test(SCHEMA)
  && /idx_audit_company_time/.test(SCHEMA) && /idx_audit_patient/.test(SCHEMA));
check('والجدول بيتعمل مع باقي السكيمة',
  /require\('\.\/src\/lib\/audit'\)\.SCHEMA/.test(read('server.js')));
check('الصف بيسجّل: مين ومتى وإيه وعلى مين ومن أي IP',
  /actor_kind/.test(SCHEMA) && /entity/.test(SCHEMA) && /patient_id/.test(SCHEMA)
  && /action/.test(SCHEMA) && /ip TEXT/.test(SCHEMA) && /created_at/.test(SCHEMA));

/* ── Append only ───────────────────────────────────────────────────────── */
{
  // Anywhere in src/, not just here: the point is that no route can rewrite it.
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir + '/' + f.name;
      if (f.isDirectory()) walk(rel);
      else if (f.name.endsWith('.js')) {
        const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        if (/(UPDATE|DELETE FROM)\s+medical_audit_log/i.test(src)) offenders.push(rel);
      }
    }
  };
  walk('src');
  check('مفيش UPDATE ولا DELETE على السجل في أي مكان', offenders.length === 0, offenders.join(', '));
}
check('الكتابة في السجل مابتكسرش الطلب',
  /\.catch\(\(err\) =>/.test(lib) && /console\.error\('\[audit\]'/.test(lib));
check('وبترجع Promise مابترميش', /return Promise\.resolve\(\)/.test(lib));

/* ── It is actually called, on the writes that matter ──────────────────── */
const CLINIC_EVENTS = [
  ["entity: 'vitals'", 'العلامات الحيوية'],
  ["entity: 'note'", 'الملاحظات'],
  ["entity: 'prescription'", 'الروشتات'],
];
for (const [needle, ar] of CLINIC_EVENTS) {
  check(`${ar}: بتتسجّل في السجل`, clinic.includes('audit.log(pool, req, { ' + needle));
}
const NUTRI_EVENTS = [
  ["entity: 'measurement', patientId: id, action: 'create'", 'إضافة قياس'],
  ["entity: 'measurement'", 'حذف قياس'],
  ["entity: 'lab'", 'التحاليل'],
  ["entity: 'patient_login'", 'تغيير كلمة سر المريض'],
];
for (const [needle, ar] of NUTRI_EVENTS) {
  check(`التغذية — ${ar}: بتتسجّل`, nutrition.includes(needle));
}
// Deletion is the event an audit trail exists for.
check('الحذف بيتسجّل مش بس الإضافة',
  /action: 'delete'/.test(nutrition));
// And reading, in both systems.
check('فتح ملف المريض بيتسجّل كمان (العيادة والتغذية)',
  /action: 'view'/.test(clinic) && /action: 'view'/.test(nutrition));

/* ── The contents are not duplicated ───────────────────────────────────── */
check('محتوى الروشتة مابيتنسخش في السجل — العدد بس',
  /meta: \{ medications: meds\.length \}/.test(clinic)
  && !/meta: \{ medications: meds \}/.test(clinic));

/* ── Somebody can read it ──────────────────────────────────────────────── */
check('فيه شاشة بتعرض السجل', /router\.get\('\/audit'/.test(clinic)
  && fs.existsSync(path.join(ROOT, 'src/views/clinic_admin/audit.ejs')));
check('وموصولة من القايمة', /path:'\/clinic\/audit'/.test(read('src/views/clinic_admin/head.ejs')));
check('وبتفلتر بالمريض وبالنوع', /req\.query\.patient/.test(clinic) && /req\.query\.entity/.test(clinic));
// The clinic dashboard is bilingual and the log is part of it.
check('الشاشة بالمفاتيح مش بنص عربي مكتوب',
  !/[؀-ۿ]/.test(read('src/views/clinic_admin/audit.ejs')));

console.log(fail
  ? `\n${fail} مشكلة — من غير سجل، «مين حذف القياس ده؟» مالهاش إجابة.`
  : '\nسجل الوصول: بيتكتب على بيانات المرضى، وبيتقرا، ومحدش يقدر يعدّله.');
process.exit(fail ? 1 : 0);
