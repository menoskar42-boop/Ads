import { Clinic } from '@/types';
import { createStore } from './createStore';

export const CLINIC_IDS = {
  NILE_MEDICAL: 'clinic-1',
  CAIRO_HEALTH: 'clinic-2',
  ALEX_CARE: 'clinic-3',
};

// ── localStorage persistence ──────────────────────────────────────────────────
const LS_CLINICS_KEY = 'cf_staff_clinics';

function loadPersistedClinics(): Clinic[] {
  try {
    const raw = localStorage.getItem(LS_CLINICS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function persistClinic(clinic: Clinic): void {
  try {
    const existing = loadPersistedClinics();
    if (existing.some(c => c.id === clinic.id)) return;
    localStorage.setItem(LS_CLINICS_KEY, JSON.stringify([...existing, clinic]));
  } catch { /* graceful */ }
}

const mockClinics: Clinic[] = [
  {
    id: CLINIC_IDS.NILE_MEDICAL,
    name: 'Nile Medical Center',
    nameAr: 'مركز النيل الطبي',
    address: '15 Tahrir Square, Cairo',
    addressAr: '15 ميدان التحرير، القاهرة',
    phone: '+20 2 2391 1234',
    city: 'Cairo',
    cityAr: 'القاهرة',
    subscriptionPlan: 'ai',
    isActive: true,
    maxDoctors: 20,
    aiEnabled: true,
    advancedReports: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    description: 'Nile Medical Center is a premier multi-specialty clinic in the heart of Cairo, offering world-class healthcare with cutting-edge technology and a compassionate team of expert physicians. We are committed to delivering excellence in patient care across all medical specialties.',
    descriptionAr: 'مركز النيل الطبي هو عيادة متعددة التخصصات متميزة في قلب القاهرة، تقدم رعاية صحية على مستوى عالمي بأحدث التقنيات وفريق من الأطباء المتخصصين. نحن ملتزمون بتقديم التميز في رعاية المريض عبر جميع التخصصات الطبية.',
    workingHours: 'Sun–Thu: 9:00 AM – 9:00 PM | Fri–Sat: 10:00 AM – 5:00 PM',
    workingHoursAr: 'الأحد–الخميس: ٩ص – ٩م | الجمعة–السبت: ١٠ص – ٥م',
    latitude: 30.0444,
    longitude: 31.2357,
    website: 'https://nilemedical.com.eg',
    socialLinks: {
      facebook: 'https://facebook.com/NileMedicalCenter',
      instagram: 'https://instagram.com/nilemedicalcenter',
      linkedin: 'https://linkedin.com/company/nile-medical-center',
      youtube: 'https://youtube.com/@NileMedical',
    },
  },
  {
    id: CLINIC_IDS.CAIRO_HEALTH,
    name: 'Cairo Health Clinic',
    nameAr: 'عيادة القاهرة الصحية',
    address: '42 Ramses Street, Cairo',
    addressAr: '42 شارع رمسيس، القاهرة',
    phone: '+20 2 2575 5678',
    city: 'Cairo',
    cityAr: 'القاهرة',
    subscriptionPlan: 'pro',
    isActive: true,
    maxDoctors: 10,
    aiEnabled: false,
    advancedReports: true,
    createdAt: '2024-03-15T00:00:00.000Z',
    description: 'Cairo Health Clinic provides comprehensive healthcare services with a focus on preventive medicine and chronic disease management. Our experienced team ensures every patient receives personalized, evidence-based care in a welcoming environment.',
    descriptionAr: 'عيادة القاهرة الصحية تقدم خدمات رعاية صحية شاملة مع التركيز على الطب الوقائي وإدارة الأمراض المزمنة. يضمن فريقنا ذو الخبرة حصول كل مريض على رعاية شخصية قائمة على الأدلة في بيئة ترحيبية.',
    workingHours: 'Sun–Fri: 9:00 AM – 8:00 PM | Sat: Closed',
    workingHoursAr: 'الأحد–الجمعة: ٩ص – ٨م | السبت: مغلق',
    latitude: 30.0626,
    longitude: 31.2497,
    website: 'https://cairohealth.com.eg',
    socialLinks: {
      facebook: 'https://facebook.com/CairoHealthClinic',
      instagram: 'https://instagram.com/cairohealthclinic',
    },
  },
  {
    id: CLINIC_IDS.ALEX_CARE,
    name: 'Alexandria Care Center',
    nameAr: 'مركز الإسكندرية للرعاية',
    address: '7 Corniche Road, Alexandria',
    addressAr: '7 شارع الكورنيش، الإسكندرية',
    phone: '+20 3 4862 9012',
    city: 'Alexandria',
    cityAr: 'الإسكندرية',
    subscriptionPlan: 'basic',
    isActive: true,
    maxDoctors: 5,
    aiEnabled: false,
    advancedReports: false,
    createdAt: '2024-06-01T00:00:00.000Z',
    description: 'Alexandria Care Center is a trusted community clinic serving the residents of Alexandria with quality primary care and specialist services. Located on the beautiful Corniche, we combine professional medical excellence with genuine care for our patients and their families.',
    descriptionAr: 'مركز الإسكندرية للرعاية هو عيادة مجتمعية موثوقة تخدم سكان الإسكندرية بخدمات الرعاية الأولية والتخصصية. يجمع موقعنا على الكورنيش الجميل بين التميز الطبي المهني والاهتمام الحقيقي بمرضانا وعائلاتهم.',
    workingHours: 'Daily: 9:00 AM – 6:00 PM',
    workingHoursAr: 'يومياً: ٩ص – ٦م',
    latitude: 31.2001,
    longitude: 29.9187,
    website: 'https://alexcare.com.eg',
    socialLinks: {
      facebook: 'https://facebook.com/AlexandriaCareCenterEg',
      instagram: 'https://instagram.com/alexcareeg',
      tiktok: 'https://tiktok.com/@alexcarecenter',
    },
  },
];

// Merge seed + approved clinics from localStorage
const persistedClinics = loadPersistedClinics();
const allInitialClinics = [
  ...mockClinics,
  ...persistedClinics.filter(p => !mockClinics.some(m => m.id === p.id)),
];

export const clinicStore = createStore<Clinic>(allInitialClinics, 'cf_staff_clinics', true);

export const getClinicById = (id: string) => clinicStore.get(c => c.id === id);
export const getActiveClinics = () => clinicStore.filter(c => c.isActive);

export const PLAN_LABELS: Record<string, { en: string; ar: string; color: string }> = {
  basic: { en: 'Basic', ar: 'أساسي', color: 'bg-muted text-muted-foreground' },
  pro: { en: 'Pro', ar: 'احترافي', color: 'bg-chart-1/10 text-chart-1' },
  ai: { en: 'AI', ar: 'ذكاء اصطناعي', color: 'bg-primary/10 text-primary' },
};
