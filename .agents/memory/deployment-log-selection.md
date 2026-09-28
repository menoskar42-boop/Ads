---
name: Deployment log selection
description: Distinguishes a failed publish candidate from the previous live VM when inspecting runtime logs.
---

**Rule:** Match the deployment ID selected in Publishing Logs to the latest failed build before diagnosing a runtime error. A previous successful VM may remain live while a new candidate fails readiness.

**Why:** A publish can complete compilation and image creation, then fail during promotion. Logs from the still-live deployment do not explain why the candidate failed.

**How to apply:** Compare recent build history with the Publishing Logs filter. If candidate startup logs are unavailable, report the cause as unconfirmed and request logs for that build; do not change code based on another deployment's errors.