import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import {
  contractStore, leaveRequestStore, payrollStore, cashAdvanceStore,
  EmployeeContract, LeaveRequest, PayrollRecord, CashAdvance,
  calcNetSalary, getUsedLeaveDays,
} from '@/stores/hrStore';
import { User } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Users2, Plus, Pencil, FileText, DollarSign, Calendar, CheckCircle,
  XCircle, Clock, Printer, TrendingUp,
} from 'lucide-react';

const HRPayroll: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const clinicId = user?.clinicId || '';
  const currentYear = new Date().getFullYear();
  const currentPeriod = new Date().toISOString().slice(0, 7); // YYYY-MM

  const { users: allUsers } = useUsers();
  const [staff, setStaff] = useState<User[]>([]);
  const [contracts, setContracts] = useState<EmployeeContract[]>(() =>
    contractStore.filter(c => c.clinicId === clinicId)
  );
  const [leaves, setLeaves] = useState<LeaveRequest[]>(() =>
    leaveRequestStore.filter(l => l.clinicId === clinicId)
  );
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>(() =>
    payrollStore.filter(p => p.clinicId === clinicId)
  );
  const [advances, setAdvances] = useState<CashAdvance[]>(() =>
    cashAdvanceStore.filter(a => a.clinicId === clinicId)
  );

  useEffect(() => {
    setStaff(allUsers.filter(u => u.clinicId === clinicId && u.role !== 'patient'));
  }, [allUsers, clinicId]);

  useEffect(() => {
    const unsubs = [
      contractStore.subscribe(() => setContracts(contractStore.filter(c => c.clinicId === clinicId))),
      leaveRequestStore.subscribe(() => setLeaves(leaveRequestStore.filter(l => l.clinicId === clinicId))),
      payrollStore.subscribe(() => setPayrolls(payrollStore.filter(p => p.clinicId === clinicId))),
      cashAdvanceStore.subscribe(() => setAdvances(cashAdvanceStore.filter(a => a.clinicId === clinicId))),
    ];
    return () => unsubs.forEach(u => u());
  }, [clinicId]);

  const getUser = (uid: string) => staff.find(s => s.id === uid);

  // ── Contracts ──────────────────────────────────────────────────────────
  const [contractDialog, setContractDialog] = useState(false);
  const [editContract, setEditContract] = useState<EmployeeContract | null>(null);
  const [cForm, setCForm] = useState({
    userId: '', baseSalary: '', jobTitle: '', jobTitleAr: '',
    startDate: '', workingHoursPerDay: '8', annualLeaveDays: '21',
    contractFileUrl: '',
  });

  const openContractAdd = () => {
    setCForm({ userId: '', baseSalary: '', jobTitle: '', jobTitleAr: '', startDate: new Date().toISOString().slice(0, 10), workingHoursPerDay: '8', annualLeaveDays: '21', contractFileUrl: '' });
    setEditContract(null);
    setContractDialog(true);
  };
  const openContractEdit = (c: EmployeeContract) => {
    setCForm({
      userId: c.userId, baseSalary: String(c.baseSalary), jobTitle: c.jobTitle, jobTitleAr: c.jobTitleAr,
      startDate: c.startDate, workingHoursPerDay: String(c.workingHoursPerDay), annualLeaveDays: String(c.annualLeaveDays),
      contractFileUrl: c.contractFileUrl || '',
    });
    setEditContract(c);
    setContractDialog(true);
  };
  const saveContract = () => {
    if (!cForm.userId || !cForm.baseSalary || !cForm.jobTitle) {
      toast.error(isAr ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields'); return;
    }
    if (editContract) {
      contractStore.update(c => c.id === editContract.id, {
        baseSalary: Number(cForm.baseSalary), jobTitle: cForm.jobTitle, jobTitleAr: cForm.jobTitleAr,
        startDate: cForm.startDate, workingHoursPerDay: Number(cForm.workingHoursPerDay),
        annualLeaveDays: Number(cForm.annualLeaveDays), contractFileUrl: cForm.contractFileUrl,
      });
      toast.success(isAr ? 'تم تحديث العقد' : 'Contract updated');
    } else {
      contractStore.add({
        id: `con-${Date.now()}`, clinicId,
        userId: cForm.userId, baseSalary: Number(cForm.baseSalary),
        jobTitle: cForm.jobTitle, jobTitleAr: cForm.jobTitleAr,
        startDate: cForm.startDate, workingHoursPerDay: Number(cForm.workingHoursPerDay),
        annualLeaveDays: Number(cForm.annualLeaveDays), contractFileUrl: cForm.contractFileUrl,
        isActive: true, createdAt: new Date().toISOString(),
      });
      toast.success(isAr ? 'تم إضافة العقد' : 'Contract added');
    }
    setContractDialog(false);
  };

  // ── Leaves ─────────────────────────────────────────────────────────────
  const [leaveDialog, setLeaveDialog] = useState(false);
  const [lForm, setLForm] = useState({
    userId: '', type: 'annual' as LeaveRequest['type'],
    startDate: '', endDate: '', reason: '',
  });

  const pendingLeaves = leaves.filter(l => l.status === 'pending');

  const saveLeave = () => {
    if (!lForm.userId || !lForm.startDate || !lForm.endDate) {
      toast.error(isAr ? 'يرجى تعبئة الحقول' : 'Fill required fields'); return;
    }
    leaveRequestStore.add({
      id: `lv-${Date.now()}`, clinicId, userId: lForm.userId,
      type: lForm.type, startDate: lForm.startDate, endDate: lForm.endDate,
      reason: lForm.reason, status: 'pending', requestedAt: new Date().toISOString(),
    });
    toast.success(isAr ? 'تم تسجيل طلب الإجازة' : 'Leave request submitted');
    setLeaveDialog(false);
  };

  const reviewLeave = (id: string, status: 'approved' | 'rejected') => {
    leaveRequestStore.update(l => l.id === id, {
      status, reviewedBy: user?.id, reviewedAt: new Date().toISOString(),
    });
    toast.success(status === 'approved' ? (isAr ? 'تمت الموافقة' : 'Approved') : (isAr ? 'تم الرفض' : 'Rejected'));
  };

  // ── Payroll ────────────────────────────────────────────────────────────
  const [payrollPeriod, setPayrollPeriod] = useState(currentPeriod);
  const periodPayrolls = payrolls.filter(p => p.period === payrollPeriod);

  const generatePayroll = () => {
    const contractedStaff = contracts.filter(c => c.clinicId === clinicId && c.isActive);
    let added = 0;
    contractedStaff.forEach(c => {
      const alreadyExists = periodPayrolls.find(p => p.userId === c.userId);
      if (!alreadyExists) {
        const pendingAdvance = advances.filter(a => a.userId === c.userId && a.status === 'approved').reduce((s, a) => s + a.amount, 0);
        payrollStore.add({
          id: `pay-${Date.now()}-${c.userId}`, clinicId, userId: c.userId,
          period: payrollPeriod, baseSalary: c.baseSalary,
          bonuses: 0, cashPaidBonuses: 0, deductions: 0, advances: pendingAdvance,
          netSalary: calcNetSalary(c.baseSalary, 0, 0, 0, pendingAdvance),
          status: 'draft', createdAt: new Date().toISOString(),
        });
        added++;
      }
    });
    if (added > 0) toast.success(isAr ? `تم إنشاء ${added} كشف راتب` : `Generated ${added} payroll records`);
    else toast.info(isAr ? 'كل الموظفين لديهم كشوف راتب لهذه الفترة' : 'All employees already have payroll for this period');
  };

  const updatePayrollField = (id: string, field: keyof PayrollRecord, value: number) => {
    payrollStore.update(p => p.id === id, (p) => {
      const updated = { ...p, [field]: value };
      updated.netSalary = calcNetSalary(updated.baseSalary, updated.bonuses, updated.cashPaidBonuses, updated.deductions, updated.advances);
      return updated;
    });
  };

  const approvePayroll = (id: string) => {
    payrollStore.update(p => p.id === id, { status: 'approved', approvedAt: new Date().toISOString() });
    toast.success(isAr ? 'تمت الموافقة على الراتب' : 'Payroll approved');
  };

  const markPaid = (id: string) => {
    payrollStore.update(p => p.id === id, { status: 'paid' });
    toast.success(isAr ? 'تم تسجيل الدفع' : 'Marked as paid');
  };

  const printSlip = (rec: PayrollRecord) => {
    const emp = getUser(rec.userId);
    const empName = isAr ? (emp?.nameAr || emp?.name || rec.userId) : (emp?.name || rec.userId);
    const contract = contracts.find(c => c.userId === rec.userId);
    const html = `
      <html><head><meta charset="UTF-8"><title>Salary Slip</title>
      <style>body{font-family:Arial;padding:30px;direction:${isAr ? 'rtl' : 'ltr'}}
      table{width:100%;border-collapse:collapse}td{padding:8px;border:1px solid #ddd}
      .total{font-weight:bold;font-size:1.1em}.header{text-align:center;margin-bottom:20px}
      h2{margin:0}@media print{body{margin:0}}</style></head>
      <body>
      <div class="header"><h2>${isAr ? 'قسيمة راتب' : 'Salary Slip'}</h2>
      <p>${isAr ? 'الفترة:' : 'Period:'} ${rec.period} | ${isAr ? 'الموظف:' : 'Employee:'} ${empName}</p>
      ${contract ? `<p>${isAr ? 'المسمى الوظيفي:' : 'Job Title:'} ${isAr ? contract.jobTitleAr : contract.jobTitle}</p>` : ''}
      </div>
      <table>
      <tr><td>${isAr ? 'الراتب الأساسي' : 'Base Salary'}</td><td>${rec.baseSalary} ج.م</td></tr>
      <tr><td>${isAr ? 'المكافآت' : 'Bonuses'}</td><td>${rec.bonuses} ج.م</td></tr>
      <tr><td>${isAr ? 'مكافآت نقدية' : 'Cash Bonuses'}</td><td>-${rec.cashPaidBonuses} ج.م</td></tr>
      <tr><td>${isAr ? 'الخصومات' : 'Deductions'}</td><td>-${rec.deductions} ج.م</td></tr>
      <tr><td>${isAr ? 'السلف' : 'Advances'}</td><td>-${rec.advances} ج.م</td></tr>
      <tr class="total"><td>${isAr ? 'صافي الراتب' : 'Net Salary'}</td><td>${rec.netSalary} ج.م</td></tr>
      </table>
      <p style="margin-top:30px">${isAr ? 'الحالة:' : 'Status:'} ${rec.status}</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); w.print(); }
  };

  // ── Cash Advances ──────────────────────────────────────────────────────
  const [advanceDialog, setAdvanceDialog] = useState(false);
  const [aForm, setAForm] = useState({ userId: '', amount: '', reason: '' });

  const saveAdvance = () => {
    if (!aForm.userId || !aForm.amount) {
      toast.error(isAr ? 'يرجى تعبئة الحقول' : 'Fill required fields'); return;
    }
    cashAdvanceStore.add({
      id: `adv-${Date.now()}`, clinicId, userId: aForm.userId,
      amount: Number(aForm.amount), reason: aForm.reason,
      date: new Date().toISOString().slice(0, 10), status: 'pending',
    });
    toast.success(isAr ? 'تم تسجيل طلب السلفة' : 'Advance request added');
    setAdvanceDialog(false);
  };

  const approveAdvance = (id: string) => {
    cashAdvanceStore.update(a => a.id === id, { status: 'approved' });
    toast.success(isAr ? 'تمت الموافقة على السلفة' : 'Advance approved');
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      draft:    'bg-muted text-muted-foreground',
      paid:     'bg-primary/10 text-primary',
      deducted: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    };
    return map[s] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="p-4 space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center gap-2">
        <Users2 className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{isAr ? 'الموارد البشرية والرواتب' : 'HR & Payroll'}</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{contracts.length}</p>
          <p className="text-xs text-muted-foreground">{isAr ? 'عقد نشط' : 'Active Contracts'}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{pendingLeaves.length}</p>
          <p className="text-xs text-muted-foreground">{isAr ? 'طلب إجازة معلق' : 'Pending Leaves'}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{periodPayrolls.filter(p => p.status === 'paid').length}</p>
          <p className="text-xs text-muted-foreground">{isAr ? 'راتب مدفوع' : 'Paid Salaries'}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-purple-600">{advances.filter(a => a.status === 'pending').length}</p>
          <p className="text-xs text-muted-foreground">{isAr ? 'سلفة معلقة' : 'Pending Advances'}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="contracts">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="contracts">{isAr ? 'العقود' : 'Contracts'}</TabsTrigger>
          <TabsTrigger value="leaves">{isAr ? 'الإجازات' : 'Leaves'}</TabsTrigger>
          <TabsTrigger value="payroll">{isAr ? 'الرواتب' : 'Payroll'}</TabsTrigger>
          <TabsTrigger value="advances">{isAr ? 'السلف' : 'Advances'}</TabsTrigger>
        </TabsList>

        {/* CONTRACTS TAB */}
        <TabsContent value="contracts" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button onClick={openContractAdd} className="gap-2">
              <Plus className="h-4 w-4" />{isAr ? 'إضافة عقد' : 'Add Contract'}
            </Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'الموظف' : 'Employee'}</TableHead>
                  <TableHead>{isAr ? 'المسمى الوظيفي' : 'Job Title'}</TableHead>
                  <TableHead>{isAr ? 'الراتب الأساسي' : 'Base Salary'}</TableHead>
                  <TableHead>{isAr ? 'تاريخ البداية' : 'Start Date'}</TableHead>
                  <TableHead>{isAr ? 'أيام الإجازة' : 'Leave Days'}</TableHead>
                  <TableHead>{isAr ? 'إجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{isAr ? 'لا توجد عقود' : 'No contracts'}</TableCell></TableRow>
                )}
                {contracts.map(c => {
                  const emp = getUser(c.userId);
                  const used = getUsedLeaveDays(c.userId, currentYear);
                  return (
                    <TableRow key={c.id}>
                      <TableCell>{isAr ? emp?.nameAr || emp?.name : emp?.name || c.userId}</TableCell>
                      <TableCell>{isAr ? c.jobTitleAr : c.jobTitle}</TableCell>
                      <TableCell className="font-medium">{c.baseSalary} ج.م</TableCell>
                      <TableCell>{c.startDate}</TableCell>
                      <TableCell>
                        <span className={used >= c.annualLeaveDays ? 'text-red-600 font-medium' : ''}>
                          {used}/{c.annualLeaveDays}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openContractEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* LEAVES TAB */}
        <TabsContent value="leaves" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button onClick={() => { setLForm({ userId: '', type: 'annual', startDate: '', endDate: '', reason: '' }); setLeaveDialog(true); }} className="gap-2">
              <Plus className="h-4 w-4" />{isAr ? 'طلب إجازة' : 'Request Leave'}
            </Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'الموظف' : 'Employee'}</TableHead>
                  <TableHead>{isAr ? 'النوع' : 'Type'}</TableHead>
                  <TableHead>{isAr ? 'من' : 'From'}</TableHead>
                  <TableHead>{isAr ? 'إلى' : 'To'}</TableHead>
                  <TableHead>{isAr ? 'السبب' : 'Reason'}</TableHead>
                  <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{isAr ? 'إجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{isAr ? 'لا توجد طلبات إجازة' : 'No leave requests'}</TableCell></TableRow>
                )}
                {leaves.map(l => {
                  const emp = getUser(l.userId);
                  const typeLabels: Record<string, { en: string; ar: string }> = {
                    annual: { en: 'Annual', ar: 'سنوية' },
                    sick: { en: 'Sick', ar: 'مرضية' },
                    emergency: { en: 'Emergency', ar: 'طارئة' },
                    unpaid: { en: 'Unpaid', ar: 'بدون راتب' },
                  };
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{isAr ? emp?.nameAr || emp?.name : emp?.name || l.userId}</TableCell>
                      <TableCell><Badge className={`text-xs ${l.type === 'sick' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-primary/10 text-primary'}`}>{isAr ? typeLabels[l.type]?.ar : typeLabels[l.type]?.en}</Badge></TableCell>
                      <TableCell>{l.startDate}</TableCell>
                      <TableCell>{l.endDate}</TableCell>
                      <TableCell className="max-w-32 truncate">{l.reason}</TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(l.status)}`}>{l.status}</span></TableCell>
                      <TableCell>
                        {l.status === 'pending' && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="text-green-600" onClick={() => reviewLeave(l.id, 'approved')}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-red-600" onClick={() => reviewLeave(l.id, 'rejected')}>
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* PAYROLL TAB */}
        <TabsContent value="payroll" className="space-y-3 mt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Label>{isAr ? 'الفترة' : 'Period'}</Label>
              <Input type="month" value={payrollPeriod} onChange={e => setPayrollPeriod(e.target.value)} className="w-40" />
            </div>
            <Button onClick={generatePayroll} variant="outline" className="gap-2">
              <TrendingUp className="h-4 w-4" />{isAr ? 'إنشاء كشوف الرواتب' : 'Generate Payroll'}
            </Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'الموظف' : 'Employee'}</TableHead>
                  <TableHead>{isAr ? 'أساسي' : 'Base'}</TableHead>
                  <TableHead>{isAr ? 'مكافآت' : 'Bonuses'}</TableHead>
                  <TableHead>{isAr ? 'نقدي' : 'Cash'}</TableHead>
                  <TableHead>{isAr ? 'خصومات' : 'Deductions'}</TableHead>
                  <TableHead>{isAr ? 'سلف' : 'Advances'}</TableHead>
                  <TableHead className="font-bold">{isAr ? 'صافي' : 'Net'}</TableHead>
                  <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{isAr ? 'إجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodPayrolls.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">{isAr ? 'لا توجد كشوف رواتب - اضغط "إنشاء كشوف الرواتب"' : 'No payroll — click "Generate Payroll"'}</TableCell></TableRow>
                )}
                {periodPayrolls.map(rec => {
                  const emp = getUser(rec.userId);
                  return (
                    <TableRow key={rec.id}>
                      <TableCell className="font-medium">{isAr ? emp?.nameAr || emp?.name : emp?.name || rec.userId}</TableCell>
                      <TableCell>{rec.baseSalary}</TableCell>
                      <TableCell>
                        <Input type="number" value={rec.bonuses} className="w-20 h-7 text-sm"
                          onChange={e => updatePayrollField(rec.id, 'bonuses', Number(e.target.value))}
                          disabled={rec.status !== 'draft'} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={rec.cashPaidBonuses} className="w-20 h-7 text-sm"
                          onChange={e => updatePayrollField(rec.id, 'cashPaidBonuses', Number(e.target.value))}
                          disabled={rec.status !== 'draft'} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" value={rec.deductions} className="w-20 h-7 text-sm"
                          onChange={e => updatePayrollField(rec.id, 'deductions', Number(e.target.value))}
                          disabled={rec.status !== 'draft'} />
                      </TableCell>
                      <TableCell>{rec.advances}</TableCell>
                      <TableCell className="font-bold text-green-600">{rec.netSalary} ج.م</TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(rec.status)}`}>{rec.status}</span></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {rec.status === 'draft' && (
                            <Button variant="ghost" size="icon" className="text-green-600 h-7 w-7" onClick={() => approvePayroll(rec.id)} title={isAr ? 'موافقة' : 'Approve'}>
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {rec.status === 'approved' && (
                            <Button variant="ghost" size="icon" className="text-blue-600 h-7 w-7" onClick={() => markPaid(rec.id)} title={isAr ? 'دفع' : 'Mark Paid'}>
                              <DollarSign className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => printSlip(rec)} title={isAr ? 'طباعة' : 'Print'}>
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ADVANCES TAB */}
        <TabsContent value="advances" className="space-y-3 mt-3">
          <div className="flex justify-end">
            <Button onClick={() => { setAForm({ userId: '', amount: '', reason: '' }); setAdvanceDialog(true); }} className="gap-2">
              <Plus className="h-4 w-4" />{isAr ? 'طلب سلفة' : 'Request Advance'}
            </Button>
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'الموظف' : 'Employee'}</TableHead>
                  <TableHead>{isAr ? 'المبلغ' : 'Amount'}</TableHead>
                  <TableHead>{isAr ? 'السبب' : 'Reason'}</TableHead>
                  <TableHead>{isAr ? 'التاريخ' : 'Date'}</TableHead>
                  <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{isAr ? 'إجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {advances.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{isAr ? 'لا توجد سلف' : 'No advances'}</TableCell></TableRow>
                )}
                {advances.map(a => {
                  const emp = getUser(a.userId);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>{isAr ? emp?.nameAr || emp?.name : emp?.name || a.userId}</TableCell>
                      <TableCell className="font-medium text-orange-600">{a.amount} ج.م</TableCell>
                      <TableCell>{a.reason}</TableCell>
                      <TableCell>{a.date}</TableCell>
                      <TableCell><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(a.status)}`}>{a.status}</span></TableCell>
                      <TableCell>
                        {a.status === 'pending' && (
                          <Button variant="ghost" size="icon" className="text-green-600" onClick={() => approveAdvance(a.id)}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Contract Dialog */}
      <Dialog open={contractDialog} onOpenChange={setContractDialog}>
        <DialogContent dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editContract ? (isAr ? 'تعديل العقد' : 'Edit Contract') : (isAr ? 'إضافة عقد' : 'Add Contract')}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>{isAr ? 'الموظف' : 'Employee'}</Label>
              <Select value={cForm.userId} onValueChange={v => setCForm(f => ({ ...f, userId: v }))} disabled={!!editContract}>
                <SelectTrigger><SelectValue placeholder={isAr ? 'اختر موظف' : 'Select employee'} /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{isAr ? s.nameAr || s.name : s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? 'المسمى الوظيفي (EN)' : 'Job Title (EN)'}</Label>
              <Input value={cForm.jobTitle} onChange={e => setCForm(f => ({ ...f, jobTitle: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'المسمى الوظيفي (AR)' : 'Job Title (AR)'}</Label>
              <Input value={cForm.jobTitleAr} onChange={e => setCForm(f => ({ ...f, jobTitleAr: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'الراتب الأساسي (ج.م)' : 'Base Salary (EGP)'}</Label>
              <Input type="number" value={cForm.baseSalary} onChange={e => setCForm(f => ({ ...f, baseSalary: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'تاريخ البداية' : 'Start Date'}</Label>
              <Input type="date" value={cForm.startDate} onChange={e => setCForm(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'ساعات العمل/يوم' : 'Working Hours/Day'}</Label>
              <Input type="number" value={cForm.workingHoursPerDay} onChange={e => setCForm(f => ({ ...f, workingHoursPerDay: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'أيام الإجازة السنوية' : 'Annual Leave Days'}</Label>
              <Input type="number" value={cForm.annualLeaveDays} onChange={e => setCForm(f => ({ ...f, annualLeaveDays: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={saveContract}>{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Dialog */}
      <Dialog open={leaveDialog} onOpenChange={setLeaveDialog}>
        <DialogContent dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{isAr ? 'طلب إجازة' : 'Leave Request'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{isAr ? 'الموظف' : 'Employee'}</Label>
              <Select value={lForm.userId} onValueChange={v => setLForm(f => ({ ...f, userId: v }))}>
                <SelectTrigger><SelectValue placeholder={isAr ? 'اختر موظف' : 'Select employee'} /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{isAr ? s.nameAr || s.name : s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? 'نوع الإجازة' : 'Leave Type'}</Label>
              <Select value={lForm.type} onValueChange={v => setLForm(f => ({ ...f, type: v as LeaveRequest['type'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">{isAr ? 'سنوية' : 'Annual'}</SelectItem>
                  <SelectItem value="sick">{isAr ? 'مرضية' : 'Sick'}</SelectItem>
                  <SelectItem value="emergency">{isAr ? 'طارئة' : 'Emergency'}</SelectItem>
                  <SelectItem value="unpaid">{isAr ? 'بدون راتب' : 'Unpaid'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>{isAr ? 'من' : 'From'}</Label><Input type="date" value={lForm.startDate} onChange={e => setLForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><Label>{isAr ? 'إلى' : 'To'}</Label><Input type="date" value={lForm.endDate} onChange={e => setLForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            </div>
            <div>
              <Label>{isAr ? 'السبب' : 'Reason'}</Label>
              <Textarea value={lForm.reason} onChange={e => setLForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={saveLeave}>{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advance Dialog */}
      <Dialog open={advanceDialog} onOpenChange={setAdvanceDialog}>
        <DialogContent dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{isAr ? 'طلب سلفة' : 'Cash Advance Request'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{isAr ? 'الموظف' : 'Employee'}</Label>
              <Select value={aForm.userId} onValueChange={v => setAForm(f => ({ ...f, userId: v }))}>
                <SelectTrigger><SelectValue placeholder={isAr ? 'اختر موظف' : 'Select employee'} /></SelectTrigger>
                <SelectContent>
                  {staff.map(s => <SelectItem key={s.id} value={s.id}>{isAr ? s.nameAr || s.name : s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? 'المبلغ (ج.م)' : 'Amount (EGP)'}</Label>
              <Input type="number" value={aForm.amount} onChange={e => setAForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'السبب' : 'Reason'}</Label>
              <Textarea value={aForm.reason} onChange={e => setAForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={saveAdvance}>{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HRPayroll;
