---
name: Workshop scheduler is gated and slow on purpose
description: Why the workshop background tick runs every two hours and skips itself when no workshop tenant exists.
---

The production database is billed by **compute hours**, not by data size. The
2026-09 invoice was $15.05: $15.03 of it compute, two cents of storage — the
whole dataset is 60 MB. A timer that queries once a minute keeps the database
awake around the clock, so we pay for an awake hour to ask an empty table.

Three workshop timers (retry every 60s, reminders every 5m, health every 10m)
added on 2026-09-02 were doing 1,872 queries a day while **no workshop tenant
was subscribed at all**. They are now one `workshopTick()` every two hours
(`WORKSHOP_TICK_MS`), and it returns immediately unless a company with
`page_type='workshop'` exists.

**Nothing needs to be remembered to turn this back on.** The gate opens by
itself on the next tick once the first workshop subscribes. Only raise the
frequency if a paying workshop actually needs tighter retry latency — and then
the compute hours are being paid for by a customer.

`scripts/check-db-timers.js` fails any setInterval that queries the database
more often than every 10 minutes without an explicit `// db-timer-ok: <reason>`
line above it, and asserts the workshop gate is still in place.
