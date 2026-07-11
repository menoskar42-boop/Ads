import React, { useState, useMemo, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import {
  drugDatabaseStore, Drug, DRUG_CATEGORIES, DRUG_CATEGORY_LABELS,
} from '@/stores/drugDatabaseStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pill, Search, Plus, X, Info, ChevronRight, AlertTriangle, CheckCircle, Pencil } from 'lucide-react';

const DrugDatabase: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const [drugs, setDrugs] = useState<Drug[]>(() => drugDatabaseStore.getAll());
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [selected, setSelected] = useState<Drug | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editDrug, setEditDrug] = useState<Drug | null>(null);

  useEffect(() => drugDatabaseStore.subscribe(() => setDrugs(drugDatabaseStore.getAll())), []);

  const filtered = useMemo(() => {
    let list = drugs;
    if (catFilter !== 'all') list = list.filter(d => d.category === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(d =>
        d.name.toLowerCase().includes(q) ||
        d.nameAr.includes(q) ||
        d.activeIngredient.toLowerCase().includes(q) ||
        d.activeIngredientAr.includes(q)
      );
    }
    return list;
  }, [drugs, search, catFilter]);

  const emptyForm = {
    name: '', nameAr: '', activeIngredient: '', activeIngredientAr: '',
    manufacturer: '', category: 'analgesic', categoryAr: '',
    defaultDosage: '', defaultFrequency: '', defaultDuration: '',
    sideEffects: '', sideEffectsAr: '', contraindications: '', contraindicationsAr: '',
    price: 0, isAvailable: true,
  };
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => { setForm(emptyForm); setEditDrug(null); setAddOpen(true); };
  const openEdit = (d: Drug) => {
    setForm({
      name: d.name, nameAr: d.nameAr,
      activeIngredient: d.activeIngredient, activeIngredientAr: d.activeIngredientAr,
      manufacturer: d.manufacturer, category: d.category, categoryAr: d.categoryAr,
      defaultDosage: d.defaultDosage, defaultFrequency: d.defaultFrequency, defaultDuration: d.defaultDuration,
      sideEffects: d.sideEffects, sideEffectsAr: d.sideEffectsAr,
      contraindications: d.contraindications, contraindicationsAr: d.contraindicationsAr,
      price: d.price || 0, isAvailable: d.isAvailable,
    });
    setEditDrug(d);
    setAddOpen(true);
  };

  const saveDrug = () => {
    if (!form.name.trim() || !form.activeIngredient.trim()) {
      toast.error(isAr ? 'الاسم والمادة الفعالة مطلوبان' : 'Name and active ingredient are required');
      return;
    }
    const catLabel = DRUG_CATEGORY_LABELS[form.category];
    if (editDrug) {
      drugDatabaseStore.update(d => d.id === editDrug.id, {
        ...form,
        categoryAr: catLabel?.ar || form.category,
        alternatives: editDrug.alternatives,
      });
      toast.success(isAr ? 'تم تحديث الدواء' : 'Drug updated');
    } else {
      drugDatabaseStore.add({
        id: `d${Date.now()}`,
        ...form,
        categoryAr: catLabel?.ar || form.category,
        alternatives: [],
      });
      toast.success(isAr ? 'تم إضافة الدواء' : 'Drug added');
    }
    setAddOpen(false);
  };

  const catStats = useMemo(() => {
    const stats: Record<string, number> = {};
    drugs.forEach(d => { stats[d.category] = (stats[d.category] || 0) + 1; });
    return stats;
  }, [drugs]);

  return (
    <div className="p-4 space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">{isAr ? 'قاعدة بيانات الأدوية' : 'Drug Database'}</h1>
          <Badge variant="secondary">{drugs.length} {isAr ? 'دواء' : 'drugs'}</Badge>
        </div>
        {(user?.role === 'admin' || user?.role === 'doctor') && (
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            {isAr ? 'إضافة دواء' : 'Add Drug'}
          </Button>
        )}
      </div>

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setCatFilter('all')}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${catFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
        >
          {isAr ? 'الكل' : 'All'} ({drugs.length})
        </button>
        {DRUG_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${catFilter === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
          >
            {isAr ? DRUG_CATEGORY_LABELS[cat]?.ar : DRUG_CATEGORY_LABELS[cat]?.en} ({catStats[cat] || 0})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute top-2.5 h-4 w-4 text-muted-foreground" style={{ [isRTL ? 'right' : 'left']: '10px' }} />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={isAr ? 'ابحث بالاسم أو المادة الفعالة...' : 'Search by name or active ingredient...'}
          style={{ [isRTL ? 'paddingRight' : 'paddingLeft']: '36px' }}
        />
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className="lg:col-span-2 space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Pill className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>{isAr ? 'لا توجد أدوية' : 'No drugs found'}</p>
            </div>
          )}
          {filtered.map(drug => (
            <Card
              key={drug.id}
              className={`cursor-pointer transition-all hover:shadow-md ${selected?.id === drug.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelected(drug)}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Pill className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{isAr ? drug.nameAr : drug.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {isAr ? drug.activeIngredientAr : drug.activeIngredient} • {drug.manufacturer}
                    </div>
                    <div className="text-xs text-muted-foreground/70">
                      {isAr ? DRUG_CATEGORY_LABELS[drug.category]?.ar : DRUG_CATEGORY_LABELS[drug.category]?.en}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {drug.price && drug.price > 0 && (
                    <span className="text-sm font-medium text-green-600">{drug.price} ج.م</span>
                  )}
                  <Badge variant={drug.isAvailable ? 'default' : 'destructive'} className="text-xs">
                    {drug.isAvailable ? (isAr ? 'متاح' : 'Available') : (isAr ? 'غير متاح' : 'Unavailable')}
                  </Badge>
                  {(user?.role === 'admin' || user?.role === 'doctor') && (
                    <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); openEdit(drug); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Info panel */}
        {selected ? (
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{isAr ? selected.nameAr : selected.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-0.5">{isAr ? selected.name : selected.nameAr}</p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{isAr ? 'المادة الفعالة' : 'Active Ingredient'}</p>
                  <p>{isAr ? selected.activeIngredientAr : selected.activeIngredient}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{isAr ? 'الجرعة الافتراضية' : 'Default Dosage'}</p>
                  <div className="bg-primary/5 rounded p-2 space-y-0.5">
                    <p><span className="text-muted-foreground">{isAr ? 'الجرعة:' : 'Dose:'}</span> {selected.defaultDosage}</p>
                    <p><span className="text-muted-foreground">{isAr ? 'التكرار:' : 'Frequency:'}</span> {selected.defaultFrequency}</p>
                    <p><span className="text-muted-foreground">{isAr ? 'المدة:' : 'Duration:'}</span> {selected.defaultDuration}</p>
                  </div>
                </div>
                {(selected.sideEffects || selected.sideEffectsAr) && (
                  <div>
                    <p className="text-xs font-semibold text-amber-600 uppercase mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {isAr ? 'الآثار الجانبية' : 'Side Effects'}
                    </p>
                    <p className="text-foreground/80">{isAr ? selected.sideEffectsAr : selected.sideEffects}</p>
                  </div>
                )}
                {(selected.contraindications || selected.contraindicationsAr) && (
                  <div>
                    <p className="text-xs font-semibold text-red-600 uppercase mb-1 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {isAr ? 'موانع الاستخدام' : 'Contraindications'}
                    </p>
                    <p className="text-foreground/80">{isAr ? selected.contraindicationsAr : selected.contraindications}</p>
                  </div>
                )}
                {selected.alternatives && selected.alternatives.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-green-600 uppercase mb-1 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> {isAr ? 'البدائل' : 'Alternatives'}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selected.alternatives.map(alt => (
                        <Badge key={alt} variant="outline" className="text-xs">{alt}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {selected.price && selected.price > 0 && (
                  <div className="border-t pt-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">{isAr ? 'السعر' : 'Price'}</p>
                    <p className="text-lg font-bold text-green-600">{selected.price} ج.م</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="hidden lg:flex lg:col-span-1 items-center justify-center text-muted-foreground/30">
            <div className="text-center">
              <Info className="h-12 w-12 mx-auto mb-2" />
              <p className="text-sm">{isAr ? 'اختر دواء لعرض التفاصيل' : 'Select a drug to view details'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>{editDrug ? (isAr ? 'تعديل دواء' : 'Edit Drug') : (isAr ? 'إضافة دواء جديد' : 'Add New Drug')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{isAr ? 'الاسم (إنجليزي)' : 'Name (English)'}</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
              <Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'المادة الفعالة (إنجليزي)' : 'Active Ingredient (EN)'}</Label>
              <Input value={form.activeIngredient} onChange={e => setForm(f => ({ ...f, activeIngredient: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'المادة الفعالة (عربي)' : 'Active Ingredient (AR)'}</Label>
              <Input value={form.activeIngredientAr} onChange={e => setForm(f => ({ ...f, activeIngredientAr: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'الشركة المصنعة' : 'Manufacturer'}</Label>
              <Input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'الفئة' : 'Category'}</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DRUG_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{isAr ? DRUG_CATEGORY_LABELS[c]?.ar : DRUG_CATEGORY_LABELS[c]?.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{isAr ? 'الجرعة الافتراضية' : 'Default Dosage'}</Label>
              <Input value={form.defaultDosage} onChange={e => setForm(f => ({ ...f, defaultDosage: e.target.value }))} placeholder="e.g. 500mg" />
            </div>
            <div>
              <Label>{isAr ? 'التكرار' : 'Frequency'}</Label>
              <Input value={form.defaultFrequency} onChange={e => setForm(f => ({ ...f, defaultFrequency: e.target.value }))} placeholder="e.g. 3 times daily" />
            </div>
            <div className="col-span-2">
              <Label>{isAr ? 'المدة' : 'Duration'}</Label>
              <Input value={form.defaultDuration} onChange={e => setForm(f => ({ ...f, defaultDuration: e.target.value }))} placeholder="e.g. 7 days" />
            </div>
            <div className="col-span-2">
              <Label>{isAr ? 'الآثار الجانبية' : 'Side Effects'}</Label>
              <Input value={form.sideEffects} onChange={e => setForm(f => ({ ...f, sideEffects: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>{isAr ? 'موانع الاستخدام' : 'Contraindications'}</Label>
              <Input value={form.contraindications} onChange={e => setForm(f => ({ ...f, contraindications: e.target.value }))} />
            </div>
            <div>
              <Label>{isAr ? 'السعر (ج.م)' : 'Price (EGP)'}</Label>
              <Input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <input type="checkbox" id="avail" checked={form.isAvailable} onChange={e => setForm(f => ({ ...f, isAvailable: e.target.checked }))} />
              <Label htmlFor="avail">{isAr ? 'متاح في الصيدلية' : 'Available in Pharmacy'}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={saveDrug}>{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DrugDatabase;
