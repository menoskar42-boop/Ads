# Threat Model

## Project Overview

OscarDevs Ads is a publicly reachable, multi-tenant Express application deployed on Replit Autoscale. It serves several production surfaces from one Node.js process: the OscarDevs marketing site and tenant storefronts on `oscardevs.com` subdomains, merchant/admin dashboards, customer order flows, pharmacy and food ordering flows, and host-routed side apps such as Kakeibo, Safari Kids, and NeuroPilot. PostgreSQL is the system of record for tenants, users, sessions, orders, uploads metadata, and admin data.

Production assumptions for this scan:
- The deployment is public.
- TLS is handled by the platform.
- `NODE_ENV` is `production` in deployed environments.
- Only production-reachable code paths are in scope; pure dev-only flows are out of scope unless production reachability is demonstrated.

## Assets

- **Admin and merchant sessions** — super-admin, company owner, pharmacy staff, and customer sessions gate access to platform-wide and tenant-private data.
- **Tenant data and isolation** — company records, settings, inventory, orders, CRM data, uploaded media, and content must remain isolated by tenant and role.
- **Customer and applicant data** — names, emails, phone numbers, delivery addresses, notes, and order history are stored in PostgreSQL and exposed through dashboards and customer flows.
- **Payment configuration and payment state** — merchant gateway settings, HMAC secrets, and paid/unpaid order state must not be spoofable or exposed.
- **Public brand surfaces on shared domains** — tenant pages, uploaded media, and public forms are rendered on shared OscarDevs-controlled domains and therefore can affect user trust and browser security across the platform.
- **Platform secrets and infrastructure access** — database credentials, mail credentials, push credentials, OAuth secrets, and any session-signing material protect all other assets.

## Trust Boundaries

- **Browser to Express app** — all request data, headers, cookies, form inputs, query params, and uploaded files are attacker-controlled.
- **Express app to PostgreSQL** — the app has broad database access; injection or broken auth in route handlers can become full data compromise.
- **Public tenant to privileged dashboard boundary** — public storefronts and order pages are unauthenticated; `/company`, `/pharmacy`, `/food`, `/customer`, and `/admin` are privileged and must be enforced server-side.
- **Tenant-to-tenant boundary** — one merchant must never gain code execution, data access, or browser-level control over another tenant or the platform admin surface.
- **Server to payment providers / push / mail / AI services** — webhook validation, secret handling, and callback routing must prevent spoofing and unauthorized state changes.
- **Edge/proxy to app boundary** — host and forwarding headers such as `X-Tenant-Host` influence tenant routing and must only be trusted in ways that cannot be spoofed by arbitrary clients.

## Scan Anchors

- **Production entry points:** `server.js`, `src/routes/`, `src/middleware/tenant.js`, `src/lib/gateways/*`, `src/lib/pg_session_store.js`, `src/kakeibo/router.js`.
- **Highest-risk areas:** auth/session setup in `server.js` and login routes; tenant resolution in `src/middleware/tenant.js`; privileged dashboards in `src/routes/admin.js`, `company.js`, `pharmacy_admin.js`, `food_admin.js`; upload handling in those same dashboard routers plus `src/kakeibo/router.js`; payment callbacks in `src/routes/shop.js` and `src/routes/tenant.js`; public coupon/review flows in `src/routes/tenant.js`.
- **Public surfaces:** `/`, `/apply`, `/contact`, tenant storefront/order pages, `/shop/*`, `/customer/*` login/register/order pages, Kakeibo host-routed app, public `/uploads/*` assets served from the main app origin.
- **Privileged surfaces:** `/admin/*`, `/company/*`, `/accounting/*`, `/pharmacy/*`, `/food/*`.
- **Usually lower priority / scoped carefully:** `mykid/` and `neuropilot/` static or mostly client-only subapps unless they bridge into shared sessions, cookies, uploads, or server APIs. Kakeibo is no longer low-priority because it shares the main upload origin and can affect trusted OscarDevs sessions.

## Threat Categories

### Spoofing

This application uses one shared Express session system across multiple privilege levels. The platform must ensure session identifiers are unpredictable, signed with deployment-specific secrets, and rotated when privilege changes occur. Login endpoints for admin, merchant, staff, and customer accounts must resist credential stuffing and brute-force attacks.

Tenant identity is also inferred from host-derived input. The application must not allow arbitrary clients to spoof tenant routing through proxy/header handling.

### Tampering

Merchants and admins can upload media, edit public content, manage inventory, and change order state. The platform must prevent one tenant from turning those features into arbitrary script execution, unauthorized data modification, or cross-tenant impact. Payment callbacks must only mutate order state when verified against the correct merchant secret.

### Information Disclosure

Admin dashboards, merchant dashboards, order tracking pages, CRM screens, and customer order history all expose sensitive business and personal data. Server-side authorization must scope every read to the correct actor and tenant. Error pages and form failures must avoid leaking raw internal details. Uploaded content served from shared domains must not expose authenticated users through browser execution or token theft.

### Denial of Service

Public forms, login routes, AI assistant endpoints, checkout flows, and media uploads are internet-facing and can drive database load, storage growth, or CPU-heavy processing. The platform must keep unauthenticated abuse from exhausting resources or overwhelming privileged accounts and payment/order flows.

### Elevation of Privilege

Privilege boundaries exist between anonymous visitors, customers, merchants, pharmacy staff roles, and super-admins. The system must ensure deactivated tenants cannot retain privileged access, role checks are enforced server-side on every privileged route, uploaded content cannot become active script on shared origins, and injection/path traversal style bugs cannot turn tenant content management into broader platform compromise.
