import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useServices, useSpecialties } from '@/hooks/useSpecialties';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HeartPulse, Plus, DollarSign, Percent, Edit, Search } from 'lucide-react';

const Services: React.FC = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const { services, addService, updateService } = useServices();
  const { specialties } = useSpecialties();
  const clinicId = user?.clinicId || '';
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState({
    name: '', nameAr: '', price: '', specialtyId: '', doctorPercentage: '50',
  });

  const activeServices = services.filter(s => s.isActive && (!s.clinicId || s.clinicId === clinicId));

  const filteredServices = activeServices.filter(svc => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const sp = specialties.find(s => s.id === svc.specialtyId);
    return (
      svc.name.toLowerCase().includes(q) ||
      svc.nameAr.includes(searchQuery.trim()) ||
      sp?.name.toLowerCase().includes(q) ||
      sp?.nameAr.includes(searchQuery.trim())
    );
  });

  const resetForm = () => setForm({ name: '', nameAr: '', price: '', specialtyId: '', doctorPercentage: '50' });

  const handleAdd = () => {
    addService({
      clinicId,
      name: form.name,
      nameAr: form.nameAr,
      specialtyId: form.specialtyId,
      price: parseFloat(form.price) || 0,
      doctorPercentage: parseFloat(form.doctorPercentage) || 50,
      isActive: true,
    });
    setIsAddDialogOpen(false);
    resetForm();
  };

  const startEdit = (id: string) => {
    const svc = services.find(s => s.id === id);
    if (!svc) return;
    setForm({
      name: svc.name, nameAr: svc.nameAr, price: String(svc.price),
      specialtyId: svc.specialtyId, doctorPercentage: String(svc.doctorPercentage),
    });
    setEditingId(id);
  };

  const handleEdit = () => {
    if (!editingId) return;
    updateService(editingId, {
      name: form.name, nameAr: form.nameAr, price: parseFloat(form.price) || 0,
      specialtyId: form.specialtyId, doctorPercentage: parseFloat(form.doctorPercentage) || 50,
    });
    setEditingId(null);
    resetForm();
  };

  const getSpecialtyName = (id: string) => {
    const sp = specialties.find(s => s.id === id);
    return language === 'ar' ? sp?.nameAr : sp?.name;
  };

  const formDialog = (open: boolean, onOpenChange: (o: boolean) => void, title: string, onSave: () => void) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('services.name')} (EN)</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{t('services.name')} (AR)</Label>
              <Input value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value })} dir="rtl" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('services.price')} (ج.م)</Label>
              <Input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>{language === 'ar' ? 'التخصص' : 'Specialty'}</Label>
              <Select value={form.specialtyId} onValueChange={v => setForm({ ...form, specialtyId: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {specialties.filter(s => s.isActive).map(sp => (
                    <SelectItem key={sp.id} value={sp.id}>{language === 'ar' ? sp.nameAr : sp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {permissions.canEditServicePercentages && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'نسبة الطبيب (%)' : 'Doctor %'}</Label>
                <Input type="number" min="0" max="100" value={form.doctorPercentage} onChange={e => setForm({ ...form, doctorPercentage: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>{language === 'ar' ? 'نسبة العيادة (%)' : 'Clinic %'}</Label>
                <Input type="number" value={String(100 - (parseFloat(form.doctorPercentage) || 0))} disabled className="bg-muted" />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={onSave}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('services.title')}</h1>
          <p className="text-muted-foreground">{activeServices.length} {language === 'ar' ? 'خدمة متاحة' : 'services available'}</p>
        </div>
        {permissions.canEditServicePrices && (
          <>
            <Button className="gap-2" onClick={() => { resetForm(); setIsAddDialogOpen(true); }}>
              <Plus className="h-4 w-4" />{t('services.add')}
            </Button>
            {formDialog(isAddDialogOpen, setIsAddDialogOpen, t('services.add'), handleAdd)}
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <HeartPulse className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeServices.length}</p>
                <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إجمالي الخدمات' : 'Total Services'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-chart-5/10 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-chart-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeServices.length > 0 ? Math.round(activeServices.reduce((s, sv) => s + sv.price, 0) / activeServices.length) : 0} ج.م</p>
                <p className="text-sm text-muted-foreground">{language === 'ar' ? 'متوسط السعر' : 'Average Price'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={language === 'ar' ? 'بحث بالاسم أو التخصص...' : 'Search by name or specialty...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 rtl:pl-3 rtl:pr-10"
          data-testid="input-search-services"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('services.name')}</TableHead>
                <TableHead>{language === 'ar' ? 'التخصص' : 'Specialty'}</TableHead>
                <TableHead>{t('services.price')}</TableHead>
                {permissions.canEditServicePercentages && (
                  <>
                    <TableHead>{language === 'ar' ? 'نسبة الطبيب' : 'Doctor %'}</TableHead>
                    <TableHead>{language === 'ar' ? 'نسبة العيادة' : 'Clinic %'}</TableHead>
                  </>
                )}
                {permissions.canEditServicePrices && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredServices.map(svc => (
                <TableRow key={svc.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-chart-1/10 flex items-center justify-center">
                        <HeartPulse className="h-4 w-4 text-chart-1" />
                      </div>
                      <span className="font-medium">{language === 'ar' ? svc.nameAr : svc.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{getSpecialtyName(svc.specialtyId)}</TableCell>
                  <TableCell><Badge variant="secondary" className="font-semibold">{svc.price} ج.م</Badge></TableCell>
                  {permissions.canEditServicePercentages && (
                    <>
                      <TableCell><div className="flex items-center gap-1 text-chart-2"><Percent className="h-3 w-3" />{svc.doctorPercentage}</div></TableCell>
                      <TableCell><div className="flex items-center gap-1 text-chart-5"><Percent className="h-3 w-3" />{100 - svc.doctorPercentage}</div></TableCell>
                    </>
                  )}
                  {permissions.canEditServicePrices && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(svc.id)}><Edit className="h-4 w-4" /></Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {formDialog(!!editingId, (open) => !open && setEditingId(null), t('services.edit'), handleEdit)}
    </div>
  );
};

export default Services;
