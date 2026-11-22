---
name: Workshop schema test setup
description: Keep standalone PostgreSQL integration checks independent of app boot timing.
---

Standalone workshop integration checks should run the idempotent workshop schema initializer before creating test fixtures. The application starts before its asynchronous chain of schema initializers finishes, so a check run during startup can otherwise observe an older schema and fail on a column that the source migration already defines.

**Why:** A full-suite run observed `applied_at` missing in the development database until the workshop initializer completed; the same check passed after initializing the schema.

**How to apply:** Before PostgreSQL-backed workshop fixtures, await `ensureWorkshopSchema()` and keep the actual assertions enabled. Do not convert missing columns into a skipped or passing result.
