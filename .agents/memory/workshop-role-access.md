---
name: Workshop role access
description: Durable rules for role-based authorization in the multi-company workshop.
---

Workshop permissions must be derived server-side from the authenticated `company_users.role` record scoped to the active company. Never trust a role or permission sent in form data, and treat unknown roles as the least-privileged operational role rather than management.

**Why:** The workshop contains financial, customer, inventory, and vehicle-handover actions where hiding a button is not sufficient protection; staff can still submit a crafted request.

**How to apply:** Keep the permission matrix as the single policy source, place permission middleware on every read/write route, and mirror the same checks in templates. Demo sessions may read but must not mutate data. Protect the current administrator from changing their own role and prevent delegation to owner/admin through the workshop UI.