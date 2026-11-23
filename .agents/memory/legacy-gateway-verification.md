---
name: Legacy gateway publishing verification
description: Readiness checks for restoring the archived multi-application gateway.
---

A working root preview is not enough to declare the full gateway ready to republish. Verify the archived child applications' production builds and dependency installations as well.

**Why:** Gateway restoration initially passed root-preview checks but publishing failed on security-blocked dependencies in the archived packages; further child-build checks revealed another blocked build dependency.

**How to apply:** Check the gateway, MyBible, and Service Flow dependency sets independently, with development dependencies included for building. Do not bypass the package firewall. Keep build success separate from production database/runtime verification, and report which checks actually ran.

Archived deployments need an HTTP check of each child application's entry page, not just successful startup or API responses.

**Why:** Express can return 404 for an existing SPA index when its absolute filesystem path traverses a hidden archive directory; the child can still boot and answer APIs normally.

**How to apply:** When serving a known file from an archive, keep the public directory as the file-serving root instead of globally allowing dotfiles. Verify the root page, a nested SPA route, and a built asset through the gateway without starting database-connected application logic.
