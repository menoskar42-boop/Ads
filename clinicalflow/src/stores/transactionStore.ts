// transactionStore.ts — unified financial ledger (STEP 2 + 4)
import { recordToSession } from './cashboxStore';

const KEY = 'cf_transactions_v1';

export type TransactionType = 'income' | 'expense';
export type TransactionCategory =
  | 'visit' | 'procedure' | 'lab' | 'radiology'   // income
  | 'salary' | 'rent' | 'utilities' | 'supplies' | 'maintenance' | 'marketing' | 'other'; // expense

export type TxPaymentMethod = 'cash' | 'card' | 'insurance' | 'bank_transfer' | 'check';

export interface ClinicTransaction {
  id: string;
  clinicId: string;
  type: TransactionType;
  category: TransactionCategory;
  amount: number;
  paymentMethod?: TxPaymentMethod;
  referenceId?: string;   // invoiceId, paymentId, or expenseId
  description: string;
  descriptionAr: string;
  createdBy?: string;
  createdAt: string;
}

function load(): ClinicTransaction[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function persist(items: ClinicTransaction[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full */ }
}
function genId() { return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

export function createTransaction(
  t: Omit<ClinicTransaction, 'id' | 'createdAt'>,
): ClinicTransaction {
  const tx: ClinicTransaction = { ...t, id: genId(), createdAt: new Date().toISOString() };
  const items = load();
  // idempotent: skip if same referenceId + type already recorded
  if (t.referenceId && items.some(i => i.referenceId === t.referenceId && i.type === t.type)) return tx;
  items.push(tx);
  persist(items);
  // STEP 4 — mirror to active cashbox session
  recordToSession(t.clinicId, t.type, t.amount);
  return tx;
}

export function getTransactions(clinicId: string): ClinicTransaction[] {
  return load().filter(t => t.clinicId === clinicId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getTransactionsByDateRange(
  clinicId: string,
  from: string,  // YYYY-MM-DD
  to: string,
): ClinicTransaction[] {
  return getTransactions(clinicId).filter(t => {
    const d = t.createdAt.slice(0, 10);
    return d >= from && d <= to;
  });
}

export function getDailyTotals(clinicId: string, date: string): { income: number; expense: number; net: number } {
  const txs = getTransactionsByDateRange(clinicId, date, date);
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense, net: income - expense };
}

export function getMonthlyTotals(clinicId: string, yearMonth: string): { income: number; expense: number; net: number } {
  const txs = getTransactions(clinicId).filter(t => t.createdAt.slice(0, 7) === yearMonth);
  const income  = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense, net: income - expense };
}

/** Last N days — returns array of { date, income, expense, net } */
export function getWeeklyBreakdown(clinicId: string, days = 7): Array<{ date: string; income: number; expense: number; net: number }> {
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    result.push({ date, ...getDailyTotals(clinicId, date) });
  }
  return result;
}

export function getCategoryBreakdown(
  clinicId: string,
  type: TransactionType,
  yearMonth?: string,
): Array<{ category: string; total: number }> {
  let txs = getTransactions(clinicId).filter(t => t.type === type);
  if (yearMonth) txs = txs.filter(t => t.createdAt.slice(0, 7) === yearMonth);
  const map: Record<string, number> = {};
  txs.forEach(t => { map[t.category] = (map[t.category] ?? 0) + t.amount; });
  return Object.entries(map).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
}
