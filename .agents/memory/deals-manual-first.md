---
name: Deals manual-first architecture
description: Durable product-source and tenancy decision for the Deals affiliate application.
---

Deals is an independent subdomain application at `deals.oscardevs.com`, not a storefront extension of the main site. Manual product entry must remain fully usable without Amazon API access; Creators API is an optional future source.

**Why:** Amazon Egypt Creators API access requires account eligibility and qualifying-sales conditions, so making the site depend on API access would block launch.

**How to apply:** Keep manual products and affiliate URLs functional on their own. Treat Amazon API as disabled until valid eligibility and credentials are confirmed; never use PA-API 5 or scraping.