# Sokro — AI Operating System

Voice-driven task execution on the OscarDevs platform. You say what you want —
Sokro plans it, runs it (browser + APIs), validates, and delivers the result.

**What it actually does today** (every line here is a file in this folder — the
description is not allowed to be wider than the code):

| Capability | Where |
|---|---|
| Web search, deep research report, image generation | `actions/SearchWebAction.js` · `skills/ResearchReportSkill.js` · `actions/GenerateImageAction.js` |
| Open / read / navigate a site, extract a table | `actions/BrowseAction.js` · `actions/NavigateSiteAction.js` · `actions/ExtractTableAction.js` |
| Fill a form and submit it (never half of one) | `actions/FillSubmitAction.js` |
| Operate a site step by step in the user's own tab | `actions/OperateAction.js` + `extension/background.js` |
| Send WhatsApp from the user's own session | `actions/WhatsAppAction.js` |
| Read AND publish on Facebook / Instagram | `skills/FacebookSkill.js` |
| Gmail (OAuth, read + send) | `skills/GmailApiSkill.js` |
| Structured bookings: fields, what is missing, confirmation stage | `booking/` |
| Meeting agendas built one point at a time | `agenda/` |
| Reminders at a time, delivered to an inbox | `scheduler/` |
| Encrypted per-user secrets, with a UI to put them in | `secrets/` + `ui/app.html` |
| Site name → domain, by table then by search | `lib/siteDict.js` · `lib/siteFinder.js` |

**What it does not do:** post without an explicit confirmation of the exact
text, retry anything that sends or pays, write on a site the user was not shown,
or treat page content as instructions. Those are guarded by checks in
`scripts/` (`check-no-retry` · `check-page-trust` · `check-fill-truth` ·
`check-social-publish` · `check-whatsapp` · `check-booking-confirm`).

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
├── scheduler/     scheduled_tasks (a time or an interval) + cron tick + delivery
├── booking/       booking state machine: fields → review → confirm → submit
├── agenda/        meeting agendas, added a point at a time
├── lib/           site dictionary + discovery, SSRF guard, page-trust, write guard
├── extension/     the Chrome service worker that drives the user's own browser
├── extension-bridge/  the server side of that conversation
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
  Page content is fenced as untrusted data, and a run may only write to the
  domains the user was shown before confirming.
- **Self-healing, except where it is dangerous** — the Validator retries failed
  steps, but never a step that submits, pays, posts or messages: a lost reply
  usually means it worked, and the retry is the second ticket.
- **Extensible** — a new capability is a new Action file + one register() call.

## Build order (one feature at a time, run + confirm before the next)

1. Architecture ✅
2. Project structure ✅
3. Authentication + secrets vault ✅ (vault UI in settings)
4. LLM Abstraction Layer (OpenAI adapter) ✅
5. Memory ✅
6. Browser layer + first Action (SearchWeb) ✅
7. Planner + Validator + Retry ✅ — **retry is refused for anything that sends
   or pays**; see `scripts/check-no-retry.js`
8. Skills / Workflows ✅
9. Permissions (voice consent) ✅ + the domains a run may write to
10. Scheduler / Watchers ✅ — one-shot reminders and a delivery inbox
11. Reports ✅
12. Voice + UI ✅ — browser-status chip, reminders bell, secrets form
13. Docs + Deploy + "من أعمالنا" card ✅ ← **current**
14. Business channels, booking handoff, audit trail ✅ — WhatsApp Cloud is
    **per user**: each person connects their own Meta app from Settings, and
    the keys live in the encrypted vault, not in environment variables.

### Next

Written down because the README's job is to say what the code does *and does
not* do yet:

- **Message templates.** Meta closes the conversation 24 hours after the
  customer's last message; after that only an approved template goes through.
  Sokro reports Meta's refusal honestly (`window_closed`) but cannot yet
  submit or send templates.
- **Media messages.** Text only, both directions. An incoming image is
  recorded as an unread message with no body.
- **An inbox screen.** Incoming messages land in the conversation memory;
  there is no thread view to read and reply from yet.
- **Per-account rate limiting on the webhook.** The signature check is the
  only gate today.

### Optional external configuration
- WhatsApp Web remains available through the extension. **WhatsApp Cloud needs
  no environment variables at all** — each user connects their own Meta app from
  Settings (Phone Number ID, access token, app secret, verify token). Tokens are
  encrypted with the same vault as site credentials and are never returned to the
  browser after they are saved; if the vault is not configured the save is
  **refused** rather than storing a key in plaintext.
  Each account gets its **own** webhook path,
  `/api/channels/whatsapp/webhook/<token>`, shown in Settings. It has to be
  per-account: Meta signs each delivery with the app secret of the app that sent
  it, so the path is what identifies whose secret to verify against — the body
  cannot be trusted before the signature is checked.
- Phone calls use Twilio when `SOKRO_TWILIO_ACCOUNT_SID`, `SOKRO_TWILIO_AUTH_TOKEN`,
  and `SOKRO_TWILIO_FROM` are configured. Calling always requires
  `confirmSensitive: true`; no provider configuration means no call is attempted.
- Confirmed bookings can be handed to an explicitly configured
  `SOKRO_BOOKING_PROVIDER_URL` (optional bearer token:
  `SOKRO_BOOKING_PROVIDER_TOKEN`). A provider timeout leaves the booking in
  `submitting` and is never retried automatically.
- Reminders accept `whenText` plus an optional IANA `timezone`, for example
  `فكرني بكرة الساعة 5`; ambiguous dates are rejected. `/api/schedule/parse`
  previews the deterministic interpretation.
- `/api/audit/consent` and the Settings screen show the user's sensitive-action
  consent and outcome history. Values, tokens, and credentials are never stored
  in the audit rows.

Checks:

- `node scripts/check-sokro-six.js`
- `node scripts/check-sokro-concurrency.js` (uses the configured development DB)

## Run (dev)

Served by the main OscarDevs app on the `sokro.` host. Smoke checks:

- `GET /health` → `{ ok: true, service: "sokro" }`
- `GET /api/ping` → `{ ok: true, pong: true }`
- `GET /` → landing page
