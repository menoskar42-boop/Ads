---
name: Nutrition goals and shopping state
description: Durable rules for weekly patient goals and shopping-list persistence.
---

Patient goals are agreements, not clinical scores: store the goal definition separately from dated patient-reported progress logs. A goal may sum entries or use the latest entry, and the UI must avoid presenting either as a medical grade.

**Why:** Replacing a goal's value would erase the history an appointment needs to review, while combining habit counts and measurements into one formula would imply unsupported clinical meaning.

Shopping-list marks belong to the active plan version and a stable aggregated line key, not only to a food name. A replacement plan should start unmarked, while reopening the same plan on another device should restore marks.

**Why:** Food names can recur across plans and several plan lines can aggregate into one shopping line; plan scoping prevents old selections from silently appearing on a new prescription.

**How to apply:** Keep company_id and patient_id predicates on every goal/log/check query, validate ownership from the session, and derive shopping line keys server-side before accepting a mark.