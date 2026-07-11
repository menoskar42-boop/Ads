import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useUsers } from '@/hooks/useUsers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
} from 'recharts';
import {
  DollarSign, TrendingUp, TrendingDown, Wallet,
  CheckCircle2, Clock, Plus, Lock, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getToken } from '@/utils/authToken';
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from '@/stores/expenseStore';

const API = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

interface DailyData {
  date: string;
  income: number;
  expense: number;
  net: number;
  incomeByCategory?: Record<string, number>;
  expenseByCategory?: Record<string, number>;
  cashboxSession?: any;
}

interface MonthlyData {
  month: string;
  income: number;
  expense: number;
  net: number;
  doctorPayout?: number;
  profitMargin?: string;
  expenseByCategory?: Record<string, number>;
  daily?: { date: string; income: number; expense: number }[];
}

interface CashboxSession {
  id: string;
  userId: string;
  userName?: string;
  startAmount: number;
  endAmount?: number;
  totalIncome: number;
  totalExpense: number;
  difference?: number;
  openedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
}

interface DoctorEarning {
  id: string;
  doctorId: string;
  doctorName?: string;
  earnedAmount: number;
  status: 'pending' | 'paid';
  createdAt: string;
}

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  description?: string;
  descriptionAr?: string;
  createdAt: string;
}

function normaliseCashbox(s: any): CashboxSession {
  return {
    id: s.id,
    userId: s.user_id,
    userName: s.user_name ?? s.user_id,
    startAmount: Number(s.start_amount ?? 0),
    endAmount: s.end_amount != null ? Number(s.end_amount) : undefined,
    totalIncome: Number(s.total_income ?? 0),
    totalExpense: Number(s.total_expense ?? 0),
    difference: s.difference != null ? Number(s.difference) : undefined,
    openedAt: s.opened_at,
    closedAt: s.closed_at,
    status: s.status ?? 'open',
  };
}

function normaliseEarning(e: any): DoctorEarning {
  return {
    id: e.id,
    doctorId: e.doctor_id,
    doctorName: e.doctor_name,
    earnedAmount: Number(e.earned_amount ?? 0),
    status: e.status ?? 'pending',
    createdAt: e.created_at,
  };
}

function normaliseTx(t: any): Transaction {
  return {
    id: t.id,
    type: t.type,
    category: t.category,
    amount: Number(t.amount ?? 0),
    description: t.description,
    descriptionAr: t.description_ar,
    createdAt: t.created_at,
  };
}

const ZERO_DAILY: DailyData = { date: '', income: 0, expense: 0, net: 0 };
const ZERO_MONTHLY: MonthlyData = { month: '', income: 0, expense: 0, net: 0, daily: [] };

const FinanceDashboard: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const { doctors } = useUsers();
  const isAr = language === 'ar';
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const token = getToken();

  const [activeTab, setActiveTab] = useState(() => user?.role === 'reception' ? 'cashbox' : 'overview');
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);

  // Remote data
  const [dailyData, setDailyData] = useState<DailyData>(ZERO_DAILY);
  const [monthlyData, setMonthlyData] = useState<MonthlyData>(ZERO_MONTHLY);
  const [cashboxSessions, setCashboxSessions] = useState<CashboxSession[]>([]);
  const [doctorEarnings, setDoctorEarnings] = useState<DoctorEarning[]>([]);
  const [recentTxs, setRecentTxs] = useState<Transaction[]>([]);
  const [loadingFinance, setLoadingFinance] = useState(false);

  const openSession = cashboxSessions.find(s => s.status === 'open') ?? null;

  // Cashbox form
  const [startAmount, setStartAmount] = useState('0');
  const [endAmount, setEndAmount] = useState('');
  const [cashboxBusy, setCashboxBusy] = useState(false);

  // Expense form
  const [expForm, setExpForm] = useState({
    category: 'rent' as ExpenseCategory,
    description: '', amount: '', paymentMethod: 'cash' as 'cash' | 'bank_transfer' | 'check',
    date: today,
  });
  const [expBusy, setExpBusy] = useState(false);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoadingFinance(true);
    try {
      const [daily, monthly, cashbox, earnings, txs] = await Promise.allSettled([
        apiFetch<DailyData>(`/finance/daily?date=${today}`),
        apiFetch<MonthlyData>(`/finance/monthly?month=${selectedMonth}`),
        apiFetch<any[]>('/finance/cashbox'),
        apiFetch<any[]>('/finance/doctor-earnings'),
        apiFetch<any[]>(`/finance/transactions?month=${selectedMonth}`),
      ]);
      if (daily.status === 'fulfilled')    setDailyData(daily.value);
      if (monthly.status === 'fulfilled')  setMonthlyData(monthly.value);
      if (cashbox.status === 'fulfilled')  setCashboxSessions((cashbox.value ?? []).map(normaliseCashbox));
      if (earnings.status === 'fulfilled') setDoctorEarnings((earnings.value ?? []).map(normaliseEarning));
      if (txs.status === 'fulfilled')      setRecentTxs((txs.value ?? []).map(normaliseTx));
    } finally {
      setLoadingFinance(false);
    }
  }, [token, today, selectedMonth]);

  useEffect(() => { loadAll(); }, [selectedMonth]);

  // ── Cashbox handlers ──
  const handleOpenShift = async () => {
    if (!token) { toast.error(isAr ? 'يجب تسجيل الدخول' : 'Login required'); return; }
    setCashboxBusy(true);
    try {
      const session = await apiFetch<any>('/finance/cashbox/open', {
        method: 'POST',
        body: JSON.stringify({ startAmount: parseFloat(startAmount) || 0 }),
      });
      setCashboxSessions(prev => [normaliseCashbox(session), ...prev]);
      toast.success(isAr ? 'تم فتح الوردية' : 'Shift opened');
    } catch (e: any) {
      if (e.message === 'shift_already_open') {
        toast.error(isAr ? 'يوجد وردية مفتوحة بالفعل' : 'A shift is already open');
      } else {
        toast.error(e.message);
      }
    } finally {
      setCashboxBusy(false);
    }
  };

  const handleCloseShift = async () => {
    const amt = parseFloat(endAmount);
    if (isNaN(amt)) { toast.error(isAr ? 'أدخل المبلغ الختامي' : 'Enter closing amount'); return; }
    if (!token) { toast.error(isAr ? 'يجب تسجيل الدخول' : 'Login required'); return; }
    setCashboxBusy(true);
    try {
      const closed = await apiFetch<any>('/finance/cashbox/close', {
        method: 'POST',
        body: JSON.stringify({ endAmount: amt }),
      });
      setCashboxSessions(prev => prev.map(s => s.status === 'open' ? normaliseCashbox(closed) : s));
      setEndAmount('');
      const diff = Number(closed.difference ?? 0);
      if (Math.abs(diff) < 1) toast.success(isAr ? 'تم إغلاق الوردية — الأرقام متطابقة' : 'Shift closed — amounts match');
      else toast.warning(isAr ? `فارق: ${diff.toFixed(2)} ج.م` : `Shift closed — difference: ${diff.toFixed(2)} EGP`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCashboxBusy(false);
    }
  };

  // ── Expense handler ──
  const handleAddExpense = async () => {
    if (!expForm.amount || parseFloat(expForm.amount) <= 0) {
      toast.error(isAr ? 'أدخل مبلغاً صحيحاً' : 'Enter a valid amount'); return;
    }
    if (!token) { toast.error(isAr ? 'يجب تسجيل الدخول' : 'Login required'); return; }
    setExpBusy(true);
    try {
      await apiFetch('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: expForm.category,
          categoryAr: EXPENSE_CATEGORY_LABELS[expForm.category]?.ar,
          description: expForm.description || EXPENSE_CATEGORY_LABELS[expForm.category]?.en,
          amount: parseFloat(expForm.amount),
          paymentMethod: expForm.paymentMethod,
          date: expForm.date,
        }),
      });
      toast.success(isAr ? 'تم إضافة المصروف' : 'Expense added');
      setExpForm(f => ({ ...f, description: '', amount: '' }));
      await loadAll();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExpBusy(false);
    }
  };

  const handleMarkPaid = async (earningId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/finance/doctor-earnings/${earningId}/pay`, { method: 'PATCH' });
      setDoctorEarnings(prev => prev.map(e => e.id === earningId ? { ...e, status: 'paid' } : e));
      toast.success(isAr ? 'تم تسجيل الدفع' : 'Payment recorded');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── KPI card helper ──
  const KpiCard = ({ label, labelAr, value, sub, icon: Icon, color }: any) => (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{isAr ? labelAr : label}</p>
          <p className="text-xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const isReception = user?.role === 'reception';

  if (!permissions.canViewFinancialReports && !isReception) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
        <Lock className="h-12 w-12 opacity-30" />
        <p className="text-sm">{isAr ? 'لا تملك صلاحية عرض التقارير المالية' : 'No permission to view financial reports'}</p>
      </div>
    );
  }

  const fmt = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${isAr ? 'ج.م' : 'EGP'}`;

  // Build weekly chart from monthly daily data (last 7 days)
  const weeklyData = (monthlyData.daily ?? []).slice(-7);

  // Build expense breakdown from monthly data
  const expenseBreakdown = Object.entries(monthlyData.expenseByCategory ?? {}).map(([category, total]) => ({
    category,
    total: Number(total),
  }));

  // Doctor earnings grouped by doctor
  const earningsSummary = doctors.map(doc => {
    const docEarnings = doctorEarnings.filter(e => e.doctorId === doc.id);
    const pending = docEarnings.filter(e => e.status === 'pending').reduce((s, e) => s + e.earnedAmount, 0);
    const paid    = docEarnings.filter(e => e.status === 'paid').reduce((s, e) => s + e.earnedAmount, 0);
    return { doctorId: doc.id, doctorName: isAr ? doc.nameAr : doc.name, pending, paid, total: pending + paid };
  }).filter(d => d.total > 0);

  const sessionHistory = cashboxSessions.slice(0, 10);

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">{isAr ? 'لوحة المالية والمحاسبة' : 'Finance & Accounting'}</h1>
          <p className="text-muted-foreground text-sm">{isAr ? 'تتبع كل النشاط المالي للعيادة' : 'Track all clinic financial activity'}</p>
        </div>
        <div className="flex items-center gap-2">
          {loadingFinance && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {openSession ? (
            <Badge className="gap-1 bg-green-600 text-white px-3 py-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isAr ? `وردية مفتوحة` : `Shift open`}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 px-3 py-1.5">
              <Clock className="h-3.5 w-3.5" />
              {isAr ? 'لا توجد وردية مفتوحة' : 'No open shift'}
            </Badge>
          )}
        </div>
      </div>

      {/* Today KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Today Income"  labelAr="دخل اليوم"    value={fmt(dailyData.income)}   icon={TrendingUp}  color="bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" />
        <KpiCard label="Today Expense" labelAr="مصاريف اليوم" value={fmt(dailyData.expense)}  icon={TrendingDown} color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" />
        <KpiCard label="Net Today"     labelAr="صافي اليوم"   value={fmt(dailyData.net)}
          icon={Wallet} color="bg-primary/10 text-primary"
          sub={dailyData.net >= 0 ? (isAr ? 'ربح' : 'Profit') : (isAr ? 'خسارة' : 'Loss')} />
        <KpiCard label="Month Net"     labelAr="صافي الشهر"   value={fmt(monthlyData.net)}
          icon={DollarSign} color="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
          sub={`${isAr ? 'دخل' : 'Income'}: ${fmt(monthlyData.income)}`} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          {isAdmin && <TabsTrigger value="overview">{isAr ? 'نظرة عامة' : 'Overview'}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="expenses">{isAr ? 'المصاريف' : 'Expenses'}</TabsTrigger>}
          <TabsTrigger value="cashbox">{isAr ? 'الكاشير / الوردية' : 'Cashbox / Shift'}</TabsTrigger>
          {isAdmin && <TabsTrigger value="commissions">{isAr ? 'عمولات الأطباء' : 'Doctor Commissions'}</TabsTrigger>}
          {isAdmin && <TabsTrigger value="ledger">{isAr ? 'سجل الحركات' : 'Ledger'}</TabsTrigger>}
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground shrink-0">{isAr ? 'الشهر:' : 'Month:'}</label>
            <Input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="w-44" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isAr ? 'آخر 7 أيام' : 'Last 7 Days'}</CardTitle>
            </CardHeader>
            <CardContent>
              {weeklyData.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-10">
                  {loadingFinance ? (isAr ? 'جاري التحميل...' : 'Loading...') : (isAr ? 'لا توجد بيانات' : 'No data')}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={weeklyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [`${v} EGP`]} />
                    <Bar dataKey="income"  fill="#22c55e" name={isAr ? 'دخل' : 'Income'} radius={[4,4,0,0]} />
                    <Bar dataKey="expense" fill="#ef4444" name={isAr ? 'مصاريف' : 'Expense'} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{isAr ? 'تفاصيل الشهر' : 'Month Summary'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: isAr ? 'إجمالي الدخل' : 'Total Income',     value: monthlyData.income,  color: 'text-green-600' },
                  { label: isAr ? 'إجمالي المصاريف' : 'Total Expenses', value: monthlyData.expense, color: 'text-red-500' },
                  { label: isAr ? 'صافي الربح' : 'Net Profit',          value: monthlyData.net,     color: monthlyData.net >= 0 ? 'text-blue-600' : 'text-destructive' },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0">
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className={`font-semibold ${row.color}`}>{fmt(row.value)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">{isAr ? 'المصاريف حسب الفئة' : 'Expenses by Category'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {expenseBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
                ) : expenseBreakdown.map(row => (
                  <div key={row.category} className="flex justify-between items-center py-1">
                    <span className="text-sm">{isAr ? EXPENSE_CATEGORY_LABELS[row.category as ExpenseCategory]?.ar : EXPENSE_CATEGORY_LABELS[row.category as ExpenseCategory]?.en ?? row.category}</span>
                    <span className="text-sm font-semibold text-red-500">{fmt(row.total)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Expenses ── */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="h-4 w-4" />{isAr ? 'إضافة مصروف جديد' : 'Add New Expense'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'الفئة' : 'Category'}</label>
                  <Select value={expForm.category} onValueChange={v => setExpForm(f => ({ ...f, category: v as ExpenseCategory }))}>
                    <SelectTrigger data-testid="select-expense-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{isAr ? v.ar : v.en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'طريقة الدفع' : 'Payment Method'}</label>
                  <Select value={expForm.paymentMethod} onValueChange={v => setExpForm(f => ({ ...f, paymentMethod: v as any }))}>
                    <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{isAr ? 'نقداً' : 'Cash'}</SelectItem>
                      <SelectItem value="bank_transfer">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</SelectItem>
                      <SelectItem value="check">{isAr ? 'شيك' : 'Check'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'المبلغ (ج.م)' : 'Amount (EGP)'}</label>
                  <Input data-testid="input-expense-amount" type="number" min="0" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} dir="ltr" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'التاريخ' : 'Date'}</label>
                  <Input type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{isAr ? 'الوصف (اختياري)' : 'Description (optional)'}</label>
                <Input data-testid="input-expense-description" value={expForm.description} onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <Button data-testid="button-add-expense" onClick={handleAddExpense} disabled={expBusy} className="w-full gap-1.5">
                {expBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {isAr ? 'إضافة المصروف' : 'Add Expense'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isAr ? 'آخر المصاريف' : 'Recent Expenses'}</CardTitle>
            </CardHeader>
            <CardContent>
              {recentTxs.filter(t => t.type === 'expense').length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-6">{isAr ? 'لا توجد مصاريف بعد' : 'No expenses yet'}</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{isAr ? 'الفئة' : 'Category'}</TableHead>
                    <TableHead>{isAr ? 'الوصف' : 'Description'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'المبلغ' : 'Amount'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'التاريخ' : 'Date'}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {recentTxs.filter(t => t.type === 'expense').slice(0, 15).map(tx => (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs">{isAr ? EXPENSE_CATEGORY_LABELS[tx.category as ExpenseCategory]?.ar : EXPENSE_CATEGORY_LABELS[tx.category as ExpenseCategory]?.en ?? tx.category}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{isAr ? tx.descriptionAr : tx.description}</TableCell>
                        <TableCell className="text-end text-red-500 font-semibold text-sm">{fmt(tx.amount)}</TableCell>
                        <TableCell className="text-end text-xs text-muted-foreground">{tx.createdAt.slice(0, 10)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Cashbox / Shift ── */}
        <TabsContent value="cashbox" className="space-y-4 mt-4">
          {!openSession ? (
            <Card className="border-green-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{isAr ? 'فتح وردية جديدة' : 'Open New Shift'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'مبلغ الافتتاح (ج.م)' : 'Opening Amount (EGP)'}</label>
                  <Input data-testid="input-start-amount" type="number" min="0" value={startAmount} onChange={e => setStartAmount(e.target.value)} dir="ltr" />
                </div>
                <Button data-testid="button-open-shift" onClick={handleOpenShift} disabled={cashboxBusy} className="w-full gap-1.5 bg-green-600 hover:bg-green-700">
                  {cashboxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {isAr ? 'فتح الوردية' : 'Open Shift'}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  {isAr ? 'وردية مفتوحة' : 'Active Shift'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2 rounded-lg bg-white dark:bg-background border">
                    <p className="text-xs text-muted-foreground">{isAr ? 'رصيد افتتاح' : 'Opening'}</p>
                    <p className="font-bold text-sm">{fmt(openSession.startAmount)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-green-50 border border-green-200">
                    <p className="text-xs text-muted-foreground">{isAr ? 'دخل الوردية' : 'Income'}</p>
                    <p className="font-bold text-sm text-green-600">{fmt(openSession.totalIncome)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-xs text-muted-foreground">{isAr ? 'مصاريف الوردية' : 'Expenses'}</p>
                    <p className="font-bold text-sm text-red-600">{fmt(openSession.totalExpense)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {isAr ? 'الرصيد المتوقع:' : 'Expected balance:'}{' '}
                  <strong>{fmt(openSession.startAmount + openSession.totalIncome - openSession.totalExpense)}</strong>
                </p>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'المبلغ الفعلي عند الإغلاق (ج.م)' : 'Actual closing amount (EGP)'}</label>
                  <Input data-testid="input-end-amount" type="number" min="0" value={endAmount} onChange={e => setEndAmount(e.target.value)} dir="ltr" />
                </div>
                <Button data-testid="button-close-shift" onClick={handleCloseShift} disabled={cashboxBusy} variant="destructive" className="w-full gap-1.5">
                  {cashboxBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isAr ? 'إغلاق الوردية' : 'Close Shift'}
                </Button>
              </CardContent>
            </Card>
          )}

          {sessionHistory.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{isAr ? 'سجل الورديات' : 'Session History'}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{isAr ? 'الافتتاح' : 'Opened'}</TableHead>
                    <TableHead>{isAr ? 'الإغلاق' : 'Closed'}</TableHead>
                    <TableHead className="text-center">{isAr ? 'الفارق' : 'Diff'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'الحالة' : 'Status'}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {sessionHistory.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs">{new Date(s.openedAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.closedAt ? new Date(s.closedAt).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</TableCell>
                        <TableCell className="text-center text-xs">
                          {s.difference != null ? (
                            <span className={Math.abs(s.difference) < 1 ? 'text-green-600' : 'text-red-500'}>
                              {s.difference >= 0 ? '+' : ''}{s.difference.toFixed(2)}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-end">
                          <Badge className={s.status === 'open' ? 'bg-green-600 text-white text-xs' : 'bg-muted text-muted-foreground text-xs'}>
                            {s.status === 'open' ? (isAr ? 'مفتوحة' : 'Open') : (isAr ? 'مغلقة' : 'Closed')}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Doctor Commissions ── */}
        <TabsContent value="commissions" className="space-y-4 mt-4">
          {earningsSummary.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{isAr ? 'لا توجد عمولات مسجلة بعد' : 'No commissions recorded yet'}</p>
            </CardContent></Card>
          ) : (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">{isAr ? 'ملخص عمولات الأطباء' : 'Doctor Commission Summary'}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{isAr ? 'الطبيب' : 'Doctor'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'إجمالي العمولة' : 'Total Earned'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'مدفوع' : 'Paid'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'متبقي' : 'Pending'}</TableHead>
                    <TableHead />
                  </TableRow></TableHeader>
                  <TableBody>
                    {earningsSummary.map(doc => (
                      <TableRow key={doc.doctorId}>
                        <TableCell className="font-medium text-sm">{doc.doctorName}</TableCell>
                        <TableCell className="text-end font-semibold text-sm">{fmt(doc.total)}</TableCell>
                        <TableCell className="text-end text-green-600 text-sm">{fmt(doc.paid)}</TableCell>
                        <TableCell className="text-end text-amber-600 text-sm">{fmt(doc.pending)}</TableCell>
                        <TableCell className="text-end">
                          {doc.pending > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                const pendingEarning = doctorEarnings.find(e => e.doctorId === doc.doctorId && e.status === 'pending');
                                if (pendingEarning) handleMarkPaid(pendingEarning.id);
                              }}
                            >
                              {isAr ? 'تسجيل دفع' : 'Mark Paid'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Transaction Ledger ── */}
        <TabsContent value="ledger" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{isAr ? 'سجل كل الحركات المالية' : 'Full Transaction Ledger'}</CardTitle></CardHeader>
            <CardContent>
              {recentTxs.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-6">
                  {loadingFinance ? (isAr ? 'جاري التحميل...' : 'Loading...') : (isAr ? 'لا توجد حركات بعد' : 'No transactions yet')}
                </p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{isAr ? 'النوع' : 'Type'}</TableHead>
                    <TableHead>{isAr ? 'الفئة' : 'Category'}</TableHead>
                    <TableHead>{isAr ? 'الوصف' : 'Description'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'المبلغ' : 'Amount'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'التاريخ' : 'Date'}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {recentTxs.map(tx => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <Badge className={tx.type === 'income' ? 'bg-green-100 text-green-700 text-xs dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 text-xs dark:bg-red-900/30 dark:text-red-400'}>
                            {tx.type === 'income' ? (isAr ? 'دخل' : 'Income') : (isAr ? 'مصروف' : 'Expense')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{tx.category}</TableCell>
                        <TableCell className="text-xs">{isAr ? tx.descriptionAr : tx.description}</TableCell>
                        <TableCell className={`text-end font-semibold text-sm ${tx.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>{fmt(tx.amount)}</TableCell>
                        <TableCell className="text-end text-xs text-muted-foreground">{tx.createdAt.slice(0, 10)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinanceDashboard;
