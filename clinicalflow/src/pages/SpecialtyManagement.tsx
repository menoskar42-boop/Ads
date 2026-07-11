import { useState, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useSpecialties, useServices } from '@/hooks/useSpecialties';
import { getActiveSpecialtyIdsForClinic, toggleSpecialtyForClinic } from '@/stores/clinicSpecialtyStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Plus, Edit, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';

const SpecialtyManagement = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isRTL = language === 'ar';
  const { specialties, addSpecialty, updateSpecialty, deleteSpecialty } = useSpecialties();

  const clinicId = user?.clinicId || '';
  const { services, addService } = useServices();

  // Per-clinic active specialty IDs (NOT global isActive)
  const [activeIds, setActiveIds] = useState<string[]>(() =>
    getActiveSpecialtyIdsForClinic(clinicId)
  );
  const isActiveForClinic = useCallback((id: string) => activeIds.includes(id), [activeIds]);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', nameAr: '' });

  if (user?.role !== 'admin') {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">{isRTL ? 'غير مصرح' : 'Unauthorized'}</p></div>;
  }

  const filtered = specialties.filter(s => {
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.nameAr.includes(searchQuery);
  });

  const handleAdd = () => {
    if (!form.name || !form.nameAr) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول' : 'Please fill all fields');
      return;
    }
    addSpecialty({ name: form.name, nameAr: form.nameAr, isActive: false, formSchema: [] });
    setIsAddOpen(false);
    setForm({ name: '', nameAr: '' });
    toast.success(isRTL ? 'تم إضافة التخصص بنجاح' : 'Specialty added successfully');
  };

  const handleEdit = () => {
    if (!editId || !form.name || !form.nameAr) {
      toast.error(isRTL ? 'يرجى ملء جميع الحقول' : 'Please fill all fields');
      return;
    }
    updateSpecialty(editId, { name: form.name, nameAr: form.nameAr });
    setEditId(null);
    setForm({ name: '', nameAr: '' });
    toast.success(isRTL ? 'تم تعديل التخصص بنجاح' : 'Specialty updated successfully');
  };

  const handleDelete = (id: string) => {
    deleteSpecialty(id);
    toast.success(isRTL ? 'تم حذف التخصص' : 'Specialty deleted');
  };

  const openEdit = (s: typeof specialties[0]) => {
    setEditId(s.id);
    setForm({ name: s.name, nameAr: s.nameAr });
  };

  const handleToggle = (id: string) => {
    const nowActive = toggleSpecialtyForClinic(clinicId, id);
    setActiveIds(getActiveSpecialtyIdsForClinic(clinicId));
    if (nowActive) {
      const spec = specialties.find(s => s.id === id);
      if (spec) {
        // Auto-create a service for this specialty if one doesn't exist yet
        const alreadyExists = services.find(s => s.clinicId === clinicId && s.specialtyId === id);
        if (!alreadyExists) {
          addService({
            clinicId,
            name: spec.name,
            nameAr: spec.nameAr,
            specialtyId: id,
            price: 0,
            doctorPercentage: 0,
            isActive: true,
          });
        }
      }
    }
    toast.success(
      nowActive
        ? (isRTL ? 'تم تفعيل التخصص للعيادة' : 'Specialty activated for your clinic')
        : (isRTL ? 'تم إلغاء تفعيل التخصص للعيادة' : 'Specialty deactivated for your clinic')
    );
  };

  const activeCount = activeIds.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{isRTL ? 'إدارة التخصصات' : 'Specialty Management'}</h1>
          <p className="text-muted-foreground">
            {isRTL
              ? `${specialties.length} تخصص (${activeCount} نشط)`
              : `${specialties.length} specialties (${activeCount} active)`}
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 hidden" data-testid="button-add-specialty">
              <Plus className="h-4 w-4" />
              {isRTL ? 'إضافة تخصص' : 'Add Specialty'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isRTL ? 'إضافة تخصص جديد' : 'Add New Specialty'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (EN)' : 'Name (EN)'}</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Cardiology"
                  data-testid="input-specialty-name-en"
                />
              </div>
              <div className="space-y-2">
                <Label>{isRTL ? 'الاسم (AR)' : 'Name (AR)'}</Label>
                <Input
                  value={form.nameAr}
                  onChange={e => setForm({ ...form, nameAr: e.target.value })}
                  placeholder="مثال: أمراض القلب"
                  dir="rtl"
                  data-testid="input-specialty-name-ar"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
              <Button onClick={handleAdd} data-testid="button-save-specialty">{isRTL ? 'حفظ' : 'Save'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={isRTL ? 'بحث...' : 'Search...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 rtl:pl-3 rtl:pr-10"
          data-testid="input-search-specialties"
        />
      </div>

      <Dialog open={!!editId} onOpenChange={open => { if (!open) setEditId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تعديل التخصص' : 'Edit Specialty'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم (EN)' : 'Name (EN)'}</Label>
              <Input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                data-testid="input-edit-specialty-name-en"
              />
            </div>
            <div className="space-y-2">
              <Label>{isRTL ? 'الاسم (AR)' : 'Name (AR)'}</Label>
              <Input
                value={form.nameAr}
                onChange={e => setForm({ ...form, nameAr: e.target.value })}
                dir="rtl"
                data-testid="input-edit-specialty-name-ar"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleEdit} data-testid="button-update-specialty">{isRTL ? 'تحديث' : 'Update'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRTL ? 'الاسم (AR)' : 'Name (AR)'}</TableHead>
                <TableHead>{isRTL ? 'الاسم (EN)' : 'Name (EN)'}</TableHead>
                <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                <TableHead className="text-right rtl:text-left">{isRTL ? 'الإجراءات' : 'Actions'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(spec => (
                <TableRow key={spec.id} data-testid={`row-specialty-${spec.id}`}>
                  <TableCell className="font-medium" dir="rtl">{spec.nameAr}</TableCell>
                  <TableCell>{spec.name}</TableCell>
                  <TableCell>
                    <Badge variant={isActiveForClinic(spec.id) ? 'default' : 'secondary'}>
                      {isActiveForClinic(spec.id) ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right rtl:text-left">
                    <div className="flex items-center justify-end rtl:justify-start gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggle(spec.id)}
                        data-testid={`button-toggle-specialty-${spec.id}`}
                      >
                        {isActiveForClinic(spec.id)
                          ? <ToggleRight className="h-4 w-4 text-chart-2" />
                          : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(spec)}
                        data-testid={`button-edit-specialty-${spec.id}`}
                        className="hidden"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" data-testid={`button-delete-specialty-${spec.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{isRTL ? 'إزالة التخصص من العيادة' : 'Remove Specialty from Clinic'}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {isRTL
                                ? `هل أنت متأكد من إزالة "${spec.nameAr}" من عيادتك؟ سيتم إزالته من قائمة تخصصات العيادة فقط، ولن يُحذف من قاعدة بيانات البرنامج.`
                                : `Are you sure you want to remove "${spec.name}" from your clinic? It will only be removed from your clinic's specialty list and will NOT be deleted from the system.`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{isRTL ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(spec.id)}>
                              {isRTL ? 'حذف' : 'Delete'}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {isRTL ? 'لا توجد تخصصات' : 'No specialties found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SpecialtyManagement;
