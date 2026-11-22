---
name: Deployment dev dependencies
description: Build commands must account for production installs omitting development-only tooling.
---

Deployment builds can run with NODE_ENV=production, causing npm installs to omit devDependencies even when the build command needs tools such as TypeScript runners.

**Why:** A publish build can pass locally and then fail remotely with a missing build executable despite a correct package manifest.

**How to apply:** Make deployment-time installs explicitly include development dependencies, while keeping the runtime process production-only.