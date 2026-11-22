---
name: Inspection follow-up source
description: Which report supplies installation rows for the random inspection sample.
---

Installation rows in the inspection follow-up sample must come from the Work Orders report, not the Current Installations report.

Enrich those work-order rows by matching the service number to the Phone Lines report, so each sampled installation can show the subscriber's name, address, mobile, and available technical line details.

**Why:** the user clarified that these reports are separate and the random installation sample must represent Work Orders.

**How to apply:** source the sampled installation records from Work Orders data, join Phone Lines data by normalized phone number, and refresh stored sample snapshots when the enrichment fields change; keep Current Installations as a distinct report.
