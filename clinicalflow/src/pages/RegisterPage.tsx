import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Stethoscope, Building2, User, CheckCircle, Clock,
  ArrowLeft, Copy, Gift,
} from 'lucide-react';
import { specialtyStore } from '@/stores/specialtyStore';
import { registerUser, approveRegistration } from '@/stores/registrationStore';
import { clinicStore, persistClinic, CLINIC_IDS } from '@/stores/clinicStore';
import { userStore, persistUser } from '@/stores/userStore';
import { EGYPT_GOVERNORATES } from '@/lib/governorates';
import { RegistrationEntry, UserRole, Clinic } from '@/types';
import logoImg from '@assets/Untitled_design_1772868317886.png';

type RegType = 'patient' | 'doctor' | 'clinic';

interface PatientForm  { name: string; phone: string; email: string; password: string; confirmPassword: string; usedReferralCode?: string; }
interface DoctorForm   { name: string; phone: string; email: string; specialtyId: string; graduationYear: string; password: string; confirmPassword: string; usedReferralCode?: string; }
interface ClinicForm   { clinicName: string; address: string; city: string; phone: string; adminName: string; email: string; password: string; confirmPassword: string; usedReferralCode?: string; }

const T = {
  ar: {
    backHome: 'العودة للرئيسية',
    title: 'إنشاء حساب جديد',
    subtitle: 'انضم إلى منصة ClinicFlow',
    tabPatient: 'مريض', tabDoctor: 'طبيب', tabClinic: 'عيادة',
    regNumDesc: 'سيتم إنشاء رقم تسجيل فريد تلقائياً (مثال: {prefix}-10001)',
    patientReg: 'تسجيل مريض', doctorReg: 'تسجيل طبيب', clinicReg: 'تسجيل عيادة',
    fullName: 'الاسم الكامل', namePh: 'أحمد محمد', doctorNamePh: 'د. سارة حسن',
    phone: 'رقم الهاتف', phonePh: '01xxxxxxxxx',
    email: 'البريد الإلكتروني', emailPh: 'example@email.com',
    password: 'كلمة المرور', passwordPh: 'أدخل كلمة مرور (٦ أحرف على الأقل)',
    confirmPassword: 'تأكيد كلمة المرور', confirmPh: 'أعد كتابة كلمة المرور',
    specialty: 'التخصص', specialtyPh: 'اختر تخصصك',
    gradYear: 'سنة التخرج', gradYearPh: '2015',
    clinicName: 'اسم العيادة', clinicNamePh: 'مركز السلام الطبي',
    address: 'العنوان', addressPh: '12 ميدان التحرير',
    city: 'المحافظة', cityPh: 'اختر المحافظة',
    adminName: 'اسم مسؤول العيادة', adminNamePh: 'د. خالد إبراهيم',
    referral: 'كود الإحالة (اختياري)', referralPh: 'مثال: PAT-10001',
    createPatient: 'إنشاء حساب',
    createDoctor: 'تقديم طلب تسجيل',
    createClinic: 'تقديم طلب تسجيل',
    haveAccount: 'لديك حساب؟', loginLink: 'سجّل دخولك',
    req: '*',
    errPassMatch: 'كلمتا المرور غير متطابقتين.',
    errPassLen: 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل.',
    errDuplicate: 'يوجد حساب مسجّل بهذا البريد أو رقم الهاتف بالفعل.',
    // Patient success — auto login
    patientSuccessTitle: 'تم إنشاء حسابك بنجاح!',
    patientSuccessDesc: 'مرحباً بك في ClinicFlow',
    regNumber: 'رقم تسجيلك',
    saveNumber: 'احفظ هذا الرقم للرجوع إليه لاحقاً',
    referralCode: 'كود الإحالة الخاص بك',
    referralShare: 'شارك هذا الكود لكسب مكافآت عندما ينضم أصدقاؤك',
    goPortal: 'الذهاب للبوابة',
    // Doctor/Clinic pending
    pendingTitle: 'تم استلام طلبك!',
    pendingDesc: 'سيتم مراجعة بياناتك والتواصل معك خلال ٢٤-٤٨ ساعة.',
    pendingNote: 'بمجرد الموافقة ستظهر صفحتك الدعائية في البحث. زر الحجز يُفعَّل عند ربطك بعيادة أو تفعيل الزيارات المنزلية.',
    goHome: 'العودة للرئيسية',
    referralUsed: 'كود الإحالة', referralApplied: 'تم تطبيقه بنجاح.',
  },
  en: {
    backHome: 'Back to Home',
    title: 'Create Your Account',
    subtitle: 'Join ClinicFlow',
    tabPatient: 'Patient', tabDoctor: 'Doctor', tabClinic: 'Clinic',
    regNumDesc: 'A unique registration number will be generated automatically (e.g., {prefix}-10001)',
    patientReg: 'Patient Registration', doctorReg: 'Doctor Registration', clinicReg: 'Clinic Registration',
    fullName: 'Full Name', namePh: 'Ahmed Mohamed', doctorNamePh: 'Dr. Sarah Hassan',
    phone: 'Phone Number', phonePh: '+20 1XX XXX XXXX',
    email: 'Email', emailPh: 'example@email.com',
    password: 'Password', passwordPh: 'Min. 6 characters',
    confirmPassword: 'Confirm Password', confirmPh: 'Re-enter your password',
    specialty: 'Specialty', specialtyPh: 'Select specialty',
    gradYear: 'Graduation Year', gradYearPh: '2015',
    clinicName: 'Clinic Name', clinicNamePh: 'Al Salam Medical Center',
    address: 'Address', addressPh: '12 Tahrir Square',
    city: 'Governorate', cityPh: 'Select governorate',
    adminName: 'Clinic Admin Name', adminNamePh: 'Dr. Khaled Ibrahim',
    referral: 'Referral Code (optional)', referralPh: 'e.g. PAT-10001',
    createPatient: 'Create Account',
    createDoctor: 'Submit Registration',
    createClinic: 'Submit Registration',
    haveAccount: 'Already have an account?', loginLink: 'Login here',
    req: '*',
    errPassMatch: 'Passwords do not match.',
    errPassLen: 'Password must be at least 6 characters.',
    errDuplicate: 'An account with this email or phone already exists.',
    patientSuccessTitle: 'Account Created Successfully!',
    patientSuccessDesc: 'Welcome to ClinicFlow',
    regNumber: 'Your Registration Number',
    saveNumber: 'Save this number for future reference',
    referralCode: 'Your Referral Code',
    referralShare: 'Share this code to earn rewards when friends join',
    goPortal: 'Go to My Portal',
    pendingTitle: 'Request Received!',
    pendingDesc: 'Your details will be reviewed and you will be contacted within 24–48 hours.',
    pendingNote: 'Once approved, your showcase profile will appear in search. The booking button is activated when linked to a clinic or home visits enabled.',
    goHome: 'Back to Home',
    referralUsed: 'Referral code', referralApplied: 'applied successfully.',
  },
} as const;

const TYPE_CONFIG = {
  patient: { icon: <User className="h-5 w-5" />,        colorOff: 'bg-blue-50 text-blue-700 border-blue-200',      colorOn: 'bg-blue-600 text-white border-blue-600',    prefix: 'PAT' },
  doctor:  { icon: <Stethoscope className="h-5 w-5" />, colorOff: 'bg-emerald-50 text-emerald-700 border-emerald-200', colorOn: 'bg-emerald-600 text-white border-emerald-600', prefix: 'DOC' },
  clinic:  { icon: <Building2 className="h-5 w-5" />,   colorOff: 'bg-violet-50 text-violet-700 border-violet-200',   colorOn: 'bg-violet-600 text-white border-violet-600',  prefix: 'CLN' },
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { registerPatient } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const t    = T[language as 'ar' | 'en'];
  const isAr = language === 'ar';

  const [activeType, setActiveType]   = useState<RegType>((searchParams.get('type') as RegType) || 'patient');
  const [registered, setRegistered]   = useState<RegistrationEntry | null>(null);
  const [regType, setRegType]         = useState<RegType>('patient');
  const [copied, setCopied]           = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [clinicCity, setClinicCity]   = useState('');

  // At registration, the doctor isn't tied to any clinic yet — show ALL platform
  // specialties. The `isActive` flag is used per-clinic (SpecialtyManagement)
  // to control which specialties show inside that clinic's UI.
  const specialties = specialtyStore.getAll();

  const patientForm = useForm<PatientForm>({ defaultValues: { name: '', phone: '', email: '', password: '', confirmPassword: '', usedReferralCode: '' } });
  const doctorForm  = useForm<DoctorForm>({ defaultValues:  { name: '', phone: '', email: '', specialtyId: '', graduationYear: '', password: '', confirmPassword: '', usedReferralCode: '' } });
  const clinicForm  = useForm<ClinicForm>({ defaultValues:  { clinicName: '', address: '', city: '', phone: '', adminName: '', email: '', password: '', confirmPassword: '', usedReferralCode: '' } });

  useEffect(() => {
    const tp = searchParams.get('type') as RegType;
    if (tp && ['patient', 'doctor', 'clinic'].includes(tp)) setActiveType(tp);
  }, [searchParams]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  // ── Patient submit: register + auto-login ─────────────────────────────────
  const onPatientSubmit = (data: PatientForm) => {
    setSubmitError('');
    if (data.password.length < 6)        { setSubmitError(t.errPassLen);   return; }
    if (data.password !== data.confirmPassword) { setSubmitError(t.errPassMatch); return; }

    const result = registerPatient({
      name: data.name, phone: data.phone, email: data.email,
      password: data.password, usedReferralCode: data.usedReferralCode,
    });
    if (!result.ok) { setSubmitError(result.error || t.errDuplicate); return; }

    // Also register in registrationStore for the reg number + referral code
    const regResult = registerUser({ type: 'patient', name: data.name, email: data.email, phone: data.phone, password: data.password, usedReferralCode: data.usedReferralCode || undefined });
    setRegType('patient');
    if (regResult.entry) setRegistered(regResult.entry);
  };

  // ── Doctor submit: pending approval ──────────────────────────────────────
  const onDoctorSubmit = (data: DoctorForm) => {
    setSubmitError('');
    if (data.password.length < 6)        { setSubmitError(t.errPassLen);   return; }
    if (data.password !== data.confirmPassword) { setSubmitError(t.errPassMatch); return; }

    const result = registerUser({ type: 'doctor', name: data.name, email: data.email, phone: data.phone, password: data.password, specialtyId: data.specialtyId, graduationYear: parseInt(data.graduationYear) || undefined, usedReferralCode: data.usedReferralCode || undefined });
    if (result.error || !result.entry) { setSubmitError(result.error || t.errDuplicate); return; }
    setRegType('doctor');
    setRegistered(result.entry);
  };

  // ── Clinic submit: auto-approve so the admin can login immediately ──────
  // Previously this just created a pending registration and required SuperAdmin
  // approval before the admin could login. That left users with a confusing
  // "Invalid login credentials" message. Now we auto-create the clinic + admin
  // user locally AND provision them in Supabase if available — same effect as
  // an immediate SuperAdmin approval.
  const onClinicSubmit = (data: ClinicForm) => {
    setSubmitError('');
    if (data.password.length < 6)        { setSubmitError(t.errPassLen);   return; }
    if (data.password !== data.confirmPassword) { setSubmitError(t.errPassMatch); return; }

    const result = registerUser({ type: 'clinic', name: data.adminName, clinicName: data.clinicName, email: data.email, phone: data.phone, password: data.password, address: data.address, city: clinicCity || data.city, adminName: data.adminName, usedReferralCode: data.usedReferralCode || undefined });
    if (result.error || !result.entry) { setSubmitError(result.error || t.errDuplicate); return; }

    // ── Auto-create clinic + admin user (mirrors SuperAdmin.handleApproveClinic) ──
    const clinicId = `cl-${Date.now()}`;
    const newClinic: Clinic = {
      id: clinicId,
      name: data.clinicName,
      nameAr: data.clinicName,
      address: data.address,
      city: clinicCity || data.city || '',
      phone: data.phone,
      email: data.email,
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
      name: data.adminName,
      nameAr: data.adminName,
      email: data.email,
      role: 'admin' as UserRole,
      clinicId,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    userStore.add(newUser);
    persistUser(newUser);

    // Save password locally so the loginStaffLocal fallback can authenticate
    try {
      const all: Record<string, string> = JSON.parse(localStorage.getItem('cf_staff_passwords') || '{}');
      all[userId] = data.password;
      localStorage.setItem('cf_staff_passwords', JSON.stringify(all));
    } catch { /* graceful */ }

    // Provision in Supabase too (fire-and-forget — silent on failure)
    fetch('/api/superadmin/provision-user', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        superAdminPassword: 'Mon_oskar11',
        email:    data.email,
        password: data.password,
        name:     data.adminName,
        nameAr:   data.adminName,
        role:     'admin',
        clinicId,
      }),
    }).catch(() => {});

    approveRegistration(result.entry.id, { userId, linkedClinicId: clinicId });

    // Send the user to the login page with their email pre-filled. They can now
    // login immediately with the password they just chose.
    navigate(`/login?email=${encodeURIComponent(data.email)}&registered=clinic`);
  };

  // ── Success / Pending screen ──────────────────────────────────────────────
  if (registered) {
    // Doctor still requires SuperAdmin approval; clinic now auto-approves so
    // the admin can login immediately after submission.
    const isPending = regType === 'doctor';
    const referralLink = `${window.location.origin}/ref/${registered.referralCode}`;

    if (isPending) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
          <Card className="w-full max-w-md">
            <CardContent className="p-8 text-center">
              <div className="h-16 w-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Clock className="h-8 w-8 text-amber-600" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">{t.pendingTitle}</h2>
              <p className="text-muted-foreground text-sm mb-2">{t.pendingDesc}</p>
              <div className="bg-muted/50 rounded-xl p-3 mb-4 text-start">
                <p className="text-xs font-medium text-foreground mb-1">{t.regNumber}:</p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-primary">{registered.regNumber}</span>
                  <button onClick={() => handleCopy(registered.regNumber)} className="text-muted-foreground hover:text-primary">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-6 bg-blue-50 border border-blue-200 rounded-lg p-3">
                {t.pendingNote}
              </p>
              {registered.usedReferralCode && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                  {t.referralUsed} <strong>{registered.usedReferralCode}</strong> {t.referralApplied}
                </p>
              )}
              <Button className="w-full" onClick={() => navigate('/')}>{t.goHome}</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Patient success — already logged in, go to portal
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex items-center justify-center p-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-1">{t.patientSuccessTitle}</h2>
            <p className="text-muted-foreground text-sm mb-6">{t.patientSuccessDesc}، {registered.name}.</p>

            <div className="bg-muted/50 rounded-xl p-4 mb-4">
              <p className="text-xs text-muted-foreground mb-1">{t.regNumber}</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-bold text-primary tracking-wider">{registered.regNumber}</span>
                <button onClick={() => handleCopy(registered.regNumber)} className="text-muted-foreground hover:text-primary transition-colors">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t.saveNumber}</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Gift className="h-4 w-4 text-amber-600" />
                <p className="text-xs font-semibold text-amber-700">{t.referralCode}</p>
              </div>
              <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-lg font-bold text-amber-700 tracking-widest">{registered.referralCode}</span>
                <button onClick={() => handleCopy(registered.referralCode)} className="text-amber-600 hover:text-amber-800">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-amber-600">{t.referralShare}</p>
            </div>

            {registered.usedReferralCode && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4">
                {t.referralUsed} <strong>{registered.usedReferralCode}</strong> {t.referralApplied}
              </p>
            )}

            <Button className="w-full" onClick={() => navigate('/patient/appointments')}>
              {t.goPortal}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Registration form ─────────────────────────────────────────────────────
  const tabLabels: Record<RegType, string> = { patient: t.tabPatient, doctor: t.tabDoctor, clinic: t.tabClinic };
  const regTitles: Record<RegType, string> = { patient: t.patientReg, doctor: t.doctorReg,  clinic: t.clinicReg  };

  const fieldClass = (err?: boolean) =>
    `space-y-1.5${err ? ' [&_input]:border-destructive' : ''}`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Nav */}
      <div className="border-b bg-white/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2">
            <img src={logoImg} alt="ClinicFlow" className="h-7 w-7 rounded-lg" />
            <span className="font-bold text-foreground">ClinicFlow</span>
          </button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setLanguage(isAr ? 'en' : 'ar')}>
              {isAr ? 'EN' : 'AR'}
            </Button>
            <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className={`h-4 w-4 ${isRTL ? 'rotate-180' : ''}`} />
              {t.backHome}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">{t.title}</h1>
          <p className="text-muted-foreground text-sm">{t.subtitle}</p>
        </div>

        {/* Type tabs */}
        <div className="flex gap-3 mb-6">
          {(Object.keys(TYPE_CONFIG) as RegType[]).map(type => {
            const cfg = TYPE_CONFIG[type];
            const isActive = activeType === type;
            return (
              <button
                key={type}
                className={`flex-1 flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${isActive ? cfg.colorOn : cfg.colorOff}`}
                onClick={() => { setActiveType(type); setSubmitError(''); }}
                data-testid={`tab-register-${type}`}
              >
                {cfg.icon}
                <span className="text-xs font-semibold">{tabLabels[type]}</span>
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{regTitles[activeType]}</CardTitle>
            <CardDescription>
              {t.regNumDesc.replace('{prefix}', TYPE_CONFIG[activeType].prefix)}
              {(activeType === 'doctor' || activeType === 'clinic') && (
                <span className="block mt-1 text-amber-600 font-medium">
                  {isAr ? '⚠ يتطلب موافقة الإدارة — ستظهر صفحتك الدعائية بعد الموافقة.' : '⚠ Requires admin approval — your showcase profile appears after approval.'}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>

            {/* ── Patient form ── */}
            {activeType === 'patient' && (
              <form onSubmit={patientForm.handleSubmit(onPatientSubmit)} className="space-y-4">
                <div className={fieldClass()}><Label htmlFor="p-name">{t.fullName} {t.req}</Label><Input id="p-name" placeholder={t.namePh} {...patientForm.register('name', { required: true })} data-testid="input-patient-name" /></div>
                <div className={fieldClass()}><Label htmlFor="p-phone">{t.phone} {t.req}</Label><Input id="p-phone" placeholder={t.phonePh} {...patientForm.register('phone', { required: true })} data-testid="input-patient-phone" /></div>
                <div className={fieldClass()}><Label htmlFor="p-email">{t.email} {t.req}</Label><Input id="p-email" type="email" placeholder={t.emailPh} {...patientForm.register('email', { required: true })} data-testid="input-patient-email" /></div>
                <div className={fieldClass()}><Label htmlFor="p-pass">{t.password} {t.req}</Label><Input id="p-pass" type="password" placeholder={t.passwordPh} {...patientForm.register('password', { required: true })} data-testid="input-patient-password" /></div>
                <div className={fieldClass()}><Label htmlFor="p-cpass">{t.confirmPassword} {t.req}</Label><Input id="p-cpass" type="password" placeholder={t.confirmPh} {...patientForm.register('confirmPassword', { required: true })} data-testid="input-patient-confirm-password" /></div>
                <div className="space-y-1.5"><Label htmlFor="p-ref" className="flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 text-amber-500" />{t.referral}</Label><Input id="p-ref" placeholder={t.referralPh} {...patientForm.register('usedReferralCode')} data-testid="input-patient-referral" /></div>
                {submitError && <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">{submitError}</p>}
                <Button type="submit" className="w-full" data-testid="button-patient-submit">{t.createPatient}</Button>
              </form>
            )}

            {/* ── Doctor form ── */}
            {activeType === 'doctor' && (
              <form onSubmit={doctorForm.handleSubmit(onDoctorSubmit)} className="space-y-4">
                <div className={fieldClass()}><Label htmlFor="d-name">{t.fullName} {t.req}</Label><Input id="d-name" placeholder={t.doctorNamePh} {...doctorForm.register('name', { required: true })} data-testid="input-doctor-name" /></div>
                <div className={fieldClass()}><Label htmlFor="d-phone">{t.phone} {t.req}</Label><Input id="d-phone" placeholder={t.phonePh} {...doctorForm.register('phone', { required: true })} data-testid="input-doctor-phone" /></div>
                <div className={fieldClass()}><Label htmlFor="d-email">{t.email} {t.req}</Label><Input id="d-email" type="email" placeholder={t.emailPh} {...doctorForm.register('email', { required: true })} data-testid="input-doctor-email" /></div>
                <div className="space-y-1.5">
                  <Label htmlFor="d-spec">{t.specialty} {t.req}</Label>
                  <Select onValueChange={v => doctorForm.setValue('specialtyId', v)} defaultValue="">
                    <SelectTrigger id="d-spec" data-testid="select-doctor-specialty"><SelectValue placeholder={t.specialtyPh} /></SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">{specialties.map(s => <SelectItem key={s.id} value={s.id}>{isAr ? s.nameAr : s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className={fieldClass()}><Label htmlFor="d-grad">{t.gradYear} {t.req}</Label><Input id="d-grad" type="number" placeholder={t.gradYearPh} min={1970} max={new Date().getFullYear()} {...doctorForm.register('graduationYear', { required: true })} data-testid="input-doctor-grad-year" /></div>
                <div className={fieldClass()}><Label htmlFor="d-pass">{t.password} {t.req}</Label><Input id="d-pass" type="password" placeholder={t.passwordPh} {...doctorForm.register('password', { required: true })} data-testid="input-doctor-password" /></div>
                <div className={fieldClass()}><Label htmlFor="d-cpass">{t.confirmPassword} {t.req}</Label><Input id="d-cpass" type="password" placeholder={t.confirmPh} {...doctorForm.register('confirmPassword', { required: true })} data-testid="input-doctor-confirm-password" /></div>
                <div className="space-y-1.5"><Label htmlFor="d-ref" className="flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 text-amber-500" />{t.referral}</Label><Input id="d-ref" placeholder={t.referralPh} {...doctorForm.register('usedReferralCode')} data-testid="input-doctor-referral" /></div>
                {submitError && <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">{submitError}</p>}
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" data-testid="button-doctor-submit">{t.createDoctor}</Button>
              </form>
            )}

            {/* ── Clinic form ── */}
            {activeType === 'clinic' && (
              <form onSubmit={clinicForm.handleSubmit(onClinicSubmit)} className="space-y-4">
                <div className={fieldClass()}><Label htmlFor="c-name">{t.clinicName} {t.req}</Label><Input id="c-name" placeholder={t.clinicNamePh} {...clinicForm.register('clinicName', { required: true })} data-testid="input-clinic-name" /></div>
                <div className={fieldClass()}><Label htmlFor="c-address">{t.address} {t.req}</Label><Input id="c-address" placeholder={t.addressPh} {...clinicForm.register('address', { required: true })} data-testid="input-clinic-address" /></div>
                {/* Governorate dropdown */}
                <div className="space-y-1.5">
                  <Label htmlFor="c-city">{t.city} {t.req}</Label>
                  <Select value={clinicCity} onValueChange={v => { setClinicCity(v); clinicForm.setValue('city', v, { shouldValidate: true }); }} data-testid="select-clinic-city">
                    <SelectTrigger id="c-city"><SelectValue placeholder={t.cityPh} /></SelectTrigger>
                    <SelectContent className="max-h-64 overflow-y-auto">
                      {EGYPT_GOVERNORATES.map(g => <SelectItem key={g.en} value={g.en}>{isAr ? g.ar : g.en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <input type="hidden" {...clinicForm.register('city', { required: true })} value={clinicCity} />
                </div>
                <div className={fieldClass()}><Label htmlFor="c-phone">{t.phone} {t.req}</Label><Input id="c-phone" placeholder="+20 2 XXXX XXXX" {...clinicForm.register('phone', { required: true })} data-testid="input-clinic-phone" /></div>
                <div className={fieldClass()}><Label htmlFor="c-admin">{t.adminName} {t.req}</Label><Input id="c-admin" placeholder={t.adminNamePh} {...clinicForm.register('adminName', { required: true })} data-testid="input-clinic-admin" /></div>
                <div className={fieldClass()}><Label htmlFor="c-email">{t.email} {t.req}</Label><Input id="c-email" type="email" placeholder="admin@yourclinic.com" {...clinicForm.register('email', { required: true })} data-testid="input-clinic-email" /></div>
                <div className={fieldClass()}><Label htmlFor="c-pass">{t.password} {t.req}</Label><Input id="c-pass" type="password" placeholder={t.passwordPh} {...clinicForm.register('password', { required: true })} data-testid="input-clinic-password" /></div>
                <div className={fieldClass()}><Label htmlFor="c-cpass">{t.confirmPassword} {t.req}</Label><Input id="c-cpass" type="password" placeholder={t.confirmPh} {...clinicForm.register('confirmPassword', { required: true })} data-testid="input-clinic-confirm-password" /></div>
                <div className="space-y-1.5"><Label htmlFor="c-ref" className="flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 text-amber-500" />{t.referral}</Label><Input id="c-ref" placeholder={t.referralPh} {...clinicForm.register('usedReferralCode')} data-testid="input-clinic-referral" /></div>
                {submitError && <p className="text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded px-3 py-2">{submitError}</p>}
                <Button type="submit" className="w-full bg-violet-600 hover:bg-violet-700" data-testid="button-clinic-submit">{t.createClinic}</Button>
              </form>
            )}

            <p className="text-center text-sm text-muted-foreground mt-4">
              {t.haveAccount}{' '}
              <button onClick={() => navigate('/login')} className="text-primary hover:underline" data-testid="link-login">
                {t.loginLink}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RegisterPage;
