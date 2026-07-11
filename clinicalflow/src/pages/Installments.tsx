import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePatients } from '@/hooks/usePatients';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import {
  installmentPlanStore, installmentStore,
  getPlansForClinic, getInstallmentsForPlan, getInstallmentsForClinic,
  recordInstallmentPayment, syncOverdueInstallments,
  type InstallmentPlan, type Installment,
} from '@/stores/installmentStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { getToken } from '@/utils/authToken';
import {
  CreditCard, AlertCircle, CheckCircle, Clock, ChevronRight,
  Search, DollarSign, MessageSquare, TrendingDown, Users, RefreshCcw,
  Phone,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function useInstallmentData(clinicId: string) {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);

  useEffect(() => {
    syncOverdueInstallments();
    const unsub1 = installmentPlanStore.subscribe(refresh);
    const unsub2 = installmentStore.subscribe(refresh);
    return () => { unsub1(); unsub2(); };
  }, []);

  const plans = useMemo(() => getPlansForClinic(clinicId), [clinicId, tick]);
  const allInstallments = useMemo(() => getInstallmentsForClinic(clinicId), [clinicId, tick]);

  return { plans, allInstallments, refresh };
}

// ─── Main Component ───────────────────────────────────────────────────────────
const Installments: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { patients } = usePatients();
  const { settings } = useClinicSettings();

  const clinicId = user?.clinicId ?? '';
  const isAr = language === 'ar';
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const { plans, allInstallments } = useInstallmentData(clinicId);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<InstallmentPlan | null>(null);
  const [payingInstallment, setPayingInstallment] = useState<Installment | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<string>('cash');
  const [confirmPayOpen, setConfirmPayOpen] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);

  // ── Summary stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active    = plans.filter(p => p.status === 'active');
    const completed = plans.filter(p => p.status === 'completed');
    const overdueInsts = allInstallments.filter(i => i.status === 'overdue');
    const totalOwed    = allInstallments
      .filter(i => i.status !== 'paid')
      .reduce((s, i) => s + (i.amount - i.paidAmount), 0);
    const totalCollected = allInstallments
      .filter(i => i.status === 'paid' || i.status === 'partial')
      .reduce((s, i) => s + i.paidAmount, 0);
    return { active: active.length, completed: completed.length, overdue: overdueInsts.length, totalOwed, totalCollected };
  }, [plans, allInstallments]);

  // ── Filtered plans ────────────────────────────────────────────────────────────
  const filteredPlans = useMemo(() => {
    let list = plans;
    if (filterStatus !== 'all') {
      if (filterStatus === 'overdue') {
        // plans that have at least one overdue installment
        const planIdsWithOverdue = new Set(
          allInstallments.filter(i => i.status === 'overdue').map(i => i.planId)
        );
        list = list.filter(p => planIdsWithOverdue.has(p.id));
      } else {
        list = list.filter(p => p.status === filterStatus);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.patientName.toLowerCase().includes(q) ||
        p.patientPhone.includes(q) ||
        p.invoiceId.includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [plans, allInstallments, filterStatus, searchQuery]);

  // ── Plan detail state ─────────────────────────────────────────────────────────
  const planInstallments = useMemo(
    () => selectedPlan ? getInstallmentsForPlan(selectedPlan.id) : [],
    [selectedPlan, allInstallments]
  );

  const planPaidTotal = planInstallments.reduce((s, i) => s + i.paidAmount, 0);
  const planRemainingTotal = planInstallments.reduce((s, i) => s + (i.amount - i.paidAmount), 0);

  // ── Pay installment ───────────────────────────────────────────────────────────
  const openPay = (inst: Installment) => {
    setPayingInstallment(inst);
    setPayAmount(String(inst.amount - inst.paidAmount));
    setPayMethod('cash');
  };

  const handleConfirmPay = () => {
    if (!payingInstallment || !user) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      toast.error(isAr ? 'يرجى إدخال مبلغ صحيح' : 'Enter a valid amount');
      return;
    }
    const max = payingInstallment.amount - payingInstallment.paidAmount;
    recordInstallmentPayment(payingInstallment.id, Math.min(amount, max), payMethod, user.id);
    setConfirmPayOpen(false);
    setPayingInstallment(null);
    toast.success(isAr ? 'تم تسجيل الدفعة بنجاح' : 'Payment recorded');
  };

  // ── WhatsApp reminder ─────────────────────────────────────────────────────────
  const sendWhatsAppReminder = async (plan: InstallmentPlan, overdue = false) => {
    setSendingWhatsApp(plan.id);
    try {
      const nextInst = getInstallmentsForPlan(plan.id).find(
        i => i.status === 'pending' || i.status === 'overdue' || i.status === 'partial'
      );
      const token = getToken();
      const clinicName = isAr ? settings.nameAr : settings.name;
      const msg = overdue
        ? isAr
          ? `⚠️ تنبيه من ${clinicName}\n\nعزيزي ${plan.patientName}، لديك قسط متأخر بمبلغ ${nextInst?.amount ?? plan.installmentAmount} ج.م كان موعد سداده ${nextInst?.dueDate ?? ''}.\nيرجى السداد في أقرب وقت لتجنب أي رسوم إضافية.\nللاستفسار: ${settings.phone ?? ''}`
          : `⚠️ Overdue notice from ${clinicName}\n\nDear ${plan.patientName}, you have an overdue installment of ${nextInst?.amount ?? plan.installmentAmount} EGP due ${nextInst?.dueDate ?? ''}.\nPlease settle at your earliest convenience.\nContact: ${settings.phone ?? ''}`
        : isAr
          ? `💳 تذكير من ${clinicName}\n\nعزيزي ${plan.patientName}، موعد القسط رقم ${nextInst?.number ?? ''} بمبلغ ${nextInst?.amount ?? plan.installmentAmount} ج.م في تاريخ ${nextInst?.dueDate ?? ''}.\nنرجو التكرم بالسداد في الموعد المحدد.\nللاستفسار: ${settings.phone ?? ''}`
          : `💳 Reminder from ${clinicName}\n\nDear ${plan.patientName}, installment #${nextInst?.number ?? ''} of ${nextInst?.amount ?? plan.installmentAmount} EGP is due on ${nextInst?.dueDate ?? ''}.\nPlease ensure timely payment.\nContact: ${settings.phone ?? ''}`;

      const resp = await fetch('/api/installments/send-reminder', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ phone: plan.patientPhone, message: msg, clinicId }),
      });
      if (resp.ok) {
        toast.success(isAr ? 'تم إرسال رسالة واتساب بنجاح' : 'WhatsApp reminder sent');
      } else {
        toast.info(isAr ? 'لم يتم إرسال الواتساب (الإعدادات غير مفعلة)' : 'WhatsApp not configured — message skipped');
      }
    } catch {
      toast.error(isAr ? 'خطأ في إرسال الواتساب' : 'Failed to send WhatsApp');
    } finally {
      setSendingWhatsApp(null);
    }
  };

  // ── Status badge ──────────────────────────────────────────────────────────────
  const planStatusBadge = (plan: InstallmentPlan) => {
    const hasOverdue = allInstallments.some(i => i.planId === plan.id && i.status === 'overdue');
    if (hasOverdue)             return <Badge variant="destructive">{isAr ? 'متأخر' : 'Overdue'}</Badge>;
    if (plan.status === 'completed') return <Badge className="bg-green-600 text-white">{isAr ? 'مكتمل' : 'Completed'}</Badge>;
    return <Badge variant="secondary">{isAr ? 'نشط' : 'Active'}</Badge>;
  };

  const instStatusBadge = (inst: Installment) => {
    if (inst.status === 'paid')    return <Badge className="bg-green-600 text-white text-xs">{isAr ? 'مدفوع' : 'Paid'}</Badge>;
    if (inst.status === 'overdue') return <Badge variant="destructive" className="text-xs">{isAr ? 'متأخر' : 'Overdue'}</Badge>;
    if (inst.status === 'partial') return <Badge variant="secondary" className="text-xs">{isAr ? 'جزئي' : 'Partial'}</Badge>;
    return <Badge variant="outline" className="text-xs">{isAr ? 'قادم' : 'Pending'}</Badge>;
  };

  // ── Progress bar for plan ─────────────────────────────────────────────────────
  const PlanProgress: React.FC<{ plan: InstallmentPlan }> = ({ plan }) => {
    const insts = allInstallments.filter(i => i.planId === plan.id);
    const paidCount = insts.filter(i => i.status === 'paid').length;
    const total = plan.installmentCount;
    const pct = total > 0 ? Math.round((paidCount / total) * 100) : 0;
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{paidCount}/{total} {isAr ? 'أقساط' : 'installments'}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <CreditCard className="h-7 w-7 text-primary" />
          {isAr ? 'نظام التقسيط' : 'Installment Plans'}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAr ? 'إدارة خطط السداد المُقسَّطة للمرضى' : 'Manage patient installment payment plans'}
        </p>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-t-4 border-t-primary">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">{isAr ? 'خطط نشطة' : 'Active Plans'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-green-500">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalCollected.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي المحصّل ج.م' : 'Total Collected EGP'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-chart-4">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-chart-4/10 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-chart-4" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalOwed.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي المستحق ج.م' : 'Total Outstanding EGP'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-destructive">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{stats.overdue}</p>
                <p className="text-xs text-muted-foreground">{isAr ? 'أقساط متأخرة' : 'Overdue Installments'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isAr ? 'بحث بالاسم أو الهاتف أو رقم الفاتورة...' : 'Search by name, phone or invoice...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 rtl:pl-3 rtl:pr-10"
            data-testid="input-search-installments"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'overdue', 'completed'] as const).map(s => (
            <Button
              key={s}
              variant={filterStatus === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(s)}
              data-testid={`button-filter-${s}`}
            >
              {s === 'all'       ? (isAr ? 'الكل' : 'All') :
               s === 'active'   ? (isAr ? 'نشط' : 'Active') :
               s === 'overdue'  ? (isAr ? 'متأخر' : 'Overdue') :
                                  (isAr ? 'مكتمل' : 'Completed')}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Plans table ── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isAr ? 'المريض' : 'Patient'}</TableHead>
                <TableHead>{isAr ? 'الفاتورة' : 'Invoice'}</TableHead>
                <TableHead>{isAr ? 'الإجمالي' : 'Total'}</TableHead>
                <TableHead>{isAr ? 'الدفعة المقدمة' : 'Down Payment'}</TableHead>
                <TableHead>{isAr ? 'التقدم' : 'Progress'}</TableHead>
                <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                <TableHead className="text-right">{isAr ? 'إجراءات' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlans.map(plan => (
                <TableRow
                  key={plan.id}
                  className="cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => setSelectedPlan(plan)}
                  data-testid={`row-plan-${plan.id}`}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium">{plan.patientName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" />{plan.patientPhone}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{plan.invoiceId.slice(0, 12)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">{plan.totalAmount.toLocaleString()} ج.م</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-green-600 font-medium">{plan.downPayment.toLocaleString()} ج.م</span>
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <PlanProgress plan={plan} />
                  </TableCell>
                  <TableCell>{planStatusBadge(plan)}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPlan(plan)}
                        data-testid={`button-view-plan-${plan.id}`}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={sendingWhatsApp === plan.id}
                        onClick={() => {
                          const hasOverdue = allInstallments.some(i => i.planId === plan.id && i.status === 'overdue');
                          sendWhatsAppReminder(plan, hasOverdue);
                        }}
                        title={isAr ? 'إرسال تذكير واتساب' : 'Send WhatsApp reminder'}
                        data-testid={`button-whatsapp-${plan.id}`}
                      >
                        {sendingWhatsApp === plan.id
                          ? <RefreshCcw className="h-4 w-4 animate-spin" />
                          : <MessageSquare className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredPlans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <CreditCard className="h-10 w-10 opacity-30" />
                      <p className="text-sm">{isAr ? 'لا توجد خطط تقسيط' : 'No installment plans found'}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Plan detail dialog ── */}
      <Dialog open={!!selectedPlan} onOpenChange={open => !open && setSelectedPlan(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              {isAr ? 'تفاصيل خطة التقسيط' : 'Installment Plan Details'}
            </DialogTitle>
          </DialogHeader>
          {selectedPlan && (
            <div className="space-y-5">
              {/* Patient & plan info */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <p className="font-semibold text-lg">{selectedPlan.patientName}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5" /> {selectedPlan.patientPhone}
                    </p>
                  </div>
                  {planStatusBadge(selectedPlan)}
                </div>
                <Separator />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">{isAr ? 'إجمالي الفاتورة' : 'Invoice Total'}</p>
                    <p className="font-semibold">{selectedPlan.totalAmount.toLocaleString()} ج.م</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">{isAr ? 'الدفعة المقدمة' : 'Down Payment'}</p>
                    <p className="font-semibold text-green-600">{selectedPlan.downPayment.toLocaleString()} ج.م</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">{isAr ? 'المحصّل' : 'Collected'}</p>
                    <p className="font-semibold text-green-600">{(selectedPlan.downPayment + planPaidTotal).toLocaleString()} ج.م</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">{isAr ? 'المتبقي' : 'Outstanding'}</p>
                    <p className="font-semibold text-destructive">{planRemainingTotal.toLocaleString()} ج.م</p>
                  </div>
                </div>
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{isAr ? 'تقدم السداد' : 'Payment progress'}</span>
                    <span>
                      {planInstallments.filter(i => i.status === 'paid').length}/{selectedPlan.installmentCount}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${selectedPlan.installmentCount > 0
                          ? Math.round(planInstallments.filter(i => i.status === 'paid').length / selectedPlan.installmentCount * 100)
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* WhatsApp actions */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                  disabled={sendingWhatsApp === selectedPlan.id || selectedPlan.status === 'completed'}
                  onClick={() => sendWhatsAppReminder(selectedPlan, false)}
                  data-testid="button-send-reminder"
                >
                  <MessageSquare className="h-4 w-4" />
                  {isAr ? 'إرسال تذكير واتساب' : 'Send WhatsApp Reminder'}
                </Button>
                {allInstallments.some(i => i.planId === selectedPlan.id && i.status === 'overdue') && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/5"
                    disabled={sendingWhatsApp === selectedPlan.id}
                    onClick={() => sendWhatsAppReminder(selectedPlan, true)}
                    data-testid="button-send-overdue-reminder"
                  >
                    <AlertCircle className="h-4 w-4" />
                    {isAr ? 'إرسال إشعار تأخير' : 'Send Overdue Notice'}
                  </Button>
                )}
              </div>

              {/* Installments schedule table */}
              <div>
                <p className="font-medium text-sm mb-3">{isAr ? 'جدول الأقساط' : 'Installment Schedule'}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</TableHead>
                      <TableHead>{isAr ? 'المبلغ' : 'Amount'}</TableHead>
                      <TableHead>{isAr ? 'المدفوع' : 'Paid'}</TableHead>
                      <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                      {isAdmin && <TableHead>{isAr ? 'دفع' : 'Pay'}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {planInstallments.map(inst => (
                      <TableRow key={inst.id} data-testid={`row-installment-${inst.id}`}>
                        <TableCell className="font-medium">{inst.number}</TableCell>
                        <TableCell className={inst.status === 'overdue' ? 'text-destructive font-medium' : ''}>
                          {inst.dueDate}
                        </TableCell>
                        <TableCell>{inst.amount.toLocaleString()} ج.م</TableCell>
                        <TableCell>
                          {inst.paidAmount > 0
                            ? <span className="text-green-600 font-medium">{inst.paidAmount.toLocaleString()} ج.م</span>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>{instStatusBadge(inst)}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            {inst.status !== 'paid' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 h-7 text-xs"
                                onClick={() => openPay(inst)}
                                data-testid={`button-pay-installment-${inst.id}`}
                              >
                                <DollarSign className="h-3 w-3" />
                                {isAr ? 'دفع' : 'Pay'}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedPlan.notes && (
                <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{isAr ? 'ملاحظات: ' : 'Notes: '}</span>
                  {selectedPlan.notes}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Pay installment dialog ── */}
      <Dialog open={!!payingInstallment && !confirmPayOpen} onOpenChange={open => !open && setPayingInstallment(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isAr ? 'تسجيل دفعة قسط' : 'Record Installment Payment'}</DialogTitle>
          </DialogHeader>
          {payingInstallment && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? 'القسط رقم' : 'Installment #'}</span>
                  <span className="font-medium">{payingInstallment.number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</span>
                  <span>{payingInstallment.dueDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? 'المبلغ المطلوب' : 'Due Amount'}</span>
                  <span className="font-semibold">{(payingInstallment.amount - payingInstallment.paidAmount).toLocaleString()} ج.م</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{isAr ? 'المبلغ المدفوع' : 'Amount Paid'}</Label>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  data-testid="input-pay-amount"
                />
              </div>
              <div className="space-y-2">
                <Label>{isAr ? 'طريقة الدفع' : 'Payment Method'}</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger data-testid="select-pay-method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">{isAr ? 'نقدي' : 'Cash'}</SelectItem>
                    <SelectItem value="card">{isAr ? 'بطاقة' : 'Card'}</SelectItem>
                    <SelectItem value="bank_transfer">{isAr ? 'تحويل بنكي' : 'Bank Transfer'}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full gap-2"
                onClick={() => setConfirmPayOpen(true)}
                data-testid="button-confirm-pay-installment"
              >
                <DollarSign className="h-4 w-4" />
                {isAr ? 'تسجيل الدفعة' : 'Record Payment'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Confirm pay dialog ── */}
      <AlertDialog open={confirmPayOpen} onOpenChange={setConfirmPayOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? 'تأكيد الدفع' : 'Confirm Payment'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? `هل تريد تسجيل دفعة بمبلغ ${payAmount} ج.م؟`
                : `Record a payment of ${payAmount} EGP?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmPayOpen(false)}>
              {isAr ? 'إلغاء' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPay}>
              {isAr ? 'تأكيد' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Installments;
