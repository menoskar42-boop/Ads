'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const routes = fs.readFileSync(path.join(ROOT, 'src/routes/workshop_admin.js'), 'utf8');
const page = fs.readFileSync(path.join(ROOT, 'src/views/workshop_admin/communications.ejs'), 'utf8');

test('communications page summarizes failures per company and links to the failed message', () => {
  const pageRoute = routes.slice(
    routes.indexOf("router.get('/communications'"),
    routes.indexOf("router.post('/communications/prepare'")
  );

  assert.match(pageRoute, /requireWorkshopPermission\('view_communications'\)/);
  assert.match(pageRoute, /WHERE company_id=\$1 AND status='failed'/);
  assert.match(pageRoute, /failed_count/);
  assert.match(pageRoute, /final_failure_count/);
  assert.match(pageRoute, /latest_failed_id/);
  assert.match(page, /failedMessageCount > 0/);
  assert.match(page, /href="#message-<%= latestFailedMessageId %>"/);
  assert.match(page, /id="message-<%= m\.id %>"/);
});

test('a permitted workshop user can manually retry a final failure', () => {
  const delivery = routes.slice(
    routes.indexOf('async function deliverWorkshopMessage('),
    routes.indexOf('async function notifyFinalMessageFailure(')
  );

  assert.match(delivery, /COALESCE\(attempt_count,0\) < 5 OR \$3/);
  assert.match(routes, /router\.post\('\/communications\/:id\/retry', requireFlag\('communications'\), requireWorkshopPermission\('send_communications'\)/);
  assert.match(page, /canWorkshop\('send_communications'\) && m\.status === 'failed'/);
  assert.match(page, /action="\/workshop\/communications\/<%= m\.id %>\/retry"/);
});
