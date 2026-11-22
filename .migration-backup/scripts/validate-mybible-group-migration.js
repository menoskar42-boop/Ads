'use strict';

/**
 * Read-only migration gate for the critical MyBible reading group.
 *
 * It compares group-owned rows plus member-linked progress without printing
 * names, phone numbers, member keys, push endpoints, or row payloads.
 */
const crypto = require('crypto');
const pg = require('pg');

const GROUP_CODE = String(process.env.MYBIBLE_COMPARE_GROUP_CODE || 'AZK3P').trim();
const SOURCE_SCHEMA = validateSchema(
  process.env.MYBIBLE_COMPARE_SOURCE_SCHEMA || 'public'
);
const TARGET_SCHEMA = validateSchema(
  process.env.MYBIBLE_COMPARE_TARGET_SCHEMA || 'mybible'
);

const GROUP_TABLES = [
  'reading_groups',
  'group_members',
  'group_reading_logs',
  'group_assignments',
  'assignment_readings',
  'group_guest_tokens',
  'group_join_requests',
  'group_messages',
  'group_missions',
  'group_push_subscriptions',
  'challenge_participants',
];

const MEMBER_TABLES = [
  'favorite_hymns',
  'highlighted_verses',
  'memorized_verses',
  'saved_verses',
  'user_daily_readings',
  'user_plan_progress',
  'user_reading_progress',
];

const GLOBAL_IDENTITY_TABLES = [
  'session',
  'users',
  'push_subscriptions',
];

function validateSchema(value) {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new Error(`invalid PostgreSQL schema name: ${value}`);
  }
  return value;
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function connectionPool(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) throw new Error('database URL is not set');
  const url = new URL(value);
  if (url.hostname.endsWith('.pooler.supabase.com') && url.port === '6543') {
    url.port = '5432';
  }
  if (url.hostname.endsWith('.supabase.com')) {
    url.searchParams.set('sslmode', 'require');
    url.searchParams.set('uselibpqcompat', 'true');
  }
  return new pg.Pool({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 20_000,
  });
}

async function primaryKeyColumns(client, schema, table) {
  const result = await client.query(
    `SELECT attribute.attname
       FROM pg_index index
       JOIN pg_class relation ON relation.oid = index.indrelid
       JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
       JOIN unnest(index.indkey) WITH ORDINALITY key(attnum, position) ON true
       JOIN pg_attribute attribute
         ON attribute.attrelid = relation.oid
        AND attribute.attnum = key.attnum
      WHERE namespace.nspname = $1
        AND relation.relname = $2
        AND index.indisprimary
      ORDER BY key.position`,
    [schema, table]
  );
  return result.rows.map((row) => row.attname);
}

async function digestRows(client, schema, table, where, params) {
  const primaryKey = await primaryKeyColumns(client, schema, table);
  const orderBy = primaryKey.length
    // Database locales can order the same textual primary keys differently.
    // Convert each key to UTF-8 bytes so Neon and Supabase produce one stable
    // order before hashing the rows.
    ? primaryKey
      .map(
        (column) =>
          `convert_to(to_jsonb(row.${quoteIdentifier(column)})::text, 'UTF8')`
      )
      .join(', ')
    : `convert_to(row_to_json(row)::text, 'UTF8')`;
  const result = await client.query(
    `SELECT row_to_json(row)::text AS payload
       FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)} row
      WHERE ${where}
      ORDER BY ${orderBy}`,
    params
  );
  const hash = crypto.createHash('sha256');
  for (const row of result.rows) hash.update(`${row.payload}\n`);
  return { rows: result.rowCount, sha256: hash.digest('hex') };
}

async function findGroup(client, schema) {
  const result = await client.query(
    `SELECT id, group_code, name
       FROM ${quoteIdentifier(schema)}.reading_groups
      WHERE group_code = $1`,
    [GROUP_CODE]
  );
  if (result.rowCount !== 1) {
    throw new Error(
      `${schema}.reading_groups expected one ${GROUP_CODE} row, found ${result.rowCount}`
    );
  }
  return result.rows[0];
}

async function memberKeys(client, schema, groupId) {
  const result = await client.query(
    `SELECT member_key
       FROM ${quoteIdentifier(schema)}.group_members
      WHERE group_id = $1 AND member_key IS NOT NULL`,
    [groupId]
  );
  return result.rows.map((row) => row.member_key);
}

async function linkedUserIds(client, schema, keys) {
  const ids = new Set();
  for (const table of MEMBER_TABLES) {
    const result = await client.query(
      `SELECT DISTINCT user_id::text AS user_id
         FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}
        WHERE member_key = ANY($1::text[]) AND user_id IS NOT NULL`,
      [keys]
    );
    for (const row of result.rows) ids.add(row.user_id);
  }
  return ids;
}

function sameDigest(source, target) {
  return source.rows === target.rows && source.sha256 === target.sha256;
}

async function compare() {
  const sourcePool = connectionPool(process.env.MYBIBLE_DATABASE_URL);
  const targetPool = connectionPool(process.env.ADS_DATABASE_URL);
  let source;
  let target;
  try {
    [source, target] = await Promise.all([
      sourcePool.connect(),
      targetPool.connect(),
    ]);
    await Promise.all([
      source.query("SET timezone = 'UTC'"),
      target.query("SET timezone = 'UTC'"),
    ]);

    const [sourceGroup, targetGroup] = await Promise.all([
      findGroup(source, SOURCE_SCHEMA),
      findGroup(target, TARGET_SCHEMA),
    ]);
    const [sourceKeys, targetKeys] = await Promise.all([
      memberKeys(source, SOURCE_SCHEMA, sourceGroup.id),
      memberKeys(target, TARGET_SCHEMA, targetGroup.id),
    ]);
    const keys = [...new Set([...sourceKeys, ...targetKeys])].sort();
    const reports = [];

    for (const table of GROUP_TABLES) {
      const sourceWhere = table === 'reading_groups'
        ? 'row.id = $1'
        : 'row.group_id = $1';
      const targetWhere = sourceWhere;
      const [sourceDigest, targetDigest] = await Promise.all([
        digestRows(source, SOURCE_SCHEMA, table, sourceWhere, [sourceGroup.id]),
        digestRows(target, TARGET_SCHEMA, table, targetWhere, [targetGroup.id]),
      ]);
      reports.push({
        table,
        scope: 'group',
        source: sourceDigest,
        target: targetDigest,
        match: sameDigest(sourceDigest, targetDigest),
      });
    }

    for (const table of MEMBER_TABLES) {
      const [sourceDigest, targetDigest] = await Promise.all([
        digestRows(
          source,
          SOURCE_SCHEMA,
          table,
          'row.member_key = ANY($1::text[])',
          [keys]
        ),
        digestRows(
          target,
          TARGET_SCHEMA,
          table,
          'row.member_key = ANY($1::text[])',
          [keys]
        ),
      ]);
      reports.push({
        table,
        scope: 'members',
        source: sourceDigest,
        target: targetDigest,
        match: sameDigest(sourceDigest, targetDigest),
      });
    }

    const [sourceLinkedIds, targetLinkedIds] = await Promise.all([
      linkedUserIds(source, SOURCE_SCHEMA, keys),
      linkedUserIds(target, TARGET_SCHEMA, keys),
    ]);
    const userIds = [...new Set([...sourceLinkedIds, ...targetLinkedIds])].sort();
    for (const table of ['users', 'ai_usage_log']) {
      const where = table === 'users'
        ? 'row.id::text = ANY($1::text[])'
        : 'row.user_id::text = ANY($1::text[])';
      const [sourceDigest, targetDigest] = await Promise.all([
        digestRows(source, SOURCE_SCHEMA, table, where, [userIds]),
        digestRows(target, TARGET_SCHEMA, table, where, [userIds]),
      ]);
      reports.push({
        table,
        scope: 'linked-users',
        source: sourceDigest,
        target: targetDigest,
        match: sameDigest(sourceDigest, targetDigest),
      });
    }

    for (const table of GLOBAL_IDENTITY_TABLES) {
      const [sourceDigest, targetDigest] = await Promise.all([
        digestRows(source, SOURCE_SCHEMA, table, 'true', []),
        digestRows(target, TARGET_SCHEMA, table, 'true', []),
      ]);
      reports.push({
        table,
        scope: 'global-identity',
        source: sourceDigest,
        target: targetDigest,
        match: sameDigest(sourceDigest, targetDigest),
      });
    }

    const mismatches = reports.filter((report) => !report.match);
    return {
      ok: mismatches.length === 0,
      groupCode: GROUP_CODE,
      groupName: sourceGroup.name,
      sourceGroupId: sourceGroup.id,
      targetGroupId: targetGroup.id,
      members: sourceKeys.length,
      linkedUsers: userIds.length,
      checks: reports.length,
      matched: reports.length - mismatches.length,
      mismatches: mismatches.map((report) => ({
        table: report.table,
        scope: report.scope,
        sourceRows: report.source.rows,
        targetRows: report.target.rows,
        sourceSha256: report.source.sha256,
        targetSha256: report.target.sha256,
      })),
      counts: reports.map((report) => ({
        table: report.table,
        scope: report.scope,
        sourceRows: report.source.rows,
        targetRows: report.target.rows,
        match: report.match,
      })),
    };
  } finally {
    if (source) source.release();
    if (target) target.release();
    await Promise.all([sourcePool.end(), targetPool.end()]);
  }
}

compare()
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 2;
  })
  .catch((error) => {
    console.error(`[mybible-group-migration] ${error.message}`);
    process.exitCode = 1;
  });