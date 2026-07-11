# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server on port 5000 (proxies /api → port 3001)
node server.js     # Express backend on port 3001 (run separately)
npm run build      # Production build → dist/
npm run lint       # ESLint
npm run test       # Vitest (single run)
npm run test:watch # Vitest watch mode
```

## Architecture Overview

ClinicalFlow is a **hybrid Egyptian healthcare SaaS platform**: a public marketplace for patients + a multi-clinic management system for staff. It supports Arabic/English with full RTL layout.

- **Frontend**: React + TypeScript + Vite (port 5000)
- **Backend**: Express.js (port 3001), proxied through Vite in dev
- **Styling**: Tailwind CSS + shadcn/ui
- **Currency**: Always `150 ج.م` — number first, then `ج.م`

### Two-Server Setup

Vite (`npm run dev`) proxies all `/api` requests to Express (`node server.js`). The Express server has Supabase-backed routes but falls back gracefully (503 mode) when Supabase env vars are absent. In production, `node server.js` serves the static `dist/` build directly.

---

## Data Layer — Stores + Persistence

### `createStore` Pattern (`src/stores/createStore.ts`)

All data is managed via a custom pub/sub store factory. Stores are in-memory by default, but pass a `persistKey` to enable localStorage persistence:

```typescript
createStore<T>(initialData, persistKey?, saveOnly?)
```

- **`persistKey`** — enables load-on-boot + save-on-every-write to localStorage
- **`saveOnly = true`** — only saves (never loads from localStorage); used for stores with custom load/merge logic (userStore, patientStore, clinicStore)

**Important**: Hooks that mutate data must call the store method (e.g. `userStore.update()`) *and* update React state. React state alone does not persist across page refreshes.

### localStorage Keys

| Key | Contents |
|-----|----------|
| `cf_token` | JWT access token |
| `cf_refresh` | JWT refresh token |
| `cf_user` | Serialized auth user |
| `cf_staff_passwords` | `{ [userId]: password }` |
| `cf_patient_passwords` | `{ [phone]: password }` |
| `cf_specialties` | Specialties list |
| `cf_services` | Services list |
| `cf_appointments` | Appointments |
| `cf_visits` | Visits |
| `cf_invoices` | Invoices |
| `cf_invoice_items` | Invoice line items |
| `cf_payments` | Payments |
| `cf_staff_users` | Staff user accounts (saveOnly) |
| `cf_registered_patients` | Patients (saveOnly) |
| `cf_staff_clinics` | Clinics (saveOnly) |
| `cf_doctor_clinic_links` | Doctor ↔ Clinic links |
| `cf_registrations` | Registration entries |

---

## Auth

- `useAuth` must be imported from `@/hooks/useAuth` (NOT `@/contexts/AuthContext`) — required for Vite Fast Refresh
- Token utilities (`getToken`, `saveAuthSession`, `clearAuthSession`) live in `src/utils/authToken.ts`
- All hooks import `getToken` from `@/utils/authToken`, not from AuthContext

### User Roles

| Role | Entry Point |
|------|-------------|
| `super_admin` | `/cf-admin-access` → password `superadmin2024` |
| `admin` | `/login` |
| `doctor` | `/login` (clinic selector shown if linked to multiple clinics) |
| `reception` | `/login` |
| `patient` | `/login` (patient tab, phone-based) |

Demo credentials (staff): `admin@clinic.demo / admin123`, `ahmed@clinic.demo / doctor123`, `reception@clinic.demo / reception123`

---

## Key Conventions

- **RTL**: `LanguageContext` → `isRTL` / `isAr` → `dir="rtl"` on containers
- **Icons**: `lucide-react` for actions; `react-icons/si` for logos. No emoji.
- **Env vars (frontend)**: `import.meta.env.VITE_*` only (not `process.env`)
- **Path alias**: `@` → `./src`, `@assets` → `./attached_assets`
- **Patients are platform-level** — `clinicId` is optional; patients can book at any clinic
- **Doctors can belong to multiple clinics** — linked via `doctorClinicStore` (many-to-many)
- **Data isolation** — clinic staff filter all data by `user.clinicId`

---

## Patient Visit Workflow

Matches Egyptian clinic practice: Booking → Payment (= Arrival) → Waiting Queue → In Consultation → Completed.

Payment **is** check-in. When an invoice is paid (`recomputeInvoice`), the patient auto-enters the waiting queue with `arrivalTime` set. Queue ordering: urgent first → `visitType.sortOrder` → `arrivalTime`.

Key workflow functions in `src/stores/visitStore.ts`: `checkInAppointment`, `recomputeInvoice`, `callNextPatient`, `sendToDoctor`, `completeVisit`.

---

## AI Features

- `POST /api/detect-specialty` — symptom text → specialty (GPT-4o-mini, ~200 tokens, temperature 0)
- `POST /api/doctor-suitability` — symptoms + doctor → match/mismatch (max 120 tokens)
- AI is used only as fallback; local keyword matching (`SPECIALTY_KEYWORDS`) handles common cases without API calls
- Requires `OPENAI_API_KEY` env var

---

## Environment Variables

| Variable | Usage |
|----------|-------|
| `OPENAI_API_KEY` | AI specialty detection + doctor suitability |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Client-side Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin operations |
| `SUPABASE_DB_PASSWORD` | Direct DB access |

---

## Active Development Branch

All work goes to: `claude/clone-clinicalflow-MaB22`
