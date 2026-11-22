---
name: Deployment healthcheck status
description: Direct status-code requirement for the VM deployment readiness probe
---

The deployment probe for this HTTP VM must receive status 200 directly from `/`; it does not treat a redirect to a healthy page as readiness.

**Why:** The platform checks the configured root path before promotion and rejects non-200 responses, including a valid 301/302 language redirect.

**How to apply:** Keep `/` renderable without a redirect for the platform homepage, use the language-prefixed URL as the canonical/indexable URL when the public site uses language prefixes, and bind the internal application port before slow module or service initialization. A mapped healthcheck port such as `1104` is the platform proxy for the configured internal port, not evidence of a database URL problem.

Transient `connection refused` or HTTP 500 probes during VM startup may be followed by a successful publish once the server binds and `/` responds. Judge them against the final status of the same build and the server's listen log, not in isolation.

**Why:** A retry on this app logged early refused/500 probes, then started the server and completed successfully; the preceding failed candidate had no runtime logs, so its exact cause remained unconfirmed.

**How to apply:** Correlate probe timestamps with the selected candidate's start/listen messages and final build state. Don't change code based only on early probe failures if that same candidate later becomes healthy.

After unpublishing and republishing, Replit disconnects custom domains from the new deployment. Re-add the root domain and each required subdomain separately; wildcard subdomains are not supported.