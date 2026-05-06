# Oscardevs Ads
Multi-tenant SaaS advertising platform — each company gets a subdomain-based branded landing page with configurable ad slots.

## Run & Operate
- `npm run dev` — Start dev server with auto-reload (port 5000)
- `npm start` — Start production server
- `npm run db:schema` — Create/update database schema
- `npm run db:seed` — Insert sample tenant data (petra, delta)
- Required env vars: `DATABASE_URL` (set automatically by Replit PostgreSQL)

## Stack
- Node.js + Express — web server
- EJS — server-side templating
- PostgreSQL (via `pg`) — tenant/ad storage
- Tailwind CSS (CDN) — styling
- dotenv — environment config

## Where things live
- `server.js` — app entry, middleware wiring, server start
- `src/routes/` — `index.js` (homepage), `tenant.js` (per-tenant page)
- `src/middleware/tenant.js` — subdomain extraction + DB tenant lookup
- `src/views/` — EJS templates (index, tenant, 404)
- `src/db/schema.js` — table definitions (companies, banner_ads)
- `src/db/seed.js` — sample data seeder

## Architecture decisions
- Multi-tenancy via subdomain: middleware reads hostname, extracts subdomain, looks up company by `slug`
- No build step — pure Node.js, runs directly with `node --watch`
- Tenant routing is handled inline in `server.js` before the main router
- Static assets served from `public/` directory

## Product
- Public homepage marketing page at root domain
- Per-tenant branded landing pages at `<slug>.<domain>`
- Banner ad slots: top, sidebar, footer per company
- 404 with subdomain context when tenant not found

## Gotchas
- Server must bind to `0.0.0.0` for Replit proxy to work (port 5000)
- Subdomain detection requires at least 3 hostname parts (sub.domain.tld)
- `www` subdomain is ignored by tenant middleware
