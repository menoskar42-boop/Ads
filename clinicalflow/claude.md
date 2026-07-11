# ClinicalFlow — Project Structure

## Overview

ClinicalFlow is a hybrid Egyptian healthcare SaaS platform combining a **public marketplace** with a **multi-clinic management system**. It supports Arabic/English (RTL/LTR) and uses Egyptian Pound `ج.م` (after the number).

- **Frontend**: React + TypeScript + Vite (port 5000)
- **Backend**: Express.js (port 3001, served via Vite proxy)
- **Database**: Supabase (PostgreSQL) with graceful in-memory fallback
- **Styling**: Tailwind CSS + shadcn/ui components
- **Currency**: `ج.م` always AFTER the number (e.g. `150 ج.م`)

---

## User Roles

| Role | Description | Login |
|------|-------------|-------|
| `super_admin` | Platform owner — manages all clinics, users, AI config, approvals | `/cf-admin-access` → password: `superadmin2024` |
| `admin` | Clinic admin — manages doctors, staff, settings, reports | `/login` |
| `doctor` | Sees patients, visits, schedule, profile | `/login` |
| `reception` | Books appointments, manages queue, invoices | `/login` |
| `patient` | Public portal — books, views history, QR card | `/login` (patient tab) |

### Demo Credentials
- Patient: phone + `patient123`
- Admin: `admin@clinic.demo` / `admin123`
- Doctor: `ahmed@clinic.demo` / `doctor123`
- Reception: `reception@clinic.demo` / `reception123`
- Super Admin: password `superadmin2024`

---

## Routes (App.tsx)

| Path | Component | Access |
|------|-----------|--------|
| `/` | `LandingPage` | Public |
| `/login` | `Login` | Public |
| `/register` | `RegisterPage` | Public |
| `/cf-admin-access` | `SuperAdminLogin` → `SuperAdmin` | Super Admin only |
| `/patient/…` | `PatientLayout` + sub-pages | Patient |
| `/dashboard` | `Dashboard` | Admin/Doctor/Reception |
| `/patients` | `Patients` | Admin/Reception |
| `/doctors` | `Doctors` | Admin |
| `/appointments` | `Appointments` | All clinic roles |
| `/queue` | `QueueManagement` | Admin/Reception |
| `/queue-screen` | `QueueScreen` | Public display |
| `/billing` | `Billing` | Admin/Reception |
| `/reports` | `Reports` | Admin |
| `/settings` | `Settings` | Admin |
| `/staff` | `StaffManagement` | Admin |
| `/services` | `Services` | Admin |
| `/schedule` | `DoctorSchedule` | Doctor/Admin |
| `/inventory` | `Inventory` | Admin/Reception |
| `/lab-orders` | `LabOrders` | Doctor/Reception |
| `/offers` | `OffersManagement` | Admin |
| `/home-visits` | `HomeVisitDashboard` | Admin/Doctor |
| `/specialties` | `SpecialtyManagement` | Super Admin |
| `/document-audit` | `DocumentAudit` | Admin |
| `/search` | `SearchPage` | Public |
| `/doctor/:id` | `DoctorProfilePage` | Public |
| `/clinic/:id` | `ClinicPublicPage` | Public |

---

## Directory Structure

```
clinicalflow/
├── server.js                  # Express backend (Supabase auth + CRUD API)
├── 001_schema.sql             # Supabase DB schema
├── 002_rls.sql                # Row Level Security policies
├── vite.config.ts             # Vite config (port 5000, aliases)
├── tailwind.config.ts         # Tailwind theme
├── index.html
│
└── src/
    ├── main.tsx               # React entry point
    ├── App.tsx                # Router + providers
    ├── index.css              # CSS variables + Tailwind base
    ├── vite-env.d.ts
    │
    ├── types/
    │   └── index.ts           # ALL shared TypeScript interfaces & enums
    │
    ├── contexts/
    │   ├── AuthContext.tsx    # AuthProvider + AuthContext (exports only component)
    │   └── LanguageContext.tsx# AR/EN language + isRTL
    │
    ├── hooks/
    │   ├── useAuth.ts         # useAuth hook (imports AuthContext — separate for Fast Refresh)
    │   ├── useClinicSettings.ts
    │   ├── useDocumentAudit.ts
    │   ├── useDocuments.ts
    │   ├── useMedicalNotes.ts
    │   ├── use-mobile.tsx
    │   ├── usePatients.ts
    │   ├── usePermissions.ts
    │   ├── usePrescriptions.ts
    │   ├── useSchedule.ts
    │   ├── useSpecialties.ts
    │   ├── use-toast.ts
    │   ├── useUsers.ts
    │   ├── useVisits.ts
    │   └── useVitalSigns.ts
    │
    ├── utils/
    │   └── authToken.ts       # getToken, saveAuthSession, clearAuthSession, loadSavedAuthUser
    │
    ├── lib/
    │   ├── dateFormat.ts      # Egyptian date/time formatting
    │   ├── excelExport.ts     # Excel report generation
    │   ├── governorates.ts    # Egyptian governorates list
    │   ├── invoiceCalc.ts     # Invoice/billing calculations
    │   └── utils.ts           # cn() + misc helpers
    │
    ├── stores/                # In-memory reactive stores (localStorage-persisted)
    │   ├── createStore.ts         # Generic pub/sub store factory
    │   ├── aiConfigStore.ts       # AI settings (model, prompts)
    │   ├── clinicSettingsStore.ts # Per-clinic settings
    │   ├── clinicStore.ts         # Clinics CRUD
    │   ├── doctorClinicStore.ts   # Doctor ↔ Clinic links
    │   ├── doctorProfileStore.ts  # Rich doctor profiles
    │   ├── documentAuditStore.ts  # Audit trail
    │   ├── documentStore.ts       # Medical documents
    │   ├── homeVisitRequestStore.ts
    │   ├── homeVisitScheduleStore.ts
    │   ├── inventoryStore.ts
    │   ├── labOrderStore.ts
    │   ├── loyaltyStore.ts
    │   ├── medicalNoteStore.ts
    │   ├── offerStore.ts
    │   ├── patientStore.ts
    │   ├── prescriptionStore.ts
    │   ├── queueStrategyStore.ts  # Queue modes (FIFO, priority, etc.)
    │   ├── ratingStore.ts
    │   ├── registrationStore.ts   # Doctor/clinic/patient registrations + approval flow
    │   ├── reminderStore.ts
    │   ├── scheduleStore.ts
    │   ├── specialtyStore.ts
    │   ├── userStore.ts
    │   ├── visitStore.ts          # Visits + appointmentStore
    │   ├── visitTypeStore.ts
    │   └── vitalSignStore.ts
    │
    ├── pages/
    │   ├── LandingPage.tsx        # Public marketplace homepage
    │   ├── Index.tsx              # Route index redirect
    │   ├── Login.tsx              # Staff + patient login
    │   ├── PatientLogin.tsx       # Patient-specific login
    │   ├── RegisterPage.tsx       # Doctor / Clinic / Patient registration
    │   ├── SuperAdminLogin.tsx    # Secret entry (/cf-admin-access)
    │   ├── SuperAdmin.tsx         # Platform management dashboard
    │   ├── Dashboard.tsx          # Clinic home dashboard
    │   ├── Patients.tsx           # Patient list + management
    │   ├── Doctors.tsx            # Doctor list
    │   ├── Appointments.tsx       # Appointment management
    │   ├── QueueManagement.tsx    # Live queue + strategy config
    │   ├── QueueScreen.tsx        # Public TV display screen
    │   ├── Billing.tsx            # Invoices + payments
    │   ├── Reports.tsx            # Analytics + Excel export
    │   ├── Settings.tsx           # Clinic settings
    │   ├── StaffManagement.tsx    # Admin/reception/doctor accounts
    │   ├── Services.tsx           # Clinic service catalog
    │   ├── DoctorSchedule.tsx     # Doctor working hours
    │   ├── DoctorProfilePage.tsx  # Public doctor profile page
    │   ├── ClinicPublicPage.tsx   # Public clinic page
    │   ├── Inventory.tsx          # Medication/supply inventory
    │   ├── LabOrders.tsx          # Lab test orders
    │   ├── OffersManagement.tsx   # Medical offers/promotions
    │   ├── HomeVisitDashboard.tsx # Home visit request management
    │   ├── SpecialtyManagement.tsx# Medical specialties (super admin)
    │   ├── DocumentAudit.tsx      # Audit log viewer
    │   ├── PatientPortal.tsx      # Patient self-service portal
    │   ├── PatientProfile.tsx     # Patient profile view
    │   ├── SearchPage.tsx         # Public doctor/clinic search
    │   └── NotFound.tsx           # 404 page
    │
    ├── components/
    │   ├── MainLayout.tsx         # Staff sidebar layout wrapper
    │   ├── PatientLayout.tsx      # Patient portal layout
    │   ├── AppSidebar.tsx         # Role-aware navigation sidebar
    │   ├── AIBookingAssistant.tsx # AI chat booking widget
    │   ├── BookingWizard.tsx      # Step-by-step appointment booking
    │   ├── HomeVisitBookingDialog.tsx
    │   ├── MedicalDocumentsTab.tsx
    │   ├── MedicalNotesTab.tsx
    │   ├── NotificationBell.tsx
    │   ├── PatientQRCard.tsx      # QR code patient card
    │   ├── PrescriptionsTab.tsx
    │   ├── PrintBookingSheet.tsx
    │   ├── VisitTimelineTab.tsx
    │   ├── VitalSignsTab.tsx
    │   └── ui/                    # shadcn/ui components (button, card, dialog, etc.)
    │
    └── test/
        ├── example.test.ts
        └── setup.ts
```

---

## Backend API (server.js)

### Auth
| Method | Path | Role |
|--------|------|------|
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/refresh` | Public |
| POST | `/api/auth/logout` | Authenticated |
| GET | `/api/auth/me` | Authenticated |
| GET | `/api/auth/clinics` | super_admin |
| POST | `/api/auth/clinics` | super_admin |
| GET | `/api/auth/clinics/:id` | Authenticated |
| PATCH | `/api/auth/clinics/:id/subscription` | super_admin |
| POST | `/api/auth/users` | admin / super_admin |

### Clinical Data
| Method | Path | Role |
|--------|------|------|
| GET/POST | `/api/patients` | clinic staff |
| PATCH | `/api/patients/:id` | admin / reception |
| GET/POST | `/api/appointments` | clinic staff |
| GET | `/api/appointments/slots` | Public |
| PATCH | `/api/appointments/:id/status` | admin / reception |
| GET/POST | `/api/visits` | clinic staff |
| PATCH | `/api/visits/:id` | doctor / admin / reception |
| GET/POST | `/api/invoices` | clinic staff |
| PATCH | `/api/invoices/:id/payment` | admin / reception |
| GET | `/api/services` | Public |
| GET/PUT | `/api/schedule/:doctorId` | doctor / admin |
| GET | `/api/clinics/:id/public` | Public |
| PATCH | `/api/clinics/:id/profile` | admin / super_admin |

### AI
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/detect-specialty` | Detect medical specialty from symptoms |
| POST | `/api/doctor-suitability` | Score doctor match for a case |

---

## Data Architecture

### Supabase-first with localStorage fallback
- API calls go to Express → Supabase
- If Supabase returns `503`: falls back to in-memory stores
- If Supabase returns `401/403`: returns auth error
- All stores persist to `localStorage` on every write

### localStorage Keys
| Key | Contents |
|-----|----------|
| `cf_token` | JWT access token |
| `cf_refresh` | JWT refresh token |
| `cf_user` | Serialized auth user |
| `cf_staff_passwords` | `{ [userId]: password }` (demo mode) |
| `cf_patient_passwords` | `{ [phone]: password }` (demo mode) |
| `cf_registrations` | All registration entries |

### Registration Flow
1. Doctor/Clinic fills `/register` → `registerUser()` → `status: 'pending'`
2. Super Admin sees pending list → approves → `status: 'approved'` + `userId` assigned
3. Rejected → `status: 'rejected'` + `rejectionReason`

---

## Key Stores — `registrationStore.ts`

```typescript
registerUser(data)          // returns { entry?, error? }
approveRegistration(id, { userId, linkedClinicId })
rejectRegistration(id, reason?)
findByReferralCode(code)
getRegistrationByEmail(email)
getRegistrationByUserId(userId)
```

---

## Auth Token Utility (`src/utils/authToken.ts`)

```typescript
getToken()                  // reads cf_token from localStorage
saveAuthSession(token, refresh, user)
clearAuthSession()
loadSavedAuthUser()
```

> All hooks (`usePatients`, `useVisits`, `useUsers`, `MainLayout`) import `getToken` from `@/utils/authToken` — NOT from AuthContext.

---

## Important Conventions

- **`useAuth`** must be imported from `@/hooks/useAuth` (NOT `@/contexts/AuthContext`) — required for Vite Fast Refresh compatibility
- **Currency**: Always `150 ج.م` — number first, then `ج.م`
- **Icons**: `lucide-react` for actions; `react-icons/si` for company logos. No emoji.
- **RTL**: Controlled by `LanguageContext` → `isRTL` → `dir="rtl"` on containers
- **Env vars on frontend**: use `import.meta.env.VITE_*` (not `process.env`)
- **Supabase project**: `umikpdzjxikhkbzcueej`

---

## Environment Secrets

| Secret | Usage |
|--------|-------|
| `OPENAI_API_KEY` | AI specialty detection + doctor suitability |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Client-side Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin operations |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI/management |
| `SUPABASE_DB_PASSWORD` | Direct DB access |

---

## Workflows

| Name | Command | Port |
|------|---------|------|
| `Start application` | `npm run dev` | 5000 (Vite + Express proxy) |
| `Backend API` | `node server.js` | 3001 |

---

## Features

- AI Smart Booking (symptom → specialty → doctor)
- Queue Strategy (FIFO, priority, VIP, custom)
- Home Visit Requests + scheduling
- Public Doctor/Clinic Profiles with ratings
- QR Code patient cards
- Medical Offers & promotions
- Nearby Doctor search by governorate/specialty
- Referral code system
- Multi-language AR/EN with full RTL support
- Excel report export
- Inventory & lab orders
- Document audit trail
- Loyalty points system
