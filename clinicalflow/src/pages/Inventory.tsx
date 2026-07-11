import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import {
  getClinicInventory, getLowStockItems, getExpiringSoonItems,
  addInventoryItem, updateInventoryItem, deleteInventoryItem,
  recordStockTransaction, getClinicSuppliers, addSupplier, updateSupplier,
  generateSupplierWhatsApp, CATEGORY_LABELS, UNIT_OPTIONS,
  InventoryItem, Supplier, InventoryCategory,
} from '@/stores/inventoryStore';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { getExpiringBatches, getExpiredBatches, getMostDispensed, getAllBatches, addBatch, getBatchesForProduct, getDispenseHistory } from '@/stores/batchStore';
import { dispenseItem } from '@/stores/inventoryStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Package, Plus, AlertTriangle, Search, Pencil, Trash2,
  TrendingDown, TrendingUp, MessageSquare, Building2, Phone,
  Calendar, Filter,
} from 'lucide-react';
import { formatDate } from '@/lib/dateFormat';

const CATEGORY_COLORS: Record<InventoryCategory, string> = {
  consumable: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  material:   'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  instrument: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  medication: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  equipment:  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  other:      'bg-muted text-muted-foreground',
};

const Inventory: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const clinicId = user?.clinicId || 'clinic-nile';
  const { settings: clinicConfig } = useClinicSettings();

  const [items, setItems]       = useState<InventoryItem[]>(() => getClinicInventory(clinicId));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => getClinicSuppliers(clinicId));
  const [search, setSearch]     = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('items');

  // Dialogs
  const [itemDialog, setItemDialog]   = useState<{ open: boolean; editing?: InventoryItem }>({ open: false });
  const [txDialog, setTxDialog]       = useState<{ open: boolean; item?: InventoryItem; type: 'add' | 'use' | 'adjust' }>({ open: false, type: 'add' });
  const [suppDialog, setSuppDialog]   = useState<{ open: boolean; editing?: Supplier }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // STEP 8 — batch + dispense state
  const [batchForm, setBatchForm] = useState({ itemId: '', batchNumber: '', quantity: '', expiryDate: '', costPrice: '' });
  const [dispenseForm, setDispenseForm] = useState({ itemId: '', quantity: '1', patientId: '', notes: '' });
  const [dispenseLog, setDispenseLog] = useState(() => getDispenseHistory(clinicId, 30));
  const refreshDispenseLog = () => setDispenseLog(getDispenseHistory(clinicId, 30));

  const handleAddBatch = () => {
    if (!batchForm.itemId || !batchForm.batchNumber || !batchForm.quantity) {
      toast.error(isAr ? 'يرجى ملء الحقول المطلوبة' : 'Fill required fields'); return;
    }
    addBatch({
      productId: batchForm.itemId, clinicId,
      batchNumber: batchForm.batchNumber,
      quantity: parseInt(batchForm.quantity),
      costPrice: batchForm.costPrice ? parseFloat(batchForm.costPrice) : undefined,
      expiryDate: batchForm.expiryDate || undefined,
      receivedAt: new Date().toISOString(),
    });
    // Also update flat stock count
    const item = items.find(i => i.id === batchForm.itemId);
    if (item) {
      updateInventoryItem(item.id, { currentStock: item.currentStock + parseInt(batchForm.quantity) });
      setItems(getClinicInventory(clinicId));
    }
    setBatchForm({ itemId: '', batchNumber: '', quantity: '', expiryDate: '', costPrice: '' });
    toast.success(isAr ? 'تم إضافة الدفعة' : 'Batch added');
  };

  const handleDispense = () => {
    if (!dispenseForm.itemId || !dispenseForm.quantity) {
      toast.error(isAr ? 'اختر الصنف والكمية' : 'Select item and quantity'); return;
    }
    const result = dispenseItem({
      clinicId, itemId: dispenseForm.itemId,
      quantity: parseInt(dispenseForm.quantity),
      patientId: dispenseForm.patientId || undefined,
      dispensedBy: user?.id,
      notes: dispenseForm.notes || undefined,
    });
    if (result.ok) {
      toast.success(isAr ? 'تم الصرف بنجاح' : 'Dispensed successfully');
      setItems(getClinicInventory(clinicId));
      setDispenseForm(f => ({ ...f, quantity: '1', notes: '' }));
      refreshDispenseLog();
    } else {
      toast.error(isAr ? result.errorAr : result.error);
    }
  };

  // Forms
  const emptyItem = { name: '', nameAr: '', category: 'consumable' as InventoryCategory, unit: 'piece', currentStock: 0, minStockLevel: 5, unitPrice: 0, supplierId: '', expiryDate: '', location: '' };
  const [itemForm, setItemForm]   = useState({ ...emptyItem });
  const [txForm, setTxForm]       = useState({ quantity: '', notes: '', unitCost: '' });
  const [suppForm, setSuppForm]   = useState({ name: '', nameAr: '', phone: '', email: '', address: '', notes: '' });

  const refresh = () => { setItems(getClinicInventory(clinicId)); setSuppliers(getClinicSuppliers(clinicId)); };

  // ─── Filtered items
  const filtered = useMemo(() => {
    let list = items;
    if (catFilter !== 'all') list = list.filter(i => i.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q) || i.nameAr.includes(search));
    }
    return list;
  }, [items, catFilter, search]);

  const lowStock       = getLowStockItems(clinicId);
  const expiring       = getExpiringSoonItems(clinicId, 60);
  const expiringBatches = getExpiringBatches(clinicId, 60);
  const expiredBatches  = getExpiredBatches(clinicId);

  // ─── Stats
  const totalValue = items.reduce((s, i) => s + i.currentStock * i.unitPrice, 0);

  // ─── Item form submit
  const handleSaveItem = () => {
    if (!itemForm.name.trim() || !itemForm.nameAr.trim()) {
      toast.error(isAr ? 'الاسم مطلوب بالعربي والإنجليزي' : 'Name is required in both languages');
      return;
    }
    try {
      if (itemDialog.editing) {
        updateInventoryItem(itemDialog.editing.id, {
          name: itemForm.name, nameAr: itemForm.nameAr,
          category: itemForm.category, unit: itemForm.unit,
          currentStock: Number(itemForm.currentStock),
          minStockLevel: Number(itemForm.minStockLevel),
          unitPrice: Number(itemForm.unitPrice),
          supplierId: itemForm.supplierId || undefined,
          expiryDate: itemForm.expiryDate || undefined,
          location: itemForm.location || undefined,
        });
        toast.success(isAr ? 'تم تحديث العنصر' : 'Item updated');
      } else {
        addInventoryItem({
          clinicId, isActive: true,
          name: itemForm.name, nameAr: itemForm.nameAr,
          category: itemForm.category, unit: itemForm.unit,
          currentStock: Number(itemForm.currentStock),
          minStockLevel: Number(itemForm.minStockLevel),
          unitPrice: Number(itemForm.unitPrice),
          supplierId: itemForm.supplierId || undefined,
          expiryDate: itemForm.expiryDate || undefined,
          location: itemForm.location || undefined,
        });
        toast.success(isAr ? 'تم إضافة العنصر' : 'Item added');
      }
      setItemDialog({ open: false });
      refresh();
    } catch (e: any) {
      if (e?.message === 'inventory_disabled') {
        toast.error(isAr ? 'المخزن غير مفعّل' : 'Inventory module is disabled');
        return;
      }
      throw e;
    }
  };

  const openEditItem = (item: InventoryItem) => {
    setItemForm({ name: item.name, nameAr: item.nameAr, category: item.category, unit: item.unit, currentStock: item.currentStock, minStockLevel: item.minStockLevel, unitPrice: item.unitPrice, supplierId: item.supplierId || '', expiryDate: item.expiryDate || '', location: item.location || '' });
    setItemDialog({ open: true, editing: item });
  };

  // ─── Stock transaction
  const handleTx = () => {
    if (!txDialog.item) return;
    const qty = Number(txForm.quantity);
    if (!qty || qty <= 0) { toast.error(isAr ? 'الكمية يجب أن تكون أكبر من صفر' : 'Quantity must be > 0'); return; }
    const delta = txDialog.type === 'use' ? -qty : qty;
    try {
      recordStockTransaction({
        clinicId,
        itemId: txDialog.item.id,
        type: txDialog.type,
        quantity: delta,
        unitCost: txForm.unitCost ? Number(txForm.unitCost) : undefined,
        notes: txForm.notes || undefined,
        userId: user?.id || 'u-1',
      });
      toast.success(isAr ? 'تم تسجيل الحركة' : 'Transaction recorded');
      setTxDialog({ open: false, type: 'add' });
      setTxForm({ quantity: '', notes: '', unitCost: '' });
      refresh();
    } catch (e: any) {
      if (e?.message === 'inventory_disabled') {
        toast.error(isAr ? 'المخزن غير مفعّل' : 'Inventory module is disabled');
        return;
      }
      throw e;
    }
  };

  // ─── Supplier form
  const handleSaveSupplier = () => {
    if (!suppForm.name.trim() || !suppForm.phone.trim()) {
      toast.error(isAr ? 'الاسم والهاتف مطلوبان' : 'Name and phone are required');
      return;
    }
    if (suppDialog.editing) {
      updateSupplier(suppDialog.editing.id, { name: suppForm.name, nameAr: suppForm.nameAr, phone: suppForm.phone, email: suppForm.email || undefined, address: suppForm.address || undefined, notes: suppForm.notes || undefined });
      toast.success(isAr ? 'تم تحديث المورد' : 'Supplier updated');
    } else {
      addSupplier({ clinicId, name: suppForm.name, nameAr: suppForm.nameAr, phone: suppForm.phone, email: suppForm.email || undefined, address: suppForm.address || undefined, notes: suppForm.notes || undefined, isActive: true });
      toast.success(isAr ? 'تم إضافة المورد' : 'Supplier added');
    }
    setSuppDialog({ open: false });
    refresh();
  };

  const openEditSupplier = (s: Supplier) => {
    setSuppForm({ name: s.name, nameAr: s.nameAr, phone: s.phone, email: s.email || '', address: s.address || '', notes: s.notes || '' });
    setSuppDialog({ open: true, editing: s });
  };

  const handleSupplierWhatsApp = (s: Supplier) => {
    const lowForSupplier = lowStock.filter(i => i.supplierId === s.id);
    if (lowForSupplier.length === 0) {
      toast.info(isAr ? 'لا توجد عناصر تنبيه مرتبطة بهذا المورد' : 'No low-stock items linked to this supplier');
      return;
    }
    const msg = generateSupplierWhatsApp(s, lowForSupplier.map(i => ({ name: isAr ? i.nameAr : i.name, quantity: i.minStockLevel - i.currentStock + 5, unit: i.unit })), (isAr ? (clinicConfig?.nameAr ?? clinicConfig?.clinicNameAr) : (clinicConfig?.name ?? clinicConfig?.clinicName)) || 'Clinic');
    const phone = s.phone.replace(/\D/g, '');
    window.open(`https://wa.me/2${phone}?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            {isAr ? 'المخازن والموردين' : 'Inventory & Suppliers'}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isAr ? 'تتبع المواد والمعدات وإدارة الموردين' : 'Track supplies, materials, and manage suppliers'}
          </p>
        </div>
        <div className="flex gap-2">
          {activeTab === 'items' && (
            <Button onClick={() => { setItemForm({ ...emptyItem }); setItemDialog({ open: true }); }} className="gap-2">
              <Plus className="h-4 w-4" />{isAr ? 'عنصر جديد' : 'Add Item'}
            </Button>
          )}
          {activeTab === 'suppliers' && (
            <Button onClick={() => { setSuppForm({ name: '', nameAr: '', phone: '', email: '', address: '', notes: '' }); setSuppDialog({ open: true }); }} className="gap-2">
              <Plus className="h-4 w-4" />{isAr ? 'مورد جديد' : 'Add Supplier'}
            </Button>
          )}
        </div>
      </div>

      {/* Alerts — STEP 6: low stock, expiring items, expired batches */}
      {(lowStock.length > 0 || expiring.length > 0 || expiredBatches.length > 0 || expiringBatches.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {lowStock.length > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-amber-800 text-sm">{isAr ? `⚠ ${lowStock.length} عناصر مخزون منخفض` : `⚠ ${lowStock.length} Low Stock Items`}</p>
                    <p className="text-xs text-amber-700 mt-0.5">{lowStock.map(i => isAr ? i.nameAr : i.name).slice(0, 3).join(', ')}{lowStock.length > 3 ? ` +${lowStock.length - 3}` : ''}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {expiring.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-800 text-sm">{isAr ? `${expiring.length} عناصر تنتهي قريباً` : `${expiring.length} Items Expiring Soon`}</p>
                    <p className="text-xs text-red-700 mt-0.5">{expiring.map(i => isAr ? i.nameAr : i.name).slice(0, 3).join(', ')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {expiredBatches.length > 0 && (
            <Card className="border-red-300 bg-red-100 dark:bg-red-900/20 dark:border-red-800">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-800 text-sm">{isAr ? `${expiredBatches.length} دفعات منتهية الصلاحية` : `${expiredBatches.length} Expired Batches`}</p>
                    <p className="text-xs text-red-700 mt-0.5">{isAr ? 'يرجى إتلافها فوراً' : 'Please dispose immediately'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {expiringBatches.length > 0 && expiredBatches.length === 0 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-orange-800 text-sm">{isAr ? `${expiringBatches.length} دفعات تنتهي خلال 60 يوماً` : `${expiringBatches.length} Batches Expiring in 60 Days`}</p>
                    <p className="text-xs text-orange-700 mt-0.5">{isAr ? 'تحقق من المخزون' : 'Check inventory'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: isAr ? 'إجمالي العناصر' : 'Total Items', value: items.length },
          { label: isAr ? 'مخزون منخفض' : 'Low Stock',    value: lowStock.length, warn: lowStock.length > 0 },
          { label: isAr ? 'تنتهي قريباً' : 'Expiring',      value: expiring.length, warn: expiring.length > 0 },
          { label: isAr ? 'قيمة المخزون' : 'Stock Value',   value: `${totalValue.toLocaleString()} ج.م` },
        ].map((s, i) => (
          <Card key={i} className={s.warn ? 'border-amber-300' : ''}>
            <CardContent className="pt-5 pb-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.warn ? 'text-amber-600' : 'text-foreground'}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="items">{isAr ? 'المواد والمعدات' : 'Items'}</TabsTrigger>
          <TabsTrigger value="suppliers">
            {isAr ? 'الموردين' : 'Suppliers'} ({suppliers.length})
          </TabsTrigger>
          <TabsTrigger value="reports">{isAr ? 'التقارير' : 'Reports'}</TabsTrigger>
          <TabsTrigger value="batches">{isAr ? 'الدفعات والصرف' : 'Batches & Dispense'}</TabsTrigger>
        </TabsList>

        {/* ── Items Tab ── */}
        <TabsContent value="items" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className={`absolute top-2.5 ${isRTL ? 'right-3' : 'left-3'} h-4 w-4 text-muted-foreground`} />
              <Input className={isRTL ? 'pr-9' : 'pl-9'} placeholder={isAr ? 'بحث...' : 'Search...'} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-[160px]">
                <Filter className="h-4 w-4 me-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? 'كل الفئات' : 'All Categories'}</SelectItem>
                {(Object.keys(CATEGORY_LABELS) as InventoryCategory[]).map(c => (
                  <SelectItem key={c} value={c}>{isAr ? CATEGORY_LABELS[c].ar : CATEGORY_LABELS[c].en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? 'الاسم' : 'Name'}</TableHead>
                    <TableHead>{isAr ? 'الفئة' : 'Category'}</TableHead>
                    <TableHead>{isAr ? 'المخزون' : 'Stock'}</TableHead>
                    <TableHead>{isAr ? 'الحد الأدنى' : 'Min Level'}</TableHead>
                    <TableHead>{isAr ? 'سعر الوحدة' : 'Unit Price'}</TableHead>
                    <TableHead>{isAr ? 'الصلاحية' : 'Expiry'}</TableHead>
                    <TableHead>{isAr ? 'إجراءات' : 'Actions'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(item => {
                    const isLow = item.currentStock <= item.minStockLevel;
                    const isExp = item.expiryDate && new Date(item.expiryDate) <= new Date(Date.now() + 60 * 86400000);
                    return (
                      <TableRow key={item.id} className={isLow ? 'bg-amber-50/50' : ''}>
                        <TableCell>
                          <p className="font-medium text-sm">{isAr ? item.nameAr : item.name}</p>
                          {item.location && <p className="text-xs text-muted-foreground">{item.location}</p>}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${CATEGORY_COLORS[item.category]} text-xs`} variant="secondary">
                            {isAr ? CATEGORY_LABELS[item.category].ar : CATEGORY_LABELS[item.category].en}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={`font-semibold ${isLow ? 'text-amber-600' : 'text-foreground'}`}>
                            {isLow && <AlertTriangle className="h-3.5 w-3.5 inline me-1" />}
                            {item.currentStock} {item.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{item.minStockLevel} {item.unit}</TableCell>
                        <TableCell className="text-sm">{item.unitPrice} ج.م</TableCell>
                        <TableCell>
                          {item.expiryDate ? (
                            <span className={`text-xs ${isExp ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                              {formatDate(item.expiryDate, language)}
                            </span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600" title={isAr ? 'إضافة مخزون' : 'Restock'} onClick={() => { setTxDialog({ open: true, item, type: 'add' }); setTxForm({ quantity: '', notes: '', unitCost: '' }); }}>
                              <TrendingUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-amber-600" title={isAr ? 'استهلاك' : 'Use'} onClick={() => { setTxDialog({ open: true, item, type: 'use' }); setTxForm({ quantity: '', notes: '', unitCost: '' }); }}>
                              <TrendingDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEditItem(item)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => setDeleteTarget(item.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      {isAr ? 'لا توجد عناصر' : 'No items found'}
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Suppliers Tab ── */}
        {/* ── STEP 7: Reports Tab ── */}
        <TabsContent value="reports" className="space-y-6 mt-0">
          {(() => {
            const totalValue = items.reduce((s, i) => s + i.currentStock * i.unitPrice, 0);
            const mostUsed = getMostDispensed(clinicId, 10);
            const nearExpiry = getExpiringBatches(clinicId, 30);
            const allBatches = getAllBatches(clinicId);
            const batchValue = allBatches.reduce((s, b) => {
              const item = items.find(i => i.id === b.productId);
              return s + (b.quantity * (b.costPrice ?? item?.unitPrice ?? 0));
            }, 0);
            return (
              <>
                {/* KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{isAr ? 'قيمة المخزون الإجمالية' : 'Total Stock Value'}</p>
                    <p className="text-xl font-bold text-primary">{totalValue.toLocaleString()} {isAr ? 'ج.م' : 'EGP'}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي الأصناف' : 'Total SKUs'}</p>
                    <p className="text-xl font-bold">{items.length}</p>
                  </CardContent></Card>
                  <Card><CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{isAr ? 'دفعات تنتهي ≤30 يوم' : 'Batches Expiring ≤30d'}</p>
                    <p className={`text-xl font-bold ${nearExpiry.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{nearExpiry.length}</p>
                  </CardContent></Card>
                </div>

                {/* Most dispensed */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">{isAr ? 'الأكثر صرفاً' : 'Most Dispensed'}</CardTitle></CardHeader>
                  <CardContent>
                    {mostUsed.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{isAr ? 'لا توجد بيانات صرف بعد' : 'No dispense data yet'}</p>
                    ) : (
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>{isAr ? 'الصنف' : 'Item'}</TableHead>
                          <TableHead>{isAr ? 'الوحدة' : 'Unit'}</TableHead>
                          <TableHead className="text-end">{isAr ? 'إجمالي المصروف' : 'Total Dispensed'}</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {mostUsed.map(row => {
                            const item = items.find(i => i.id === row.productId);
                            return (
                              <TableRow key={row.productId}>
                                <TableCell className="font-medium text-sm">{item ? (isAr ? item.nameAr : item.name) : row.productId}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{item?.unit ?? '—'}</TableCell>
                                <TableCell className="text-end font-semibold">{row.total}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {/* Near expiry batches */}
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-orange-500" />
                    {isAr ? 'دفعات تنتهي صلاحيتها قريباً (60 يوم)' : 'Batches Expiring Soon (60 days)'}
                  </CardTitle></CardHeader>
                  <CardContent>
                    {nearExpiry.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{isAr ? 'لا توجد دفعات تنتهي قريباً' : 'No batches expiring soon'}</p>
                    ) : (
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>{isAr ? 'الصنف' : 'Item'}</TableHead>
                          <TableHead>{isAr ? 'رقم الدفعة' : 'Batch #'}</TableHead>
                          <TableHead className="text-center">{isAr ? 'الكمية' : 'Qty'}</TableHead>
                          <TableHead className="text-end">{isAr ? 'تاريخ الانتهاء' : 'Expiry'}</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {nearExpiry.map(b => {
                            const item = items.find(i => i.id === b.productId);
                            const daysLeft = Math.ceil((new Date(b.expiryDate!).getTime() - Date.now()) / 86400000);
                            return (
                              <TableRow key={b.id}>
                                <TableCell className="font-medium text-sm">{item ? (isAr ? item.nameAr : item.name) : b.productId}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{b.batchNumber}</TableCell>
                                <TableCell className="text-center">{b.quantity}</TableCell>
                                <TableCell className="text-end">
                                  <span className={`text-xs font-semibold ${daysLeft <= 14 ? 'text-red-600' : 'text-orange-600'}`}>
                                    {b.expiryDate} ({daysLeft}d)
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {/* Low stock list */}
                {lowStock.length > 0 && (
                  <Card className="border-amber-200">
                    <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      {isAr ? 'أصناف المخزون المنخفض' : 'Low Stock Items'}
                    </CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>{isAr ? 'الصنف' : 'Item'}</TableHead>
                          <TableHead className="text-center">{isAr ? 'المتوفر' : 'In Stock'}</TableHead>
                          <TableHead className="text-center">{isAr ? 'الحد الأدنى' : 'Min Level'}</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {lowStock.map(i => (
                            <TableRow key={i.id}>
                              <TableCell className="font-medium text-sm">{isAr ? i.nameAr : i.name}</TableCell>
                              <TableCell className="text-center font-bold text-red-600">{i.currentStock}</TableCell>
                              <TableCell className="text-center text-muted-foreground">{i.minStockLevel}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="suppliers">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {suppliers.map(s => (
              <Card key={s.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{isAr ? s.nameAr : s.name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-1.5 text-green-600" onClick={() => handleSupplierWhatsApp(s)}>
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => openEditSupplier(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {s.address && <p className="text-xs text-muted-foreground mt-1">{s.address}</p>}
                  {s.balance > 0 && (
                    <div className="mt-2 pt-2 border-t text-xs flex justify-between">
                      <span className="text-muted-foreground">{isAr ? 'الرصيد المستحق' : 'Balance Due'}</span>
                      <span className="text-destructive font-medium">{s.balance.toLocaleString()} ج.م</span>
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {isAr ? 'العناصر المرتبطة:' : 'Linked items:'} {items.filter(i => i.supplierId === s.id).length}
                  </div>
                </CardContent>
              </Card>
            ))}
            {suppliers.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>{isAr ? 'لا يوجد موردون بعد' : 'No suppliers yet'}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── STEP 8: Batches & Dispense Tab ── */}
        <TabsContent value="batches" className="space-y-6 mt-0">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Add batch form */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />{isAr ? 'إضافة دفعة جديدة' : 'Add New Batch'}
              </CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'الصنف' : 'Item'}</Label>
                  <Select value={batchForm.itemId} onValueChange={v => setBatchForm(f => ({ ...f, itemId: v }))}>
                    <SelectTrigger><SelectValue placeholder={isAr ? 'اختر صنفاً' : 'Select item'} /></SelectTrigger>
                    <SelectContent>
                      {items.map(i => <SelectItem key={i.id} value={i.id}>{isAr ? i.nameAr : i.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? 'رقم الدفعة' : 'Batch #'}</Label>
                    <Input value={batchForm.batchNumber} onChange={e => setBatchForm(f => ({ ...f, batchNumber: e.target.value }))} placeholder="LOT-2025-001" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? 'الكمية' : 'Quantity'}</Label>
                    <Input type="number" min="1" value={batchForm.quantity} onChange={e => setBatchForm(f => ({ ...f, quantity: e.target.value }))} dir="ltr" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? 'تاريخ الانتهاء' : 'Expiry Date'}</Label>
                    <Input type="date" value={batchForm.expiryDate} onChange={e => setBatchForm(f => ({ ...f, expiryDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? 'سعر التكلفة (ج.م)' : 'Cost Price (EGP)'}</Label>
                    <Input type="number" min="0" value={batchForm.costPrice} onChange={e => setBatchForm(f => ({ ...f, costPrice: e.target.value }))} dir="ltr" />
                  </div>
                </div>
                <Button onClick={handleAddBatch} className="w-full gap-1.5">
                  <Plus className="h-4 w-4" />{isAr ? 'إضافة الدفعة' : 'Add Batch'}
                </Button>
              </CardContent>
            </Card>

            {/* Manual dispense form */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />{isAr ? 'صرف صنف' : 'Dispense Item'}
              </CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'الصنف' : 'Item'}</Label>
                  <Select value={dispenseForm.itemId} onValueChange={v => setDispenseForm(f => ({ ...f, itemId: v }))}>
                    <SelectTrigger><SelectValue placeholder={isAr ? 'اختر صنفاً' : 'Select item'} /></SelectTrigger>
                    <SelectContent>
                      {items.map(i => (
                        <SelectItem key={i.id} value={i.id}>
                          {isAr ? i.nameAr : i.name} ({i.currentStock} {i.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? 'الكمية' : 'Quantity'}</Label>
                    <Input type="number" min="1" value={dispenseForm.quantity} onChange={e => setDispenseForm(f => ({ ...f, quantity: e.target.value }))} dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{isAr ? 'رقم المريض (اختياري)' : 'Patient ID (opt.)'}</Label>
                    <Input value={dispenseForm.patientId} onChange={e => setDispenseForm(f => ({ ...f, patientId: e.target.value }))} dir="ltr" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{isAr ? 'ملاحظات' : 'Notes'}</Label>
                  <Input value={dispenseForm.notes} onChange={e => setDispenseForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
                <Button onClick={handleDispense} variant="destructive" className="w-full gap-1.5">
                  <Package className="h-4 w-4" />{isAr ? 'صرف' : 'Dispense'}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent dispense log */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{isAr ? 'سجل الصرف الأخير' : 'Recent Dispense Log'}</CardTitle></CardHeader>
            <CardContent>
              {dispenseLog.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-6">{isAr ? 'لا توجد عمليات صرف بعد' : 'No dispenses yet'}</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>{isAr ? 'الصنف' : 'Item'}</TableHead>
                    <TableHead className="text-center">{isAr ? 'الكمية' : 'Qty'}</TableHead>
                    <TableHead>{isAr ? 'المريض' : 'Patient'}</TableHead>
                    <TableHead className="text-end">{isAr ? 'التاريخ' : 'Date'}</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {dispenseLog.map(d => {
                      const item = items.find(i => i.id === d.productId);
                      return (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium text-sm">{item ? (isAr ? item.nameAr : item.name) : d.productId}</TableCell>
                          <TableCell className="text-center">{d.quantity}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{d.patientId || '—'}</TableCell>
                          <TableCell className="text-end text-xs text-muted-foreground">{d.createdAt.slice(0, 16).replace('T', ' ')}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add/Edit Item Dialog ───────────────────────────────────────────────── */}
      <Dialog open={itemDialog.open} onOpenChange={open => setItemDialog(d => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{itemDialog.editing ? (isAr ? 'تعديل عنصر' : 'Edit Item') : (isAr ? 'إضافة عنصر جديد' : 'Add New Item')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{isAr ? 'الاسم (إنجليزي) *' : 'Name (English) *'}</Label>
                <Input value={itemForm.name} onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</Label>
                <Input dir="rtl" value={itemForm.nameAr} onChange={e => setItemForm(f => ({ ...f, nameAr: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{isAr ? 'الفئة' : 'Category'}</Label>
                <Select value={itemForm.category} onValueChange={v => setItemForm(f => ({ ...f, category: v as InventoryCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_LABELS) as InventoryCategory[]).map(c => (
                      <SelectItem key={c} value={c}>{isAr ? CATEGORY_LABELS[c].ar : CATEGORY_LABELS[c].en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'الوحدة' : 'Unit'}</Label>
                <Select value={itemForm.unit} onValueChange={v => setItemForm(f => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>{isAr ? 'الكمية الحالية' : 'Current Stock'}</Label>
                <Input type="number" min="0" value={itemForm.currentStock} onChange={e => setItemForm(f => ({ ...f, currentStock: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'الحد الأدنى' : 'Min Level'}</Label>
                <Input type="number" min="0" value={itemForm.minStockLevel} onChange={e => setItemForm(f => ({ ...f, minStockLevel: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'سعر الوحدة' : 'Unit Price'}</Label>
                <Input type="number" min="0" value={itemForm.unitPrice} onChange={e => setItemForm(f => ({ ...f, unitPrice: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{isAr ? 'المورد' : 'Supplier'}</Label>
                <Select value={itemForm.supplierId} onValueChange={v => setItemForm(f => ({ ...f, supplierId: v }))}>
                  <SelectTrigger><SelectValue placeholder={isAr ? 'اختياري' : 'Optional'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{isAr ? s.nameAr : s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'تاريخ الصلاحية' : 'Expiry Date'}</Label>
                <Input type="date" value={itemForm.expiryDate} onChange={e => setItemForm(f => ({ ...f, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? 'الموقع (رف/غرفة)' : 'Location (shelf/room)'}</Label>
              <Input value={itemForm.location} onChange={e => setItemForm(f => ({ ...f, location: e.target.value }))} placeholder={isAr ? 'مثال: رف A3' : 'e.g. Shelf A3'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialog({ open: false })}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveItem}>{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stock Transaction Dialog ──────────────────────────────────────────── */}
      <Dialog open={txDialog.open} onOpenChange={open => setTxDialog(d => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {txDialog.type === 'add' ? (isAr ? 'إضافة مخزون' : 'Add Stock') :
               txDialog.type === 'use' ? (isAr ? 'تسجيل استهلاك' : 'Record Usage') : (isAr ? 'تعديل يدوي' : 'Manual Adjust')}
            </DialogTitle>
          </DialogHeader>
          {txDialog.item && (
            <div className="space-y-4 py-2">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <p className="font-medium">{isAr ? txDialog.item.nameAr : txDialog.item.name}</p>
                <p className="text-muted-foreground">{isAr ? 'المخزون الحالي:' : 'Current:'} <span className="font-semibold text-foreground">{txDialog.item.currentStock} {txDialog.item.unit}</span></p>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'الكمية *' : 'Quantity *'}</Label>
                <Input type="number" min="1" value={txForm.quantity} onChange={e => setTxForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" />
              </div>
              {txDialog.type === 'add' && (
                <div className="space-y-1.5">
                  <Label>{isAr ? 'تكلفة الوحدة' : 'Unit Cost (optional)'}</Label>
                  <Input type="number" min="0" value={txForm.unitCost} onChange={e => setTxForm(f => ({ ...f, unitCost: e.target.value }))} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{isAr ? 'ملاحظات' : 'Notes'}</Label>
                <Input value={txForm.notes} onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))} placeholder={isAr ? 'اختياري...' : 'Optional...'} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTxDialog({ open: false, type: 'add' })}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleTx} className={txDialog.type === 'use' ? 'bg-amber-600 hover:bg-amber-700' : ''}>
              {txDialog.type === 'add' ? (isAr ? 'إضافة' : 'Add Stock') : txDialog.type === 'use' ? (isAr ? 'تسجيل استهلاك' : 'Record Usage') : (isAr ? 'تعديل' : 'Adjust')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add/Edit Supplier Dialog ──────────────────────────────────────────── */}
      <Dialog open={suppDialog.open} onOpenChange={open => setSuppDialog(d => ({ ...d, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{suppDialog.editing ? (isAr ? 'تعديل المورد' : 'Edit Supplier') : (isAr ? 'إضافة مورد' : 'Add Supplier')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{isAr ? 'الاسم (إنجليزي) *' : 'Name (English) *'}</Label>
                <Input value={suppForm.name} onChange={e => setSuppForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
                <Input dir="rtl" value={suppForm.nameAr} onChange={e => setSuppForm(f => ({ ...f, nameAr: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{isAr ? 'الهاتف *' : 'Phone *'}</Label>
                <Input value={suppForm.phone} onChange={e => setSuppForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'البريد الإلكتروني' : 'Email'}</Label>
                <Input type="email" value={suppForm.email} onChange={e => setSuppForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? 'العنوان' : 'Address'}</Label>
              <Input value={suppForm.address} onChange={e => setSuppForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? 'ملاحظات' : 'Notes'}</Label>
              <Input value={suppForm.notes} onChange={e => setSuppForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuppDialog({ open: false })}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveSupplier}>{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? 'حذف العنصر' : 'Delete Item'}</AlertDialogTitle>
            <AlertDialogDescription>{isAr ? 'هل أنت متأكد؟' : 'Are you sure?'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => { if (deleteTarget) { deleteInventoryItem(deleteTarget); toast.success(isAr ? 'تم الحذف' : 'Deleted'); setDeleteTarget(null); refresh(); } }}>
              {isAr ? 'حذف' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Inventory;
