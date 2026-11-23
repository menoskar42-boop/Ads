---
name: Legacy gateway workflow commands
description: Shell command handling when wiring the archived gateway into managed artifact workflows.
---

Use a single shell-command string for a development workflow that needs `cd`, `&&`, or `env`. Do not assume an argv array containing `sh -c` will preserve its quoting when converted into a managed workflow.

**Why:** During gateway restoration, an array-form development command ran npm against the workspace instead of the archived package, producing lockfile and `workspace:*` errors. A single command string with an explicit working directory reached the intended package.

**How to apply:** Keep this distinction in mind when validating development commands. Production build/run argv settings are separate; do not change them solely because the development workflow needed a shell string.
