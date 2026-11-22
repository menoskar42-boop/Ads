---
name: MyBible preview build
description: The root preview launches the co-hosted MyBible app from its compiled dist bundle.
---

The root preview serves the co-hosted MyBible child from `mybible/dist/index.cjs`, so source changes in `mybible/server` are not visible to live preview until MyBible is rebuilt and the root workflow is restarted.

**Why:** Testing the TypeScript service directly can pass while the preview continues running an older bundle.

**How to apply:** After MyBible server or client changes, run its build, restart the root application workflow, then verify the live API or preview.