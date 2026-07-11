import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Home, MapPin, Navigation, Calendar, Clock, CheckCircle2,
  AlertCircle, Loader2, ChevronRight, User
} from 'lucide-react';
import {
  createHomeVisitRequest, buildDoctorQueue
} from '@/stores/homeVisitRequestStore';
import { EGYPT_GOVERNORATES, DEFAULT_GOVERNORATE_EN } from '@/lib/governorates';
import { userStore } from '@/stores/userStore';
import { specialtyStore } from '@/stores/specialtyStore';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  prefilledGov?: string;
}

// Next 14 days for day selection
function getNextDays(n = 14): { label: string; labelAr: string; value: string }[] {
  const days: { label: string; labelAr: string; value: string }[] = [];
  const DAY_NAMES_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const MONTH_AR = ['يناير','فبراير','مارس','إبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];
    const dow = d.getDay();
    const prefix = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAY_NAMES_EN[dow];
    const prefixAr = i === 0 ? 'اليوم' : i === 1 ? 'غداً' : DAY_NAMES_AR[dow];
    const labelEn = `${prefix}, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    const labelAr = `${prefixAr}, ${d.getDate()} ${MONTH_AR[d.getMonth()]}`;
    days.push({ label: labelEn, labelAr, value: iso });
  }
  return days;
}

const TIMES = [
  '08:00','09:00','10:00','11:00','12:00','13:00','14:00',
  '15:00','16:00','17:00','18:00','19:00','20:00','21:00',
];

const STEPS = ['details', 'confirm', 'done'] as const;
type Step = typeof STEPS[number];

const HomeVisitBookingDialog = ({ open, onClose, prefilledGov }: Props) => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';
  const days = getNextDays();

  const [step, setStep] = useState<Step>('details');
  const [governorate, setGovernorate] = useState(prefilledGov || DEFAULT_GOVERNORATE_EN);
  const [address, setAddress] = useState('');
  const [preferredDay, setPreferredDay] = useState(days[0]?.value || '');
  const [preferredTime, setPreferredTime] = useState('10:00');
  const [notes, setNotes] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Derived: eligible doctors count
  const eligibleQueue = governorate && preferredDay
    ? buildDoctorQueue(governorate, preferredDay, coords?.lat, coords?.lng)
    : [];

  const eligibleDoctors = eligibleQueue
    .map(id => userStore.get(u => u.id === id))
    .filter(Boolean) as NonNullable<ReturnType<typeof userStore.get>>[];

  const requestGps = () => {
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
        toast.success(isAr ? 'تم تحديد موقعك' : 'Location detected');
      },
      () => {
        setGpsLoading(false);
        toast.error(isAr ? 'تعذر تحديد الموقع' : 'Could not detect location');
      }
    );
  };

  const handleSubmit = () => {
    if (!governorate || !address || !preferredDay || !preferredTime) {
      toast.error(isAr ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
      return;
    }
    const gov = EGYPT_GOVERNORATES.find(g => g.en === governorate);
    createHomeVisitRequest({
      patientId: user?.id || 'guest',
      patientName: user?.name || 'Guest Patient',
      patientPhone: user?.phone,
      governorate,
      governorateAr: gov?.ar || governorate,
      address,
      latitude: coords?.lat,
      longitude: coords?.lng,
      preferredDay,
      preferredTime,
      notes: notes || undefined,
    });
    setStep('done');
  };

  const handleClose = () => {
    setStep('details');
    setGovernorate(prefilledGov || DEFAULT_GOVERNORATE_EN);
    setAddress('');
    setPreferredDay(days[0]?.value || '');
    setPreferredTime('10:00');
    setNotes('');
    setCoords(null);
    onClose();
  };

  const selectedDayLabel = days.find(d => d.value === preferredDay);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <Home className="h-5 w-5" />
            {isAr ? 'طلب زيارة منزلية' : 'Request Home Visit'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step: Details ─────────────────────────────── */}
        {step === 'details' && (
          <div className="space-y-4 pt-1">
            {/* Governorate */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {isAr ? 'المحافظة' : 'Governorate'} <span className="text-destructive">*</span>
              </Label>
              <Select value={governorate} onValueChange={setGovernorate}>
                <SelectTrigger data-testid="select-governorate">
                  <SelectValue placeholder={isAr ? 'اختر المحافظة' : 'Select governorate'} />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {EGYPT_GOVERNORATES.map(g => (
                    <SelectItem key={g.en} value={g.en}>
                      {isAr ? g.ar : g.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Address + GPS */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {isAr ? 'العنوان بالتفصيل' : 'Full Address'} <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder={isAr ? 'الشارع، الحي، المبنى...' : 'Street, area, building...'}
                  className="flex-1"
                  data-testid="input-hv-address"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={requestGps}
                  disabled={gpsLoading}
                  title={isAr ? 'تحديد الموقع تلقائياً' : 'Auto-detect location'}
                  data-testid="btn-gps"
                >
                  {gpsLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Navigation className={`h-4 w-4 ${coords ? 'text-emerald-600' : ''}`} />
                  }
                </Button>
              </div>
              {coords && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {isAr ? 'تم تحديد موقعك بنجاح' : 'GPS location captured'}
                </p>
              )}
            </div>

            {/* Preferred Day */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {isAr ? 'اليوم المفضل' : 'Preferred Day'} <span className="text-destructive">*</span>
              </Label>
              <Select value={preferredDay} onValueChange={setPreferredDay}>
                <SelectTrigger data-testid="select-preferred-day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {days.map(d => (
                    <SelectItem key={d.value} value={d.value}>
                      {isAr ? d.labelAr : d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preferred Time */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {isAr ? 'الوقت المفضل' : 'Preferred Time'} <span className="text-destructive">*</span>
              </Label>
              <Select value={preferredTime} onValueChange={setPreferredTime}>
                <SelectTrigger data-testid="select-preferred-time">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {TIMES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                {isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
              </Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={isAr ? 'اذكر الأعراض أو أي معلومات مفيدة للطبيب...' : 'Describe symptoms or any useful info...'}
                rows={2}
                data-testid="input-hv-notes"
              />
            </div>

            {/* Eligible doctors preview */}
            {governorate && preferredDay && (
              <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${
                eligibleDoctors.length > 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                  : 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
              }`}>
                {eligibleDoctors.length > 0
                  ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                }
                <span>
                  {eligibleDoctors.length > 0
                    ? isAr
                      ? `${eligibleDoctors.length} طبيب متاح للزيارة المنزلية في ${EGYPT_GOVERNORATES.find(g => g.en === governorate)?.ar || governorate}`
                      : `${eligibleDoctors.length} doctor${eligibleDoctors.length > 1 ? 's' : ''} available for home visits in ${governorate}`
                    : isAr
                      ? 'لا يوجد أطباء متاحون للزيارة المنزلية في هذا اليوم والمنطقة'
                      : 'No doctors available for home visits in this area on that day'
                  }
                </span>
              </div>
            )}

            <Button
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => {
                if (!governorate || !address || !preferredDay || !preferredTime) {
                  toast.error(isAr ? 'يرجى ملء جميع الحقول المطلوبة' : 'Please fill all required fields');
                  return;
                }
                setStep('confirm');
              }}
              data-testid="btn-hv-next"
            >
              {isAr ? 'متابعة' : 'Continue'}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* ── Step: Confirm ─────────────────────────────── */}
        {step === 'confirm' && (
          <div className="space-y-4 pt-1">
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-4 space-y-3">
              <h3 className="font-semibold text-sm text-foreground">
                {isAr ? 'تأكيد تفاصيل الزيارة المنزلية' : 'Confirm Home Visit Details'}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{EGYPT_GOVERNORATES.find(g => g.en === governorate)?.[isAr ? 'ar' : 'en'] || governorate}</p>
                    <p className="text-muted-foreground text-xs">{address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{isAr ? selectedDayLabel?.labelAr : selectedDayLabel?.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>{preferredTime}</span>
                </div>
                {notes && (
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground">{notes}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Doctor queue preview */}
            {eligibleDoctors.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {isAr ? 'قائمة الأطباء (سيتم الإرسال بالترتيب)' : 'Doctor Queue (will dispatch in order)'}
                </p>
                {eligibleDoctors.slice(0, 3).map((doc, i) => {
                  const spec = specialtyStore.get(s => s.id === doc.specialtyId);
                  return (
                    <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{isAr ? doc.nameAr : doc.name}</p>
                        <p className="text-xs text-muted-foreground">{spec?.name}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-800 border-0">
                        {doc.homeVisitPrice} ج.م
                      </Badge>
                    </div>
                  );
                })}
                {eligibleDoctors.length > 3 && (
                  <p className="text-xs text-muted-foreground text-center">
                    {isAr ? `+${eligibleDoctors.length - 3} أطباء إضافيون` : `+${eligibleDoctors.length - 3} more doctors in queue`}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep('details')}>
                {isAr ? 'رجوع' : 'Back'}
              </Button>
              <Button
                className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleSubmit}
                data-testid="btn-hv-confirm"
              >
                <Home className="h-4 w-4" />
                {isAr ? 'تأكيد الطلب' : 'Confirm Request'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step: Done ────────────────────────────────── */}
        {step === 'done' && (
          <div className="pt-2 pb-4 flex flex-col items-center text-center gap-4">
            <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                {isAr ? 'تم إرسال طلبك بنجاح!' : 'Request Submitted!'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-xs">
                {isAr
                  ? 'جاري إرسال طلبك إلى أقرب طبيب متاح. ستتلقى تأكيداً قريباً.'
                  : 'Your request is being dispatched to the nearest available doctor. You will be notified soon.'
                }
              </p>
            </div>
            {eligibleDoctors.length > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/60 text-sm w-full justify-center">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {isAr
                    ? `يتم الاتصال بـ ${isAr ? eligibleDoctors[0]?.nameAr : eligibleDoctors[0]?.name} الآن`
                    : `Contacting ${eligibleDoctors[0]?.name} now...`
                  }
                </span>
              </div>
            )}
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleClose}>
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default HomeVisitBookingDialog;
