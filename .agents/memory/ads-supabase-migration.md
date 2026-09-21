---
name: Ads and MyBible Supabase
description: Constraints for the Supabase database shared by Ads and schema-isolated MyBible.
---

The Ads database can be reached from Replit through Supabase’s Session Pooler; direct `db.<project>.supabase.co` access may fail DNS resolution, and Supabase database dumps require a PostgreSQL client at least as new as the server.

**Why:** The Supabase target runs PostgreSQL 17 and the direct host was not reachable from the Replit environment, while the Session Pooler worked reliably.

**How to apply:** Use PostgreSQL 17 tooling for future dumps/restores and prefer the Session Pooler on port 5432. Keep MyBible in its isolated schema with a fail-closed search path.

The Session Pooler’s 15-client ceiling is shared across the parent Ads process and the MyBible child process. Their process-wide pool caps must leave headroom under that combined limit.

**Why:** Independent MyBible pools exhausted the shared 15-client allowance after cutover, causing intermittent API failures even though the migrated data was intact.

**How to apply:** Keep one runtime pool per process and budget their maxima together; standalone maintenance scripts must not run concurrently with saturated production traffic.

The backup scheduler must start after the application's additive schema migrations finish, not immediately when the HTTP port opens.

**Why:** `pg_dump` can wait behind startup DDL on a fresh process; starting it too early left an active backup lock and no completed archive.

**How to apply:** Keep scheduled backups attached to the end of the startup schema promise and retain a timeout for the dump process.

During cutover verification, MyBible production uses the shared Ads connection when
`MYBIBLE_DATABASE_TARGET=ads-supabase`, with data isolated in the `mybible` schema.
Migration checks must match catalog records by a stable natural key such as
`source_key`, not by numeric IDs; the same medicine records can have different IDs
after migration while all non-ID fields remain identical.

**Why:** The two apparent medicine gaps were already present in Supabase under
different IDs, with newer update timestamps. Inserting by the old Replit IDs would
have created duplicates or conflicted with the migrated catalog.

**How to apply:** Before copying a record, check its natural key and compare
non-ID data fields; treat a newer timestamp in the shared Supabase row as the
current version.