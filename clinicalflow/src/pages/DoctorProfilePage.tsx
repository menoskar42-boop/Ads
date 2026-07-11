import React, { useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { userStore } from '@/stores/userStore';
import { specialtyStore } from '@/stores/specialtyStore';
import { clinicStore } from '@/stores/clinicStore';
import { getDoctorProfile, upsertDoctorProfile } from '@/stores/doctorProfileStore';
import { getAverageRating, getRatingsForTarget, addRating, hasPatientRated } from '@/stores/ratingStore';
import { getAvailableSlots } from '@/stores/scheduleStore';
import { doctorClinicStore } from '@/stores/doctorClinicStore';
import { getDoctorHomeVisitSchedules } from '@/stores/homeVisitScheduleStore';
import {
  DoctorProfile, DoctorPostgrad, DoctorCertification, DoctorConference,
  DoctorPosition, DoctorAchievement
} from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  User, Star, MapPin, Phone, Clock, Calendar, GraduationCap, Award,
  Briefcase, BookOpen, MessageCircle, Edit, Plus, Trash2, Check, X,
  ChevronRight, Building2, Stethoscope, Bot, Send, ArrowLeft, Settings2,
  QrCode, Copy, Globe, Linkedin, Camera, Home, Navigation, Timer
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SiFacebook, SiInstagram, SiYoutube, SiTiktok, SiX } from 'react-icons/si';
import BookingWizard from '@/components/BookingWizard';
import AIBookingAssistant from '@/components/AIBookingAssistant';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getNextAvailableSlots(doctorId: string, maxDays = 7, maxTotal = 6): { date: string; time: string; label: string }[] {
  const result: { date: string; time: string; label: string }[] = [];
  const today = new Date();
  for (let i = 0; i < maxDays && result.length < maxTotal; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const slots = getAvailableSlots(doctorId, dateStr);
    for (const slot of slots) {
      if (result.length >= maxTotal) break;
      let label = '';
      if (i === 0) label = 'Today';
      else if (i === 1) label = 'Tomorrow';
      else label = DAYS[d.getDay()];
      result.push({ date: dateStr, time: slot, label });
    }
  }
  return result;
}

function StarRating({ value, onChange, readOnly = false }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          type="button"
          disabled={readOnly}
          className={`${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
          onClick={() => !readOnly && onChange?.(s)}
          onMouseEnter={() => !readOnly && setHover(s)}
          onMouseLeave={() => !readOnly && setHover(0)}
        >
          <Star
            className={`h-4 w-4 ${(hover || value) >= s ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
          />
        </button>
      ))}
    </div>
  );
}

function AISuitabilityChat({ doctorName, doctorSpecialty, isRTL }: { doctorName: string; doctorSpecialty: string; isRTL: boolean }) {
  const [open, setOpen] = useState(false);
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; isMatch: boolean } | null>(null);

  const handleCheck = async () => {
    if (!symptoms.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/doctor-suitability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms, doctorName, doctorSpecialty }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        setResult({ message: data.message || (isRTL ? 'لا يمكن التقييم.' : 'Unable to evaluate.'), isMatch: !!data.isMatch });
        return;
      }
      throw new Error('non-json');
    } catch {
      // Client-side fallback using keyword matching
      const lower = symptoms.toLowerCase();
      const SPEC_KW: Record<string, string[]> = {
        'Dentistry':        ['أسنان','سن','ضرس','اسنان','dentist','dental','teeth','tooth','ألم أسنان'],
        'Dermatology':      ['جلدية','جلد','بشرة','حبوب','طفح','derma','skin','rash','حكة'],
        'Cardiology':       ['قلب','صدر','cardio','heart','chest','نبض','ضغط الدم','ضغط'],
        'Orthopedics':      ['عظام','مفاصل','ظهر','عظم','ortho','bone','joint','back','ركبة','كسر'],
        'Ophthalmology':    ['عيون','عين','نظر','eye','vision','ophthal','بصر'],
        'ENT':              ['أنف','أذن','حنجرة','انف','اذن','ear','nose','throat','ent','لوز'],
        'Neurology':        ['أعصاب','صداع','اعصاب','neuro','headache','migraine','دوخة','شلل'],
        'Gastroenterology': ['معدة','هضمي','بطن','أمعاء','امعاء','gastro','stomach','digest','اسهال','قولون'],
        'General Medicine': ['عام','باطنة','حرارة','برد','انفلونزا','general','fever','cold','flu','كحة','سعال'],
        'Pediatrics':       ['أطفال','اطفال','طفل','pediatr','child','kid','رضيع'],
        'Urology':          ['مسالك','بول','كلى','urol','urinary','kidney','بروستاتا'],
        'Gynecology':       ['نساء','نسا','توليد','gyn','obstet','women','حمل','دورة'],
        'Psychiatry':       ['نفسي','نفسية','اكتئاب','قلق','psych','mental','depression','anxiety'],
        'Pulmonology':      ['رئة','رئتين','تنفس','ربو','pulmon','lung','breath','asthma'],
        'Endocrinology':    ['سكر','غدة','هرمون','diabete','thyroid','endocrin','سكري'],
      };
      let detected: string | null = null;
      for (const [spec, kws] of Object.entries(SPEC_KW)) {
        if (kws.some(kw => lower.includes(kw))) { detected = spec; break; }
      }
      const docLower = doctorSpecialty.toLowerCase();
      const isMatch = !detected
        ? true
        : detected.toLowerCase() === docLower ||
          docLower.includes(detected.toLowerCase()) ||
          detected.toLowerCase().includes(docLower.split(' ')[0]);
      if (isMatch) {
        setResult({
          isMatch: true,
          message: isRTL
            ? `بناءً على الأعراض المذكورة، يبدو أن ${doctorName} مناسب لحالتك. يُنصح بحجز موعد.`
            : `Based on your symptoms, ${doctorName} appears suitable for your condition. Booking an appointment is recommended.`,
        });
      } else {
        setResult({
          isMatch: false,
          message: isRTL
            ? `الأعراض المذكورة قد تشير إلى تخصص ${detected}. يمكنك استشارة ${doctorName} ليقيّم حالتك.`
            : `Your symptoms may indicate a ${detected} issue. You can still consult ${doctorName} to evaluate your condition.`,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)} data-testid="btn-ai-suitability">
        <Bot className="h-4 w-4 text-primary" />
        {isRTL ? 'هل هذا الطبيب مناسب لحالتي؟' : 'Is this doctor right for me?'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              {isRTL ? 'مساعد الملاءمة الطبية' : 'Medical Suitability Assistant'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isRTL
                ? `أخبرنا عن أعراضك وسنخبرك إذا كان ${doctorName} مناسبًا لحالتك.`
                : `Describe your symptoms and we'll let you know if ${doctorName} is suitable for your condition.`}
            </p>
            <div className="space-y-2">
              <Label>{isRTL ? 'الأعراض' : 'Your symptoms'}</Label>
              <Textarea
                placeholder={isRTL ? 'مثال: ألم في الصدر، ضيق في التنفس...' : 'e.g. chest pain, shortness of breath...'}
                value={symptoms}
                onChange={e => setSymptoms(e.target.value)}
                rows={3}
                data-testid="input-symptoms"
              />
            </div>
            {result && (
              <div className={`rounded-lg p-4 border ${result.isMatch ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'}`}>
                <div className="flex items-start gap-2">
                  {result.isMatch
                    ? <Check className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                    : <X className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />}
                  <p className="text-sm">{result.message}</p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {isRTL
                ? 'ملاحظة: هذا ليس تشخيصًا طبيًا. استشر الطبيب دائمًا.'
                : 'Note: This is not a medical diagnosis. Always consult a doctor.'}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{isRTL ? 'إغلاق' : 'Close'}</Button>
            <Button onClick={handleCheck} disabled={loading || !symptoms.trim()} className="gap-2" data-testid="btn-check-suitability">
              {loading ? <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" /> : <Send className="h-4 w-4" />}
              {isRTL ? 'تحقق' : 'Check'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const emptyProfile = (doctorId: string): DoctorProfile => ({
  id: doctorId, bio: '', bioAr: '', photoUrl: undefined,
  graduationYear: undefined, graduationUniversity: '', graduationUniversityAr: '',
  postgrad: [], certifications: [], conferences: [], positions: [], achievements: [],
  additionalInfo: '', additionalInfoAr: '', allowAdminEdit: false, allowReceptionEdit: false,
});

export default function DoctorProfilePage() {
  const { doctorId } = useParams<{ doctorId: string }>();
  const { language, setLanguage, isRTL } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isAr = language === 'ar';

  const doctor = useMemo(() => doctorId ? userStore.get(u => u.id === doctorId && u.role === 'doctor') : undefined, [doctorId]);
  const specialty = useMemo(() => doctor?.specialtyId ? specialtyStore.get(s => s.id === doctor.specialtyId) : undefined, [doctor]);
  const clinicLinks = useMemo(() => doctorId ? doctorClinicStore.filter(l => l.doctorId === doctorId && l.isActive) : [], [doctorId]);
  const clinics = useMemo(() => clinicLinks.map(l => clinicStore.get(c => c.id === l.clinicId)).filter(Boolean), [clinicLinks]);

  // ── Booking availability logic ─────────────────────────────────────────────
  // A doctor can be booked ONLY if they have at least one active clinic link
  // OR they have home visits enabled.
  // An independent doctor with neither = showcase profile only (no booking).
  const hasClinicLink     = clinicLinks.length > 0;
  const hasHomeVisit      = !!(doctor?.homeVisitEnabled);
  const canBook           = hasClinicLink || hasHomeVisit;
  const canBookClinic     = hasClinicLink;
  const canBookHomeVisit  = hasHomeVisit;

  const [profile, setProfile] = useState<DoctorProfile>(() => getDoctorProfile(doctorId || '') || emptyProfile(doctorId || ''));
  const [editOpen, setEditOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<DoctorProfile>(profile);

  const { avg: docRating, count: ratingCount } = getAverageRating(doctorId || '', 'doctor');
  const reviews = getRatingsForTarget(doctorId || '', 'doctor');
  const availableSlots = useMemo(() => getNextAvailableSlots(doctorId || ''), [doctorId]);

  const canEdit = user && (
    (user.role === 'doctor' && user.id === doctorId) ||
    (user.role === 'admin' && profile.allowAdminEdit && user.clinicId === doctor?.clinicId) ||
    (user.role === 'reception' && profile.allowReceptionEdit && user.clinicId === doctor?.clinicId)
  );

  const [ratingOpen, setRatingOpen] = useState(false);
  const [newStars, setNewStars] = useState(5);
  const [newComment, setNewComment] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const patientAlreadyRated = user?.role === 'patient' && doctorId ? hasPatientRated(user.id, doctorId, 'doctor') : false;
  const profileUrl = `${window.location.origin}/doctor/${doctorId}`;

  if (!doctor) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Stethoscope className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">{isAr ? 'الطبيب غير موجود' : 'Doctor not found'}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />{isAr ? 'رجوع' : 'Go Back'}
          </Button>
        </div>
      </div>
    );
  }

  const handleSave = () => {
    upsertDoctorProfile(editProfile);
    setProfile(editProfile);
    setEditOpen(false);
    toast({ title: isAr ? 'تم حفظ الملف الشخصي' : 'Profile saved successfully' });
  };

  const handleSubmitRating = () => {
    if (!user?.id || !doctorId) return;
    addRating({ targetId: doctorId, targetType: 'doctor', patientId: user.id, stars: newStars, comment: newComment });
    setRatingOpen(false);
    setNewComment('');
    toast({ title: isAr ? 'شكرًا على تقييمك' : 'Thank you for your review!' });
  };

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className={`h-4 w-4 ${isRTL ? 'rotate-180' : ''}`} />
            {isAr ? 'رجوع' : 'Back'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} data-testid="button-toggle-language">
            {language === 'en' ? 'AR' : 'EN'}
          </Button>
        </div>

        <Card className="overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-primary/20 to-primary/5" />
          <CardContent className="pt-0 pb-6 px-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start -mt-10">
              <div className="h-20 w-20 rounded-2xl bg-primary/10 border-4 border-background flex items-center justify-center shrink-0">
                {profile.photoUrl ? (
                  <img src={profile.photoUrl} alt={doctor.name} className="h-full w-full rounded-xl object-cover" />
                ) : (
                  <User className="h-10 w-10 text-primary" />
                )}
              </div>
              <div className="flex-1 pt-2 sm:pt-6 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h1 className="text-2xl font-bold">{isAr ? doctor.nameAr : doctor.name}</h1>
                    <p className="text-primary font-medium">{isAr ? (specialty?.nameAr || specialty?.name) : specialty?.name}</p>
                  </div>
                  {canEdit && (
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => { setEditProfile(profile); setEditOpen(true); }} data-testid="btn-edit-profile">
                      <Edit className="h-4 w-4" />{isAr ? 'تعديل الملف الشخصي' : 'Edit Profile'}
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 items-center">
                  {docRating > 0 && (
                    <div className="flex items-center gap-1.5">
                      <StarRating value={Math.round(docRating)} readOnly />
                      <span className="text-sm font-medium">{docRating}</span>
                      <span className="text-sm text-muted-foreground">({ratingCount})</span>
                    </div>
                  )}
                  {profile.graduationYear && (
                    <Badge variant="secondary" className="gap-1">
                      <GraduationCap className="h-3 w-3" />
                      {isAr ? `تخرج ${profile.graduationYear}` : `Class of ${profile.graduationYear}`}
                    </Badge>
                  )}
                  {doctor.homeVisitEnabled && (
                    <Badge variant="outline" className="gap-1 text-green-700 border-green-300 dark:text-green-400">
                      <MapPin className="h-3 w-3" />
                      {isAr ? 'زيارة منزلية متاحة' : 'Home Visit Available'}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {clinics.map(c => c && (
                    <Badge key={c.id} variant="outline" className="gap-1 text-xs">
                      <Building2 className="h-3 w-3" />
                      {isAr ? c.nameAr : c.name}
                    </Badge>
                  ))}
                </div>

                {profile.bio && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{isAr ? profile.bioAr : profile.bio}</p>
                )}

                {profile.socialLinks && Object.values(profile.socialLinks).some(Boolean) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {profile.socialLinks.facebook && (
                      <a href={profile.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 transition-colors" data-testid="social-facebook" title="Facebook">
                        <SiFacebook className="h-5 w-5" />
                      </a>
                    )}
                    {profile.socialLinks.instagram && (
                      <a href={profile.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:text-pink-600 transition-colors" data-testid="social-instagram" title="Instagram">
                        <SiInstagram className="h-5 w-5" />
                      </a>
                    )}
                    {profile.socialLinks.linkedin && (
                      <a href={profile.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:text-blue-800 transition-colors" data-testid="social-linkedin" title="LinkedIn">
                        <Linkedin className="h-5 w-5" />
                      </a>
                    )}
                    {profile.socialLinks.youtube && (
                      <a href={profile.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:text-red-700 transition-colors" data-testid="social-youtube" title="YouTube">
                        <SiYoutube className="h-5 w-5" />
                      </a>
                    )}
                    {profile.socialLinks.tiktok && (
                      <a href={profile.socialLinks.tiktok} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-muted-foreground transition-colors" data-testid="social-tiktok" title="TikTok">
                        <SiTiktok className="h-5 w-5" />
                      </a>
                    )}
                    {profile.socialLinks.twitter && (
                      <a href={profile.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-muted-foreground transition-colors" data-testid="social-twitter" title="X / Twitter">
                        <SiX className="h-5 w-5" />
                      </a>
                    )}
                    {profile.socialLinks.website && (
                      <a href={profile.socialLinks.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors" data-testid="social-website" title="Website">
                        <Globe className="h-5 w-5" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {/* Book Appointment — only shown when doctor has clinic links */}
              {canBookClinic && (
                <Button className="gap-2" onClick={() => {
                  if (user?.role === 'patient') setBookingOpen(true);
                  else navigate(`/login?returnDoctor=${doctorId}`);
                }} data-testid="btn-book-appointment">
                  <Calendar className="h-4 w-4" />
                  {isAr ? 'احجز موعدًا' : 'Book Appointment'}
                </Button>
              )}

              {/* No booking available — show info badge */}
              {!canBook && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/60 border border-border text-sm text-muted-foreground">
                  <Stethoscope className="h-4 w-4 shrink-0" />
                  {isAr ? 'الحجز غير متاح حالياً — للتواصل مباشرة' : 'Booking not available — contact directly'}
                </div>
              )}

              <AISuitabilityChat
                doctorName={isAr ? doctor.nameAr : doctor.name}
                doctorSpecialty={specialty?.name || ''}
                isRTL={isRTL}
              />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setQrOpen(true)} data-testid="btn-show-qr">
                <QrCode className="h-4 w-4" />
                {isAr ? 'رمز QR' : 'QR Code'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {canBookClinic && availableSlots.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-5 w-5 text-primary" />
                {isAr ? 'أقرب المواعيد المتاحة' : 'Nearest Available Appointments'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {availableSlots.map((slot, i) => (
                  <button
                    key={i}
                    data-testid={`slot-card-${i}`}
                    onClick={() => {
                      if (user?.role === 'patient') setBookingOpen(true);
                      else navigate(`/login?returnDoctor=${doctorId}`);
                    }}
                    className="flex flex-col items-center p-3 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition-all text-center"
                  >
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{slot.label}</span>
                    <span className="text-lg font-semibold mt-0.5">{slot.time}</span>
                    <span className="text-xs text-primary mt-1">{isAr ? 'احجز' : 'Book'}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {doctor.homeVisitEnabled && (() => {
          const hvSchedules = getDoctorHomeVisitSchedules(doctorId).filter(s => s.isActive);
          const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
          const dayLabels = isAr ? DAYS_AR : DAYS_EN;
          return (
            <Card className="border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-emerald-800 dark:text-emerald-300">
                  <Home className="h-5 w-5" />
                  {isAr ? 'الزيارة المنزلية' : 'Home Visit Available'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <Timer className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{isAr ? 'المدة' : 'Duration'}</p>
                      <p className="text-sm font-semibold text-foreground">
                        {doctor.homeVisitDurationMinutes || 45} {isAr ? 'دقيقة' : 'min'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <Navigation className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{isAr ? 'نطاق التغطية' : 'Radius'}</p>
                      <p className="text-sm font-semibold text-foreground">
                        {doctor.homeVisitRadiusKm || 10} {isAr ? 'كم' : 'km'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">ج.م</span>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">{isAr ? 'رسوم الزيارة' : 'Visit Fee'}</p>
                      <p className="text-sm font-semibold text-foreground">
                        {doctor.homeVisitPrice || 0} {isAr ? 'ج.م' : 'ج.م'}
                      </p>
                    </div>
                  </div>
                </div>

                {hvSchedules.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      {isAr ? 'أيام الزيارة المنزلية' : 'Home Visit Days'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {hvSchedules
                        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                        .map(s => (
                          <div key={s.id} className="flex flex-col items-center px-3 py-2 rounded-lg bg-card border border-emerald-200 dark:border-emerald-800 text-center min-w-[80px]">
                            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                              {dayLabels[s.dayOfWeek]}
                            </span>
                            <span className="text-xs text-muted-foreground mt-0.5">
                              {s.startTime} – {s.endTime}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {doctor.homeVisitAreas && doctor.homeVisitAreas.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {isAr ? 'مناطق التغطية' : 'Coverage Areas'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {doctor.homeVisitAreas.map(area => (
                        <Badge key={area} variant="secondary" className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-0">
                          {area}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {canBookHomeVisit ? (
                  <Button
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => {
                      if (user?.role === 'patient') navigate(`/patient/book?doctor=${doctorId}`);
                      else navigate(`/login?returnDoctor=${doctorId}`);
                    }}
                    data-testid="btn-book-home-visit"
                  >
                    <Home className="h-4 w-4" />
                    {isAr ? 'احجز زيارة منزلية' : 'Book Home Visit'}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    {isAr ? 'الزيارات المنزلية غير متاحة حالياً' : 'Home visits not available yet'}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })()}

        <Tabs defaultValue="education">
          <TabsList className="w-full flex-wrap h-auto gap-1">
            <TabsTrigger value="education" className="gap-1.5"><GraduationCap className="h-3.5 w-3.5" />{isAr ? 'التعليم' : 'Education'}</TabsTrigger>
            <TabsTrigger value="certifications" className="gap-1.5"><Award className="h-3.5 w-3.5" />{isAr ? 'الشهادات' : 'Certifications'}</TabsTrigger>
            <TabsTrigger value="experience" className="gap-1.5"><Briefcase className="h-3.5 w-3.5" />{isAr ? 'الخبرة' : 'Experience'}</TabsTrigger>
            <TabsTrigger value="reviews" className="gap-1.5"><Star className="h-3.5 w-3.5" />{isAr ? 'التقييمات' : 'Reviews'} {ratingCount > 0 && `(${ratingCount})`}</TabsTrigger>
          </TabsList>

          <TabsContent value="education" className="space-y-4 mt-4">
            {(profile.graduationUniversity || profile.graduationYear) && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{isAr ? 'التخرج' : 'Graduation'}</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {profile.graduationUniversity && <p className="font-medium">{isAr ? profile.graduationUniversityAr || profile.graduationUniversity : profile.graduationUniversity}</p>}
                  {profile.graduationYear && <p className="text-sm text-muted-foreground">{isAr ? `سنة التخرج: ${profile.graduationYear}` : `Graduation Year: ${profile.graduationYear}`}</p>}
                </CardContent>
              </Card>
            )}
            {profile.postgrad.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{isAr ? 'الدراسات العليا' : 'Postgraduate Studies'}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {profile.postgrad.map(pg => (
                    <div key={pg.id} className="flex items-start gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                      <div>
                        <p className="font-medium">{pg.degree}</p>
                        <p className="text-sm text-muted-foreground">{pg.institution} — {pg.year}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {profile.postgrad.length === 0 && !profile.graduationUniversity && (
              <div className="text-center py-8 text-muted-foreground">
                <GraduationCap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{isAr ? 'لا توجد بيانات تعليمية' : 'No education data yet'}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="certifications" className="space-y-4 mt-4">
            {profile.certifications.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{isAr ? 'الشهادات المهنية' : 'Professional Certifications'}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {profile.certifications.map(c => (
                    <div key={c.id} className="flex items-start gap-3">
                      <Award className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-sm text-muted-foreground">{c.issuer} — {c.year}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {profile.conferences.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{isAr ? 'المؤتمرات الطبية' : 'Medical Conferences'}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {profile.conferences.map(c => (
                    <div key={c.id} className="flex items-start gap-3">
                      <BookOpen className="h-4 w-4 text-chart-1 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-sm text-muted-foreground">{c.location} — {c.year}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {profile.certifications.length === 0 && profile.conferences.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{isAr ? 'لا توجد شهادات بعد' : 'No certifications yet'}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="experience" className="space-y-4 mt-4">
            {profile.positions.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{isAr ? 'المناصب المهنية' : 'Professional Positions'}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {profile.positions.map(p => (
                    <div key={p.id} className="flex items-start gap-3">
                      <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${p.isCurrent ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                      <div>
                        <p className="font-medium">{p.title}</p>
                        <p className="text-sm text-muted-foreground">{p.institution}</p>
                        <p className="text-xs text-muted-foreground">{p.fromYear} — {p.isCurrent ? (isAr ? 'حتى الآن' : 'Present') : p.toYear}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {profile.achievements.length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{isAr ? 'الإنجازات الطبية' : 'Notable Achievements'}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {profile.achievements.map(a => (
                    <div key={a.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-yellow-500" />
                        <p className="font-medium">{a.title}</p>
                        <Badge variant="secondary" className="text-xs ml-auto">{a.year}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground pl-6">{a.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {profile.additionalInfo && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{isAr ? 'معلومات إضافية' : 'Additional Information'}</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm">{isAr ? profile.additionalInfoAr || profile.additionalInfo : profile.additionalInfo}</p>
                </CardContent>
              </Card>
            )}
            {profile.positions.length === 0 && profile.achievements.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{isAr ? 'لا توجد خبرة مضافة بعد' : 'No experience added yet'}</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="reviews" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {docRating > 0 ? (
                  <>
                    <span className="text-3xl font-bold">{docRating}</span>
                    <div>
                      <StarRating value={Math.round(docRating)} readOnly />
                      <p className="text-sm text-muted-foreground">{ratingCount} {isAr ? 'تقييم' : 'reviews'}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">{isAr ? 'لا توجد تقييمات بعد' : 'No reviews yet'}</p>
                )}
              </div>
              {user?.role === 'patient' && !patientAlreadyRated && (
                <Button size="sm" variant="outline" onClick={() => setRatingOpen(true)} className="gap-2" data-testid="btn-add-review">
                  <Star className="h-4 w-4" />{isAr ? 'أضف تقييمًا' : 'Add Review'}
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {reviews.map(r => (
                <Card key={r.id}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"><User className="h-4 w-4 text-muted-foreground" /></div>
                        <div>
                          <p className="text-xs text-muted-foreground">{isAr ? 'مريض' : 'Patient'}</p>
                          <StarRating value={r.stars} readOnly />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    {r.comment && <p className="text-sm mt-2 text-muted-foreground">{r.comment}</p>}
                  </CardContent>
                </Card>
              ))}
              {reviews.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Star className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{isAr ? 'كن أول من يقيّم هذا الطبيب' : 'Be the first to review this doctor'}</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{isAr ? 'تقييم الطبيب' : 'Rate Doctor'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center"><StarRating value={newStars} onChange={setNewStars} /></div>
            <div className="space-y-2">
              <Label>{isAr ? 'تعليق (اختياري)' : 'Comment (optional)'}</Label>
              <Textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={3} data-testid="input-review-comment" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatingOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSubmitRating} data-testid="btn-submit-review">{isAr ? 'إرسال' : 'Submit'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5" />
              {isAr ? 'مسح رمز QR لمشاركة الملف الشخصي' : 'Scan QR to Share Profile'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="p-3 bg-card rounded-xl border border-border shadow-sm">
              <QRCodeSVG value={profileUrl} size={200} />
            </div>
            <p className="text-xs text-muted-foreground break-all px-2">{profileUrl}</p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 w-full"
              onClick={() => { navigator.clipboard.writeText(profileUrl); toast({ title: isAr ? 'تم نسخ الرابط' : 'Link copied!' }); }}
              data-testid="btn-copy-profile-link"
            >
              <Copy className="h-4 w-4" />
              {isAr ? 'نسخ الرابط' : 'Copy Link'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProfileEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        profile={editProfile}
        onChange={setEditProfile}
        onSave={handleSave}
        isAr={isAr}
        isDoctor={user?.role === 'doctor'}
      />

      {/* ─── Booking Wizard Dialog ─────────────────────────────────────── */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-0">
            <DialogTitle>{isAr ? 'حجز موعد' : 'Book Appointment'}</DialogTitle>
          </DialogHeader>
          {bookingOpen && doctorId && (
            <BookingWizard
              patientId={user?.patientId || user?.id}
              initialDoctorId={doctorId}
              onComplete={() => setBookingOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ─── AI Booking Assistant ─────────────────────────────────────── */}
      <AIBookingAssistant
        initialDoctorId={doctorId}
        patientId={user?.role === 'patient' ? (user.patientId || user.id) : undefined}
      />
    </div>
  );
}

function ProfileEditDialog({ open, onClose, profile, onChange, onSave, isAr, isDoctor }: {
  open: boolean; onClose: () => void;
  profile: DoctorProfile; onChange: (p: DoctorProfile) => void;
  onSave: () => void; isAr: boolean; isDoctor: boolean;
}) {
  const update = (patch: Partial<DoctorProfile>) => onChange({ ...profile, ...patch });
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update({ photoUrl: reader.result as string });
    reader.readAsDataURL(file);
  };

  const addItem = <T extends { id: string }>(key: keyof DoctorProfile, item: T) =>
    onChange({ ...profile, [key]: [...(profile[key] as T[]), item] });

  const removeItem = <T extends { id: string }>(key: keyof DoctorProfile, id: string) =>
    onChange({ ...profile, [key]: (profile[key] as T[]).filter((x: T) => x.id !== id) });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5" />{isAr ? 'تعديل الملف الشخصي' : 'Edit Profile'}</DialogTitle></DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="space-y-6 pb-2">
            <section className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{isAr ? 'المعلومات الأساسية' : 'Basic Information'}</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{isAr ? 'سنة التخرج' : 'Graduation Year'}</Label>
                  <Input type="number" value={profile.graduationYear || ''} onChange={e => update({ graduationYear: Number(e.target.value) || undefined })} placeholder="2005" />
                </div>
                <div className="space-y-1">
                  <Label>{isAr ? 'جامعة التخرج' : 'Graduation University'}</Label>
                  <Input value={profile.graduationUniversity} onChange={e => update({ graduationUniversity: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{isAr ? 'الصورة الشخصية' : 'Profile Photo'}</Label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoFile}
                  data-testid="input-photo-file"
                />
                <div className="flex items-center gap-4">
                  <div
                    className="relative h-24 w-24 rounded-2xl overflow-hidden border-2 border-dashed border-border bg-muted cursor-pointer group shrink-0"
                    onClick={() => photoInputRef.current?.click()}
                    data-testid="btn-photo-upload-area"
                  >
                    {profile.photoUrl ? (
                      <img src={profile.photoUrl} alt="profile" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center">
                        <User className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="h-6 w-6 text-white" />
                      <span className="text-white text-xs font-medium text-center leading-tight px-1">
                        {isAr ? 'تغيير الصورة' : 'Change Photo'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => photoInputRef.current?.click()}
                      data-testid="btn-upload-photo"
                    >
                      <Camera className="h-4 w-4" />
                      {isAr ? 'رفع صورة' : 'Upload Photo'}
                    </Button>
                    {profile.photoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-destructive hover:text-destructive"
                        onClick={() => update({ photoUrl: undefined })}
                        data-testid="btn-remove-photo"
                      >
                        <X className="h-4 w-4" />
                        {isAr ? 'إزالة الصورة' : 'Remove Photo'}
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {isAr ? 'JPG، PNG، أو WEBP — حتى 5 ميجابايت' : 'JPG, PNG, or WEBP — up to 5 MB'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'النبذة (إنجليزي)' : 'Bio (English)'}</Label>
                <Textarea value={profile.bio} onChange={e => update({ bio: e.target.value })} rows={3} />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'النبذة (عربي)' : 'Bio (Arabic)'}</Label>
                <Textarea value={profile.bioAr} onChange={e => update({ bioAr: e.target.value })} rows={3} dir="rtl" />
              </div>
            </section>

            <Separator />
            <section className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{isAr ? 'روابط التواصل الاجتماعي' : 'Social Media Links'}</h3>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/...' },
                  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
                  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/...' },
                  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@...' },
                  { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@...' },
                  { key: 'twitter', label: 'X / Twitter', placeholder: 'https://x.com/...' },
                  { key: 'website', label: isAr ? 'الموقع الإلكتروني' : 'Website', placeholder: 'https://...' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Label className="w-24 shrink-0 text-xs">{label}</Label>
                    <Input
                      value={(profile.socialLinks as Record<string, string> | undefined)?.[key] || ''}
                      onChange={e => update({ socialLinks: { ...profile.socialLinks, [key]: e.target.value || undefined } })}
                      placeholder={placeholder}
                      className="text-xs"
                    />
                  </div>
                ))}
              </div>
            </section>

            <Separator />
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{isAr ? 'الدراسات العليا' : 'Postgraduate Studies'}</h3>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => addItem('postgrad', { id: `pg-${Date.now()}`, degree: '', institution: '', year: new Date().getFullYear() })}>
                  <Plus className="h-3 w-3" />{isAr ? 'إضافة' : 'Add'}
                </Button>
              </div>
              {profile.postgrad.map((pg, i) => (
                <div key={pg.id} className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-1 space-y-1"><Label className="text-xs">{isAr ? 'الدرجة' : 'Degree'}</Label><Input value={pg.degree} onChange={e => onChange({ ...profile, postgrad: profile.postgrad.map((x, j) => j === i ? { ...x, degree: e.target.value } : x) })} /></div>
                  <div className="space-y-1"><Label className="text-xs">{isAr ? 'الجهة' : 'Institution'}</Label><Input value={pg.institution} onChange={e => onChange({ ...profile, postgrad: profile.postgrad.map((x, j) => j === i ? { ...x, institution: e.target.value } : x) })} /></div>
                  <div className="flex gap-1 items-end"><div className="flex-1 space-y-1"><Label className="text-xs">{isAr ? 'السنة' : 'Year'}</Label><Input type="number" value={pg.year} onChange={e => onChange({ ...profile, postgrad: profile.postgrad.map((x, j) => j === i ? { ...x, year: Number(e.target.value) } : x) })} /></div><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeItem('postgrad', pg.id)}><Trash2 className="h-3 w-3" /></Button></div>
                </div>
              ))}
            </section>

            <Separator />
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{isAr ? 'الشهادات' : 'Certifications'}</h3>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => addItem('certifications', { id: `cert-${Date.now()}`, name: '', issuer: '', year: new Date().getFullYear() })}>
                  <Plus className="h-3 w-3" />{isAr ? 'إضافة' : 'Add'}
                </Button>
              </div>
              {profile.certifications.map((c, i) => (
                <div key={c.id} className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-1 space-y-1"><Label className="text-xs">{isAr ? 'الاسم' : 'Name'}</Label><Input value={c.name} onChange={e => onChange({ ...profile, certifications: profile.certifications.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} /></div>
                  <div className="space-y-1"><Label className="text-xs">{isAr ? 'الجهة' : 'Issuer'}</Label><Input value={c.issuer} onChange={e => onChange({ ...profile, certifications: profile.certifications.map((x, j) => j === i ? { ...x, issuer: e.target.value } : x) })} /></div>
                  <div className="flex gap-1 items-end"><div className="flex-1 space-y-1"><Label className="text-xs">{isAr ? 'السنة' : 'Year'}</Label><Input type="number" value={c.year} onChange={e => onChange({ ...profile, certifications: profile.certifications.map((x, j) => j === i ? { ...x, year: Number(e.target.value) } : x) })} /></div><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeItem('certifications', c.id)}><Trash2 className="h-3 w-3" /></Button></div>
                </div>
              ))}
            </section>

            <Separator />
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{isAr ? 'المؤتمرات' : 'Conferences'}</h3>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => addItem('conferences', { id: `conf-${Date.now()}`, name: '', location: '', year: new Date().getFullYear() })}>
                  <Plus className="h-3 w-3" />{isAr ? 'إضافة' : 'Add'}
                </Button>
              </div>
              {profile.conferences.map((c, i) => (
                <div key={c.id} className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-1 space-y-1"><Label className="text-xs">{isAr ? 'الاسم' : 'Name'}</Label><Input value={c.name} onChange={e => onChange({ ...profile, conferences: profile.conferences.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} /></div>
                  <div className="space-y-1"><Label className="text-xs">{isAr ? 'المكان' : 'Location'}</Label><Input value={c.location} onChange={e => onChange({ ...profile, conferences: profile.conferences.map((x, j) => j === i ? { ...x, location: e.target.value } : x) })} /></div>
                  <div className="flex gap-1 items-end"><div className="flex-1 space-y-1"><Label className="text-xs">{isAr ? 'السنة' : 'Year'}</Label><Input type="number" value={c.year} onChange={e => onChange({ ...profile, conferences: profile.conferences.map((x, j) => j === i ? { ...x, year: Number(e.target.value) } : x) })} /></div><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeItem('conferences', c.id)}><Trash2 className="h-3 w-3" /></Button></div>
                </div>
              ))}
            </section>

            <Separator />
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{isAr ? 'المناصب المهنية' : 'Positions'}</h3>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => addItem('positions', { id: `pos-${Date.now()}`, title: '', institution: '', fromYear: new Date().getFullYear(), isCurrent: true })}>
                  <Plus className="h-3 w-3" />{isAr ? 'إضافة' : 'Add'}
                </Button>
              </div>
              {profile.positions.map((p, i) => (
                <div key={p.id} className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">{isAr ? 'المنصب' : 'Title'}</Label><Input value={p.title} onChange={e => onChange({ ...profile, positions: profile.positions.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} /></div>
                  <div className="space-y-1"><Label className="text-xs">{isAr ? 'الجهة' : 'Institution'}</Label><Input value={p.institution} onChange={e => onChange({ ...profile, positions: profile.positions.map((x, j) => j === i ? { ...x, institution: e.target.value } : x) })} /></div>
                  <div className="space-y-1"><Label className="text-xs">{isAr ? 'من سنة' : 'From Year'}</Label><Input type="number" value={p.fromYear} onChange={e => onChange({ ...profile, positions: profile.positions.map((x, j) => j === i ? { ...x, fromYear: Number(e.target.value) } : x) })} /></div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1"><Label className="text-xs">{isAr ? 'حتى سنة' : 'To Year'}</Label><Input type="number" value={p.toYear || ''} disabled={p.isCurrent} onChange={e => onChange({ ...profile, positions: profile.positions.map((x, j) => j === i ? { ...x, toYear: Number(e.target.value) || undefined } : x) })} /></div>
                    <div className="flex flex-col items-center gap-1"><Label className="text-xs">{isAr ? 'حالي' : 'Current'}</Label><Switch checked={p.isCurrent} onCheckedChange={v => onChange({ ...profile, positions: profile.positions.map((x, j) => j === i ? { ...x, isCurrent: v } : x) })} /></div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive mb-0.5" onClick={() => removeItem('positions', p.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </section>

            <Separator />
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{isAr ? 'الإنجازات' : 'Achievements'}</h3>
                <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => addItem('achievements', { id: `ach-${Date.now()}`, title: '', description: '', year: new Date().getFullYear() })}>
                  <Plus className="h-3 w-3" />{isAr ? 'إضافة' : 'Add'}
                </Button>
              </div>
              {profile.achievements.map((a, i) => (
                <div key={a.id} className="space-y-2 p-3 border rounded-lg">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1"><Label className="text-xs">{isAr ? 'العنوان' : 'Title'}</Label><Input value={a.title} onChange={e => onChange({ ...profile, achievements: profile.achievements.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} /></div>
                    <div className="w-24 space-y-1"><Label className="text-xs">{isAr ? 'السنة' : 'Year'}</Label><Input type="number" value={a.year} onChange={e => onChange({ ...profile, achievements: profile.achievements.map((x, j) => j === i ? { ...x, year: Number(e.target.value) } : x) })} /></div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive mt-5" onClick={() => removeItem('achievements', a.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">{isAr ? 'الوصف' : 'Description'}</Label><Textarea value={a.description} rows={2} onChange={e => onChange({ ...profile, achievements: profile.achievements.map((x, j) => j === i ? { ...x, description: e.target.value } : x) })} /></div>
                </div>
              ))}
            </section>

            <Separator />
            <section className="space-y-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{isAr ? 'معلومات إضافية' : 'Additional Information'}</h3>
              <div className="space-y-1"><Label className="text-xs">{isAr ? 'إنجليزي' : 'English'}</Label><Textarea value={profile.additionalInfo} onChange={e => update({ additionalInfo: e.target.value })} rows={2} /></div>
              <div className="space-y-1"><Label className="text-xs">{isAr ? 'عربي' : 'Arabic'}</Label><Textarea value={profile.additionalInfoAr} onChange={e => update({ additionalInfoAr: e.target.value })} rows={2} dir="rtl" /></div>
            </section>

            {isDoctor && (
              <>
                <Separator />
                <section className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide flex items-center gap-2"><Settings2 className="h-4 w-4" />{isAr ? 'صلاحيات التعديل' : 'Editing Permissions'}</h3>
                  <div className="flex items-center justify-between">
                    <Label>{isAr ? 'السماح للمدير بالتعديل' : 'Allow Admin to Edit'}</Label>
                    <Switch checked={profile.allowAdminEdit} onCheckedChange={v => update({ allowAdminEdit: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>{isAr ? 'السماح للاستقبال بالتعديل' : 'Allow Reception to Edit'}</Label>
                    <Switch checked={profile.allowReceptionEdit} onCheckedChange={v => update({ allowReceptionEdit: v })} />
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
          <Button onClick={onSave} data-testid="btn-save-profile">{isAr ? 'حفظ التغييرات' : 'Save Changes'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
