---
name: Database runtime selection
description: Verify each hosted app's active database target before querying or changing schemas.
---

This workspace can run separate applications against different PostgreSQL targets. The main server may select an Ads-specific external database, while co-hosted Service Flow has its own primary database and may optionally read a separate Supabase schema. The Replit-managed database pane is not proof of either deployed application's target.

**Why:** Applying a generic Replit database assumption to a multi-app workspace can query or modify the wrong database.

**How to apply:** Trace the runtime connection selection for the specific app and environment, then verify the target with read-only metadata. Never infer that development and deployment secrets are equal.