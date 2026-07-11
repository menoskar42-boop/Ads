import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { usePermissions } from '@/hooks/usePermissions';
import { getToken } from '@/utils/authToken';
import {
  offerStore,
  createOffer,
  updateOffer,
  deleteOffer,
  toggleOfferActive,
  OFFER_TYPE_LABELS,
  SERVICE_TYPE_LABELS,
} from '@/stores/offerStore';
import { MedicalOffer, OfferType, OfferServiceType } from '@/types';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
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

function normaliseOffer(o: any): MedicalOffer {
  return {
    id: o.id,
    clinicId: o.clinic_id ?? '',
    clinicName: o.clinic_name ?? '',
    doctorId: o.doctor_id ?? undefined,
    doctorName: o.doctor_name ?? undefined,
    title: o.title ?? '',
    titleAr: o.title_ar ?? o.title ?? '',
    description: o.description ?? '',
    descriptionAr: o.description_ar ?? '',
    offerType: o.offer_type as OfferType,
    serviceType: o.service_type as OfferServiceType,
    startDate: o.start_date ?? '',
    expiresAt: o.expires_at ?? '',
    originalPrice: o.original_price ?? undefined,
    discountedPrice: o.discounted_price ?? undefined,
    discountPercent: o.discount_percent ?? undefined,
    maxUses: o.max_uses ?? undefined,
    usedCount: o.used_count ?? 0,
    conditions: o.conditions ?? undefined,
    isActive: o.is_active ?? true,
  };
}
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tag,
  Plus,
  Edit,
  Trash2,
  Search,
  ToggleLeft,
  ToggleRight,
  CalendarDays,
  Users,
  Percent,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

type FormState = {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  offerType: OfferType | '';
  serviceType: OfferServiceType | '';
  doctorId: string;
  startDate: string;
  expiresAt: string;
  originalPrice: string;
  discountedPrice: string;
  discountPercent: string;
  maxUses: string;
  firstVisitOnly: boolean;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  title: '',
  titleAr: '',
  description: '',
  descriptionAr: '',
  offerType: '',
  serviceType: '',
  doctorId: '',
  startDate: new Date().toISOString().split('T')[0],
  expiresAt: '',
  originalPrice: '',
  discountedPrice: '',
  discountPercent: '',
  maxUses: '',
  firstVisitOnly: false,
  isActive: true,
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const OffersManagement: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const { activeDoctors } = useUsers();
  const isAr = language === 'ar';

  const [offers, setOffers] = useState<MedicalOffer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<MedicalOffer | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [specificDays, setSpecificDays] = useState<number[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const token = getToken();

  const loadOffers = useCallback(async () => {
    if (!token) {
      setOffers(offerStore.filter(o => !user?.clinicId || o.clinicId === user.clinicId));
      return;
    }
    try {
      const data = await apiFetch<any[]>('/offers');
      setOffers(data.map(normaliseOffer));
    } catch {
      setOffers(offerStore.filter(o => !user?.clinicId || o.clinicId === user.clinicId));
    }
  }, [token, user?.clinicId]);

  useEffect(() => {
    loadOffers();
    if (!token) {
      return offerStore.subscribe(loadOffers);
    }
  }, [loadOffers, token]);

  const filtered = offers.filter(o => {
    const q = searchQuery.toLowerCase();
    const matchQ =
      !q ||
      o.title.toLowerCase().includes(q) ||
      o.titleAr.includes(searchQuery) ||
      o.doctorName?.toLowerCase().includes(q);
    const matchStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && o.isActive) ||
      (filterStatus === 'inactive' && !o.isActive);
    return matchQ && matchStatus;
  });

  const stats = {
    total: offers.length,
    active: offers.filter(o => o.isActive).length,
    totalUses: offers.reduce((sum, o) => sum + o.usedCount, 0),
    expiringSoon: offers.filter(o => {
      const diff = (new Date(o.expiresAt).getTime() - Date.now()) / 86400000;
      return o.isActive && diff >= 0 && diff <= 7;
    }).length,
  };

  const openCreate = () => {
    setEditingOffer(null);
    setForm(EMPTY_FORM);
    setSpecificDays([]);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (offer: MedicalOffer) => {
    setEditingOffer(offer);
    setForm({
      title: offer.title,
      titleAr: offer.titleAr,
      description: offer.description,
      descriptionAr: offer.descriptionAr,
      offerType: offer.offerType,
      serviceType: offer.serviceType,
      doctorId: offer.doctorId || '',
      startDate: offer.startDate,
      expiresAt: offer.expiresAt,
      originalPrice: offer.originalPrice != null ? String(offer.originalPrice) : '',
      discountedPrice: offer.discountedPrice != null ? String(offer.discountedPrice) : '',
      discountPercent: offer.discountPercent != null ? String(offer.discountPercent) : '',
      maxUses: offer.maxUses != null ? String(offer.maxUses) : '',
      firstVisitOnly: offer.conditions?.firstVisitOnly ?? false,
      isActive: offer.isActive,
    });
    setSpecificDays(offer.conditions?.specificDays ?? []);
    setErrors({});
    setDialogOpen(true);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.title.trim()) e.title = isAr ? 'مطلوب' : 'Required';
    if (!form.titleAr.trim()) e.titleAr = isAr ? 'مطلوب' : 'Required';
    if (!form.description.trim()) e.description = isAr ? 'مطلوب' : 'Required';
    if (!form.offerType) e.offerType = isAr ? 'مطلوب' : 'Required';
    if (!form.serviceType) e.serviceType = isAr ? 'مطلوب' : 'Required';
    if (!form.expiresAt) e.expiresAt = isAr ? 'مطلوب' : 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const clinicDoc = activeDoctors.find(d => d.id === form.doctorId);
    const clinic = user?.clinicId ? { clinicId: user.clinicId, clinicName: user.clinicName || '' } : { clinicId: 'clinic-1', clinicName: '' };
    const payload: Omit<MedicalOffer, 'id'> = {
      ...clinic,
      doctorId: form.doctorId || undefined,
      doctorName: clinicDoc ? (isAr ? clinicDoc.nameAr || clinicDoc.name : clinicDoc.name) : undefined,
      title: form.title,
      titleAr: form.titleAr,
      description: form.description,
      descriptionAr: form.descriptionAr,
      offerType: form.offerType as OfferType,
      serviceType: form.serviceType as OfferServiceType,
      startDate: form.startDate,
      expiresAt: form.expiresAt,
      originalPrice: form.originalPrice ? parseFloat(form.originalPrice) : undefined,
      discountedPrice: form.discountedPrice ? parseFloat(form.discountedPrice) : undefined,
      discountPercent: form.discountPercent ? parseFloat(form.discountPercent) : undefined,
      maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
      usedCount: editingOffer?.usedCount ?? 0,
      conditions: {
        firstVisitOnly: form.firstVisitOnly,
        specificDays: specificDays.length > 0 ? specificDays : undefined,
      },
      isActive: form.isActive,
    };

    if (!token) {
      if (editingOffer) {
        updateOffer(editingOffer.id, payload);
      } else {
        createOffer(payload);
      }
      setDialogOpen(false);
      await loadOffers();
      return;
    }
    try {
      const apiPayload = {
        title: payload.title,
        titleAr: payload.titleAr,
        description: payload.description,
        descriptionAr: payload.descriptionAr,
        offerType: payload.offerType,
        serviceType: payload.serviceType,
        doctorId: payload.doctorId || null,
        startDate: payload.startDate,
        expiresAt: payload.expiresAt,
        originalPrice: payload.originalPrice,
        discountedPrice: payload.discountedPrice,
        discountPercent: payload.discountPercent,
        maxUses: payload.maxUses,
        conditions: payload.conditions,
        isActive: payload.isActive,
      };
      if (editingOffer) {
        await apiFetch(`/offers/${editingOffer.id}`, { method: 'PATCH', body: JSON.stringify(apiPayload) });
      } else {
        await apiFetch('/offers', { method: 'POST', body: JSON.stringify(apiPayload) });
      }
    } catch {
      if (editingOffer) {
        updateOffer(editingOffer.id, payload);
      } else {
        createOffer(payload);
      }
    }
    setDialogOpen(false);
    await loadOffers();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    if (!token) {
      deleteOffer(id);
      await loadOffers();
      return;
    }
    try {
      await apiFetch(`/offers/${id}`, { method: 'DELETE' });
    } catch {
      deleteOffer(id);
    }
    await loadOffers();
  };

  const toggleDay = (day: number) => {
    setSpecificDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const getOfferBadgeColor = (type: OfferType): string => {
    const map: Record<OfferType, string> = {
      percentage_discount: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      fixed_discount: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
      free_followup: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      consultation_package: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      family_package: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
      first_visit: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
      urgent_visit: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      reward_points: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    };
    return map[type] ?? 'bg-muted text-muted-foreground';
  };

  const isExpired = (date: string) => new Date(date) < new Date();
  const daysLeft = (date: string) =>
    Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86400000));

  const f = (k: keyof FormState, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="h-6 w-6 text-primary" />
            {isAr ? 'العروض الطبية' : 'Medical Offers'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAr ? 'إدارة العروض والخصومات الطبية للعيادة' : 'Manage clinic medical offers and discounts'}
          </p>
        </div>
        {permissions.canViewOffers && (
          <Button onClick={openCreate} className="gap-2" data-testid="btn-create-offer">
            <Plus className="h-4 w-4" />
            {isAr ? 'إضافة عرض' : 'Add Offer'}
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: isAr ? 'إجمالي العروض' : 'Total Offers', value: stats.total, icon: Tag, color: 'text-primary' },
          { label: isAr ? 'العروض النشطة' : 'Active Offers', value: stats.active, icon: CheckCircle2, color: 'text-green-600' },
          { label: isAr ? 'إجمالي الاستخدامات' : 'Total Uses', value: stats.totalUses, icon: TrendingUp, color: 'text-blue-600' },
          { label: isAr ? 'تنتهي قريباً' : 'Expiring Soon', value: stats.expiringSoon, icon: Clock, color: 'text-orange-500' },
        ].map((s, i) => (
          <Card key={i} className="border-border/60">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-bold mt-0.5">{s.value}</p>
                </div>
                <s.icon className={`h-7 w-7 ${s.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={isAr ? 'بحث في العروض...' : 'Search offers...'}
            className="pl-9"
            data-testid="input-search-offers"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={filterStatus === s ? 'default' : 'outline'}
              onClick={() => setFilterStatus(s)}
              data-testid={`btn-filter-${s}`}
            >
              {s === 'all' ? (isAr ? 'الكل' : 'All') : s === 'active' ? (isAr ? 'نشط' : 'Active') : (isAr ? 'غير نشط' : 'Inactive')}
            </Button>
          ))}
        </div>
      </div>

      {/* Offers Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="h-12 w-12 mx-auto opacity-30 mb-3" />
          <p className="font-medium">{isAr ? 'لا توجد عروض' : 'No offers found'}</p>
          <p className="text-sm mt-1">{isAr ? 'أضف عرضاً جديداً للبدء' : 'Add a new offer to get started'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(offer => {
            const expired = isExpired(offer.expiresAt);
            const days = daysLeft(offer.expiresAt);
            const usagePercent = offer.maxUses ? Math.min(100, (offer.usedCount / offer.maxUses) * 100) : null;
            return (
              <Card key={offer.id} className={`border-border/60 transition-all ${!offer.isActive || expired ? 'opacity-60' : ''}`} data-testid={`card-offer-${offer.id}`}>
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-snug truncate">{isAr ? offer.titleAr : offer.title}</p>
                      {offer.doctorName && (
                        <p className="text-xs text-muted-foreground mt-0.5">{offer.doctorName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge className={`text-xs px-2 py-0 ${getOfferBadgeColor(offer.offerType)}`}>
                        {OFFER_TYPE_LABELS[offer.offerType]?.[isAr ? 'ar' : 'en'] ?? offer.offerType}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-3 space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {isAr ? offer.descriptionAr : offer.description}
                  </p>

                  {/* Pricing */}
                  {(offer.originalPrice || offer.discountedPrice) && (
                    <div className="flex items-center gap-2">
                      {offer.originalPrice && (
                        <span className="text-sm text-muted-foreground line-through">{offer.originalPrice} ج.م</span>
                      )}
                      {offer.discountedPrice && (
                        <span className="text-base font-bold text-primary">{offer.discountedPrice} ج.م</span>
                      )}
                      {offer.discountPercent && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-300 gap-0.5">
                          <Percent className="h-3 w-3" />{offer.discountPercent}%
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Usage bar */}
                  {usagePercent !== null && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{offer.usedCount} / {offer.maxUses}</span>
                        <span>{Math.round(usagePercent)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${usagePercent >= 90 ? 'bg-red-500' : usagePercent >= 60 ? 'bg-orange-400' : 'bg-primary'}`}
                          style={{ width: `${usagePercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Expiry */}
                  <div className="flex items-center justify-between text-xs">
                    <span className={`flex items-center gap-1 ${expired ? 'text-red-500' : days <= 7 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                      <CalendarDays className="h-3 w-3" />
                      {expired
                        ? (isAr ? 'منتهي' : 'Expired')
                        : days === 0
                        ? (isAr ? 'ينتهي اليوم' : 'Expires today')
                        : `${days} ${isAr ? 'يوم متبقي' : 'days left'}`}
                    </span>
                    <div className="flex items-center gap-1">
                      {offer.conditions?.firstVisitOnly && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0">{isAr ? 'أول زيارة' : 'First visit'}</Badge>
                      )}
                      {offer.isActive && !expired ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {permissions.canViewOffers && (
                    <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 gap-1 text-xs flex-1"
                        onClick={() => openEdit(offer)}
                        data-testid={`btn-edit-offer-${offer.id}`}
                      >
                        <Edit className="h-3 w-3" />{isAr ? 'تعديل' : 'Edit'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 gap-1 text-xs flex-1"
                        onClick={async () => {
                          if (!token) {
                            toggleOfferActive(offer.id);
                            await loadOffers();
                            return;
                          }
                          try {
                            await apiFetch(`/offers/${offer.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !offer.isActive }) });
                          } catch {
                            toggleOfferActive(offer.id);
                          }
                          await loadOffers();
                        }}
                        data-testid={`btn-toggle-offer-${offer.id}`}
                      >
                        {offer.isActive
                          ? <><ToggleRight className="h-3 w-3 text-green-500" />{isAr ? 'إيقاف' : 'Deactivate'}</>
                          : <><ToggleLeft className="h-3 w-3 text-muted-foreground" />{isAr ? 'تفعيل' : 'Activate'}</>
                        }
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(offer.id)}
                        data-testid={`btn-delete-offer-${offer.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              {editingOffer
                ? (isAr ? 'تعديل العرض' : 'Edit Offer')
                : (isAr ? 'إضافة عرض جديد' : 'Create New Offer')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Titles */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isAr ? 'العنوان (إنجليزي)' : 'Title (English)'} <span className="text-destructive">*</span></Label>
                <Input value={form.title} onChange={e => f('title', e.target.value)} placeholder="e.g. 30% Off Cardiology" data-testid="input-offer-title" />
                {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'العنوان (عربي)' : 'Title (Arabic)'} <span className="text-destructive">*</span></Label>
                <Input value={form.titleAr} onChange={e => f('titleAr', e.target.value)} placeholder="مثال: خصم 30% على القلب" dir="rtl" data-testid="input-offer-title-ar" />
                {errors.titleAr && <p className="text-xs text-destructive">{errors.titleAr}</p>}
              </div>
            </div>

            {/* Descriptions */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isAr ? 'الوصف (إنجليزي)' : 'Description (English)'} <span className="text-destructive">*</span></Label>
                <Textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3} placeholder="Describe the offer..." data-testid="input-offer-desc" />
                {errors.description && <p className="text-xs text-destructive">{errors.description}</p>}
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'الوصف (عربي)' : 'Description (Arabic)'}</Label>
                <Textarea value={form.descriptionAr} onChange={e => f('descriptionAr', e.target.value)} rows={3} placeholder="اوصف العرض..." dir="rtl" data-testid="input-offer-desc-ar" />
              </div>
            </div>

            {/* Type + Service */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isAr ? 'نوع العرض' : 'Offer Type'} <span className="text-destructive">*</span></Label>
                <Select value={form.offerType} onValueChange={v => f('offerType', v)}>
                  <SelectTrigger data-testid="select-offer-type">
                    <SelectValue placeholder={isAr ? 'اختر النوع' : 'Select type'} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OFFER_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v[isAr ? 'ar' : 'en']}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.offerType && <p className="text-xs text-destructive">{errors.offerType}</p>}
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'نوع الخدمة' : 'Service Type'} <span className="text-destructive">*</span></Label>
                <Select value={form.serviceType} onValueChange={v => f('serviceType', v)}>
                  <SelectTrigger data-testid="select-service-type">
                    <SelectValue placeholder={isAr ? 'اختر الخدمة' : 'Select service'} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v[isAr ? 'ar' : 'en']}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.serviceType && <p className="text-xs text-destructive">{errors.serviceType}</p>}
              </div>
            </div>

            {/* Doctor (optional) */}
            <div className="space-y-1">
              <Label>{isAr ? 'الطبيب (اختياري)' : 'Doctor (optional)'}</Label>
              <Select value={form.doctorId || 'none'} onValueChange={v => f('doctorId', v === 'none' ? '' : v)}>
                <SelectTrigger data-testid="select-offer-doctor">
                  <SelectValue placeholder={isAr ? 'جميع الأطباء' : 'All doctors'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{isAr ? 'جميع الأطباء' : 'All doctors'}</SelectItem>
                  {activeDoctors.map(d => (
                    <SelectItem key={d.id} value={d.id}>{isAr ? d.nameAr || d.name : d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isAr ? 'تاريخ البدء' : 'Start Date'}</Label>
                <Input type="date" value={form.startDate} onChange={e => f('startDate', e.target.value)} data-testid="input-offer-start" />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'تاريخ الانتهاء' : 'Expiry Date'} <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.expiresAt} onChange={e => f('expiresAt', e.target.value)} min={form.startDate} data-testid="input-offer-expiry" />
                {errors.expiresAt && <p className="text-xs text-destructive">{errors.expiresAt}</p>}
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>{isAr ? 'السعر الأصلي (ج.م)' : 'Original Price (ج.م)'}</Label>
                <Input type="number" min="0" value={form.originalPrice} onChange={e => f('originalPrice', e.target.value)} placeholder="0" data-testid="input-offer-original-price" />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'السعر بعد الخصم (ج.م)' : 'Discounted Price (ج.م)'}</Label>
                <Input type="number" min="0" value={form.discountedPrice} onChange={e => f('discountedPrice', e.target.value)} placeholder="0" data-testid="input-offer-discounted-price" />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'نسبة الخصم (%)' : 'Discount (%)'}</Label>
                <Input type="number" min="0" max="100" value={form.discountPercent} onChange={e => f('discountPercent', e.target.value)} placeholder="0" data-testid="input-offer-discount-percent" />
              </div>
            </div>

            {/* Max Uses */}
            <div className="space-y-1">
              <Label>{isAr ? 'الحد الأقصى للاستخدام (اختياري)' : 'Max Uses (optional)'}</Label>
              <Input type="number" min="1" value={form.maxUses} onChange={e => f('maxUses', e.target.value)} placeholder={isAr ? 'بلا حد' : 'Unlimited'} className="w-48" data-testid="input-offer-max-uses" />
            </div>

            {/* Conditions */}
            <div className="space-y-3 border border-border/60 rounded-xl p-4">
              <p className="text-sm font-medium">{isAr ? 'شروط العرض' : 'Offer Conditions'}</p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="firstVisit"
                  checked={form.firstVisitOnly}
                  onCheckedChange={v => f('firstVisitOnly', !!v)}
                  data-testid="checkbox-first-visit"
                />
                <Label htmlFor="firstVisit" className="cursor-pointer text-sm">
                  {isAr ? 'للزيارة الأولى فقط' : 'First visit only'}
                </Label>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">{isAr ? 'أيام محددة (اتركه فارغاً لجميع الأيام)' : 'Specific days (leave empty for all days)'}</p>
                <div className="flex gap-2 flex-wrap">
                  {DAY_LABELS.map((day, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${specificDays.includes(i) ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                      data-testid={`btn-day-${i}`}
                    >
                      {isAr ? DAY_LABELS_AR[i] : day}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
              <Switch
                checked={form.isActive}
                onCheckedChange={v => f('isActive', v)}
                data-testid="switch-offer-active"
              />
              <div>
                <p className="text-sm font-medium">{isAr ? 'العرض نشط' : 'Offer Active'}</p>
                <p className="text-xs text-muted-foreground">{isAr ? 'سيظهر العرض للمرضى على الفور' : 'Offer will be visible to patients immediately'}</p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-cancel-offer">
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button onClick={handleSave} data-testid="btn-save-offer">
              {editingOffer ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'إضافة العرض' : 'Create Offer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? 'حذف العرض' : 'Delete Offer'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? 'هل أنت متأكد من حذف هذا العرض؟ لا يمكن التراجع عن هذا الإجراء.'
                : 'Are you sure you want to delete this offer? This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-cancel-delete">{isAr ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="btn-confirm-delete"
            >
              {isAr ? 'حذف' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default OffersManagement;
