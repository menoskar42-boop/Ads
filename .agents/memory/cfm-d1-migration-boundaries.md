---
name: CFM D1 migration boundary
description: User-approved Service Flow data-layer migration scope and production-safety constraints.
---

- Keep PostgreSQL as the production default and retain it for sessions, execution queues, claims, locks, retries, and related state.
- Keep files and media in Cloudflare R2.
- Do not move ticket workflows or `box_fault_tickets` writes until cross-database partial-failure recovery is implemented and tested.
- Do not query or migrate production data, deploy a Worker, create paid Cloudflare resources, or redirect production traffic without the required review and approval.

**Why:** the user prioritizes cost savings but requires rollback safety, no premature cutover, and explicit review of migration and failure recovery.

**How to apply:** use synthetic data and local D1 for implementation; preserve PostgreSQL production routing and isolate ticket/box-fault operations until recovery semantics are proven.
