---
name: Safari Kids PWA cache updates
description: Cache versioning required for home-screen Safari Kids installs to receive changed code.
---

Increment the Safari Kids service-worker cache name whenever cached JavaScript or CSS changes. The service worker serves static assets cache-first and deletes prior caches during activation.

**Why:** The user reported that the browser showed updated lessons while the home-screen app continued showing the previous version; its worker cache version had not changed.

**How to apply:** After editing Safari Kids client modules, styles, or asset mappings, bump the cache version in the worker. The runtime asset manifest includes JavaScript and CSS recursively, and the worker already checks for updates and reloads on controller change.
