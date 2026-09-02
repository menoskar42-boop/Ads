---
name: External DB publish schema
description: Why publishing can fail on schema diff even when the application uses a separate external database.
---

When the application overrides Replit's runtime database with an external connection, its startup schema work updates the external database, not Replit's managed development database. Publishing still compares Replit's managed development and production schemas, so the managed development schema can lag and produce destructive drop statements before any build starts.

**Why:** A publish attempt was blocked by drop statements for objects that still existed in both the source code and managed production; they were simply missing from the managed development database.

**How to apply:** Before publishing after schema-related work, inspect the development-to-production diff. If source-defined objects are missing only from managed development, add them there non-destructively and recheck until the diff contains no structural data loss. Never approve a drop merely to unblock publishing, and never mutate managed production directly.