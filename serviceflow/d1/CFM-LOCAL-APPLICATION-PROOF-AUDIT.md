# Complete CFM local application proof — audit and blocker

**Scope:** repository audit and local proof feasibility only. No production
database was queried, no application route or database selector was changed,
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

Implementing only a sample central/ticket endpoint would leave untested and
still-PG-dependent behavior while appearing to prove the whole group. A
complete port would replace the CFM storage boundary and update many route and
core call sites; that is the broad rewrite explicitly excluded by this phase's
guardrail. Therefore **no application-facing D1 integration was added**.

## Table-by-table mapping

`storage` below means `server/cfm/storage.ts`, called by
`server/cfm/routes.ts`; `DDL` means runtime setup in `server/db.ts` and typed
contracts in `shared/cfm-schema.ts`. Core-module references are listed
separately. D1 conversions are requirements to validate, not completed
production mappings.

| PostgreSQL → D1 table | Keys, constraints, indexes | Types / conversion | Known reads and writes |
|---|---|---|---|
| `cfm_users` → `cfm_users` | Text UUID PK; unique `username`; no secondary index in runtime DDL | Generate UUID in Node; booleans `is_initial_password`, `suspended` → SQLite integer 0/1; password remains a bcrypt hash | `storage` user CRUD/auth; CFM login, refresh, password change, technician/admin user routes in `server/cfm/routes.ts`; Service Flow SSO and account provisioning/lookup/deletion in `server/routes.ts` (including direct `users.cfm_user_id` mapping). PG `sf_session` remains. |
| `centrals` → `centrals` | Text UUID PK; unique `code` | Generate UUID in Node; timestamps → canonical UTC text | `storage` CRUD and CFM selectors; `server/box-fault-ticket.ts` resolves and joins central names for duplicate coverage and automatic ticket creation. |
| `cables` → `cables` | Text UUID PK; FK `central_id → centrals.id` cascade; unique `(central_id, number)` | UUID in Node; all varchar/text → SQLite TEXT | `storage` CRUD; CFM ticket forms; `server/box-fault-ticket.ts` resolves cabinets and joins ticket coverage. |
| `fault_types` → `fault_types` | Text UUID PK; no unique/index in runtime DDL; tickets reference it | UUID in Node; text fields | `storage` CRUD and ticket forms; `server/box-fault-ticket.ts` searches the Arabic fault name using PostgreSQL regex `~` and orders by `length(name)`. |
| `work_types` → `work_types` | Text UUID PK; no unique/index | `associated_materials` JSONB → validated JSON text | `storage` CRUD and work-entry UI routes. |
| `task_types` → `task_types` | Text UUID PK; no unique/index; inventory transactions reference it | UUID in Node; text fields | `storage` CRUD and inventory/task forms; task creation/deletion routes create inventory transactions. |
| `contractors` → `contractors` | Text UUID PK; no unique/index; optional FK from work entries | UUID in Node; text fields | `storage` CRUD and work-entry forms. |
| `excavation_workers` → `excavation_workers` | Text UUID PK; unique `national_id` | UUID in Node; text fields | `storage` CRUD and excavation-worker forms. |
| `tickets` → `tickets` | Text UUID PK; unique `ticket_number` plus existing `ticket_number_idx`; `status_idx`; FKs to central, cable, fault type, and author | UUID in Node; timestamps → UTC text; nullable coordinates → REAL; preserve status vocabulary and nullability | `storage` list/detail/create/update/delete and joined relation loads; CFM ticket/status/repair/delete routes; direct joins, reads, inserts, and status/note updates in `server/box-fault-ticket.ts`; Service Flow SSO/user-related routes do not eliminate PG `users` dependency. |
| `measurement_entries` → `measurement_entries` | Text UUID PK; ticket FK cascade; author FK; no explicit secondary index in runtime DDL | UUID in Node; distance → REAL; dates → UTC text | `storage` list/get/create/delete; measurement create/delete and ticket relation checks in `server/cfm/routes.ts`. |
| `work_entries` → `work_entries` | Text UUID PK; ticket and optional measurement FKs cascade; optional contractor FK; author FK | `items` JSON → valid JSON text; dates → UTC text | `storage` list/get/create/delete; CFM work create/delete and ticket relation checks. |
| `used_task_entries` → `used_task_entries` | Text UUID PK; ticket and optional measurement FKs cascade; author FK | `items` JSON → valid JSON text; dates → UTC text | `storage` list/get/create/delete; CFM task create/delete. Task route also writes one inventory row per item as separate calls. |
| `inventory_transactions` → `inventory_transactions` | Text UUID PK; task-type FK; optional ticket FK `ON DELETE SET NULL`; no explicit secondary index in runtime DDL | UUID in Node; integer quantity; date → UTC text | `storage` list/create; task routes add/remove transactions; incoming-stock route adds transactions. These writes are not currently wrapped with the associated task-entry write in one transaction. |
| `box_fault_tickets` → `box_fault_tickets` | Integer serial PK; unique `(source, ref_key)`; `box_fault_tickets_ticket_idx` on `ticket_id`; intentionally no declared FK to `tickets` | serial → SQLite integer key; timestamptz → UTC text; ticket ID stays text | `server/box-fault-ticket.ts` creates/updates/checks records; `server/routes.ts` reads/updates records for backfill, repair confirmation, reopen, and closed-ticket reports. Both call sites currently use the shared PG pool. |

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
- `server/box-fault-ticket.ts` allocates ticket numbers with PostgreSQL regex,
  `split_part`, cast, `MAX`, `lpad`, `RETURNING`, and retry on unique violation.
  It also uses a PostgreSQL `~` regex for fault lookup and updates ticket notes.
- Ticket creation is followed by a separate `box_fault_tickets` upsert whose
  error is swallowed. This can leave a ticket without its integration record.
  The backfill and repair/reopen routes also perform multiple PG operations.
- A CFM task route creates the task row, then creates inventory rows in a loop;
  a later failure can leave a partial set. D1 `batch()` can make D1-only writes
  atomic, but it cannot make a PostgreSQL + D1 transaction atomic.
- `RETURNING` is used throughout Drizzle storage. The replacement API must
  verify exact result/absence behavior, not only whether SQLite accepts SQL.
- Existing D1 SQL schema and synthetic tests cover the relational shape but
  do not execute the CFM Express handlers against D1.

## Existing proofs reviewed

- `cfm-centrals-proof/` proves a read-only central query locally.
- `cfm-centrals-proof/phase2/` exercises the existing CFM login handler and
  `requireAuth`, then uses a test-only bridge to the local Worker. It is still
  one GET endpoint and uses synthetic user storage; it does not replace the
  complete CFM `IStorage`.
- `cfm-centrals-proof/phase3/` covers a bridge contract/design, not CFM data
  writes or production routes.
- `cfm-group-proof/` imports synthetic data into the full table schema and
  tests relational SQL behavior, but does not invoke actual CFM application
  routes or role checks.

## Required next design, not implemented in this phase

Before a full local application proof, the implementation needs a reviewed
typed contract for all operations in `IStorage` and core CFM consumers, plus a
testable Node-to-Worker adapter. That contract must specify:

1. Which Express side performs each authorization decision and which identity
   claims are signed to the Worker.
2. Typed read/write operations for all 14 tables, including relations used by
   `getAllTickets` / `getTicketById`, not a table-name or SQL passthrough.
3. Ticket-number generation that preserves year, numeric ordering, formatting,
   concurrent create retries, and duplicate prevention.
4. Idempotency/repair for ticket creation plus `box_fault_tickets`, task-entry
   plus inventory writes, and other multi-step workflows. The current PG
   behavior on partial failure must be explicitly preserved or deliberately
   improved and reviewed.
5. HTTP timeout, network, 4xx/5xx, retry, and no-silent-fallback behavior.
6. An explicit backend selector whose production default remains PostgreSQL,
   with no production route change until separate approval.

This is broad enough that proceeding with only a few sample API routes would
not meet the “complete CFM group” requirement and could misrepresent coverage.
The safe outcome for this phase is to stop at this audit and retain the
existing PostgreSQL application path unchanged.

## Future deterministic synthetic export/import validation

No PostgreSQL export, including a synthetic PostgreSQL dump, was executed in
this phase. The current `fixtures.sql` is a D1-ready synthetic seed, not a
PostgreSQL-to-D1 converter. Before a real copy is considered, the local proof
should add a deterministic synthetic export transformation with these checks:

1. Preserve primary keys; convert booleans to `0`/`1`, timestamps to UTC ISO
   text, JSON/JSONB to valid canonical JSON text, and serial IDs to stable
   integer IDs where required.
2. Import in FK dependency order (users/lookups, tickets, child entries, then
   `box_fault_tickets`) and reject duplicate primary/unique keys rather than
   silently overwriting records.
3. Compare row counts per table; check duplicate PKs and unique-key groups
   before import; run `PRAGMA foreign_key_check` afterward.
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
