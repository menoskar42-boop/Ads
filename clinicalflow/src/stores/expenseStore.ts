import { createStore } from './createStore';
import { createTransaction } from './transactionStore';

export type ExpenseCategory = 'rent' | 'utilities' | 'salaries' | 'supplies' | 'maintenance' | 'marketing' | 'other';

export interface Expense {
  id: string;
  clinicId: string;
  category: ExpenseCategory;
  categoryAr: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'check';
  addedBy: string;
  createdAt: string;
}

export const expenseStore = createStore<Expense>([], 'cf_expenses');

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, { en: string; ar: string }> = {
  rent:        { en: 'Rent',             ar: 'إيجار' },
  utilities:   { en: 'Utilities',        ar: 'مرافق' },
  salaries:    { en: 'Salaries',         ar: 'رواتب' },
  supplies:    { en: 'Medical Supplies', ar: 'مستلزمات طبية' },
  maintenance: { en: 'Maintenance',      ar: 'صيانة' },
  marketing:   { en: 'Marketing',        ar: 'تسويق' },
  other:       { en: 'Other',            ar: 'أخرى' },
};

/** STEP 3 — add expense and mirror it as a transaction in the ledger */
export function addExpense(expense: Omit<Expense, 'id' | 'createdAt'>): Expense {
  const item: Expense = {
    ...expense,
    id: `exp-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  expenseStore.add(item);
  createTransaction({
    clinicId: expense.clinicId,
    type: 'expense',
    category: expense.category as any,
    amount: expense.amount,
    paymentMethod: expense.paymentMethod as any,
    referenceId: item.id,
    description: expense.description || EXPENSE_CATEGORY_LABELS[expense.category]?.en,
    descriptionAr: expense.categoryAr || EXPENSE_CATEGORY_LABELS[expense.category]?.ar,
    createdBy: expense.addedBy,
  });
  return item;
}

export const EXPENSE_COLORS: Record<ExpenseCategory, string> = {
  rent:        '#6366f1',
  utilities:   '#06b6d4',
  salaries:    '#f59e0b',
  supplies:    '#22c55e',
  maintenance: '#f97316',
  marketing:   '#a855f7',
  other:       '#94a3b8',
};
