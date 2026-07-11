import { createStore } from './createStore';

export interface EmployeeContract {
  id: string;
  userId: string;
  clinicId: string;
  baseSalary: number;
  startDate: string;
  jobTitle: string;
  jobTitleAr: string;
  contractFileUrl?: string;
  workingHoursPerDay: number;
  annualLeaveDays: number;
  isActive: boolean;
  createdAt: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  clinicId: string;
  type: 'annual' | 'sick' | 'emergency' | 'unpaid';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewNote?: string;
  requestedAt: string;
  reviewedAt?: string;
}

export interface PayrollRecord {
  id: string;
  userId: string;
  clinicId: string;
  period: string;
  baseSalary: number;
  bonuses: number;
  cashPaidBonuses: number;
  deductions: number;
  advances: number;
  netSalary: number;
  status: 'draft' | 'approved' | 'paid';
  paymentMethod?: 'cash' | 'bank_transfer';
  notes?: string;
  createdAt: string;
  approvedAt?: string;
}

export interface CashAdvance {
  id: string;
  userId: string;
  clinicId: string;
  amount: number;
  reason: string;
  date: string;
  deductedInPeriod?: string;
  status: 'pending' | 'approved' | 'deducted';
}

export const contractStore    = createStore<EmployeeContract>([], 'cf_contracts');
export const leaveRequestStore = createStore<LeaveRequest>([], 'cf_leave_requests');
export const payrollStore      = createStore<PayrollRecord>([], 'cf_payroll');
export const cashAdvanceStore  = createStore<CashAdvance>([], 'cf_advances');

export function calcNetSalary(base: number, bonuses: number, cashPaid: number, deductions: number, advances: number): number {
  return base + bonuses - cashPaid - deductions - advances;
}

export function getUsedLeaveDays(userId: string, year: number): number {
  return leaveRequestStore.getAll()
    .filter(l => l.userId === userId && l.status === 'approved' && l.startDate.startsWith(String(year)))
    .reduce((sum, l) => {
      const days = Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1;
      return sum + days;
    }, 0);
}
