# First D1 slice: complete CFM relational domain

Status: candidate and local synthetic proof only. No production database was
queried, copied, or changed. No Cloudflare resource was created.

## Selected group

Move the CFM operational domain as one group:

`cfm_users`, `centrals`, `cables`, `fault_types`, `work_types`, `task_types`,
`contractors`, `excavation_workers`, `tickets`, `measurement_entries`,
`work_entries`, `used_task_entries`, `inventory_transactions`, and the
Service-Flow integration ledger `box_fault_tickets`.

This is a better first complete group than the isolated centrals lookup:
CFM has a clear owner (`server/cfm/storage.ts` and `/api/cfm/*`), its relational
FK graph is mostly self-contained, and local tests can exercise real ticket,
child-entry, inventory, and integration-ledger relationships together.
Complexity is **high** because many route families and cross-application
effects must move together; this is not a recommendation to cut over now.

## Relationships, consumers, and boundary

- `cables.central_id → centrals.id` (cascade); tickets reference central, cable,
  fault type, and CFM author.
- Measurements reference tickets and CFM authors. Work/task entries reference
  tickets and optional measurements; work entries also reference contractors.
- Inventory transactions reference task types and optionally tickets
  (`ON DELETE SET NULL`).
- `box_fault_tickets` has unique `(source, ref_key)` and carries a text ticket
  ID/number. The source schema does not declare a cross-table FK.
- Primary owners: `shared/cfm-schema.ts`, `server/cfm/storage.ts`,
  `server/cfm/routes.ts`, and CFM runtime DDL in `server/db.ts`.
- Cross-module callers: `server/box-fault-ticket.ts` creates/settles automatic
  tickets; core `server/routes.ts` reads/writes the integration ledger for
  OM/order responses and repair confirmation. The Service Flow `users` table
  maps an operator to `cfm_users` via `cfm_user_id`; `users` itself stays in PG.
- Keep `sf_session`, Passport/session storage, queues/claims/locks/retries, and
  all R2 objects in their existing systems. CFM sessions remain PG-backed, but
  CFM user refresh/login would call the CFM API.

The group is independent of PG transactions only after **all** CFM routes,
storage methods, login refresh, and `box_fault_tickets` callers use one
Worker-owned D1 API. Do not split `tickets` from child rows or move only
`box_fault_tickets`: current code creates a ticket and then attempts its ledger
write separately, while main routes query the ledger directly. A future design
must make those operations idempotent and keep each D1-side invariant in one
Worker `batch()`; any PG side effect needs an explicit outbox/reconciliation
contract rather than assumed cross-database atomicity.

## PostgreSQL compatibility work

- Replace `gen_random_uuid()` with application-generated UUID text.
- Inventory `RETURNING` users and validate exact D1 metadata/results.
- Replace the `~` regex, `split_part`, integer casts, and `lpad` ticket-number
  generation in `server/box-fault-ticket.ts` with a tested, race-safe
  application/D1 sequence strategy.
- Preserve `ON CONFLICT`, cascades, `SET NULL`, and JSON serialization for
  `associated_materials` and nested entry `items`.
- Keep timestamp values canonical UTC strings at the API boundary; test the
  existing date/local-year ticket-number behavior before converting.
- Check CFM routes for all multi-write sequences, especially ticket status,
  final-repair/reopen, measurement/work/task creates/deletes, and inventory.

## Slice implementation plan (future; not implemented here)

1. Add versioned D1 migrations for the 14 tables, validated against runtime
   DDL and current indexes/constraints. Generate IDs in the Node request layer.
2. Add an allowlisted, typed Worker API for complete CFM operations; no generic
   SQL endpoint. Preserve current JSON shapes and Express auth/role checks.
3. Update CFM storage/auth and the four `box_fault_tickets` core callers as one
   reviewed change set. Keep queues and sessions in PG.
4. Add operation-level local tests for every route family, all constraints,
   authorization roles, idempotent retries, batch rollback, and R2-independent
   behavior.
5. Before copying production data, review a non-destructive export/import plan,
   counts/checksums, quiescence or dual-read strategy, and rollback. Keep PG
   intact and authoritative until explicit cutover approval.

Expected files for that later implementation include
`server/cfm/storage.ts`, `server/cfm/routes.ts`, `server/box-fault-ticket.ts`,
the specific core routes that access `box_fault_tickets`, a new typed Worker
client/API, new versioned D1 migrations, and local tests. Do not edit
`server/db.ts` to remove PG DDL until after cutover review.

## Validation and rollback

The local proof in `cfm-group-proof/` creates the complete group from synthetic
fixtures and checks joins, FK/unique constraints, child writes, cascading
deletes, `SET NULL`, and the integration-ledger upsert. It does not implement
the application API or production import.

For the local import check, Wrangler loads the synthetic SQL export fixture
`cfm-group-proof/fixtures.sql` into a clean local D1 database after applying
`schema.sql`. This verifies the D1-ready synthetic dataset and relational
constraints. It is not yet a PostgreSQL dump converter: translating a real
PostgreSQL export (timestamps, booleans, JSON, sequences, and IDs) remains part
of the reviewed migration procedure and is intentionally not exercised against
production.

Rollback for a future cutover: keep PG tables/data unchanged; switch the
explicit CFM backend selector back to PG, then investigate/reconcile D1. Never
dual-write without idempotency and reconciliation. Current phase has no app
selector and no production route change.

## Size and cost unknowns

Repository audit evidence reports a historical PG snapshot of about 554.5 MiB
and a supplied “up to 2 GB” assumption; neither is a current production
measurement, and neither gives the size of these CFM tables. Table/row counts,
indexes, write/read rates, and this group’s storage remain unknown because this
phase does not access production.

Cloudflare D1 documentation (checked 18 October 2026) lists Free limits of
500 MB per database, 5 GB total account storage, 5 million rows read/day, and
100,000 rows written/day. Paid limits are 10 GB/database and 1 TB/account;
paid D1 includes 25 billion reads/month and 50 million writes/month, then
additional usage charges. Workers Paid could be required if request volume or
per-invocation limits exceed Free; usage is not known. The 2 GB assumption
would exceed the Free per-database cap if this group itself were that large,
but its size is not known. Do not treat the historical snapshot as a forecast.

No Cloudflare resources or paid plans are needed for this local proof; cost
incurred is $0. Before any remote Worker/Access/D1 setup, verify account-specific
pricing and obtain approval for any paid resource.

Sources:
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
