import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { clinicStore, PLAN_LABELS, persistClinic } from '@/stores/clinicStore';
import { userStore, persistUser } from '@/stores/userStore';
import { patientStore } from '@/stores/patientStore';
import { visitStore, appointmentStore } from '@/stores/visitStore';
import { aiConfigStore, AIConfig } from '@/stores/aiConfigStore';
import { getToken } from '@/utils/authToken';
import { registrationStore, approveRegistration, rejectRegistration } from '@/stores/registrationStore';
import { addDoctorClinicLink } from '@/stores/doctorClinicStore';
import { specialtyStore } from '@/stores/specialtyStore';
import { Clinic, SubscriptionPlan, RegistrationEntry, UserRole } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Building2, Users, Calendar, TrendingUp, Plus, Edit2, ToggleLeft, LogOut,
  MapPin, Phone, Stethoscope, Activity, CheckCircle, AlertCircle, Globe,
  Bot, Key, Sliders, Save, RotateCcw, ShieldCheck, ClipboardList,
  Check, X, Clock, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import logoImg from '@assets/Untitled_design_1772868317886.png';

const PLAN_CONFIG: Record<SubscriptionPlan, { maxDoctors: number; aiEnabled: boolean; advancedReports: boolean }> = {
  basic: { maxDoctors: 5,  aiEnabled: false, advancedReports: false },
  pro:   { maxDoctors: 10, aiEnabled: false, advancedReports: true  },
  ai:    { maxDoctors: 20, aiEnabled: true,  advancedReports: true  },
};

const emptyForm = {
  name: '', nameAr: '', address: '', addressAr: '',
  phone: '', city: '', cityAr: '', subscriptionPlan: 'pro' as SubscriptionPlan,
};

// ── Helper: save new staff password to localStorage ───────────────────────────
function saveStaffPassword(userId: string, password: string) {
  try {
    const all: Record<string, string> = JSON.parse(localStorage.getItem('cf_staff_passwords') || '{}');
    all[userId] = password;
    localStorage.setItem('cf_staff_passwords', JSON.stringify(all));
  } catch { /* graceful */ }
}

// ── Helper: provision user in Supabase when available (fire-and-forget) ───────
// If Supabase is offline the server returns { ok: false } and local login is
// used instead (see loginStaffLocal in AuthContext.tsx).
function provisionUserInSupabase(payload: {
  email: string; password: string; name: string; nameAr: string;
  role: string; clinicId?: string; specialtyId?: string;
}) {
  const SA_PASS = 'Mon_oskar11';
  fetch('/api/superadmin/provision-user', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ superAdminPassword: SA_PASS, ...payload }),
  }).catch(() => {});
}

const SuperAdmin: React.FC = () => {
  const { logout } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const navigate = useNavigate();
  const isAr = language === 'ar';

  // ── Clinic management state ───────────────────────────────────────────────
  const [clinics, setClinics]           = useState<Clinic[]>(clinicStore.getAll());
  const [showDialog, setShowDialog]     = useState(false);
  const [editingClinic, setEditingClinic] = useState<Clinic | null>(null);
  const [form, setForm]                 = useState(emptyForm);

  // ── AI config state ───────────────────────────────────────────────────────
  const [aiConfig, setAiConfig] = useState<AIConfig>(aiConfigStore.get());
  const setAI = <K extends keyof AIConfig>(key: K, value: AIConfig[K]) =>
    setAiConfig(prev => ({ ...prev, [key]: value }));

  // Load AI config from server on mount
  useEffect(() => {
    const token = getToken();
    fetch('/api/ai-config', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const merged = { ...aiConfigStore.get(), ...data };
          aiConfigStore.update(merged);
          setAiConfig(aiConfigStore.get());
        }
      })
      .catch(() => {});
  }, []);

  // ── Registration approval state ───────────────────────────────────────────
  // Read directly from localStorage — bypasses in-memory store staleness
  const readRegsFromStorage = (): RegistrationEntry[] => {
    try {
      const stored: RegistrationEntry[] = JSON.parse(localStorage.getItem('cf_registrations') || '[]');
      // Also merge in-memory items not yet persisted
      const inMem = registrationStore.getAll();
      const merged = [...stored];
      inMem.forEach(r => { if (!merged.some(s => s.id === r.id)) merged.push(r as any); });
      return merged;
    } catch { return registrationStore.getAll(); }
  };
  const [regs, setRegs] = useState<RegistrationEntry[]>(readRegsFromStorage);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog]   = useState(false);
  const [selectedReg, setSelectedReg]             = useState<RegistrationEntry | null>(null);
  const [assignClinicId, setAssignClinicId]       = useState('');
  // Default: independent — clinic is optional and added later
  const [doctorType, setDoctorType]               = useState<'independent' | 'clinic'>('independent');
  const [assignRole, setAssignRole]               = useState<UserRole>('doctor');
  const [rejectReason, setRejectReason]           = useState('');

  const refreshRegs = () => setRegs(readRegsFromStorage());
  const refreshClinic = () => setClinics([...clinicStore.getAll()]);

  // ── Auto-refresh: poll localStorage every 2s + storage event ──
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === 'cf_registrations') refreshRegs(); };
    window.addEventListener('storage', onStorage);
    const unsub = registrationStore.subscribe(() => refreshRegs());
    const poll = setInterval(() => refreshRegs(), 2000);
    return () => { window.removeEventListener('storage', onStorage); unsub(); clearInterval(poll); };
  }, []);

  const pendingRegs  = regs.filter(r => r.status === 'pending'  && r.type !== 'patient');
  const rejectedRegs = regs.filter(r => r.status === 'rejected' && r.type !== 'patient');

  const specialties  = specialtyStore.filter(s => s.isActive);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const allUsers        = userStore.getAll();
  const allPatients     = patientStore.getAll();
  const allAppointments = appointmentStore.getAll();
  const today           = new Date().toISOString().split('T')[0];

  const stats = {
    totalClinics:      clinics.length,
    activeClinics:     clinics.filter(c => c.isActive).length,
    totalPatients:     allPatients.length,
    todayAppointments: allAppointments.filter(a => a.date === today).length,
  };

  const getClinicStats = (clinicId: string) => ({
    doctors:      allUsers.filter(u => u.clinicId === clinicId && u.role === 'doctor').length,
    patients:     allPatients.filter(p => p.clinicId === clinicId).length,
    appointments: allAppointments.filter(a => a.clinicId === clinicId).length,
  });

  // ── AI handlers ───────────────────────────────────────────────────────────
  const handleSaveAI = async () => {
    aiConfigStore.update(aiConfig);
    try {
      const token = getToken();
      await fetch('/api/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(aiConfig),
      });
    } catch { /* server may be offline; local store updated */ }
    toast.success(isAr ? 'تم حفظ إعدادات الذكاء الاصطناعي على السيرفر' : 'AI settings saved to server');
  };
  const handleResetAI = () => { aiConfigStore.reset(); setAiConfig(aiConfigStore.get()); toast.success(isAr ? 'تمت إعادة الضبط' : 'Reset to defaults'); };

  // ── Clinic CRUD ───────────────────────────────────────────────────────────
  const openCreate = () => { setEditingClinic(null); setForm(emptyForm); setShowDialog(true); };
  const openEdit   = (clinic: Clinic) => {
    setEditingClinic(clinic);
    setForm({ name: clinic.name, nameAr: clinic.nameAr, address: clinic.address, addressAr: clinic.addressAr, phone: clinic.phone, city: clinic.city, cityAr: clinic.cityAr, subscriptionPlan: clinic.subscriptionPlan });
    setShowDialog(true);
  };

  const handleSave = () => {
    if (!form.name || !form.city || !form.phone) { toast.error(isAr ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields'); return; }
    const planCfg = PLAN_CONFIG[form.subscriptionPlan];
    if (editingClinic) {
      clinicStore.update(c => c.id === editingClinic.id, { ...form, ...planCfg });
      toast.success(isAr ? 'تم تحديث العيادة' : 'Clinic updated');
    } else {
      const newClinic: Clinic = { id: `clinic-${Date.now()}`, ...form, ...planCfg, isActive: true, createdAt: new Date().toISOString() };
      clinicStore.add(newClinic);
      persistClinic(newClinic);
      toast.success(isAr ? 'تم إنشاء العيادة' : 'Clinic created');
    }
    refreshClinic();
    setShowDialog(false);
  };

  const handleToggleActive = (clinic: Clinic) => {
    clinicStore.update(c => c.id === clinic.id, { isActive: !clinic.isActive });
    toast.success(clinic.isActive ? (isAr ? 'تم تعليق العيادة' : 'Clinic suspended') : (isAr ? 'تم تفعيل العيادة' : 'Clinic activated'));
    refreshClinic();
  };

  // ── Registration approval ─────────────────────────────────────────────────

  const openApprove = (reg: RegistrationEntry) => {
    setSelectedReg(reg);
    setAssignClinicId('');
    setAssignRole(reg.type === 'doctor' ? 'doctor' : 'admin');
    setDoctorType('independent'); // Always start as independent
    setShowApproveDialog(true);
  };

  const openReject = (reg: RegistrationEntry) => {
    setSelectedReg(reg);
    setRejectReason('');
    setShowRejectDialog(true);
  };

  /** Approve a CLINIC registration → create Clinic + admin User */
  const handleApproveClinic = (reg: RegistrationEntry) => {
    const clinicId = `clinic-${Date.now()}`;
    const newClinic: Clinic = {
      id: clinicId,
      name: reg.clinicName || reg.name,
      nameAr: reg.clinicName || reg.name,
      address: reg.address || '',
      addressAr: reg.address || '',
      phone: reg.phone,
      city: reg.city || '',
      cityAr: reg.city || '',
      subscriptionPlan: 'basic',
      isActive: true,
      maxDoctors: 5,
      aiEnabled: false,
      advancedReports: false,
      createdAt: new Date().toISOString(),
    };
    clinicStore.add(newClinic);
    persistClinic(newClinic);

    const userId = `u-${Date.now()}`;
    const newUser = {
      id: userId,
      name: reg.adminName || reg.name,
      nameAr: reg.adminName || reg.name,
      email: reg.email,
      role: 'admin' as UserRole,
      clinicId,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    userStore.add(newUser);
    persistUser(newUser);
    if (reg.password) saveStaffPassword(userId, reg.password);

    // Provision in Supabase too so normal (Supabase) login works
    if (reg.password) provisionUserInSupabase({
      email: reg.email, password: reg.password,
      name: newUser.name, nameAr: newUser.nameAr || newUser.name,
      role: 'admin', clinicId,
    });

    approveRegistration(reg.id, { userId, linkedClinicId: clinicId });
    refreshRegs();
    refreshClinic();
    setShowApproveDialog(false);
    toast.success(isAr
      ? `تم تفعيل عيادة "${newClinic.name}" وإنشاء حساب المدير`
      : `Clinic "${newClinic.name}" activated and admin account created`
    );
  };

  /** Approve a DOCTOR registration
   *  - independent (default): showcase profile, no clinic needed
   *  - clinic: must select a clinic to link
   */
  const handleApproveDoctor = (reg: RegistrationEntry) => {
    if (doctorType === 'clinic' && !assignClinicId) {
      toast.error(isAr ? 'اختر عيادة للربط أولاً' : 'Please select a clinic to link');
      return;
    }
    const userId = `u-${Date.now()}`;
    const newUser = {
      id: userId,
      name: reg.name,
      nameAr: reg.name,
      email: reg.email,
      role: 'doctor' as UserRole,
      specialtyId: reg.specialtyId,
      clinicId: doctorType === 'clinic' ? assignClinicId : '',
      isActive: true,
      homeVisitEnabled: false, // doctor configures this themselves later
      createdAt: new Date().toISOString(),
    };
    userStore.add(newUser);
    persistUser(newUser);
    if (reg.password) saveStaffPassword(userId, reg.password);
    if (doctorType === 'clinic' && assignClinicId) {
      addDoctorClinicLink(userId, assignClinicId);
    }

    // Provision in Supabase too so normal (Supabase) login works
    if (reg.password) provisionUserInSupabase({
      email: reg.email, password: reg.password,
      name: newUser.name, nameAr: newUser.nameAr || newUser.name,
      role: 'doctor',
      clinicId: doctorType === 'clinic' ? assignClinicId : undefined,
      specialtyId: reg.specialtyId,
    });

    approveRegistration(reg.id, { userId });
    refreshRegs();
    setShowApproveDialog(false);
    if (doctorType === 'independent') {
      toast.success(isAr
        ? `✅ تم قبول د. ${reg.name} — صفحة دعائية جاهزة (بدون حجز)`
        : `✅ Dr. ${reg.name} approved — showcase profile (no booking yet)`
      );
    } else {
      const clinicName = clinicStore.get(c => c.id === assignClinicId);
      toast.success(isAr
        ? `✅ تم قبول د. ${reg.name} وربطه بـ ${clinicName?.nameAr || clinicName?.name}`
        : `✅ Dr. ${reg.name} approved and linked to ${clinicName?.name}`
      );
    }
  };

  const handleConfirmApprove = () => {
    if (!selectedReg) return;
    if (selectedReg.type === 'clinic')      handleApproveClinic(selectedReg);
    else if (selectedReg.type === 'doctor') handleApproveDoctor(selectedReg);
  };

  const handleConfirmReject = () => {
    if (!selectedReg) return;
    rejectRegistration(selectedReg.id, rejectReason || undefined);
    refreshRegs();
    setShowRejectDialog(false);
    toast.success(isAr ? 'تم رفض الطلب' : 'Registration rejected');
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  const statCards = [
    { label: isAr ? 'إجمالي العيادات'   : 'Total Clinics',        value: stats.totalClinics,      icon: Building2,   color: 'text-primary',  bg: 'bg-primary/10'  },
    { label: isAr ? 'العيادات النشطة'   : 'Active Clinics',        value: stats.activeClinics,     icon: CheckCircle, color: 'text-chart-2',  bg: 'bg-chart-2/10'  },
    { label: isAr ? 'إجمالي المرضى'     : 'Total Patients',        value: stats.totalPatients,     icon: Users,       color: 'text-chart-1',  bg: 'bg-chart-1/10'  },
    { label: isAr ? 'مواعيد اليوم'      : "Today's Appointments",  value: stats.todayAppointments, icon: Calendar,    color: 'text-chart-4',  bg: 'bg-chart-4/10'  },
  ];

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ── Header ── */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="ClinicFlow" className="h-9 w-9 rounded-lg object-cover" />
            <div>
              <h1 className="font-bold text-foreground">ClinicFlow</h1>
              <p className="text-xs text-muted-foreground">{isAr ? 'لوحة المدير العام' : 'Super Admin Panel'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-primary border-primary hidden sm:flex items-center gap-1">
              <Globe className="h-3 w-3" />
              {isAr ? 'SaaS منصة' : 'SaaS Platform'}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}>
              {language === 'en' ? 'العربية' : 'English'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">

        {/* ── Stats cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`h-11 w-11 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{value}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Main tabs ── */}
        <Tabs defaultValue="clinics">
          <TabsList className="mb-4">
            <TabsTrigger value="clinics" className="gap-2">
              <Building2 className="h-4 w-4" />
              {isAr ? 'العيادات' : 'Clinics'}
            </TabsTrigger>
            <TabsTrigger value="registrations" className="gap-2 relative">
              <ClipboardList className="h-4 w-4" />
              {isAr ? 'طلبات التسجيل' : 'Registrations'}
              {pendingRegs.length > 0 && (
                <span className="absolute -top-1 -end-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                  {pendingRegs.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Bot className="h-4 w-4" />
              {isAr ? 'الذكاء الاصطناعي' : 'AI Config'}
            </TabsTrigger>
          </TabsList>

          {/* ════════════════ TAB: CLINICS ════════════════ */}
          <TabsContent value="clinics" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      {isAr ? 'إدارة العيادات' : 'Clinic Management'}
                    </CardTitle>
                    <CardDescription>
                      {isAr ? `${stats.totalClinics} عيادة مسجلة` : `${stats.totalClinics} clinics registered`}
                    </CardDescription>
                  </div>
                  <Button onClick={openCreate} data-testid="button-create-clinic">
                    <Plus className="h-4 w-4 me-2" />
                    {isAr ? 'إضافة عيادة' : 'Add Clinic'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isAr ? 'العيادة' : 'Clinic'}</TableHead>
                        <TableHead className="hidden md:table-cell">{isAr ? 'الموقع' : 'Location'}</TableHead>
                        <TableHead>{isAr ? 'الخطة' : 'Plan'}</TableHead>
                        <TableHead className="hidden sm:table-cell">{isAr ? 'الإحصائيات' : 'Stats'}</TableHead>
                        <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                        <TableHead className="text-end">{isAr ? 'الإجراءات' : 'Actions'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {clinics.map(clinic => {
                        const cs   = getClinicStats(clinic.id);
                        const plan = PLAN_LABELS[clinic.subscriptionPlan];
                        return (
                          <TableRow key={clinic.id} data-testid={`row-clinic-${clinic.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <Building2 className="h-4 w-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-medium text-foreground">{isAr ? clinic.nameAr : clinic.name}</p>
                                  <p className="text-xs text-muted-foreground">{clinic.phone}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {isAr ? clinic.cityAr : clinic.city}
                              </div>
                            </TableCell>
                            <TableCell><Badge className={`text-xs ${plan.color}`}>{plan[language as 'en' | 'ar']}</Badge></TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{cs.doctors}</span>
                                <span className="flex items-center gap-1"><Users className="h-3 w-3" />{cs.patients}</span>
                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{cs.appointments}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {clinic.isActive
                                ? <Badge variant="outline" className="text-chart-2 border-chart-2 text-xs"><CheckCircle className="h-3 w-3 me-1" />{isAr ? 'نشطة' : 'Active'}</Badge>
                                : <Badge variant="outline" className="text-destructive border-destructive text-xs"><AlertCircle className="h-3 w-3 me-1" />{isAr ? 'معلقة' : 'Suspended'}</Badge>}
                            </TableCell>
                            <TableCell className="text-end">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openEdit(clinic)} data-testid={`button-edit-clinic-${clinic.id}`}><Edit2 className="h-4 w-4" /></Button>
                                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(clinic)} className={clinic.isActive ? 'text-destructive hover:text-destructive' : 'text-chart-2 hover:text-chart-2'} data-testid={`button-toggle-clinic-${clinic.id}`}><ToggleLeft className="h-4 w-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Plan comparison */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-chart-4" />
                  {isAr ? 'مقارنة خطط الاشتراك' : 'Subscription Plan Comparison'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  {(['basic', 'pro', 'ai'] as SubscriptionPlan[]).map(plan => {
                    const cfg = PLAN_CONFIG[plan];
                    const lbl = PLAN_LABELS[plan];
                    return (
                      <div key={plan} className={`rounded-lg border p-4 space-y-3 ${plan === 'ai' ? 'border-primary/50 bg-primary/5' : ''}`}>
                        <div className="flex items-center justify-between">
                          <Badge className={`text-xs ${lbl.color}`}>{lbl[language as 'en' | 'ar']}</Badge>
                          {plan === 'ai' && <Badge className="text-xs bg-chart-4/10 text-chart-4">{isAr ? 'الأفضل' : 'Best'}</Badge>}
                        </div>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-center gap-2 text-muted-foreground"><Stethoscope className="h-3.5 w-3.5 shrink-0" />{isAr ? `حتى ${cfg.maxDoctors} أطباء` : `Up to ${cfg.maxDoctors} doctors`}</li>
                          <li className={`flex items-center gap-2 ${cfg.aiEnabled ? 'text-foreground' : 'text-muted-foreground line-through'}`}><TrendingUp className="h-3.5 w-3.5 shrink-0" />{isAr ? 'حجز الذكاء الاصطناعي' : 'AI Booking Assistant'}</li>
                          <li className={`flex items-center gap-2 ${cfg.advancedReports ? 'text-foreground' : 'text-muted-foreground line-through'}`}><Activity className="h-3.5 w-3.5 shrink-0" />{isAr ? 'تقارير متقدمة' : 'Advanced Reports'}</li>
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════════════════ TAB: REGISTRATIONS ════════════════ */}
          <TabsContent value="registrations" className="space-y-4">

            {/* Pending */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500" />
                  {isAr ? 'طلبات بانتظار الموافقة' : 'Pending Approvals'}
                  {pendingRegs.length > 0 && (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 ms-1">{pendingRegs.length}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {isAr ? 'طلبات تسجيل الأطباء والعيادات التي تحتاج مراجعة' : 'Doctor and clinic registration requests awaiting review'}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {pendingRegs.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <CheckCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">{isAr ? 'لا توجد طلبات معلّقة' : 'No pending requests'}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isAr ? 'النوع' : 'Type'}</TableHead>
                          <TableHead>{isAr ? 'الاسم' : 'Name'}</TableHead>
                          <TableHead className="hidden md:table-cell">{isAr ? 'البريد الإلكتروني' : 'Email'}</TableHead>
                          <TableHead className="hidden sm:table-cell">{isAr ? 'الهاتف' : 'Phone'}</TableHead>
                          <TableHead className="hidden lg:table-cell">{isAr ? 'التفاصيل' : 'Details'}</TableHead>
                          <TableHead className="hidden md:table-cell">{isAr ? 'تاريخ الطلب' : 'Date'}</TableHead>
                          <TableHead className="text-end">{isAr ? 'الإجراءات' : 'Actions'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingRegs.map(reg => (
                          <TableRow key={reg.id} data-testid={`row-reg-${reg.id}`}>
                            <TableCell>
                              {reg.type === 'doctor'
                                ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs gap-1"><Stethoscope className="h-3 w-3" />{isAr ? 'طبيب' : 'Doctor'}</Badge>
                                : <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300 text-xs gap-1"><Building2 className="h-3 w-3" />{isAr ? 'عيادة' : 'Clinic'}</Badge>}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{reg.name}</p>
                                {reg.type === 'clinic' && reg.clinicName && reg.clinicName !== reg.name && (
                                  <p className="text-xs text-muted-foreground">{reg.clinicName}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{reg.email}</TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{reg.phone}</TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                              {reg.type === 'doctor' && reg.specialtyId && (
                                <span>{specialties.find(s => s.id === reg.specialtyId)?.[isAr ? 'nameAr' : 'name'] || reg.specialtyId}</span>
                              )}
                              {reg.type === 'clinic' && reg.city && (
                                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{reg.city}</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                              {new Date(reg.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </TableCell>
                            <TableCell className="text-end">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  className="bg-chart-2 hover:bg-chart-2/90 text-white gap-1 text-xs h-7"
                                  onClick={() => openApprove(reg)}
                                  data-testid={`button-approve-${reg.id}`}
                                >
                                  <Check className="h-3 w-3" />
                                  {isAr ? 'موافقة' : 'Approve'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-destructive border-destructive/50 hover:bg-destructive/10 gap-1 text-xs h-7"
                                  onClick={() => openReject(reg)}
                                  data-testid={`button-reject-${reg.id}`}
                                >
                                  <X className="h-3 w-3" />
                                  {isAr ? 'رفض' : 'Reject'}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rejected */}
            {rejectedRegs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <X className="h-5 w-5" />
                    {isAr ? 'الطلبات المرفوضة' : 'Rejected Requests'}
                    <Badge variant="destructive" className="ms-1">{rejectedRegs.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{isAr ? 'النوع' : 'Type'}</TableHead>
                          <TableHead>{isAr ? 'الاسم' : 'Name'}</TableHead>
                          <TableHead className="hidden md:table-cell">{isAr ? 'البريد الإلكتروني' : 'Email'}</TableHead>
                          <TableHead>{isAr ? 'سبب الرفض' : 'Rejection Reason'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rejectedRegs.map(reg => (
                          <TableRow key={reg.id} className="opacity-60">
                            <TableCell>
                              {reg.type === 'doctor'
                                ? <Badge variant="outline" className="text-xs">{isAr ? 'طبيب' : 'Doctor'}</Badge>
                                : <Badge variant="outline" className="text-xs">{isAr ? 'عيادة' : 'Clinic'}</Badge>}
                            </TableCell>
                            <TableCell className="text-sm">{reg.name}</TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{reg.email}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{reg.rejectionReason || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ════════════════ TAB: AI CONFIG ════════════════ */}
          <TabsContent value="ai">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="h-5 w-5 text-primary" />
                      {isAr ? 'إعدادات الذكاء الاصطناعي' : 'AI Configuration'}
                    </CardTitle>
                    <CardDescription>
                      {isAr ? 'إعدادات مركزية لمساعد الحجز الذكي — لا تظهر للعيادات' : 'Central AI booking assistant settings — not visible to clinics'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleResetAI} data-testid="button-reset-ai"><RotateCcw className="h-4 w-4 me-1.5" />{isAr ? 'إعادة ضبط' : 'Reset'}</Button>
                    <Button size="sm" onClick={handleSaveAI} data-testid="button-save-ai"><Save className="h-4 w-4 me-1.5" />{isAr ? 'حفظ الإعدادات' : 'Save Settings'}</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{isAr ? 'تفعيل الذكاء الاصطناعي عالمياً' : 'Enable AI Globally'}</p>
                      <p className="text-xs text-muted-foreground">{isAr ? 'إيقاف هذا الخيار يعطل الذكاء في جميع العيادات' : 'Turning this off disables AI across all clinics'}</p>
                    </div>
                    <Switch checked={aiConfig.globallyEnabled} onCheckedChange={v => setAI('globallyEnabled', v)} data-testid="switch-ai-global" />
                  </div>
                  <div className="flex items-center gap-3 rounded-lg border p-4">
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${aiConfig.apiKeyStatus === 'configured' ? 'bg-chart-2/10' : 'bg-destructive/10'}`}>
                      {aiConfig.apiKeyStatus === 'configured' ? <ShieldCheck className="h-4 w-4 text-chart-2" /> : <Key className="h-4 w-4 text-destructive" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">OpenAI API Key</p>
                      <p className={`text-xs font-medium ${aiConfig.apiKeyStatus === 'configured' ? 'text-chart-2' : 'text-destructive'}`}>
                        {aiConfig.apiKeyStatus === 'configured' ? (isAr ? 'مُضبوط من بيئة الخادم' : 'Configured via server environment') : (isAr ? 'غير مضبوط' : 'Missing — add OPENAI_API_KEY to env')}
                      </p>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Sliders className="h-4 w-4 text-muted-foreground" />{isAr ? 'إعدادات النموذج' : 'Model Parameters'}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{isAr ? 'النموذج' : 'Model'}</Label>
                      <Select value={aiConfig.model} onValueChange={v => setAI('model', v)}>
                        <SelectTrigger data-testid="select-ai-model"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          <SelectItem value="gpt-4o-mini">gpt-4o-mini — {isAr ? 'سريع واقتصادي' : 'Fast & economical'}</SelectItem>
                          <SelectItem value="gpt-4o">gpt-4o — {isAr ? 'أعلى دقة' : 'Highest accuracy'}</SelectItem>
                          <SelectItem value="gpt-3.5-turbo">gpt-3.5-turbo — {isAr ? 'الأرخص' : 'Most affordable'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{isAr ? 'الحد الأقصى للرموز' : 'Max Tokens'}</Label>
                      <Input type="number" min={100} max={4000} value={aiConfig.maxTokens} onChange={e => setAI('maxTokens', Number(e.target.value))} data-testid="input-max-tokens" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>{isAr ? 'درجة الإبداع (Temperature)' : 'Temperature (Creativity)'}</Label>
                      <span className="text-sm font-mono text-muted-foreground">{aiConfig.temperature.toFixed(1)}</span>
                    </div>
                    <Slider min={0} max={1} step={0.1} value={[aiConfig.temperature]} onValueChange={([v]) => setAI('temperature', v)} data-testid="slider-temperature" className="w-full" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{isAr ? 'دقيق ومحدد' : 'Precise'}</span>
                      <span>{isAr ? 'إبداعي' : 'Creative'}</span>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2"><Bot className="h-4 w-4 text-muted-foreground" />{isAr ? 'الرسائل التوجيهية للنموذج' : 'System Prompts'}</h3>
                  <div className="space-y-2">
                    <Label>{isAr ? 'رسالة النظام — إنجليزي' : 'System Prompt — English'}</Label>
                    <Textarea rows={3} value={aiConfig.systemPromptEn} onChange={e => setAI('systemPromptEn', e.target.value)} placeholder="You are a smart medical booking assistant..." data-testid="textarea-prompt-en" className="resize-none font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>{isAr ? 'رسالة النظام — عربي' : 'System Prompt — Arabic'}</Label>
                    <Textarea rows={3} dir="rtl" value={aiConfig.systemPromptAr} onChange={e => setAI('systemPromptAr', e.target.value)} placeholder="أنت مساعد حجز طبي ذكي..." data-testid="textarea-prompt-ar" className="resize-none font-mono text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label>{isAr ? 'تعليمات الحجز' : 'Booking Instructions'}</Label>
                    <Textarea rows={2} value={aiConfig.bookingInstructions} onChange={e => setAI('bookingInstructions', e.target.value)} placeholder="Always confirm patient name, preferred date..." data-testid="textarea-booking-instructions" className="resize-none text-sm" />
                    <p className="text-xs text-muted-foreground">{isAr ? 'إرشادات إضافية تُضاف تلقائياً لكل محادثة حجز' : 'Additional instructions appended automatically to every booking conversation'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* ════════ Clinic Create/Edit Dialog ════════ */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClinic ? (isAr ? 'تعديل العيادة' : 'Edit Clinic') : (isAr ? 'إضافة عيادة جديدة' : 'Add New Clinic')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 overflow-y-auto max-h-[60vh]">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{isAr ? 'الاسم (إنجليزي) *' : 'Name (English) *'}</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Clinic Name" /></div>
              <div className="space-y-2"><Label>{isAr ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</Label><Input value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="اسم العيادة" dir="rtl" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{isAr ? 'المدينة (إنجليزي) *' : 'City (English) *'}</Label><Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Cairo" /></div>
              <div className="space-y-2"><Label>{isAr ? 'المدينة (عربي)' : 'City (Arabic)'}</Label><Input value={form.cityAr} onChange={e => setForm(f => ({ ...f, cityAr: e.target.value }))} placeholder="القاهرة" dir="rtl" /></div>
            </div>
            <div className="space-y-2"><Label>{isAr ? 'العنوان' : 'Address'}</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="15 Main Street, Cairo" /></div>
            <div className="space-y-2"><Label>{isAr ? 'رقم الهاتف *' : 'Phone *'}</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+20 2 1234 5678" /></div>
            <div className="space-y-2">
              <Label>{isAr ? 'خطة الاشتراك' : 'Subscription Plan'}</Label>
              <Select value={form.subscriptionPlan} onValueChange={v => setForm(f => ({ ...f, subscriptionPlan: v as SubscriptionPlan }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="basic">{isAr ? 'أساسي — حتى 5 أطباء' : 'Basic — Up to 5 doctors'}</SelectItem>
                  <SelectItem value="pro">{isAr ? 'احترافي — حتى 10 أطباء + تقارير' : 'Pro — Up to 10 doctors + Reports'}</SelectItem>
                  <SelectItem value="ai">{isAr ? 'ذكاء اصطناعي — حتى 20 طبيب + AI' : 'AI — Up to 20 doctors + AI Booking'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave}>{editingClinic ? (isAr ? 'حفظ التعديلات' : 'Save Changes') : (isAr ? 'إنشاء العيادة' : 'Create Clinic')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ Approval Dialog ════════ */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-chart-2" />
              {isAr ? 'تأكيد الموافقة' : 'Confirm Approval'}
            </DialogTitle>
          </DialogHeader>
          {selectedReg && (
            <div className="space-y-4 py-2 overflow-y-auto max-h-[60vh]">
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <p className="font-semibold text-foreground">{selectedReg.name}</p>
                <p className="text-sm text-muted-foreground">{selectedReg.email}</p>
                <p className="text-sm text-muted-foreground">{selectedReg.phone}</p>
                {selectedReg.type === 'clinic' && selectedReg.clinicName && (
                  <p className="text-sm font-medium text-primary">{isAr ? 'اسم العيادة:' : 'Clinic:'} {selectedReg.clinicName}</p>
                )}
              </div>

              {/* Doctor approval: independent (default) or link to clinic */}
              {selectedReg.type === 'doctor' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">
                      {isAr ? 'حالة الطبيب عند الموافقة' : 'Doctor Status on Approval'}
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setDoctorType('independent'); setAssignClinicId(''); }}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-xs font-medium transition-all ${
                          doctorType === 'independent'
                            ? 'border-chart-2 bg-chart-2/5 text-chart-2'
                            : 'border-border text-muted-foreground hover:border-muted-foreground'
                        }`}
                        data-testid="btn-type-independent"
                      >
                        <Stethoscope className="h-5 w-5" />
                        {isAr ? 'مستقل (الافتراضي)' : 'Independent (Default)'}
                        <span className="text-[10px] opacity-70 text-center leading-tight">
                          {isAr ? 'صفحة دعائية — بدون زر حجز' : 'Showcase only — no booking'}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDoctorType('clinic')}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 text-xs font-medium transition-all ${
                          doctorType === 'clinic'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:border-muted-foreground'
                        }`}
                        data-testid="btn-type-clinic"
                      >
                        <Building2 className="h-5 w-5" />
                        {isAr ? 'اربطه بعيادة الآن' : 'Link to Clinic Now'}
                        <span className="text-[10px] opacity-70 text-center leading-tight">
                          {isAr ? 'يُفعَّل زر الحجز فوراً' : 'Booking button activated'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Info box — independent */}
                  {doctorType === 'independent' && (
                    <div className="rounded-lg border border-chart-2/30 bg-chart-2/5 p-3 text-sm space-y-1">
                      <p className="font-medium text-chart-2">
                        {isAr ? 'صفحة دعائية فقط:' : 'Showcase profile only:'}
                      </p>
                      <p className="text-muted-foreground">• {isAr ? 'الطبيب يظهر في البحث بصفحة كاملة' : 'Doctor appears in search with full profile'}</p>
                      <p className="text-muted-foreground">• {isAr ? 'لا يوجد زر حجز حتى يُربط بعيادة أو زيارات منزلية' : 'No booking button until linked to clinic or home visits'}</p>
                      <p className="text-muted-foreground">• {isAr ? 'العيادات يمكنها ضمّه في أي وقت من إدارة الأطباء' : 'Clinics can link him anytime from Doctors management'}</p>
                    </div>
                  )}

                  {/* Clinic selector — only when clinic type selected */}
                  {doctorType === 'clinic' && (
                    <div className="space-y-2">
                      <Label>{isAr ? 'اختر العيادة للربط *' : 'Select Clinic to Link *'}</Label>
                      <Select value={assignClinicId} onValueChange={setAssignClinicId}>
                        <SelectTrigger data-testid="select-assign-clinic">
                          <SelectValue placeholder={isAr ? 'اختر عيادة' : 'Select clinic'} />
                        </SelectTrigger>
                        <SelectContent>
                          {clinics.filter(c => c.isActive).map(c => (
                            <SelectItem key={c.id} value={c.id}>{isAr ? c.nameAr : c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {isAr ? 'يمكن ربطه بعيادات إضافية لاحقاً من إدارة الأطباء' : 'More clinics can be added later from Doctors management'}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Clinic: show what will be created */}
              {selectedReg.type === 'clinic' && (
                <div className="rounded-lg border border-chart-2/30 bg-chart-2/5 p-3 text-sm space-y-1">
                  <p className="font-medium text-chart-2">{isAr ? 'سيتم إنشاء:' : 'Will create:'}</p>
                  <p className="text-muted-foreground">• {isAr ? 'عيادة جديدة بخطة Basic' : 'New clinic (Basic plan)'}</p>
                  <p className="text-muted-foreground">• {isAr ? 'حساب مدير للعيادة' : 'Admin account for the clinic'}</p>
                  <p className="text-muted-foreground">• {isAr ? 'إمكانية تسجيل الدخول فوراً' : 'Immediate login access'}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleConfirmApprove} data-testid="button-confirm-approve">
              <Check className="h-4 w-4 me-2" />
              {isAr ? 'تأكيد الموافقة' : 'Confirm Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════ Rejection Dialog ════════ */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <X className="h-5 w-5" />
              {isAr ? 'رفض الطلب' : 'Reject Request'}
            </DialogTitle>
          </DialogHeader>
          {selectedReg && (
            <div className="space-y-4 py-2 overflow-y-auto max-h-[60vh]">
              <p className="text-sm text-muted-foreground">
                {isAr
                  ? `هل أنت متأكد من رفض طلب "${selectedReg.name}"؟`
                  : `Are you sure you want to reject "${selectedReg.name}"'s request?`}
              </p>
              <div className="space-y-2">
                <Label>{isAr ? 'سبب الرفض (اختياري)' : 'Rejection Reason (optional)'}</Label>
                <Textarea
                  rows={3}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder={isAr ? 'أدخل سبب الرفض...' : 'Enter reason for rejection...'}
                  data-testid="input-reject-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button variant="destructive" onClick={handleConfirmReject} data-testid="button-confirm-reject">
              <X className="h-4 w-4 me-2" />
              {isAr ? 'تأكيد الرفض' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdmin;
