#!/usr/bin/env node
/**
 * الأدمن بيسجّل اسم وموبايل لأى عضو — «بالظبط كأن العضو سجّلهم بنفسه» (المالك ٢٠٢٦-١٠-١٩).
 *
 * الفحص بيقيس:
 *   ١) `checkAdminProfile` الحقيقية: الاسم أو الرقم لو متسجّلين لعضو **تانى** بيترفضوا
 *      (ده دمج شخصين — له زرار لوحده)، والرقم بيتوحّد قبل المقارنة والحفظ.
 *   ٢) الراوت: صلاحية الأدمن والقرار **قبل** أى كتابة، والتاريخ بينتقل (migrateMemberName).
 *   ٣) القراءة بتتسجّل على اسم الحساب (memberKey) — من غيرها موبايل العضو اللى لسه شايل
 *      الاسم القديم كان بيسجّل قراءاته على اسم مالوش عضو وتضيع.
 *   ٤) قارئ شاشة الأعضاء (الأدمن بيحتسب قراءات لعضو) **مابيبعتش** memberKey — وإلا القراءة
 *      كانت هتتسجّل على الأدمن نفسه.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MB = path.join(ROOT, 'mybible');
const IDENTITY = path.join(MB, 'server/guest-identity.ts');
const ROUTES = path.join(MB, 'server/group-routes.ts');
const VIEW = path.join(MB, 'client/src/pages/GroupView.tsx');
const MEMBERS = path.join(MB, 'client/src/pages/GroupMembers.tsx');
const ADMIN_READER = path.join(MB, 'client/src/components/InlineChapterReader.tsx');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };
if (!fs.existsSync(ROUTES)) { console.log('⏭️  mybible مش موجود'); process.exit(0); }

/* ── ١) القرار ─────────────────────────────────────────────────────────── */
const MEMBERS_ROWS = [
  { id: 1, userName: 'عضو 372', phone: null },
  { id: 2, userName: 'مينا', phone: '+20 101 234 5678' },
  { id: 3, userName: 'عضو 615', phone: '01112223334' },
];
const CASES = [
  // [target, name, phone, ok?, label]
  [1, 'ميري سامي', '01285193286', true, 'اسم ورقم جداد'],
  [1, '  ميري   سامي ', '+20 128 519 3286', true, 'مسافات وكود دولة'],
  [3, 'عضو 615', '01112223334', true, 'نفس اسمه ورقمه (تأكيد)'],
  [1, 'مينا', '01285193286', false, 'اسم عضو تانى'],
  [1, 'ميري سامي', '01012345678', false, 'رقم عضو تانى (بصيغة تانية)'],
  [1, 'ميري سامي', '0128519', false, 'رقم ناقص'],
  [1, '', '01285193286', false, 'من غير اسم'],
];
let results;
try {
  const probe = path.join(require('os').tmpdir(), `admin-profile-${process.pid}.mjs`);
  fs.writeFileSync(probe, `
const m = await import(${JSON.stringify('file://' + IDENTITY)});
const rows = ${JSON.stringify(MEMBERS_ROWS)};
const out = ${JSON.stringify(CASES)}.map(([t, n, p, want, label]) => ({ label, want, d: m.checkAdminProfile(rows, t, n, p) }));
process.stdout.write('@@JSON@@' + JSON.stringify(out));
`, 'utf8');
  const raw = execFileSync(process.execPath, ['--no-warnings', probe], { maxBuffer: 1 << 24 }).toString('utf8');
  fs.unlinkSync(probe);
  results = JSON.parse(raw.slice(raw.indexOf('@@JSON@@') + 8));
} catch (e) {
  console.error('⚠️  مش قادر أشغّل guest-identity.ts (محتاج Node ≥ 22.6): ' + String(e.stderr || e.message).split('\n')[0]);
  process.exit(1);
}
for (const r of results) {
  if (r.d.ok !== r.want) fail(`«${r.label}» المفروض ${r.want ? 'يعدّى' : 'يترفض'} — ${r.d.message || 'عدّى'}`);
  if (!r.d.ok && !r.d.message) fail(`«${r.label}» اترفض من غير رسالة للأدمن`);
}
const ok2 = results.find((r) => r.label === 'مسافات وكود دولة');
if (ok2 && ok2.d.ok && (ok2.d.phone !== '01285193286' || ok2.d.userName !== 'ميري سامي')) {
  fail('الاسم/الرقم مابيتوحّدوش قبل الحفظ — الرقم لازم يتحفظ بالشكل المحلى (٠١…)');
}

/* ── ٢) الراوت ──────────────────────────────────────────────────────────── */
const strip = (f) => fs.readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
const src = strip(ROUTES);
const at = src.indexOf("'/api/groups/:code/members/:memberName/profile'");
if (at < 0) fail('راوت تسجيل الاسم والموبايل (…/members/:memberName/profile) مش موجود');
else {
  const body = src.slice(at, src.indexOf('app.', at + 60));
  const firstWrite = Math.min(...[...body.matchAll(/\b(?:migrateMemberName|db\.update|db\.delete|db\.insert|pool\.query)\s*\(/g)].map((m) => m.index));
  const auth = body.indexOf('isAdminByLeaderKey(');
  const decide = body.indexOf('checkAdminProfile(');
  if (auth < 0 || auth > firstWrite) fail('الراوت بيكتب قبل ما يتأكد إن اللى طالب أدمن');
  if (decide < 0 || decide > firstWrite) fail('الراوت بيكتب قبل checkAdminProfile — ممكن يدمج شخصين');
  if (!/migrateMemberName\(group\.id, target\.userName, userName\)/.test(body)) fail('تاريخ العضو مابينتقلش للاسم الجديد');
  if (!/groupGuestTokens\)\.set\(\{ phone \}\)/.test(body)) fail('رقم الضيف مابيتحفظش فى توكن الضيف زى «سجّل اسمك»');
}

/* ── ٣) القراءة على اسم الحساب ─────────────────────────────────────────── */
for (const route of ["'/api/groups/:code/reading'", "'/api/groups/:code/assignments/:assignmentId/read'"]) {
  const i = src.indexOf(route);
  const body = i < 0 ? '' : src.slice(i, i + 900);
  if (!/const userName = await readerName\(group\.id, req\.body\)/.test(body)) {
    fail(`${route} بياخد الاسم من الموبايل مش من الحساب (readerName)`);
  }
}
{
  // «مش عاوز غلط يأثر على قراءات الأعضاء»: الاسم اللى من الموبايل بيكسب لو هو اسم صاحب المفتاح،
  // والتغيير بس لو المفتاح لعضو واحد
  const rn = src.slice(src.indexOf('async function readerName('), src.indexOf('async function readerName(') + 700);
  if (!/if \(rows\.some\(\(r\) => r\.userName === body\?\.userName\)\) return body\.userName;\s*if \(rows\.length === 1/.test(rn)) {
    fail('readerName لازم يسيب اسم الموبايل لو هو اسم صاحب المفتاح، ومايغيّرش غير لو المفتاح لعضو واحد');
  }
}
const view = strip(VIEW);
if ((view.match(/\{ userName, memberKey, (?:bookName|book):/g) || []).length < 2) {
  fail('GroupView مابيبعتش memberKey مع القراءة');
}
if (!/const me = \(data as any\)\.me;\s*if \(!me\?\.userName \|\| me\.ambiguous\) return;/.test(view)) {
  fail('GroupView مابياخدش اسم العضو من حسابه بعد ما الأدمن يغيّره');
}

/* ── ٤) قارئ الأدمن مابيبعتش مفتاحه ───────────────────────────────────── */
if (/memberKey/.test(strip(ADMIN_READER))) {
  fail('InlineChapterReader (شاشة الأعضاء — الأدمن بيحتسب لعضو) بيبعت memberKey — القراءة هتتسجّل على الأدمن');
}
if (!/\/profile`/.test(strip(MEMBERS))) fail('شاشة الأعضاء مافيهاش «تسجيل الاسم والموبايل»');

/* ── ٥) رقم عضوية الضيف ماينفعش يتكرر (اسم «عضو N» لشخصين = قراءاتهم بتتخلط) ── */
{
  const gj = src.indexOf("'/api/groups/:code/guest-join'");
  const body = gj < 0 ? '' : src.slice(gj, gj + 4000);
  if (/guestsInGroup\.length \+ 1/.test(body)) fail('رقم الضيف بيتحسب من عدد التوكنات — بيتكرر بعد أى «سجّل اسمك»');
  if (!/MAX\(member_number\)/.test(body)) fail('رقم الضيف لازم يبقى أكبر رقم + ١');
  if (!/pg_advisory_xact_lock/.test(body)) fail('دخولين فى نفس اللحظة ممكن ياخدوا نفس الرقم — محتاج قفل');
  if (!/takenNames\.has\(/.test(body)) fail('الرقم الجديد لازم مايكونش اسم عضو موجود');
}

if (!process.exitCode) console.log('✅ تسجيل اسم وموبايل العضو من الأدمن: القرار والراوت والقراءة على الحساب ورقم الضيف سليمين');
