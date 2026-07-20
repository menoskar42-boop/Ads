# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## SEO change checklist (MANDATORY)

Any SEO-related change (titles, meta descriptions, H1, schema, snapshot HTML) MUST be followed by a compliance check before committing:

1. **Title ≤ 70 characters** (Bing de-indexes / down-ranks longer titles). Count with Python `len()` on the exact string — `wc -m` miscounts Arabic under some locales.
2. **Meta description ≤ 160 characters** (avoid truncation).
3. **No content that violates Google AdSense policies** (no misleading content, no scraped-only pages, must add original value).
4. **Nothing that triggers "page not fully served / not indexed" in Bing** — ensure bot snapshots render real, unique, indexable content; keep `X-Robots-Tag: index, follow`.
5. **Verify the exact book/route key** against the real stored name (e.g. Revelation key is `رؤيا يوحنا`, not `الرؤيا`) before adding per-route overrides.

If any change risks an indexing violation, fix it in the same commit. This is a standing rule — apply it every time without being reminded.

## Commands

```bash
# Development (serves API + client via Vite proxy on port 5000)
npm run dev

# Type checking
npm run check

# Production build (outputs to dist/)
npm run build

# Run production build
npm start

# Push DB schema changes (requires DATABASE_URL)
npm run db:push
```

There is no test suite. `npm run check` (tsc) is the primary correctness gate.

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (required)
- `SESSION_SECRET` — session signing secret
- `NODE_ENV` — `development` or `production`
- AI keys: `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`

## Architecture

### Stack overview

Full-stack TypeScript monorepo: Express backend + React SPA, both in one process. In dev, Vite runs as middleware inside Express. In production, Express serves the pre-built static files from `dist/public/`.

```
server/index.ts      Express entry — sessions, middleware, route registration, Vite setup
server/routes.ts     Main API routes
server/group-routes.ts / church-routes.ts / challenge-routes.ts   Feature-scoped route files
server/storage.ts    Drizzle ORM query layer (all DB access goes through here)
server/ai-service.ts Hybrid AI — local rules + Groq/OpenAI/Google for premium queries
shared/schema.ts     Single source of truth for DB schema + Zod types (shared by client & server)
client/src/App.tsx   React root — routes via wouter
client/src/lib/api.ts  Typed fetch helpers used by React Query
```

### Path aliases

| Alias | Resolves to |
|---|---|
| `@/*` | `client/src/*` |
| `@shared/*` | `shared/*` |

### Data flow

1. Client calls `client/src/lib/api.ts` helpers → React Query cache
2. Express routes call `server/storage.ts` → Drizzle ORM → PostgreSQL
3. `shared/schema.ts` exports both Drizzle table definitions and Zod schemas; both sides import from `@shared/schema`

### Session & auth model

Users are anonymous: a session cookie is created on first visit and a UUID user row is inserted. "Premium" is a boolean on the `users` table. There is no login/password flow — `server/auth.ts` provides helpers (`ensureSessionUser`, `checkPremiumStatus`, `checkAiUsageLimit`).

### Static / embedded content

Much of the Orthodox section's content (Agpeya, Katameros, hymns, liturgies, commentaries, books, saints, deuterocanonicals) is **fully embedded as TypeScript data files** in `client/src/lib/`. These are large files; no external fetches are needed for that content.

### SEO & behavioral tracking

- `usePageTracker` hook records engagement (time, scroll, clicks) → `POST /api/page-metrics`
- `server/metrics-service.ts` aggregates raw metrics into `page_scores`
- Bot requests hit `server/bot-snapshot.ts` middleware which serves pre-rendered HTML
- Sitemap priorities are driven by `page_scores`
- Exit Intelligence: `useExitTracker` → `POST /api/exit` → `server/exit-intelligence.ts` classifies exits and stores issues in `page_issues`

### Liturgy presentation system

Two-route system for church projection: `/liturgy-control` (operator UI) and `/liturgy-display` (full-screen output). State is synced via `GET/POST /api/liturgy-session` with 1-second polling. `/liturgy-display` renders outside `<Layout>` (no nav chrome).

### Database migrations

Schema is managed via Drizzle Kit. After editing `shared/schema.ts`, run `npm run db:push` to apply changes directly. Migration SQL files land in `./migrations/`.
