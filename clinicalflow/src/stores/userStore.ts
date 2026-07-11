import { User } from '@/types';
import { createStore } from './createStore';
import { CLINIC_IDS } from './clinicStore';

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_USERS_KEY = 'cf_staff_users';

function loadPersistedUsers(): User[] {
  try {
    const raw = localStorage.getItem(LS_USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function persistUser(user: User): void {
  try {
    const existing = loadPersistedUsers();
    if (existing.some(u => u.id === user.id)) return;
    localStorage.setItem(LS_USERS_KEY, JSON.stringify([...existing, user]));
  } catch { /* graceful */ }
}

// ── Staff users come from Supabase — this array is intentionally empty ──────
const mockUsers: User[] = [];
/* REMOVED: demo users — data now served exclusively from Supabase /api/auth endpoints
const _removedMockUsers: User[] = [

  // ═══════════════════════════════════════════
  // مركز النيل الطبي (clinic-1)
  // ═══════════════════════════════════════════
  {
    id: 'u-1',
    name: 'Dr. Sara Mahmoud',      nameAr: 'د. سارة محمود',
    email: 'admin@nilemedical.com',
    role: 'admin',
    clinicId: CLINIC_IDS.NILE_MEDICAL,
    isActive: true,
    createdAt: '2024-01-01',
  },
  {
    id: 'u-2',
    name: 'Dr. Ahmed Hassan',      nameAr: 'د. أحمد حسن',
    email: 'ahmed.hassan@nilemedical.com',
    role: 'doctor',
    specialtyId: 'sp-1',
    clinicId: CLINIC_IDS.NILE_MEDICAL,
    isActive: true,
    createdAt: '2024-01-15',
    homeVisitEnabled: true,
    homeVisitPrice: 400,
    homeVisitDurationMinutes: 45,
    homeVisitDailyLimit: 4,
    homeVisitRadiusKm: 15,
    homeVisitAreas: ['مدينة نصر', 'مصر الجديدة', 'المعادي', 'الزمالك'],
  },
  {
    id: 'u-3',
    name: 'Dr. Nour Ibrahim',      nameAr: 'د. نور إبراهيم',
    email: 'nour.ibrahim@nilemedical.com',
    role: 'doctor',
    specialtyId: 'sp-2',
    clinicId: CLINIC_IDS.NILE_MEDICAL,
    isActive: true,
    createdAt: '2024-01-20',
    homeVisitEnabled: true,
    homeVisitPrice: 500,
    homeVisitDurationMinutes: 60,
    homeVisitDailyLimit: 3,
    homeVisitRadiusKm: 20,
    homeVisitAreas: ['القاهرة الجديدة', 'التجمع الخامس', 'الرحاب', 'مدينتي'],
  },
  {
    id: 'u-4',
    name: 'Dr. Omar Farouk',       nameAr: 'د. عمر فاروق',
    email: 'omar.farouk@nilemedical.com',
    role: 'doctor',
    specialtyId: 'sp-3',
    clinicId: CLINIC_IDS.NILE_MEDICAL,
    isActive: true,
    createdAt: '2024-02-01',
  },
  {
    id: 'u-5',
    name: 'Dr. Iman Mostafa',      nameAr: 'د. إيمان مصطفى',
    email: 'iman.mostafa@nilemedical.com',
    role: 'doctor',
    specialtyId: 'sp-4',
    clinicId: CLINIC_IDS.NILE_MEDICAL,
    isActive: true,
    createdAt: '2024-02-10',
  },
  {
    id: 'u-6',
    name: 'Mariam Samir',          nameAr: 'مريم سمير',
    email: 'reception@nilemedical.com',
    role: 'reception',
    clinicId: CLINIC_IDS.NILE_MEDICAL,
    isActive: true,
    createdAt: '2024-02-01',
  },

  // ═══════════════════════════════════════════
  // عيادة القاهرة الصحية (clinic-2)
  // ═══════════════════════════════════════════
  {
    id: 'u-10',
    name: 'Dr. Hana Mansour',      nameAr: 'د. هناء منصور',
    email: 'admin@cairohealth.com',
    role: 'admin',
    clinicId: CLINIC_IDS.CAIRO_HEALTH,
    isActive: true,
    createdAt: '2024-03-15',
  },
  {
    id: 'u-11',
    name: 'Dr. Karim Nabil',       nameAr: 'د. كريم نبيل',
    email: 'karim.nabil@cairohealth.com',
    role: 'doctor',
    specialtyId: 'sp-1',
    clinicId: CLINIC_IDS.CAIRO_HEALTH,
    isActive: true,
    createdAt: '2024-03-20',
  },
  {
    id: 'u-12',
    name: 'Nour Khaled',           nameAr: 'نور خالد',
    email: 'reception@cairohealth.com',
    role: 'reception',
    clinicId: CLINIC_IDS.CAIRO_HEALTH,
    isActive: true,
    createdAt: '2024-04-01',
  },

  // ═══════════════════════════════════════════
  // مركز الإسكندرية للرعاية (clinic-3)
  // ═══════════════════════════════════════════
  {
    id: 'u-20',
    name: 'Dr. Tarek Samy',        nameAr: 'د. طارق سامي',
    email: 'admin@alexcare.com',
    role: 'admin',
    clinicId: CLINIC_IDS.ALEX_CARE,
    isActive: true,
    createdAt: '2024-06-01',
  },
  {
    id: 'u-21',
    name: 'Dr. Mona Fawzy',        nameAr: 'د. منى فوزي',
    email: 'mona.fawzy@alexcare.com',
    role: 'doctor',
    specialtyId: 'sp-2',
    clinicId: CLINIC_IDS.ALEX_CARE,
    isActive: true,
    createdAt: '2024-06-05',
  },
  {
    id: 'u-22',
    name: 'Reem Hassan',           nameAr: 'ريم حسن',
    email: 'reception@alexcare.com',
    role: 'reception',
    clinicId: CLINIC_IDS.ALEX_CARE,
    isActive: true,
    createdAt: '2024-06-10',
  },

  // ═══════════════════════════════════════════
  // طبيب زيارات منزلية مستقل
  // ═══════════════════════════════════════════
  {
    id: 'u-hv1',
    name: 'Dr. Khaled Mostafa',    nameAr: 'د. خالد مصطفى',
    email: 'khaled.mostafa@clinicflow.app',
    role: 'doctor',
    specialtyId: 'sp-1',
    clinicId: '',
    isActive: true,
    createdAt: '2025-01-10',
    homeVisitEnabled: true,
    homeVisitPrice: 600,
    homeVisitDurationMinutes: 45,
    homeVisitDailyLimit: 5,
    homeVisitRadiusKm: 25,
    homeVisitAreas: ['مدينة نصر', 'مصر الجديدة', 'عين شمس', 'شبرا', 'المطرية'],
  },
]; // end _removedMockUsers */

// ── Merge seed + approved staff from localStorage ─────────────────────────────
const persistedUsers = loadPersistedUsers();
const allInitialUsers = [
  ...mockUsers,
  ...persistedUsers.filter(p => !mockUsers.some(m => m.id === p.id)),
];

export const userStore = createStore<User>(allInitialUsers, 'cf_staff_users', true);

export const getDoctors            = () => userStore.filter(u => u.role === 'doctor');
export const getActiveDoctors      = () => userStore.filter(u => u.role === 'doctor' && u.isActive);
export const getDoctorsBySpecialty = (specialtyId: string) =>
  userStore.filter(u => u.role === 'doctor' && u.specialtyId === specialtyId && u.isActive);
export const getDoctorsByClinic    = (clinicId: string) =>
  userStore.filter(u => u.role === 'doctor' && u.clinicId === clinicId && u.isActive);
export const getUsersByClinic      = (clinicId: string) =>
  userStore.filter(u => u.clinicId === clinicId);
