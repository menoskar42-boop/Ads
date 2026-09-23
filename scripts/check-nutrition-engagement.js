'use strict';

const fs = require('fs');
const path = require('path');
const E = require('../src/nutrition/engagement');

let failed = 0;
function check(label, ok) {
  if (!ok) { failed++; console.error('FAIL:', label); }
  else console.log('ok:', label);
}

const rows = E.sortForFollowUp([
  { id: 1, name: 'Active', active_days: 5, checkin_days: 3, diary_days: 4, completed_ticks: 10, planned_items: 2 },
  { id: 2, name: 'Quiet', active_days: 0, checkin_days: 0, diary_days: 0, completed_ticks: 0, planned_items: 2 },
  { id: 3, name: 'Low', active_days: 2, checkin_days: 1, diary_days: 1, completed_ticks: 2, planned_items: 2 },
], 7);
check('quiet patients sort first', rows[0].attention === 'quiet');
check('plan ticks are bounded to 100%', rows[2].adherence_pct === 71);
check('no plan has no invented adherence', rows[0].adherence_pct === 0 && E.summary({ planned_items: 0 }, 7).adherence_pct === null);

const practice = fs.readFileSync(path.join(__dirname, '..', 'src/nutrition/practice.js'), 'utf8');
const portal = fs.readFileSync(path.join(__dirname, '..', 'src/routes/nutrition_portal.js'), 'utf8');
const view = fs.readFileSync(path.join(__dirname, '..', 'src/views/nutrition_portal/shopping_list.ejs'), 'utf8');
check('weekly query is company-scoped', /weeklyEngagement[\s\S]{0,12000}company_id=\$1/.test(practice));
check('shopping route uses active plan data', /router\.get\('\/shopping-list'[\s\S]{0,1500}shoppingList/.test(portal));
check('shopping page stays noindex through portal head', /include\('head'/.test(view));

if (failed) process.exit(1);