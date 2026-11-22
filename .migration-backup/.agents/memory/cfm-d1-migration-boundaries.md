---
name: CFM D1 migration boundary
description: User-approved Service Flow data-layer migration scope and production-safety constraints.
---

- Keep all application user tables (including `cfm_users`), sessions, execution queues, claims, locks, retries, and related state in PostgreSQL; PostgreSQL remains the production default.
- Keep files and media in Cloudflare R2.
- Do not move ticket workflows or `box_fault_tickets` writes until cross-database partial-failure recovery is implemented and tested.
- Do not query or migrate production data, deploy a Worker, create paid Cloudflare resources, or redirect production traffic without the required review and approval.

**Why:** the user prioritizes cost savings but requires rollback safety, no premature cutover, and explicit review of migration and failure recovery.

**How to apply:** use synthetic data and local D1 for implementation; preserve PostgreSQL production routing and isolate ticket/box-fault operations until recovery semantics are proven.

`tech_coverage_grants` is implemented as a separately selectable D1 table because it has no relational FK; keep PostgreSQL as its default and continue resolving worker codes through PostgreSQL `technician_names`.

**Why:** grant CRUD and reads can be isolated, but the authorization result still depends on the technician-name lookup and must preserve exact name matching.

**How to apply:** use the explicit `SF_TECH_COVERAGE_STORAGE=d1` opt-in only with a configured Worker; do not infer that other Class C tables are independently movable.
