import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUsers } from '@/hooks/useUsers';
import { useSpecialties } from '@/hooks/useSpecialties';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Stethoscope, CheckCircle, XCircle, Calendar,
  Search, CalendarCheck, User, UserPlus, Link2, Clock,
  Send, Building2, Mail, AlertCircle, Info,
} from 'lucide-react';
import {
  addDoctorClinicLink, getDoctorsForClinic, doctorClinicStore,
} from '@/stores/doctorClinicStore';
import { getDoctorProfile } from '@/stores/doctorProfileStore';
import { getActiveSpecialtyIdsForClinic } from '@/stores/clinicSpecialtyStore';
import { userStore } from '@/stores/userStore';
import { User as UserType } from '@/types';

// ─── Join Request Store ───────────────────────────────────────────────────────
const JOIN_REQUESTS_KEY = 'cf_join_requests_v1';
interface JoinRequest { id: string; doctorId: string; clinicId: string; status: 'pending' | 'accepted' | 'rejected'; createdAt: string; }

function loadJoinRequests(): JoinRequest[] {
  try { return JSON.parse(localStorage.getItem(JOIN_REQUESTS_KEY) || '[]'); } catch { return []; }
}
function saveJoinRequests(reqs: JoinRequest[]) {
  localStorage.setItem(JOIN_REQUESTS_KEY, JSON.stringify(reqs));
}
function addJoinRequest(doctorId: string, clinicId: string): JoinRequest {
  const reqs = loadJoinRequests();
  const existing = reqs.find(r => r.doctorId === doctorId && r.clinicId === clinicId && r.status === 'pending');
  if (existing) return existing;
  const req: JoinRequest = { id: `jr-${Date.now()}`, doctorId, clinicId, status: 'pending', createdAt: new Date().toISOString() };
  saveJoinRequests([...reqs, req]);
  return req;
}
function acceptJoinRequest(requestId: string, doctorId: string, clinicId: string) {
  const reqs = loadJoinRequests().map(r => r.id === requestId ? { ...r, status: 'accepted' as const } : r);
  saveJoinRequests(reqs);
  addDoctorClinicLink(doctorId, clinicId);
}

// ─── Helper: read clinic doctors directly from stores ─────────────────────────
function getClinicDoctors(clinicId: string): UserType[] {
  const linkedIds = getDoctorsForClinic(clinicId);
  return linkedIds
    .map(id => userStore.get(u => u.id === id))
    .filter((u): u is NonNullable<typeof u> => !!u && u.role === 'doctor');
}

const Doctors: React.FC = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { addUser, updateUser } = useUsers();
  const { specialties } = useSpecialties();
  const permissions = usePermissions();
  const { user: authUser } = useAuth();

  const isAr = language === 'ar';
  const clinicId = authUser?.clinicId || '';

  // ── Local state that refreshes after link/create actions ──────────────────
  const [clinicDoctors, setClinicDoctors] = useState<UserType[]>(() => getClinicDoctors(clinicId));
  const [linkedDoctorIds, setLinkedDoctorIds] = useState<Set<string>>(() => new Set(getDoctorsForClinic(clinicId)));
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>(() =>
    loadJoinRequests().filter(r => r.clinicId === clinicId && r.status === 'pending')
  );

  const refreshClinic = useCallback(() => {
    const docs = getClinicDoctors(clinicId);
    setClinicDoctors(docs);
    setLinkedDoctorIds(new Set(getDoctorsForClinic(clinicId)));
    setPendingRequests(loadJoinRequests().filter(r => r.clinicId === clinicId && r.status === 'pending'));
  }, [clinicId]);

  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [activeTab, setActiveTab]     = useState<'link' | 'create'>('link');
  const [linkSubTab, setLinkSubTab]   = useState<'unlinked' | 'linked'>('unlinked');
  const [linkSearch, setLinkSearch]   = useState('');
  const [createLoading, setCreateLoading] = useState(false);

  const [newDoctor, setNewDoctor] = useState({
    name: '', nameAr: '', email: '', phone: '', specialtyId: '',
    bio: '', bioAr: '', dateOfBirth: '', gender: '' as 'male' | 'female' | '',
    yearsExperience: '', consultationFee: '',
    homeVisitEnabled: false, homeVisitPrice: '', homeVisitRadiusKm: '',
  });

  // ── Clinic active specialty IDs (per-clinic, not global) ─────────────────
  const [clinicActiveSpIds, setClinicActiveSpIds] = useState<string[]>(() =>
    getActiveSpecialtyIdsForClinic(clinicId)
  );
  const clinicSpecialtyIds = useMemo(() => new Set(clinicActiveSpIds), [clinicActiveSpIds]);
  // Refresh when dialog opens in case specialty config changed
  const refreshClinicSpecialties = useCallback(() => {
    setClinicActiveSpIds(getActiveSpecialtyIdsForClinic(clinicId));
  }, [clinicId]);

  const { users: allUsers } = useUsers();
  // ── All platform doctors (from useUsers hook, not filtered by clinic) ─
  const allPlatformDoctors = useMemo(() => {
    return allUsers.filter(u => u.role === 'doctor');
  }, [allUsers, dialogOpen]); // re-compute when dialog opens

  // ── Split: unlinked anywhere vs linked to other clinics ───────────────────
  // Filter by clinic's active specialties: only show doctors whose specialty
  // matches one the clinic offers (or has no specialty set)
  const notLinkedAnywhere = useMemo(() =>
    allPlatformDoctors.filter(d => {
      const links = doctorClinicStore.filter(l => l.doctorId === d.id && l.isActive);
      const matchesSpecialty = clinicSpecialtyIds.size === 0 || !d.specialtyId || clinicSpecialtyIds.has(d.specialtyId);
      return links.length === 0 && !linkedDoctorIds.has(d.id) && matchesSpecialty;
    }),
    [allPlatformDoctors, linkedDoctorIds, clinicSpecialtyIds]
  );

  const linkedToOtherClinics = useMemo(() =>
    allPlatformDoctors.filter(d => {
      const links = doctorClinicStore.filter(l => l.doctorId === d.id && l.isActive);
      const matchesSpecialty = clinicSpecialtyIds.size === 0 || !d.specialtyId || clinicSpecialtyIds.has(d.specialtyId);
      return links.length > 0 && !linkedDoctorIds.has(d.id) && matchesSpecialty;
    }),
    [allPlatformDoctors, linkedDoctorIds, clinicSpecialtyIds]
  );

  // ── Search helpers ────────────────────────────────────────────────────────
  const filterList = (list: UserType[]) => {
    if (!linkSearch.trim()) return list;
    const q = linkSearch.toLowerCase().trim();
    return list.filter(d => {
      const sp = specialties.find(s => s.id === d.specialtyId);
      return (
        d.name.toLowerCase().includes(q) ||
        d.nameAr.includes(linkSearch.trim()) ||
        ((d as any).phone || '').includes(q) ||
        d.id.toLowerCase().includes(q) ||
        sp?.name.toLowerCase().includes(q) ||
        sp?.nameAr.includes(linkSearch.trim())
      );
    });
  };

  const filteredDoctors = clinicDoctors.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const sp = specialties.find(s => s.id === d.specialtyId);
    return (
      d.name.toLowerCase().includes(q) ||
      d.nameAr.includes(searchQuery.trim()) ||
      sp?.name.toLowerCase().includes(q) ||
      sp?.nameAr.includes(searchQuery.trim())
    );
  });

  const getSpecialtyName = (id?: string) => {
    const sp = specialties.find(s => s.id === id);
    return isAr ? sp?.nameAr : sp?.name;
  };

  const isRequestPending = (doctorId: string) =>
    pendingRequests.some(r => r.doctorId === doctorId);

  // ── Actions ───────────────────────────────────────────────────────────────
  // All "link" actions now go through a join request — doctor must approve.
  // The only exception is handleCreateDoctor which links directly (admin created).
  const handleLinkDoctor = (doctorId: string) => {
    if (!clinicId) return;
    addJoinRequest(doctorId, clinicId);
    setPendingRequests(loadJoinRequests().filter(r => r.clinicId === clinicId && r.status === 'pending'));
    setDialogOpen(false);
    toast.success(isAr ? 'تم إرسال طلب الانضمام للطبيب' : 'Join request sent to doctor');
  };

  const handleSendRequest = (doctorId: string) => {
    if (!clinicId) return;
    addJoinRequest(doctorId, clinicId);
    setPendingRequests(loadJoinRequests().filter(r => r.clinicId === clinicId && r.status === 'pending'));
    toast.success(isAr ? 'تم إرسال طلب الانضمام' : 'Join request sent');
  };

  const handleAcceptAll = () => {
    pendingRequests.forEach(r => acceptJoinRequest(r.id, r.doctorId, clinicId));
    refreshClinic();
    toast.success(isAr ? 'تم قبول جميع الطلبات' : 'All requests accepted');
  };

  const handleToggleStatus = (id: string, isActive: boolean) => {
    updateUser(id, { isActive: !isActive });
    // Also update local clinicDoctors
    setClinicDoctors(prev => prev.map(d => d.id === id ? { ...d, isActive: !isActive } : d));
  };

  const handleCreateDoctor = async () => {
    if (!newDoctor.name.trim() || !newDoctor.specialtyId || !newDoctor.email.trim()) {
      toast.error(isAr ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    setCreateLoading(true);
    try {
      // Add directly to userStore (no API call needed in demo mode)
      const newId = `u-new-${Date.now()}`;
      const newUser: UserType = {
        id: newId,
        name: newDoctor.name.trim(),
        nameAr: newDoctor.nameAr.trim() || newDoctor.name.trim(),
        email: newDoctor.email.trim(),
        phone: newDoctor.phone.trim(),
        role: 'doctor',
        specialtyId: newDoctor.specialtyId,
        clinicId,
        isActive: true,
        createdAt: new Date().toISOString(),
        homeVisitEnabled: newDoctor.homeVisitEnabled,
        homeVisitPrice: newDoctor.homeVisitPrice ? Number(newDoctor.homeVisitPrice) : undefined,
        homeVisitRadiusKm: newDoctor.homeVisitRadiusKm ? Number(newDoctor.homeVisitRadiusKm) : undefined,
      };
      await addUser(newUser);
      // Link to clinic immediately
      addDoctorClinicLink(newId, clinicId);
      refreshClinic();
      toast.success(isAr ? 'تم إنشاء الطبيب وإضافته للعيادة' : 'Doctor created and added to clinic');
      setNewDoctor({ name: '', nameAr: '', email: '', phone: '', specialtyId: '', bio: '', bioAr: '', dateOfBirth: '', gender: '', yearsExperience: '', consultationFee: '', homeVisitEnabled: false, homeVisitPrice: '', homeVisitRadiusKm: '' });
      setDialogOpen(false);
    } catch {
      toast.error(isAr ? 'حدث خطأ أثناء الإنشاء' : 'Error creating doctor');
    }
    setCreateLoading(false);
  };

  const noActiveSpecialties = clinicSpecialtyIds.size === 0;
  const noPlatformDoctors   = allPlatformDoctors.length === 0;
  const activeDoctors   = clinicDoctors.filter(d => d.isActive);
  const inactiveDoctors = clinicDoctors.filter(d => !d.isActive);

  // ── Doctor row in link dialog ─────────────────────────────────────────────
  const DoctorLinkRow = ({ doc, showSendRequest }: { doc: UserType; showSendRequest?: boolean }) => {
    const pending  = isRequestPending(doc.id);
    const otherClinics = doctorClinicStore.filter(l => l.doctorId === doc.id && l.isActive).length;
    return (
      <div className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Stethoscope className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium truncate">{isAr ? doc.nameAr : doc.name}</p>
              {otherClinics > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1 py-0">
                  <Building2 className="h-2.5 w-2.5" />{otherClinics} {isAr ? 'عيادة' : 'clinic(s)'}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{getSpecialtyName(doc.specialtyId)}</p>
            {(doc as any).phone && <p className="text-xs text-muted-foreground">📞 {(doc as any).phone}</p>}
            <p className="text-[10px] text-muted-foreground/50">{isAr ? 'ID:' : 'ID:'} {doc.id}</p>
          </div>
        </div>
        <div className="shrink-0 ms-2">
          {pending ? (
            <Badge variant="secondary" className="text-xs gap-1">
              <Clock className="h-3 w-3" />{isAr ? 'في الانتظار' : 'Pending'}
            </Badge>
          ) : showSendRequest ? (
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => handleSendRequest(doc.id)}>
              <Send className="h-3 w-3" />{isAr ? 'طلب انضمام' : 'Send Request'}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => handleLinkDoctor(doc.id)}>
              <Send className="h-3 w-3" />{isAr ? 'طلب انضمام' : 'Send Request'}
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('doctors.title')}</h1>
          <p className="text-muted-foreground">{activeDoctors.length} {isAr ? 'طبيب نشط' : 'active doctors'}</p>
        </div>
        {permissions.canEditDoctor && (
          <Button onClick={() => setDialogOpen(true)} className="gap-2" data-testid="button-add-doctor">
            <UserPlus className="h-4 w-4" />
            {isAr ? 'إضافة طبيب' : 'Add Doctor'}
          </Button>
        )}
      </div>

      {/* Pending requests banner */}
      {pendingRequests.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {isAr ? `${pendingRequests.length} طلب انضمام في الانتظار` : `${pendingRequests.length} pending join request(s)`}
            </p>
          </div>
          <Button size="sm" variant="outline" className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10" onClick={handleAcceptAll}>
            {isAr ? 'محاكاة قبول الكل' : 'Simulate Accept All'}
          </Button>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Stethoscope, color: 'text-primary', bg: 'bg-primary/10', count: clinicDoctors.length, label: isAr ? 'إجمالي الأطباء' : 'Total Doctors' },
          { icon: CheckCircle,  color: 'text-chart-5', bg: 'bg-chart-5/10', count: activeDoctors.length,   label: t('doctors.active')   },
          { icon: XCircle,      color: 'text-destructive', bg: 'bg-destructive/10', count: inactiveDoctors.length, label: t('doctors.inactive') },
        ].map(({ icon: Icon, color, bg, count, label }) => (
          <Card key={label}><CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-lg ${bg} flex items-center justify-center`}><Icon className={`h-6 w-6 ${color}`} /></div>
              <div><p className="text-2xl font-bold">{count}</p><p className="text-sm text-muted-foreground">{label}</p></div>
            </div>
          </CardContent></Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={isAr ? 'بحث بالاسم أو التخصص...' : 'Search by name or specialty...'}
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 rtl:pl-3 rtl:pr-10" data-testid="input-search-doctors"
        />
      </div>

      {/* Doctors grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredDoctors.map(doctor => {
          const docProfile = getDoctorProfile(doctor.id);
          return (
          <Card key={doctor.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="h-14 w-14 rounded-full bg-chart-2/10 flex items-center justify-center overflow-hidden shrink-0">
                  {docProfile?.photoUrl
                    ? <img src={docProfile.photoUrl} alt={doctor.name} className="h-full w-full object-cover" />
                    : <Stethoscope className="h-7 w-7 text-chart-2" />
                  }
                </div>
                <Badge variant={doctor.isActive ? 'default' : 'secondary'}>
                  {doctor.isActive ? t('doctors.active') : t('doctors.inactive')}
                </Badge>
              </div>
              <h3 className="text-lg font-semibold mb-1 cursor-pointer hover:text-primary" onClick={() => navigate(`/schedule/${doctor.id}`)}>
                {isAr ? doctor.nameAr : doctor.name}
              </h3>
              <p className="text-sm text-muted-foreground mb-1">{getSpecialtyName(doctor.specialtyId)}</p>
              {doctor.email && <p className="text-xs text-muted-foreground mb-4 flex items-center gap-1"><Mail className="h-3 w-3" />{doctor.email}</p>}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate(`/appointments?doctor=${doctor.id}`)}>
                  <CalendarCheck className="h-4 w-4" />{isAr ? 'مواعيد اليوم' : "Today's Appts"}
                </Button>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate(`/schedule/${doctor.id}`)}>
                  <Calendar className="h-4 w-4" />{isAr ? 'الجدول' : 'Schedule'}
                </Button>
                {permissions.canEditDoctor && (
                  <Button variant="outline" size="sm" className="gap-1 col-span-2" onClick={() => handleToggleStatus(doctor.id, doctor.isActive)}>
                    {doctor.isActive ? <XCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    {doctor.isActive ? (isAr ? 'تعطيل' : 'Deactivate') : (isAr ? 'تفعيل' : 'Activate')}
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" className="w-full mt-2 gap-1 text-muted-foreground hover:text-primary" onClick={() => navigate(`/doctor/${doctor.id}`)}>
                <User className="h-4 w-4" />{isAr ? 'عرض الملف الشخصي' : 'View Public Profile'}
              </Button>
            </CardContent>
          </Card>
          );
        })}
        {filteredDoctors.length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            <Stethoscope className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{isAr ? 'لا يوجد أطباء' : 'No doctors found'}</p>
          </div>
        )}
      </div>

      {/* ── Add Doctor Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (open) { refreshClinic(); refreshClinicSpecialties(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isAr ? 'إضافة طبيب' : 'Add Doctor'}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'link' | 'create')}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="link" className="gap-2"><Link2 className="h-4 w-4" />{isAr ? 'ربط طبيب موجود' : 'Link Existing'}</TabsTrigger>
              <TabsTrigger value="create" className="gap-2"><UserPlus className="h-4 w-4" />{isAr ? 'إنشاء طبيب جديد' : 'Create New'}</TabsTrigger>
            </TabsList>

            {/* ── Link Tab ── */}
            <TabsContent value="link" className="mt-4 space-y-3">
              {noPlatformDoctors ? (
                <div className="text-center py-8 space-y-2">
                  <Info className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">{isAr ? 'لا يوجد أطباء مسجلون بعد، استخدم تبويب "إنشاء طبيب جديد"' : 'No doctors registered yet. Use the "Create New" tab.'}</p>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input className="pl-10 rtl:pl-3 rtl:pr-10"
                      placeholder={isAr ? 'بحث بالاسم أو الهاتف أو الرقم...' : 'Search by name, phone or ID...'}
                      value={linkSearch} onChange={e => setLinkSearch(e.target.value)} />
                  </div>

                  <Tabs value={linkSubTab} onValueChange={v => setLinkSubTab(v as 'unlinked' | 'linked')}>
                    <TabsList className="w-full">
                      <TabsTrigger value="unlinked" className="flex-1 gap-1.5">
                        <User className="h-3.5 w-3.5" />{isAr ? 'غير مرتبطون بعيادات' : 'Unlinked'}
                        <Badge variant="secondary" className="text-[10px]">{filterList(notLinkedAnywhere).length}</Badge>
                      </TabsTrigger>
                      <TabsTrigger value="linked" className="flex-1 gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />{isAr ? 'مرتبطون بعيادات أخرى' : 'Multi-Clinic'}
                        <Badge variant="secondary" className="text-[10px]">{filterList(linkedToOtherClinics).length}</Badge>
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="unlinked" className="mt-3">
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/15 mb-3">
                        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-primary/80">{isAr ? 'سيتم إرسال طلب انضمام للطبيب ويجب أن يقبله أولاً.' : 'A join request will be sent and must be accepted by the doctor first.'}</p>
                      </div>
                      {filterList(notLinkedAnywhere).length === 0 ? (
                        <p className="text-center text-muted-foreground text-sm py-6">{isAr ? 'لا يوجد أطباء غير مرتبطين بنفس التخصص' : 'No unlinked doctors with matching specialty'}</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {filterList(notLinkedAnywhere).map(doc => <DoctorLinkRow key={doc.id} doc={doc} showSendRequest={false} />)}
                        </div>
                      )}
                    </TabsContent>

                    <TabsContent value="linked" className="mt-3">
                      <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/15 mb-3">
                        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-primary/80">{isAr ? 'سيتم إرسال طلب انضمام للطبيب ويجب أن يقبله أولاً.' : 'A join request will be sent and must be accepted by the doctor.'}</p>
                      </div>
                      {filterList(linkedToOtherClinics).length === 0 ? (
                        <p className="text-center text-muted-foreground text-sm py-6">{isAr ? 'لا يوجد أطباء مرتبطون بعيادات أخرى بنفس التخصص' : 'No multi-clinic doctors with matching specialty'}</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                          {filterList(linkedToOtherClinics).map(doc => <DoctorLinkRow key={doc.id} doc={doc} showSendRequest={true} />)}
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </TabsContent>

            {/* ── Create Tab ── */}
            <TabsContent value="create" className="mt-4 space-y-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isAr ? 'المعلومات الأساسية' : 'Basic Information'}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? 'الاسم (إنجليزي) *' : 'Name (English) *'}</Label>
                  <Input placeholder="Dr. Ahmed Hassan" value={newDoctor.name} onChange={e => setNewDoctor(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'}</Label>
                  <Input placeholder="د. أحمد حسن" dir="rtl" value={newDoctor.nameAr} onChange={e => setNewDoctor(p => ({ ...p, nameAr: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'التخصص *' : 'Specialty *'}</Label>
                <Select value={newDoctor.specialtyId} onValueChange={v => setNewDoctor(p => ({ ...p, specialtyId: v }))}>
                  <SelectTrigger><SelectValue placeholder={isAr ? 'اختر التخصص' : 'Select specialty'} /></SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {specialties.filter(s => clinicSpecialtyIds.has(s.id)).map(sp => <SelectItem key={sp.id} value={sp.id}>{isAr ? sp.nameAr : sp.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? 'البريد الإلكتروني *' : 'Email *'}</Label>
                  <Input type="email" placeholder="doctor@clinic.com" value={newDoctor.email} onChange={e => setNewDoctor(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? 'رقم الهاتف' : 'Phone'}</Label>
                  <Input placeholder="01000000000" value={newDoctor.phone} onChange={e => setNewDoctor(p => ({ ...p, phone: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? 'تاريخ الميلاد' : 'Date of Birth'}</Label>
                  <Input type="date" value={newDoctor.dateOfBirth} onChange={e => setNewDoctor(p => ({ ...p, dateOfBirth: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? 'الجنس' : 'Gender'}</Label>
                  <Select value={newDoctor.gender} onValueChange={v => setNewDoctor(p => ({ ...p, gender: v as 'male' | 'female' }))}>
                    <SelectTrigger><SelectValue placeholder={isAr ? 'اختر' : 'Select'} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{isAr ? 'ذكر' : 'Male'}</SelectItem>
                      <SelectItem value="female">{isAr ? 'أنثى' : 'Female'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isAr ? 'المعلومات المهنية' : 'Professional Information'}</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{isAr ? 'سنوات الخبرة' : 'Years of Experience'}</Label>
                  <Input type="number" min="0" placeholder="10" value={newDoctor.yearsExperience} onChange={e => setNewDoctor(p => ({ ...p, yearsExperience: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{isAr ? 'رسوم الكشف (ج.م)' : 'Consultation Fee (EGP)'}</Label>
                  <Input type="number" min="0" placeholder="200" value={newDoctor.consultationFee} onChange={e => setNewDoctor(p => ({ ...p, consultationFee: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'نبذة مهنية (إنجليزي)' : 'Bio (English)'}</Label>
                <Textarea rows={2} placeholder="Brief professional bio..." value={newDoctor.bio} onChange={e => setNewDoctor(p => ({ ...p, bio: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{isAr ? 'نبذة مهنية (عربي)' : 'Bio (Arabic)'}</Label>
                <Textarea rows={2} dir="rtl" placeholder="نبذة مهنية..." value={newDoctor.bioAr} onChange={e => setNewDoctor(p => ({ ...p, bioAr: e.target.value }))} />
              </div>

              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isAr ? 'الزيارات المنزلية' : 'Home Visits'}</p>
                  <p className="text-xs text-muted-foreground">{isAr ? 'هل يقدم الطبيب زيارات منزلية؟' : 'Does the doctor offer home visits?'}</p>
                </div>
                <Switch checked={newDoctor.homeVisitEnabled} onCheckedChange={v => setNewDoctor(p => ({ ...p, homeVisitEnabled: v }))} />
              </div>
              {newDoctor.homeVisitEnabled && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{isAr ? 'سعر الزيارة (ج.م)' : 'Visit Price (EGP)'}</Label>
                    <Input type="number" min="0" placeholder="400" value={newDoctor.homeVisitPrice} onChange={e => setNewDoctor(p => ({ ...p, homeVisitPrice: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{isAr ? 'نطاق التغطية (كم)' : 'Coverage Radius (km)'}</Label>
                    <Input type="number" min="1" placeholder="20" value={newDoctor.homeVisitRadiusKm} onChange={e => setNewDoctor(p => ({ ...p, homeVisitRadiusKm: e.target.value }))} />
                  </div>
                </div>
              )}

              <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                <p>• {isAr ? 'كلمة المرور الافتراضية: doctor123' : 'Default password: doctor123'}</p>
                <p>• {isAr ? 'يُضاف للعيادة فوراً بدون الحاجة لموافقة' : 'Added to clinic immediately without approval'}</p>
              </div>

              <Button className="w-full" onClick={handleCreateDoctor}
                disabled={!newDoctor.name.trim() || !newDoctor.specialtyId || !newDoctor.email.trim() || createLoading}>
                {createLoading ? (isAr ? 'جاري الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء الطبيب وإضافته للعيادة' : 'Create Doctor & Add to Clinic')}
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Doctors;
