'use strict';

/**
 * Read-only preflight comparison for an Ads database migration.
 *
 * The source is deliberately supplied separately from ADS_DATABASE_URL. A
 * migration must compare the old production database, not whichever database
 * happens to be available as the developer's DATABASE_URL.
 */
const { Pool } = require('pg');
const { parseDatabaseUrl } = require('./ads_backup');

const COMPANY_FIELDS = ['id', 'slug', 'company_name', 'page_type', 'is_active'];
const APPLICATION_FIELDS = [
  'id', 'preferred_slug', 'business_name', 'status', 'approved_company_id',
];

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function poolFor(rawUrl) {
  const database = parseDatabaseUrl(rawUrl);
  return new Pool({
    host: database.host,
    port: database.port,
    database: database.database,
    user: database.user,
    password: database.password,
    ssl: database.sslmode === 'require' ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 20_000,
  });
}

async function tableExists(client, table) {
  const result = await client.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return result.rows.length > 0;
}

async function readCompanies(client) {
  if (!(await tableExists(client, 'companies'))) return null;
  const result = await client.query(
    `SELECT ${COMPANY_FIELDS.map(quoteIdentifier).join(', ')}
       FROM public.companies
      ORDER BY slug`
  );
  return result.rows;
}

async function readApplications(client) {
  if (!(await tableExists(client, 'signup_applications'))) return null;
  const result = await client.query(
    `SELECT ${APPLICATION_FIELDS.map(quoteIdentifier).join(', ')}
       FROM public.signup_applications
      ORDER BY id`
  );
  return result.rows;
}

async function companyIdTables(client) {
  const result = await client.query(
    `SELECT DISTINCT c.table_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND c.column_name = 'company_id'
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name`
  );
  return result.rows.map((row) => row.table_name);
}

async function companyRowCounts(client, tables) {
  if (!tables.length) return [];
  const branches = tables.map((table) => (
    `SELECT '${table.replace(/'/g, "''")}' AS table_name,
            company_id::text AS company_id,
            count(*)::bigint AS row_count
       FROM public.${quoteIdentifier(table)}
      WHERE company_id IS NOT NULL
      GROUP BY company_id`
  ));
  const result = await client.query(
    `SELECT table_name, company_id, row_count
       FROM (${branches.join(' UNION ALL ')}) AS counts
      ORDER BY table_name, company_id`
  );
  return result.rows.map((row) => ({
    table: row.table_name,
    companyId: row.company_id,
    rows: Number(row.row_count),
  }));
}

function keyed(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}

function comparable(row, fields) {
  return Object.fromEntries(fields.map((field) => [field, row[field] ?? null]));
}

function compareRows(sourceRows, targetRows, keyFn, fields) {
  const source = keyed(sourceRows, keyFn);
  const target = keyed(targetRows, keyFn);
  const missing = [];
  const changed = [];
  const extra = [];

  for (const [key, sourceRow] of source) {
    const targetRow = target.get(key);
    if (!targetRow) {
      missing.push({ key, row: comparable(sourceRow, fields) });
    } else if (JSON.stringify(comparable(sourceRow, fields))
      !== JSON.stringify(comparable(targetRow, fields))) {
      changed.push({
        key,
        source: comparable(sourceRow, fields),
        target: comparable(targetRow, fields),
      });
    }
  }
  for (const [key, targetRow] of target) {
    if (!source.has(key)) extra.push({ key, row: comparable(targetRow, fields) });
  }
  return { missing, changed, extra };
}

function compareCounts(sourceCounts, targetCounts) {
  const source = keyed(sourceCounts, (row) => `${row.table}:${row.companyId}`);
  const target = keyed(targetCounts, (row) => `${row.table}:${row.companyId}`);
  const differences = [];
  for (const [key, sourceRow] of source) {
    const targetRow = target.get(key);
    if (!targetRow || targetRow.rows !== sourceRow.rows) {
      differences.push({
        table: sourceRow.table,
        companyId: sourceRow.companyId,
        sourceRows: sourceRow.rows,
        targetRows: targetRow ? targetRow.rows : 0,
      });
    }
  }
  for (const [key, targetRow] of target) {
    if (!source.has(key)) {
      differences.push({
        table: targetRow.table,
        companyId: targetRow.companyId,
        sourceRows: 0,
        targetRows: targetRow.rows,
      });
    }
  }
  return differences;
}

async function snapshot(client) {
  // A pg Client cannot execute multiple queries concurrently. Keeping these
  // reads sequential avoids a protocol race while retaining one consistent
  // connection per database snapshot.
  const companies = await readCompanies(client);
  const applications = await readApplications(client);
  const tables = await companyIdTables(client);
  const counts = await companyRowCounts(client, tables);
  return { companies, applications, tables, counts };
}

async function compareAdsDatabases({
  sourceUrl = process.env.ADS_MIGRATION_SOURCE_URL,
  targetUrl = process.env.ADS_DATABASE_URL,
} = {}) {
  if (!String(sourceUrl || '').trim()) {
    throw new Error('ADS_MIGRATION_SOURCE_URL is not set');
  }
  if (!String(targetUrl || '').trim()) {
    throw new Error('ADS_DATABASE_URL is not set');
  }

  const sourcePool = poolFor(sourceUrl);
  const targetPool = poolFor(targetUrl);
  let sourceClient;
  let targetClient;
  try {
    [sourceClient, targetClient] = await Promise.all([
      sourcePool.connect(),
      targetPool.connect(),
    ]);
    const [source, target] = await Promise.all([
      snapshot(sourceClient),
      snapshot(targetClient),
    ]);

    const companyComparison = source.companies && target.companies
      ? compareRows(source.companies, target.companies, (row) => row.slug, COMPANY_FIELDS)
      : { missing: [], changed: [], extra: [], schemaMissing: true };
    const applicationComparison = source.applications && target.applications
      ? compareRows(
        source.applications,
        target.applications,
        (row) => row.preferred_slug || `id:${row.id}`,
        APPLICATION_FIELDS
      )
      : { missing: [], changed: [], extra: [], schemaMissing: true };
    const schemaMissingInTarget = [
      ...(source.companies && !target.companies ? ['companies'] : []),
      ...(source.applications && !target.applications ? ['signup_applications'] : []),
      ...source.tables.filter((table) => !target.tables.includes(table)),
    ];
    const requiredSchemaMissing = companyComparison.schemaMissing
      || applicationComparison.schemaMissing;
    const rowCountDifferences = compareCounts(source.counts, target.counts);

    return {
      ok: !requiredSchemaMissing
        && schemaMissingInTarget.length === 0
        && companyComparison.missing.length === 0
        && companyComparison.changed.length === 0
        && applicationComparison.missing.length === 0
        && applicationComparison.changed.length === 0
        && rowCountDifferences.length === 0,
      source: {
        companies: source.companies ? source.companies.length : null,
        applications: source.applications ? source.applications.length : null,
        companyIdTables: source.tables.length,
      },
      target: {
        companies: target.companies ? target.companies.length : null,
        applications: target.applications ? target.applications.length : null,
        companyIdTables: target.tables.length,
      },
      schemaMissingInTarget,
      companies: companyComparison,
      applications: applicationComparison,
      companyRowCountDifferences: rowCountDifferences,
    };
  } finally {
    if (sourceClient) sourceClient.release();
    if (targetClient) targetClient.release();
    await Promise.all([sourcePool.end(), targetPool.end()]);
  }
}

module.exports = { compareAdsDatabases };