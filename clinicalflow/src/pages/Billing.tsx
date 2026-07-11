import React, { useState, useEffect } from 'react';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useInvoices, useVisits } from '@/hooks/useVisits';
import { usePatients } from '@/hooks/usePatients';
import { useServices } from '@/hooks/useSpecialties';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Receipt, CheckCircle, AlertCircle, Eye, FileText, DollarSign, Printer, Tag, Search, Undo2, ShieldCheck, CreditCard, Calendar, ChevronRight } from 'lucide-react';
import { getClinicShare } from '@/types';
import { toast } from 'sonner';
import { calcInvoiceTotals } from '@/lib/invoiceCalc';
import { calculateBillingSplit, getInsuranceCompany } from '@/stores/insuranceStore';
import { logAudit, auditDenied } from '@/stores/auditStore';
import {
  getInstallmentSettings, createInstallmentPlan,
  getPlansForClinic,
} from '@/stores/installmentStore';

const Billing: React.FC = () => {
  const { t, language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { settings } = useClinicSettings();
  const { invoices, invoiceItems, getItemsForInvoice, getPaymentsForInvoice, addPayment, updateInvoiceDiscount, refundInvoice } = useInvoices();
  const { visits } = useVisits();
  const { patients } = usePatients();
  const { services } = useServices();

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'insurance' | 'bank_transfer'>('cash');
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);

  // ── Installment state ─────────────────────────────────────────────────────
  const [payMode, setPayMode] = useState<'full' | 'installment'>('full');
  const [instCount, setInstCount] = useState<number>(3);
  const [instDownPct, setInstDownPct] = useState<number>(20);
  const [instNotes, setInstNotes] = useState<string>('');
  const [instConfirmOpen, setInstConfirmOpen] = useState(false);

  const activeInvoices = invoices.filter(i => i.isActive);
  const searchFiltered = activeInvoices.filter(i => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const patient = patients.find(pt => pt.id === i.patientId);
    return (
      patient?.name.toLowerCase().includes(q) ||
      patient?.nameAr.includes(searchQuery.trim()) ||
      i.id.toLowerCase().includes(q) ||
      i.createdAt.includes(q)
    );
  });
  const filtered = searchFiltered.filter(i => filterStatus === 'all' || i.status === filterStatus);

  // ── Billing permission flags ──────────────────────────────────────────────
  const clinicId = user?.clinicId ?? '';
  // Refund: admin only (irreversible financial action)
  const canRefund = user?.role === 'admin' || user?.role === 'super_admin';
  // High discount (>30%): admin only; reception may apply ≤30%
  const canApplyHighDiscount = user?.role === 'admin' || user?.role === 'super_admin';
  const HIGH_DISCOUNT_THRESHOLD = 30; // percent

  const totalRevenue = activeInvoices.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
  const paidRevenue = activeInvoices.reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);
  const pendingRevenue = totalRevenue - paidRevenue;

  const getPatientName = (id: string) => {
    const p = patients.find(pt => pt.id === id);
    return language === 'ar' ? p?.nameAr : p?.name;
  };

  const getServiceName = (id: string) => {
    const s = services.find(sv => sv.id === id);
    return language === 'ar' ? s?.nameAr : s?.name;
  };

  const selectedInvoice = selectedInvoiceId ? invoices.find(i => i.id === selectedInvoiceId) : null;
  const selectedItems = selectedInvoiceId ? getItemsForInvoice(selectedInvoiceId) : [];
  const selectedPayments = selectedInvoiceId ? getPaymentsForInvoice(selectedInvoiceId) : [];

  // Auto-close the invoice dialog once the invoice is fully paid
  useEffect(() => {
    if (!selectedInvoiceId) return;
    const inv = invoices.find(i => i.id === selectedInvoiceId);
    if (inv && inv.status === 'paid') {
      setSelectedInvoiceId(null);
    }
  }, [invoices, selectedInvoiceId]);

  const openInvoiceDialog = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (inv) {
      setDiscountType(inv.discountType || 'none');
      setDiscountValue(inv.discountValue ? String(inv.discountValue) : '');
      // Pre-fill payment amount with remaining balance
      const balance = inv.totalAmount - inv.paidAmount;
      setPaymentAmount(balance > 0 ? String(balance) : '');
    }
    setPayMode('full');
    setInstCount(3);
    setInstDownPct(20);
    setInstNotes('');
    setSelectedInvoiceId(invoiceId);
  };

  // ── Installment helpers ───────────────────────────────────────────────────
  const instSettings = user?.clinicId ? getInstallmentSettings(user.clinicId) : null;

  const getInstallmentPreview = (total: number) => {
    const down = Math.round(total * instDownPct / 100);
    const remaining = total - down;
    const perInst = Math.ceil(remaining / instCount);
    return { down, remaining, perInst };
  };

  const handleCreateInstallmentPlan = async () => {
    if (!selectedInvoice || !user) return;
    const patient = patients.find(p => p.id === selectedInvoice.patientId);
    if (!patient) { toast.error(language === 'ar' ? 'لم يتم العثور على المريض' : 'Patient not found'); return; }
    const { down } = getInstallmentPreview(selectedInvoice.totalAmount);
    // Record down payment as a regular payment first
    if (down > 0) {
      await addPayment({ invoiceId: selectedInvoice.id, amount: down, method: paymentMethod, receivedBy: user.id });
    }
    createInstallmentPlan({
      clinicId: clinicId,
      invoiceId: selectedInvoice.id,
      patientId: patient.id,
      patientName: language === 'ar' ? patient.nameAr : patient.name,
      patientPhone: patient.phone ?? '',
      totalAmount: selectedInvoice.totalAmount,
      downPayment: down,
      installmentCount: instCount,
      createdBy: user.id,
      notes: instNotes,
    });
    logAudit({
      userId: user.id, userName: user.name, clinicId,
      action: 'create', entity: 'invoice', entityId: selectedInvoice.id,
      severity: 'info',
      description: `Installment plan created: ${instCount} installments, down payment ${down} ج.م`,
      metadata: { instCount, down, patientId: patient.id },
    });
    setInstConfirmOpen(false);
    setSelectedInvoiceId(null);
    toast.success(language === 'ar' ? 'تم إنشاء خطة التقسيط بنجاح' : 'Installment plan created successfully');
  };

  const hasExistingPlan = (invoiceId: string) =>
    getPlansForClinic(clinicId).some(p => p.invoiceId === invoiceId);

  const handleAddPayment = () => {
    if (!selectedInvoiceId || !user) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error(language === 'ar' ? 'يرجى إدخال مبلغ صحيح أكبر من صفر' : 'Please enter a valid amount greater than zero');
      return;
    }
    setConfirmPaymentOpen(true);
  };

  const confirmPayment = async () => {
    if (!selectedInvoiceId || !paymentAmount || !user) return;
    const raw = parseFloat(paymentAmount);
    const inv = invoices.find(i => i.id === selectedInvoiceId);
    const balance = inv ? (inv.totalAmount - inv.paidAmount) : Infinity;
    // Cap at remaining balance — never accept overpayment
    const amount = balance !== Infinity ? Math.min(raw, balance) : raw;
    if (amount <= 0) return;
    await addPayment({
      invoiceId: selectedInvoiceId,
      amount,
      method: paymentMethod,
      receivedBy: user.id,
    });
    logAudit({
      userId: user.id, userName: user.name, clinicId,
      action: 'update', entity: 'invoice', entityId: selectedInvoiceId,
      severity: 'info',
      description: `Payment of ${amount} ج.م recorded via ${paymentMethod}`,
      metadata: { amount, method: paymentMethod, invoiceId: selectedInvoiceId },
    });
    const newBalance = balance - amount;
    setPaymentAmount(newBalance > 0 ? String(newBalance) : '');
    setConfirmPaymentOpen(false);
    toast.success(language === 'ar' ? 'تم تسجيل الدفعة بنجاح' : 'Payment recorded successfully');
    // Close invoice dialog automatically when fully paid
    if (amount >= balance) {
      setSelectedInvoiceId(null);
    }
  };

  const paymentMethodLabel = (m: string) => {
    if (language === 'ar') {
      return m === 'cash' ? 'نقدي' : m === 'card' ? 'بطاقة' : m === 'insurance' ? 'تأمين' : 'تحويل بنكي';
    }
    return m === 'cash' ? 'Cash' : m === 'card' ? 'Card' : m === 'insurance' ? 'Insurance' : 'Bank Transfer';
  };

  const handleApplyDiscount = async () => {
    if (!selectedInvoiceId || !user) return;
    const value = parseFloat(discountValue) || 0;
    // Block high percentage discount (>30%) for non-admin roles
    if (discountType === 'percentage' && value > HIGH_DISCOUNT_THRESHOLD && !canApplyHighDiscount) {
      toast.error(language === 'ar' ? 'ليس لديك صلاحية لتطبيق خصم أكبر من 30%' : 'Not authorized: discount above 30% requires admin approval');
      auditDenied({
        userId: user.id, userName: user.name, clinicId,
        entity: 'invoice', entityId: selectedInvoiceId,
        description: `High discount attempt blocked: ${value}% by role=${user.role}`,
      });
      return;
    }
    await updateInvoiceDiscount(selectedInvoiceId, discountType, value);
    logAudit({
      userId: user.id, userName: user.name, clinicId,
      action: 'update', entity: 'invoice', entityId: selectedInvoiceId,
      severity: value > HIGH_DISCOUNT_THRESHOLD ? 'warn' : 'info',
      description: `Discount applied: ${discountType === 'percentage' ? `${value}%` : `${value} ج.م fixed`}`,
      metadata: { discountType, discountValue: value, invoiceId: selectedInvoiceId },
    });
    toast.success(language === 'ar' ? 'تم تطبيق الخصم' : 'Discount applied');
  };

  const handleRefundInvoice = async (invoiceId: string) => {
    if (!user) return;
    if (!canRefund) {
      toast.error(language === 'ar' ? 'ليس لديك صلاحية لاسترداد الفواتير' : 'Not authorized: only admins can issue refunds');
      auditDenied({
        userId: user.id, userName: user.name, clinicId,
        entity: 'invoice', entityId: invoiceId,
        description: `Refund attempt blocked for role=${user.role ?? 'unknown'}`,
      });
      return;
    }
    await refundInvoice(invoiceId);
    logAudit({
      userId: user.id, userName: user.name, clinicId,
      action: 'delete', entity: 'invoice', entityId: invoiceId,
      severity: 'warn',
      description: `Invoice refunded by ${user.name ?? user.id}`,
      metadata: { invoiceId, role: user.role },
    });
    toast.success(language === 'ar' ? 'تم استرداد المبلغ' : 'Invoice refunded');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid': return <Badge data-testid="badge-status-paid">{t('billing.paid')}</Badge>;
      case 'partially_paid': return <Badge variant="secondary" data-testid="badge-status-partial">{language === 'ar' ? 'مدفوع جزئياً' : 'Partial'}</Badge>;
      case 'refunded': return <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400" data-testid="badge-status-refunded">{language === 'ar' ? 'مسترد' : 'Refunded'}</Badge>;
      default: return <Badge variant="destructive" data-testid="badge-status-unpaid">{t('billing.unpaid')}</Badge>;
    }
  };

  const handlePrintPaymentSlip = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const payments = getPaymentsForInvoice(invoiceId);
    const patientName = getPatientName(inv.patientId) || '';
    const dir = isRTL ? 'rtl' : 'ltr';
    const clinicName = isRTL ? settings.nameAr : settings.name;
    const clinicPhone = settings.phone;
    const lastPayment = payments[payments.length - 1];
    const methodLabels: Record<string, string> = { cash: isRTL ? 'نقدي' : 'Cash', card: isRTL ? 'بطاقة' : 'Card', insurance: isRTL ? 'تأمين' : 'Insurance', bank_transfer: isRTL ? 'تحويل' : 'Transfer' };
    const html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><title>${isRTL ? 'إيصال دفع' : 'Payment Slip'}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;padding:24px;color:#111;max-width:320px}
.center{text-align:center}.divider{border:none;border-top:1px dashed #ccc;margin:12px 0}
.row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0}
.big{font-size:22px;font-weight:700;color:#2563eb}.label{color:#666;font-size:11px}
@media print{body{padding:12px}}</style></head>
<body>
<div class="center" style="margin-bottom:16px">
  ${settings.logo ? `<img src="${settings.logo}" style="width:40px;height:40px;border-radius:8px;object-fit:cover;margin-bottom:6px" alt="">` : ''}
  <p style="font-weight:700;font-size:15px">${clinicName}</p>
  ${clinicPhone ? `<p class="label">${clinicPhone}</p>` : ''}
</div>
<hr class="divider">
<p class="center" style="font-weight:600;font-size:14px;margin-bottom:12px">${isRTL ? 'إيصال دفع' : 'PAYMENT SLIP'}</p>
<div class="row"><span class="label">${isRTL ? 'المريض' : 'Patient'}</span><span style="font-weight:600">${patientName}</span></div>
<div class="row"><span class="label">${isRTL ? 'رقم الفاتورة' : 'Invoice #'}</span><span style="font-family:monospace">${inv.id.slice(0, 12)}</span></div>
<div class="row"><span class="label">${isRTL ? 'التاريخ' : 'Date'}</span><span>${lastPayment?.date || inv.createdAt.split('T')[0]}</span></div>
<div class="row"><span class="label">${isRTL ? 'طريقة الدفع' : 'Method'}</span><span>${methodLabels[lastPayment?.method || 'cash'] || lastPayment?.method || ''}</span></div>
<hr class="divider">
<div class="row" style="margin-top:4px"><span style="font-size:13px">${isRTL ? 'المبلغ المدفوع' : 'Amount Paid'}</span><span class="big">${inv.paidAmount.toFixed(2)} ج.م</span></div>
${inv.totalAmount - inv.paidAmount > 0 ? `<div class="row"><span class="label">${isRTL ? 'المتبقي' : 'Balance'}</span><span style="color:#dc2626;font-weight:600">${(inv.totalAmount - inv.paidAmount).toFixed(2)} ج.م</span></div>` : `<p style="text-align:center;color:#16a34a;font-size:12px;margin-top:6px">${isRTL ? '✓ مدفوع بالكامل' : '✓ Fully Paid'}</p>`}
<hr class="divider">
<p class="center label" style="margin-top:8px">${isRTL ? 'شكراً لكم' : 'Thank you'}</p>
</body></html>`;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
  };

  const handlePrintInvoice = (invoiceId: string) => {
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const items = getItemsForInvoice(invoiceId);
    const payments = getPaymentsForInvoice(invoiceId);
    const patientName = getPatientName(inv.patientId) || '';
    const dir = isRTL ? 'rtl' : 'ltr';
    const totals = calcInvoiceTotals(inv, settings);

    const itemRows = items.map(item =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee">${getServiceName(item.serviceId)}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.unitPrice} ج.م</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:${isRTL ? 'left' : 'right'}">${item.totalPrice} ج.م</td></tr>`
    ).join('');

    const paymentRows = payments.map(p =>
      `<tr><td style="padding:6px;border-bottom:1px solid #eee">${p.date}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${p.method}</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:${isRTL ? 'left' : 'right'}">${p.amount} ج.م</td></tr>`
    ).join('');

    const clinicName = isRTL ? settings.nameAr : settings.name;
    const clinicAddress = isRTL ? settings.addressAr : settings.address;
    const clinicPhone = settings.phone;
    const clinicEmail = settings.email;

    const discountLabel = inv.discountType === 'percentage'
      ? `${isRTL ? 'خصم' : 'Discount'} (${inv.discountValue}%)`
      : (isRTL ? 'خصم' : 'Discount');

    const summaryRows = [
      `<div style="display:flex;justify-content:space-between;padding:4px 0"><span class="label">${isRTL ? 'المجموع الفرعي' : 'Subtotal'}</span><span>${totals.subtotal.toFixed(2)} ج.م</span></div>`,
      totals.discountAmount > 0 ? `<div style="display:flex;justify-content:space-between;padding:4px 0;color:#dc2626"><span class="label">${discountLabel}</span><span>-${totals.discountAmount.toFixed(2)} ج.م</span></div>` : '',
      settings.taxEnabled ? `<div style="display:flex;justify-content:space-between;padding:4px 0"><span class="label">${isRTL ? settings.taxLabelAr : settings.taxLabel} (${settings.taxRate}%)</span><span>${totals.taxAmount.toFixed(2)} ج.م</span></div>` : '',
      `<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid #e5e5e5;margin-top:4px;padding-top:8px"><span class="label" style="font-weight:600">${isRTL ? 'الإجمالي' : 'Grand Total'}</span><span class="total-row">${totals.grandTotal.toFixed(2)} ج.م</span></div>`,
      `<div style="display:flex;justify-content:space-between;padding:4px 0"><span class="label">${isRTL ? 'المدفوع' : 'Paid'}</span><span>${inv.paidAmount.toFixed(2)} ج.م</span></div>`,
      `<div style="display:flex;justify-content:space-between;padding:4px 0"><span class="label">${isRTL ? 'المتبقي' : 'Balance'}</span><span style="font-weight:600">${totals.balance.toFixed(2)} ج.م</span></div>`,
    ].filter(Boolean).join('');

    const html = `<!DOCTYPE html><html dir="${dir}"><head><meta charset="utf-8"><title>${isRTL ? 'فاتورة' : 'Invoice'} - ${inv.id.slice(0, 12)}</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:40px;color:#1a1a1a}h1{font-size:24px;margin:0}table{width:100%;border-collapse:collapse;margin:16px 0}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px}.total-row{font-weight:700;font-size:16px}.label{color:#666;font-size:13px}.divider{border:none;border-top:2px solid #e5e5e5;margin:20px 0}.clinic-logo{width:56px;height:56px;border-radius:12px;background:linear-gradient(135deg,#2563eb,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;font-weight:700}@media print{body{padding:20px}}</style></head><body>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid #2563eb">
      ${settings.logo ? `<img src="${settings.logo}" style="width:56px;height:56px;border-radius:12px;object-fit:cover" alt="Logo">` : `<div class="clinic-logo">${(isRTL ? settings.nameAr : settings.name).slice(0,2).toUpperCase()}</div>`}
      <div style="flex:1">
        <h2 style="margin:0;font-size:20px;color:#1a1a1a">${clinicName}</h2>
        <p style="margin:4px 0 0;font-size:12px;color:#666">${clinicAddress}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#666">${clinicPhone} · ${clinicEmail}</p>
      </div>
    </div>
    <div class="header"><div><h1>${isRTL ? 'فاتورة' : 'Invoice'}</h1><p class="label">#${inv.id.slice(0, 12)}</p></div><div style="text-align:${isRTL ? 'left' : 'right'}"><p class="label">${isRTL ? 'التاريخ' : 'Date'}</p><p>${inv.createdAt.split('T')[0]}</p></div></div>
    <div style="margin-bottom:24px"><p class="label">${isRTL ? 'المريض' : 'Patient'}</p><p style="font-size:16px;font-weight:600">${patientName}</p></div>
    <hr class="divider">
    <table><thead><tr style="background:#f9f9f9"><th style="padding:8px;text-align:${isRTL ? 'right' : 'left'}">${isRTL ? 'الخدمة' : 'Service'}</th><th style="padding:8px;text-align:center">${isRTL ? 'الكمية' : 'Qty'}</th><th style="padding:8px;text-align:center">${isRTL ? 'السعر' : 'Price'}</th><th style="padding:8px;text-align:${isRTL ? 'left' : 'right'}">${isRTL ? 'المجموع' : 'Total'}</th></tr></thead><tbody>${itemRows}</tbody></table>
    <hr class="divider">
    <div style="display:flex;justify-content:flex-end"><div style="min-width:220px">${summaryRows}</div></div>
    ${payments.length > 0 ? `<hr class="divider"><p class="label" style="margin-bottom:8px">${isRTL ? 'سجل الدفعات' : 'Payment History'}</p><table><thead><tr style="background:#f9f9f9"><th style="padding:6px;text-align:${isRTL ? 'right' : 'left'}">${isRTL ? 'التاريخ' : 'Date'}</th><th style="padding:6px;text-align:center">${isRTL ? 'الطريقة' : 'Method'}</th><th style="padding:6px;text-align:${isRTL ? 'left' : 'right'}">${isRTL ? 'المبلغ' : 'Amount'}</th></tr></thead><tbody>${paymentRows}</tbody></table>` : ''}
    <div style="text-align:center;margin-top:40px;color:#999;font-size:12px">${isRTL ? 'شكراً لكم' : 'Thank you for your payment'}</div>
    </body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => { printWindow.print(); };
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('billing.title')}</h1>
        <p className="text-muted-foreground">{activeInvoices.length} {language === 'ar' ? 'فاتورة' : 'invoices'}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-t-4 border-t-primary" data-testid="card-total-revenue">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Receipt className="h-6 w-6 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-foreground leading-tight">{totalRevenue.toLocaleString()} ج.م</p>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{language === 'ar' ? 'إجمالي الإيرادات' : 'Total Revenue'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-green-500 dark:border-t-green-400" data-testid="card-paid-revenue">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-foreground leading-tight">{paidRevenue.toLocaleString()} ج.م</p>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{t('billing.paid')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-t-4 border-t-destructive" data-testid="card-unpaid-revenue">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-foreground leading-tight">{pendingRevenue.toLocaleString()} ج.م</p>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{t('billing.unpaid')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={language === 'ar' ? 'بحث بالاسم أو رقم الفاتورة...' : 'Search by name or invoice number...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 rtl:pl-3 rtl:pr-10"
          data-testid="input-search-billing"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-2">
            {['all', 'pending', 'partially_paid', 'paid', 'refunded'].map(status => (
              <Button key={status} variant={filterStatus === status ? 'default' : 'outline'} size="sm" onClick={() => setFilterStatus(status)}>
                {status === 'all' ? t('common.all') : status === 'paid' ? t('billing.paid') : status === 'partially_paid' ? (language === 'ar' ? 'جزئي' : 'Partial') : status === 'refunded' ? (language === 'ar' ? 'مسترد' : 'Refunded') : t('billing.unpaid')}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('billing.invoice')}</TableHead>
                <TableHead>{t('billing.patient')}</TableHead>
                <TableHead>{t('billing.date')}</TableHead>
                <TableHead>{t('billing.total')}</TableHead>
                <TableHead>{t('billing.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(inv => (
                <TableRow key={inv.id} className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => openInvoiceDialog(inv.id)}>
                  <TableCell><span className="font-mono font-medium">{inv.id.slice(0, 12)}</span></TableCell>
                  <TableCell>{getPatientName(inv.patientId)}</TableCell>
                  <TableCell className="text-muted-foreground">{inv.createdAt.split('T')[0]}</TableCell>
                  <TableCell>
                    <span className="font-semibold">{inv.totalAmount} ج.م</span>
                    {inv.discountType !== 'none' && inv.discountValue > 0 && (
                      <Badge variant="outline" className="ml-2 text-xs gap-1">
                        <Tag className="h-3 w-3" />
                        {inv.discountType === 'percentage' ? `${inv.discountValue}%` : `${inv.discountValue} ج.م`}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(inv.status)}</TableCell>
                  <TableCell className="text-right space-x-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openInvoiceDialog(inv.id)} data-testid={`button-view-invoice-${inv.id}`}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {inv.status === 'paid' && (
                      <Button variant="ghost" size="sm" onClick={() => handlePrintInvoice(inv.id)} data-testid={`button-print-invoice-${inv.id}`}>
                        <Printer className="h-4 w-4" />
                      </Button>
                    )}
                    {(inv.status === 'paid' || inv.status === 'partially_paid') && (
                      <Button variant="ghost" size="sm" title={language === 'ar' ? 'طباعة إيصال الدفع' : 'Print Payment Slip'} onClick={() => handlePrintPaymentSlip(inv.id)} data-testid={`button-slip-${inv.id}`}>
                        <FileText className="h-4 w-4" />
                      </Button>
                    )}
                    {inv.status === 'paid' && (user?.role === 'admin' || user?.role === 'reception') && (
                      <Button variant="ghost" size="sm" onClick={() => handleRefundInvoice(inv.id)} className="text-amber-600 dark:text-amber-400" data-testid={`button-refund-invoice-${inv.id}`}>
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                      <Receipt className="h-10 w-10 opacity-40" />
                      <p className="text-sm font-medium">{language === 'ar' ? 'لا توجد فواتير' : 'No invoices found'}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={confirmPaymentOpen} onOpenChange={setConfirmPaymentOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'ar' ? 'تأكيد تسجيل الدفعة' : 'Confirm Payment'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ar'
                ? `هل تريد تسجيل دفعة بمبلغ ${paymentAmount} ج.م عن طريق ${paymentMethodLabel(paymentMethod)}؟ لا يمكن التراجع عن هذه العملية.`
                : `Record a payment of ${paymentAmount} ج.م via ${paymentMethodLabel(paymentMethod)}? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'ar' ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPayment}>
              {language === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!selectedInvoice} onOpenChange={open => !open && setSelectedInvoiceId(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t('billing.invoice')}
            </DialogTitle>
          </DialogHeader>
          {selectedInvoice && (() => {
            const totals = calcInvoiceTotals(selectedInvoice, settings);
            return (
              <div className="space-y-5">
                <div className="flex flex-wrap justify-between items-start gap-3 rounded-lg bg-muted/50 p-4">
                  <div>
                    <p className="font-semibold text-base" data-testid="text-invoice-patient">{getPatientName(selectedInvoice.patientId)}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{selectedInvoice.createdAt.split('T')[0]}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-1">#{selectedInvoice.id.slice(0, 12)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getStatusBadge(selectedInvoice.status)}
                    {selectedInvoice.status === 'paid' && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => handlePrintInvoice(selectedInvoice.id)} data-testid="button-print-invoice">
                        <Printer className="h-4 w-4" />
                        {language === 'ar' ? 'طباعة' : 'Print'}
                      </Button>
                    )}
                    {(selectedInvoice.status === 'paid' || selectedInvoice.status === 'partially_paid') && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => handlePrintPaymentSlip(selectedInvoice.id)} data-testid="button-print-slip">
                        <FileText className="h-4 w-4" />
                        {language === 'ar' ? 'إيصال' : 'Slip'}
                      </Button>
                    )}
                    {selectedInvoice.status === 'paid' && (user?.role === 'admin' || user?.role === 'reception') && (
                      <Button variant="outline" size="sm" className="gap-1 text-amber-600 dark:text-amber-400 border-amber-500" onClick={() => handleRefundInvoice(selectedInvoice.id)} data-testid="button-refund-invoice-dialog">
                        <Undo2 className="h-4 w-4" />
                        {language === 'ar' ? 'استرداد' : 'Refund'}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Insurance copay banner */}
                {(() => {
                  const patient = patients.find(p => p.id === selectedInvoice.patientId);
                  if (!patient?.insuranceCompanyId) return null;
                  const company = getInsuranceCompany(patient.insuranceCompanyId);
                  const clinicId = user?.clinicId ?? 'clinic-1';
                  const split = calculateBillingSplit(clinicId, patient.insuranceCompanyId, 'Consultation', totals.grandTotal);
                  return (
                    <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 text-sm">
                      <ShieldCheck className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      <div className="space-y-0.5">
                        <p className="font-medium text-blue-800 dark:text-blue-300">
                          {isRTL ? `مشمول بتأمين ${company ? (language === 'ar' ? company.nameAr : company.name) : ''}` : `Insured — ${company ? (language === 'ar' ? company.nameAr : company.name) : ''}`}
                        </p>
                        <p className="text-blue-700 dark:text-blue-400">
                          {isRTL
                            ? `المريض يدفع: ${split.patientPays.toFixed(2)} ج.م (${split.copayPct}%) — التأمين يغطي: ${split.insurancePays.toFixed(2)} ج.م`
                            : `Patient pays: ${split.patientPays.toFixed(2)} ج.م (${split.copayPct}%) — Insurer covers: ${split.insurancePays.toFixed(2)} ج.م`}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-3">{t('billing.services')}</p>
                  <div className="space-y-2">
                    {selectedItems.map(item => (
                      <div key={item.id} className="flex justify-between items-center text-sm py-1.5 px-2 rounded-md bg-muted/30">
                        <span>{getServiceName(item.serviceId)} × {item.quantity}</span>
                        <span className="font-medium">{item.totalPrice} ج.م</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2 rounded-lg border p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{language === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
                    <span>{totals.subtotal.toFixed(2)} ج.م</span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-destructive">
                      <span>
                        {language === 'ar' ? 'خصم' : 'Discount'}
                        {selectedInvoice.discountType === 'percentage' ? ` (${selectedInvoice.discountValue}%)` : ''}
                      </span>
                      <span>-{totals.discountAmount.toFixed(2)} ج.م</span>
                    </div>
                  )}
                  {settings.taxEnabled && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{language === 'ar' ? settings.taxLabelAr : settings.taxLabel} ({settings.taxRate}%)</span>
                      <span>{totals.taxAmount.toFixed(2)} ج.م</span>
                    </div>
                  )}
                  <Separator className="my-1" />
                  <div className="flex justify-between font-semibold">
                    <span>{language === 'ar' ? 'الإجمالي' : 'Grand Total'}</span>
                    <span>{totals.grandTotal.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{t('billing.paid')}</span>
                    <span>{selectedInvoice.paidAmount.toFixed(2)} ج.م</span>
                  </div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>{language === 'ar' ? 'المتبقي' : 'Balance'}</span>
                    <span>{totals.balance.toFixed(2)} ج.م</span>
                  </div>
                </div>

                {/* Discount controls */}
                {selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'refunded' && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <p className="font-medium text-sm flex items-center gap-1">
                        <Tag className="h-4 w-4" />
                        {language === 'ar' ? 'خصم' : 'Discount'}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{language === 'ar' ? 'النوع' : 'Type'}</Label>
                          <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-60 overflow-y-auto">
                              <SelectItem value="none">{language === 'ar' ? 'بدون' : 'None'}</SelectItem>
                              <SelectItem value="percentage">{language === 'ar' ? 'نسبة %' : 'Percentage'}</SelectItem>
                              <SelectItem value="fixed">{language === 'ar' ? 'مبلغ ثابت' : 'Fixed'}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{language === 'ar' ? 'القيمة' : 'Value'}</Label>
                          <Input
                            type="number"
                            value={discountValue}
                            onChange={e => setDiscountValue(e.target.value)}
                            placeholder={discountType === 'percentage' ? '10' : '50'}
                            disabled={discountType === 'none'}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs opacity-0">.</Label>
                          <Button
                            variant="outline"
                            className="w-full"
                            size="default"
                            onClick={handleApplyDiscount}
                            disabled={discountType === 'none'}
                          >
                            {language === 'ar' ? 'تطبيق' : 'Apply'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Payment controls */}
                {selectedInvoice.status !== 'paid' && selectedInvoice.status !== 'refunded' && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      {/* Pay mode toggle */}
                      {instSettings?.enabled && selectedInvoice.totalAmount >= (instSettings.minAmount ?? 0) && !hasExistingPlan(selectedInvoice.id) && (
                        <div className="flex gap-2 p-1 rounded-lg border bg-muted/40">
                          <button
                            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${payMode === 'full' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                            onClick={() => setPayMode('full')}
                            data-testid="button-pay-full"
                          >
                            <DollarSign className="h-3.5 w-3.5 inline me-1" />
                            {language === 'ar' ? 'دفع كامل' : 'Full Payment'}
                          </button>
                          <button
                            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${payMode === 'installment' ? 'bg-background shadow text-foreground' : 'text-muted-foreground'}`}
                            onClick={() => setPayMode('installment')}
                            data-testid="button-pay-installment"
                          >
                            <CreditCard className="h-3.5 w-3.5 inline me-1" />
                            {language === 'ar' ? 'تقسيط' : 'Installments'}
                          </button>
                        </div>
                      )}

                      {hasExistingPlan(selectedInvoice.id) && (
                        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs text-primary">
                          <CreditCard className="h-3.5 w-3.5 shrink-0" />
                          {language === 'ar' ? 'هذه الفاتورة لديها خطة تقسيط — تحقق من صفحة الأقساط' : 'This invoice has an installment plan — check the Installments page'}
                        </div>
                      )}

                      {payMode === 'full' ? (
                        <>
                          <p className="font-medium text-sm">{language === 'ar' ? 'تسجيل دفعة' : 'Record Payment'}</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">{language === 'ar' ? 'المبلغ' : 'Amount'}</Label>
                              <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{language === 'ar' ? 'الطريقة' : 'Method'}</Label>
                              <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent className="max-h-60 overflow-y-auto">
                                  <SelectItem value="cash">{language === 'ar' ? 'نقدي' : 'Cash'}</SelectItem>
                                  <SelectItem value="card">{language === 'ar' ? 'بطاقة' : 'Card'}</SelectItem>
                                  <SelectItem value="insurance">{language === 'ar' ? 'تأمين' : 'Insurance'}</SelectItem>
                                  <SelectItem value="bank_transfer">{language === 'ar' ? 'تحويل' : 'Transfer'}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button className="w-full gap-2" onClick={handleAddPayment}>
                            <DollarSign className="h-4 w-4" />
                            {language === 'ar' ? 'تسجيل الدفعة' : 'Record Payment'}
                          </Button>
                        </>
                      ) : (
                        /* Installment mode */
                        (() => {
                          const preview = getInstallmentPreview(selectedInvoice.totalAmount);
                          const maxInst = instSettings?.maxInstallments ?? 12;
                          return (
                            <div className="space-y-3">
                              <p className="font-medium text-sm flex items-center gap-1">
                                <CreditCard className="h-4 w-4 text-primary" />
                                {language === 'ar' ? 'إعداد خطة التقسيط' : 'Setup Installment Plan'}
                              </p>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">{language === 'ar' ? 'عدد الأقساط' : 'No. of Installments'}</Label>
                                  <Select value={String(instCount)} onValueChange={v => setInstCount(Number(v))}>
                                    <SelectTrigger data-testid="select-inst-count"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {[2, 3, 4, 6, 9, 12].filter(n => n <= maxInst).map(n => (
                                        <SelectItem key={n} value={String(n)}>{n} {language === 'ar' ? 'أقساط' : 'installments'}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{language === 'ar' ? 'الدفعة المقدمة %' : 'Down Payment %'}</Label>
                                  <Select value={String(instDownPct)} onValueChange={v => setInstDownPct(Number(v))}>
                                    <SelectTrigger data-testid="select-inst-down"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {[0, 10, 20, 25, 30, 40, 50].map(n => (
                                        <SelectItem key={n} value={String(n)}>{n}%</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{language === 'ar' ? 'طريقة الدفعة المقدمة' : 'Down Payment Method'}</Label>
                                <Select value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent className="max-h-60 overflow-y-auto">
                                    <SelectItem value="cash">{language === 'ar' ? 'نقدي' : 'Cash'}</SelectItem>
                                    <SelectItem value="card">{language === 'ar' ? 'بطاقة' : 'Card'}</SelectItem>
                                    <SelectItem value="bank_transfer">{language === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {/* Preview */}
                              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{language === 'ar' ? 'إجمالي الفاتورة' : 'Invoice Total'}</span>
                                  <span className="font-medium">{selectedInvoice.totalAmount.toLocaleString()} ج.م</span>
                                </div>
                                <div className="flex justify-between text-green-700 dark:text-green-400">
                                  <span>{language === 'ar' ? 'الدفعة المقدمة الآن' : 'Down Payment Now'}</span>
                                  <span className="font-semibold">{preview.down.toLocaleString()} ج.م</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">{language === 'ar' ? `${instCount} قسط شهري` : `${instCount} monthly installments`}</span>
                                  <span className="font-semibold">{preview.perInst.toLocaleString()} ج.م {language === 'ar' ? '/ قسط' : '/ inst.'}</span>
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">{language === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optional)'}</Label>
                                <Input
                                  value={instNotes}
                                  onChange={e => setInstNotes(e.target.value)}
                                  placeholder={language === 'ar' ? 'أي ملاحظات...' : 'Any notes...'}
                                />
                              </div>
                              <Button
                                className="w-full gap-2"
                                onClick={() => setInstConfirmOpen(true)}
                                data-testid="button-create-installment"
                              >
                                <CreditCard className="h-4 w-4" />
                                {language === 'ar' ? 'إنشاء خطة التقسيط' : 'Create Installment Plan'}
                              </Button>
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
      {/* Installment confirm dialog */}
      <AlertDialog open={instConfirmOpen} onOpenChange={setInstConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'ar' ? 'تأكيد إنشاء خطة التقسيط' : 'Confirm Installment Plan'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedInvoice && (() => {
                const preview = getInstallmentPreview(selectedInvoice.totalAmount);
                return language === 'ar'
                  ? `سيتم إنشاء خطة تقسيط بدفعة مقدمة ${preview.down} ج.م الآن، ثم ${instCount} قسط شهري بقيمة ${preview.perInst} ج.م.`
                  : `An installment plan will be created with a down payment of ${preview.down} EGP now, then ${instCount} monthly installments of ${preview.perInst} EGP.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'ar' ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateInstallmentPlan}>
              {language === 'ar' ? 'تأكيد وإنشاء' : 'Confirm & Create'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Billing;
