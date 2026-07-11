import { createStore } from './createStore';

export type PlanStatus = 'active' | 'completed' | 'defaulted' | 'cancelled';

export interface Installment {
  id: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  isPaid: boolean;
  paidAt?: string;
}

export interface PaymentPlan {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  invoiceId: string;
  totalAmount: number;
  paidAmount: number;
  installments: Installment[];
  status: PlanStatus;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const paymentPlanStore = createStore<PaymentPlan>([], 'cf_payment_plans');
