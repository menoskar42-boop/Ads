---
name: Workshop outbound messages
description: Boundary between the workshop notification log and real WhatsApp/SMS delivery.
---

Workshop customer notifications must be treated as prepared, tracked messages until a real provider is connected. The current safe behavior is to create a message record, offer a WhatsApp or SMS deep link, and let the operator mark it sent; never claim that the provider delivered it.

**Why:** No external messaging credential or provider is currently attached to the workshop, and silently pretending that a deep link is delivery would hide failed customer communication.

**How to apply:** When adding provider delivery, keep the existing message/outbox record as the audit trail, update `sent` or `error` from the provider response, and use Replit-managed integration/secrets rather than putting credentials in code or chat.