---
name: Deployment healthcheck status
description: Direct status-code requirement for the VM deployment readiness probe
---

The deployment probe for this HTTP VM must receive status 200 directly from `/`; it does not treat a redirect to a healthy page as readiness.

**Why:** The platform checks the configured root path before promotion and rejects non-200 responses, including a valid 301/302 language redirect.

**How to apply:** Keep `/` renderable without a redirect for the platform homepage, and use the language-prefixed URL as the canonical/indexable URL when the public site uses language prefixes.