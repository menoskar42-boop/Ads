#!/usr/bin/env node
/**
 * check-no-account-mark — الخط اللى ليه رقم أكونت مايفضلش فى «معلّمة بدون أكونت».
 *
 * البلاغ (٢٠٢٦-٠٩-٢٩): 882821905 كان فى «معلّمة بدون أكونت» (Customer360) وفى نفس
 * الوقت ليه أكونت 143376379 من شيت 138. الحفظ اليدوى بس كان بيشيل العلامة؛ مزامنة
 * الشيت/الـingest/الـbulk لأ.
 *
 * بيتأكد من:
 *   · trigger على line_accounts (INSERT/UPDATE) بيشيل العلامة — بيغطّى أى مسار، حتى
 *     النشر القديم اللى شايف نفس القاعدة.
 *   · تنضيف مع الإقلاع لللى اتراكم قبل الـtrigger.
 *   · **مفيش** منع لإضافة العلامة على خط ليه أكونت (Customer360 «not exist» بيعلّم
 *     وبعدين بيمسح الأكونت القديم — المنع كان هيسيبه لا أكونت ولا علامة).
 *   · تقرير «معلّمة بدون أكونت» مابيعرضش خط ليه أكونت.
 *
 *   الاختبار الحقيقى: DATABASE_URL=… npx tsx serviceflow/scripts/test-no-account-mark.mts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SF = path.join(__dirname, '..', 'serviceflow', 'server');
const db = fs.readFileSync(path.join(SF, 'db.ts'), 'utf8');
const routes = fs.readFileSync(path.join(SF, 'routes.ts'), 'utf8');

const errors = [];
const need = (ok, msg) => { if (!ok) errors.push(msg); };

need(/CREATE OR REPLACE FUNCTION sf_drop_no_account_mark\(\) RETURNS trigger[\s\S]*?DELETE FROM lines_no_account WHERE btrim\(full_phone\) = btrim\(NEW\.full_phone\)/.test(db),
  'الدالة sf_drop_no_account_mark لازم تشيل العلامة لما الأكونت يتسجّل.');
need(/CREATE TRIGGER trg_line_accounts_drop_no_account\s+AFTER INSERT OR UPDATE OF account_no, full_phone ON line_accounts/.test(db),
  'الـtrigger على line_accounts (INSERT/UPDATE) اتشال — مزامنة الشيت هترجع تسيب العلامة.');
need(/DELETE FROM lines_no_account na\s+WHERE EXISTS \(SELECT 1 FROM line_accounts la/.test(db),
  'التنضيف مع الإقلاع اتشال.');
need(!/CREATE TRIGGER[^;]*ON lines_no_account/.test(db),
  'ممنوع trigger يمنع العلامة على lines_no_account — بيكسر Customer360 «not exist» (بيعلّم وبعدين بيمسح الأكونت).');
need(/const conds: string\[\] = \[`NOT EXISTS \(SELECT 1 FROM line_accounts la\s+WHERE btrim\(la\.full_phone\) = btrim\(na\.full_phone\)/.test(routes),
  'تقرير «معلّمة بدون أكونت» لازم يستبعد الخط اللى ليه أكونت.');

if (errors.length) {
  console.log('❌ check-no-account-mark:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-no-account-mark: أى أكونت يتسجّل بيشيل علامة «بدون أكونت» — من أى مسار.');
