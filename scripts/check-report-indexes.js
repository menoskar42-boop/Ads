#!/usr/bin/env node
/**
 * check-report-indexes — العمود اللي التقرير بيفلتر بيه لازم يكون متفهرس.
 *
 * تقرير «عدد الأعطال فى الألف» كان بياخد دقايق قبل ما يظهر. السبب مكانش
 * الاستعلام معقّد — كان إن الفهرسين الموجودين على complaint_details و
 * remaining_complaints على (phone_number, complain_time)، والتقرير بيفلتر بـ
 * **msan_id**. فكل استعلام فرعى (وفيه واحد **لكل كابينة**) كان بيمسح الجدولين
 * كاملين.
 *
 * الفحص بيقرا **الاستعلام نفسه**، يطلّع الأعمدة اللى بيفلتر بيها فى الجدولين
 * دول، ويتأكد إن ensureSchema بيعمل فهرس **بادئ بالعمود ده**. يعنى لو حد غيّر
 * عمود الفلترة بكرة، الفحص يقع لحد ما يتعمل الفهرس المناسب.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROUTES = path.join(ROOT, 'serviceflow/server/routes.ts');
const DB = path.join(ROOT, 'serviceflow/server/db.ts');
const errors = [];

if (!fs.existsSync(ROUTES) || !fs.existsSync(DB)) {
  console.log('check-report-indexes: مفيش Service Flow — تخطّى');
  process.exit(0);
}
const routes = fs.readFileSync(ROUTES, 'utf8');
const db = fs.readFileSync(DB, 'utf8');

// الجداول اللى بتكبر مع الوقت والتقارير بتفلتر فيها
const HOT = ['complaint_details', 'remaining_complaints'];

const start = routes.indexOf('app.get("/api/reports/cabinet-adsl-faults"');
if (start < 0) {
  errors.push('مالقيتش راوت cabinet-adsl-faults — الاسم اتغيّر؟ الفحص بقى بلا معنى');
} else {
  const body = routes.slice(start, routes.indexOf('app.get("/api/reports/cabinet-adsl-faults/unassigned"', start));
  const wanted = new Map();   // table → Set(columns)
  for (const t of HOT) {
    // FROM <table> <alias> … WHERE <alias>.<col> =
    const m = new RegExp(`FROM\\s+${t}\\s+(\\w+)`, 'g');
    let g;
    while ((g = m.exec(body))) {
      const alias = g[1];
      const after = body.slice(g.index, g.index + 600);
      for (const c of after.matchAll(new RegExp(`\\b${alias}\\.(\\w+)\\s*=`, 'g'))) {
        if (!wanted.has(t)) wanted.set(t, new Set());
        wanted.get(t).add(c[1]);
      }
    }
  }
  if (!wanted.size) {
    errors.push('مالقيتش أى فلترة على الجداول الكبيرة فى التقرير — شكل الاستعلام اتغيّر، راجع الفحص');
  }
  for (const [t, cols] of wanted) {
    for (const col of cols) {
      // فهرس **بادئ** بالعمود ده على الجدول ده
      const re = new RegExp(`CREATE INDEX IF NOT EXISTS\\s+\\w+\\s+ON\\s+${t}\\s*\\(\\s*${col}\\b`);
      if (!re.test(db)) {
        errors.push(`${t}.${col} بيتفلتر بيه فى التقرير ومفيش فهرس بادئ بيه فى ensureSchema — `
          + 'كل استعلام فرعى هيمسح الجدول كله');
      }
    }
  }
}

if (errors.length) {
  console.error('❌ check-report-indexes:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✅ check-report-indexes: أعمدة الفلترة فى التقرير كلها متفهرسة');
