# Service Flow: PostgreSQL → D1 table-by-table study

**Status:** read-only planning document, prepared 18 October 2026. No application
code, production configuration, production database, or Cloudflare resources were
changed or queried. The PostgreSQL source remains intact and is the rollback
source of truth. The earlier local CFM lookup proof remains a test-only
recommendation, not a data-migration group. This plan follows the new requirement
to retain execution queues and sessions in PostgreSQL and identifies the
cross-domain dependencies that must be resolved before moving data.

## Decision summary

- **A — D1 candidate:** relational data suitable for D1 after its listed
  dependency and compatibility checks.
- **B — temporarily PostgreSQL:** execution queue/claim/retry state and
  `sf_session`, as explicitly required.
- **C — dependent:** do not split until shared queries, user IDs, external
  integrations, or multi-table transactions are redesigned.
- **D — uncertain:** legacy, dynamically generated, snapshot, or backup
  semantics require additional source/data-owner inspection.
- **Scope clarification (18 October 2026):** keep every user table in
  PostgreSQL, including core `users`, `cfm_users`, and `maintenance.users`, in
  addition to sessions and queue/claim/retry state. D1 import exports must
  reject user tables; migrated rows may retain user IDs as text references but
  must not create cross-database foreign keys.

The catalog is per table; routes are grouped by actual service/module rather than
repeating hundreds of URL strings. `shared/schema.ts` is the source of the 67
Drizzle table declarations; `server/db.ts` supplies runtime-only DDL and dynamic
table variants; CFM is in `shared/cfm-schema.ts`; maintenance tables are created
in `server/maintenance/app/database.js`. Existing SQL drafts are review-only,
not executable migrations. PK/FK notation below follows current source drafts
and must be checked against live schema before any eventual copy.

## Node/Express ↔ D1 architecture

The current Express processes use PostgreSQL `pg` pools and Drizzle
node-postgres. They cannot directly use `env.DB`; Cloudflare D1 is accessed
through a Worker binding. No Service Flow D1 binding or database Worker API
currently exists. Lowest-risk topology is to keep Node as the UI/business
application and put a small, private Worker data API in front of D1:

1. Node calls the Worker over HTTPS; authenticate service-to-service with a
   rotated secret stored only in workspace/Cloudflare secret stores, plus a
   signed end-user context where needed. Never accept a user ID/role from an
   untrusted browser as authorization.
2. Worker validates a fixed operation allowlist, tenant/role, input size and
   parameters; uses prepared SQL and D1 `batch()` only for operations that are
   truly one logical transaction. No generic SQL proxy.
3. Keep PostgreSQL calls for `exec_jobs`, `exec_followups`, `sf_session`, and
   any still-dependent tables. Do not emulate cross-database joins or claim
   atomicity between a D1 write and PG write. For split workflows, use an
   explicit idempotent outbox/reconciliation design.
4. Route D1 reads/writes through the Worker API; do not expose D1 credentials
   or call the REST API from browsers. Add request IDs, deadlines, bounded
   retries only for idempotent operations, and clear 4xx/5xx behavior.
5. Deploy schema migrations separately from application startup. Do not retain
   `ensureSchema()` DDL, data repair, or seed side effects in normal app boot.

### Minimum API surface for a first bounded CFM slice

The first read-only proof should expose only authenticated
`GET /api/cfm/master-data/centrals` (one prepared query, no production binding,
local fixtures only). If approved and that proof passes, a complete CFM move
would need explicit allowlisted equivalents for current `/api/cfm/*` operations:
master-data CRUD/bulk; list/detail/create/status/delete tickets; box-cases and
details; ticket work/task/measurement create/delete; final-repair/revert/confirm;
and inventory transaction list/incoming. Include the Service Flow
`openBoxFaultTicket`/`settleBoxTicketIfCleared` callers and CFM identity mapping
before moving the related `box_fault_tickets` table. A lookup-only move is not
safe while CFM ticket APIs and Service Flow ticket integration stay split.

No cross-DB join or transaction is assumed. CFM currently references
`cfm_users`, `centrals`, `cables`, `fault_types`, tickets, and child records in
one PostgreSQL database. Maintenance reports also combine maintenance schema
tables with core data in the running system; each such query must either remain
on PG until its whole read model moves, or be replaced by an API/read model
whose staleness and reconciliation are specified.

## Table-by-table catalog

Notation: `PK` is the current primary key; `→` is a declared FK. “Routes” names
the actual caller family/module; a table may have additional callsites in the
shared report and import queries. `Tx` denotes a current multi-write/transaction
or trigger invariant. Complexity: L/M/H. Cross-store means a future D1/PG
boundary, not a claim that today's PG schemas are separate databases.

### Core Drizzle tables (67)

| Table | Class | PK / important constraint and dependency | Current callers; cross-store / transaction concern | Complexity; required direction |
|---|---|---|---|---|
| `users` | B | `id`; unique login; roles/status; no FK | Auth, Passport, orders, CFM identity bridge, notification authors | H; all user data and identity behavior remain PostgreSQL-owned |
| `orders` | C | `id`; FKs `sales_id`, `tech_id`, `assigned_tech_id`, `external_id` → `users` | Order APIs, dashboards, queue actions; notification FK points back here; transaction paths | H; move with user identity and dependent notifications, preserve conditional status writes |
| `phone_lines` | C | `id`; no declared FK; indexed phone/cabinet lookup | Line APIs, imports, data reports; joins complaints, ports, subscriber/account data | H; migrate with normalized phone keys and dependent line tables |
| `phone_line_edits` | C | `id`; `phone_line_id` → `phone_lines`, editor/confirm/rollback IDs → `users` | Line correction/audit APIs; rollback/confirm transitions | H; preserve full edit history and atomic rollback |
| `notifications` | C | `id`; `user_id` → `users`, nullable `order_id` → `orders` | Authenticated notification APIs and many schedulers/linkers; often side-effect of other writes | H; idempotent outbox and user/order keys needed |
| `work_orders` | C | `id`; nullable `uploaded_by_id` → `users`; import uniqueness varies by source | WFM imports, cable linker, reports, assignments; full-replace/history writes | H; large snapshots and dependent cable ledger must move as a consistent slice |
| `work_order_tech_overrides` | C | `id`; `updated_by_id` → `users`; unique work-order identity | Technician resolution, cable linker, reports | M; preserve canonical technician matching and uniqueness |
| `line_data_corrections` | C | `id`; submitter/resolver → `users` | Line correction review and subscriber data APIs; joins phone/account data | H; latest-row ordering, normalization, status transaction |
| `cable_entries` | C | `id`; unique `(phone_local, work_order_type)`; creator → `users` | Stock ledger, linker, work-order reports; transactions are not uniformly co-located with notifications | H; retain PG with work orders or move ledger/linker together and make notifications idempotent |
| `local_store_moves` | C | `id`; creator → `users` | Local stock issue/adjustment, ledger reports; balance derived with `cable_entries` | H; one ledger boundary and exact decimals/date rules |
| `manual_close_by` | C | `id`; assigned_by → `users` | Manual closure assignment and ticket/fault workflows | M; preserve actor mapping and closure transaction |
| `msan_tech_overrides` | C | `id`; assigned_by → `users` | Technician overrides and report joins | M; co-migrate related technician lookup data |
| `maintenance_orders` | C | `id`; uploader → `users` | Work-order replacement/history and many core reports, including mobile/phone matching | H; report queries currently combine it with other service tables |
| `ticket_queue` | C | `id`; uploader → `users`; columns/uniqueness are runtime-maintained | FCC/DSL/FTTH upload/current-ticket routes and box-fault integration | H; co-migrate ticket variants; preserve snapshot vs accumulation semantics |
| `complaint_details` | C | `id`; unique `complain_no`; uploader → `users` | 430D details import, reports, repeat reviews | H; history, normalization and date tie-breakers |
| `manual_faults` | C | `id`; partial indexes by status/source; no declared FK | Public/manual fault reports, review/regularization, reporting | H; throttling and review writes must be atomic/idempotent |
| `complaint_details_sod` | C | `id`; uploader → `users` | First-upload daily complaint snapshot and reports | H; Cairo business-date + same-day accumulation |
| `complaint_details_current` | C | `id`; uploader → `users` | Current 430D complaint snapshot and reports | H; replace only in atomic staged snapshot operation |
| `remaining_complaints` | C | `id`; uploader → `users` | Remaining-complaint history import and reports | H; preserve conflict behavior and history |
| `remaining_complaints_sod` | C | `id`; uploader → `users` | Same-day remaining-complaint snapshot | H; daily reset/accumulate rules |
| `remaining_complaints_current` | C | `id`; uploader → `users` | Current remaining-complaint reports | H; staged full replacement |
| `ftth_subscribers` | C | `id`; uploader → `users` | FTTH subscriber import and lookup/report joins | M; move with its import and lookups |
| `case_138` | C | `id`; uploader → `users`; several runtime-added review/measurement columns | Case reports, measurements, repeat reviews, import/snapshot sync | H; large refresh, Arabic normalization, date rules, startup rebuild |
| `cabinet_technicians` | C | `id`; uploader → `users`; indexes on cabinet/central | Cabinet/technician import, reassignments, access/report filters | H; keep with cabinet history and reassignment workflow |
| `cabinet_tech_changes` | C | `id`; unique `(batch, central_name, cabin_number)` | Reassignment scheduling/admin APIs | H; pending-row claim and batch application |
| `cabinet_tech_history` | C | `id`; `change_id` → `cabinet_tech_changes` | Reassignment history/reports; same transaction as technician change | H; cannot move independently from change application |
| `cabinet_capacity` | C | `id`; uploader → `users` | Capacity import and reports/filters | M; preserve numeric capacity and import replacement |
| `exec_followups` | B | `id`; due/enqueue index; no declared FK | Executor heartbeat promotes due work to `exec_jobs` using `FOR UPDATE SKIP LOCKED` | H; explicitly keep PG until queue and lease semantics change |
| `exec_jobs` | B | `id`; queue indexes and JSON payloads; no declared FK | Enqueue/claim/retry/cancel/reorder/heartbeat endpoints; advisory locks and conditional transactions | H; explicitly keep PG, preserve per-site exclusion and exactly-once effects |
| `sf_session` | B | `sid`; connect-pg-simple expiry/session JSON | Express session/Passport; QuietSessionStore cache/touch/prune | H; explicitly keep PG with current session behavior |
| `technician_names` | C | `id`; uploader → `users`; worker-code lookup | Import, technician canonicalization, cabinet/cable/report queries | M; normalize and co-migrate all consumers |
| `box_fault_tickets` | C | `id`; unique `(source, ref_key)`; ticket ID is external CFM reference | Fault/inspection workflows call `box-fault-ticket.ts`; confirm/reopen/status | H; cross-system update with CFM tickets needs one API contract/idempotency |
| `removed_phone_ports` | C | `id`; MSAN/date indexes; no user FK | Port history/removal routes and report filters | M; preserve append/history and port identity |
| `phone_ports` | C | `id`; uploader → `users`; port/cabinet lookup | Port imports, edits and line reports | H; move with phone-line and port-change workflows |
| `line_mobiles` | C | `full_phone`; uploader/update actor → `users` | Mobile lookup/import and fault/OM reports | H; trigger-like line-account and normalization invariants |
| `line_mobile_checked` | C | `full_phone`; checker → `users` | Mobile verification flows and report filters | M; retain audit/check semantics with line data |
| `line_deactivations` | C | `id`; uploader → `users`; phone/date indexes | FTTH/WFM import and deactivation reports | M; preserve import dedupe and date filters |
| `om_order_matches` | C | no declared PK; unique `order_id` → `orders` and unique `om_serial`; confirmer → `users` | OM matching/confirmation APIs | H; must move with orders or keep PG |
| `app_settings` | C | `key`; key/value; updated_by is an actor label, not FK | Settings APIs and queue lane/night-pause/scheduler behavior | H; do not move while PG queue depends on its settings; split keys only after explicit ownership map |
| `app_state` | C | `key`; key/value | Queue heartbeat/reload plus daily scheduler claims, WFM slots and import markers | H; keep queue-related keys in PG; no atomic cross-store scheduler claim |
| `dp_inventory` | C | `id`; uploader → `users` | Network inventory imports and inspection reports; reports also read maintenance boxes | H; cross-schema read model blocks isolated move |
| `tech_coverage_grants` | C | `id`; no declared FK | Shift/coverage APIs and technician reports | M; JSON/date/identity matching requires parity tests |
| `shift_schedules` | C | `id`; no declared FK; JSON-like schedule fields | Shift schedule APIs and reports | M; compare JSON text versus normalized child rows |
| `ticket_dsl_sod` | C | `id`; uploader → `users`; runtime unique `(ticket_id,status_code)` | DSL ticket import and daily snapshot reports | H; preserve dedupe and same-day accumulation |
| `ticket_dsl_current` | C | `id`; uploader → `users` | Latest DSL ticket upload/report | H; atomic full replacement |
| `ticket_ftth` | C | `id`; uploader → `users`; runtime unique `(ticket_id,status_code)` | FTTH ticket history/import/reports | H; preserve conflict and history rules |
| `ticket_ftth_sod` | C | `id`; uploader → `users`; runtime unique `(ticket_id,status_code)` | FTTH daily snapshot | H; preserve first-upload reset rule |
| `ticket_ftth_current` | C | `id`; uploader → `users` | Current FTTH ticket snapshot | H; staged atomic replacement |
| `wfm_sod` | C | `id`; uploader → `users` | WFM start-of-day upload/report | H; Cairo date and accumulation semantics |
| `wfm_current` | C | `id`; uploader → `users` | WFM current snapshot and automatic jobs | H; shared with queue-triggered automation |
| `regularized_daily` | C | `id`; unique/business key must be verified in runtime DDL | Daily snapshot scheduler and regularized reports | H; unique Cairo day/category and atomic insert-if-absent |
| `ftth_orders` | C | `id`; unique `service_order_id`; uploader → `users` | FTTH historical import, OM matching, reports | H; preserve conflict/update policy and user relation |
| `ftth_orders_current` | C | `id`; uploader → `users` | Current OM/FTTH reports and missing-data queue jobs | H; report and queue-read dependency |
| `ftth_orders_soy` | C | `id`; uploader → `users` | Beginning-of-year snapshot/manual upload | M; business-year boundary and archive process |
| `ftth_orders_archive` | D | `id`; uploader → `users`; `archived_year` | Annual archiving/report lookup | H; inspect retention, archive source and completeness |
| `line_accounts` | C | `id`; updater → `users`; trigger removes matching `lines_no_account` | Line accounts/imports, data lookup and faults; trigger invariant is cross-writer | H; move with `lines_no_account` and all writers in one D1 service/transaction |
| `line_account_edits` | C | `id`; editor → `users` | Account change/audit routes | M; preserve audit and account transaction |
| `customer_contact_logs` | C | `id`; contacted_by → `users` | Contact history and line/phone report queries | M; referenced from correlated report queries; user identity unresolved |
| `customer_sms_logs` | C | `id`; sent_by → `users` | SMS/WhatsApp send path and communication audit | M; external send cannot be atomic with DB insert; use idempotency/provider message ID |
| `repeat_reviews` | C | `id`; review business keys vary; JSONB at-fault field | Repeat-review workflows, startup correction, fault/case reports | H; timezone/JSON/date migration and audit behavior |
| `lines_no_account` | C | `full_phone`; marker actor → `users` | Missing-account workflows; deleted by line_accounts trigger | H; inseparable invariant with line_accounts |
| `repeat_review_comments` | C | `id`; review → `repeat_reviews` cascade; author → `users` | Review/comment APIs | H; same transaction and FK deletion behavior |
| `om_responses` | C | `serial_number`; no declared FK | OM response/manual box status APIs, two-way sync with `orders`, `om_order_matches`, box-fault automation and reports | H; keep PostgreSQL until the linked order/match writers and all report readers can move as one reviewed consistency boundary |
| `wfm_task_cancels` | C | `id`; no declared FK; phone index | WFM cancellation and automated task filtering | M; exact match/date and dedupe rules |
| `wfm_task_accepts` | C | `id`; no declared FK; phone index | WFM accepted-task filtering and automation | M; race with queue state; migrate with WFM consumers |
| `oss_reexecs` | C | `id`; indexed `key_value` | OSS rerun dedupe and queue/task automation | M; idempotency record must remain co-located with operation |
| `wfm_customer_mobiles` | C | `id`; phone index, no declared FK | DZS ingest, last-result lookup, operation freshness/progress, retry filtering and automatic current-fault enqueue | H; keep PostgreSQL until all readers and the ingest writer move as one reviewed queue-consistency boundary; preserve per-attempt history, normalization, and Cairo time behavior |

### Runtime-only and dynamically generated core tables

| Table | Class | PK / important constraint and dependency | Current callers; cross-store / transaction concern | Complexity; required direction |
|---|---|---|---|---|
| `current_fault_major_selections` | C | `ticket_id`; optional selector → `users` | Current-fault selection/report APIs | M; ticket ID is shared with ticket tables |
| `line_po_events` | C | `account_no` | PO raise/stop actions; joined by many phone, fault and line reports | H; broad read-model dependency prevents standalone move |
| `op_intents` | C | composite `(account, op_type)` | Operation-intent lookups around queue/line actions | M; preserve atomic insert/upsert and exact empty/null matching |
| `om_manual_mobiles` | C | `serial_number` | FTTH OM mobile correction and reports | M; joins FTTH order results; keep with source or expose Worker read API |
| `line_subscriber_info` | C | `phone_number` | Subscriber technical-data fetch and line/port reports | H; imported externally and joined to queue eligibility |
| `port_change_requests` | C | `request_id` | Port-change/request tracking routes and phone reports | M; state transitions and dedupe need parity |
| `won` | D | Runtime DDL name found; exact columns/key and active consumers not established by current review | Legacy/runtime table; no safe route ownership confirmed | H; inspect live schema and all SQL references before classifying or copying |
| `work_orders_premigration_backup` | D | cloned from historical `work_orders`; key/index behavior inherited | Created during legacy compatibility/migration path | H; determine whether data is still needed before copying; never treat backup as live table |
| `cables` | C | May be an alias/table generated by runtime config; exact uniqueness needs current DDL check | Stock/cable and network-inventory callers | H; name overlaps CFM concept; inspect schema/search_path before mapping |
| `centrals` | C | Runtime name also used by CFM master data; primary key depends on owning schema | CFM and maintenance/reporting integrations | H; distinguish `public.centrals`, CFM schema, and maintenance lookups |
| `cfm_users` | B | String UUID PK, unique username | CFM auth/admin and ticket authors; links to core users by `cfm_user_id` in application | H; all CFM accounts remain PostgreSQL-owned; D1 stores only author ID text |
| `contractors` | C | String UUID PK | CFM work entries and master-data CRUD | M; move with CFM child data |
| `excavation_workers` | C | String UUID PK; unique `national_id` | CFM work-entry item payloads and master-data CRUD | M; preserve uniqueness even where worker ID is nested JSON |
| `fault_types` | C | String UUID PK | CFM tickets and master-data CRUD | M; FK to tickets means same group |
| `inventory_transactions` | C | String UUID PK; task type → `task_types`; ticket → `tickets` SET NULL | CFM inventory reports and incoming/outgoing transaction APIs | H; ledger semantics, FK-on-delete and exact quantity |
| `measurement_entries` | C | String UUID PK; ticket cascade; creator ID references PG `cfm_users` | CFM ticket measurements, works/tasks; ticket detail | H; dependent child row; preserve transaction and validate actor through the PG-backed Node session |
| `task_types` | C | String UUID PK | CFM inventory/work item definitions | M; FK target for inventory; nested JSON associations |
| `tickets` | C | String UUID PK; unique `ticket_number`; FKs to central/cable/fault type/CFM user | CFM ticket CRUD/status/repair; Service Flow box-fault integration | H; cross-module identity and state transitions block independent table move |
| `used_task_entries` | C | String UUID PK; ticket + optional measurement cascade; creator → CFM user | CFM work/task CRUD and ticket detail | H; nested JSON items and cascade |
| `work_entries` | C | String UUID PK; ticket/measurement cascade; contractor and creator refs | CFM work CRUD and ticket detail | H; nested JSON, child delete, contractor relation |
| `work_types` | C | String UUID PK; materials in JSONB; name rules need inspection | CFM master CRUD and nested work entry associations | M; JSON shape and relations need fixture coverage |

### Maintenance PostgreSQL schema (11)

| Table | Class | PK / important constraints and dependencies | Current callers; cross-store / transaction concern | Complexity; required direction |
|---|---|---|---|---|
| `maintenance.exchanges` | C | serial `id`; unique name | `routes/boxes.js`, reports; parent of cabinets | M; move with the maintenance hierarchy |
| `maintenance.cabinets` | C | serial `id`; exchange cascade; unique `(exchange_id,number)` | Boxes/admin/reports, cabinet merge | H; preserve cascade and merge transaction |
| `maintenance.boxes` | C | serial `id`; cabinet cascade; unique `(cabinet_id,number)`; constrained status | Box, inspection, Service Flow and report routes | H; cross-referenced by inspection/report APIs and core `dp_inventory` |
| `maintenance.users` | B | serial `id`; unique username; role CHECK | maintenance auth/admin/inspection/task ownership | H; all maintenance accounts remain PostgreSQL-owned |
| `maintenance.inspections` | C | serial `id`; box + inspector refs; archive/origin fields | Inspector, data-review, comprehensive reports | H; multi-step approval, report filters and media refs |
| `maintenance.inspection_items` | C | serial `id`; inspection cascade; unique `(inspection_id,item_key)`; item type CHECK | Inspection create/update/report | M; preserve constraints and item-type domain |
| `maintenance.maintenance_tasks` | C | serial `id`; inspection, optional technician; constrained status | Technician and inspector task lifecycle | H; completion/approval/reject/revert transaction |
| `maintenance.maintenance_item_status` | C | serial `id`; task cascade; unique `(task_id,item_key)` | Task toggles/approval/report | M; transactional task state and completion evidence |
| `maintenance.photos` | C | serial `id`; box/inspection refs; photo type CHECK | Upload/download/delete in boxes, inspectors, technicians, reports; R2 or legacy BYTEA/local path | H; local D1 metadata/import/read/write/location and per-box archive metadata proof require R2 keys and reject inline bytes; photo/inspection deletes are blocked in proof until R2-safe rollback is reviewed; production import/cutover still requires review; never copy bytes |
| `maintenance.box_line_numbers` | C | serial `id`; inspection cascade; unique identity requires verification | Inspector phone entry, reports and service-flow API | M; local D1 schema/import and inspector/technician CRUD proof exist; `data_review`, reports, and exports remain PostgreSQL-backed pending dependency audit |
| `maintenance.cabinet_codes` | A | serial `id`; unique `(exchange_name,cabinet_number)`; no FK | Admin cabinet-code listing/export and three maintenance reports | M; D1 schema, allowlisted import, typed read and report enrichment implemented locally behind opt-in; PostgreSQL remains default pending source-data review |

### Catalog exceptions and reconciliation gates

1. The 67 declared tables are counted from Drizzle declarations; runtime DDL
   adds non-Drizzle tables and table-name arrays. Dynamic ticket/work-order
   variants must be resolved to concrete names before a canonical migration
   file can be approved. CFM and maintenance objects may share table names
   (`users`, `centrals`, `cables`) but are not interchangeable; the current
   maintenance connection sets `search_path=maintenance,public`.
2. `0001_core_schema.draft.sql` has 67 tables, 57 FKs, 18 unique constraints
   and 2 declared indexes; `0002_runtime_maintenance.draft.sql` is incomplete.
   Draft constraints are not authoritative for runtime-only objects. Inspect
   every live constraint/default/index and row count using a read-only,
   separately approved schema-only audit before generating canonical migrations.
3. Current application has joins and read models spanning core data, CFM
   ticket data, and the maintenance schema. A D1/PG split makes those joins
   impossible in SQL. Each must remain PG-side until all participating tables
   move, or be redesigned as explicit API calls/read models with bounded
   freshness and failure behavior.
4. `phone_lines`, `phone_ports`, `line_accounts`, `line_mobiles`,
   `lines_no_account`, `line_subscriber_info`, `line_data_corrections`,
   `case_138`, complaint/ticket tables and their import snapshots form a
   connected high-complexity domain. The `line_accounts` trigger invariant
   cannot be replaced by two independent API calls.
5. `exec_jobs`, `exec_followups`, queue-related `app_state` keys, queue-related
   `app_settings`, and `sf_session` remain in PostgreSQL for phase one as
   required. `app_state`/`app_settings` are mixed-purpose tables: isolate keys
   only after a key-by-key ownership map and proof that no D1 write participates
   in a PG queue transaction.

## Cost and quota estimate

### Verified current public Cloudflare terms (checked 18 October 2026)

| Component | Workers Free | Workers Paid | Cost relevance to this plan |
|---|---|---|---|
| D1 per-database size | 500 MB | 10 GB | The older review's 554.5 MiB historical snapshot is already above Free's per-DB cap; the 2 GB number is only a planning assumption, not a current measurement. If either is representative, a single D1 needs Workers Paid. |
| D1 total account storage | 5 GB | 1 TB; first 5 GB included, then $0.75/GB-month | 2 GB fits included Paid storage if current account-wide D1 storage plus this DB stays ≤5 GB. On Free it fits account cap only if the individual DB is ≤500 MB. |
| D1 rows read | 5 million/day | First 25 billion/month included, then $0.001/million rows | Full-table scans count all scanned rows, not just returned rows. Indexes reduce reads but may add write accounting. |
| D1 rows written | 100,000/day | First 50 million/month included, then $1/million rows | INSERT/UPDATE/DELETE count; indexed writes can add row-write cost. Free-tier limit enforcement causes D1 queries to fail after the daily cap, from 1 Sep 2026. |
| Workers service-to-service API | 100,000 requests/day, 10 ms CPU/invocation | $5/month minimum; 10 million requests and 30 million CPU-ms included, then $0.30/million requests and $0.02/million CPU-ms | This Worker is required for Node to reach D1. If the account already pays for Workers Paid, the $5 may be sunk; account plan/billing status is not known. |
| R2 Standard | 10 GB-month, 1M Class A and 10M Class B/month included | $0.015/GB-month, $4.50/M Class A, $0.36/M Class B beyond free tier | No file migration is planned; existing objects remain in R2. Incremental cost is unknown without existing bucket usage and added Worker/API object requests. Egress is free. |
| Existing PostgreSQL | Not a Cloudflare charge | Not a Cloudflare charge | PG must remain online for queues, sessions and dependencies; therefore D1 does **not** immediately remove the current PostgreSQL bill. Existing Replit database cost is unmeasured here. |

**Scenario, not a bill forecast:** If the source fits one D1 under 10 GB and total
account D1 storage stays under 5 GB, D1 data storage and ordinary row usage can
fall inside Workers Paid's included D1 allotments. The incremental Cloudflare
baseline is **$0 if the account is already on Workers Paid with capacity, or
$5/month if moving from Free**, before any overages or R2 activity. The source's
current size, current D1/R2 usage, request volume, query row metrics, account
plan, billing cycle, and PostgreSQL charge are unknown; do not treat this as
savings or a commitment. Paid plan is likely required if the historical
554.5 MiB snapshot or 2 GB sizing assumption is relevant because Free's
per-database cap is 500 MB. Keep a margin below quotas; D1 is single-threaded
per database, so batching fewer round trips may lower Workers requests but not
eliminate row accounting or contention.

### Daily cost/usage measurement through 31 October 2026

1. **18 October baseline:** record current Workers plan/usage model, current
   Workers subscription line item, all D1 account storage and row metrics (if
   any already exist), R2 storage/Class A/Class B metrics, and the current
   Service Flow PostgreSQL billing line. Do not run full-table production scans.
2. **Daily at the same UTC time, 19–31 October:** export Workers request/CPU
   usage; D1 `rows_read`, `rows_written`, storage and database metrics via
   Cloudflare dashboard/GraphQL analytics; R2 GraphQL analytics storage and
   operation counts (not object listing/scanning); and the PostgreSQL provider
   invoice/compute-hour line. Record the day, meter, measured value, source,
   and price-plan version.
3. Keep production D1 usage at zero until approved; the current period measures
   only existing Worker/R2 activity and PostgreSQL. A **local D1 test does not
   measure production billing**. For the later pilot, tag the Worker route and
   record per-request D1 `meta.rows_read`, `meta.rows_written`, statement
   category and Worker CPU/request counts, without logging user data or secrets.
4. Report daily and cumulative Cloudflare and PostgreSQL totals separately.
   Compare matched days and explain reset dates, free allowances, plan renewal,
   storage GB-month averaging, and any one-time migration/index write volume.
   Stop/hold expansion if projected overages or current PG + Cloudflare total
   exceed the measured baseline. No exact cost reduction can be claimed until
   this series and a real source-size measurement exist.

## Recommended first migration group and tests

There is **no fully independent write-capable table identified yet**: the
smallest-looking settings/log tables participate in queue configuration,
identity FKs, or shared report queries. Do not pick one from table count alone.
The lowest-risk first implementation candidate is a **local-only, read-only
CFM centrals lookup proof**, with local fixture data and no production D1
binding. It validates the mandatory Worker boundary and auth/response mapping
without moving data. After it is approved and passes, the first *data* group
candidate is the non-user CFM cluster (`centrals`, `cables`,
`fault_types`, `work_types`, `task_types`, `contractors`,
`excavation_workers`, `tickets`, `measurement_entries`, `work_entries`,
`used_task_entries`, `inventory_transactions`) plus the linked
`box_fault_tickets` integration only after all Service Flow callers use the
Worker API. This is a candidate, not approval to build or move it.

Tests required before any data copy/cutover:

- **Completeness:** schema-only source inventory and per-table row counts,
  PK/unique/FK checks, null counts, min/max IDs and timestamps; canonicalized
  digest by stable key for selected CFM fixtures; include archived/soft-deleted
  and nullable records.
- **Read/write correctness:** local-D1 fixture parity for central/cable/ticket
  and master CRUD; generated string IDs; FK rejection, cascade/set-null,
  unique constraints, SQLite booleans/timestamps/JSON and `RETURNING` results.
- **Application behavior:** authenticated role checks; all CFM master/ticket
  routes; Service Flow auto-open/settle box-ticket callers; response formats,
  Arabic normalization, report ordering and pagination.
- **Failure handling:** Worker timeout, malformed/oversized request,
  D1 overload/limit errors, mid-`batch()` failure and retry; no duplicate ticket,
  work entry, inventory movement, or notification; no secret/user data in logs.
- **Concurrency:** simultaneous create/update/status/confirm/delete on same
  ticket and same/different central; prove one authoritative transition and
  expected conflict response.
- **Rollback:** before any approved pilot, export/copy verification and a
  versioned dual-read/rollback procedure; test rollback using local fixtures
  and a reversible test environment. Do not dual-write production without a
  reconciliation plan.
- **Cost:** count Worker requests/CPU and D1 rows read/written for fixed test
  and representative replay, then compare measured charges against the
  18–31 October baseline. Do not infer savings from row counts alone.

## Official pricing/limits references

- D1 pricing and row accounting: https://developers.cloudflare.com/d1/platform/pricing/
- D1 per-database/account limits and single-threaded behavior:
  https://developers.cloudflare.com/d1/platform/limits/
- Workers pricing, $5 Paid baseline and included requests/CPU:
  https://developers.cloudflare.com/workers/platform/pricing/
- R2 pricing (updated 1 October 2026):
  https://developers.cloudflare.com/r2/platform/pricing/
