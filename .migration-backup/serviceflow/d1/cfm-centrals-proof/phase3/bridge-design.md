# Phase 3 — Express-to-D1 Worker bridge design

**Status:** design and local contract tests only. The application is not wired
to D1, no Cloudflare resources were created, and no production data was accessed.

## Decision

For the current Replit-hosted Express app, use an authenticated HTTPS request to
a narrowly scoped Cloudflare Worker endpoint. Do not use a Cloudflare Service
Binding directly from Express: Cloudflare documents Service Bindings as
Worker-to-Worker calls, while Replit deployments support outbound HTTPS to
external services. A Worker-to-Worker proxy would still leave the Express-to-
Cloudflare HTTPS boundary and add an unnecessary hop for this app.

Protect the HTTPS endpoint with a Cloudflare Access Service Auth policy and
service token when the account's plan/configuration and cost are confirmed.
Also verify a short-lived HMAC-signed request inside the Worker. Access is an
edge gate; the HMAC binds the request and authenticated CFM identity end to end.
Do not rely on Access context being propagated across Worker Service Bindings.
If Access cannot be enabled within the approved cost, the HMAC check remains
mandatory, but the endpoint's public exposure/rate-limit risk must be reviewed
before launch.

This is a future recommendation, not authorization to create the Access app,
service token, Worker, D1 database, or production secrets.

## Request protocol

1. Express continues to run the existing CFM `requireAuth` middleware. It
   refreshes `req.session.cfmUser` from the existing PostgreSQL-backed storage
   and rejects missing or suspended users. Do not accept a user ID, role,
   tenant, or auth token from browser headers/body as identity.
2. A route-specific client creates an allowlisted operation request, e.g.
   `GET /v1/cfm/centrals`. The first typed client surface is:

   ```ts
   type CfmCentral = {
     id: string;
     name: string;
     code: string;
     createdAt: string;
   };

   interface CfmD1Client {
     getCentrals(actor: { id: string; role: string }): Promise<CfmCentral[]>;
   }
   ```

   This is not a generic SQL, table, or arbitrary URL interface.
3. Express sends HTTPS with Cloudflare Access service-token headers and a
   canonical HMAC signature over protocol version, method, exact path, timestamp,
   nonce/request ID, body hash, and a base64url user context. Context claims
   include issuer, audience, `sub`, role, `iat`, `exp`, key ID, and request ID;
   they never include the session cookie or password. Worker verifies both
   ingress auth and signature before touching D1.
4. Set a small clock-skew allowance (30 seconds) and a maximum context lifetime
   of 60 seconds. Phase 2 locally tested a 30-second context. For this read-only
   GET, a replay inside the short validity window has no write side effect.
   Before adding writes, require operation-specific idempotency keys and a
   durable uniqueness/replay strategy; do not rely on Worker memory for replay
   prevention.
5. Use key IDs and a dual-key overlap for rotation: provision the new key in
   Replit Secrets and Worker secrets, verify both keys, then revoke the old key.
   Keep Access service-token rotation separate; Cloudflare supports expiry and
   a grace period. Never put secret values in source, request logs, or error
   responses.

## Endpoint, typed operations, and errors

- Production path: one HTTPS hostname protected by Access, exact method/path
  allowlist, no browser CORS access, and no generic proxy endpoint.
- First operation: only `GET /v1/cfm/centrals`, using a prepared D1 query and
  returning the current Express JSON shape. Keep the current route on PostgreSQL
  until a separately approved cutover.
- `400` for invalid operation input; `401` for invalid service auth/signature;
  `403` for a denied operation/role if the existing route requires one; `404`
  for unknown operation; `429` for bounded rate limiting; `5xx` for Worker/D1
  failures. Do not leak SQL, stack traces, or secret/header values.
- Use one request attempt with an initial 2-second deadline. Do not retry
  automatically in the first slice; this avoids duplicate request cost and
  hides fewer failures. A timeout or upstream failure becomes a sanitized
  `503` at the Node boundary, with a correlation ID and no silent PostgreSQL
  fallback. A deliberate operator switch back to PostgreSQL is the rollback.
- Log request ID, fixed operation name, status, and duration only. Do not log
  request/response bodies, cookies, Authorization/Access headers, signed
  contexts, user IDs, or SQL.

The current centrals route uses `requireAuth`, not an admin/role gate. Preserve
that: any active CFM session role currently has access. A Worker-side role
restriction must not be added unless the product's permission policy changes
and is separately approved.

## Reachability comparison

| Option | Works from current Replit Express? | Security/cost notes | Decision |
|---|---|---|---|
| Cloudflare Service Binding to a private Worker | No direct binding interface is available to the Replit Node runtime; Cloudflare describes it as Worker-to-Worker. | Cloudflare says bindings add no Service Binding charge, but a Replit-to-Worker HTTPS ingress is still required. | Do not use as the Express transport. Reconsider only if the caller itself moves to Workers. |
| Express → HTTPS Worker endpoint | Yes; Replit documents outbound HTTPS requests to external APIs. | Public network reachability must be gated. Access Service Auth plus HMAC is the preferred defense-in-depth design; account-specific costs/limits remain unverified. | Recommended after security and cost review. |
| Express → HTTPS Access-protected ingress Worker → Service Binding → D1 Worker | Technically possible, but still uses HTTPS from Replit and adds a Worker hop/deployment. | Binding itself is documented as zero-cost; extra Worker/API/Access configuration and operational complexity remain. | Not justified for the first low-cost slice. |

## Compatibility, disabling, and rollback

- Keep `exec_jobs`, `exec_followups`, claims/locks/retries, `sf_session`, and all
  other session behavior in PostgreSQL. Keep R2 file objects and references on
  the existing path.
- A future route switch must be explicit and default to `pg` (for example, a
  single-operation backend selector); do not infer D1 from the presence of a
  secret or binding. The existing response format and Express authorization
  remain unchanged.
- On Worker timeout/error, return a clear unavailable response; do not issue a
  second read to PostgreSQL inside the same request, which could mask stale or
  divergent state. Disable the selector to return to the existing PG handler.
- Do not dual-write. Do not assume atomicity between D1 and PostgreSQL. Queues,
  sessions, cross-database joins, and transaction-dependent table groups remain
  outside this bridge.

## Local tests and limitations

Phase 1 and 2 use Wrangler local D1 with synthetic central rows. Phase 2 invokes
the actual CFM login handler and `requireAuth`, then exercises a test-only
bridge and verifies signed context, invalid auth, forged browser identity,
suspended account, and invalid session cookie. Phase 3 adds a local HTTP
contract stub for timestamp/signature validation, timeout, and upstream error
mapping; it does not call Cloudflare or the production app.

Expired Express-session-cookie behavior is not established by the local
MemoryStore test: browser cookie expiry and persistent production session-store
expiry need an isolated test against the actual configured session store, with
no production database. Phase 2 does verify expired Worker context rejection.
No local test establishes Access policy configuration, outbound production
reachability, Cloudflare billing, request volume, production latency, or
production readiness.

No Cloudflare resources were created and no cost was incurred in this phase.
Before any remote setup, verify current Access/Workers/D1 pricing and request
approval for any paid resource.

## Sources

- Cloudflare Service Bindings: <https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/>
- Cloudflare Access for Workers: <https://developers.cloudflare.com/workers/configuration/cloudflare-access/>
- Cloudflare Access service tokens: <https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/>
- Replit Deployments: <https://docs.replit.com/learn/projects-and-artifacts/replit-deployments>
- Replit networking guidance: <https://docs.replit.com/help/networking-and-app-errors>
