---
name: Service Flow change constraints
description: User-stated editing and implementation constraints for the Service Flow project.
---

- Never rewrite entire existing files.
- Always use `str_replace` for edits to existing files.
- Add new features one at a time.
- For files over 200 lines, insert code sections only; never replace the full file.
- For multi-phase migrations, continue sequentially without requesting phase-by-phase confirmation; give one consolidated report after all safe implementation work is complete.

**Why:** the user provided these as important constraints for Service Flow.

**How to apply:** follow these constraints for Service Flow changes; if the available edit tool cannot perform `str_replace`, make the smallest incremental patch and never overwrite a full existing file. Do not stop between migration groups to ask whether to continue.
