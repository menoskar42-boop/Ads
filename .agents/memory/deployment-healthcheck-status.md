---
name: Deployment healthcheck status
description: Direct status-code requirement for the VM deployment readiness probe
---

The deployment probe for this HTTP VM must receive status 200 directly from `/`; it does not treat a redirect to a healthy page as readiness.

**Why:** The platform checks the configured root path before promotion and rejects non-200 responses, including a valid 301/302 language redirect.

**How to apply:** Keep `/` renderable without a redirect for the platform homepage, use the language-prefixed URL as the canonical/indexable URL when the public site uses language prefixes, and bind the internal application port before slow module or service initialization. A mapped healthcheck port such as `1104` is the platform proxy for the configured internal port, not evidence of a database URL problem.

After unpublishing and republishing, Replit disconnects custom domains from the new deployment. Re-add the root domain and each required subdomain separately; wildcard subdomains are not supported.