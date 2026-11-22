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
- `src/routes/` — `index.js` (homepage), `tenant.js` (per-tenant page), `company.js` (company dashboard), `admin.js` (super admin panel)
- `src/middleware/tenant.js` — subdomain extraction + DB tenant lookup
- `src/middleware/auth.js` — company login guard
- `src/middleware/adminAuth.js` — super admin login guard
- `src/views/` — EJS templates (index, tenant, 404, company/, admin/)
- `src/db/schema.js` — table definitions (companies, banner_ads, company_users, portfolio_items, admins)
- `src/db/seed.js` — sample data seeder

## Login credentials (after `npm run db:seed`)
- **Super Admin** — `/admin/login` → `admin@oscardevs.com` / «اطلب البيانات من المالك» (manage all companies)
- **Company Admin (Petra)** — `/company/login` → `petra@test.com` / `petra123`

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

## Public company URL — canonical scheme

Public company pages are linked through the `canonicalCompanyUrl(slug)` helper
(`src/lib/urls.js`, exposed to every EJS template via
`src/middleware/urls.js`). The helper picks the right form per environment:

- **Production host** (any host matching a base in `PUBLIC_BASE_DOMAINS`,
  defaulting to `oscardevs.com` / `oscardevsads.replit.app`):
  emits `https://<slug>.<base>`. The legacy `/view/<slug>` route 301-redirects
  to this canonical URL so old bookmarks keep working.
- **Replit dev** (`*.replit.dev`) and **localhost**: emits `/view/<slug>` —
  wildcard subdomains are not possible on dev URLs, so the path-based fallback
  is used and no redirect is performed.

### Configuring custom domain on Replit + Cloudflare
Replit's custom-domain UI does not accept `*.oscardevs.com` (wildcard certs are
not issued automatically). Workaround: only the apex `oscardevs.com` is bound
to Replit, and a tiny Cloudflare Worker (`cloudflare-worker/`) rewrites all
subdomain traffic onto the apex while preserving the original host in
`X-Forwarded-Host`.

1. In **Replit Deployment → Custom Domains**, add `oscardevs.com` only
   (no wildcard). Replit shows TXT verification + `A`/`AAAA` records.
2. In **Cloudflare DNS** for `oscardevs.com`:
   - Add the TXT verification record from step 1.
   - Add the `A`/`AAAA` records Replit provides for the apex (`@`).
     Proxy status: **proxied** (orange cloud).
   - Add `CNAME` record `*` → `oscardevs.com`. Proxy status: **proxied**.
3. Deploy the Cloudflare Worker that rewrites subdomain → apex:
   ```bash
   cd cloudflare-worker
   npm install
   npx wrangler login    # one-time browser login (free Cloudflare account)
   npm run deploy
   ```
   The Worker is bound to route `*.oscardevs.com/*` (apex is intentionally
   unbound, so apex traffic flows directly to Replit).
4. In **Replit Deployment Secrets** (NOT in the dev workspace), set:
   `PUBLIC_BASE_DOMAIN=oscardevs.com` (comma-separated list also accepted via
   `PUBLIC_BASE_DOMAINS`).

The Express app sets `app.set('trust proxy', true)` so `req.hostname` reflects
the Worker's `X-Forwarded-Host` (e.g. `delta.oscardevs.com`) — the existing
tenant middleware and `canonicalCompanyUrl` helper need no further changes.

### Verifying
- Local Replit dev: `/view/delta` returns 200 directly; admin "View" buttons
  link to `/view/<slug>`. No env var needed.
- Production: `curl -I https://oscardevs.com/view/delta` → 301 to
  `https://delta.oscardevs.com`. Admin "View" buttons link to subdomain URLs.
- Escape hatch for debugging: `?noredirect=1` on `/view/<slug>` skips the
  301 even on production hosts.
