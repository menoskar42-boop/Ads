# Sokro — AI Operating System

Voice-driven task execution on the OscarDevs platform. You say what you want —
Sokro plans it, runs it (browser + APIs), validates, retries on failure, and
delivers the result (report, image, booking draft, social post…).

Host: `sokro.oscardevs.com` (host-routed sub-app, mounted like `mykid`/`kakeibo`).

## Layered model

```
Agent      decides & plans
 └─ Workflow   a dynamic sequence of steps (with validate + retry)
     └─ Skill      a reusable recipe (e.g. "Generate Quote")
         └─ Action     a single execution unit (Login, Search, Excel…)
```

## Pipeline

```
Voice/Text → Intent → Planner → Executor → Validator → Retry(self-heal)
           → Summary → Deliver
```

## Folder structure

```
sokro/
├── core/          config, types, logger, errors, utils
├── llm/           LLM Abstraction Layer (OpenAI default; Claude/Gemini/Groq/local pluggable)
├── memory/        conversation, user context, long-term + task memory, execution history
├── ai/            intent detection, planner, prompt builders
├── actions/       plugin actions + _registry
├── skills/        reusable recipes that compose actions
├── workflows/     plan execution + validation + retry
├── validation/    Execution Validator
├── permissions/   per-action scopes + (voice) consent
├── scheduler/     scheduled_tasks + cron tick + watchers (no queues/workers)
├── browser/       Playwright wrapper (swappable: CDP / Stagehand / Browser-Use)
├── voice/         STT / TTS
├── api/           REST + SSE (the mobile app talks to this)
├── auth/          users, JWT, sessions
├── secrets/       encrypted (AES-256) per-user credential vault
├── storage/       generated files + metadata
├── reports/       Excel / CSV / PDF / Markdown / JSON builders
└── router.js      Express entry (host-routed)
```

## Principles

- **Modular monolith** — no microservices, no Redis, no message queues, no
  background workers. Scheduling is a DB table + an in-process cron tick.
- **LLM-agnostic** — default OpenAI, others behind one interface.
- **Security** — secrets are AES-256 encrypted and decrypted only at run-time
  inside the action; **never** placed in an AI prompt. Multi-user isolation.
- **Self-healing** — the Validator retries failed steps instead of stopping.
- **Extensible** — a new capability is a new Action file + one register() call.

## Build order (one feature at a time, run + confirm before the next)

1. Architecture ✅
2. Project structure (runnable skeleton) ← **current**
3. Authentication + secrets vault
4. LLM Abstraction Layer (OpenAI adapter)
5. Memory
6. Browser layer + first Action (SearchWeb)
7. Planner + Validator + Retry
8. Skills / Workflows
9. Permissions (voice consent)
10. Scheduler / Watchers
11. Reports
12. Voice + UI
13. Docs + Deploy + "من أعمالنا" card

## Run (dev)

Served by the main OscarDevs app on the `sokro.` host. Smoke checks:

- `GET /health` → `{ ok: true, service: "sokro" }`
- `GET /api/ping` → `{ ok: true, pong: true }`
- `GET /` → landing page
