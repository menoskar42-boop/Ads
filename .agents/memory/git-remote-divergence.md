---
name: Git remote divergence
description: Replit Git-pane authentication and merge behavior when a local branch diverges from its GitHub remote
---

An active GitHub connection does not guarantee that the Replit Git pane has refreshed its remote session. When the local branch is ahead and behind the remote, Pull can start a merge and block the workspace on conflicts; if the remote changes are not intentionally being adopted, abort the merge instead of completing it.

**Why:** The GitHub connection/API can be healthy while the pane reports a stale authentication failure, and a Pull on an unrelated divergent branch can introduce unrelated conflicts.

**How to apply:** Verify the remote connection and branch status first. Prefer preserving the local commits and refreshing/reconnecting the provider; do not Pull merely to clear the ahead/behind warning.