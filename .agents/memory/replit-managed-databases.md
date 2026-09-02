---
name: Replit-managed databases
description: Database ownership and environment separation for this project.
---

This project uses Replit-managed PostgreSQL only. Development and production intentionally receive different managed `DATABASE_URL` values because they are separate databases; there is no external application database.

**Why:** Treating the different URLs as evidence of an external database led to an unnecessary alias that could make production use the wrong environment's database.

**How to apply:** Use Replit's runtime-managed `DATABASE_URL` directly in every environment. Do not add or prioritize `APP_DATABASE_URL`, do not copy a development URL into deployment secrets, and use the Publish schema-diff flow to carry development schema changes into production.