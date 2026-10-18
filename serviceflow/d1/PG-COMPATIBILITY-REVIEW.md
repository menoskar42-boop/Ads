# PostgreSQL behavior compatibility review for a possible D1 cutover

Status: read-only source review and design notes. No application, database,
deployment, or production behavior was changed. These recommendations are not
an implementation plan until reviewed and separately approved.

## Main architectural blocker

Service Flow currently runs as a Node/Express application with `pg` pools,
Drizzle's node-postgres adapter, and SQL sent from the Replit process. A D1
database is accessed from a Cloudflare Worker through a D1 binding (`env.DB`);
the existing Node process cannot use that Worker binding directly. Before
rewriting queries, a separate decision is required: move the database-facing
API into a Worker, or put a narrowly scoped Worker API in front of D1. This
would change the request/data path and must be designed for auth, timeouts,
retries, and payload limits. No D1 binding or such API exists in the current
Service Flow configuration.

## SQL and data behavior translation

| PostgreSQL behavior found in source | D1/SQLite design direction | Compatibility risk / required verification |
| --- | --- | --- |
| `DISTINCT ON (...) ORDER BY ...` in reports and queue selection (`routes.ts`, `cabinet-reassign.ts`, `urgent-no-account.ts`, `repeat-reviews.ts`) | Use `ROW_NUMBER() OVER (PARTITION BY ... ORDER BY ...)` in a CTE, then filter to row 1; alternatively use a correlated max key only where ties are fully specified. | Preserve each existing tie-break order exactly. Add fixture-based tests for duplicate keys and equal timestamps. |
| `ILIKE` and `sf_ar_norm()` for Arabic-insensitive search (`routes.ts`, `repeat-reviews.ts`, `box-full-inspection.ts`) | Normalize search terms in shared JS and compare against an indexed normalized column maintained on writes/imports. For basic case-insensitive ASCII-only matches, `LOWER(..) LIKE LOWER(?)` is an option, not a substitute for Arabic normalization. | SQLite has no project-defined `sf_ar_norm()` unless the behavior is moved into app logic. Keep Arabic letter/diacritic/digit normalization identical and test both stored and incoming text. |
| Aggregate `FILTER (WHERE ...)` (`public-report.ts`, reports, queue metrics) | `SUM(CASE WHEN predicate THEN value ELSE 0 END)` and `COUNT(CASE WHEN predicate THEN 1 END)`. | Check NULL semantics and aggregate types; preserve zero-vs-NULL results. |
| `ANY` / `ALL` with PostgreSQL arrays and typed array params (`routes.ts`, `cabinet-reassign.ts`) | Generate bound `IN (?,...)` placeholders for bounded lists, or pass validated JSON and expand with `json_each(?)`. Express `ALL` as a carefully tested anti-match/`NOT EXISTS`, including empty-list semantics. | Respect D1 bind/SQL limits and chunk large lists. Do not interpolate values. `NULL` array and empty-array cases currently have distinct behavior. |
| `unnest()` / parallel arrays (`routes.ts`, `repeat-reviews.ts`) | Use a bound `VALUES` CTE for small pairs or `json_each()` over one array of objects for larger inputs. | Preserve positional pairing and duplicate handling; test empty arrays and mismatched input lengths. |
| `JSONB`, JSON casts, `jsonb_array_elements_text`, `jsonb_exists` (`exec_jobs`, reports, imports) | Store valid JSON in `TEXT`; use D1's built-in JSON functions such as `json_each`, `json_extract`, and `json_valid`. | D1 documents JSON as text. Audit every JSON operator/cast, validation rule, and update path; keep the serialized shape stable. |
| `AT TIME ZONE`, `now()`, `date_trunc`, `EXTRACT` | Store instants as canonical UTC ISO timestamps; calculate Cairo/UTC day boundaries in application code and bind explicit bounds. Keep date-only business values as date strings. | Source intentionally mixes Cairo business days and UTC sheet dates. A blanket timezone rewrite would change reports and scheduling. Test DST/history and midnight boundaries. |
| `regexp_replace`, POSIX regex, custom `sf_ar_norm()` (`phone-norm.ts`, `box-full-inspection.ts`, many reports) | Move normalization into shared application helpers and persist normalized lookup values/columns; use simple SQLite `replace()` only for narrowly proven cases. | SQLite/D1 does not provide the project's PostgreSQL regex/UDF behavior. Recompute existing normalized values during a separately approved data migration; index them. |
| `INSERT/UPDATE/DELETE ... RETURNING` (queue, imports, cable link, repeat reviews) | Keep only after verifying exact behavior on the target D1 SQL runtime, or use returned mutation metadata / a subsequent keyed read within the same batch. | Preserve affected-row checks and the exact values consumed by callers. Never split a dependent write/read into unrelated requests. |
| `ON CONFLICT ... DO UPDATE/NOTHING` | SQLite conflict syntax is the closest replacement; keep explicit conflict target and conditional updates. | Check partial indexes, `EXCLUDED`, `WHERE` clauses, and conflict behavior against local D1, not just stock SQLite. |
| `serial`, `BIGINT`, `NUMERIC`, timestamp types, booleans | INTEGER rowids for integer keys; TEXT for timestamps/JSON; INTEGER 0/1 for booleans; retain decimal quantities only with a tested representation (scaled integer or validated decimal text). | Do not assume SQLite affinity preserves PostgreSQL precision, sort order, or implicit casts. |

The text-search occurrences previously counted in the phase review are not
unique statements or workload metrics. They indicate review surface only.

## Functions and triggers

`server/db.ts` creates `sf_ar_norm(text)` and the trigger
`trg_line_accounts_drop_no_account`. On every insert/update of `line_accounts`,
when `account_no` is nonblank, the trigger removes a matching
`lines_no_account` mark using trimmed `full_phone`. It protects all writers,
including bulk imports and older application versions.

D1 has no PostgreSQL trigger/function runtime with this PL/pgSQL body. The
candidate replacement is one shared write service that performs the account
upsert and mark deletion in the same D1 transaction/batch, used by every
single-row, bulk, and import write path. Add invariant tests for whitespace,
blank accounts, changed phone numbers, and rollback. Do not replace it with a
best-effort second HTTP request: that would create a consistency gap.

## Transactions, locking, and scheduling

`routes.ts` `withTx()` uses a checked-out `pg` client with `BEGIN/COMMIT`.
`runExecFollowups()` claims due rows with `FOR UPDATE SKIP LOCKED`, inserts
corresponding `exec_jobs`, then stamps the follow-up row in the same
transaction. The executor claim endpoint also relies on a transaction, a
per-site PostgreSQL advisory try-lock, candidate ordering, and a conditional
`UPDATE ... RETURNING`. `cabinet-reassign.ts` uses `FOR UPDATE SKIP LOCKED`
while applying due technician changes.

D1's documented `batch()` sends prepared statements sequentially as a
transaction and rolls back the sequence if a statement fails. It is not a
drop-in PostgreSQL client transaction or row-lock API. Candidate design:

1. Move each logical claim into a D1-side atomic operation; use conditional
   writes (`WHERE status='pending'`) and a lease/claim token to ensure only one
   worker wins.
2. Represent per-site exclusivity as explicit rows keyed by site with owner and
   lease expiry, acquired atomically with a candidate claim. Retain queue order,
   paused/before cutoffs, lane exceptions, and release/recovery rules.
3. Claim due follow-ups and mark them enqueued in one transaction/batch with a
   unique/idempotency key; safely recover expired leases without duplicating
   generated jobs.
4. For cabinet changes, atomically transition only still-pending due rows and
   make application effects idempotent; do not assume `SKIP LOCKED` semantics.

This is a design direction, not a proven equivalent. A concurrency model and
multi-worker contention tests must precede any application change. Cloudflare
documents D1 `batch()` transactions as sequential; preserve correctness first,
then measure whether the needed queue concurrency remains acceptable.

## Sessions

`routes.ts` uses `connect-pg-simple` over `sf_session`, wrapped by
`QuietSessionStore` (`db-quiet.ts`) to cache reads, limit touch writes, and
prune only when the database is already active. If D1 becomes authoritative,
the session store also needs a D1-aware Worker-side adapter or signed stateless
sessions. Stateless sessions would change revocation and server-side logout
semantics; a D1 adapter must preserve expiry, destroy, touch, and cache
invalidation. Keeping PostgreSQL only for sessions would retain a dependency
and weaken the cost case, so decide session architecture before cutover.

## Source evidence and official D1 references

- `serviceflow/server/routes.ts`: `withTx`, follow-up scheduler, queue
  heartbeat/claim, session initialization, report SQL.
- `serviceflow/server/db.ts`: runtime DDL, `sf_ar_norm`, trigger creation,
  `exec_jobs` and `exec_followups`.
- `serviceflow/server/cabinet-reassign.ts`: due reassignments and history
  queries.
- `serviceflow/server/db-quiet.ts`: session/user cache behavior.
- Cloudflare D1 binding and batch API:
  https://developers.cloudflare.com/d1/worker-api/d1-database/
- D1 SQL/SQLite extension coverage:
  https://developers.cloudflare.com/d1/sql-api/sql-statements/
- D1 JSON functions and text storage:
  https://developers.cloudflare.com/d1/sql-api/query-json/

## Gate before any implementation

Do not begin route-by-route rewrites until the Worker/API boundary is chosen,
each SQL query has a behavior-preserving replacement, and test fixtures cover
empty/null inputs, duplicates/ties, time-zone boundaries, rollback, concurrent
claims, expired leases, and session revocation. Run these against local D1
emulation first. Production PostgreSQL remains untouched and is the rollback
source of truth.
