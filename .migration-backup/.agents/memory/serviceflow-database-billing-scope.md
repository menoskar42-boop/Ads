---
name: Service Flow database billing scope
description: User-reported database provider boundary across this workspace.
---

Service Flow is the only site the user identifies as using a Replit-hosted database; the other sites use Supabase.

**Why:** Database cost attribution should not assign Replit production database charges to sites whose databases are hosted on Supabase.

**How to apply:** When analyzing Replit database billing, attribute production database usage to Service Flow unless new evidence shows another Replit database resource.
