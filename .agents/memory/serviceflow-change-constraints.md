---
name: Service Flow change constraints
description: User-stated editing and implementation constraints for the Service Flow project.
---

- Never rewrite entire existing files.
- Always use `str_replace` for edits to existing files.
- Add new features one at a time.
- For files over 200 lines, insert code sections only; never replace the full file.
- For complex tasks, break work into steps and confirm after each step.

**Why:** the user provided these as important constraints for Service Flow.

**How to apply:** follow them for Service Flow changes; if the available edit tool cannot perform `str_replace`, make the smallest incremental patch and never overwrite a full existing file.
