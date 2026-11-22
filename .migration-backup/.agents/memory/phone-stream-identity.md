---
name: Phone stream identity
description: Security boundary for Sokro phone-call media streams
---

Voice media streams must be bound to a short-lived signed capability containing the Sokro user and call identifiers, then checked against the call ownership record before opening an AI session. A phone number, provider CallSid, or WebSocket URL alone is not an identity.

**Why:** Twilio Media Stream callbacks arrive independently of the user's browser session and are externally reachable; trusting provider identifiers alone could mix sessions or expose another user's conversation.

**How to apply:** Preserve the signed token and ownership lookup whenever changing TwiML, the WebSocket upgrade handler, or phone-call persistence.