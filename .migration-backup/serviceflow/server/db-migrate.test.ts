import { test } from "node:test";
import assert from "node:assert/strict";
import { guardReasons, createTableSql, insertSql, qi } from "./db-migrate";

const SRC = "postgresql://u:p@ep-x.neon.tech/neondb?sslmode=require";
const TGT = "postgresql://sfapp:secret@129.0.0.1:5432/serviceflow?sslmode=no-verify";

test("guard: fresh empty Oracle target is allowed", () => {
  assert.deepEqual(guardReasons({ targetUrl: TGT, sourceUrl: SRC, sourceMarked: false, targetTables: 0, targetMarked: false }), []);
});

test("guard: a re-copy over the tool's own copy is allowed", () => {
  assert.deepEqual(guardReasons({ targetUrl: TGT, sourceUrl: SRC, sourceMarked: false, targetTables: 90, targetMarked: true }), []);
});

test("guard: never wipe a database that has tables without the tool's mark", () => {
  const r = guardReasons({ targetUrl: TGT, sourceUrl: SRC, sourceMarked: false, targetTables: 3, targetMarked: false });
  assert.equal(r.length, 1);
  assert.match(r[0], /مش هنمسحها/);
});

test("guard: refuses after the site already switched to Oracle, same DB, or missing secret", () => {
  assert.match(guardReasons({ targetUrl: TGT, sourceUrl: SRC, sourceMarked: true, targetTables: 0, targetMarked: false })[0], /اتحوّل/);
  assert.match(guardReasons({ targetUrl: SRC, sourceUrl: SRC, sourceMarked: false, targetTables: 0, targetMarked: false })[0], /نفسها/);
  assert.match(guardReasons({ targetUrl: "", sourceUrl: SRC, sourceMarked: false, targetTables: 0, targetMarked: false })[0], /SERVICEFLOW_ORACLE_DATABASE_URL/);
});

test("guard messages never contain the password", () => {
  const all = guardReasons({ targetUrl: SRC, sourceUrl: SRC, sourceMarked: true, targetTables: 1, targetMarked: false }).join(" ");
  assert.doesNotMatch(all, /secret|:p@/);
});

const table = {
  oid: 1, schema: "public", name: "items", unlogged: false,
  cols: [
    { name: "id", type: "integer", notnull: true, def: null, identity: "a", generated: "", collate: null },
    { name: "name", type: "text", notnull: true, def: null, identity: "", generated: "", collate: 'pg_catalog."C"' },
    { name: "n", type: "integer", notnull: false, def: "nextval('public.n_seq'::regclass)", identity: "", generated: "", collate: null },
    { name: "len", type: "integer", notnull: false, def: "length(name)", identity: "", generated: "s", collate: null },
    { name: 'we"ird', type: "bytea", notnull: false, def: null, identity: "", generated: "", collate: null },
  ],
};

test("createTableSql keeps identity, collation, defaults and generated columns", () => {
  const sql = createTableSql(table);
  assert.match(sql, /^CREATE TABLE "public"\."items"/);
  assert.match(sql, /"id" integer GENERATED ALWAYS AS IDENTITY NOT NULL/);
  assert.match(sql, /"name" text COLLATE pg_catalog\."C" NOT NULL/);
  assert.match(sql, /"n" integer DEFAULT nextval\('public\.n_seq'::regclass\)/);
  assert.match(sql, /"len" integer GENERATED ALWAYS AS \(length\(name\)\) STORED/);
  assert.match(sql, /"we""ird" bytea/);
  assert.match(createTableSql({ ...table, unlogged: true }), /^CREATE UNLOGGED TABLE/);
});

test("insertSql skips generated columns, casts text back to each type, overrides identity", () => {
  const { sql, cols } = insertSql(table);
  assert.deepEqual(cols.map((c) => c.name), ["id", "name", "n", 'we"ird']);
  assert.match(sql, /OVERRIDING SYSTEM VALUE/);
  assert.match(sql, /SELECT a0::integer, a1::text, a2::integer, a3::bytea FROM unnest\(\$1::text\[\], \$2::text\[\], \$3::text\[\], \$4::text\[\]\)/);
  assert.doesNotMatch(insertSql({ ...table, cols: table.cols.slice(1) }).sql, /OVERRIDING/);
  assert.equal(qi('a"b'), '"a""b"');
});
