'use strict';

const fs = require('fs');
const path = require('path');
const G = require('../src/nutrition/goals');
const S = require('../src/nutrition/swaps');

let failed = 0;
function check(label, ok) {
  if (!ok) { failed++; console.error('FAIL:', label); }
  else console.log('ok:', label);
}

const goal = G.readGoal({
  title: 'Walk',
  target_value: '5',
  unit: 'times',
  starts_on: '2026-09-01',
  ends_on: '2026-09-07',
  measure_mode: 'sum',
}, '2026-09-23');
check('valid weekly goal is accepted', goal.ok && goal.value.ends_on === '2026-09-07');
check('goal longer than 31 days is refused', !G.readGoal({
  title: 'Long', target_value: 1, starts_on: '2026-09-01', ends_on: '2026-10-05',
}, '2026-09-23').ok);
check('sum progress is calculated from logs', G.progress(goal.value, [{ value: 2 }, { value: 3 }]).pct === 100);
check('latest progress does not add old readings', G.progress(
  { target_value: 10, measure_mode: 'latest' }, [{ value: 2 }, { value: 4 }]
).current === 4);

const list = S.shoppingList([
  { food_id: 4, food_name: 'Rice', grams: 100 },
  { food_id: 4, food_name: 'Rice', grams: 50 },
], 7);
check('shopping lines have stable keys', list.lines.length === 1 && list.lines[0].key === 'f4');

const schema = fs.readFileSync(path.join(__dirname, '..', 'src/nutrition/schema.js'), 'utf8');
const portal = fs.readFileSync(path.join(__dirname, '..', 'src/routes/nutrition_portal.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '..', 'src/routes/nutrition_admin.js'), 'utf8');
const adminView = fs.readFileSync(path.join(__dirname, '..', 'src/views/nutrition_admin/patient.ejs'), 'utf8');
const portalView = fs.readFileSync(path.join(__dirname, '..', 'src/views/nutrition_portal/today.ejs'), 'utf8');
check('goal tables are tenant-scoped', /CREATE TABLE IF NOT EXISTS nutrition_goals[\s\S]{0,900}company_id\s+INTEGER/.test(schema)
  && /CREATE TABLE IF NOT EXISTS nutrition_goal_logs[\s\S]{0,500}company_id\s+INTEGER/.test(schema));
check('shopping checks are plan-scoped', /CREATE TABLE IF NOT EXISTS nutrition_shopping_checks[\s\S]{0,700}plan_id/.test(schema));
check('portal verifies goal ownership', /router\.post\('\/goal-log'[\s\S]{0,1800}company_id=\$2 AND patient_id=\$3/.test(portal));
check('portal persists shopping marks', /router\.post\('\/shopping-list\/check'[\s\S]{0,1800}nutrition_shopping_checks/.test(portal));
check('both sides render goals', /nt\.goals/.test(adminView) && /np\.goals/.test(portalView));
check('admin can create goals', /router\.post\('\/patients\/:id.*\/goals'/.test(admin));

if (failed) process.exit(1);