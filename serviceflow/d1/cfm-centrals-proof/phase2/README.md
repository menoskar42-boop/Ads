# Phase 2: local Express-session → Worker identity handoff

Local-only application proof. No production route is wired to this Worker.
The test imports the actual CFM route registration and reuses the actual
`/api/cfm/auth/login` handler, `requireAuth` middleware, user-management routes,
and CRUD handlers for all CFM reference tables. In the isolated test process
it redirects CFM login/refresh, user-management, and reference storage calls to
local D1 through `CfmD1ReferenceStorage`, points the PG pool at an unreachable
loopback URL, and uses Express MemoryStore sessions.

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
This exercise validates the user/authentication and master-data app-facing
slices, not ticket/child/inventory route storage, Service Flow CFM account
linking, secret provisioning/rotation, or a production deploy.

`../../import-cfm-reference-export.mjs` converts an allowlisted PostgreSQL JSON
export (or synthetic fixture) for all 14 CFM tables into deterministic,
idempotent D1 SQL. It preserves stable IDs, normalizes timestamps, booleans,
numeric values, and JSON, validates duplicate primary/unique keys, and orders
rows by foreign-key dependencies. The test imports the synthetic full-group
fixture twice into local D1, checks row counts and `PRAGMA foreign_key_check`,
then exercises users and reference routes. This does not migrate or query
production data.
