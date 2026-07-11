import { MedicalOffer } from '@/types';
import { createStore } from './createStore';

const today = new Date().toISOString().split('T')[0];

const mockOffers: MedicalOffer[] = [
  {
    id: 'offer-1',
    clinicId: 'clinic-1',
    clinicName: 'Nile Medical Center',
    doctorId: 'u-4',
    doctorName: 'Dr. Omar Farouk',
    title: '30% Off Cardiology Consultation',
    titleAr: 'خصم 30% على استشارة القلب',
    description: 'Limited-time offer on cardiac consultations including ECG and initial evaluation. Perfect for those concerned about heart health.',
    descriptionAr: 'عرض محدود على استشارات القلب بما يشمل تخطيط القلب والتقييم الأولي.',
    offerType: 'percentage_discount',
    serviceType: 'consultation',
    startDate: today,
    expiresAt: '2026-04-30',
    originalPrice: 200,
    discountedPrice: 140,
    discountPercent: 30,
    maxUses: 50,
    usedCount: 12,
    conditions: { firstVisitOnly: false },
    isActive: true,
  },
  {
    id: 'offer-2',
    clinicId: 'clinic-1',
    clinicName: 'Nile Medical Center',
    doctorId: 'u-3',
    doctorName: 'Dr. Sarah Mitchell',
    title: 'Free Follow-Up Visit — Pediatrics',
    titleAr: 'زيارة متابعة مجانية — طب الأطفال',
    description: 'Book a pediatric consultation and receive a free follow-up within 14 days. Ideal for new patients with children under 12.',
    descriptionAr: 'احجز استشارة أطفال واحصل على زيارة متابعة مجانية خلال 14 يوماً.',
    offerType: 'free_followup',
    serviceType: 'followup',
    startDate: today,
    expiresAt: '2026-05-15',
    originalPrice: 150,
    discountedPrice: 150,
    maxUses: undefined,
    usedCount: 7,
    conditions: { firstVisitOnly: true },
    isActive: true,
  },
  {
    id: 'offer-3',
    clinicId: 'clinic-2',
    clinicName: 'Cairo Health Clinic',
    doctorId: undefined,
    doctorName: undefined,
    title: 'Family Health Package — Special Price',
    titleAr: 'باقة صحة الأسرة — سعر خاص',
    description: 'Comprehensive health checkup for the whole family. Includes blood tests, blood pressure monitoring, and general consultation for up to 4 family members.',
    descriptionAr: 'فحص صحي شامل للأسرة بأكملها يشمل تحاليل الدم وقياس ضغط الدم والاستشارة العامة لـ 4 أفراد.',
    offerType: 'family_package',
    serviceType: 'all',
    startDate: today,
    expiresAt: '2026-04-15',
    originalPrice: 600,
    discountedPrice: 399,
    discountPercent: 34,
    maxUses: 20,
    usedCount: 8,
    conditions: {},
    isActive: true,
  },
  {
    id: 'offer-4',
    clinicId: 'clinic-3',
    clinicName: 'Alexandria Care Center',
    doctorId: 'u-5',
    doctorName: 'Dr. Lisa Chen',
    title: 'Skin Consultation + Treatment Plan',
    titleAr: 'استشارة جلدية + خطة علاج',
    description: '25% discount on initial dermatology consultation plus a personalized treatment plan. Valid for new patients only.',
    descriptionAr: 'خصم 25% على أول استشارة جلدية مع خطة علاج شخصية. للمرضى الجدد فقط.',
    offerType: 'first_visit',
    serviceType: 'consultation',
    startDate: today,
    expiresAt: '2026-06-01',
    originalPrice: 180,
    discountedPrice: 135,
    discountPercent: 25,
    maxUses: 30,
    usedCount: 5,
    conditions: { firstVisitOnly: true },
    isActive: true,
  },
];

export const offerStore = createStore<MedicalOffer>(mockOffers, 'cf_offers');

export const getActiveOffers = (): MedicalOffer[] =>
  offerStore.filter(o => o.isActive && new Date(o.expiresAt) >= new Date());

export const getOffersByClinic = (clinicId: string): MedicalOffer[] =>
  offerStore.filter(o => o.clinicId === clinicId);

export const getActiveOffersByClinic = (clinicId: string): MedicalOffer[] =>
  offerStore.filter(o => o.clinicId === clinicId && o.isActive && new Date(o.expiresAt) >= new Date());

export const createOffer = (offer: Omit<MedicalOffer, 'id'>): MedicalOffer => {
  const newOffer: MedicalOffer = {
    ...offer,
    id: `offer-${Date.now()}`,
  };
  offerStore.add(newOffer);
  return newOffer;
};

export const updateOffer = (id: string, updates: Partial<MedicalOffer>): void => {
  offerStore.update(o => o.id === id, updates);
};

export const deleteOffer = (id: string): void => {
  offerStore.remove(o => o.id === id);
};

export const toggleOfferActive = (id: string): void => {
  const offer = offerStore.get(o => o.id === id);
  if (offer) offerStore.update(o => o.id === id, { isActive: !offer.isActive });
};

export const incrementOfferUsage = (id: string): void => {
  const offer = offerStore.get(o => o.id === id);
  if (offer) offerStore.update(o => o.id === id, { usedCount: offer.usedCount + 1 });
};

export const OFFER_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  percentage_discount: { en: 'Percentage Discount', ar: 'خصم نسبة مئوية' },
  fixed_discount: { en: 'Fixed Amount Discount', ar: 'خصم مبلغ ثابت' },
  free_followup: { en: 'Free Follow-Up Visit', ar: 'زيارة متابعة مجانية' },
  consultation_package: { en: 'Consultation Package', ar: 'باقة استشارات' },
  family_package: { en: 'Family Package', ar: 'باقة عائلية' },
  first_visit: { en: 'First Visit Discount', ar: 'خصم الزيارة الأولى' },
  urgent_visit: { en: 'Urgent Visit Discount', ar: 'خصم الزيارة العاجلة' },
  reward_points: { en: 'Reward Points', ar: 'نقاط مكافأة' },
  home_visit_discount: { en: 'Home Visit Discount', ar: 'خصم الزيارة المنزلية' },
  home_visit_package: { en: 'Home Visit Package', ar: 'باقة زيارات منزلية' },
};

export const SERVICE_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  consultation: { en: 'Consultation', ar: 'استشارة' },
  followup: { en: 'Follow-Up Visit', ar: 'زيارة متابعة' },
  urgent: { en: 'Urgent Visit', ar: 'زيارة عاجلة' },
  home_visit: { en: 'Home Visit', ar: 'زيارة منزلية' },
  all: { en: 'All Services', ar: 'جميع الخدمات' },
};
