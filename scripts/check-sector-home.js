#!/usr/bin/env node
/**
 * كل قطاع ليه نظام → الديمو بيفتحه، وصاحبه لاقي رابطه.
 *
 * فحص مانوس (٢٠٢٦-٠٩-٢٤): `/demo/nutrition` كان بيفتح `/company/dashboard`
 * (أعمال · بانرات) بدل نظام التغذية — ونفس الحكاية لكل قطاع غير الورشة
 * والعيادة. والأسوأ إن صاحب عيادة التغذية الحقيقي بيدخل نفس اللوحة ومفيش أي
 * رابط لنظامه. الفحص ده بيتأكد من:
 *   · كل نوع في business_types (غير متجر/بورتفوليو) ليه مدخل في SECTOR_HOME،
 *     والمسار ده مركّب فعلاً في server.js (`app.use('<path>'`).
 *   · `/demo/:slug` بيوجّه عن طريق sectorHome مش سلسلة if مكتوبة بإيد.
 *   · القايمة الجانبية وكارت اللوحة بيعرضوا رابط النظام، وcompany.js بيحطّه.
 *
 *   node scripts/check-sector-home.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const { KEYS } = require('../src/lib/business_types');
const { SECTOR_HOME, sectorHome } = require('../src/lib/sector_home');

const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

const server = code('server.js');
const NO_SYSTEM = new Set(['shop', 'portfolio']); // لوحتهم هي /company نفسها

for (const k of KEYS) {
  if (NO_SYSTEM.has(k)) {
    check(`«${k}» مالوش نظام منفصل — مايتحطّش في SECTOR_HOME`, !SECTOR_HOME[k]);
    continue;
  }
  const h = SECTOR_HOME[k];
  check(`نوع «${k}» ليه نظام في SECTOR_HOME`, !!h);
  if (!h) continue;
  check(`«${k}» → ${h.path} مركّب في server.js`,
    server.includes(`app.use('${h.path}',`));
  check(`«${k}» ليه اسم عربي للرابط`, /[؀-ۿ]/.test(h.label || ''));
}
check('sectorHome(نوع مش معروف) = null', sectorHome('portfolio') === null && sectorHome('') === null);

const demo = server.slice(server.indexOf("app.get('/demo/:slug'"));
const demoBody = demo.slice(0, demo.indexOf('\n});'));
check('/demo/:slug بيوجّه بـsectorHome', /sectorHome\(c\.page_type\)/.test(demoBody));
check('/demo/:slug مافيهوش سلسلة قطاعات مكتوبة بإيد',
  !/page_type === '(workshop|clinic|nutrition|gym)'/.test(demoBody));

check('company.js بيحط res.locals.sectorHome',
  /res\.locals\.sectorHome = sectorHome\(res\.locals\.companyPageType\)/.test(code('src/routes/company.js')));
check('القايمة الجانبية فيها رابط النظام',
  /href="<%= sectorHome\.path %>"/.test(code('src/views/company/_layout_top.ejs')));
check('اللوحة فيها كارت النظام',
  /href="<%= sectorHome\.path %>"/.test(code('src/views/company/dashboard.ejs')));

if (errors.length) {
  console.log('❌ check-sector-home:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-sector-home: ${Object.keys(SECTOR_HOME).length} قطاع — الديمو بيفتح النظام، وصاحبه لاقي رابطه في القايمة واللوحة.`);
