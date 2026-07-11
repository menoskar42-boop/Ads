import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePatients } from '@/hooks/usePatients';
import { useUsers } from '@/hooks/useUsers';
import {
  getClinicLabOrders, getClinicLabs, createLabOrder, updateLabOrderStatus,
  updateLabOrderPayment, deleteLabOrder, addLab, generateWhatsAppMessage,
  COMMON_LAB_ITEMS, LabOrder, LabOrderStatus, Lab,
} from '@/stores/labOrderStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  FlaskConical, Plus, Send, Package, CheckCircle2, Truck,
  MessageSquare, DollarSign, Trash2, Search, Clock, X,
  Building2, Phone, User,
} from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';
import { useClinicSettings } from '@/hooks/useClinicSettings';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<LabOrderStatus, { en: string; ar: string; color: string; icon: React.ReactNode }> = {
  draft:      { en: 'Draft',        ar: 'مسودة',         color: 'bg-muted text-muted-foreground',                                                      icon: <Clock className="h-3 w-3" /> },
  sent:       { en: 'Sent',         ar: 'أُرسل',          color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',                    icon: <Send className="h-3 w-3" /> },
  in_progress:{ en: 'In Progress',  ar: 'قيد التنفيذ',    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',                icon: <FlaskConical className="h-3 w-3" /> },
  ready:      { en: 'Ready',        ar: 'جاهز',           color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',            icon: <Package className="h-3 w-3" /> },
  received:   { en: 'Received',     ar: 'تم الاستلام',    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',                    icon: <CheckCircle2 className="h-3 w-3" /> },
  delivered:  { en: 'Delivered',    ar: 'تم التسليم',     color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',                icon: <Truck className="h-3 w-3" /> },
  cancelled:  { en: 'Cancelled',    ar: 'ملغي',           color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',                        icon: <X className="h-3 w-3" /> },
};

// Next allowed transitions
const NEXT_STATUS: Partial<Record<LabOrderStatus, LabOrderStatus>> = {
  draft: 'sent',
  sent: 'in_progress',
  in_progress: 'ready',
  ready: 'received',
  received: 'delivered',
};

const NEXT_LABEL: Partial<Record<LabOrderStatus, { en: string; ar: string }>> = {
  draft: { en: 'Mark Sent', ar: 'تأشير كمُرسل' },
  sent: { en: 'In Progress', ar: 'قيد التنفيذ' },
  in_progress: { en: 'Mark Ready', ar: 'تأشير جاهز' },
  ready: { en: 'Mark Received', ar: 'تأشير مستلم' },
  received: { en: 'Mark Delivered', ar: 'تأشير مسلّم' },
};

// ─── Main Component ───────────────────────────────────────────────────────────
const LabOrders: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { patients } = usePatients();
  const { activeDoctors } = useUsers();
  const isAr = language === 'ar';

  const clinicId = user?.clinicId || 'clinic-nile';
  const { settings: clinicSettings } = useClinicSettings();
  const labs = getClinicLabs(clinicId);

  const [orders, setOrders] = useState<LabOrder[]>(() => getClinicLabOrders(clinicId));
  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'pending' | 'delivered'>('all');

  // New order dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    patientId: '', doctorId: '', labId: '', dueDate: '', notes: '',
  });
  const [newItems, setNewItems] = useState<Array<{ name: string; nameAr: string; quantity: number; unitPrice: number; shade: string; toothNumbers: string; notes: string }>>([]);

  // Payment dialog
  const [payOpen, setPayOpen] = useState<{ orderId: string; current: number; total: number } | null>(null);
  const [payAmount, setPayAmount] = useState('');

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const refresh = () => setOrders(getClinicLabOrders(clinicId));

  // ─── Filtering
  const filtered = useMemo(() => {
    let list = orders;
    if (tabFilter === 'pending') list = list.filter(o => !['delivered', 'cancelled'].includes(o.status));
    if (tabFilter === 'delivered') list = list.filter(o => o.status === 'delivered');
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(o => {
        const p = patients.find(x => x.id === o.patientId);
        return p?.name.toLowerCase().includes(q) || p?.nameAr.includes(search) || o.labName.toLowerCase().includes(q);
      });
    }
    return list;
  }, [orders, tabFilter, search, patients]);

  const pendingCount = orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length;

  // ─── Stats
  const stats = useMemo(() => ({
    total: orders.length,
    pending: pendingCount,
    delivered: orders.filter(o => o.status === 'delivered').length,
    totalValue: orders.reduce((s, o) => s + o.totalPrice, 0),
    unpaidValue: orders.reduce((s, o) => s + (o.totalPrice - o.paidAmount), 0),
  }), [orders, pendingCount]);

  // ─── Helpers
  const getPatientName = (id: string) => {
    const p = patients.find(x => x.id === id);
    return isAr ? p?.nameAr : p?.name;
  };
  const getDoctorName = (id: string) => {
    const d = activeDoctors.find(x => x.id === id);
    return isAr ? d?.nameAr : d?.name;
  };

  // ─── Add item to new order
  const addItem = () => {
    setNewItems(prev => [...prev, { name: '', nameAr: '', quantity: 1, unitPrice: 0, shade: '', toothNumbers: '', notes: '' }]);
  };
  const updateItem = (idx: number, key: string, val: string | number) => {
    setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  };
  const removeItem = (idx: number) => setNewItems(prev => prev.filter((_, i) => i !== idx));

  const selectCommonItem = (idx: number, itemName: string) => {
    const found = COMMON_LAB_ITEMS.find(x => x.name === itemName);
    if (!found) return;
    setNewItems(prev => prev.map((it, i) => i === idx ? { ...it, name: found.name, nameAr: found.nameAr } : it));
  };

  // ─── Submit new order
  const handleCreate = () => {
    if (!newForm.patientId || !newForm.labId || !newForm.dueDate || newItems.length === 0) {
      toast.error(isAr ? 'يرجى ملء جميع الحقول المطلوبة وإضافة عنصر واحد على الأقل' : 'Fill all required fields and add at least one item');
      return;
    }
    const lab = labs.find(l => l.id === newForm.labId)!;
    createLabOrder({
      clinicId,
      patientId: newForm.patientId,
      doctorId: newForm.doctorId || user!.id,
      labId: newForm.labId,
      labName: lab.name,
      labPhone: lab.phone,
      dueDate: newForm.dueDate,
      notes: newForm.notes,
      items: newItems.map(it => ({
        name: it.name || it.nameAr,
        nameAr: it.nameAr || it.name,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        shade: it.shade || undefined,
        toothNumbers: it.toothNumbers ? it.toothNumbers.split(',').map(Number).filter(Boolean) : undefined,
        notes: it.notes || undefined,
      })),
    });
    toast.success(isAr ? 'تم إنشاء طلب المعمل' : 'Lab order created');
    setCreateOpen(false);
    setNewForm({ patientId: '', doctorId: '', labId: '', dueDate: '', notes: '' });
    setNewItems([]);
    refresh();
  };

  // ─── Advance status
  const handleAdvance = (order: LabOrder) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    updateLabOrderStatus(order.id, next, { receivedByUserId: user?.id });
    toast.success(isAr ? `تم تحديث الحالة إلى: ${STATUS_CONFIG[next].ar}` : `Status updated to: ${STATUS_CONFIG[next].en}`);
    refresh();
  };

  // ─── Send WhatsApp
  const handleWhatsApp = (order: LabOrder) => {
    const patientName = getPatientName(order.patientId) || 'Patient';
    const clinicName = isAr ? clinic?.nameAr : clinic?.name || 'Clinic';
    const msg = generateWhatsAppMessage(order, patientName as string, clinicName as string);
    const phone = order.labPhone.replace(/\D/g, '');
    window.open(`https://wa.me/2${phone}?text=${msg}`, '_blank');
    if (order.status === 'draft') {
      updateLabOrderStatus(order.id, 'sent');
      refresh();
    }
  };

  // ─── Payment
  const handlePay = () => {
    if (!payOpen) return;
    const amount = parseFloat(payAmount);
    if (isNaN(amount) || amount <= 0) { toast.error(isAr ? 'مبلغ غير صالح' : 'Invalid amount'); return; }
    updateLabOrderPayment(payOpen.orderId, Math.min(payOpen.current + amount, payOpen.total));
    toast.success(isAr ? 'تم تسجيل الدفع' : 'Payment recorded');
    setPayOpen(null);
    setPayAmount('');
    refresh();
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            {isAr ? 'المعامل وطلباتها' : 'Lab Orders'}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isAr ? 'إدارة طلبات المعامل من الإنشاء حتى التسليم' : 'Manage lab orders from creation to delivery'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          {isAr ? 'طلب جديد' : 'New Order'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: isAr ? 'إجمالي الطلبات' : 'Total Orders', value: stats.total, icon: <FlaskConical className="h-5 w-5 text-primary" />, color: 'bg-primary/10' },
          { label: isAr ? 'قيد التنفيذ' : 'Pending', value: stats.pending, icon: <Clock className="h-5 w-5 text-amber-600" />, color: 'bg-amber-50' },
          { label: isAr ? 'مكتمل' : 'Delivered', value: stats.delivered, icon: <CheckCircle2 className="h-5 w-5 text-green-600" />, color: 'bg-green-50' },
          { label: isAr ? 'متأخر في السداد' : 'Unpaid', value: `${stats.unpaidValue.toLocaleString()} ج.م`, icon: <DollarSign className="h-5 w-5 text-destructive" />, color: 'bg-destructive/10' },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg ${s.color} flex items-center justify-center`}>{s.icon}</div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} h-4 w-4 text-muted-foreground`} />
          <Input
            className={isRTL ? 'pr-9' : 'pl-9'}
            placeholder={isAr ? 'بحث باسم المريض أو المعمل...' : 'Search patient or lab...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Tabs value={tabFilter} onValueChange={v => setTabFilter(v as typeof tabFilter)}>
          <TabsList>
            <TabsTrigger value="all">{isAr ? 'الكل' : 'All'}</TabsTrigger>
            <TabsTrigger value="pending">
              {isAr ? 'قيد التنفيذ' : 'Pending'}
              {pendingCount > 0 && <span className="ms-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5">{pendingCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="delivered">{isAr ? 'مكتمل' : 'Delivered'}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Orders Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{isAr ? 'لا توجد طلبات' : 'No lab orders'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'المريض' : 'Patient'}</TableHead>
                  <TableHead>{isAr ? 'المعمل' : 'Lab'}</TableHead>
                  <TableHead>{isAr ? 'العناصر' : 'Items'}</TableHead>
                  <TableHead>{isAr ? 'تاريخ الاستلام' : 'Due Date'}</TableHead>
                  <TableHead>{isAr ? 'المبلغ' : 'Amount'}</TableHead>
                  <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{isAr ? 'إجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(order => {
                  const sc = STATUS_CONFIG[order.status];
                  const next = NEXT_STATUS[order.status];
                  const nextLabel = next ? NEXT_LABEL[order.status] : null;
                  const isOverdue = order.status !== 'delivered' && order.status !== 'cancelled' && new Date(order.dueDate) < new Date();
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{getPatientName(order.patientId)}</p>
                          <p className="text-xs text-muted-foreground">{getDoctorName(order.doctorId)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium">{order.labName}</p>
                          <p className="text-xs text-muted-foreground">{order.labPhone}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{order.items.length} {isAr ? 'عنصر' : 'item(s)'}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">{order.items.map(i => isAr ? i.nameAr : i.name).join(', ')}</p>
                      </TableCell>
                      <TableCell>
                        <p className={`text-sm ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                          {formatDate(order.dueDate, language)}
                          {isOverdue && <span className="ms-1 text-xs">(⚠ {isAr ? 'متأخر' : 'Overdue'})</span>}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{order.totalPrice.toLocaleString()} ج.م</p>
                        {order.paidAmount < order.totalPrice && (
                          <p className="text-xs text-destructive">{isAr ? 'متبقي:' : 'Due:'} {(order.totalPrice - order.paidAmount).toLocaleString()} ج.م</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${sc.color} gap-1 text-xs`} variant="secondary">
                          {sc.icon}{isAr ? sc.ar : sc.en}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {nextLabel && next && (
                            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleAdvance(order)}>
                              {isAr ? nextLabel.ar : nextLabel.en}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:text-green-700" onClick={() => handleWhatsApp(order)} title="WhatsApp">
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                          {order.paidAmount < order.totalPrice && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:text-blue-700" onClick={() => { setPayOpen({ orderId: order.id, current: order.paidAmount, total: order.totalPrice }); setPayAmount(''); }} title={isAr ? 'تسجيل دفع' : 'Record payment'}>
                              <DollarSign className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {order.status === 'draft' && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => setDeleteId(order.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Create Order Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              {isAr ? 'طلب معمل جديد' : 'New Lab Order'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Patient & Doctor */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{isAr ? 'المريض *' : 'Patient *'}</Label>
                <Select value={newForm.patientId} onValueChange={v => setNewForm(f => ({ ...f, patientId: v }))}>
                  <SelectTrigger><SelectValue placeholder={isAr ? 'اختر المريض' : 'Select patient'} /></SelectTrigger>
                  <SelectContent>
                    {patients.map(p => (
                      <SelectItem key={p.id} value={p.id}>{isAr ? p.nameAr : p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'الطبيب' : 'Doctor'}</Label>
                <Select value={newForm.doctorId} onValueChange={v => setNewForm(f => ({ ...f, doctorId: v }))}>
                  <SelectTrigger><SelectValue placeholder={isAr ? 'اختر الطبيب' : 'Select doctor'} /></SelectTrigger>
                  <SelectContent>
                    {activeDoctors.map(d => (
                      <SelectItem key={d.id} value={d.id}>{isAr ? d.nameAr : d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Lab & Due Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{isAr ? 'المعمل *' : 'Lab *'}</Label>
                <Select value={newForm.labId} onValueChange={v => setNewForm(f => ({ ...f, labId: v }))}>
                  <SelectTrigger><SelectValue placeholder={isAr ? 'اختر المعمل' : 'Select lab'} /></SelectTrigger>
                  <SelectContent>
                    {labs.map(l => (
                      <SelectItem key={l.id} value={l.id}>{isAr ? l.nameAr : l.name} — {l.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'تاريخ الاستلام المتوقع *' : 'Expected Due Date *'}</Label>
                <Input type="date" value={newForm.dueDate} onChange={e => setNewForm(f => ({ ...f, dueDate: e.target.value }))} min={new Date().toISOString().split('T')[0]} />
              </div>
            </div>

            <Separator />

            {/* Items */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{isAr ? 'العناصر المطلوبة' : 'Order Items'}</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  {isAr ? 'إضافة عنصر' : 'Add Item'}
                </Button>
              </div>

              {newItems.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
                  {isAr ? 'أضف عناصر الطلب أولاً' : 'Add items to continue'}
                </p>
              )}

              {newItems.map((item, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-muted-foreground">{isAr ? `عنصر ${idx + 1}` : `Item ${idx + 1}`}</p>
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-1 text-destructive" onClick={() => removeItem(idx)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'اختر من القائمة' : 'Quick Select'}</Label>
                      <Select value="" onValueChange={v => selectCommonItem(idx, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={isAr ? 'عناصر شائعة...' : 'Common items...'} /></SelectTrigger>
                        <SelectContent>
                          {COMMON_LAB_ITEMS.map(ci => (
                            <SelectItem key={ci.name} value={ci.name}>{isAr ? ci.nameAr : ci.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'اسم العنصر *' : 'Item Name *'}</Label>
                      <Input className="h-8 text-xs" value={isAr ? item.nameAr : item.name} onChange={e => updateItem(idx, isAr ? 'nameAr' : 'name', e.target.value)} placeholder={isAr ? 'اسم العنصر' : 'Name'} />
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'الكمية' : 'Qty'}</Label>
                      <Input className="h-8 text-xs" type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'السعر' : 'Price'}</Label>
                      <Input className="h-8 text-xs" type="number" min="0" value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'الظل (Shade)' : 'Shade'}</Label>
                      <Input className="h-8 text-xs" value={item.shade} onChange={e => updateItem(idx, 'shade', e.target.value)} placeholder="A2, B1..." />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'أرقام الأسنان' : 'Teeth #'}</Label>
                      <Input className="h-8 text-xs" value={item.toothNumbers} onChange={e => updateItem(idx, 'toothNumbers', e.target.value)} placeholder="11,12,21" />
                    </div>
                  </div>
                </div>
              ))}

              {newItems.length > 0 && (
                <div className="text-sm font-semibold text-end text-primary">
                  {isAr ? 'الإجمالي:' : 'Total:'} {newItems.reduce((s, i) => s + (Number(i.quantity) * Number(i.unitPrice)), 0).toLocaleString()} ج.م
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{isAr ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea value={newForm.notes} onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder={isAr ? 'أي تعليمات إضافية للمعمل...' : 'Any additional notes for the lab...'} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleCreate} className="gap-2">
              <FlaskConical className="h-4 w-4" />
              {isAr ? 'إنشاء الطلب' : 'Create Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={!!payOpen} onOpenChange={() => setPayOpen(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isAr ? 'تسجيل دفعة للمعمل' : 'Record Lab Payment'}</DialogTitle>
          </DialogHeader>
          {payOpen && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? 'الإجمالي' : 'Total'}</span>
                  <span className="font-medium">{payOpen.total.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{isAr ? 'مدفوع' : 'Paid'}</span>
                  <span className="font-medium text-green-600">{payOpen.current.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="text-muted-foreground">{isAr ? 'المتبقي' : 'Remaining'}</span>
                  <span className="font-bold text-destructive">{(payOpen.total - payOpen.current).toLocaleString()} ج.م</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'المبلغ المدفوع' : 'Payment Amount'}</Label>
                <Input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0" min="0" max={payOpen.total - payOpen.current} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(null)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handlePay}>{isAr ? 'تأكيد الدفع' : 'Confirm Payment'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? 'حذف الطلب' : 'Delete Order'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr ? 'هل أنت متأكد؟ لا يمكن التراجع.' : 'Are you sure? This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { if (deleteId) { deleteLabOrder(deleteId); toast.success(isAr ? 'تم الحذف' : 'Deleted'); setDeleteId(null); refresh(); } }}>
              {isAr ? 'حذف' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default LabOrders;
