// doctorEarningsStore.ts — doctor commission tracking (STEP 5)
const KEY = 'cf_doctor_earnings_v1';

export type CommissionType = 'percentage' | 'fixed';
export type EarningStatus = 'pending' | 'paid' | 'cancelled';

export interface DoctorEarning {
  id: string;
  clinicId: string;
  doctorId: string;
  appointmentId?: string;
  invoiceId: string;
  baseAmount: number;      // invoice item totals for this doctor
  commissionType: CommissionType;
  commissionValue: number; // % or EGP fixed
  earnedAmount: number;    // computed payout
  status: EarningStatus;
  createdAt: string;
}

function load(): DoctorEarning[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function persist(items: DoctorEarning[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full */ }
}
function genId() { return `de-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

/**
 * Record doctor earnings when an invoice is paid.
 * commissionType/Value comes from the doctor's profile (default: percentage 50%).
 * Idempotent — skips if earning for this invoiceId already exists.
 */
export function recordDoctorEarning(params: {
  clinicId: string;
  doctorId: string;
  invoiceId: string;
  appointmentId?: string;
  baseAmount: number;          // sum of doctorShare across all invoice items
  commissionType?: CommissionType;
  commissionValue?: number;
}): DoctorEarning | null {
  const items = load();
  if (items.some(e => e.invoiceId === params.invoiceId)) return null; // idempotent

  const commissionType  = params.commissionType  ?? 'percentage';
  const commissionValue = params.commissionValue ?? 100; // 100% of doctorShare by default
  const earnedAmount =
    commissionType === 'percentage'
      ? params.baseAmount * (commissionValue / 100)
      : Math.min(commissionValue, params.baseAmount);

  const earning: DoctorEarning = {
    id: genId(),
    clinicId: params.clinicId,
    doctorId: params.doctorId,
    invoiceId: params.invoiceId,
    appointmentId: params.appointmentId,
    baseAmount: params.baseAmount,
    commissionType,
    commissionValue,
    earnedAmount,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  items.push(earning);
  persist(items);
  return earning;
}

export function markEarningPaid(id: string): boolean {
  const items = load();
  const idx = items.findIndex(e => e.id === id);
  if (idx === -1) return false;
  items[idx].status = 'paid';
  persist(items);
  return true;
}

export function getDoctorEarnings(doctorId: string, clinicId?: string): DoctorEarning[] {
  return load()
    .filter(e => e.doctorId === doctorId && (!clinicId || e.clinicId === clinicId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getClinicEarnings(clinicId: string): DoctorEarning[] {
  return load().filter(e => e.clinicId === clinicId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getDoctorEarningsSummary(clinicId: string): Array<{ doctorId: string; total: number; pending: number }> {
  const map: Record<string, { total: number; pending: number }> = {};
  load().filter(e => e.clinicId === clinicId).forEach(e => {
    if (!map[e.doctorId]) map[e.doctorId] = { total: 0, pending: 0 };
    map[e.doctorId].total += e.earnedAmount;
    if (e.status === 'pending') map[e.doctorId].pending += e.earnedAmount;
  });
  return Object.entries(map)
    .map(([doctorId, v]) => ({ doctorId, ...v }))
    .sort((a, b) => b.total - a.total);
}
