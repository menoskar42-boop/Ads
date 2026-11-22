---
name: Service Flow change constraints
description: User-stated editing and implementation constraints for the Service Flow project.
---

- Never rewrite entire existing files.
- Always use `str_replace` for edits to existing files.
- Add new features one at a time.
- For files over 200 lines, insert code sections only; never replace the full file.
- For multi-phase migrations, continue sequentially without requesting phase-by-phase confirmation; give one consolidated report after all safe implementation work is complete.
- Send code changes through the GitHub branch so Replit can pull them; the owner handles publishing.
- For every requested code change in this workspace, pull `origin/claude/build-oscardevs-ads-mvp-8krfN` before editing, make the change, pull again, then commit and push the change to that same branch.

**Why:** the user provided these as important constraints for Service Flow.

**Why:** the user explicitly requested this GitHub synchronization sequence and branch for all code edits in this workspace.

**How to apply:** follow these constraints for Service Flow changes; if the available edit tool cannot perform `str_replace`, make the smallest incremental patch and never overwrite a full existing file. For code edits, pull the named branch before changes and again afterward, then commit only the requested changes and push to that branch. Do not push unrelated local commits or files. Do not stop between migration groups to ask whether to continue.
