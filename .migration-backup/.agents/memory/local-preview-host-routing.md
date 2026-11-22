---
name: Local preview host routing
description: Why loopback hosts must bypass tenant-subdomain detection in this multi-tenant app
---

Loopback hosts such as `127.0.0.1`, `localhost`, and `0.0.0.0` must resolve to the platform homepage rather than being parsed as tenant slugs.

**Why:** Replit's local preview can request the app with a numeric loopback Host; generic multi-tenant fallback parsing then mistakes the first label for a company slug and returns a misleading 404.

**How to apply:** Keep loopback hosts in the same root-host allowlist as Replit preview and deployment domains. Do not broaden the rule to arbitrary unknown production subdomains, which should remain tenant-routed.

For Service Flow's path-hosted preview, both the child client build and the active `Start application` workflow must set `SF_BASE_PATH=/serviceflow/`. The deployment build/run settings do not automatically configure the preview workflow.

**Why:** The gateway serves Service Flow below `/serviceflow/`, while Vite defaults to `/` unless the client build gets the path. A correct deployment setting does not fix a development workflow that omits it.

**How to apply:** Set `SF_BASE_PATH=/serviceflow/` on both the client build and the running preview workflow; verify that generated asset URLs start with `/serviceflow/`.