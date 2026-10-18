# Complete CFM local application proof — audit and blocker

**Scope:** local implementation and application-proof progress. No production
database was queried, no production route or database selector was changed,
and no Cloudflare resource was created.

## Finding

The current local CFM proof is a schema/SQL proof, not a complete
application-facing proof. Do not present it as a D1-backed CFM implementation.

A complete local application proof is not a small isolated integration with
the current architecture. `server/cfm/routes.ts` is 1,525 lines and makes about
75 calls into `storage`; `server/cfm/storage.ts` implements the full
PostgreSQL/Drizzle persistence interface. Separately, Service Flow's
`server/routes.ts` and `server/box-fault-ticket.ts` access CFM tables and
`box_fault_tickets` directly through the shared PostgreSQL pool. Auth refresh,
password login, role checks, ticket-number allocation, task-to-inventory
writes, and box-ticket creation/confirmation/reopen flows all need to move
together or be covered by a deliberate compatibility boundary.

The local proof exercises actual CFM login/authentication, user-management,
password, reference-table, and ticket list/detail read handlers, plus Service
Flow's typed coverage-grant D1 adapter. A typed
`CfmD1ReferenceStorage` implements that `IStorage` subset and is wired only in
the isolated test process. The export converter now accepts all 14 CFM tables,
and the selected `tech_coverage_grants` table, preserving stable IDs, rejecting
duplicate primary/unique keys, and emitting dependency-ordered idempotent SQL.
Synthetic rows for every selected table are imported twice into local D1; the
proof compares per-table counts and verifies `PRAGMA foreign_key_check`.
`tech_coverage_grants` application consumers now support an explicit
`SF_TECH_COVERAGE_STORAGE=d1` option; PostgreSQL remains the default, and the
unrelated `technician_names` lookup stays in PostgreSQL.

This is not a production cutover candidate. User administration and Service
Flow's direct CFM-user reads/writes remain PostgreSQL. PostgreSQL `tickets`
references `centrals`, `cables`, and `fault_types`, so moving reference rows
alone would break existing foreign-key and ticket behavior. Ticket workflows
and `box_fault_tickets` remain PostgreSQL until partial-failure recovery is
implemented and tested.

## Table-by-table mapping

`storage` below means `server/cfm/storage.ts`, called by
`server/cfm/routes.ts`; `DDL` means runtime setup in `server/db.ts` and typed
contracts in `shared/cfm-schema.ts`. Core-module references are listed
separately. D1 conversions are requirements to validate, not completed
production mappings.

| PostgreSQL → D1 table | Keys, constraints, indexes | Types / conversion | Known reads and writes |
|---|---|---|---|
| `cfm_users` → `cfm_users` | Text UUID PK; unique `username`; no secondary index in runtime DDL | Generate UUID in Node; booleans `is_initial_password`, `suspended` → SQLite integer 0/1; password remains a bcrypt hash | `storage` user CRUD/auth; CFM login, refresh, password change, technician/admin user routes in `server/cfm/routes.ts`; Service Flow SSO and account provisioning/lookup/deletion in `server/routes.ts` (including direct `users.cfm_user_id` mapping). Isolated local proof exercises login/refresh and user-management handlers; normal application runtime still uses PostgreSQL. PG `sf_session` remains. |
| `centrals` → `centrals` | Text UUID PK; unique `code` | Generate UUID in Node; timestamps → canonical UTC text | `storage` CRUD and CFM selectors; `server/box-fault-ticket.ts` resolves and joins central names for duplicate coverage and automatic ticket creation. |
| `cables` → `cables` | Text UUID PK; FK `central_id → centrals.id` cascade; unique `(central_id, number)` | UUID in Node; all varchar/text → SQLite TEXT | `storage` CRUD; CFM ticket forms; `server/box-fault-ticket.ts` resolves cabinets and joins ticket coverage. |
| `fault_types` → `fault_types` | Text UUID PK; no unique/index in runtime DDL; tickets reference it | UUID in Node; text fields | `storage` CRUD and ticket forms; `server/box-fault-ticket.ts` searches the Arabic fault name using PostgreSQL regex `~` and orders by `length(name)`. |
| `work_types` → `work_types` | Text UUID PK; no unique/index | `associated_materials` JSONB → validated JSON text | `storage` CRUD and work-entry UI routes. |
| `task_types` → `task_types` | Text UUID PK; no unique/index; inventory transactions reference it | UUID in Node; text fields | `storage` CRUD and inventory/task forms; task creation/deletion routes create inventory transactions. |
| `contractors` → `contractors` | Text UUID PK; no unique/index; optional FK from work entries | UUID in Node; text fields | `storage` CRUD and work-entry forms. |
| `excavation_workers` → `excavation_workers` | Text UUID PK; unique `national_id` | UUID in Node; text fields | `storage` CRUD and excavation-worker forms. |
| `tickets` → `tickets` | Text UUID PK; unique `ticket_number` plus existing `ticket_number_idx`; `status_idx`; FKs to central, cable, fault type, and author | UUID in Node; timestamps → UTC text; nullable coordinates → REAL; preserve status vocabulary and nullability | Local proof exercises D1 list/detail/create/status/repair/confirm/reopen/delete. Open-ticket creation uses `ticket_box_claims` in the same D1 batch to reject concurrent box claims. Service Flow box-fault callers and box-case/report reads remain PostgreSQL. |
| `measurement_entries` → `measurement_entries` | Text UUID PK; ticket FK cascade; author FK; no explicit secondary index in runtime DDL | UUID in Node; distance → REAL; dates → UTC text | Local proof exercises D1 get/create/delete and relation checks through existing authenticated routes. |
| `work_entries` → `work_entries` | Text UUID PK; ticket and optional measurement FKs cascade; optional contractor FK; author FK | `items` JSON → valid JSON text; dates → UTC text | Local proof exercises D1 get/create/delete through existing authenticated routes. |
| `used_task_entries` → `used_task_entries` | Text UUID PK; ticket and optional measurement FKs cascade; author FK | `items` JSON → valid JSON text; dates → UTC text | Local proof exercises task create/delete with task rows and all associated stock movements in one D1 batch. |
| `inventory_transactions` → `inventory_transactions` | Text UUID PK; task-type FK; optional ticket FK `ON DELETE SET NULL`; no explicit secondary index in runtime DDL | UUID in Node; integer quantity; date → UTC text | Local proof exercises inventory listing, incoming stock, and atomic task-related outgoing/refund movements. |
| `box_fault_tickets` → `box_fault_tickets` | Integer serial PK; unique `(source, ref_key)`; `box_fault_tickets_ticket_idx` on `ticket_id`; intentionally no declared FK to `tickets` | serial → SQLite integer key; timestamptz → UTC text; ticket ID stays text | `server/box-fault-ticket.ts` creates/updates/checks records; `server/routes.ts` reads/updates records for backfill, repair confirmation, reopen, and closed-ticket reports. Both call sites currently use the shared PG pool. |
| `tech_coverage_grants` → `tech_coverage_grants` | Integer serial PK; unique `(grantee_tech_name, covered_tech_name)`; no FK | Preserve integer IDs; timestamps → UTC text; creator is an actor label | `coverageCodes` and `/api/coverage-grants` support an explicit D1 adapter flag. The joined `technician_names` code lookup remains PostgreSQL; flag unset means the existing PostgreSQL query path. |

### Cross-cutting PostgreSQL dependencies and behavior

- `server/cfm/routes.ts` owns HTTP validation and existing authorization:
  `requireAuth`, `requireAdmin`, self-delete prevention, role-specific ticket
  status/deletion rules, and the rule that only admins may modify closed-ticket
  entries. `refreshCfmSession` reloads the user from storage; on a transient
  read failure it currently retains the session user. A D1 boundary must not
  accept browser-supplied identity or roles.
- `server/routes.ts` directly reads and writes `cfm_users` for Service Flow
  SSO/account management. `users.cfm_user_id` is a PG-owned identity link.
  Sessions and Service Flow users remain in PG under the project constraints.
- The coverage-grant D1 path still resolves worker codes from PostgreSQL
  `technician_names`; that lookup remains an explicit cross-store read, not a
  shared transaction.
- `server/box-fault-ticket.ts` still allocates Service Flow-linked ticket numbers with PostgreSQL regex,
  `split_part`, cast, `MAX`, `lpad`, `RETURNING`, and retry on unique violation.
  It also uses a PostgreSQL `~` regex for fault lookup and updates ticket notes.
- Service Flow ticket creation is followed by a separate `box_fault_tickets` upsert whose
  error is swallowed. This can leave a ticket without its integration record.
  The backfill and repair/reopen routes also perform multiple PG operations.
- D1 task/inventory writes use `batch()` locally. This does not make a
  PostgreSQL + D1 transaction atomic and does not resolve Service Flow's
  `box_fault_tickets` integration.
- `RETURNING` is used throughout Drizzle storage. The replacement API must
  verify exact result/absence behavior, not only whether SQLite accepts SQL.
- The local proof exercises actual CFM Express ticket and child-entry routes
  against D1. Service Flow box-ticket creation/settlement, box-case reporting,
  and ticket box-score enrichment remain PG-owned.

## Existing proofs reviewed

- `cfm-centrals-proof/` proves a read-only central query locally.
- `cfm-centrals-proof/phase2/` exercises the existing CFM login handler,
  `requireAuth`, user-management/password handlers, CRUD handlers for all
  reference tables, and ticket/child-entry/inventory routes through the typed
  D1 adapter and local Worker. Service Flow account-linking and box-fault
  integration remain PG-owned.
- `d1/import-cfm-reference-export.mjs` converts an allowlisted PostgreSQL JSON
  export into deterministic, idempotent D1 SQL and preserves stable IDs.
- `cfm-centrals-proof/phase3/` covers a bridge contract/design, not CFM data
  writes or production routes.
- `cfm-group-proof/` imports synthetic data into the full table schema and
  tests relational SQL behavior, but does not invoke actual CFM application
  routes or role checks.

## Remaining application integration

The completed local proof remains a bounded subset, not a full CFM cutover.
All D1 selectors remain unset and real application traffic continues to use
PostgreSQL. Before selecting D1 for production requests, remaining work must:

1. Which Express side performs each authorization decision and which identity
   claims are signed to the Worker.
2. Move or redesign PostgreSQL-dependent box-case and box-score read models.
3. Replace Service Flow's direct ticket and `box_fault_tickets` accesses with
   a durable, idempotent cross-store operation and reconciliation procedure.
4. Test all interruption, timeout, overload, and retry boundaries; ticket
   number and open-box claim concurrency is covered locally, but the complete
   cross-store workflows are not.
5. Review a versioned copy/rollback procedure before any production data copy.

The current safe boundary is to keep all real application traffic on
PostgreSQL. D1 selection flags are used only by isolated local tests; no
production flag, Worker deployment, data copy, or route cutover was performed.

## Future deterministic synthetic export/import validation

No PostgreSQL export or production data was queried. The current fixture is
synthetic and the converter emits SQL only. Before a real copy is considered,
the local proof still needs these additional checks:

1. Preserve primary keys; convert booleans to `0`/`1`, timestamps to UTC ISO
   text, JSON/JSONB to valid canonical JSON text, and serial IDs to stable
   integer IDs where required.
2. Import in FK dependency order (users/lookups, tickets, child entries, then
   `box_fault_tickets`); this is now exercised with synthetic rows.
3. Compare row counts per table and run `PRAGMA foreign_key_check`; synthetic
   import coverage now checks both. Compare these with an independently
   generated source export before any production import.
4. Compare representative normalized application reads (ticket detail with
   measurements/work/tasks, inventory totals, and box-fault/repair report rows)
   between a synthetic PostgreSQL source and local D1.
5. Produce deterministic per-table digests from primary-key-sorted,
   canonicalized rows, excluding only documented volatile fields. Report
   missing, extra, and mismatched keys/row digests; fail on any mismatch.
6. Simulate interrupted import and retry locally. Import must be resumable and
   idempotent without erasing or replacing the PostgreSQL source.

## Cost and size evidence needed

Existing repository audit evidence is insufficient to estimate this group's
size or savings. The historical whole-database snapshot (about 554.5 MiB) and
the “up to 2 GB” estimate are not current measurements and do not isolate CFM.
No production query was run.

Before any sizing decision, collect through an approved, read-only procedure:

- Exact row counts and `pg_total_relation_size` (table plus indexes) for each
  of the 14 source tables, and the projected D1 size after import.
- Daily rows read/written and query counts by table/operation, including
  unindexed scans, plus CFM request volume and queries per application request.
- Existing Workers plan, current account D1 database/storage usage, and whether
  free daily limits and the 50-query-per-invocation limit are sufficient.
- Current PostgreSQL billing basis and compute/connection use attributable to
  these CFM reads/writes. Moving rows alone may not reduce a fixed PG plan or
  minimum compute charge.

Cloudflare's published D1 limits checked for the previous phase were 500 MB per
database and 5 GB account-wide on Workers Free, versus 10 GB per database and
1 TB account-wide on Workers Paid. Whether Workers Paid is required depends on
actual group size, request/query volume, and account state; none is known here.
No plan was upgraded and no D1 database/Worker was provisioned.
