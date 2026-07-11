# Clinical Flow - Multi-Clinic SaaS Platform

## Overview
A multi-clinic SaaS platform built with React, TypeScript, Vite, shadcn-ui and Tailwind CSS. Supports Arabic/English bilingual UI, role-based access (super_admin, admin, doctor, receptionist, patient), appointment booking, billing, patient records, and more. Includes an AI-powered booking assistant using OpenAI. Full data isolation between clinics via Supabase RLS.

## Installment / Payment Plan System (نظام التقسيط)
- **Store**: `src/stores/installmentStore.ts` — `InstallmentSettings`, `InstallmentPlan`, `Installment` types with localStorage persistence
- **Report Page**: `src/pages/Installments.tsx` — summary cards, filterable table, plan detail dialog, WhatsApp reminders
- **Billing Integration**: `src/pages/Billing.tsx` — mode toggle (full/installment), schedule preview, down payment %, confirm dialog
- **Settings Tab**: `src/pages/Settings.tsx` → "التقسيط" tab — enable toggle, max installments, min amount, down payment %, late fee, reminder days
- **Notifications**: `src/components/NotificationBell.tsx` — overdue + upcoming installment alerts with link to /installments
- **WhatsApp Endpoint**: `POST /api/installments/send-reminder` in `server.js`
- **Navigation**: `/installments` route added to sidebar (Operations group, canViewBilling) and MainLayout

## Backend Architecture
- **server.js** — Express backend on port 3001, serves all API routes + static frontend build
- **Database**: Supabase (PostgreSQL) — fully provisioned with 28 tables + RLS policies
- **Auth**: Supabase Auth (JWT tokens), stored in localStorage (`cf_token`, `cf_refresh`, `cf_user`)
- **Supabase Project**: `umikpdzjxikhkbzcueej.supabase.co` (region: eu-west-1)
- **Migrations**: Run via Supabase Management API — `001_schema.sql` + `002_rls.sql`

## Demo Accounts (Supabase Auth)
| Role | Email | Password |
|------|-------|----------|
| super_admin | superadmin@clinicalflow.com | superadmin2024 |
| admin | admin@demo.com | admin2024 |
| doctor | doctor@demo.com | doctor2024 |
| reception | reception@demo.com | reception2024 |

## Demo Clinic
- ID: `22222222-0000-0000-0000-000000000001`
- Name: ClinicalFlow Demo Clinic / عيادة كلينيكال فلو التجريبية
- Plan: AI (full features), expires 2027-12-31

## Seed Data
- 15 specialties (IDs: `11111111-0000-0000-0000-000000000001` to `...000015`)
- 3 visit types: Consultation (150 ج.م), Follow-up (80 ج.م), Urgent (200 ج.م)
- 4 services across General Medicine and Cardiology

## Platform Architecture (Hybrid)
ClinicalFlow is a **dual-system platform**: a public healthcare marketplace for patients + a clinic management SaaS for staff.

### 1. Public Healthcare Marketplace
- `/` — Marketing landing page with doctor search, nearest appointments, specialties, home visit doctors, offers
- `/search` — Full doctor search with specialty + city + home visit filters (`src/pages/SearchPage.tsx`)
- `/doctor/:doctorId` — Doctor public profile (SEO-friendly)
- `/clinic/:clinicId` — Clinic public profile (SEO-friendly)
- `/register` — Patient/Doctor/Clinic registration (3 tabs, no clinic required for patients)
- `/login` — Unified 3-tab login: Patient (phone/email) | Clinic Staff | Super Admin

### 2. Clinic Management SaaS (`/dashboard`)
- Only clinic staff (admin, doctor, reception) access this area
- Full appointment management, patient queue, billing, records, reports
- 3 demo clinics: Nile Medical Center (AI plan), Cairo Health Clinic (Pro plan), Alexandria Care Center (Basic plan)
- Subscription plans: basic (5 doctors), pro (10 doctors + reports), ai (20 doctors + AI booking)

### Key Design Principles
- **Patients are platform-level** — `clinicId` is optional on `Patient`; patients can book at any clinic
- **Doctors may work in multiple clinics** — `doctorClinicStore` linking table; clinic selector shown after doctor login
- **Super Admin**: password `superadmin2024`, accessed via `/super-admin`
- **Data isolation**: clinic staff only see their own clinic's data via `user.clinicId` filter
- **clinicStore** (`src/stores/clinicStore.ts`): source of truth for clinic metadata and plan features
- **Demo patient login**: phone `01000000000` or email `patient@demo.com`

## Architecture
- Frontend SPA with a lightweight Express backend for OpenAI API proxy
- All clinic data is stored in-memory using custom reactive stores (`src/stores/`)
- Backend (`server.js`) only handles `/api/detect-specialty` (symptom-to-specialty classification) - no data persistence
- Routing via `react-router-dom`
- UI components from shadcn/ui (`src/components/ui/`)

## Key Directories
- `src/pages/` - Page components (Dashboard, Patients, Appointments, etc.)
- `src/components/` - Shared components (AppSidebar, BookingWizard, AIBookingAssistant, etc.)
- `src/contexts/` - AuthContext, LanguageContext
- `src/hooks/` - Custom hooks for data access
- `src/stores/` - In-memory data stores
- `src/lib/` - Utilities (date formatting, Excel export, invoice calc)
- `public/` - Static assets (logo.png, manifest.json)
- `attached_assets/` - Source assets (mapped via @assets alias)
- `server.js` - Express backend for OpenAI API proxy + static file serving in production

## Workflows
- "Start application" - Vite dev server on port 5000
- "Backend API" - Express API server on port 3001

## Configuration
- Vite dev server on port 5000, proxies `/api` to port 3001
- Express backend on port 3001 (dev) or PORT env var (production)
- `@` alias maps to `./src`
- `@assets` alias maps to `./attached_assets`
- Autoscale deployment: builds frontend, runs `node server.js` which serves static files + API

## Environment Variables
- `OPENAI_API_KEY` - Required for AI Booking Assistant

## AI Booking Assistant (Cost-Optimized)
- **AI used ONLY for symptom-to-specialty detection** (single API call, ~200-300 tokens, ~$0.002-0.004 per request)
- Backend endpoint: `POST /api/detect-specialty` with minimal system prompt, `max_tokens: 20`, `temperature: 0`
- All other steps (doctor listing, slot fetching, booking) handled entirely by frontend local logic
- Local keyword matching tries to resolve specialties/doctors without AI call; AI is fallback only
- `SPECIALTY_KEYWORDS` map covers Arabic + English symptom keywords for common specialties
- Doctor name search, earliest appointment, slot selection all handled locally with no API calls
- Dual mode: `floating` (bottom-right widget) and `embedded` (inline Card)
- Props: `mode`, `patientId` (optional), `onBookingComplete` (optional callback)
- Staff users (admin/receptionist/doctor) must select a patient before chat begins
- Embedded in BookingWizard: "AI Assistant" button on specialty step
- Quick suggestion buttons for common requests

## Smart Home Visit Dispatch System
Patients can request a doctor home visit directly from the landing page or doctor profile. The system auto-dispatches to the nearest available doctor.

### Flow
1. **Patient** clicks "Request Home Visit" → `HomeVisitBookingDialog` opens
2. Patient selects: Governorate (27 Egyptian governorates), full address, preferred day/time, notes; optionally taps GPS button for precise coordinates
3. `buildDoctorQueue()` runs the dispatch algorithm: filter doctors by `homeVisitEnabled`, area match (governorate / sub-areas), day-of-week schedule; sort by haversine GPS distance if coordinates provided, else by `homeVisitRadiusKm`
4. `createHomeVisitRequest()` stores the request and auto-sends to first doctor in queue (status: `sent_to_doctor`)
5. **Doctor** sees the pending request in `/home-visits` dashboard → Approves or Rejects
6. If rejected, system auto-escalates to next doctor in queue via `rejectRequest()`
7. Approved doctor marks visit as Completed when done

### Key Files
- `src/stores/homeVisitRequestStore.ts` — `HomeVisitRequest` model, dispatch algorithm, CRUD (approve/reject/complete)
- `src/components/HomeVisitBookingDialog.tsx` — Patient booking form (3 steps: details → confirm → done)
- `src/pages/HomeVisitDashboard.tsx` — Doctor/admin dashboard (Pending / Approved / History tabs)
- **Route**: `/home-visits` — accessible to admin + doctor roles
- **Sidebar**: "Home Visits" nav item appears for doctor and admin
- **Landing Page**: "Home Visit Doctors" section + "Request Home Visit" hero button + "Home Visits" nav link
- **Standalone doctor**: `u-hv1` (Dr. Khaled Mostafa) — no clinic affiliation, covers 5 Cairo areas

### Data Model (HomeVisitRequest)
- `status`: `pending | sent_to_doctor | approved | rejected | completed`
- `doctorQueue`: sorted list of eligible doctorIds
- `dispatchHistory`: per-doctor response log (sentAt, respondedAt, response)
- `currentDoctorId`: doctor currently receiving the request
- `assignedDoctorId`: doctor who accepted

## Patient Visit Workflow (Egyptian Clinic Style)
Matches Egyptian clinic practice: Booking → Payment (Arrival) → Waiting Queue → In Consultation → Completed
- **Key principle**: Payment = Arrival. When invoice is paid, patient auto-enters waiting queue with `arrivalTime` recorded.
- **No separate Check-In step** — reception clicks "Pay" directly, which creates invoice and navigates to billing.
- **VisitStatus enum**: `booked | checked_in | waiting | in_consultation | completed | no_show | cancelled`
- **InvoiceStatus enum**: `pending | paid | partially_paid | refunded`
- **Visit fields**: `isUrgent` (boolean), `arrivalTime` (ISO string for queue ordering)
- **Appointment fields**: `isUrgent` (boolean)
- **Queue ordering**: Urgent patients first, then by `visitType.sortOrder`, then by `arrivalTime`
- **Workflow functions** in `src/stores/visitStore.ts`:
  - `checkInAppointment(aptId)` — Creates Visit (checked_in) + Invoice; auto-adds visitType as invoice item if selected
  - `recomputeInvoice(invoiceId)` — Auto-transitions visit to `waiting` when invoice becomes `paid`, sets `arrivalTime`
  - `markUrgent(appointmentId)` — Sets isUrgent on appointment and linked visit
  - `refundInvoice(invoiceId)` — Sets invoice status to `refunded`
  - `callNextPatient(doctorId)` — Urgent → visitType.sortOrder → arrivalTime priority
  - `sendToDoctor(visitId)` — Manual transition: waiting → in_consultation
  - `completeVisit(visitId)` — Transitions in_consultation → completed
  - `addVisitTypeInvoiceItem(invoiceId, visitType)` — Adds visit type as invoice line item
  - `createAppointment(data)` — Accepts `visitTypeId` + auto-flags `isUrgent` if visit type is urgent
- **Appointments page** (`src/pages/Appointments.tsx`): Reminder button (Bell → BellRing after sent), Pay, Mark Urgent, Refund, Send to Doctor, Complete Visit
- **Dashboard** (`src/pages/Dashboard.tsx`):
  - **Reception/Admin**: Waiting Queue (ordered by urgency + visitType + arrivalTime), Urgent Patients panel, In Consultation panel, Call Next Patient per doctor, Send to Doctor buttons
  - **Doctor**: Current Patient card, Next Patient card, Waiting list (urgent first), Call Next Patient button, Complete Visit — no financial info shown
  - **Admin**: Doctors on Duty with queue counts and Call Next per doctor
- **Queue Screen** (`src/pages/QueueScreen.tsx`): TV-ready full-screen display at `/queue-screen` (standalone, no auth required). Shows each active doctor with current patient and waiting queue. Shows visit type badges.
- **Billing** (`src/pages/Billing.tsx`): Refund button on paid invoices (admin/reception), refunded status badge (amber), refunded invoices locked from further payments
- **Demo data**: Seeds today's appointments in mixed workflow stages including urgent patient

## Visit Types System
- **Store**: `src/stores/visitTypeStore.ts` — per-clinic visit types with CRUD, priority reorder, enable/disable
- **Default types per demo clinic**: Consultation, Follow-up, Urgent Consultation (sortOrder 0 = highest priority)
  - clinic-1 (Nile Medical): 150 / 100 / 250 ج.م
  - clinic-2 (Cairo Health): 200 / 130 / 350 ج.م  
  - clinic-3 (Alexandria Care): 100 / 75 / 175 ج.م
- **BookingWizard**: `visit_type` step inserted between specialty and doctor selection — shows type cards with price, duration, and urgent badge
- **Settings → Visit Types tab**: Full CRUD — add new types (EN+AR name, price, duration, urgent flag), enable/disable toggle, reorder up/down, delete
- **Queue display**: Visit type badge shown on patient rows in QueueManagement and QueueScreen
- **Invoice integration**: When booking with a visit type, it's auto-added as invoice line item on check-in

## Appointment Reminder System
- **Store**: `src/stores/reminderStore.ts` — `ReminderLog` records with `simulateSendReminder()` function
- **Reminder types**: `confirmation | 24h | 2h`; channels: `sms | whatsapp | email`
- **Appointments page**: "Remind" button (Bell icon) on scheduled/confirmed appointments for admin/reception
  - After sending: button shows "Sent" with BellRing icon (secondary variant)
  - Updates `appointment.reminderSent24h = true` to persist sent state
  - Builds localized message (Arabic/English) with clinic name + address
- **Appointment type fields**: `reminderSentConfirmation?`, `reminderSent24h?`, `reminderSent2h?`

## Queue Management Page
- **Route**: `/queue` (admin/reception only)
- **File**: `src/pages/QueueManagement.tsx` — per-doctor queue control panel
- **Features**: Sound toggle (Web Audio API beep), stats bar (waiting/in-consultation/completed), per-doctor cards with current patient + waiting queue
- **Actions**: Call Next (moves next waiting → in_consultation + beep), Send to Doctor (individual patient), Complete Visit, Mark Urgent
- **TV Display**: Links to `/queue-screen` in new tab; QueueScreen shows visit type badges

## Admin Management Panel
- **Specialty Management** (`/specialties`) - Full CRUD for medical specialties (EN/AR names, active/inactive toggle, delete with confirmation). Admin-only.
- **User Management** (`/staff`) - Full CRUD for staff accounts (admin, doctor, receptionist). Edit roles, toggle active status, delete with confirmation. Doctors can be linked to specialties. Admin-only.
- Permissions managed via `usePermissions` hook; sidebar items auto-show based on role.

## Medical Document Management
- **Document Types**: prescription, lab_test, radiology, medical_report
- **Data Model**: `MedicalDocument` (id, patientId, specialtyId, doctorId, uploadedBy, documentType, title, titleAr, fileName, mimeType, fileUrl, fileSize, notes, uploadDate)
- **Store**: `src/stores/documentStore.ts` with mock data and visibility settings
- **Audit Log**: `src/stores/documentAuditStore.ts` - tracks view/upload/download actions with userId, patientId, documentId, timestamp
- **Hooks**: `src/hooks/useDocuments.ts` (CRUD + specialty-based filtering), `src/hooks/useDocumentAudit.ts` (audit logging)
- **Privacy**: Doctors see ONLY documents from their specialty. Admin configures visibility mode per specialty (own_only / specialty_all)
- **Upload Permissions**: Admin, Doctor, Reception can upload. Doctors limited to their specialty. Reception/Admin can assign to any specialty + doctor.
- **UI Components**:
  - `src/components/MedicalDocumentsTab.tsx` - Tab in PatientProfile grouped by specialty then document type
  - `src/pages/DocumentAudit.tsx` - Admin-only audit log viewer at `/document-audit`
  - `src/components/VisitTimelineTab.tsx` - Enhanced with document events in chronological view
- **Permissions**: `canViewDocuments`, `canUploadDocuments`, `canManageDocumentPermissions`, `canViewDocumentAudit` in `usePermissions.ts`
- **Sidebar**: "Document Audit" entry visible to admin only

## UI/UX Improvements
- **AI Booking Button**: Only visible on Dashboard, Patients, Appointments pages. Renamed to "AI Booking Assistant" with Bot icon.
- **Appointment Pipeline**: Horizontal workflow visualization (Scheduled → Arrived → Waiting → In Consultation → Completed) with color coding, plus separate No Show indicator.
- **Patient Quick Actions**: Each patient row has View Profile, Book Appointment, Medical File icon buttons.
- **Doctor Cards**: "Today's Appointments" and "Schedule" quick action buttons alongside existing Deactivate toggle.
- **Reports**: Added Top Doctor Today, Most Booked Specialty, Average Visit Duration analytics cards.
- **Settings**: Split into 5 tabs: Clinic Info, Branding, Tax/VAT, Notifications, AI Settings.
- **Dashboard**: Enlarged stat card icons and improved spacing/visual hierarchy.
- **Login Page**: Role cards with icons, descriptions, colored accent borders, and hover scale animation.
- **Sidebar**: Logout button visible in collapsed state; active route has left border indicator.
- **Billing**: Colored top borders on financial summary cards (blue/green/red); improved invoice detail dialog layout with section separation.
- **Document Audit**: Full-width search, RTL icon fix, theme-aware badge colors.
- **Patient Profile**: Scrollable tabs on mobile; Edit/Delete grouped into dropdown menu.
- **Empty States**: Consistent icon + text pattern across Appointments, Patients, Billing, Doctor Schedule.
- **Specialties**: Consistent header layout (title left, action right, search full-width below).

## UX Simplification (May 2026)
### Sidebar Role-Based Grouping
- **Doctor role**: Minimal focused set of 7 items (Dashboard, Patients, Appointments, Schedule, Drug Database, Medical Library, Settings). No management/financial items shown.
- **Admin/Reception role**: Sidebar grouped into 4 labelled sections (AR/EN): Operations (العمليات) / Management (الإدارة) / Analytics (التحليلات) / More (المزيد).
- **Single unified Queue entry**: The 3 separate queue items (queue, smart-queue, checkin-scan) are replaced with a single "Queue" item at `/queue`.
- **Implementation**: `src/components/AppSidebar.tsx` — `navGroups` array with role-filtered sections; `doctorItems` flat array for doctor role.

### Queue Mode Toggle
- **QueueManagement** (`/queue`): Normal | Smart AI toggle in header. "Smart AI" button navigates to `/smart-queue`.
- **SmartQueue** (`/smart-queue`): Matching Normal | Smart AI toggle. "Normal" button navigates back to `/queue`.
- Both pages feel unified as one concept from the user perspective.

### Doctor Dashboard Hero
- Prominent "Next Patient in Queue" card added at the top of the doctor dashboard (before stat cards).
- Shows next patient name, priority status (emergency / urgent / normal), queue count.
- Large "Call Next Patient" button (`استدعاء التالي`) always visible.
- Shows "Currently in consultation" patient when one is active.
- `data-testid="button-call-next-patient"` on the button.

### Patient Portal Simplified Tabs
- Tabs reorganised to: **My Appointments** | **My Queue** | **My Files** | Record | Reminders | Points
- **My Queue** (`value="queue"`): Shows live queue position, consultation status, or "not in queue" empty state.
- **My Files** (`value="files"`): Unified prescriptions + documents view (replaces separate tabs).
- Old `prescriptions` and `documents` tab content preserved for backwards compatibility.

### Missing i18n Keys Added
- `doctors.active`, `doctors.inactive`, `doctors.workingDays`, `doctors.startTime`, `doctors.endTime`, `doctors.addDay`, `doctors.manageSchedule`, `doctors.scheduleUpdated`
- `reports.appointments`
- All added to both EN and AR translation objects in `src/contexts/LanguageContext.tsx`.

## Flexible Queue Strategy System
- **Store**: `src/stores/queueStrategyStore.ts` — per-clinic `QueueStrategyConfig` (strategy, urgentAlwaysFirst, rotationPattern, rotationIndex, lastServedCategory)
- **5 Strategies**:
  - **A** — Payment/arrival order only
  - **B** — Visit type priority (uses `sortOrder` from visitTypeStore), then arrival time (default for clinic-1)
  - **C** — Alternating: system alternates between primary (lowest sortOrder) and secondary visit types
  - **D** — Custom rotation: admin builds a pattern array of visitTypeIds (can repeat for ratio e.g. consult→consult→followup)
  - **E** — Urgent always first unconditionally, then payment order
- **callNextPatient** (`visitStore.ts`): auto-detects doctor's clinicId, loads strategy from store, applies logic, tracks mutable state (rotationIndex, lastServedCategory) back into store
- **Settings UI**: New "Queue" tab in Settings page (`QueueStrategyTab` component) — radio selection of A-E with descriptions, urgentAlwaysFirst toggle, rotation pattern builder for D
- **Defaults**: clinic-1 = B, clinic-2 = A, clinic-3 = E

## Separate Home Visit Schedules per Doctor
- **Store**: `src/stores/homeVisitScheduleStore.ts` — `HomeVisitSchedule` (id, doctorId, dayOfWeek, startTime, endTime, maxVisitsPerDay, isActive)
- **Seed data**: Dr. Ahmed (u-2) Fri+Sat 10:00-14:00 max 5; Dr. Sarah (u-3) Mon+Wed 09:00-13:00 max 4
- **Functions**: `getHomeVisitSlots(doctorId, date)` — 45-min slots filtered by existing HV bookings and daily cap; `getHomeVisitWorkingDays(doctorId)` — active days for date picker
- **BookingWizard**: when `isHomeVisit=true`, `workingDays` and `availableSlots` use home visit schedule functions instead of clinic schedule
- **StaffManagement**: `HomeVisitScheduleEditor` sub-component — shown inside doctor edit dialog when homeVisitEnabled=true; CRUD for schedule entries (add day/time/limit, toggle active, delete)

## Doctor Public Profile Page
- **Route**: `/doctor/:doctorId` — accessible to all users, no auth required
- **Store**: `src/stores/doctorProfileStore.ts` — `DoctorProfile` type with: bio, photo, graduationYear, graduationUniversity, postgrad[], certifications[], conferences[], positions[], achievements[], additionalInfo, allowAdminEdit, allowReceptionEdit
- **Seed data**: Rich profiles for Dr. Ahmed (u-2), Dr. Sarah (u-3), Dr. Omar (u-4), Dr. Lisa (u-5)
- **Sections**: Header (photo, name, specialty, rating, clinic badges, bio), Nearest Available Appointments (computed from scheduleStore, next 7 days), Tabs: Education / Certifications / Experience / Reviews
- **AI Suitability Assistant**: Button "Is this doctor right for me?" → dialog where patient describes symptoms → calls `/api/doctor-suitability` → AI compares symptoms to specialty, returns match/mismatch + guidance
- **Edit mode**: Doctor can always edit own profile; admin/reception can edit only if `allowAdminEdit`/`allowReceptionEdit` is set on the profile; includes editing permissions toggle for doctor
- **Ratings**: Star rating widget; patients can add one review per doctor; average shown in header
- **Multi-clinic display**: Shows all clinic badges (from doctorClinicStore) on the doctor profile
- **Navigation**: "View Public Profile" button added to Doctors.tsx grid; sidebar "My Profile" link for doctor role; "View Profile" button on clinic public page

## Clinic Public Profile Page
- **Route**: `/clinic/:clinicId` — accessible to all users, no auth required
- **Extended `Clinic` type**: Added `description`, `descriptionAr`, `coverImageUrl`, `workingHours`, `workingHoursAr`, `latitude`, `longitude`, `website`
- **Seed data**: All 3 clinics have full marketing descriptions, working hours, lat/lng coordinates
- **Page sections**: Hero banner (name, rating, address), Info cards (phone, city, hours, website), About section, Doctors grid (with ratings + View Profile links), Nearest Available Appointments (from all clinic doctors, sorted by date/time), Patient Reviews (with add review for patients), Location (Google Maps embed iframe + Get Directions button)
- **Edit**: Admin can edit description, working hours, and coordinates from the clinic page directly
- **Ratings**: Patients rate clinics 1-5 stars; average shown in hero banner
- **Navigation**: Doctor sidebar has "Clinic Page" link for quick access; admin sidebar has settings link

## Ratings System
- **Store**: `src/stores/ratingStore.ts` — `Rating` type (targetId, targetType: 'doctor'|'clinic', patientId, stars 1-5, comment, createdAt)
- **Seed data**: 10 doctor ratings (for u-2, u-3, u-4, u-5) and 6 clinic ratings (for clinic-1, clinic-2, clinic-3)
- **Functions**: `getRatingsForTarget`, `getAverageRating`, `addRating`, `hasPatientRated` (prevents duplicate ratings)
- **UI**: Reusable `StarRating` component (interactive for rating, readOnly for display); patients can rate after viewing a profile once

## Multi-Clinic Doctor Support
- **Store**: `src/stores/doctorClinicStore.ts` — `DoctorClinicLink` (doctorId, clinicId, isActive)
- **Seed**: Dr. Ahmed Hassan (u-2) linked to clinic-1 AND clinic-2; others in clinic-1 only
- **Login flow**: After doctor login, `AuthContext.login()` checks `getClinicsForDoctor(doctorId)`; if >1 clinic → sets `pendingDoctorClinics` + `pendingDoctorUser` instead of logging in; Login.tsx shows a clinic selector card
- **`selectClinicForDoctor(clinicId)`**: Finalizes login with chosen clinic, sets user with that clinicId
- **`switchClinic()`**: Clears current session, re-enters the clinic selector; triggered by "Switch Clinic" button in sidebar footer for doctor role
- **Sidebar links**: "My Profile" and "Clinic Page" quick links for doctor role; "Switch Clinic" icon button next to Logout
- **Doctor profile display**: Shows all clinics the doctor belongs to as badges

## New API Endpoint
- `POST /api/doctor-suitability` — takes `{symptoms, doctorName, doctorSpecialty}`, uses `gpt-4o-mini` to evaluate if symptoms match the specialty; returns `{message, isMatch}` (max 120 tokens, temperature 0.3)

## Branding
- App name: Clinical Flow
- Logo: `attached_assets/Untitled_design_1772868317886.png` (OscarDevs logo)
- Favicon and PWA manifest configured in `public/`

## localStorage → Supabase API Audit (May 2026)

### Converted (use real API with localStorage fallback)
All auth-facing pages/components now call real API when token present, fall back to localStorage in demo mode:

| File | From | To |
|------|------|-----|
| `OffersManagement.tsx` | offersStore createStore | apiFetch + localStorage fallback |
| `SpecialtyManagement.tsx` | serviceStore import | useServices() hook |
| `Billing.tsx` | clinicStore import | useClinicSettings hook |
| `Dashboard.tsx` | getClinicById import | useClinicSettings hook |
| `MainLayout.tsx` | clinicStore import | API fetch + PLAN_LABELS const only |
| `HRPayroll.tsx` | userStore | useUsers hook |
| `Insurance.tsx` | patientStore | usePatients hook |
| `Inventory.tsx` | getClinicById | useClinicSettings hook |
| `PrescriptionsTab.tsx` | visitStore.filter | useVisits hook (with fallback) |
| `Doctors.tsx` | userStore.getAll() in allPlatformDoctors | useUsers hook; userStore.add → addUser() |
| `HomeVisitDashboard.tsx` | userStore.subscribe/get | useUsers hook + allUsers prop |
| `CallCenter.tsx` | userStore.filter/get + patientStore.filter | useUsers + usePatients hooks |
| `Tasks.tsx` | getUsersByClinic import | useUsers hook (apiUsers) |
| `DoctorSchedule.tsx` | userStore.get/update | doctors from useUsers; API PATCH only |
| `Reminders.tsx` | clinicStore.get | useClinicSettings hook |
| `LabOrders.tsx` | getClinicById | useClinicSettings hook |

### Acceptable localStorage-only (no auth token required)
Public/unauthenticated pages that have no API context:
- `SearchPage.tsx`, `LandingPage.tsx`, `DoctorProfilePage.tsx`, `ClinicPublicPage.tsx` — public marketplace
- `Login.tsx`, `PatientLogin.tsx`, `RegisterPage.tsx` — pre-auth pages
- `QueueScreen.tsx`, `CheckInScan.tsx` — kiosk/display screens
- `PatientCard.tsx`, `PatientPortal.tsx` — patient-facing
- `AIBookingAssistant.tsx`, `BookingWizard.tsx`, `HomeVisitBookingDialog.tsx` — booking flow
- `SuperAdmin.tsx` — uses localStorage seed data by design
- `CampaignManager.tsx`, `RevenueIntelligence.tsx` — analytics features, localStorage acceptable
- `Reports.tsx` (expenseStore/loyaltyStore), `AuditLog.tsx` — localStorage-only features

## Growth Engine — Patient Retention & Revenue (May 2026)

### Overview
Rule-based automated patient re-engagement system. Segments patients from Supabase data, generates personalised Arabic WhatsApp messages per segment, enforces a 7-day spam cooldown, and tracks results in an in-memory log with a dashboard UI.

### Backend (`server.js`)
- **Stores**: `_growthLog[]` (last 300 entries), `_growthCooldown` Map (phone → lastSentAt ms), `GROWTH_COOLDOWN_MS = 7 days`
- **Templates** (`GROWTH_TEMPLATES`): `inactive`, `no_show`, `recent`, `high_value`, `empty_slots` — Arabic WhatsApp messages
- **`runGrowthEngine(clinicId)`** (async):
  1. Fetches last-30-day appointments → builds patient segments (noShow, recent, count)
  2. Fetches 30–180 day old appointments → marks as `inactive` if no recent visit
  3. Finds first available doctor with open slots → used for `empty_slots` template
  4. Segment priority: `no_show` > `inactive` > `high_value` (3+ visits + slot) > `recent`
  5. Cooldown check per phone → skip if sent within 7 days
  6. Sends via `sendWhatsAppMessage()` → logs to `_growthLog` + `recordAIEvent()`
  7. 300ms throttle between sends
- **`POST /api/growth/run`** — admin/reception; runs engine for their clinic; returns `{ sent, skipped, segments }`
- **`GET /api/growth/status`** — returns `{ stats: { total, sent, pending, segments }, logs[] }`

### Frontend (`src/pages/GrowthEngine.tsx`)
- **Route**: `/growth-engine` (admin/reception only — visible in sidebar under Management)
- **Sidebar entry**: "محرك النمو / Growth Engine" with `TrendingUp` icon (admin only)
- **Cards**:
  - Stats row: Total Messages / Sent / Pending / Inactive Found
  - Segment breakdown: 4 colored pills (inactive/no_show/recent/high_value) with counts
  - "How it works" explanation card (bilingual)
  - Recent messages log table (patient name, phone, segment badge, message preview, status, time)
- **Run button**: "تشغيل المحرك / Run Engine" → shows green result banner after completion
- **Empty state**: shows icon + prompt to run engine for first time

### Trigger Rules (Rule-Based)
| Segment | Condition | Message |
|---------|-----------|---------|
| no_show | last appointment status = no_show | Recovery + rebook offer |
| inactive | no appointment in last 30 days (had one in 30-180) | Reactivation + booking invite |
| high_value | 3+ visits AND doctor has open slot | Empty slot offer with doctor name |
| recent | visited in last 7 days | Follow-up reminder |

## AI Call Center & Voice Reminder System (May 2026)

### AI Voice Booking Simulator
- **`src/pages/CallCenter.tsx`** — New "AI Voice Booking Simulator" card at the top of the Call Center page:
  - Phone number input (simulate any patient's session)
  - Mic button (Web Speech API, Arabic ar-EG) — auto-submits transcript on silence
  - Text input + Enter / Send button
  - Chat-style conversation bubbles (user=right, bot=left)
  - Red emergency alert box for detected emergency keywords
  - Shows transcription label `🎤` above bot reply when voice was used
  - Reset button to clear session

### AI Call Center Process Endpoint
- **`POST /api/call-center/process`** — accepts `{ phone, text?, audioBase64?, audioMimeType?, clinicId? }`
  - `text` path: normalize → emergency check → `handleSimulatedMessage()`
  - `audioBase64` path: decode → Whisper transcription → normalize → emergency check → `handleSimulatedMessage()`
  - Returns `{ reply, state, isEmergency, transcription? }`
  - Logs every interaction to console with phone + text + resulting state

### Emergency Detection in Voice Booking (FIXED GAP)
- **`handleVoiceBooking()`** — emergency keywords now checked AFTER `preprocess()` and BEFORE intent extraction
- Emergency keywords: `ألم في الصدر`, `صعوبة في التنفس`, `فقدان وعي`, `نزيف شديد`, `جلطة`, `أزمة قلبية`, `chest pain`, `heart attack`, `unconscious`
- Sends immediate WhatsApp reply directing to emergency services (123) — never auto-books

### Automated Voice Reminder Call System (Twilio)
- **In-memory stores**: `_voiceCallLog` Map (callSid → log entry), `_recentlyCalled` Set (clears every 2h)
- **Config**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` env secrets; `twilioReady` flag
- **`runVoiceReminders(clinicId)`**: queries `appointments` for `status='scheduled'` today+tomorrow, skips recently-called or missing phone, calls Twilio REST API (no SDK)
- **TwiML**: Arabic IVR using `Polly.Zeina` voice — gather DTMF (1=confirm, 2=cancel, timeout=12s)
- **Retry**: on `no_answer` status, retries once after 5 minutes via setTimeout
- **Safety**: skips `confirmed`/`cancelled` appointments; skips if already in `_recentlyCalled`
- **Endpoints**:
  - `POST /api/voice-reminders/run` — admin/reception trigger; returns `{ called, skipped, errors, details[] }`
  - `GET /api/voice-reminders/status` — returns `{ twilioConfigured, stats, logs[] }`
  - `POST /api/voice-reminders/webhook` — Twilio DTMF + status callback (no auth); updates appointment status in Supabase; logs via `recordAIEvent()`
- **UI** (`CallCenter.tsx`): Voice Reminders card at bottom with:
  - "Twilio not configured" amber warning if secrets missing; "Ready" green badge if configured
  - 4-stat grid: Called / Confirmed / Cancelled / No Answer
  - "Run Reminder Calls" button with loading spinner
  - Recent call log table (patient, appointment date/time, doctor, status, attempt #)

## E2E Testing — Full Flow Verified (May 2026)
Comprehensive test of all 5 roles via `/demo-setup` route. All pages confirmed working:

### ✅ Patient Role
- Patient portal (upcoming appointments, past visits)
- Booking wizard (specialty selection, date/time, confirmation)
- Clinic public page (`/clinic/clinic-1` — full landing page)

### ✅ Reception Role
- Appointments management (10 demo appointments, pipeline: محجوز → وصل → انتظار → استشارة → مكتمل)
- Queue management (`/queue` — renders correctly)
- Billing page (7 invoices, ج.م 925 total, ج.م 525 paid, ج.م 400 unpaid)
- Patients list (8 patients with AI search)

### ✅ Doctor Role
- Dashboard (3 today appointments, AI coach bubble)
- Appointments (filtered to doctor's own 6 appointments)
- Schedule management (working days + blackout dates)
- Clinical Suite (`/clinical/v-3` — vital signs, patient sidebar, tabs)
- Drug Database (231 drugs across 14 categories)
- Medical Library (AI-powered protocols, empty state)

### ✅ Admin Role
- Dashboard (revenue stats, prediction engine, chart)
- Reports (overview, financial indicators, loyalty tabs)
- Settings (clinic info, pricing, tax, notifications tabs)
- Services (20 services with specialty/pricing)
- Campaigns (WhatsApp campaigns, empty state)
- Financial Audit (transaction log, fraud detection)
- Document Audit (6 records — access trail with sensitive data tagging)
- Growth Engine (patient retention automation)
- Analytics / BI Dashboard (monthly revenue + patient growth charts)
- Offers (2 active offers with usage tracking)
- Specialties (47 specialties, EN+AR names)

### ✅ Super Admin Role
- Super admin panel (3 registered clinics, subscription comparison)
- Registration requests tab, AI usage tab

### Translation Fixes Applied
| Key | EN | AR |
|-----|----|----|
| `billing.patient` | Patient | المريض |
| `billing.date` | Date | التاريخ |
| `billing.status` | Status | الحالة |
| `billing.services` | Services | الخدمات |
| `billing.unpaid` | Unpaid | غير مدفوع |
| `reports.revenue` | Revenue | الإيرادات |
| `services.edit` | Edit Service | تعديل خدمة |
| `booking.slotConflict` | Slot conflict message | رسالة تعارض الموعد |

## Bug Fixes (Comprehensive Scan — May 2026)
All 16 bugs found and fixed across the codebase:

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | `src/pages/Billing.tsx` | `totals.finalTotal` — field doesn't exist on `calcInvoiceTotals` return | Changed to `totals.grandTotal` |
| 2 | `src/pages/LabOrders.tsx` | `patients.filter(p => p.isActive)` — `Patient` type has no `isActive` field, always returned empty | Removed the filter |
| 3 | `src/hooks/useVisits.ts` | Missing `priority` field in API→Visit normalise map | Added `priority: v.priority ?? (v.is_urgent ? 'urgent' : 'normal')` |
| 4 | `src/pages/Dashboard.tsx` | `sendToDoctor`, `completeVisit`, `callNextPatient` async handlers missing `await` | Added `async`/`await` to all handlers |
| 5 | `src/pages/Appointments.tsx` | `sendToDoctor`, `completeVisit` async handlers missing `await` | Added `async`/`await` to both handlers |
| 6 | `src/pages/Appointments.tsx` | `checkInAppointment` async called without `await` — `if(result)` always true (Promise truthy) | Made `handleCheckIn` async + `await` |
| 7 | `src/pages/Appointments.tsx` | `markNoShow` async called without `await` | Made `handleNoShow` async + `await` |
| 8 | `src/pages/Appointments.tsx` | `refundInvoice` async called without `await` — `if(refundInvoice(...))` always truthy | Made `handleRefund` async + `await` |
| 9 | `src/pages/Billing.tsx` | `addPayment` async called without `await` in `confirmPayment` | Made `confirmPayment` async + `await` |
| 10 | `src/pages/Billing.tsx` | `updateInvoiceDiscount` async called without `await` | Made `handleApplyDiscount` async + `await` |
| 11 | `src/pages/Billing.tsx` | `refundInvoice` async called without `await` in `handleRefundInvoice` | Made handler async + `await` |
| 12 | `src/components/ui/AIBookingAssistant.tsx` | `createAppointment` async called without `await` in `handleSlotClick` — catch block never fired | Made handler async + `await` |
| 13 | `src/components/ui/AIBookingAssistant.tsx` | `createAppointment` async called without `await` in `handleBookPending` | Made handler async + `await` |
| 14 | `src/components/AIBookingAssistant.tsx` | Same issues in full AIBookingAssistant component `handleSlotClick` + `handleBookPending` | Made both handlers async + `await` |
| 15 | `src/components/BookingWizard.tsx` | `createAppointment` async called without `await` in `handleConfirm` | Made handler async + `await` |
| 16 | `src/types/index.ts` | `UserRole` type missing `super_admin` — 32 usages of `user.role === 'super_admin'` were TypeScript dead code | Added `super_admin` to `UserRole`; cleaned up redundant unions in `AuthContext`, `dataMask.ts`, `usePermissions.ts` |
