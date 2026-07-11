import { createStore } from './createStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InstallmentSettings {
  clinicId: string;
  enabled: boolean;
  maxInstallments: number;       // 2 | 3 | 6 | 9 | 12
  minAmount: number;             // minimum invoice amount eligible
  downPaymentPct: number;        // 0-100 (% of total as down payment)
  lateFeeRate: number;           // % penalty per overdue period
  reminderDaysBefore: number;    // days before due date to send reminder
  allowedMethods: string[];      // payment methods allowed for installments
}

export interface InstallmentPlan {
  id: string;
  clinicId: string;
  invoiceId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  totalAmount: number;
  downPayment: number;
  installmentCount: number;
  installmentAmount: number;     // per-installment amount
  status: 'active' | 'completed' | 'defaulted';
  createdAt: string;
  createdBy: string;
  notes?: string;
  isActive: boolean;
}

export interface Installment {
  id: string;
  planId: string;
  clinicId: string;
  patientId: string;
  invoiceId: string;
  number: number;                // 1, 2, 3...
  dueDate: string;               // YYYY-MM-DD
  amount: number;
  paidAmount: number;
  paidAt?: string;
  status: 'pending' | 'paid' | 'overdue' | 'partial';
  method?: string;
  receivedBy?: string;
  isActive: boolean;
}

// ─── Stores ──────────────────────────────────────────────────────────────────

export const installmentPlanStore = createStore<InstallmentPlan>([], 'cf_installment_plans');
export const installmentStore     = createStore<Installment>([],     'cf_installments');

// ─── Settings (simple key-value per clinic) ───────────────────────────────────

const SETTINGS_KEY = 'cf_installment_settings';

const DEFAULT_SETTINGS: Omit<InstallmentSettings, 'clinicId'> = {
  enabled: true,
  maxInstallments: 6,
  minAmount: 200,
  downPaymentPct: 20,
  lateFeeRate: 0,
  reminderDaysBefore: 3,
  allowedMethods: ['cash', 'card', 'bank_transfer'],
};

export function getInstallmentSettings(clinicId: string): InstallmentSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, InstallmentSettings>;
      if (all[clinicId]) return all[clinicId];
    }
  } catch { /* ignore */ }
  return { clinicId, ...DEFAULT_SETTINGS };
}

export function saveInstallmentSettings(settings: InstallmentSettings): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const all = raw ? JSON.parse(raw) as Record<string, InstallmentSettings> : {};
    all[settings.clinicId] = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

// ─── Plan Helpers ─────────────────────────────────────────────────────────────

function uid() {
  return `inst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

export interface CreatePlanInput {
  clinicId: string;
  invoiceId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  totalAmount: number;
  downPayment: number;
  installmentCount: number;
  createdBy: string;
  notes?: string;
}

export function createInstallmentPlan(input: CreatePlanInput): InstallmentPlan {
  const remaining = input.totalAmount - input.downPayment;
  const perInstallment = Math.ceil(remaining / input.installmentCount);

  const plan: InstallmentPlan = {
    id: uid(),
    clinicId: input.clinicId,
    invoiceId: input.invoiceId,
    patientId: input.patientId,
    patientName: input.patientName,
    patientPhone: input.patientPhone,
    totalAmount: input.totalAmount,
    downPayment: input.downPayment,
    installmentCount: input.installmentCount,
    installmentAmount: perInstallment,
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    notes: input.notes,
    isActive: true,
  };

  installmentPlanStore.add(plan);

  // Generate installment schedule (monthly)
  const today = new Date().toISOString().split('T')[0];
  for (let i = 1; i <= input.installmentCount; i++) {
    const isLast = i === input.installmentCount;
    // Last installment absorbs rounding difference
    const amt = isLast
      ? remaining - perInstallment * (input.installmentCount - 1)
      : perInstallment;

    const installment: Installment = {
      id: uid(),
      planId: plan.id,
      clinicId: input.clinicId,
      patientId: input.patientId,
      invoiceId: input.invoiceId,
      number: i,
      dueDate: addMonths(today, i),
      amount: Math.max(0, amt),
      paidAmount: 0,
      status: 'pending',
      isActive: true,
    };
    installmentStore.add(installment);
  }

  return plan;
}

export function recordInstallmentPayment(
  installmentId: string,
  amount: number,
  method: string,
  receivedBy: string
): void {
  const inst = installmentStore.get(i => i.id === installmentId);
  if (!inst) return;

  const newPaid = inst.paidAmount + amount;
  const newStatus: Installment['status'] =
    newPaid >= inst.amount ? 'paid' : 'partial';

  installmentStore.update(
    i => i.id === installmentId,
    {
      paidAmount: newPaid,
      status: newStatus,
      paidAt: newStatus === 'paid' ? new Date().toISOString() : inst.paidAt,
      method,
      receivedBy,
    }
  );

  // Check if all installments paid → mark plan complete
  const planId = inst.planId;
  const allInst = installmentStore.filter(i => i.planId === planId && i.isActive);
  const allPaid = allInst.every(i => {
    if (i.id === installmentId) return newStatus === 'paid';
    return i.status === 'paid';
  });

  if (allPaid) {
    installmentPlanStore.update(p => p.id === planId, { status: 'completed' });
  }
}

// Mark overdue installments (call on page load)
export function syncOverdueInstallments(): void {
  const today = new Date().toISOString().split('T')[0];
  installmentStore.filter(
    i => i.isActive && i.status === 'pending' && i.dueDate < today
  ).forEach(i => {
    installmentStore.update(inst => inst.id === i.id, { status: 'overdue' });
  });
}

export function getPlansForClinic(clinicId: string): InstallmentPlan[] {
  return installmentPlanStore.filter(p => p.clinicId === clinicId && p.isActive);
}

export function getInstallmentsForPlan(planId: string): Installment[] {
  return installmentStore.filter(i => i.planId === planId && i.isActive)
    .sort((a, b) => a.number - b.number);
}

export function getInstallmentsForClinic(clinicId: string): Installment[] {
  return installmentStore.filter(i => i.clinicId === clinicId && i.isActive);
}

export function getOverdueInstallments(clinicId: string): Installment[] {
  syncOverdueInstallments();
  return installmentStore.filter(
    i => i.clinicId === clinicId && i.isActive && i.status === 'overdue'
  );
}

export function getUpcomingInstallments(clinicId: string, withinDays = 3): Installment[] {
  const today = new Date();
  const cutoff = new Date(today.getTime() + withinDays * 86_400_000)
    .toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  return installmentStore.filter(
    i => i.clinicId === clinicId && i.isActive &&
      i.status === 'pending' &&
      i.dueDate >= todayStr && i.dueDate <= cutoff
  );
}
