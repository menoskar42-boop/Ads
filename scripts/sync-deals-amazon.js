#!/usr/bin/env node
'use strict';

// Short-lived command for a Replit Scheduled Deployment or a manual run.
// It exits non-zero only when the configured API ran and every product failed.
const { pool, initDealsDb } = require('../deals/db');
const { syncAmazonCatalog } = require('../deals/catalog_sync');

async function main() {
  await initDealsDb();
  const result = await syncAmazonCatalog({ triggeredBy: 'scheduled' });
  console.log(JSON.stringify({
    status: result.status,
    success: result.success,
    failure: result.failure,
    skipped: result.skipped,
    ...(result.reason ? { reason: result.reason } : {}),
  }));
  if (result.status === 'failed') process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('[sync-deals-amazon]', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());