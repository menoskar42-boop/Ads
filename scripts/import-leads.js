#!/usr/bin/env node
/**
 * يستورد ملف بحث عملاء محتملين إلى `crm_leads`.
 *
 *   node scripts/import-leads.js data/leads/alexandria_100.csv manus-alex-100
 *   node scripts/import-leads.js <ملف> <اسم الدفعة> --dry
 *
 * ── يتشغّل مرة ولا عشرة — نفس النتيجة ──────────────────────────────────
 *
 * الاستيراد بيتشغّل تاني في حالات كتير: دفعة تانية في نفس الملف، تصحيح
 * عمود، إعادة تشغيل بعد انقطاع. فالإدخال بيتخطّى أي صف رابط مصدره متسجّل
 * قبل كده (`link`). من غير ده، تشغيلة تانية بتعمل مية صف مكرّر في CRM
 * البايع — وتنضيفهم بالإيد أصعب من إدخالهم.
 *
 * التكرار **مش** على التليفون: الدفعة الأولى فيها ٤ تليفونات من ١٠٠.
 *
 * ── `--dry` بتشتغل من غير قاعدة بيانات ─────────────────────────────────
 *
 * عشان تقدر تشوف اللي هيتسجّل قبل ما تسجّله، ومن غير ما تحتاج DATABASE_URL.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const leadImport = require('../src/lib/lead_import');

/**
 * قارئ CSV بسيط بيحترم الاقتباس.
 *
 * ⚠️ **مش بنستخدم `split(',')`**: عمود العنوان في الدفعة الأولى فيه فواصل
 * جوّه اقتباس («3 Sultan Hussein Street, intersection of…»)، والتقسيم
 * الساذج كان هيزحزح كل الأعمدة اللي بعده — يعني الرابط يروح مكان الثقة.
 * وده النوع اللي بيعدّي من غير خطأ وبيبان بعدين في CRM.
 */
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(head.map((k, i) => [k.trim(), r[i] || ''])));
}

const [file, batch, ...flags] = process.argv.slice(2);
const dry = flags.includes('--dry');

if (!file || !batch) {
  console.error('الاستخدام: node scripts/import-leads.js <ملف.csv> <اسم-الدفعة> [--dry]');
  process.exit(2);
}

const abs = path.isAbsolute(file) ? file : path.join(__dirname, '..', file);
const rows = parseCsv(fs.readFileSync(abs, 'utf8'));
const { leads, skipped, stats } = leadImport.importRows(rows, batch);

console.log(`\nالملف: ${file}  ·  الدفعة: ${batch}`);
console.log(`صفوف: ${stats.total} · جاهز للتسجيل: ${stats.imported} · متخطّى: ${skipped.length}`);
console.log(`فيهم تليفون: ${stats.withPhone} · يمكن التواصل معهم: ${stats.contactable}`);
console.log('بالأولوية:', JSON.stringify(stats.byPriority));
console.log('بالنظام المناسب:', JSON.stringify(stats.byCategory));
if (skipped.length) {
  console.log('\nالمتخطّى:');
  for (const s of skipped.slice(0, 10)) console.log(`  · ${s.row.name || '(بلا اسم)'} — ${s.reason}`);
}

if (dry) {
  console.log('\n(--dry) مافيش حاجة اتكتبت. أول تلاتة كانوا هيتسجّلوا:');
  for (const l of leads.slice(0, 3)) {
    console.log(`  · ${l.name} [${l.priority}] ${l.phone || 'بلا تليفون'} → ${l.category || 'نظام مش محدّد'}`);
  }
  process.exit(0);
}

(async () => {
  const { pool } = require('../src/db');
  let added = 0;
  let already = 0;
  for (const l of leads) {
    /* `WHERE NOT EXISTS` جوّه نفس الجملة — مش `SELECT` وبعدين `INSERT`.
     * التنفيذ على مرحلتين بيسمح بسباق لو الاستيراد اتشغّل مرتين مع بعض،
     * والنتيجة صفين بنفس الرابط. */
    const r = await pool.query(
      `INSERT INTO crm_leads (name, phone, email, business_name, category, link, source, status, priority, notes)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        WHERE NOT EXISTS (SELECT 1 FROM crm_leads WHERE link = $6)
       RETURNING id`,
      [l.name, l.phone, l.email, l.business_name, l.category, l.link,
        l.source, l.status, l.priority, l.notes]
    );
    if (r.rows.length) added += 1; else already += 1;
  }
  console.log(`\n✅ اتسجّل ${added} · موجود قبل كده ${already}`);
  await pool.end();
})().catch((e) => { console.error('❌ فشل الاستيراد:', e.message); process.exit(1); });
