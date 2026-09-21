---
name: Local preview host routing
description: Why loopback hosts must bypass tenant-subdomain detection in this multi-tenant app
---

Loopback hosts such as `127.0.0.1`, `localhost`, and `0.0.0.0` must resolve to the platform homepage rather than being parsed as tenant slugs.

**Why:** Replit's local preview can request the app with a numeric loopback Host; generic multi-tenant fallback parsing then mistakes the first label for a company slug and returns a misleading 404.

**How to apply:** Keep loopback hosts in the same root-host allowlist as Replit preview and deployment domains. Do not broaden the rule to arbitrary unknown production subdomains, which should remain tenant-routed.

For Service Flow's path-hosted preview, the client must be built and run with `SF_BASE_PATH=/serviceflow/`; a bare client build emits root-relative assets and makes `/serviceflow/` appear blank even when the server is healthy.

**Why:** The gateway serves Service Flow below `/serviceflow/`, while Vite defaults to `/` unless the deployment environment supplies the path explicitly.

**How to apply:** Preserve the explicit `SF_BASE_PATH` in `.replit` build/run commands and use the path-aware build for live preview verification.