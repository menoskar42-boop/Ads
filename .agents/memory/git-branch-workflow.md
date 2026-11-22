---
name: Git update and push sequence
description: The user's required Git workflow for code changes in this project.
---

For every code change, pull the target branch first, read `CLAUDE.md`, make the change, pull the target branch again, then push to `claude/build-oscardevs-ads-mvp-8krfN`.

**Why:** the user asked.

**How to apply:** Preserve uncommitted work by stashing when needed; never delete or reset it. After editing, commit the finished change, pull the target branch again, resolve conflicts without force-pushing, and push only to that branch.
