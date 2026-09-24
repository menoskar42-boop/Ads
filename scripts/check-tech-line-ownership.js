#!/usr/bin/env node
/**
 * سيرفس فلو: «بحث برقم التليفون» — الفنى بيقيس الخط اللى الشاشة بتقول إنه بتاعه.
 *
 * ٢٠٢٦-٠٩-٢٤: حسن فتح خط فى كابينته TB07، والشاشة كتبت «القياس متاح فقط لفنى
 * المنطقة — الخط تابع للفنى: حسن عبد الفتاح يعقوب». يعنى قالتله إنه مش هو.
 * السبب إن الاسم المعروض = COALESCE(إسناد MSAN يدوى، فنى الكابينة)، والصلاحية
 * (ownedByMe) كانت:
 *   · بتشترط cabin_code مش فاضى — كابينة من غير كود = مقفولة على فنيها.
 *   · ومابتبصّش على msan_tech_overrides خالص.
 * اتجرّب على PG16 بالاستعلام الحقيقى: ٨ حالات، والقديم وقع فى الاتنين دول بالظبط.
 *
 *   node scripts/check-tech-line-ownership.js
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const SF = path.join(__dirname, '../serviceflow');
const routes = fs.readFileSync(path.join(SF, 'server/routes.ts'), 'utf8');
const ui = fs.readFileSync(path.join(SF, 'client/src/components/PhoneLookupReport.tsx'), 'utf8');

const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };
const i = routes.indexOf('-- ownedByMe: خطوطى أنا');
const expr = i >= 0 ? routes.slice(i, routes.indexOf('AS "ownedByMe"', i)) : '';
check('ownedByMe موجود', !!expr);
check('كابينتى بالسنترال/الرقم حتى لو كود الكابينة فاضى',
  /ctx\.central_name = pl\.central AND ctx\.cabin_number = pl\.cabin_number\s+AND btrim\(ctx\.worker_code\) = ANY\(\$4::text\[\]\)/.test(expr));
check('إسناد MSAN اليدوى باسمى (مطابقة كاملة للاسم)',
  /unnest\(string_to_array\(mto\.tech_name, ','\)\)[\s\S]*?btrim\(n\.name\) = btrim\(\$6::text\)/.test(expr));
check('$6 = اسمى للفنى بس',
  /codes\.own, codes\.covered, req\.user\?\.role === ROLES\.TECH \? \(codes\.techName \|\| ""\) : ""\]/.test(routes));
check('الشاشة بتقول لو حساب الفنى مالوش كود عامل',
  /line\.myWorkerCodeMissing = req\.user\?\.role === ROLES\.TECH && codes\.own\.length === 0;/.test(routes)
  && /line\.myWorkerCodeMissing && \(/.test(ui));

// الاختبار بتاع الملف نفسه (node:test) — لو tsx موجود.
try {
  execFileSync('npx', ['--no-install', 'tsx', '--test', 'server/measure-buttons-visibility.test.ts'],
    { cwd: SF, stdio: 'pipe', timeout: 120000 });
} catch (e) {
  const out = String((e.stdout || '') + (e.stderr || ''));
  if (!/not found|could not determine|ENOENT|npm ERR/i.test(out)) errors.push('measure-buttons-visibility.test.ts وقع:\n' + out.slice(-600));
}

if (errors.length) {
  console.log('❌ check-tech-line-ownership:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-tech-line-ownership: الفنى بيقيس الخط اللى الشاشة بتقول إنه بتاعه.');
