---
name: Local D1 emulation
description: Wrangler local D1 constraint-test behavior that does not carry into a later CLI call.
---

When testing SQLite foreign keys through repeated Wrangler `d1 execute --local` calls, set `PRAGMA foreign_keys = ON` in every SQL invocation; setting it only while creating the schema is not sufficient for later commands.

**Why:** The CFM synthetic proof initially accepted an invalid FK when the pragma had only been applied during schema creation; setting it in each invocation made FK failure tests behave as intended.

**How to apply:** Keep this limited to CLI-based local proofs. It is not evidence about transaction semantics or how a deployed D1 Worker enforces its own operations.
