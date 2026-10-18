# Phase 2: local Express-session → Worker identity handoff

Local-only application proof. No production route is wired to this Worker and
all storage selectors remain unset in the running application.
The test imports the actual CFM route registration and reuses the actual
`/api/cfm/auth/login` handler, `requireAuth` middleware, user-management routes,
CRUD handlers for all CFM reference tables, and ticket list/detail/create,
status/repair/confirmation/reopen/delete, work/measurement, task/inventory, and
incoming-stock operations. Task entry and its stock movements use one D1 batch;
ticket creation claims covered boxes atomically to reject concurrent duplicates.
It also exercises the typed Service Flow coverage-grant adapter against local D1. In the isolated test
process it redirects CFM login/refresh, user-management, and reference storage
calls to local D1 through `CfmD1ReferenceStorage`, points the PG pool at an
unreachable loopback URL, and uses Express MemoryStore sessions.

After `requireAuth` refreshes the active CFM user from local D1, a
typed storage adapter signs a short-lived HMAC context and calls a local
Worker. The Worker performs allowlisted reference-table operations with
prepared D1 statements, including the `centrals` → `cables` foreign key. It
requires both the server-side service token and a
valid, unexpired, audience-bound user context. Browser-supplied identity and
authorization headers are not forwarded.

Run from `serviceflow/`:

```sh
node --import tsx --test d1/cfm-centrals-proof/phase2/auth-handoff.test.mjs
```

Wrangler 4.86 is invoked through `npx`; local D1 state is stored in a temporary
directory and removed by test teardown. The Wrangler compatibility date is
limited to `2026-05-03`, the newest date supported by that local runtime.

The centrals routes currently use `requireAuth`, not an admin/role gate.
Accordingly, any active CFM session role is allowed; the proof verifies an
`ext_tech` can use the existing routes. A general Service Flow Passport session
without `req.session.cfmUser` is rejected. Adding role-based denial would
change current behavior and is deliberately not part of this proof.
Expired-cookie behavior is not simulated with MemoryStore; a tampered cookie
and a CFM account suspended after login are tested instead.

The synthetic HMAC/service tokens are test fixtures, not production secrets.
Service Flow CFM account linking and box-fault ticket creation/settlement still
use PostgreSQL because they cross into PostgreSQL-owned identity, orders, and OM
read models. Ticket box-score enrichment and box-case reporting also remain
PostgreSQL reads. No production data, paid Cloudflare resource, or production
route was used or changed.

`../../import-cfm-reference-export.mjs` converts an allowlisted PostgreSQL JSON
export (or synthetic fixture) for the 14 CFM tables plus
`tech_coverage_grants` into deterministic, idempotent D1 SQL. It preserves
stable IDs, normalizes timestamps, booleans, numeric values, and JSON, validates
duplicate primary/unique keys, and orders rows by foreign-key dependencies.
The test imports the synthetic data twice into local D1, checks row counts and
`PRAGMA foreign_key_check`, then exercises users, references, and typed
coverage-grant operations. No production data is queried or migrated.
