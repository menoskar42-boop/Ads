import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { useSpecialties } from '@/hooks/useSpecialties';
import { UserRole } from '@/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Search, Plus, Edit, Trash2, Shield, Stethoscope, UserCog, ToggleLeft, ToggleRight, Home, Calendar, Clock, Eye, EyeOff, Copy, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  homeVisitScheduleStore, getDoctorHomeVisitSchedules,
  addHomeVisitSchedule, updateHomeVisitSchedule, removeHomeVisitSchedule,
  type HomeVisitSchedule,
} from '@/stores/homeVisitScheduleStore';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const HomeVisitScheduleEditor: React.FC<{ doctorId: string; isRTL: boolean }> = ({ doctorId, isRTL }) => {
  const [schedules, setSchedules] = useState<HomeVisitSchedule[]>(() => getDoctorHomeVisitSchedules(doctorId));
  const [adding, setAdding] = useState(false);
  const [newEntry, setNewEntry] = useState({ dayOfWeek: '5', startTime: '10:00', endTime: '14:00', maxVisitsPerDay: '4' });

  const refresh = useCallback(() => setSchedules(getDoctorHomeVisitSchedules(doctorId)), [doctorId]);

  useEffect(() => {
    refresh();
    return homeVisitScheduleStore.subscribe(refresh);
  }, [refresh]);

  const handleAdd = () => {
    const dow = parseInt(newEntry.dayOfWeek);
    const existing = schedules.find(s => s.dayOfWeek === dow);
    if (existing) {
      toast.error(isRTL ? 'هذا اليوم موجود بالفعل' : 'This day already exists');
      return;
    }
    if (newEntry.startTime >= newEntry.endTime) {
      toast.error(isRTL ? 'وقت البداية يجب أن يكون قبل وقت النهاية' : 'Start time must be before end time');
      return;
    }
    addHomeVisitSchedule({
      doctorId,
      dayOfWeek: dow,
      startTime: newEntry.startTime,
      endTime: newEntry.endTime,
      maxVisitsPerDay: parseInt(newEntry.maxVisitsPerDay) || 4,
      isActive: true,
    });
    setAdding(false);
    toast.success(isRTL ? 'تمت إضافة جدول الزيارات المنزلية' : 'Home visit schedule day added');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Calendar className="h-3.5 w-3.5 text-orange-500" />
          {isRTL ? 'جدول الزيارات المنزلية' : 'Home Visit Schedule'}
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setAdding(v => !v)}
          data-testid="button-add-hv-schedule"
        >
          <Plus className="h-3 w-3" />
          {isRTL ? 'إضافة يوم' : 'Add Day'}
        </Button>
      </div>

      {adding && (
        <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">{isRTL ? 'اليوم' : 'Day'}</Label>
              <Select value={newEntry.dayOfWeek} onValueChange={v => setNewEntry(p => ({ ...p, dayOfWeek: v }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-hv-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {DAY_NAMES.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {isRTL ? DAY_NAMES_AR[i] : d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isRTL ? 'الحد اليومي' : 'Daily Limit'}</Label>
              <Input
                type="number"
                min="1"
                max="20"
                className="h-8 text-xs"
                value={newEntry.maxVisitsPerDay}
                onChange={e => setNewEntry(p => ({ ...p, maxVisitsPerDay: e.target.value }))}
                data-testid="input-hv-max-visits"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isRTL ? 'وقت البداية' : 'Start Time'}</Label>
              <Input
                type="time"
                className="h-8 text-xs"
                value={newEntry.startTime}
                onChange={e => setNewEntry(p => ({ ...p, startTime: e.target.value }))}
                data-testid="input-hv-start-time"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{isRTL ? 'وقت الانتهاء' : 'End Time'}</Label>
              <Input
                type="time"
                className="h-8 text-xs"
                value={newEntry.endTime}
                onChange={e => setNewEntry(p => ({ ...p, endTime: e.target.value }))}
                data-testid="input-hv-end-time"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" className="h-7 text-xs gap-1" onClick={handleAdd} data-testid="button-save-hv-schedule">
              <Plus className="h-3 w-3" />
              {isRTL ? 'إضافة' : 'Add'}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(false)}>
              {isRTL ? 'إلغاء' : 'Cancel'}
            </Button>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          {isRTL ? 'لا توجد أيام زيارة منزلية — أضف يوماً للبدء' : 'No home visit days configured — add a day to start'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {schedules
            .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
            .map(s => (
              <div
                key={s.id}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${s.isActive ? 'bg-card' : 'bg-muted/40 opacity-60'}`}
                data-testid={`row-hv-schedule-${s.id}`}
              >
                <span className="font-semibold w-8 shrink-0 text-primary">
                  {isRTL ? DAY_NAMES_AR[s.dayOfWeek] : DAY_NAMES[s.dayOfWeek]}
                </span>
                <span className="text-muted-foreground flex items-center gap-1 flex-1">
                  <Clock className="h-3 w-3" />
                  {s.startTime} – {s.endTime}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {isRTL ? `حد: ${s.maxVisitsPerDay}` : `Max: ${s.maxVisitsPerDay}`}
                </span>
                <Switch
                  checked={s.isActive}
                  onCheckedChange={v => updateHomeVisitSchedule(s.id, { isActive: v })}
                  className="scale-75"
                  data-testid={`switch-hv-schedule-${s.id}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive/60 hover:text-destructive shrink-0"
                  onClick={() => removeHomeVisitSchedule(s.id)}
                  data-testid={`button-delete-hv-schedule-${s.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
};

const StaffManagement = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isRTL = language === 'ar';
  const { users, addUser, updateUser, deleteUser } = useUsers();
  const { specialties } = useSpecialties();

  const clinicId = user?.clinicId || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  // Shown after successful creation so admin can copy credentials
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; name: string } | null>(null);
  const [form, setForm] = useState({
    name: '', nameAr: '', email: '', password: '', role: 'reception' as UserRole, specialtyId: '',
    homeVisitEnabled: false, homeVisitPrice: '', homeVisitDurationMinutes: '', homeVisitDailyLimit: '', homeVisitRadiusKm: '',
  });

  if (user?.role !== 'admin') {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">{isRTL ? 'غير مصرح' : 'Unauthorized'}</p></div>;
  }

  const filtered = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.nameAr.includes(searchQuery) || u.email.toLowerCase().includes(q);
  });

  const resetForm = () => {
    setForm({ name: '', nameAr: '', email: '', password: '', role: 'reception', specialtyId: '', homeVisitEnabled: false, homeVisitPrice: '', homeVisitDurationMinutes: '', homeVisitDailyLimit: '', homeVisitRadiusKm: '' });
    setShowPw(false);
  };

  const handleAdd = () => {
    if (!form.name || !form.email || !form.password) {
      toast.error(isRTL ? 'يرجى ملء الاسم والبريد وكلمة المرور' : 'Please fill name, email and password');
      return;
    }
    addUser({ ...form, isActive: true, clinicId, password: form.password });
    setIsAddOpen(false);
    setCreatedCredentials({ email: form.email, password: form.password, name: form.name });
    resetForm();
  };

  const handleEdit = () => {
    if (!editId || !form.name || !form.email) {
      toast.error(isRTL ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    const homeVisitUpdates = form.role === 'doctor' ? {
      homeVisitEnabled: form.homeVisitEnabled,
      homeVisitPrice: form.homeVisitPrice ? Number(form.homeVisitPrice) : undefined,
      homeVisitDurationMinutes: form.homeVisitDurationMinutes ? Number(form.homeVisitDurationMinutes) : undefined,
      homeVisitDailyLimit: form.homeVisitDailyLimit ? Number(form.homeVisitDailyLimit) : undefined,
      homeVisitRadiusKm: form.homeVisitRadiusKm ? Number(form.homeVisitRadiusKm) : undefined,
    } : {
      homeVisitEnabled: false,
      homeVisitPrice: undefined,
      homeVisitDurationMinutes: undefined,
      homeVisitDailyLimit: undefined,
      homeVisitRadiusKm: undefined,
    };
    updateUser(editId, {
      name: form.name, nameAr: form.nameAr, email: form.email, role: form.role,
      specialtyId: form.role === 'doctor' ? form.specialtyId : undefined,
      ...homeVisitUpdates,
    });
    setEditId(null);
    resetForm();
    toast.success(isRTL ? 'تم تعديل المستخدم بنجاح' : 'User updated successfully');
  };

  const handleDelete = (id: string) => {
    deleteUser(id);
    toast.success(isRTL ? 'تم حذف المستخدم' : 'User deleted');
  };

  const openEdit = (u: typeof users[0]) => {
    setEditId(u.id);
    setForm({
      name: u.name, nameAr: u.nameAr, email: u.email, role: u.role, specialtyId: u.specialtyId || '',
      homeVisitEnabled: u.homeVisitEnabled || false,
      homeVisitPrice: u.homeVisitPrice?.toString() || '',
      homeVisitDurationMinutes: u.homeVisitDurationMinutes?.toString() || '',
      homeVisitDailyLimit: u.homeVisitDailyLimit?.toString() || '',
      homeVisitRadiusKm: u.homeVisitRadiusKm?.toString() || '',
    });
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin': return <Badge className="gap-1"><Shield className="h-3 w-3" />{t('auth.admin')}</Badge>;
      case 'doctor': return <Badge variant="secondary" className="gap-1"><Stethoscope className="h-3 w-3" />{t('auth.doctor')}</Badge>;
      default: return <Badge variant="outline" className="gap-1"><UserCog className="h-3 w-3" />{t('auth.receptionist')}</Badge>;
    }
  };

  const formFields = (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{isRTL ? 'الاسم (EN)' : 'Name (EN)'}</Label>
          <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-user-name-en" />
        </div>
        <div className="space-y-2">
          <Label>{isRTL ? 'الاسم (AR)' : 'Name (AR)'}</Label>
          <Input value={form.nameAr} onChange={e => setForm({ ...form, nameAr: e.target.value })} dir="rtl" data-testid="input-user-name-ar" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{isRTL ? 'البريد الإلكتروني' : 'Email'}</Label>
        <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} data-testid="input-user-email" />
      </div>
      <div className="space-y-2">
        <Label>{isRTL ? 'الدور' : 'Role'}</Label>
        <Select value={form.role} onValueChange={v => setForm({ ...form, role: v as UserRole })}>
          <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-60 overflow-y-auto">
            <SelectItem value="admin">{t('auth.admin')}</SelectItem>
            <SelectItem value="reception">{t('auth.receptionist')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {!editId && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
            {isRTL ? 'كلمة المرور *' : 'Password *'}
          </Label>
          <div className="relative">
            <Input
              type={showPw ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder={isRTL ? 'أدخل كلمة مرور للموظف' : 'Enter staff password'}
              className="pr-10 rtl:pr-3 rtl:pl-10"
              data-testid="input-user-password"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 rtl:right-auto rtl:left-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowPw(v => !v)}
            >
              {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{isRTL ? 'ستظهر بيانات الدخول بعد الحفظ' : 'Login credentials will be shown after saving'}</p>
        </div>
      )}
      {form.role === 'doctor' && (
        <div className="space-y-2">
          <Label>{isRTL ? 'التخصص' : 'Specialty'}</Label>
          <Select value={form.specialtyId} onValueChange={v => setForm({ ...form, specialtyId: v })}>
            <SelectTrigger data-testid="select-user-specialty"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              {specialties.filter(s => s.isActive).map(sp => (
                <SelectItem key={sp.id} value={sp.id}>{isRTL ? sp.nameAr : sp.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {form.role === 'doctor' && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Home className="h-4 w-4 text-orange-500" />
                <Label className="font-semibold">{isRTL ? 'الزيارات المنزلية' : 'Home Visits'}</Label>
              </div>
              <Switch
                checked={form.homeVisitEnabled}
                onCheckedChange={v => setForm({ ...form, homeVisitEnabled: v })}
                data-testid="switch-home-visit-enabled"
              />
            </div>
            {form.homeVisitEnabled && (
              <>
                <div className="grid grid-cols-2 gap-3 pl-6 rtl:pl-0 rtl:pr-6">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRTL ? 'السعر (ج.م)' : 'Price (EGP)'}</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="e.g. 400"
                      value={form.homeVisitPrice}
                      onChange={e => setForm({ ...form, homeVisitPrice: e.target.value })}
                      data-testid="input-home-visit-price"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRTL ? 'المدة (دقيقة)' : 'Duration (min)'}</Label>
                    <Input
                      type="number"
                      min="15"
                      placeholder="e.g. 45"
                      value={form.homeVisitDurationMinutes}
                      onChange={e => setForm({ ...form, homeVisitDurationMinutes: e.target.value })}
                      data-testid="input-home-visit-duration"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRTL ? 'الحد اليومي (زيارات)' : 'Daily Limit (visits)'}</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 4"
                      value={form.homeVisitDailyLimit}
                      onChange={e => setForm({ ...form, homeVisitDailyLimit: e.target.value })}
                      data-testid="input-home-visit-daily-limit"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{isRTL ? 'نطاق التغطية (كم)' : 'Coverage Radius (km)'}</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="e.g. 15"
                      value={form.homeVisitRadiusKm}
                      onChange={e => setForm({ ...form, homeVisitRadiusKm: e.target.value })}
                      data-testid="input-home-visit-radius"
                    />
                  </div>
                </div>
                {/* Home visit schedule — only shown when editing an existing doctor */}
                {editId && (
                  <>
                    <Separator className="my-1" />
                    <HomeVisitScheduleEditor doctorId={editId} isRTL={isRTL} />
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* ── Credentials Dialog (shown once after staff creation) ── */}
      <Dialog open={!!createdCredentials} onOpenChange={open => { if (!open) setCreatedCredentials(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-chart-2">
              <KeyRound className="h-5 w-5" />
              {isRTL ? 'بيانات دخول الموظف' : 'Staff Login Credentials'}
            </DialogTitle>
          </DialogHeader>
          {createdCredentials && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                {isRTL
                  ? `تم إنشاء حساب "${createdCredentials.name}" بنجاح. احفظ بيانات الدخول وأرسلها للموظف.`
                  : `Account for "${createdCredentials.name}" created. Save and share these credentials with the staff member.`}
              </p>
              <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{isRTL ? 'البريد الإلكتروني' : 'Email'}</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-background border rounded px-2 py-1">{createdCredentials.email}</code>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { navigator.clipboard.writeText(createdCredentials.email); toast.success(isRTL ? 'تم نسخ البريد' : 'Email copied'); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{isRTL ? 'كلمة المرور' : 'Password'}</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-background border rounded px-2 py-1">{createdCredentials.password}</code>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => { navigator.clipboard.writeText(createdCredentials.password); toast.success(isRTL ? 'تم نسخ كلمة المرور' : 'Password copied'); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedCredentials(null)}>{isRTL ? 'حسناً، تم الحفظ' : 'Got it'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{isRTL ? 'إدارة المستخدمين' : 'User Management'}</h1>
          <p className="text-muted-foreground">{isRTL ? 'إدارة حسابات الموظفين والأدوار' : 'Manage staff accounts and roles'}</p>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={isRTL ? 'بحث...' : 'Search...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 rtl:pl-3 rtl:pr-10"
            data-testid="input-search-users"
          />
        </div>
        <Dialog open={isAddOpen} onOpenChange={v => { setIsAddOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-user">
              <Plus className="h-4 w-4" />
              {isRTL ? 'إضافة موظف' : 'Add Staff'}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isRTL ? 'إضافة موظف جديد' : 'Add New Staff'}</DialogTitle>
            </DialogHeader>
            {formFields}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleAdd} data-testid="button-save-user">{t('common.save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={!!editId} onOpenChange={open => { if (!open) { setEditId(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isRTL ? 'تعديل المستخدم' : 'Edit User'}</DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditId(null); resetForm(); }}>{t('common.cancel')}</Button>
            <Button onClick={handleEdit} data-testid="button-update-user">{isRTL ? 'تحديث' : 'Update'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{isRTL ? 'الاسم' : 'Name'}</TableHead>
                <TableHead>{isRTL ? 'البريد' : 'Email'}</TableHead>
                <TableHead>{isRTL ? 'الدور' : 'Role'}</TableHead>
                <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                <TableHead className="text-right rtl:text-left">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(staff => (
                <TableRow key={staff.id} data-testid={`row-user-${staff.id}`}>
                  <TableCell className="font-medium">{isRTL ? staff.nameAr : staff.name}</TableCell>
                  <TableCell className="text-muted-foreground">{staff.email}</TableCell>
                  <TableCell>{getRoleBadge(staff.role)}</TableCell>
                  <TableCell>
                    <Badge variant={staff.isActive ? 'default' : 'secondary'}>
                      {staff.isActive ? (isRTL ? 'نشط' : 'Active') : (isRTL ? 'غير نشط' : 'Inactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right rtl:text-left">
                    <div className="flex items-center justify-end rtl:justify-start gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => updateUser(staff.id, { isActive: !staff.isActive })}
                        data-testid={`button-toggle-user-${staff.id}`}
                      >
                        {staff.isActive
                          ? <ToggleRight className="h-4 w-4 text-chart-2" />
                          : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(staff)}
                        data-testid={`button-edit-user-${staff.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" data-testid={`button-delete-user-${staff.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{isRTL ? 'حذف المستخدم' : 'Delete User'}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {isRTL
                                ? `هل أنت متأكد من حذف "${staff.nameAr}"؟ لا يمكن التراجع عن هذا الإجراء.`
                                : `Are you sure you want to delete "${staff.name}"? This action cannot be undone.`}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{isRTL ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(staff.id)}>
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
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {isRTL ? 'لا يوجد مستخدمين' : 'No users found'}
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

export default StaffManagement;
