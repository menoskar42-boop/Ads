#!/usr/bin/env node
/**
 * check-sheet-timezone — «الغلطة بعد ٩ بالليل» (قرار المالك ٢٠٢٦-٠٩-٣٠: «صلّح أى تقرير فيه الغلطة»).
 *
 * أوقات الشيتات (430D تفاصيل/متبقى، ملف التذاكر، أوامر الشغل، وقف الخطوط) بتتخزّن **وقت
 * القاهرة زى ما هو مكتوب فى الشيت** (toDate بيبنى من مكوّنات وقت الحائط والسيرفر TZ=UTC).
 * فتحويلها بـ AT TIME ZONE 'Africa/Cairo' بيزوّد ٣ ساعات تانى: شكوى ١٠:١٧ م يوم ٣٠ بقت
 * ١ أكتوبر، وخط 2568120 ماتحسبش مكرر فى سبتمبر. الصح: AT TIME ZONE 'UTC' (= وقت الشيت).
 * أوقات الموقع نفسه (now()، uploaded_at، regularized_at، flagged_at…) لحظات حقيقية
 * وبتفضل AT TIME ZONE 'Africa/Cairo'.
 *
 *   الاختبار الحقيقى: DATABASE_URL=… npx tsx serviceflow/scripts/test-sheet-time-9pm.mts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'serviceflow', 'server', 'routes.ts');
const lines = fs.readFileSync(file, 'utf8').split('\n');
const SHEET_COLS = /(complain_time|close_time|dispatch_time|complaint_time|close_date|creation_date|latest_complaint|earliest_complaint|prev_time|ref_time|last_time)"?\)?\s+AT TIME ZONE 'Africa\/Cairo'/;
const bad = [];
lines.forEach((l, i) => { if (SHEET_COLS.test(l)) bad.push(`routes.ts:${i + 1}: ${l.trim().slice(0, 110)}`); });
if (bad.length) {
  console.log('❌ check-sheet-timezone: وقت شيت بيتحوّل لتوقيت القاهرة تانى (بيزوّد ٣ ساعات — الشكاوى بعد ٩ م بتروح لليوم اللى بعده). استخدم AT TIME ZONE \'UTC\':');
  bad.forEach((b) => console.log('   · ' + b));
  process.exit(1);
}
console.log('✅ check-sheet-timezone: أوقات الشيتات بتتقرا زى ما هى (وقت القاهرة فى الشيت) — مفيش تحويل مزدوج.');
