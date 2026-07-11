import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { clinicStore } from '@/stores/clinicStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Phone, ShieldCheck } from 'lucide-react';
import logoImg from '@assets/Untitled_design_1772868317886.png';
import { toast } from 'sonner';

// ── OTP helpers (demo / mock) ──────────────────────────────────
function generateOTP() { return Math.floor(100_000 + Math.random() * 900_000).toString(); }
let _pendingOTP: string | null = null;

const PatientLogin: React.FC = () => {
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { loginAsPatient, registerPatient } = useAuth();
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);

  // Login state — step: 'phone' | 'otp'
  const [loginStep, setLoginStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [mockOtpDisplay, setMockOtpDisplay] = useState('');   // shown in demo banner

  const clinics = clinicStore.filter(c => c.isActive);

  // Register state
  const [regData, setRegData] = useState({
    name: '', nameAr: '', phone: '', email: '', dateOfBirth: '', gender: 'male' as 'male' | 'female',
    clinicId: clinics[0]?.id || 'clinic-1',
    referredBy: '',
  });

  // Step 1: send mock OTP
  const handleSendOtp = () => {
    if (!phone.trim()) return;
    _pendingOTP = generateOTP();
    setMockOtpDisplay(_pendingOTP);
    setLoginStep('otp');
    toast.info(language === 'ar' ? 'تم إرسال رمز التحقق (تجريبي)' : 'OTP sent (demo mode)');
  };

  // Step 2: verify OTP then login
  const handleVerifyOtp = () => {
    if (!otpInput.trim()) return;
    if (otpInput.trim() !== _pendingOTP) {
      toast.error(language === 'ar' ? 'رمز التحقق غير صحيح' : 'Incorrect OTP');
      return;
    }
    _pendingOTP = null;
    const success = loginAsPatient(phone.trim());
    if (success) {
      toast.success(t('auth.loginSuccess'));
      navigate('/patient/appointments');
    } else {
      toast.error(language === 'ar' ? 'رقم الهاتف غير مسجل' : 'Phone number not registered');
      setLoginStep('phone');
    }
  };

  const handleRegister = () => {
    if (!regData.name || !regData.phone || !regData.dateOfBirth) return;
    const success = registerPatient(regData);
    if (success) {
      toast.success(language === 'ar' ? 'تم التسجيل بنجاح!' : 'Registration successful!');
      navigate('/patient/book');
    } else {
      toast.error(language === 'ar' ? 'رقم الهاتف مسجل مسبقاً' : 'Phone number already registered');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoImg} alt="Clinical Flow" className="h-10 w-10 rounded-lg object-cover" />
            <div>
              <h1 className="font-semibold text-foreground">{t('app.title')}</h1>
              <Badge variant="secondary" className="text-xs">{t('auth.patient')}</Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}>
              {language === 'en' ? 'العربية' : 'English'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/login')} className="gap-1">
              <ArrowLeft className={`h-4 w-4 ${isRTL ? 'rotate-180' : ''}`} />
              {t('auth.staffLogin')}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
              <img src={logoImg} alt="Clinical Flow" className="h-14 w-14 rounded-full object-cover" />
            </div>
            <CardTitle className="text-xl">
              {isRegister ? (language === 'ar' ? 'تسجيل مريض جديد' : 'New Patient Registration') : t('auth.patientLogin')}
            </CardTitle>
            <CardDescription>{t('auth.patientLoginDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isRegister ? (
              <>
                {loginStep === 'phone' ? (
                  <>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        {t('patients.phone')}
                      </Label>
                      <Input
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                        placeholder="+1 555 000 0000"
                        dir="ltr"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'ar' ? 'أرقام تجريبية: +1-555-0101, +1-555-0102' : 'Demo phones: +1-555-0101, +1-555-0102'}
                    </p>
                    <Button className="w-full gap-2" onClick={handleSendOtp} disabled={!phone.trim()}>
                      <Phone className="h-4 w-4" />
                      {language === 'ar' ? 'إرسال رمز التحقق' : 'Send OTP'}
                    </Button>
                    <Button variant="outline" className="w-full" onClick={() => setIsRegister(true)}>
                      {language === 'ar' ? 'مريض جديد؟ سجل الآن' : 'New patient? Register'}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Demo OTP banner */}
                    <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800 flex items-center gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>
                        {language === 'ar'
                          ? `رمزك التجريبي: ${mockOtpDisplay} (في الإنتاج يُرسل عبر SMS)`
                          : `Demo OTP: ${mockOtpDisplay} (production would send via SMS)`}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {language === 'ar' ? 'رمز التحقق (6 أرقام)' : '6-digit Verification Code'}
                      </Label>
                      <Input
                        value={otpInput}
                        onChange={e => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                        placeholder="123456"
                        dir="ltr"
                        maxLength={6}
                        className="text-center text-xl tracking-[0.4em] font-mono"
                      />
                    </div>
                    <Button className="w-full gap-2" onClick={handleVerifyOtp} disabled={otpInput.length !== 6}>
                      <ShieldCheck className="h-4 w-4" />
                      {language === 'ar' ? 'تحقق وادخل' : 'Verify & Login'}
                    </Button>
                    <Button variant="ghost" className="w-full text-xs" onClick={() => { setLoginStep('phone'); setOtpInput(''); }}>
                      {language === 'ar' ? '← تغيير رقم الهاتف' : '← Change phone number'}
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t('profile.fullName')}</Label>
                    <Input value={regData.name} onChange={e => setRegData(d => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('profile.fullNameAr')}</Label>
                    <Input dir="rtl" value={regData.nameAr} onChange={e => setRegData(d => ({ ...d, nameAr: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t('patients.phone')}</Label>
                  <Input dir="ltr" value={regData.phone} onChange={e => setRegData(d => ({ ...d, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" dir="ltr" value={regData.email} onChange={e => setRegData(d => ({ ...d, email: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t('profile.birthDate')}</Label>
                    <Input type="date" value={regData.dateOfBirth} onChange={e => setRegData(d => ({ ...d, dateOfBirth: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('profile.gender')}</Label>
                    <Select value={regData.gender} onValueChange={(v: any) => setRegData(d => ({ ...d, gender: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{t('patients.male')}</SelectItem>
                        <SelectItem value="female">{t('patients.female')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{language === 'ar' ? 'العيادة' : 'Clinic'}</Label>
                  <Select value={regData.clinicId} onValueChange={v => setRegData(d => ({ ...d, clinicId: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {clinics.map(c => (
                        <SelectItem key={c.id} value={c.id}>{language === 'ar' ? c.nameAr : c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{language === 'ar' ? 'رمز الإحالة (اختياري)' : 'Referral Code (optional)'}</Label>
                  <Input
                    dir="ltr"
                    value={regData.referredBy}
                    onChange={e => setRegData(d => ({ ...d, referredBy: e.target.value.toUpperCase() }))}
                    placeholder="PAT-1234"
                  />
                </div>
                <Button className="w-full" onClick={handleRegister}>
                  {language === 'ar' ? 'تسجيل' : 'Register'}
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setIsRegister(false)}>
                  {language === 'ar' ? 'لديك حساب؟ سجل الدخول' : 'Already registered? Login'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PatientLogin;
