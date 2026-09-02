---
name: Workshop operations lifecycle
description: Durable workflow rules for workshop job stages, handover evidence, and stock movement history.
---

The workshop lifecycle should distinguish diagnosis, approval, parts waiting, repair, quality review, pickup readiness, and handover; technician notes and handover evidence belong to the job history, while every stock count, receipt, issue, and supplier return belongs in the movement ledger.

**Why:** A single “done” state hides the decisions that block work, and changing a shelf quantity without a movement record makes inventory and margin investigations impossible.

**How to apply:** Preserve old job statuses when evolving the flow, add new stages additively, keep delivery behind quality/payment decisions, and make all inventory corrections transactional and company-scoped.