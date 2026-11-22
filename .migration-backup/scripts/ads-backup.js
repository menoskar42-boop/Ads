'use strict';

const fs = require('fs');
const path = require('path');
const {
  backupDir,
  listBackups,
  runAdsBackup,
  verifyBackup,
} = require('../src/lib/ads_backup');
const { compareAdsDatabases } = require('../src/lib/ads_compare');

function usage() {
  console.log(`Ads PostgreSQL backup tool

Usage:
  node scripts/ads-backup.js backup
  node scripts/ads-backup.js list
  node scripts/ads-backup.js verify [path/to/ads-YYYY-MM-DD.dump]
  node scripts/ads-backup.js compare
  node scripts/ads-backup.js restore-help

Environment:
  ADS_DATABASE_URL       PostgreSQL URI for the Ads database
  ADS_BACKUP_DIR         private backup directory (default: backups/ads)
  ADS_BACKUP_RETENTION   number of daily dumps to keep (default: 7)
  ADS_MIGRATION_SOURCE_URL
                         read-only source database URL for migration comparison
`);
}

async function latestBackup() {
  const backups = await listBackups();
  if (!backups.length) throw new Error(`no backups found in ${backupDir()}`);
  return backups[0].file;
}

function restoreHelp() {
  console.log(`Restore is intentionally a supervised operation:

1. Stop the application so no writes happen during the restore.
2. Verify the selected file:
   ADS_BACKUP_DIR=backups/ads node scripts/ads-backup.js verify <file>
3. Take a fresh backup of the current target before replacing it.
4. Use PostgreSQL 17 pg_restore with the same Supabase Session Pooler:
   pg_restore --clean --if-exists --no-owner --no-acl --schema=public \\
     --dbname="$ADS_DATABASE_URL" <file>
5. Start the application and check the home page plus the database table count.

This command prints instructions only; it never overwrites a live database.
`);
}

async function main() {
  const command = process.argv[2];
  if (!command || command === '--help' || command === '-h') return usage();
  if (command === 'restore-help') return restoreHelp();
  if (command === 'list') return console.log(JSON.stringify(await listBackups(), null, 2));
  if (command === 'verify') {
    const file = path.resolve(process.argv[3] || await latestBackup());
    console.log(JSON.stringify(await verifyBackup(file), null, 2));
    return;
  }
  if (command === 'compare') {
    const report = await compareAdsDatabases();
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 2;
    return;
  }
  if (command === 'backup') {
    const result = await runAdsBackup();
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

main().catch((err) => {
  console.error(`[ads-backup] ${err.message}`);
  process.exitCode = 1;
});