#!/usr/bin/env node
/**
 * بايت صفر حرفي جوّه كود المشروع.
 *
 * ملفين كانوا بيستعملوا بايت **صفر خام** كفاصل بين أجزاء مفتاح الكاش —
 * مكتوب في السورس كحرف مش كـescape. الجافاسكريبت بيقراه عادي، بس كل أداة
 * تانية بتقرا الملف على إنه binary:
 *
 *   · `grep` بيقول "Binary file matches" وبيبلع السطر نفسه، فالبحث في
 *     الكود بيفوّت الملف من غير ما حد ياخد باله.
 *   · نص الفروق في Git بيبقى غير مقروء، فالمراجعة بتعدّي على الملف.
 *   · وأي فحص من فحوصنا بيقرا الملفات كنص ممكن يتعامل معاه بشكل غريب.
 *
 * الإصلاح ماغيّرش الفاصل نفسه — `'\u0000'` هو نفس الحرف بالظبط — فمفاتيح
 * الكاش القديمة لسه بتتلاقى. اللي اتغيّر إن الملف بقى نص.
 *
 * القاعدة: **مفيش بايت صفر خام في أي ملف سورس.** لو محتاج الحرف ده، اكتبه
 * escape.
 *
 *   node scripts/check-no-nul.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const SKIP = new Set(['node_modules', '.git', 'public', 'uploads', 'mybible', 'dist', 'coverage']);
const EXT = new Set(['.js', '.ejs', '.json', '.md', '.css', '.html', '.sql', '.txt', '.yml', '.yaml']);
const NUL = 0;

let scanned = 0;
const bad = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (!EXT.has(path.extname(e.name))) continue;
    const buf = fs.readFileSync(full);
    scanned += 1;
    const at = buf.indexOf(NUL);
    if (at !== -1) bad.push(path.relative(ROOT, full) + ' @' + at);
  }
}
walk(ROOT);

console.log(`✅ اتفحص ${scanned} ملف سورس`);
if (bad.length) {
  console.log(`❌ ${bad.length} ملف فيه بايت صفر خام:`);
  bad.forEach((b) => console.log('   · ' + b));
  console.log('\n⚠️  اكتب الحرف escape بدل ما تحطه خام — الملف لازم يفضل نص.');
  process.exit(1);
}
console.log('✅ ومفيش بايت صفر خام في ولا واحد فيهم');
console.log('\nكل ملفات السورس نص يتقرا — grep والـdiff بيشوفوا كل سطر.');
