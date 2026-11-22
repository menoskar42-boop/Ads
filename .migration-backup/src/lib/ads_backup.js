'use strict';

/**
 * Scheduled, restorable backups for the external Ads PostgreSQL database.
 *
 * The dump is deliberately kept outside PostgreSQL. The directory is
 * configurable so deployments can point it at a persistent mounted volume;
 * the default is a private project directory rather than public/uploads.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const TIME_ZONE = 'Africa/Cairo';
const DEFAULT_BACKUP_DIR = path.join(process.cwd(), 'backups', 'ads');
const LOCK_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

function backupDir() {
  return path.resolve(process.env.ADS_BACKUP_DIR || DEFAULT_BACKUP_DIR);
}

function retentionCount() {
  const parsed = Number.parseInt(process.env.ADS_BACKUP_RETENTION || '7', 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 365)) : 7;
}

function backupHour() {
  const parsed = Number.parseInt(process.env.ADS_BACKUP_HOUR || '3', 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(parsed, 23)) : 3;
}

function cairoNow(now = new Date()) {
  const pieces = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const values = Object.fromEntries(pieces
    .filter((piece) => piece.type !== 'literal')
    .map((piece) => [piece.type, piece.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  };
}

function safeDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`invalid backup date: ${dateKey}`);
  }
  return dateKey;
}

function backupBase(dateKey) {
  return `ads-${safeDateKey(dateKey)}`;
}

function backupPath(dateKey, dir = backupDir()) {
  return path.join(dir, `${backupBase(dateKey)}.dump`);
}

function manifestPath(dumpPath) {
  return `${dumpPath}.manifest.json`;
}

function lockPath(dir = backupDir()) {
  return path.join(dir, '.ads-backup.lock');
}

function parseDatabaseUrl(raw = process.env.ADS_DATABASE_URL) {
  raw = String(raw || '').trim();
  if (!raw) throw new Error('ADS_DATABASE_URL is not set');

  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('ADS_DATABASE_URL must be a PostgreSQL URI');
  }
  if (!url.hostname || !url.pathname || url.pathname === '/') {
    throw new Error('ADS_DATABASE_URL is missing its host or database');
  }

  // Supabase's transaction pooler is fine for short queries but is not the
  // right path for pg_dump. The session pooler is stable for the dump process.
  if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543') {
    url.port = '5432';
  }

  return {
    host: url.hostname,
    port: url.port || '5432',
    database: decodeURIComponent(url.pathname.slice(1)),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    sslmode: url.hostname.endsWith('.supabase.com') ? 'require' : (url.searchParams.get('sslmode') || 'prefer'),
  };
}

function commandPath(name) {
  return process.env[name === 'pg_dump' ? 'PG_DUMP_BIN' : 'PG_RESTORE_BIN'] || name;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = Number.parseInt(process.env.ADS_BACKUP_TIMEOUT_MS || '600000', 10);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env || process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 600000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ stdout, stderr });
      const detail = timedOut
        ? `timed out after ${timeoutMs}ms`
        : (stderr.trim() || stdout.trim() || `signal ${signal || 'unknown'}`);
      reject(new Error(`${path.basename(command)} failed (${code ?? signal}): ${detail}`));
    });
  });
}

function pgEnv(database) {
  return {
    ...process.env,
    PGPASSWORD: database.password,
    PGSSLMODE: database.sslmode,
  };
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifyBackup(filePath) {
  const absolutePath = path.resolve(filePath);
  const stat = await fsp.stat(absolutePath);
  if (!stat.isFile() || stat.size === 0) throw new Error('backup file is empty or not a file');

  const database = parseDatabaseUrl();
  const listed = await runProcess(commandPath('pg_restore'), ['--list', absolutePath], {
    env: pgEnv(database),
  });
  const entries = listed.stdout.split('\n').filter(Boolean).length;
  if (entries < 2) throw new Error('pg_restore found no usable archive entries');

  const digest = await sha256File(absolutePath);
  const sidecar = manifestPath(absolutePath);
  let manifest = null;
  try {
    manifest = JSON.parse(await fsp.readFile(sidecar, 'utf8'));
    if (manifest.sha256 && manifest.sha256 !== digest) {
      throw new Error('SHA-256 does not match the backup manifest');
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  return {
    ok: true,
    file: absolutePath,
    bytes: stat.size,
    sha256: digest,
    archiveEntries: entries,
    manifest,
  };
}

async function acquireLock(dir) {
  const file = lockPath(dir);
  try {
    const handle = await fsp.open(file, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return async () => {
      await handle.close();
      await fsp.rm(file, { force: true });
    };
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    try {
      const stat = await fsp.stat(file);
      if (Date.now() - stat.mtimeMs > LOCK_MAX_AGE_MS) {
        await fsp.rm(file, { force: true });
        return acquireLock(dir);
      }
    } catch (statErr) {
      if (statErr.code !== 'ENOENT') throw statErr;
      return acquireLock(dir);
    }
    throw new Error('another Ads backup is already running');
  }
}

async function pruneBackups(dir) {
  const entries = await fsp.readdir(dir);
  const dumps = entries
    .filter((name) => /^ads-\d{4}-\d{2}-\d{2}\.dump$/.test(name))
    .sort()
    .reverse();
  for (const name of dumps.slice(retentionCount())) {
    const dump = path.join(dir, name);
    await fsp.rm(dump, { force: true });
    await fsp.rm(manifestPath(dump), { force: true });
  }
}

async function runAdsBackup(options = {}) {
  const cairo = cairoNow();
  const dateKey = safeDateKey(options.dateKey || cairo.dateKey);
  const dir = backupDir();
  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  const release = await acquireLock(dir);
  const finalPath = backupPath(dateKey, dir);
  const temporaryPath = `${finalPath}.tmp-${process.pid}`;

  try {
    const database = parseDatabaseUrl();
    const dumpArgs = [
      '--format=custom',
      '--no-owner',
      '--no-acl',
      '--schema=public',
      '--file', temporaryPath,
      '--host', database.host,
      '--port', database.port,
      '--username', database.user,
      '--dbname', database.database,
    ];
    await runProcess(commandPath('pg_dump'), dumpArgs, { env: pgEnv(database) });

    const verified = await verifyBackup(temporaryPath);
    await fsp.rename(temporaryPath, finalPath);
    const version = await runProcess(commandPath('pg_dump'), ['--version'], { env: pgEnv(database) });
    const manifest = {
      format: 'postgresql-custom',
      database: database.database,
      backup: path.basename(finalPath),
      dateKey,
      createdAt: new Date().toISOString(),
      timeZone: TIME_ZONE,
      pgDumpVersion: version.stdout.trim(),
      bytes: verified.bytes,
      sha256: verified.sha256,
      archiveEntries: verified.archiveEntries,
    };
    const manifestFile = manifestPath(finalPath);
    const temporaryManifest = `${manifestFile}.tmp-${process.pid}`;
    await fsp.writeFile(temporaryManifest, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    await fsp.rename(temporaryManifest, manifestFile);
    await pruneBackups(dir);
    return { ...manifest, file: finalPath, manifestFile };
  } finally {
    await fsp.rm(temporaryPath, { force: true });
    await release();
  }
}

async function maybeRunAdsBackup() {
  if (!process.env.ADS_DATABASE_URL) return { skipped: 'ADS_DATABASE_URL is not set' };
  const cairo = cairoNow();
  if (cairo.hour < backupHour()) return { skipped: `before ${backupHour()}:00 Cairo` };

  const target = backupPath(cairo.dateKey);
  try {
    const current = await verifyBackup(target);
    return { skipped: 'already backed up today', ...current };
  } catch (err) {
    if (!['ENOENT', 'ENOTDIR'].includes(err.code) && !/no such file|backup file is empty/i.test(err.message)) {
      console.warn('[ads-backup] replacing invalid backup:', err.message);
    }
  }

  const result = await runAdsBackup({ dateKey: cairo.dateKey });
  console.log(`[ads-backup] verified ${result.backup} (${result.bytes} bytes)`);
  return result;
}

function startAdsBackupScheduler() {
  if (!process.env.ADS_DATABASE_URL) {
    console.warn('[ads-backup] disabled — ADS_DATABASE_URL is not set');
    return null;
  }
  const tick = () => maybeRunAdsBackup().catch((err) => {
    console.error('[ads-backup] failed:', err.message);
  });
  // Give the app time to open its port and finish its normal schema work.
  setTimeout(tick, 30 * 1000).unref();
  setInterval(tick, CHECK_INTERVAL_MS).unref();
  console.log(`[ads-backup] scheduler enabled — after ${String(backupHour()).padStart(2, '0')}:00 Cairo, retention ${retentionCount()}`);
  return tick;
}

async function listBackups() {
  const dir = backupDir();
  let names = [];
  try { names = await fsp.readdir(dir); } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const results = [];
  for (const name of names.filter((item) => /^ads-\d{4}-\d{2}-\d{2}\.dump$/.test(item)).sort().reverse()) {
    const file = path.join(dir, name);
    try {
      const stat = await fsp.stat(file);
      results.push({ file, bytes: stat.size, manifest: manifestPath(file) });
    } catch (_) { /* file disappeared between readdir and stat */ }
  }
  return results;
}

module.exports = {
  backupDir,
  backupPath,
  cairoNow,
  listBackups,
  maybeRunAdsBackup,
  parseDatabaseUrl,
  runAdsBackup,
  startAdsBackupScheduler,
  verifyBackup,
};