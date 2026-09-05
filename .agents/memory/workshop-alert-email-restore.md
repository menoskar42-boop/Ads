---
name: Workshop alert-email restoration
description: Restoration must select an earlier address inside the company-scoped audit transaction and append a new audit event.
---

Restore an earlier workshop alert address only when the selected audit row belongs to the current company and its previous value passes the same email validation as normal settings saves. Lock the current settings row, update it, and append the restoration as a new audit event in one transaction.

**Why:** A history identifier alone is not a tenant boundary, and a successful restore without a new event makes the audit trail misleading.

**How to apply:** Preserve both the company predicate and the transaction whenever adding restore, undo, or replay actions to workshop settings.

Security denials for this history belong in the shared append-only audit log with `system=workshop`; store only the real session company/account and safe request metadata, then expose review through trusted admin tooling rather than the workshop UI.

**Why:** The same history boundary needs investigation signals, but recording submitted email or company-scope values would turn an access log into a data leak.

**How to apply:** Keep security-event metadata free of email/message content and never let a query parameter become the event’s tenant identity.