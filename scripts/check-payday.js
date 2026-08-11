#!/usr/bin/env node
/**
 * Assert the one invariant every kakeibo money figure rests on:
 *
 *     periodStart <= today < nextPay
 *
 * Everything on the home screen divides by the gap between those two dates —
 * `remaining`, `perDay`, `leftToday`, the forecast. If the period has already
 * ended, `daysLeft` is 0, `spendableDays` clamps to 1, and the app offers a
 * whole month's money as today's allowance. Nobody notices, because the number
 * is plausible and the dates are never shown.
 *
 * That is not hypothetical: paid on the 1st, on 11 August 2026, the old
 * nextPayday() returned 30 July — a date in the past. August 1st 2026 is a
 * Saturday after a Friday, so the payday shift walked it back into July, and
 * "next month's payday" was still behind today. 265 of 22,630 swept days were
 * broken this way, all of them for people paid in the first days of a month.
 *
 * No dependencies and no database: payday.js is pure date arithmetic, so this
 * runs anywhere and takes about a second.
 *
 *   node scripts/check-payday.js
 */
'use strict';
const path = require('path');
const p = require(path.join(__dirname, '..', 'src/kakeibo/payday'));

const ymd = (d) => d.toISOString().slice(0, 10);
const YEAR = 2026;

const profiles = [];
for (const weekend of ['fri_sat', 'fri', 'sat_sun', 'sun', 'none']) {
  for (let day = 1; day <= 28; day++) profiles.push({ salary_type: 'fixed', salary_day: day, weekend, country: 'EG' });
  profiles.push({ salary_type: 'last', weekend, country: 'EG' });
  profiles.push({ salary_type: 'before_last', weekend, country: 'EG' });
  profiles.push({ salary_type: 'irregular', weekend, country: 'EG' });
}

let swept = 0;
const broken = [];
for (const prof of profiles) {
  for (let i = 0; i < 365; i++) {
    const today = new Date(YEAR, 0, 1 + i);
    const start = p.currentPeriodStart(prof, today, new Set());
    // stats.dashboard() asks for the next payday from the day AFTER the period
    // started, so that a payday today opens a new period rather than closing a
    // zero-length one. Mirror that exactly — checking it any other way would
    // test a call the app never makes.
    const from = new Date(start); from.setDate(from.getDate() + 1);
    const next = p.nextPayday(prof, from, new Set());
    swept++;
    if (!(start <= today && today < next)) {
      broken.push(`${prof.salary_type}${prof.salary_day || ''}/${prof.weekend} today=${ymd(today)} period=${ymd(start)}..${ymd(next)}`);
    }
  }
}

// Irregular income has no payday: the period must be the calendar month exactly.
const irregularWrong = [];
for (let m = 0; m < 12; m++) {
  for (const day of [1, 14, 28]) {
    const today = new Date(YEAR, m, day);
    const prof = { salary_type: 'irregular', weekend: 'fri_sat', country: 'EG' };
    const start = p.currentPeriodStart(prof, today, new Set());
    const from = new Date(start); from.setDate(from.getDate() + 1);
    const next = p.nextPayday(prof, from, new Set());
    if (start.getDate() !== 1 || start.getMonth() !== m || next.getDate() !== 1 || ymd(next) <= ymd(start)) {
      irregularWrong.push(`${ymd(today)} -> ${ymd(start)}..${ymd(next)}`);
    }
  }
}

console.log(`فترات مفحوصة: ${swept} (${profiles.length} إعداد راتب × 365 يوم)`);
if (broken.length) {
  console.error(`❌ ${broken.length} فترة بتكسر الشرط periodStart <= today < nextPay`);
  broken.slice(0, 10).forEach((b) => console.error('   - ' + b));
} else {
  console.log('✅ كل فترة: periodStart <= today < nextPay');
}
if (irregularWrong.length) {
  console.error(`❌ الدخل غير الثابت: ${irregularWrong.length} حالة مش شهر تقويمي كامل`);
  irregularWrong.slice(0, 6).forEach((b) => console.error('   - ' + b));
} else {
  console.log('✅ الدخل غير الثابت: الفترة شهر تقويمي من ١ لـ١');
}

if (broken.length || irregularWrong.length) {
  console.error('\nكل رقم في الرئيسية بيتقسم على المدة دي — لو الفترة خلصت، اليوم بياخد فلوس الشهر كله.');
  process.exit(1);
}
console.log('\nحساب الفترات سليم.');
