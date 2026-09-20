---
name: Service Flow staged Supabase migration
description: Moving current Service Flow tables while leaving photos and archive data behind requires dual database routing.
---

Service Flow cannot switch its single unqualified-table connection to a Supabase schema while photos, 430D, or public archive tables remain in the old database. The app's schema bootstrap also creates missing tables in the active database, and archive routes would otherwise read empty copies.

**Why:** A staged Supabase schema can be populated and verified safely, but final cutover needs explicit archive routing (or a complete move) to preserve reports, uploads, and historical reads.

**How to apply:** Keep the old database as the active source until archive reads/writes have a dedicated connection. Use the Supabase schema for current/reference data and keep latest `case_138` rows per phone, not historical measurement rows.