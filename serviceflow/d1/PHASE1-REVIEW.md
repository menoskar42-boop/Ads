# Service Flow D1 migration foundation — source review

Status: source inventory plus a core SQLite/D1 schema draft. The SQL draft
covers only the 67 Drizzle-declared tables; it is not a complete migration
and must not be applied to production. No production database was queried or
changed.

## Current database architecture

- Service Flow uses PostgreSQL through `pg` and Drizzle's node-postgres
  adapter.
- Production configuration selects `SERVICEFLOW_DATABASE_TARGET=archive`;
  the Service Flow process receives its primary URL through the
  `SERVICEFLOW_DATABASE_URL` secret. The underlying provider/resource and
  current database size have not been independently verified.
- `serviceflow/server/db.ts` runs `ensureSchema()` at application startup.
  It contains runtime `CREATE TABLE`, `ALTER TABLE`, index, function, and
  trigger DDL. `drizzle.config.ts` uses PostgreSQL and `tablesFilter: ["!*"]`,
  so the existing Drizzle migrations are not a complete current schema.
- The maintenance app uses a separate PostgreSQL schema, `maintenance`, on
  the same database by default.

## Drizzle-declared tables (67)

`app_settings`, `app_state`, `box_fault_tickets`, `cabinet_capacity`,
`cabinet_tech_changes`, `cabinet_tech_history`, `cabinet_technicians`,
`cable_entries`, `case_138`, `complaint_details`, `complaint_details_current`,
`complaint_details_sod`, `customer_contact_logs`, `customer_sms_logs`,
`dp_inventory`, `exec_followups`, `exec_jobs`, `ftth_orders`,
`ftth_orders_archive`, `ftth_orders_current`, `ftth_orders_soy`,
`ftth_subscribers`, `line_account_edits`, `line_accounts`,
`line_data_corrections`, `line_deactivations`, `line_mobile_checked`,
`line_mobiles`, `lines_no_account`, `local_store_moves`, `maintenance_orders`,
`manual_close_by`, `manual_faults`, `msan_tech_overrides`, `notifications`,
`om_order_matches`, `om_responses`, `orders`, `oss_reexecs`,
`phone_line_edits`, `phone_lines`, `phone_ports`, `regularized_daily`,
`remaining_complaints`, `remaining_complaints_current`,
`remaining_complaints_sod`, `removed_phone_ports`,
`repeat_review_comments`, `repeat_reviews`, `sf_session`, `shift_schedules`,
`tech_coverage_grants`, `technician_names`, `ticket_dsl_current`,
`ticket_dsl_sod`, `ticket_ftth`, `ticket_ftth_current`, `ticket_ftth_sod`,
`ticket_queue`, `users`, `wfm_current`, `wfm_customer_mobiles`, `wfm_sod`,
`wfm_task_accepts`, `wfm_task_cancels`, `work_order_tech_overrides`,
`work_orders`.

## Additional runtime DDL inventory

The runtime DDL also references tables not present in the Drizzle list,
including `cables`, `centrals`, `cfm_users`, `contractors`,
`current_fault_major_selections`, `excavation_workers`, `fault_types`,
`inventory_transactions`, `line_po_events`, `line_subscriber_info`,
`measurement_entries`, `om_manual_mobiles`, `op_intents`,
`port_change_requests`, `task_types`, `tickets`, `used_task_entries`, `won`,
`work_entries`, `work_orders_premigration_backup`, and `work_types`.

Additional tables are generated from table-name arrays in `ensureSchema()`;
their definitions must be included in any executable D1 schema. Some table
names above overlap the Drizzle list and are listed here to make the runtime
DDL sources visible, not to imply extra copies should be created.

## Maintenance schema tables (11)

`exchanges`, `cabinets`, `boxes`, `users`, `inspections`,
`inspection_items`, `maintenance_tasks`, `maintenance_item_status`, `photos`,
`box_line_numbers`, `cabinet_codes`.

`photos` stores relational metadata in PostgreSQL. File bytes can be in R2,
in the legacy `BYTEA` column, or on legacy local storage. Existing R2 uploads
and reads should be reused; the D1 migration must not copy or duplicate file
objects.

## Compatibility and deployment findings

- PostgreSQL-specific source patterns include `DISTINCT ON`, `ILIKE`,
  aggregate `FILTER`, `ANY`/`ALL`, `unnest`, `JSONB`, `AT TIME ZONE`,
  `regexp_replace`, `RETURNING`, advisory locks, and `SKIP LOCKED`.
  Text-search counts are source occurrences, not unique SQL statements.
- PostgreSQL sequences/`serial`, custom functions, and a trigger-backed
  behavior also require deliberate SQLite/D1 equivalents.
- Transactions, queue-claim concurrency, session persistence
  (`connect-pg-simple`), imports, reports, and scheduled work need behavior
  review before any application code is switched.
- No Service Flow D1 binding, Wrangler D1 configuration, or D1 migration
  tooling was found. The repository's existing Cloudflare Worker is a
  separate tenant-proxy Worker, not a Service Flow database entry point.

## Sizing and cost boundary

The supplied planning assumption is up to 2 GB, not a measured current size.
The last historical PostgreSQL snapshot available in the audit is about
554.5 MiB, and is not a current production measurement. The assumed 2 GB fits
within D1's 5 GB included storage allowance, but current size, daily row-read
and row-write volumes, and the required plan are not verified. Do not treat
this as a cost estimate or provision a paid resource.

## Review gate

`migrations/0001_core_schema.draft.sql` was generated from the Drizzle table
metadata. It contains the 67 declared tables, 57 foreign-key constraints,
18 unique constraints, and the two declared indexes. It passed a local SQLite
syntax check. The draft does not yet include runtime-only tables, generated
table variants, the maintenance schema, or all constraints expressed only in
runtime DDL. It is not an executable migration for the complete application.

Before Phase 1 can be considered complete, reconcile those omissions,
review defaults and type mappings, and adapt the PostgreSQL-only behavior
into a canonical SQLite/D1 schema. PostgreSQL-specific application behavior
remains unmigrated. Production PostgreSQL remains the rollback source of
truth.
