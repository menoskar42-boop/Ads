---
name: Local D1 emulation
description: Wrangler local D1 constraint-test behavior that does not carry into a later CLI call.
---

When testing SQLite foreign keys through repeated Wrangler `d1 execute --local` calls, set `PRAGMA foreign_keys = ON` in every SQL invocation; setting it only while creating the schema is not sufficient for later commands.

**Why:** The CFM synthetic proof initially accepted an invalid FK when the pragma had only been applied during schema creation; setting it in each invocation made FK failure tests behave as intended.

**How to apply:** Keep this limited to CLI-based local proofs. It is not evidence about transaction semantics or how a deployed D1 Worker enforces its own operations.

In this workspace's local Wrangler D1 runtime, a `UNION ALL` validation query over seven table-count SELECTs failed with `too many terms in compound SELECT`; split validation into smaller queries (four terms passed) or query tables individually.

**Why:** The local D1 SQL runtime has a lower compound-SELECT limit than expected for this verification path.

**How to apply:** Keep local migration-proof count queries small; do not infer that the same limit or query behavior applies to remote D1.

Wrangler local `d1 execute` rejects explicit SQL `BEGIN`/`COMMIT` in a file invocation. For retryable local imports, emit dependency-ordered idempotent statements and rerun after partial failure.

**Why:** A local migration proof failed with Wrangler's instruction to use its storage transaction APIs instead of SQL transaction statements.

**How to apply:** Do not wrap CLI-import SQL in `BEGIN`/`COMMIT`, and do not infer from this CLI restriction how a Worker's D1 batch operations behave; test those operations separately.
