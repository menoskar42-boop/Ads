import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { clinicStore } from '@/stores/clinicStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  User, ArrowLeft, Building2, ChevronRight, Smartphone, Stethoscope,
  Mail, Lock, Eye, EyeOff, UserPlus, Loader2,
} from 'lucide-react';
import logoImg from '@assets/Untitled_design_1772868317886.png';

type Tab = 'patient' | 'staff' | 'doctor';

const T = {
  ar: {
    backHome: 'العودة للرئيسية', registerNow: 'سجل الآن',
    welcomeBack: 'مرحباً بعودتك', subtitle: 'سجّل دخولك إلى حسابك في ClinicFlow',
    tabPatient: 'مريض', tabStaff: 'موظفو العيادة',
    // Patient tab
    patientTitle: 'دخول المرضى', patientDesc: 'أدخل رقم هاتفك وكلمة المرور',
    patPhoneLabel: 'رقم الهاتف', patPhonePh: '01xxxxxxxxx',
    patPassLabel: 'كلمة المرور', patPassPh: '••••••••',
    signInPatient: 'تسجيل الدخول',
    noAccount: 'ليس لديك حساب؟', createAccount: 'إنشاء حساب مريض',
    // Staff tab
    staffTitle: 'دخول موظفي العيادة', staffDesc: 'سجّل دخولك ببريدك الإلكتروني وكلمة المرور',
    emailLabel: 'البريد الإلكتروني للعمل', emailPh: 'you@yourclinic.com',
    staffPassLabel: 'كلمة المرور', staffPassPh: '••••••••',
    signInStaff: 'دخول',
    forgotPass: 'لإعادة تعيين كلمة المرور تواصل مع مدير العيادة.',
    registerClinic: 'تريد تسجيل عيادتك؟', registerClinicLink: 'سجّل هنا',
    // Doctor tab
    tabDoctor: 'طبيب',
    doctorTitle: 'دخول الأطباء', doctorDesc: 'سجّل دخولك ببريدك الإلكتروني وكلمة المرور',
    doctorEmailLabel: 'البريد الإلكتروني', doctorEmailPh: 'doctor@email.com',
    doctorPassLabel: 'كلمة المرور', doctorPassPh: '••••••••',
    signInDoctor: 'دخول',
    doctorForgot: 'لإعادة تعيين كلمة المرور تواصل مع إدارة المنصة.',
    registerDoctor: 'طبيب جديد؟', registerDoctorLink: 'سجّل هنا',
    // Session selection (after login)
    sessionTitle: 'اختر وضع العمل', sessionDesc: 'حدد كيف تريد الدخول لهذه الجلسة',
    // Multi-clinic
    multiTitle: 'اختر عيادتك', multiDesc: 'أنت مسجّل في أكثر من عيادة.',
    // Footer
    terms: 'بتسجيل دخولك فأنت توافق على', termsLink: 'شروط الخدمة',
    and: 'و', privacyLink: 'سياسة الخصوصية',
  },
  en: {
    backHome: 'Back to Home', registerNow: 'Sign Up',
    welcomeBack: 'Welcome back', subtitle: 'Sign in to your ClinicFlow account',
    tabPatient: 'Patient', tabStaff: 'Clinic Staff',
    patientTitle: 'Patient Login', patientDesc: 'Enter your phone number and password',
    patPhoneLabel: 'Phone Number', patPhonePh: '01xxxxxxxxx',
    patPassLabel: 'Password', patPassPh: '••••••••',
    signInPatient: 'Sign In',
    noAccount: "Don't have an account?", createAccount: 'Create a Patient Account',
    staffTitle: 'Clinic Staff Login', staffDesc: 'Sign in with your work email and password',
    emailLabel: 'Work Email', emailPh: 'you@yourclinic.com',
    staffPassLabel: 'Password', staffPassPh: '••••••••',
    signInStaff: 'Sign In',
    forgotPass: 'Contact your clinic admin to reset your password.',
    // Doctor tab
    tabDoctor: 'Doctor',
    doctorTitle: 'Doctor Login', doctorDesc: 'Sign in with your email and password',
    doctorEmailLabel: 'Email Address', doctorEmailPh: 'doctor@email.com',
    doctorPassLabel: 'Password', doctorPassPh: '••••••••',
    signInDoctor: 'Sign In',
    doctorForgot: 'Contact platform admin to reset your password.',
    registerDoctor: 'New doctor?', registerDoctorLink: 'Register here',
    // Session selection
    sessionTitle: 'Choose Working Mode', sessionDesc: 'How would you like to work this session?',
    // Multi-clinic
    multiTitle: 'Select Your Clinic', multiDesc: 'You are registered in multiple clinics.',
    terms: 'By signing in you agree to our', termsLink: 'Terms of Service',
    and: 'and', privacyLink: 'Privacy Policy',
  },
} as const;

const Login: React.FC = () => {
  const { loginAsPatient, loginStaff, pendingDoctorClinics, selectClinicForDoctor } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnDoctor = searchParams.get('returnDoctor');
  const prefilledEmail = searchParams.get('email');
  const justRegistered = searchParams.get('registered');

  const t    = T[language as 'ar' | 'en'];
  const isAr = language === 'ar';

  // If the user just registered a clinic, default to the staff tab and pre-fill email
  const [tab, setTab] = useState<Tab>(justRegistered === 'clinic' ? 'staff' : 'patient');

  // Patient state
  const [patientPhone, setPatientPhone] = useState('');
  const [patientPass, setPatientPass]   = useState('');
  const [showPatPass, setShowPatPass]   = useState(false);
  const [patientError, setPatientError] = useState('');
  const [patLoading, setPatLoading]     = useState(false);

  // Staff state
  const [staffEmail, setStaffEmail]     = useState(prefilledEmail || '');
  const [staffPass, setStaffPass]       = useState('');
  const [showPass, setShowPass]         = useState(false);
  const [staffError, setStaffError]     = useState('');
  const [staffLoading, setStaffLoading] = useState(false);

  // Doctor state (independent login)
  const [doctorEmail, setDoctorEmail]   = useState('');
  const [doctorPass, setDoctorPass]     = useState('');
  const [showDoctorPass, setShowDoctorPass] = useState(false);
  const [doctorError, setDoctorError]   = useState('');
  const [doctorLoading, setDoctorLoading] = useState(false);

  // ── Doctor session selection (clinic / home visits) ─────────────────────
  if (pendingDoctorClinics) {
    const hasHomeVisitOption = pendingDoctorClinics.includes('home-visits-only');
    const clinicIds = pendingDoctorClinics.filter(id => id !== 'home-visits-only');
    const doctorClinics = clinicIds
      .map(cid => clinicStore.filter(c => c.id === cid)[0])
      .filter(Boolean);

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Building2 className="h-10 w-10 text-primary mx-auto mb-2" />
            <CardTitle>{t.sessionTitle}</CardTitle>
            <CardDescription>{t.sessionDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Clinic options */}
            {doctorClinics.map(clinic => (
              <button
                key={clinic.id}
                onClick={() => { selectClinicForDoctor(clinic.id); navigate('/dashboard'); }}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-start"
                data-testid={`clinic-select-${clinic.id}`}
              >
                <Building2 className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground truncate">{isAr ? clinic.nameAr : clinic.name}</div>
                  <div className="text-sm text-muted-foreground truncate">{isAr ? clinic.cityAr : clinic.city}</div>
                </div>
                <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 ${isRTL ? 'rotate-180' : ''}`} />
              </button>
            ))}

            {/* Home visits only option */}
            {hasHomeVisitOption && (
              <>
                {doctorClinics.length > 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground px-2">{isAr ? 'أو' : 'or'}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <button
                  onClick={() => { selectClinicForDoctor('home-visits-only'); navigate('/home-visits'); }}
                  className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-dashed border-emerald-400/50 hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-all text-start"
                  data-testid="clinic-select-home-visits"
                >
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <Smartphone className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{isAr ? 'زيارات منزلية فقط' : 'Home Visits Only'}</div>
                    <div className="text-sm text-muted-foreground">{isAr ? 'عرض وإدارة الزيارات المنزلية' : 'View and manage your home visit requests'}</div>
                  </div>
                  <ChevronRight className={`h-4 w-4 text-emerald-500 shrink-0 ${isRTL ? 'rotate-180' : ''}`} />
                </button>
              </>
            )}

            {/* Independent doctor — no clinics, no home visits */}
            {doctorClinics.length === 0 && !hasHomeVisitOption && (
              <div className="text-center py-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {isAr
                    ? 'حسابك مفعّل — صفحتك الدعائية متاحة للمرضى'
                    : 'Your account is active — your showcase profile is visible to patients'}
                </p>
                <Button
                  className="w-full"
                  onClick={() => { selectClinicForDoctor(''); navigate(`/doctor/${pendingDoctorUser?.id}`); }}
                >
                  {isAr ? 'عرض صفحتي الشخصية' : 'View My Profile'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePatientLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setPatientError('');
    setPatLoading(true);
    await new Promise(r => setTimeout(r, 250));
    const result = loginAsPatient(patientPhone, patientPass);
    setPatLoading(false);
    if (result.ok) {
      if (returnDoctor) navigate(`/patient/book?doctor=${returnDoctor}`);
      else navigate('/patient/appointments');
    } else {
      setPatientError(result.error || (isAr ? 'بيانات غير صحيحة.' : 'Invalid credentials.'));
    }
  };

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');
    if (!staffEmail.trim() || !staffPass) {
      setStaffError(isAr ? 'أدخل البريد الإلكتروني وكلمة المرور.' : 'Enter email and password.');
      return;
    }
    setStaffLoading(true);
    const result = await loginStaff(staffEmail, staffPass);
    setStaffLoading(false);
    if (result.ok) {
      navigate('/dashboard');
    } else {
      setStaffError(result.error || (isAr ? 'بيانات غير صحيحة.' : 'Invalid credentials.'));
    }
  };

  const handleDoctorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setDoctorError('');
    if (!doctorEmail.trim() || !doctorPass) {
      setDoctorError(isAr ? 'أدخل البريد الإلكتروني وكلمة المرور.' : 'Enter email and password.');
      return;
    }
    setDoctorLoading(true);
    const result = await loginStaff(doctorEmail, doctorPass);
    setDoctorLoading(false);
    if (result.ok) {
      // Navigation handled by pendingDoctorClinics screen or AuthContext
      if (!pendingDoctorClinics) navigate('/dashboard');
    } else {
      setDoctorError(result.error || (isAr ? 'بيانات غير صحيحة.' : 'Invalid credentials.'));
    }
  };

  const TABS = [
    { key: 'patient' as Tab, label: t.tabPatient, icon: <User className="h-4 w-4" /> },
    { key: 'doctor'  as Tab, label: t.tabDoctor,  icon: <Stethoscope className="h-4 w-4" /> },
    { key: 'staff'   as Tab, label: t.tabStaff,   icon: <Building2 className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-background to-blue-50/30 flex flex-col" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src={logoImg} alt="ClinicFlow" className="h-9 w-9 rounded-lg object-cover" />
            <span className="font-semibold text-foreground hidden sm:inline">ClinicFlow</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLanguage(isAr ? 'en' : 'ar')}>
              {isAr ? 'EN' : 'AR'}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/register" className="gap-1.5 flex items-center" data-testid="button-header-register">
                <UserPlus className="h-4 w-4" />
                {t.registerNow}
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/" className="gap-2 flex items-center">
                <ArrowLeft className={`h-4 w-4 ${isRTL ? 'rotate-180' : ''}`} />
                {t.backHome}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">{t.welcomeBack}</h1>
            <p className="text-muted-foreground mt-1">{t.subtitle}</p>
          </div>

          {/* Tabs */}
          <div className="flex rounded-lg bg-muted p-1 mb-6 gap-1">
            {TABS.map(tb => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-sm font-medium transition-all ${
                  tab === tb.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`tab-${tb.key}`}
              >
                {tb.icon}
                <span>{tb.label}</span>
              </button>
            ))}
          </div>

          {/* ── PATIENT TAB ── */}
          {tab === 'patient' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-blue-600" />
                  {t.patientTitle}
                </CardTitle>
                <CardDescription>{t.patientDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePatientLogin} className="space-y-4" noValidate>
                  {/* Phone */}
                  <div className="space-y-1.5">
                    <Label htmlFor="patient-phone">{t.patPhoneLabel}</Label>
                    <div className="relative">
                      <Smartphone className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
                      <Input
                        id="patient-phone"
                        type="tel"
                        inputMode="numeric"
                        className={isRTL ? 'pr-9' : 'pl-9'}
                        placeholder={t.patPhonePh}
                        value={patientPhone}
                        onChange={e => { setPatientPhone(e.target.value); setPatientError(''); }}
                        data-testid="input-patient-phone"
                      />
                    </div>
                  </div>
                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="patient-pass">{t.patPassLabel}</Label>
                    <div className="relative">
                      <Lock className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
                      <Input
                        id="patient-pass"
                        type={showPatPass ? 'text' : 'password'}
                        className={isRTL ? 'pr-9 ps-9' : 'pl-9 pr-9'}
                        placeholder={t.patPassPh}
                        autoComplete="current-password"
                        value={patientPass}
                        onChange={e => { setPatientPass(e.target.value); setPatientError(''); }}
                        data-testid="input-patient-password"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setShowPatPass(v => !v)}
                        className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground`}
                      >
                        {showPatPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {patientError && (
                    <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">
                      {patientError}
                    </p>
                  )}

                  <Button className="w-full" type="submit" disabled={patLoading} data-testid="button-patient-login">
                    {patLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin me-2" />{isAr ? 'جاري الدخول...' : 'Signing in...'}</>
                      : t.signInPatient
                    }
                  </Button>

                  <Separator />

                  <div className="space-y-2 text-center">
                    <p className="text-sm text-muted-foreground">{t.noAccount}</p>
                    <Button variant="outline" className="w-full gap-2" asChild>
                      <Link to="/register?type=patient" data-testid="button-create-account">
                        <UserPlus className="h-4 w-4" />
                        {t.createAccount}
                      </Link>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* ── DOCTOR TAB ── */}
          {tab === 'doctor' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-violet-600" />
                  {t.doctorTitle}
                </CardTitle>
                <CardDescription>{t.doctorDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleDoctorLogin} className="space-y-4" noValidate>
                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="doctor-email">{t.doctorEmailLabel}</Label>
                    <div className="relative">
                      <Mail className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
                      <Input
                        id="doctor-email"
                        type="email"
                        className={isRTL ? 'pr-9' : 'pl-9'}
                        placeholder={t.doctorEmailPh}
                        autoComplete="email"
                        value={doctorEmail}
                        onChange={e => { setDoctorEmail(e.target.value); setDoctorError(''); }}
                        data-testid="input-doctor-email"
                      />
                    </div>
                  </div>
                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="doctor-pass">{t.doctorPassLabel}</Label>
                    <div className="relative">
                      <Lock className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
                      <Input
                        id="doctor-pass"
                        type={showDoctorPass ? 'text' : 'password'}
                        className={isRTL ? 'pr-9 ps-9' : 'pl-9 pr-9'}
                        placeholder={t.doctorPassPh}
                        autoComplete="current-password"
                        value={doctorPass}
                        onChange={e => { setDoctorPass(e.target.value); setDoctorError(''); }}
                        data-testid="input-doctor-password"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setShowDoctorPass(v => !v)}
                        className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground`}
                      >
                        {showDoctorPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {doctorError && (
                    <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">
                      {doctorError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-violet-600 hover:bg-violet-700"
                    disabled={doctorLoading}
                    data-testid="button-doctor-login"
                  >
                    {doctorLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin me-2" />{isAr ? 'جاري الدخول...' : 'Signing in...'}</>
                      : t.signInDoctor
                    }
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">{t.doctorForgot}</p>

                  <Separator />
                  <p className="text-center text-xs text-muted-foreground">
                    {t.registerDoctor}{' '}
                    <Link to="/register?type=doctor" className="text-primary hover:underline font-medium" data-testid="link-register-doctor">
                      {t.registerDoctorLink}
                    </Link>
                  </p>
                </form>
              </CardContent>
            </Card>
          )}

          {/* ── CLINIC STAFF TAB ── */}
          {tab === 'staff' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-emerald-600" />
                  {t.staffTitle}
                </CardTitle>
                <CardDescription>{t.staffDesc}</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleStaffLogin} className="space-y-4" noValidate>
                  {/* Email */}
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-email">{t.emailLabel}</Label>
                    <div className="relative">
                      <Mail className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
                      <Input
                        id="staff-email"
                        type="email"
                        className={isRTL ? 'pr-9' : 'pl-9'}
                        placeholder={t.emailPh}
                        autoComplete="email"
                        value={staffEmail}
                        onChange={e => { setStaffEmail(e.target.value); setStaffError(''); }}
                        data-testid="input-staff-email"
                      />
                    </div>
                  </div>
                  {/* Password */}
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-pass">{t.staffPassLabel}</Label>
                    <div className="relative">
                      <Lock className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
                      <Input
                        id="staff-pass"
                        type={showPass ? 'text' : 'password'}
                        className={isRTL ? 'pr-9 ps-9' : 'pl-9 pr-9'}
                        placeholder={t.staffPassPh}
                        autoComplete="current-password"
                        value={staffPass}
                        onChange={e => { setStaffPass(e.target.value); setStaffError(''); }}
                        data-testid="input-staff-password"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => setShowPass(v => !v)}
                        className={`absolute ${isRTL ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground`}
                      >
                        {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {staffError && (
                    <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">
                      {staffError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    disabled={staffLoading}
                    data-testid="button-staff-login"
                  >
                    {staffLoading
                      ? <><Loader2 className="h-4 w-4 animate-spin me-2" />{isAr ? 'جاري الدخول...' : 'Signing in...'}</>
                      : t.signInStaff
                    }
                  </Button>

                  <p className="text-center text-xs text-muted-foreground">{t.forgotPass}</p>

                  <Separator />
                  <p className="text-center text-xs text-muted-foreground">
                    {t.registerClinic}{' '}
                    <Link to="/register?type=clinic" className="text-primary hover:underline font-medium" data-testid="link-register-clinic">
                      {t.registerClinicLink}
                    </Link>
                  </p>
                </form>
              </CardContent>
            </Card>
          )}

          <p className="text-center text-xs text-muted-foreground mt-6">
            {t.terms}{' '}
            <span className="text-primary cursor-pointer hover:underline">{t.termsLink}</span>
            {' '}{t.and}{' '}
            <span className="text-primary cursor-pointer hover:underline">{t.privacyLink}</span>
          </p>
        </div>
      </main>
    </div>
  );
};

export default Login;
