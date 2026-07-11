import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSpecialties } from '@/hooks/useSpecialties';
import { usePatients } from '@/hooks/usePatients';
import { useSchedule } from '@/hooks/useSchedule';
import { useVisits } from '@/hooks/useVisits';
import { visitTypeStore } from '@/stores/visitTypeStore';
import { visitStore } from '@/stores/visitStore';
import { trackActivity } from '@/stores/doctorFollowUpStore';
import { AuthUser } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckCircle2, Stethoscope, Calendar, UserPlus,
  PartyPopper, ArrowRight, Loader2, Clock,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Onboarding state helpers ──────────────────────────────────────────────────

const OB_KEY = (id: string) => `cf_ob_${id}`;

export function isDoctorOnboardingPending(userId: string): boolean {
  try { return localStorage.getItem(OB_KEY(userId)) !== 'done'; } catch { return false; }
}

export function markDoctorOnboardingDone(userId: string): void {
  try { localStorage.setItem(OB_KEY(userId), 'done'); } catch { /* storage unavailable */ }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS = [
  { ar: 'أحد', en: 'Sun' },
  { ar: 'اثنين', en: 'Mon' },
  { ar: 'ثلاثاء', en: 'Tue' },
  { ar: 'أربعاء', en: 'Wed' },
  { ar: 'خميس', en: 'Thu' },
  { ar: 'جمعة', en: 'Fri' },
  { ar: 'سبت', en: 'Sat' },
];

const DURATIONS = [5, 10, 15, 20, 30];

type StepId = 'welcome' | 'setup' | 'schedule' | 'action' | 'success';
const STEPS: StepId[] = ['welcome', 'setup', 'schedule', 'action', 'success'];

// ── Component ─────────────────────────────────────────────────────────────────

interface DoctorOnboardingProps {
  user: AuthUser;
  onClose: () => void;
}

const DoctorOnboarding: React.FC<DoctorOnboardingProps> = ({ user, onClose }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const navigate = useNavigate();

  const { specialties } = useSpecialties();
  const { addPatient } = usePatients();
  const { addSchedule } = useSchedule();
  const { createVisitWithInvoice, addToQueue } = useVisits();

  const [stepIdx, setStepIdx]         = useState(0);
  const [specialtyId, setSpecialtyId] = useState(user.specialtyId ?? '');
  const [workingDays, setWorkingDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [visitDuration, setVisitDuration] = useState(15);
  const [busy, setBusy]               = useState(false);

  const step  = STEPS[stepIdx];
  const today = new Date().toISOString().split('T')[0];
  const now   = new Date();
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const toggleDay = (d: number) => {
    setWorkingDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const skip = () => {
    markDoctorOnboardingDone(user.id);
    onClose();
  };

  const next = () => setStepIdx(i => Math.min(i + 1, STEPS.length - 1));

  const handleCreateSchedule = async () => {
    if (!workingDays.length) { next(); return; }
    setBusy(true);
    try {
      await Promise.all(
        workingDays.map(day =>
          addSchedule({
            doctorId:            user.id,
            dayOfWeek:           day,
            startTime:           '09:00',
            endTime:             '17:00',
            isActive:            true,
            slotDurationMinutes: visitDuration,
          } as any)
        )
      );
      toast.success(isAr ? 'تم إنشاء الجدول بنجاح ✓' : 'Schedule created ✓');
    } catch {
      // proceed even if schedule creation fails
    } finally {
      setBusy(false);
      next();
    }
  };

  const handleCreateDemoPatient = async () => {
    setBusy(true);
    try {
      // 1. Create demo patient
      const phone = `010${Date.now().toString().slice(-8)}`.slice(0, 11);
      const patient = await addPatient({
        name:        'Demo Patient',
        nameAr:      'مريض تجريبي',
        phone,
        dateOfBirth: '1990-01-01',
        gender:      'male',
        clinicId:    user.clinicId,
      } as any);

      const patientId = (patient as any)?.id;
      if (!patientId) { next(); return; }

      // 2. Get a visit type if available
      const vtId = visitTypeStore.getAll()[0]?.id;

      // 3. Create visit (with API fallback to local store)
      let visitId = '';
      try {
        const result = await createVisitWithInvoice({
          patientId,
          doctorId:   user.id,
          specialtyId: specialtyId || user.specialtyId,
          visitTypeId: vtId,
          date:        today,
          time:        nowTime,
          clinicId:    user.clinicId,
          notes:       isAr ? 'مريض تجريبي من الإعداد الأولي' : 'Demo patient from onboarding',
        });
        visitId = (result as any)?.visit?.id ?? '';
      } catch {
        // Local fallback when API is unavailable
        const vid = `v-ob-${Date.now()}`;
        visitStore.add({
          id:          vid,
          patientId,
          doctorId:    user.id,
          clinicId:    user.clinicId,
          specialtyId: specialtyId || user.specialtyId || '',
          date:        today,
          time:        nowTime,
          status:      'checked_in',
          isUrgent:    false,
          isHomeVisit: false,
          createdAt:   new Date().toISOString(),
        } as any);
        visitId = vid;
      }

      // 4. Add to queue
      if (visitId) {
        try { await addToQueue(visitId); } catch { /* queue error ignored */ }
        sessionStorage.setItem('cf_ob_highlight', visitId);
      }

      trackActivity(user.id, 'has_created_patient');
      toast.success(isAr ? 'تم إنشاء المريض التجريبي وإضافته للطابور 🎉' : 'Demo patient added to queue 🎉');
    } catch {
      toast.error(isAr ? 'حدث خطأ، يمكنك المتابعة' : 'Error, but you can continue');
    } finally {
      setBusy(false);
      next();
    }
  };

  const handleFinish = () => {
    markDoctorOnboardingDone(user.id);
    onClose();
    navigate('/queue');
  };

  const progressPct = ((stepIdx + 1) / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="overlay-doctor-onboarding">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-muted w-full">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="p-6 space-y-5">
          {/* Step dots */}
          <div className="flex justify-center gap-2">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`rounded-full transition-all duration-300 ${
                  i === stepIdx ? 'w-6 h-2 bg-primary' :
                  i < stepIdx  ? 'w-2 h-2 bg-primary/40' :
                                 'w-2 h-2 bg-muted'
                }`}
              />
            ))}
          </div>

          {/* ── Step 1: Welcome ── */}
          {step === 'welcome' && (
            <div className="text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Stethoscope className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {isAr ? `أهلاً د. ${user.nameAr}! 👋` : `Welcome Dr. ${user.name}! 👋`}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isAr
                    ? 'دعنا نساعدك في إعداد عيادتك خلال دقيقتين'
                    : 'Let us help you set up your clinic in 2 minutes'}
                </p>
              </div>
              <div className="bg-muted/40 rounded-xl p-4 text-start space-y-2">
                {(isAr
                  ? ['إعداد التخصص وأوقات العمل', 'إنشاء جدولك الأسبوعي تلقائياً', 'إضافة أول مريض للطابور']
                  : ['Set your specialty & working hours', 'Auto-generate your weekly schedule', 'Add your first patient to the queue']
                ).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="ghost" size="sm"
                  className="text-muted-foreground"
                  onClick={skip}
                  data-testid="button-ob-skip"
                >
                  {isAr ? 'تخطي' : 'Skip'}
                </Button>
                <Button className="flex-1 gap-2" onClick={next} data-testid="button-ob-start">
                  {isAr ? 'ابدأ الإعداد' : 'Get Started'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Setup ── */}
          {step === 'setup' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">{isAr ? 'إعداد ملفك الطبي' : 'Your Medical Profile'}</h2>
                <p className="text-sm text-muted-foreground">
                  {isAr ? 'أخبرنا عن تخصصك وأوقات عملك' : 'Tell us your specialty and working hours'}
                </p>
              </div>

              {/* Specialty */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{isAr ? 'التخصص' : 'Specialty'}</label>
                <Select value={specialtyId} onValueChange={setSpecialtyId}>
                  <SelectTrigger data-testid="select-ob-specialty">
                    <SelectValue placeholder={isAr ? 'اختر التخصص' : 'Choose specialty'} />
                  </SelectTrigger>
                  <SelectContent>
                    {specialties.map(sp => (
                      <SelectItem key={sp.id} value={sp.id}>
                        {isAr ? sp.nameAr : sp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Working days */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{isAr ? 'أيام العمل' : 'Working Days'}</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAY_LABELS.map((d, i) => (
                    <button
                      key={i}
                      onClick={() => toggleDay(i)}
                      data-testid={`button-ob-day-${i}`}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        workingDays.includes(i)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {isAr ? d.ar : d.en}
                    </button>
                  ))}
                </div>
              </div>

              {/* Visit duration */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{isAr ? 'مدة الكشف' : 'Visit Duration'}</label>
                <div className="flex gap-2">
                  {DURATIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setVisitDuration(d)}
                      data-testid={`button-ob-duration-${d}`}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        visitDuration === d
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {d}{isAr ? 'د' : 'm'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={skip}>
                  {isAr ? 'تخطي' : 'Skip'}
                </Button>
                <Button className="flex-1" onClick={next} data-testid="button-ob-next-setup">
                  {isAr ? 'التالي' : 'Next'}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Schedule preview ── */}
          {step === 'schedule' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold">{isAr ? 'جدولك الأسبوعي' : 'Your Weekly Schedule'}</h2>
                <p className="text-sm text-muted-foreground">
                  {isAr
                    ? 'سنُنشئ جدولاً تلقائياً بناءً على اختياراتك'
                    : "We'll auto-generate a schedule based on your choices"}
                </p>
              </div>

              <div className="rounded-xl border overflow-hidden divide-y">
                {workingDays.length === 0 ? (
                  <p className="text-center py-5 text-sm text-muted-foreground">
                    {isAr ? 'لم تختر أيام عمل' : 'No working days selected'}
                  </p>
                ) : (
                  workingDays.map(d => (
                    <div key={d} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">
                          {isAr ? DAY_LABELS[d].ar : DAY_LABELS[d].en}
                        </span>
                      </div>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        09:00 — 17:00 · {visitDuration}{isAr ? 'د/كشف' : 'm/visit'}
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={skip}>
                  {isAr ? 'تخطي' : 'Skip'}
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleCreateSchedule}
                  disabled={busy}
                  data-testid="button-ob-create-schedule"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isAr ? 'إنشاء الجدول' : 'Create Schedule'}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Demo patient ── */}
          {step === 'action' && (
            <div className="space-y-5 text-center">
              <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto">
                <UserPlus className="h-8 w-8 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold">
                  {isAr ? 'جرّب أول مريض!' : 'Try your first patient!'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isAr
                    ? 'سننشئ مريضاً تجريبياً ونضيفه للطابور فوراً'
                    : "We'll create a demo patient and add them to the queue instantly"}
                </p>
              </div>
              <Button
                size="lg"
                className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleCreateDemoPatient}
                disabled={busy}
                data-testid="button-ob-create-demo-patient"
              >
                {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
                {isAr ? 'إنشاء مريض تجريبي' : 'Create Demo Patient'}
              </Button>
              <Button
                variant="ghost" size="sm"
                className="text-muted-foreground"
                onClick={next}
                disabled={busy}
              >
                {isAr ? 'تخطي هذه الخطوة' : 'Skip this step'}
              </Button>
            </div>
          )}

          {/* ── Step 5: Success ── */}
          {step === 'success' && (
            <div className="space-y-5 text-center">
              <div className="text-5xl leading-none">🎉</div>
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {isAr ? 'أول مريض دخل الطابور 👏' : 'First patient in the queue! 👏'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isAr
                    ? 'عيادتك جاهزة الآن لاستقبال المرضى'
                    : 'Your clinic is now ready to receive patients'}
                </p>
              </div>

              {/* WhatsApp CTA */}
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 text-start space-y-1">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <PartyPopper className="h-4 w-4 shrink-0" />
                  {isAr ? 'فعّل الحجز عبر WhatsApp' : 'Activate WhatsApp Booking'}
                </p>
                <p className="text-xs text-emerald-700/70 dark:text-emerald-400/70 ps-6">
                  {isAr
                    ? 'اسمح للمرضى بالحجز مباشرةً من واتساب وتقليل المكالمات'
                    : 'Let patients book directly from WhatsApp and reduce phone calls'}
                </p>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleFinish}
                data-testid="button-ob-go-to-queue"
              >
                {isAr ? 'انتقل إلى الطابور' : 'Go to Queue'}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorOnboarding;
