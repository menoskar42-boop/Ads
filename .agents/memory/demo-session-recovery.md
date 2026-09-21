---
name: Demo session recovery
description: How the platform’s Demo read-only session can affect authenticated admin actions.
---

The Demo read-only flag is stored in the browser session and can remain after a real admin session is opened in the same browser. GET pages still render, but POST actions such as adding a company or marking a message read are rejected until the session is cleared.

**Why:** The global Demo guard intentionally blocks every write request, and the first reliable recovery is to log out and sign in again. Real admin login should also clear the Demo flag so the issue does not recur after a fresh authenticated login.

**How to apply:** If the user sees the Arabic read-only Demo message on an admin write action, treat it as a session-state issue—not database loss—then use logout/login and ensure the deployed version includes the admin-login cleanup.