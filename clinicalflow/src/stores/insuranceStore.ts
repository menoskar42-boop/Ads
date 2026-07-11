// ─── insuranceStore.ts ────────────────────────────────────────────────────────
// Insurance companies + patient insurance policies
// localStorage keys: cf_insurance_companies_v1, cf_patient_insurance_v1

export interface InsuranceCompany {
  id: string;
  clinicId: string;
  name: string;
  nameAr: string;
  contactPhone: string;
  coveragePercent: number; // default 80
  notes: string;
  isActive: boolean;
  createdAt: string;
}

export interface PatientInsurance {
  id: string;
  patientId: string;
  clinicId: string;
  insuranceCompanyId: string;
  policyNumber: string;
  coveragePercent: number; // can override company default
  expiryDate: string; // ISO date string YYYY-MM-DD
  isActive: boolean;
  createdAt: string;
}

// ─── Persistence helpers ──────────────────────────────────────────────────────
const COMPANIES_KEY = 'cf_insurance_companies_v1';
const POLICIES_KEY  = 'cf_patient_insurance_v1';

function loadCompanies(): InsuranceCompany[] {
  try {
    const raw = localStorage.getItem(COMPANIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveCompanies(data: InsuranceCompany[]): void {
  localStorage.setItem(COMPANIES_KEY, JSON.stringify(data));
}

function loadPolicies(): PatientInsurance[] {
  try {
    const raw = localStorage.getItem(POLICIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePolicies(data: PatientInsurance[]): void {
  localStorage.setItem(POLICIES_KEY, JSON.stringify(data));
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Insurance Company API ────────────────────────────────────────────────────
export function getClinicInsuranceCompanies(clinicId: string): InsuranceCompany[] {
  return loadCompanies().filter(c => c.clinicId === clinicId);
}

export function getInsuranceCompany(id: string): InsuranceCompany | undefined {
  return loadCompanies().find(c => c.id === id);
}

export function addInsuranceCompany(
  data: Omit<InsuranceCompany, 'id' | 'createdAt'>
): InsuranceCompany {
  const company: InsuranceCompany = {
    ...data,
    id: genId('ins'),
    createdAt: new Date().toISOString(),
  };
  const all = loadCompanies();
  all.push(company);
  saveCompanies(all);
  return company;
}

export function updateInsuranceCompany(id: string, data: Partial<InsuranceCompany>): void {
  const all = loadCompanies();
  const idx = all.findIndex(c => c.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...data };
    saveCompanies(all);
  }
}

export function deleteInsuranceCompany(id: string): void {
  saveCompanies(loadCompanies().filter(c => c.id !== id));
}

// ─── Patient Insurance API ────────────────────────────────────────────────────
export function getPatientInsurance(patientId: string, clinicId: string): PatientInsurance[] {
  return loadPolicies().filter(p => p.patientId === patientId && p.clinicId === clinicId);
}

export function getAllClinicPatientInsurance(clinicId: string): PatientInsurance[] {
  return loadPolicies().filter(p => p.clinicId === clinicId);
}

export function addPatientInsurance(
  data: Omit<PatientInsurance, 'id' | 'createdAt'>
): PatientInsurance {
  const policy: PatientInsurance = {
    ...data,
    id: genId('pol'),
    createdAt: new Date().toISOString(),
  };
  const all = loadPolicies();
  all.push(policy);
  savePolicies(all);
  return policy;
}

export function updatePatientInsurance(id: string, data: Partial<PatientInsurance>): void {
  const all = loadPolicies();
  const idx = all.findIndex(p => p.id === id);
  if (idx !== -1) {
    all[idx] = { ...all[idx], ...data };
    savePolicies(all);
  }
}

export function deletePatientInsurance(id: string): void {
  savePolicies(loadPolicies().filter(p => p.id !== id));
}

// ─── Contracts ───────────────────────────────────────────────────────────────
export interface InsuranceContract {
  id: string;
  clinicId: string;
  insuranceCompanyId: string;
  serviceName: string;
  serviceNameAr: string;
  agreedPrice: number;
  copayPct: number;   // % patient pays (e.g. 20 means patient pays 20%, insurer pays 80%)
  isActive: boolean;
  validFrom?: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
}

const CONTRACTS_KEY = 'cf_insurance_contracts_v1';

function loadContracts(): InsuranceContract[] {
  try { return JSON.parse(localStorage.getItem(CONTRACTS_KEY) || '[]'); } catch { return []; }
}
function saveContracts(data: InsuranceContract[]): void {
  localStorage.setItem(CONTRACTS_KEY, JSON.stringify(data));
}

export function getClinicContracts(clinicId: string): InsuranceContract[] {
  return loadContracts().filter(c => c.clinicId === clinicId && c.isActive);
}

export function getContractsForCompany(clinicId: string, insuranceCompanyId: string): InsuranceContract[] {
  return loadContracts().filter(c => c.clinicId === clinicId && c.insuranceCompanyId === insuranceCompanyId && c.isActive);
}

export function addContract(data: Omit<InsuranceContract, 'id' | 'createdAt' | 'updatedAt'>): InsuranceContract {
  const contract: InsuranceContract = {
    ...data,
    id: genId('ctr'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const all = loadContracts();
  all.push(contract);
  saveContracts(all);
  return contract;
}

export function updateContract(id: string, data: Partial<InsuranceContract>): void {
  saveContracts(loadContracts().map(c =>
    c.id === id ? { ...c, ...data, updatedAt: new Date().toISOString() } : c
  ));
}

export function deleteContract(id: string): void {
  saveContracts(loadContracts().map(c =>
    c.id === id ? { ...c, isActive: false, updatedAt: new Date().toISOString() } : c
  ));
}

// ─── Billing split ────────────────────────────────────────────────────────────
export interface BillingSplit {
  totalAmount: number;
  patientPays: number;    // copay
  insurancePays: number;  // remainder
  copayPct: number;
  contractId?: string;
}

/**
 * Calculate how to split a bill for an insured patient.
 * Looks up a matching contract first; falls back to company default_copay_pct.
 */
export function calculateBillingSplit(
  clinicId: string,
  insuranceCompanyId: string,
  serviceName: string,
  totalAmount: number,
): BillingSplit {
  const contracts = getContractsForCompany(clinicId, insuranceCompanyId);
  const match = contracts.find(c =>
    c.serviceName.toLowerCase().includes(serviceName.toLowerCase()) ||
    serviceName.toLowerCase().includes(c.serviceName.toLowerCase())
  );

  const company = getInsuranceCompany(insuranceCompanyId);
  const copayPct = match?.copayPct ?? (100 - (company?.coveragePercent ?? 80));
  const patientPays = Math.round((totalAmount * copayPct) / 100 * 100) / 100;

  return {
    totalAmount,
    patientPays,
    insurancePays: Math.round((totalAmount - patientPays) * 100) / 100,
    copayPct,
    contractId: match?.id,
  };
}

// ─── Claims ───────────────────────────────────────────────────────────────────
export type ClaimStatus = 'pending' | 'sent' | 'paid' | 'rejected';

export interface InsuranceClaim {
  id: string;
  clinicId: string;
  insuranceCompanyId: string;
  invoiceId?: string;
  patientId?: string;
  serviceName: string;
  totalAmount: number;
  insuranceAmount: number;
  copayAmount: number;
  status: ClaimStatus;
  submittedAt?: string;
  paidAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const CLAIMS_KEY = 'cf_insurance_claims_v1';

function loadClaims(): InsuranceClaim[] {
  try { return JSON.parse(localStorage.getItem(CLAIMS_KEY) || '[]'); } catch { return []; }
}
function saveClaims(data: InsuranceClaim[]): void {
  localStorage.setItem(CLAIMS_KEY, JSON.stringify(data));
}

export function getClinicClaims(clinicId: string): InsuranceClaim[] {
  return loadClaims()
    .filter(c => c.clinicId === clinicId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getClaimsForCompany(clinicId: string, insuranceCompanyId: string): InsuranceClaim[] {
  return loadClaims()
    .filter(c => c.clinicId === clinicId && c.insuranceCompanyId === insuranceCompanyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createClaim(data: Omit<InsuranceClaim, 'id' | 'createdAt' | 'updatedAt'>): InsuranceClaim {
  const existing = loadClaims();
  if (data.invoiceId && existing.some(c => c.invoiceId === data.invoiceId)) {
    return existing.find(c => c.invoiceId === data.invoiceId)!;
  }
  const claim: InsuranceClaim = {
    ...data,
    id: genId('clm'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  existing.push(claim);
  saveClaims(existing);
  return claim;
}

export function updateClaimStatus(
  claimId: string,
  status: ClaimStatus,
  extra?: { rejectionReason?: string; paidAt?: string },
): void {
  saveClaims(loadClaims().map(c => {
    if (c.id !== claimId) return c;
    return {
      ...c,
      status,
      submittedAt: status === 'sent' ? new Date().toISOString() : c.submittedAt,
      paidAt: status === 'paid' ? (extra?.paidAt ?? new Date().toISOString()) : c.paidAt,
      rejectionReason: extra?.rejectionReason ?? c.rejectionReason,
      updatedAt: new Date().toISOString(),
    };
  }));
}

export function getClaimsSummary(clinicId: string): {
  pending: number; sent: number; paid: number; rejected: number;
  totalPending: number; totalPaid: number;
} {
  const claims = getClinicClaims(clinicId);
  return {
    pending:      claims.filter(c => c.status === 'pending').length,
    sent:         claims.filter(c => c.status === 'sent').length,
    paid:         claims.filter(c => c.status === 'paid').length,
    rejected:     claims.filter(c => c.status === 'rejected').length,
    totalPending: claims.filter(c => c.status !== 'paid').reduce((s, c) => s + c.insuranceAmount, 0),
    totalPaid:    claims.filter(c => c.status === 'paid').reduce((s, c) => s + c.insuranceAmount, 0),
  };
}

// ─── Seed demo data (runs once) ───────────────────────────────────────────────
const SEED_KEY = 'cf_insurance_seeded_v1';

function seedDemoData() {
  if (localStorage.getItem(SEED_KEY)) return;

  const existingCompanies = loadCompanies();
  const seeds: InsuranceCompany[] = [
    {
      id: 'ins-seed-1',
      clinicId: 'clinic-1',
      name: 'Misr Insurance',
      nameAr: 'التأمين المصري',
      contactPhone: '19961',
      coveragePercent: 80,
      notes: '',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ins-seed-2',
      clinicId: 'clinic-1',
      name: 'AXA Egypt',
      nameAr: 'أكسا مصر',
      contactPhone: '19229',
      coveragePercent: 75,
      notes: '',
      isActive: true,
      createdAt: new Date().toISOString(),
    },
  ];

  const merged = [
    ...existingCompanies,
    ...seeds.filter(s => !existingCompanies.some(e => e.id === s.id)),
  ];
  saveCompanies(merged);
  // Seed demo contracts
  const contractSeeds: InsuranceContract[] = [
    { id: 'ctr-seed-1', clinicId: 'clinic-1', insuranceCompanyId: 'ins-seed-1', serviceName: 'Consultation', serviceNameAr: 'كشف', agreedPrice: 200, copayPct: 20, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'ctr-seed-2', clinicId: 'clinic-1', insuranceCompanyId: 'ins-seed-1', serviceName: 'Extraction', serviceNameAr: 'خلع', agreedPrice: 300, copayPct: 20, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'ctr-seed-3', clinicId: 'clinic-1', insuranceCompanyId: 'ins-seed-2', serviceName: 'Consultation', serviceNameAr: 'كشف', agreedPrice: 200, copayPct: 25, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  ];
  const existingContracts = loadContracts();
  saveContracts([...existingContracts, ...contractSeeds.filter(s => !existingContracts.some(e => e.id === s.id))]);

  localStorage.setItem(SEED_KEY, '1');
}

seedDemoData();
