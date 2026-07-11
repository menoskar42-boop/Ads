import { createStore } from './createStore';

// All known module names — must match useModules.ts ModuleName type
export const ALL_MODULE_NAMES = ['finance', 'inventory', 'ai', 'insurance', 'reports'] as const;
export type PlanModuleName = typeof ALL_MODULE_NAMES[number];

// Plan → enabled modules mapping
export const PLAN_MODULE_MAP: Record<string, PlanModuleName[]> = {
  'plan-1': [],                                                       // basic: core only
  'plan-2': ['finance', 'inventory'],                                 // pro
  'plan-3': ['finance', 'inventory', 'insurance', 'reports'],        // advanced
  'plan-4': ['finance', 'inventory', 'ai', 'insurance', 'reports'],  // elite
};

export interface SubscriptionPlan {
  id: string;
  name: string;
  nameAr: string;
  maxBranches: number;
  maxUsers: number;
  maxSpecialties: number;
  pricing: {
    annually: number;
    fiveYears: number;
    tenYears: number;
    lifetime: number;
    cashDiscount?: number;
  };
  modules: PlanModuleName[];   // modules included in this plan
  features: string[];
  featuresAr: string[];
  isMostPopular?: boolean;
  color: string;
}

export interface ClinicSubscription {
  id: string;
  clinicId: string;
  planId: string;
  startDate: string;
  endDate?: string;
  isLifetime: boolean;
  billingPeriod: 'annually' | 'fiveYears' | 'tenYears' | 'lifetime';
  amountPaid: number;
  status: 'active' | 'expired' | 'cancelled' | 'trial';
  createdAt: string;
}

export const subscriptionPlanStore = createStore<SubscriptionPlan>([], 'cf_sub_plans');
export const clinicSubscriptionStore = createStore<ClinicSubscription>([], 'cf_subscriptions');

export const DEFAULT_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan-1', name: 'Single Branch', nameAr: 'فرع واحد', maxBranches: 1, maxUsers: 3, maxSpecialties: 2,
    pricing: { annually: 5000, fiveYears: 10000, tenYears: 12000, lifetime: 15000 },
    modules: [],
    features: ['Appointments', 'Basic Billing', 'Patient Records', 'Queue Management'],
    featuresAr: ['إدارة المواعيد', 'فوترة أساسية', 'ملفات المرضى', 'قائمة الانتظار'],
    isMostPopular: false, color: '#6366f1',
  },
  {
    id: 'plan-2', name: '2 Branches', nameAr: 'فرعين', maxBranches: 2, maxUsers: 6, maxSpecialties: -1,
    pricing: { annually: 10000, fiveYears: 20000, tenYears: 25000, lifetime: 35000, cashDiscount: 30000 },
    modules: ['finance', 'inventory'],
    features: ['All Basic', 'Finance Module', 'Inventory Module', 'Lab Orders'],
    featuresAr: ['كل الأساسي', 'وحدة المالية', 'وحدة المخزن', 'طلبات المعامل'],
    isMostPopular: false, color: '#06b6d4',
  },
  {
    id: 'plan-3', name: '3 Branches', nameAr: '3 فروع', maxBranches: 3, maxUsers: -1, maxSpecialties: -1,
    pricing: { annually: 15000, fiveYears: 25000, tenYears: 35000, lifetime: 50000, cashDiscount: 40000 },
    modules: ['finance', 'inventory', 'insurance', 'reports'],
    features: ['All Pro', 'Insurance Module', 'Reports & Analytics', 'HR & Payroll'],
    featuresAr: ['كل برو', 'وحدة التأمين', 'تقارير وتحليلات', 'موارد بشرية'],
    isMostPopular: true, color: '#3b82f6',
  },
  {
    id: 'plan-4', name: '4 Branches', nameAr: '4 فروع', maxBranches: 4, maxUsers: -1, maxSpecialties: -1,
    pricing: { annually: 20000, fiveYears: 30000, tenYears: 40000, lifetime: 70000, cashDiscount: 60000 },
    modules: ['finance', 'inventory', 'ai', 'insurance', 'reports'],
    features: ['All Features', 'AI Module', 'Priority Support', 'API Access'],
    featuresAr: ['كل المميزات', 'وحدة الذكاء الاصطناعي', 'دعم أولوية', 'وصول API'],
    isMostPopular: false, color: '#8b5cf6',
  },
];

// ─── Apply plan modules to a clinic (localStorage + optional API call) ──────
// Writes cf_clinic_modules in the same format useModules.ts expects.
// Fail-safe: any storage error is swallowed — never crashes the UI.
export function applyPlanModules(clinicId: string, planId: string): void {
  try {
    const enabledModules = PLAN_MODULE_MAP[planId] ?? [];
    const state: Record<string, boolean> = {};
    ALL_MODULE_NAMES.forEach(m => { state[m] = enabledModules.includes(m); });

    const raw = localStorage.getItem('cf_clinic_modules');
    const existing = raw ? JSON.parse(raw) : {};
    existing[clinicId] = state;
    localStorage.setItem('cf_clinic_modules', JSON.stringify(existing));
  } catch { /* storage unavailable — fail silently */ }
}
