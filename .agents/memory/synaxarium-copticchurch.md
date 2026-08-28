---
name: Synaxarium source
description: Source and fallback policy for Arabic daily Synaxarium content
---

The Arabic daily Synaxarium is sourced from the month/day pages on copticchurch.net. The application should preserve the source URL for each entry and must show an explicit loading, empty, or unavailable state instead of silently substituting local stories.

**Why:** The upstream page is the verifiable daily source and local story snapshots can become incomplete or stale.

**How to apply:** Keep month/day validation and short server caching at the API boundary; use local month metadata only for navigation labels and day links, never as content fallback.