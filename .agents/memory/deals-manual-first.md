---
name: Deals manual-first architecture
description: Durable product-source and tenancy decision for the Deals affiliate application.
---

Deals is an independent subdomain application at `deals.oscardevs.com`, not a storefront extension of the main site. Manual product entry must remain fully usable without Amazon API access; Creators API is an optional future source.

**Why:** Amazon Egypt Creators API access requires account eligibility and qualifying-sales conditions, so making the site depend on API access would block launch.

**How to apply:** Keep manual products and affiliate URLs functional on their own. Treat Amazon API as disabled until valid eligibility and credentials are confirmed; never use PA-API 5 or scraping.

Deals is co-hosted as its own process behind the host gateway; its session cookie security is controlled explicitly by `DEALS_COOKIE_SECURE` so local HTTP smoke tests do not lose admin sessions while production can enforce Secure cookies.

**Why:** The parent process may run with production-like settings during local development, while the internal Deals service is reached over HTTP.

**How to apply:** Keep the gateway opt-in and use `DEALS_COOKIE_SECURE=false` for local Workflow traffic and `true` for HTTPS production traffic.