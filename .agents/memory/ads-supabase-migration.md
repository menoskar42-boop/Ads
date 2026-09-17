---
name: Ads Supabase migration
description: Constraints for the external PostgreSQL database used by the Ads application.
---

The Ads database can be reached from Replit through Supabase’s Session Pooler; direct `db.<project>.supabase.co` access may fail DNS resolution, and Supabase database dumps require a PostgreSQL client at least as new as the server.

**Why:** The Supabase target runs PostgreSQL 17 and the direct host was not reachable from the Replit environment, while the Session Pooler worked reliably.

**How to apply:** Use PostgreSQL 17 tooling for future dumps/restores, prefer the Session Pooler on port 5432, and keep the Ads connection separate from `MYBIBLE_DATABASE_URL`.