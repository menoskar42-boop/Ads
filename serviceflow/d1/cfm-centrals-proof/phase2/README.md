# Phase 2: local Express-session → Worker identity handoff

Local-only application proof. No production route is wired to this Worker.
The test imports the actual CFM route registration and reuses the actual
`/api/cfm/auth/login` handler, `requireAuth` middleware, and centrals GET/POST/
PATCH/DELETE handlers. In the isolated test process it redirects only the
CFM login/refresh user reads and centrals storage calls to local D1, points the
PG pool at an unreachable loopback URL, and uses Express MemoryStore sessions.

After `requireAuth` refreshes the active CFM user from local D1, a
test-only storage adapter signs a short-lived HMAC context and calls a local
Worker. The Worker performs central list/create/update/delete operations with
prepared D1 statements. It requires both the server-side service token and a
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
This exercise validates one app-facing data slice, not the complete CFM storage
interface or user-administration writes, secret provisioning/rotation, replay
handling for future write operations, or a production deploy.
