const STORAGE_KEY = 'clinic-settings';

export interface ClinicSettings {
  name: string;
  nameAr: string;
  address: string;
  addressAr: string;
  phone: string;
  email: string;
  logo: string; // base64 data URL
  taxEnabled: boolean;
  taxRate: number; // percentage e.g. 15
  taxLabel: string;
  taxLabelAr: string;
  examinationFee: number; // مبلغ الكشف — ج.م
  consultationFee: number; // مبلغ الاستشارة — ج.م
}

const defaults: ClinicSettings = {
  name: 'ClinicalFlow Clinic',
  nameAr: 'عيادة كلينيكال فلو',
  address: '123 Medical Center Drive, Riyadh, Saudi Arabia',
  addressAr: 'شارع الملك فهد، الرياض، المملكة العربية السعودية',
  phone: '+966 11 234 5678',
  email: 'info@clinicalflow.com',
  logo: '',
  taxEnabled: false,
  taxRate: 15,
  taxLabel: 'VAT',
  taxLabelAr: 'ضريبة القيمة المضافة',
  examinationFee: 150,
  consultationFee: 200,
};

let settings: ClinicSettings = { ...defaults };
let listeners: (() => void)[] = [];

// Load from localStorage
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) settings = { ...defaults, ...JSON.parse(stored) };
} catch { /* parse error — use defaults */ }

const notify = () => {
  listeners.forEach(cb => cb());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

export const clinicSettingsStore = {
  get: () => settings,
  update: (partial: Partial<ClinicSettings>) => {
    settings = { ...settings, ...partial };
    notify();
  },
  subscribe: (cb: () => void) => {
    listeners.push(cb);
    return () => { listeners = listeners.filter(l => l !== cb); };
  },
};
