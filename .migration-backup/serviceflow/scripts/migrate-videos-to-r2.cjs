#!/usr/bin/env node
// Safe, repeatable migration for legacy maintenance video files.
// Default is report-only; pass --apply to upload, verify SHA-256, then set storage_key.
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const appDir = path.join(__dirname, '../server/maintenance/app');
const DATA_DIR = require(path.join(appDir, 'utils/datadir'));
const r2 = require(path.join(appDir, 'utils/r2'));

async function sha256Stream(stream) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const apply = process.argv.includes('--apply');
  const connectionString = process.env.SERVICEFLOW_DATABASE_URL
    || process.env.MAINTENANCE_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Database connection is not configured.');
  if (apply && !r2.isConfigured()) throw new Error('R2 is not configured; no changes were made.');
  const pool = new Pool({ connectionString, max: 1 });
  try {
    const { rows } = await pool.query(
      "SELECT id, filename FROM maintenance.photos WHERE media_type = 'video' AND storage_key IS NULL ORDER BY id"
    );
    let missing = 0;
    let migrated = 0;
    for (const row of rows) {
      const filename = path.basename(row.filename || '');
      const filePath = path.join(DATA_DIR, 'uploads', filename);
      if (!filename || filename !== row.filename || !fs.existsSync(filePath)) {
        missing += 1;
        console.warn(`Missing local source for video row ${row.id}; left unchanged.`);
        continue;
      }
      const before = await r2.hashFile(filePath);
      const key = r2.keyFor(filename, 'video');
      if (apply) {
        await r2.putFile(key, filePath, 'video/mp4');
        const uploaded = await r2.openObject(key);
        if (!uploaded || uploaded.status !== 200 || await sha256Stream(uploaded.body) !== before) {
          throw new Error(`R2 checksum verification failed for video row ${row.id}; database unchanged.`);
        }
        await pool.query(
          'UPDATE maintenance.photos SET storage_key = $1 WHERE id = $2 AND storage_key IS NULL',
          [key, row.id]
        );
        migrated += 1;
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', candidates: rows.length, migrated, missing }));
    if (missing) process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Video migration stopped: ${error.message}`);
  process.exitCode = 1;
});
