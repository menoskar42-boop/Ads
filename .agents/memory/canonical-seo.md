---
name: Canonical SEO URLs
description: Canonical URLs must preserve the tenant host and page path across production and preview modes.
---

Use the shared tenant URL helpers for every tenant page and pass the resulting page URL into product and transactional metadata; do not build canonical URLs from the main site origin or hard-code one production domain.

**Why:** Tenant pages can be served through subdomains in production and `/view/<slug>` in previews. Building URLs from a global origin creates canonicals and structured-data links that point to the wrong host or route.

**How to apply:** For tenant subpages, compose the tenant base with `companyPageUrl`; for tenant homepage or noindex utility pages, use the request-aware `canonicalCompanyUrl`.