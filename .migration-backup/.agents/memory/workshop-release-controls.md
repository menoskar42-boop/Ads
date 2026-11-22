---
name: Workshop release controls
description: Durable workshop rules for vehicle release, stock reservations, purchasing, and public appointment intake.
---

The workshop must keep three controls separate: a vehicle cannot be delivered until every required final-quality check passes; a reservation reduces available stock without changing physical quantity; a purchase changes stock and moving average only when received. Public appointment requests remain unconfirmed until staff reviews them.

**Why:** Each step represents a different real-world event. Treating a reservation as a receipt or a request as a confirmed appointment creates false inventory and false promises; bypassing final checks creates an unsafe handover.

**How to apply:** Preserve these distinctions when adding edits, imports, cancellation flows, notifications, reports, or integrations around workshop jobs, parts, purchasing, and appointments.