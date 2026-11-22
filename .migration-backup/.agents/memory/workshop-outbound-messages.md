---
name: Workshop outbound messages
description: Boundary between the workshop notification log and real WhatsApp/SMS delivery.
---

Workshop customer notifications must remain tracked in the local outbox. When a workshop connects Twilio or Meta, provider acceptance and later delivery/failure callbacks update that same record; a deep link alone never proves delivery.

**Why:** Provider APIs acknowledge messages before final delivery, and callbacks can be delayed, duplicated, or forged if they are not authenticated and company-scoped.

**How to apply:** Keep the existing message/outbox record as the audit trail, attach Twilio status callbacks and Meta signed webhooks to provider IDs, ignore stale updates, and keep credentials encrypted and out of views/logs.