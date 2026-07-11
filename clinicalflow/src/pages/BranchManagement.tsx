import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { getToken } from '@/utils/authToken';
import { Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { GitBranch, Plus, Pencil, Trash2, Phone, MapPin, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  getBranchesForClinic, addBranch, updateBranch, deleteBranch, Branch,
} from '@/stores/branchStore';

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

function normaliseBranch(b: any): Branch {
  return {
    id: b.id,
    clinicId: b.clinic_id,
    name: b.name,
    nameAr: b.name_ar ?? b.name,
    address: b.address ?? '',
    addressAr: b.address_ar ?? b.address_ar ?? '',
    phone: b.phone ?? '',
    isActive: b.is_active ?? true,
  };
}

const emptyForm = { name: '', nameAr: '', address: '', addressAr: '', phone: '' };

export default function BranchManagement() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const { toast } = useToast();
  const isAr = language === 'ar';
  const token = getToken();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const clinicId = user?.clinicId ?? '';

  const load = useCallback(async () => {
    if (!clinicId) return;
    setLoading(true);
    if (!token) {
      setBranches(getBranchesForClinic(clinicId));
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<any[]>('/branches');
      const normed = data.map(normaliseBranch);
      setBranches(normed);
    } catch {
      setBranches(getBranchesForClinic(clinicId));
    } finally {
      setLoading(false);
    }
  }, [clinicId, token]);

  useEffect(() => { load(); }, [load]);

  if (!permissions.canViewSettings) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Lock className="h-8 w-8" />
        <p>{isAr ? 'غير مصرح' : 'Access denied'}</p>
      </div>
    );
  }

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (b: Branch) => {
    setEditingId(b.id);
    setForm({ name: b.name, nameAr: b.nameAr, address: b.address ?? '', addressAr: b.addressAr ?? '', phone: b.phone ?? '' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      if (!token) {
        if (editingId) {
          updateBranch(editingId, { name: form.name, nameAr: form.nameAr, address: form.address, addressAr: form.addressAr, phone: form.phone });
        } else {
          addBranch({ clinicId, name: form.name, nameAr: form.nameAr, address: form.address, addressAr: form.addressAr, phone: form.phone, isActive: true });
        }
        toast({ title: editingId ? (isAr ? 'تم تحديث الفرع' : 'Branch updated') : (isAr ? 'تم إضافة الفرع' : 'Branch added') });
        setDialogOpen(false);
        await load();
        return;
      }
      if (editingId) {
        await apiFetch(`/branches/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: form.name, nameAr: form.nameAr, address: form.address, phone: form.phone }),
        });
        toast({ title: isAr ? 'تم تحديث الفرع' : 'Branch updated' });
      } else {
        await apiFetch('/branches', {
          method: 'POST',
          body: JSON.stringify({ name: form.name, nameAr: form.nameAr, address: form.address, phone: form.phone }),
        });
        toast({ title: isAr ? 'تم إضافة الفرع' : 'Branch added' });
      }
      setDialogOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (branches.length <= 1) {
      toast({ title: isAr ? 'لا يمكن حذف الفرع الوحيد' : 'Cannot delete the only branch', variant: 'destructive' });
      return;
    }
    try {
      if (!token) {
        deleteBranch(id);
        await load();
        toast({ title: isAr ? 'تم حذف الفرع' : 'Branch deleted' });
        return;
      }
      await apiFetch(`/branches/${id}`, { method: 'DELETE' });
      await load();
      toast({ title: isAr ? 'تم حذف الفرع' : 'Branch deleted' });
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">{isAr ? 'إدارة الفروع' : 'Branch Management'}</h1>
          <Badge variant="outline">{branches.length}</Badge>
        </div>
        <Button size="sm" className="gap-2" onClick={openAdd} data-testid="button-add-branch">
          <Plus className="h-4 w-4" />
          {isAr ? 'إضافة فرع' : 'Add Branch'}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {isAr ? 'الفروع النشطة' : 'Active Branches'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'الاسم' : 'Name'}</TableHead>
                  <TableHead className="hidden sm:table-cell">{isAr ? 'العنوان' : 'Address'}</TableHead>
                  <TableHead className="hidden md:table-cell">{isAr ? 'الهاتف' : 'Phone'}</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {isAr ? 'لا توجد فروع بعد' : 'No branches yet'}
                    </TableCell>
                  </TableRow>
                )}
                {branches.map(b => (
                  <TableRow key={b.id} data-testid={`row-branch-${b.id}`}>
                    <TableCell>
                      <p className="font-medium text-sm">{isAr ? b.nameAr || b.name : b.name}</p>
                      {isAr && b.name && b.nameAr && <p className="text-xs text-muted-foreground">{b.name}</p>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {(b.address || b.addressAr) && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {isAr ? b.addressAr || b.address : b.address}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {b.phone && (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          {b.phone}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(b)} data-testid={`button-edit-branch-${b.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(b.id)} data-testid={`button-delete-branch-${b.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? (isAr ? 'تعديل الفرع' : 'Edit Branch') : (isAr ? 'إضافة فرع جديد' : 'Add New Branch')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'الاسم (إنجليزي)' : 'Name (English)'} *</Label>
                <Input data-testid="input-branch-name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Main Branch" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
                <Input data-testid="input-branch-name-ar" value={form.nameAr} onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))} placeholder="الفرع الرئيسي" dir="rtl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'العنوان (إنجليزي)' : 'Address (English)'}</Label>
                <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'العنوان (عربي)' : 'Address (Arabic)'}</Label>
                <Input value={form.addressAr} onChange={e => setForm(p => ({ ...p, addressAr: e.target.value }))} placeholder="١٢٣ شارع الرئيسي" dir="rtl" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isAr ? 'الهاتف' : 'Phone'}</Label>
              <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="01000000000" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button data-testid="button-save-branch" onClick={handleSave} disabled={!form.name.trim() || busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isAr ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
