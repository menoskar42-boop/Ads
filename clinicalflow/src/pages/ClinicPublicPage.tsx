import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { clinicStore } from '@/stores/clinicStore';
import { userStore } from '@/stores/userStore';
import { specialtyStore, serviceStore } from '@/stores/specialtyStore';
import { getDoctorProfile } from '@/stores/doctorProfileStore';
import { getDoctorsForClinic } from '@/stores/doctorClinicStore';
import { getAverageRating, getRatingsForTarget, addRating, hasPatientRated } from '@/stores/ratingStore';
import { getAvailableSlots } from '@/stores/scheduleStore';
import { getActiveOffersByClinic } from '@/stores/offerStore';
import { OFFER_TYPE_LABELS } from '@/stores/offerStore';
import { consultationRequestStore } from '@/stores/consultationRequestStore';
import { getActiveSpecialtyIdsForClinic } from '@/stores/clinicSpecialtyStore';
import { visitStore, appointmentStore } from '@/stores/visitStore';
import { Clinic } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  Building2, MapPin, Phone, Clock, Globe, Star, User, Calendar, ChevronRight,
  Edit, ArrowLeft, Stethoscope, ExternalLink, Navigation, QrCode, Copy, Linkedin,
  Tag, Percent, CalendarDays, Camera, ImagePlus, Trash2,
  Sun, Moon, Menu, X, ChevronDown, ChevronUp, MessageCircle,
  Activity, Heart, Award, Users, ClipboardList, HelpCircle, XCircle, Send, CheckCircle, Sparkles, Bot, RefreshCw,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SiFacebook, SiInstagram, SiYoutube, SiTiktok, SiX } from 'react-icons/si';
import BookingWizard from '@/components/BookingWizard';
import AIBookingAssistant from '@/components/AIBookingAssistant';

// ─── Client-side specialty keyword fallback (works without backend) ───────────
const SPEC_KW: Record<string, string[]> = {
  'Dentistry':        ['أسنان','سن','ضرس','اسنان','ألم أسنان','dentist','dental','teeth','tooth'],
  'Dermatology':      ['جلدية','جلد','بشرة','حبوب','طفح','حكة','derma','skin','rash','itch','acne'],
  'Cardiology':       ['قلب','صدر','cardio','heart','chest','نبض','ضغط الدم','ضغط','palpitation'],
  'Orthopedics':      ['عظام','مفاصل','ظهر','عظم','ركبة','كسر','ortho','bone','joint','back','knee','fracture'],
  'Ophthalmology':    ['عيون','عين','نظر','بصر','eye','vision','ophthal','sight'],
  'ENT':              ['أنف','أذن','حنجرة','انف','اذن','لوز','ear','nose','throat','ent','tonsil'],
  'Neurology':        ['أعصاب','صداع','اعصاب','دوخة','شلل','neuro','headache','migraine','dizzy','paralysis'],
  'Gastroenterology': ['معدة','هضمي','بطن','أمعاء','امعاء','اسهال','قولون','gastro','stomach','digest','diarrhea','colon'],
  'General Medicine': ['حرارة','برد','انفلونزا','كحة','سعال','عام','باطنة','fever','cold','flu','cough','general','fatigue'],
  'Pediatrics':       ['أطفال','اطفال','طفل','رضيع','pediatr','child','kid','infant','baby'],
  'Urology':          ['مسالك','بول','كلى','بروستاتا','urol','urinary','kidney','prostate'],
  'Gynecology':       ['نساء','نسا','توليد','حمل','دورة','gyn','obstet','women','pregnancy','period'],
  'Psychiatry':       ['نفسي','نفسية','اكتئاب','قلق','توتر','وسواس','psych','mental','depression','anxiety','stress'],
  'Pulmonology':      ['رئة','رئتين','تنفس','ربو','pulmon','lung','breath','asthma','bronchitis'],
  'Endocrinology':    ['سكر','غدة','هرمون','سكري','diabete','thyroid','endocrin','hormone'],
};

type ClinicSpec = { id: string; name: string; nameAr?: string };

function clientDetectSpec(text: string, available: ClinicSpec[]): { detected: string; matched: ClinicSpec | null; suggested: ClinicSpec | null } | null {
  const lower = text.toLowerCase();
  for (const [spec, kws] of Object.entries(SPEC_KW)) {
    if (kws.some(kw => lower.includes(kw))) {
      const specLower = spec.toLowerCase();
      // Match against English name, Arabic name, or partial containment
      const matched = available.find(s => {
        const nameLow = s.name.toLowerCase();
        const nameArLow = (s.nameAr || '').toLowerCase();
        return (
          nameLow === specLower ||
          nameLow.includes(specLower) ||
          specLower.includes(nameLow) ||
          // Arabic keyword cross-match: if any keyword in the spec matches nameAr
          kws.some(kw => nameArLow.includes(kw))
        );
      }) || null;
      const suggested = !matched && available.length > 0 ? available[0] : null;
      return { detected: spec, matched, suggested };
    }
  }
  return null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getNextSlotsForClinic(doctorIds: string[], maxPerDoctor = 2, maxTotal = 8): { doctorId: string; date: string; time: string; label: string }[] {
  const result: { doctorId: string; date: string; time: string; label: string }[] = [];
  const today = new Date();
  for (const doctorId of doctorIds) {
    let found = 0;
    for (let i = 0; i < 7 && found < maxPerDoctor; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const slots = getAvailableSlots(doctorId, dateStr);
      for (const slot of slots) {
        if (found >= maxPerDoctor) break;
        const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : DAYS[d.getDay()];
        result.push({ doctorId, date: dateStr, time: slot, label });
        found++;
      }
    }
  }
  result.sort((a, b) => {
    const da = a.date + 'T' + a.time;
    const db = b.date + 'T' + b.time;
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return result.slice(0, maxTotal);
}

function StarRating({ value, onChange, readOnly = false }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <button key={s} type="button" disabled={readOnly} className={readOnly ? 'cursor-default' : 'cursor-pointer'}
          onClick={() => !readOnly && onChange?.(s)} onMouseEnter={() => !readOnly && setHover(s)} onMouseLeave={() => !readOnly && setHover(0)}>
          <Star className={`h-4 w-4 ${(hover || value) >= s ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
        </button>
      ))}
    </div>
  );
}

export default function ClinicPublicPage() {
  const { clinicId } = useParams<{ clinicId: string }>();
  const { language, setLanguage, isRTL } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isAr = language === 'ar';

  const clinic = useMemo(() => clinicId ? clinicStore.get(c => c.id === clinicId) : undefined, [clinicId]);
  const doctors = useMemo(() => {
    if (!clinicId) return [];
    const linkedIds = new Set(getDoctorsForClinic(clinicId));
    return userStore.filter(u =>
      u.role === 'doctor' && u.isActive &&
      (linkedIds.has(u.id) || u.clinicId === clinicId)
    );
  }, [clinicId]);

  const slots = useMemo(() => getNextSlotsForClinic(doctors.map(d => d.id)), [doctors]);
  const clinicOffers = useMemo(() => clinicId ? getActiveOffersByClinic(clinicId) : [], [clinicId]);
  const clinicSpecialties = useMemo(() => {
    if (!clinicId) return [];
    const activeIds = getActiveSpecialtyIdsForClinic(clinicId);
    if (activeIds.length > 0) {
      return specialtyStore.filter(s => activeIds.includes(s.id));
    }
    // Fallback: derive from doctors linked to this clinic
    const docSpecIds = [...new Set(doctors.filter(d => d.specialtyId).map(d => d.specialtyId!))];
    if (docSpecIds.length > 0) return specialtyStore.filter(s => docSpecIds.includes(s.id));
    // Last resort: return all specialties so dropdown and AI always work
    return specialtyStore.getAll();
  }, [clinicId]);
  const { avg: clinicRating, count: ratingCount } = getAverageRating(clinicId || '', 'clinic');
  const reviews = getRatingsForTarget(clinicId || '', 'clinic');

  // ── Live Statistics ──────────────────────────────────────────────────────────
  const liveStats = useMemo(() => {
    const completedVisits = visitStore.filter(v => (v as any).clinicId === clinicId && (v as any).status === 'completed');
    const uniquePatients = new Set(completedVisits.map((v: any) => v.patientId)).size;
    const completedAppts  = appointmentStore.filter(a => a.clinicId === clinicId && a.status === 'completed');
    const uniqueApptPats  = new Set(completedAppts.map(a => a.patientId)).size;
    const totalPatients   = (clinic?.statsBasePatients ?? 0) + uniquePatients + uniqueApptPats;
    const surgicalCount   = completedAppts.filter(a => (a as any).visitTypeId === 'surgery' || (a as any).consultationType === 'surgery').length;
    const totalSurgeries  = (clinic?.statsBaseSurgeries ?? 0) + surgicalCount;
    const currentYear     = new Date().getFullYear();
    const yearsExp        = clinic?.statsFoundedYear ? currentYear - clinic.statsFoundedYear : undefined;
    return { totalPatients, totalSurgeries, yearsExp };
  }, [clinicId, clinic]);

  const canEdit = user && user.role === 'admin' && user.clinicId === clinicId;
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<Clinic>>({});
  const [qrOpen, setQrOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDoctorId, setBookingDoctorId] = useState<string | undefined>(undefined);
  const clinicUrl = `${window.location.origin}/clinic/${clinicId}`;

  const [ratingOpen, setRatingOpen] = useState(false);
  const [newStars, setNewStars] = useState(5);
  const [activeSection, setActiveSection] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', phone: '', type: 'general', notes: '' });
  const [contactSent, setContactSent] = useState(false);
  const [contactSpecialtyId, setContactSpecialtyId] = useState('');
  const [aiSpecialtyMsg, setAiSpecialtyMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [isDetectingSpecialty, setIsDetectingSpecialty] = useState(false);
  const [activeDocIdx, setActiveDocIdx] = useState(0);
  const [sliderAnimating, setSliderAnimating] = useState(false);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    return () => { document.documentElement.classList.remove('dark'); };
  }, [darkMode]);

  useEffect(() => {
    if (doctors.length <= 1) return;
    const timer = setInterval(() => {
      setSliderAnimating(true);
      setTimeout(() => {
        setActiveDocIdx(i => (i + 1) % doctors.length);
        setSliderAnimating(false);
      }, 350);
    }, 4000);
    return () => clearInterval(timer);
  }, [doctors.length]);
  const [newComment, setNewComment] = useState('');
  const patientAlreadyRated = user?.role === 'patient' && clinicId ? hasPatientRated(user.id, clinicId, 'clinic') : false;
  const bannerInputRef = useRef<HTMLInputElement>(null);

  if (!clinic) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Building2 className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">{isAr ? 'العيادة غير موجودة' : 'Clinic not found'}</p>
          <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-2" />{isAr ? 'رجوع' : 'Go Back'}</Button>
        </div>
      </div>
    );
  }

  const handleSaveEdit = () => {
    clinicStore.update(c => c.id === clinicId, editData);
    setEditOpen(false);
    toast({ title: isAr ? 'تم تحديث بيانات العيادة' : 'Clinic profile updated' });
  };

  const handleBannerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditData(p => ({ ...p, coverImageUrl: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const openEdit = () => {
    setEditData({
      description: clinic.description, descriptionAr: clinic.descriptionAr,
      workingHours: clinic.workingHours, workingHoursAr: clinic.workingHoursAr,
      latitude: clinic.latitude, longitude: clinic.longitude, website: clinic.website,
      socialLinks: clinic.socialLinks,
      coverImageUrl: clinic.coverImageUrl,
      statsFoundedYear: clinic.statsFoundedYear,
      statsBasePatients: clinic.statsBasePatients,
      statsBaseSurgeries: clinic.statsBaseSurgeries,
    });
    setEditOpen(true);
  };

  const handleSubmitRating = () => {
    if (!user?.id || !clinicId) return;
    addRating({ targetId: clinicId, targetType: 'clinic', patientId: user.id, stars: newStars, comment: newComment });
    setRatingOpen(false);
    setNewComment('');
    toast({ title: isAr ? 'شكرًا على تقييمك' : 'Thank you for your review!' });
  };

  const handleAiDetectSpecialty = async () => {
    if (!contactForm.notes.trim()) {
      setAiSpecialtyMsg({ text: isAr ? 'الرجاء كتابة الأعراض أولاً في حقل الملاحظات.' : 'Please write your symptoms in the notes field first.', ok: false });
      return;
    }
    setIsDetectingSpecialty(true);
    setAiSpecialtyMsg(null);
    try {
      const res = await fetch('/api/ai-specialty-consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms: contactForm.notes,
          availableSpecialties: clinicSpecialties.map(s => ({ id: s.id, name: s.name, nameAr: s.nameAr })),
          language,
        }),
      });
      // Guard: parse only if JSON content-type
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('non-json response');
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'api error');
      }
      if (!data.isSymptoms) {
        setAiSpecialtyMsg({ text: isAr ? 'المدخل لا يبدو أعراضاً طبية. يرجى وصف شكواك الصحية.' : 'The input does not appear to be medical symptoms. Please describe your health complaint.', ok: false });
        return;
      }
      if (data.matchedId) {
        setContactSpecialtyId(data.matchedId);
        const msg = isAr ? data.messageAr : data.messageEn;
        setAiSpecialtyMsg({ text: msg || (isAr ? 'تم تحديد التخصص تلقائياً.' : 'Specialty detected automatically.'), ok: true });
      } else if (data.suggestedId) {
        setContactSpecialtyId(data.suggestedId);
        const sp = clinicSpecialties.find(s => s.id === data.suggestedId);
        const spName = isAr ? sp?.nameAr || sp?.name : sp?.name;
        const detected = data.detectedSpecialtyName || '';
        setAiSpecialtyMsg({
          text: isAr
            ? `تخصص "${detected}" غير متاح بهذه العيادة. تم اقتراح "${spName}" كأقرب تخصص متاح.`
            : `Specialty "${detected}" is not available at this clinic. Suggested "${spName}" as the closest available.`,
          ok: true,
        });
      } else {
        const detected = data.detectedSpecialtyName || '';
        setAiSpecialtyMsg({
          text: isAr
            ? `تخصص "${detected}" غير متاح في هذه العيادة حالياً. يرجى الاختيار يدوياً.`
            : `Specialty "${detected}" is not currently available at this clinic. Please select manually.`,
          ok: false,
        });
      }
    } catch {
      // Backend unreachable → fall back to client-side keyword matching
      const local = clientDetectSpec(contactForm.notes, clinicSpecialties);
      if (local?.matched) {
        setContactSpecialtyId(local.matched.id);
        setAiSpecialtyMsg({
          text: isAr
            ? `بناءً على الأعراض، التخصص المقترح: ${local.matched.nameAr || local.matched.name} ✓`
            : `Based on symptoms, suggested specialty: ${local.matched.name} ✓`,
          ok: true,
        });
      } else if (local?.suggested) {
        setContactSpecialtyId(local.suggested.id);
        setAiSpecialtyMsg({
          text: isAr
            ? `تخصص "${local.detected}" غير متاح. تم اقتراح "${local.suggested.nameAr || local.suggested.name}" كبديل أقرب.`
            : `"${local.detected}" not available. Suggested "${local.suggested.name}" as the closest alternative.`,
          ok: true,
        });
      } else if (local) {
        setAiSpecialtyMsg({
          text: isAr
            ? `التخصص المقترح "${local.detected}" غير متاح في هذه العيادة. يرجى الاختيار يدوياً.`
            : `Suggested "${local.detected}" is not available at this clinic. Please select manually.`,
          ok: false,
        });
      } else {
        setAiSpecialtyMsg({
          text: isAr
            ? 'لم يتعرف النظام على التخصص. يرجى وصف الأعراض بشكل أوضح أو الاختيار يدوياً.'
            : 'Could not identify the specialty. Please describe symptoms more clearly or select manually.',
          ok: false,
        });
      }
    } finally {
      setIsDetectingSpecialty(false);
    }
  };

  const mapsUrl = clinic.latitude && clinic.longitude
    ? `https://www.google.com/maps?q=${clinic.latitude},${clinic.longitude}&z=15`
    : `https://www.google.com/maps/search/${encodeURIComponent((isAr ? clinic.addressAr : clinic.address) + ', ' + (isAr ? clinic.cityAr : clinic.city))}`;

  const embedUrl = clinic.latitude && clinic.longitude
    ? `https://maps.google.com/maps?q=${clinic.latitude},${clinic.longitude}&z=15&output=embed`
    : null;

  const NAV_ITEMS = [
    { id: 'home',     labelAr: 'الرئيسية',        labelEn: 'Home' },
    { id: 'about',    labelAr: doctors.length > 1 ? 'عن الأطباء' : 'عن الطبيب', labelEn: doctors.length > 1 ? 'About Doctors' : 'About' },
    { id: 'services', labelAr: 'الخدمات',          labelEn: 'Services' },
    { id: 'booking',  labelAr: 'حجز موعد',         labelEn: 'Book' },
    { id: 'faq',      labelAr: 'الأسئلة الشائعة',  labelEn: 'FAQ' },
    { id: 'contact',  labelAr: 'تواصل معنا',       labelEn: 'Contact' },
  ];

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ── STICKY NAVBAR ───────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Stethoscope className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block max-w-[200px]">
              <p className="font-bold text-sm leading-snug break-words">{isAr ? clinic.nameAr : clinic.name}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'منصة الرعاية الطبية' : 'Medical Care Platform'}</p>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-5">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => { setActiveSection(item.id); document.getElementById(`section-${item.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}
                className={`text-sm font-medium transition-colors hover:text-primary ${activeSection === item.id ? 'text-primary border-b-2 border-primary pb-0.5' : 'text-muted-foreground'}`}
              >
                {isAr ? item.labelAr : item.labelEn}
              </button>
            ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} className="text-xs h-8 px-2" data-testid="button-toggle-language">
              {language === 'en' ? 'AR' : 'EN'}
            </Button>
            {!isAuthenticated ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate('/login')} className="text-sm h-8 hidden sm:flex">{isAr ? 'دخول' : 'Login'}</Button>
                <Button size="sm" onClick={() => navigate('/register')} className="text-sm h-8">{isAr ? 'إنشاء حساب' : 'Sign Up'}</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => navigate('/patient')} className="text-sm h-8">{isAr ? 'لوحتي' : 'Dashboard'}</Button>
            )}
            {canEdit && (
              <Button size="sm" variant="outline" onClick={openEdit} className="gap-1 h-8 text-xs" data-testid="btn-edit-clinic">
                <Edit className="h-3.5 w-3.5" />{isAr ? 'تعديل' : 'Edit'}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 py-3 space-y-1">
            {NAV_ITEMS.map(item => (
              <button key={item.id} className="block w-full text-start text-sm py-2 text-muted-foreground hover:text-primary transition-colors"
                onClick={() => { setMobileMenuOpen(false); document.getElementById(`section-${item.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
                {isAr ? item.labelAr : item.labelEn}
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── HERO SECTION ──────────────────────────────────────────── */}
        <div id="section-home" className="relative overflow-hidden rounded-2xl min-h-[400px] sm:min-h-[500px] flex items-end"
          style={clinic.coverImageUrl
            ? { backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.88) 0%, rgba(3,105,161,0.72) 100%), url(${clinic.coverImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0369a1 100%)' }
          }
        >
          <div className="absolute inset-0 opacity-10"
            style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }}
          />
          <div className="absolute inset-0 flex items-center justify-end overflow-hidden">
            <div className="w-96 h-96 rounded-full opacity-20"
              style={{ background: 'radial-gradient(circle, #38bdf8 0%, transparent 70%)' }}
            />
          </div>

          {/* Badge top */}
          <div className="absolute top-6" style={{ right: isRTL ? '1.5rem' : 'auto', left: isRTL ? 'auto' : '1.5rem' }}>
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1.5">
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-white text-xs font-medium">
                {isAr ? `رعاية متكاملة في ${clinic.cityAr || clinic.city}` : `Integrated Care in ${clinic.city}`}
              </span>
            </div>
          </div>

          {/* QR button */}
          <div className="absolute top-6" style={{ left: isRTL ? '1.5rem' : 'auto', right: isRTL ? 'auto' : '1.5rem' }}>
            <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}
              className="gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs" data-testid="btn-clinic-qr">
              <QrCode className="h-3.5 w-3.5" />QR
            </Button>
          </div>

          {/* Content */}
          <div className="relative p-6 sm:p-10 w-full">
            <div className="max-w-2xl space-y-4">
              <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight">
                {isAr ? clinic.nameAr : clinic.name}
              </h1>
              {doctors[0] && (() => {
                const spec = doctors[0].specialtyId ? specialtyStore.get(s => s.id === doctors[0].specialtyId) : null;
                return spec ? (
                  <h2 className="text-xl sm:text-3xl font-bold" style={{ color: '#38bdf8' }}>
                    {isAr ? spec.nameAr || spec.name : spec.name}
                  </h2>
                ) : null;
              })()}
              {(clinic.description || clinic.descriptionAr) && (
                <p className="text-white/80 text-sm sm:text-base leading-relaxed max-w-lg">
                  {isAr ? clinic.descriptionAr || clinic.description : clinic.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button size="lg" className="gap-2 text-sm font-semibold"
                  style={{ backgroundColor: '#0ea5e9', color: 'white' }}
                  onClick={() => { if (!isAuthenticated) { navigate('/login'); return; } setBookingOpen(true); }}
                >
                  <Calendar className="h-4 w-4" />
                  {isAr ? 'احجز موعدك الآن' : 'Book Appointment'}
                </Button>
                <button
                  className="flex items-center gap-2 text-white/80 hover:text-white text-sm font-medium transition-colors"
                  onClick={() => document.getElementById('section-contact')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  {isAr ? 'تواصل مع العيادة' : 'Contact Us'}
                  <ChevronRight className="h-4 w-4" style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                </button>
              </div>
              {clinicRating > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`h-4 w-4 ${s <= Math.round(clinicRating) ? 'fill-yellow-400 text-yellow-400' : 'text-white/30'}`} />
                    ))}
                  </div>
                  <span className="text-white/80 text-sm">{clinicRating} ({ratingCount} {isAr ? 'تقييم' : 'reviews'})</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {clinic.socialLinks && Object.values(clinic.socialLinks).some(Boolean) && (
          <div className="flex flex-wrap items-center gap-3 px-1">
            {clinic.socialLinks.facebook && (
              <a href={clinic.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 transition-colors" title="Facebook" data-testid="clinic-social-facebook"><SiFacebook className="h-5 w-5" /></a>
            )}
            {clinic.socialLinks.instagram && (
              <a href={clinic.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:text-pink-600 transition-colors" title="Instagram" data-testid="clinic-social-instagram"><SiInstagram className="h-5 w-5" /></a>
            )}
            {clinic.socialLinks.linkedin && (
              <a href={clinic.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:text-blue-800 transition-colors" title="LinkedIn" data-testid="clinic-social-linkedin"><Linkedin className="h-5 w-5" /></a>
            )}
            {clinic.socialLinks.youtube && (
              <a href={clinic.socialLinks.youtube} target="_blank" rel="noopener noreferrer" className="text-red-600 hover:text-red-700 transition-colors" title="YouTube" data-testid="clinic-social-youtube"><SiYoutube className="h-5 w-5" /></a>
            )}
            {clinic.socialLinks.tiktok && (
              <a href={clinic.socialLinks.tiktok} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-muted-foreground transition-colors" title="TikTok" data-testid="clinic-social-tiktok"><SiTiktok className="h-5 w-5" /></a>
            )}
            {clinic.socialLinks.twitter && (
              <a href={clinic.socialLinks.twitter} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-muted-foreground transition-colors" title="X / Twitter" data-testid="clinic-social-twitter"><SiX className="h-5 w-5" /></a>
            )}
            {clinic.socialLinks.website && (
              <a href={clinic.socialLinks.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors" title="Website" data-testid="clinic-social-website"><Globe className="h-5 w-5" /></a>
            )}
          </div>
        )}

        {/* ── STATISTICS BAR ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: Heart,  val: liveStats.totalSurgeries > 0 ? `${liveStats.totalSurgeries}+` : (clinic?.statsBaseSurgeries != null ? `${clinic.statsBaseSurgeries}+` : '—'), labelAr: 'عملية جراحية',   labelEn: 'Surgeries' },
            { icon: Award,  val: liveStats.yearsExp != null ? `${liveStats.yearsExp}+` : (clinic?.statsFoundedYear ? `${new Date().getFullYear() - clinic.statsFoundedYear}+` : '—'), labelAr: 'سنوات خبرة', labelEn: 'Years Exp.' },
            { icon: Users,  val: liveStats.totalPatients > 0 ? `${liveStats.totalPatients}+` : (clinic?.statsBasePatients != null ? `${clinic.statsBasePatients}+` : '—'), labelAr: 'مريض تم علاجهم', labelEn: 'Patients' },
            { icon: Star,   val: clinicRating > 0 ? clinicRating.toFixed(1) : '—', labelAr: 'تقييم المرضى', labelEn: 'Rating' },
          ].map((stat, i) => (
            <Card key={i} className="text-center hover:shadow-md transition-shadow">
              <CardContent className="pt-5 pb-4">
                <stat.icon className="h-6 w-6 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold">{stat.val}</p>
                <p className="text-xs text-muted-foreground mt-1">{isAr ? stat.labelAr : stat.labelEn}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── INFO CARDS ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Phone className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{isAr ? 'الهاتف' : 'Phone'}</p>
                <p className="font-medium text-sm">{clinic.phone}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <MapPin className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">{isAr ? 'المدينة' : 'City'}</p>
                <p className="font-medium text-sm">{isAr ? clinic.cityAr : clinic.city}</p>
              </div>
            </CardContent>
          </Card>
          {clinic.workingHours && (
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{isAr ? 'ساعات العمل' : 'Working Hours'}</p>
                  <p className="font-medium text-xs leading-relaxed">{isAr ? clinic.workingHoursAr || clinic.workingHours : clinic.workingHours}</p>
                </div>
              </CardContent>
            </Card>
          )}
          {clinic.website && (
            <Card>
              <CardContent className="pt-4 pb-4 flex items-center gap-3">
                <Globe className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{isAr ? 'الموقع الإلكتروني' : 'Website'}</p>
                  <a href={clinic.website} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline flex items-center gap-1">
                    {isAr ? 'زيارة الموقع' : 'Visit Site'}<ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {(clinic.description || clinic.descriptionAr) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{isAr ? 'عن العيادة' : 'About the Clinic'}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">{isAr ? clinic.descriptionAr || clinic.description : clinic.description}</p>
            </CardContent>
          </Card>
        )}

        {/* ── ABOUT DOCTOR(S) SLIDER ──────────────────────────────────── */}
        <div id="section-about">
          {doctors.length > 0 && (() => {
            const safeIdx = Math.min(activeDocIdx, doctors.length - 1);
            const doc = doctors[safeIdx];
            const profile = getDoctorProfile(doc.id);
            const spec = doc.specialtyId ? specialtyStore.get(s => s.id === doc.specialtyId) : null;
            const isMulti = doctors.length > 1;
            return (
              <div className="space-y-4">
                {/* Section header + nav */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-0.5 w-8 bg-primary rounded-full" />
                    <h2 className="text-xl sm:text-2xl font-bold">
                      {isAr
                        ? (isMulti ? 'عن ' : 'عن ')
                        : (isMulti ? 'About Our ' : 'About the ')}
                      <span className="text-primary">
                        {isAr
                          ? (isMulti ? 'الأطباء' : 'الطبيب')
                          : (isMulti ? 'Doctors' : 'Doctor')}
                      </span>
                    </h2>
                  </div>

                  {/* Slider controls — only if multiple doctors */}
                  {isMulti && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setSliderAnimating(true); setTimeout(() => { setActiveDocIdx(i => (i - 1 + doctors.length) % doctors.length); setSliderAnimating(false); }, 350); }}
                        className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" style={{ transform: isRTL ? 'none' : 'rotate(180deg)' }} />
                      </button>
                      <span className="text-xs text-muted-foreground tabular-nums">{safeIdx + 1} / {doctors.length}</span>
                      <button
                        onClick={() => { setSliderAnimating(true); setTimeout(() => { setActiveDocIdx(i => (i + 1) % doctors.length); setSliderAnimating(false); }, 350); }}
                        className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Dot indicators */}
                {isMulti && (
                  <div className="flex items-center gap-1.5 justify-center">
                    {doctors.map((_, i) => (
                      <button key={i} onClick={() => setActiveDocIdx(i)}
                        className={`rounded-full transition-all ${i === safeIdx ? 'w-5 h-2 bg-primary' : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'}`}
                      />
                    ))}
                  </div>
                )}

                {/* Doctor card */}
                <div className="relative">
                  {/* Left side arrow — prev */}
                  {isMulti && (
                    <button
                      onClick={() => { setSliderAnimating(true); setTimeout(() => { setActiveDocIdx(i => (i - 1 + doctors.length) % doctors.length); setSliderAnimating(false); }, 350); }}
                      className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 h-10 w-10 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <ChevronRight className="h-5 w-5" style={{ transform: 'rotate(180deg)' }} />
                    </button>
                  )}
                <Card
                  className="overflow-hidden"
                  style={{ transition: 'opacity 0.35s ease, transform 0.35s ease', opacity: sliderAnimating ? 0 : 1, transform: sliderAnimating ? 'translateX(24px)' : 'translateX(0)' }}
                >
                  <CardContent className="p-0">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                      {/* Left: Info */}
                      <div className="p-6 sm:p-8 space-y-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <div className="h-0.5 w-8 bg-primary rounded-full" />
                            <span className="text-xs font-medium text-primary uppercase tracking-wide">{isAr ? 'رسالة طبية سامية' : 'Medical Mission'}</span>
                          </div>
                          <h3 className="text-2xl sm:text-3xl font-bold leading-tight">
                            {isAr ? 'نسعى لتقديم رعاية صحية ' : 'We aim to provide '}
                            <span className="text-primary">{isAr ? 'بمعايير عالمية' : 'world-class care'}</span>
                          </h3>
                        </div>

                        {profile?.bio
                          ? <p className="text-muted-foreground text-sm leading-relaxed">{profile.bio}</p>
                          : <p className="text-muted-foreground text-sm leading-relaxed">
                              {isAr
                                ? `${isAr ? doc.nameAr : doc.name} طبيب متخصص يسعى لتقديم أفضل رعاية صحية للمرضى بالاستعانة بأحدث الأساليب والتقنيات الطبية.`
                                : `${doc.name} is a dedicated specialist committed to providing the highest quality patient care using the latest medical techniques.`}
                            </p>
                        }

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          {[
                            { e: '🔬', ar: 'متابعة دقيقة على مدار الساعة', en: '24/7 Continuous Monitoring' },
                            { e: '🫀', ar: spec ? (isAr ? spec.nameAr || spec.name : spec.name) : (isAr ? 'تخصص دقيق' : 'Medical Specialty'), en: spec ? spec.name : 'Medical Specialty' },
                            { e: '🧪', ar: 'استشارات مبنية على البراهين', en: 'Evidence-Based Consultations' },
                            { e: '💊', ar: 'أحدث بروتوكولات العلاج', en: 'Latest Treatment Protocols' },
                          ].map((f, i) => (
                            <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/40">
                              <span className="text-lg">{f.e}</span>
                              <span className="text-xs font-medium">{isAr ? f.ar : f.en}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center gap-6 pt-3 border-t border-border">
                          {[['200+', isAr ? 'عملية' : 'Surgeries'], ['15+', isAr ? 'سنة خبرة' : 'Yrs Exp.'], ['700+', isAr ? 'مريض' : 'Patients']].map(([v, l]) => (
                            <div key={l} className="text-center">
                              <p className="text-xl font-bold text-primary">{v}</p>
                              <p className="text-xs text-muted-foreground">{l}</p>
                            </div>
                          ))}
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-2">
                          <Button className="flex-1 gap-2" onClick={() => {
                            if (!isAuthenticated) { navigate('/login'); return; }
                            setBookingDoctorId(doc.id);
                            setBookingOpen(true);
                          }}>
                            <Calendar className="h-4 w-4" />
                            {isAr ? `احجز مع ${doc.nameAr}` : `Book with ${doc.name}`}
                          </Button>
                          <Button variant="outline" className="gap-2 shrink-0" onClick={() => navigate(`/doctor/${doc.id}`)}>
                            <User className="h-4 w-4" />
                            {isAr ? 'صفحة الطبيب' : "Doctor's Page"}
                          </Button>
                        </div>
                      </div>

                      {/* Right: Doctor Photo */}
                      <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 flex items-end justify-center min-h-[260px] p-6">
                        {profile?.photoUrl ? (
                          <img src={profile.photoUrl} alt={isAr ? doc.nameAr : doc.name}
                            className="max-h-64 w-auto object-cover rounded-2xl shadow-xl" />
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <div className="h-28 w-28 rounded-2xl bg-primary/20 flex items-center justify-center">
                              <User className="h-14 w-14 text-primary/60" />
                            </div>
                            <p className="font-bold text-lg">{isAr ? doc.nameAr : doc.name}</p>
                            {spec && <p className="text-sm text-muted-foreground">{isAr ? spec.nameAr || spec.name : spec.name}</p>}
                          </div>
                        )}
                        {spec && (
                          <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-background rounded-xl px-3 py-2 shadow-lg border border-border">
                            <Award className="h-4 w-4 text-primary" />
                            <div>
                              <p className="text-xs font-bold">{isAr ? 'متخصص في' : 'Specialist'}</p>
                              <p className="text-xs text-muted-foreground">{isAr ? spec.nameAr || spec.name : spec.name}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                  {/* Right side arrow — next */}
                  {isMulti && (
                    <button
                      onClick={() => { setSliderAnimating(true); setTimeout(() => { setActiveDocIdx(i => (i + 1) % doctors.length); setSliderAnimating(false); }, 350); }}
                      className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 h-10 w-10 rounded-full bg-background border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── SERVICES SECTION ────────────────────────────────────────── */}
        <div id="section-services">
          <div className="text-center space-y-2 mb-6">
            <div className="flex items-center justify-center gap-2">
              <div className="h-0.5 w-8 bg-primary rounded-full" />
              <span className="text-xs font-medium text-primary uppercase tracking-wide">{isAr ? 'رعاية متميزة' : 'Premium Care'}</span>
              <div className="h-0.5 w-8 bg-primary rounded-full" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold">
              {isAr ? 'خدماتنا ' : 'Our '}<span className="text-primary">{isAr ? 'الطبية' : 'Services'}</span>
            </h2>
          </div>
          {(() => {
            const COLORS = ['#ef4444','#f97316','#8b5cf6','#06b6d4','#22c55e','#f59e0b','#3b82f6','#ec4899','#14b8a6','#a855f7'];
            const ICONS  = [Heart, Activity, Stethoscope, ClipboardList, Users, Award, Star, Calendar, Building2, CheckCircle];
            const clinicServices = serviceStore.filter(s => s.isActive && s.clinicId === clinicId);
            if (clinicServices.length === 0) {
              return (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  {isAr ? 'لم تُضف العيادة خدمات بعد.' : 'No services have been added yet.'}
                </div>
              );
            }
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {clinicServices.map((svc, i) => {
                  const color = COLORS[i % COLORS.length];
                  const Icon  = ICONS[i % ICONS.length];
                  const spec  = specialtyStore.get(s => s.id === svc.specialtyId);
                  return (
                    <Card key={svc.id} className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden">
                      <CardContent className="p-5 space-y-3">
                        <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                          <Icon className="h-6 w-6" style={{ color }} />
                        </div>
                        <h3 className="font-bold text-sm">{isAr ? svc.nameAr : svc.name}</h3>
                        {spec && (
                          <p className="text-xs text-muted-foreground">{isAr ? spec.nameAr : spec.name}</p>
                        )}
                        {svc.price > 0 && (
                          <Badge variant="secondary" className="text-xs font-semibold">{svc.price} ج.م</Badge>
                        )}
                        <button className="flex items-center gap-1 text-xs font-medium hover:gap-2 transition-all" style={{ color }}
                          onClick={() => { if (!isAuthenticated) { navigate('/login'); return; } setBookingOpen(true); }}>
                          {isAr ? 'احجز لهذه الخدمة' : 'Book This Service'}
                          <ChevronRight className="h-3 w-3" style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                        </button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* ── DOCTORS CARD ────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              {isAr ? 'الأطباء' : 'Our Doctors'}
              <Badge variant="secondary">{doctors.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {doctors.map(doc => {
                const spec = doc.specialtyId ? specialtyStore.get(s => s.id === doc.specialtyId) : undefined;
                const profile = getDoctorProfile(doc.id);
                const { avg: dr, count: dc } = getAverageRating(doc.id, 'doctor');
                return (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:border-primary/50 transition-all">
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      {profile?.photoUrl ? (
                        <img src={profile.photoUrl} alt={doc.name} className="h-full w-full rounded-xl object-cover" />
                      ) : (
                        <User className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{isAr ? doc.nameAr : doc.name}</p>
                      <p className="text-xs text-muted-foreground">{isAr ? spec?.nameAr || spec?.name : spec?.name}</p>
                      {dr > 0 && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          <span className="text-xs font-medium">{dr}</span>
                          <span className="text-xs text-muted-foreground">({dc})</span>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => navigate(`/doctor/${doc.id}`)} data-testid={`btn-view-doctor-${doc.id}`}>
                        {isAr ? 'صفحة الطبيب' : "Doctor's Page"}
                      </Button>
                      <Button size="sm" className="text-xs h-7" onClick={() => {
                        if (!isAuthenticated) { navigate('/login'); return; }
                        setBookingDoctorId(doc.id);
                        setBookingOpen(true);
                      }} data-testid={`btn-book-doctor-${doc.id}`}>
                        {isAr ? 'احجز' : 'Book'}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {doctors.length === 0 && (
                <div className="col-span-2 text-center py-8 text-muted-foreground">
                  <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{isAr ? 'لا يوجد أطباء بعد' : 'No doctors yet'}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {slots.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                {isAr ? 'أقرب المواعيد المتاحة' : 'Nearest Available Appointments'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {slots.map((slot, i) => {
                  const doc = doctors.find(d => d.id === slot.doctorId);
                  const spec = doc?.specialtyId ? specialtyStore.get(s => s.id === doc.specialtyId) : undefined;
                  return (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-primary/50 transition-all" data-testid={`slot-row-${i}`}>
                      <div className="flex items-center gap-3">
                        <div className="text-center w-16">
                          <p className="text-xs text-muted-foreground">{slot.label}</p>
                          <p className="font-semibold">{slot.time}</p>
                        </div>
                        <div>
                          <p className="font-medium text-sm">{isAr ? doc?.nameAr : doc?.name}</p>
                          <p className="text-xs text-muted-foreground">{isAr ? spec?.nameAr || spec?.name : spec?.name}</p>
                        </div>
                      </div>
                      <Button size="sm" className="text-xs h-7" onClick={() => {
                        if (!isAuthenticated) { navigate('/login'); return; }
                        setBookingDoctorId(slot.doctorId);
                        setBookingOpen(true);
                      }} data-testid={`btn-book-slot-${i}`}>
                        {isAr ? 'احجز' : 'Book Now'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── BOOKING TIPS ─────────────────────────────────────────────── */}
        <div id="section-booking">
          <div className="text-center space-y-2 mb-6">
            <span className="text-xs font-medium bg-muted rounded-full px-3 py-1 inline-flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-primary" />{isAr ? 'إرشادات هامة' : 'Important Guidelines'}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold">
              {isAr ? 'نصائح لحجز ' : 'Tips for a '}<span className="text-primary">{isAr ? 'ناجح' : 'Successful Booking'}</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: CalendarDays, ar: 'اختر موعدك بدقة',   en: 'Choose Carefully',     desc_ar: 'راجع جدولك جيداً قبل التأكيد لتفادي إعادة الجدولة.', desc_en: 'Review your schedule carefully before confirming.', color: '#6366f1' },
              { icon: Clock,        ar: 'الحضور المبكر',      en: 'Early Arrival',        desc_ar: 'يفضل الحضور قبل الموعد بـ 10 دقائق لضمان البدء في الوقت.', desc_en: 'Arrive 10 minutes early to ensure starting on time.', color: '#f59e0b' },
              { icon: XCircle,      ar: 'سياسة الإلغاء',      en: 'Cancellation Policy',  desc_ar: 'يرجى الإلغاء قبل 24 ساعة على الأقل لفتح المجال لغيرك.', desc_en: 'Please cancel at least 24 hours before your appointment.', color: '#ef4444' },
              { icon: Phone,        ar: 'بيانات التواصل',     en: 'Contact Data',         desc_ar: 'تأكد من إدخال رقم هاتف صحيح لتلقي رسالة التأكيد.', desc_en: 'Ensure your phone number is correct to receive confirmation.', color: '#22c55e' },
            ].map((tip, i) => (
              <Card key={i} className="text-center hover:shadow-md transition-shadow">
                <CardContent className="pt-6 pb-5 space-y-3">
                  <div className="h-12 w-12 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: `${tip.color}15` }}>
                    <tip.icon className="h-5 w-5" style={{ color: tip.color }} />
                  </div>
                  <h3 className="font-bold text-sm">{isAr ? tip.ar : tip.en}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{isAr ? tip.desc_ar : tip.desc_en}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* ── FAQ SECTION ──────────────────────────────────────────────── */}
        <div id="section-faq">
          <div className="text-center space-y-2 mb-6">
            <h2 className="text-xl sm:text-2xl font-bold">
              <span className="text-primary">{isAr ? 'الأسئلة' : 'Frequently Asked'}</span>{' '}{isAr ? 'الشائعة' : 'Questions'}
            </h2>
          </div>
          <div className="space-y-3">
            {[
              { qAr: 'كيف يمكنني حجز موعد في العيادة؟', qEn: 'How can I book an appointment?', aAr: 'اضغط على زر "احجز موعدك الآن" أو اتصل مباشرة على رقم العيادة وسيتم تأكيد موعدك خلال دقائق.', aEn: 'Click "Book Appointment" or call the clinic directly, and your appointment will be confirmed within minutes.' },
              { qAr: 'هل تتوفر خدمات الطوارئ على مدار الساعة؟', qEn: 'Are emergency services available 24/7?', aAr: 'في حالات الطوارئ الحرجة يمكنك التواصل مع العيادة على الرقم المخصص وسيتم توجيهك للإجراء المناسب.', aEn: 'For critical emergencies, contact the clinic on the dedicated number and you will be guided to the appropriate procedure.' },
              { qAr: 'ما هي الفحوصات المطلوبة في الزيارة الأولى؟', qEn: 'What tests are required at the first visit?', aAr: 'يُنصح بإحضار أي فحوصات سابقة أو تقارير طبية. الطبيب سيحدد ما يلزم من فحوصات إضافية.', aEn: 'Bring any previous tests or medical reports. The doctor will determine any additional tests needed.' },
              { qAr: 'هل تتعامل العيادة مع شركات التأمين؟', qEn: 'Does the clinic accept insurance?', aAr: 'نتعاقد مع معظم شركات التأمين الكبرى. تواصل مع الاستقبال لمزيد من التفاصيل.', aEn: 'We work with most major insurance companies. Contact reception for more details.' },
              { qAr: 'كم تستغرق مدة الكشف عادةً؟', qEn: 'How long does a consultation take?', aAr: 'تستغرق الزيارة الاستشارية عادةً من 20 إلى 40 دقيقة حسب الحالة.', aEn: 'A consultation usually takes 20 to 40 minutes depending on the case.' },
            ].map((faq, i) => (
              <div key={i} className="border border-border rounded-xl overflow-hidden">
                <button className="w-full flex items-center justify-between p-4 text-start hover:bg-muted/30 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span className="font-medium text-sm">{isAr ? faq.qAr : faq.qEn}</span>
                  {openFaq === i ? <ChevronUp className="h-4 w-4 text-primary shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>
                {openFaq === i && (
                  <div className="px-4 pb-4 text-sm text-muted-foreground leading-relaxed border-t border-border pt-3">
                    {isAr ? faq.aAr : faq.aEn}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Medical Offers Section */}
        {clinicOffers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-5 w-5 text-primary" />
                {isAr ? 'العروض والخصومات' : 'Offers & Discounts'}
                <Badge variant="secondary" className="ml-auto text-xs">{clinicOffers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {clinicOffers.map(offer => {
                  const days = Math.max(0, Math.ceil((new Date(offer.expiresAt).getTime() - Date.now()) / 86400000));
                  return (
                    <div key={offer.id} className="border border-border/60 rounded-xl p-4 space-y-2 hover:border-primary/40 transition-colors" data-testid={`offer-card-${offer.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm leading-snug">{isAr ? offer.titleAr : offer.title}</p>
                        <Badge className="shrink-0 text-xs px-2 bg-primary/10 text-primary border-primary/20">
                          {OFFER_TYPE_LABELS[offer.offerType]?.[isAr ? 'ar' : 'en']}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{isAr ? offer.descriptionAr : offer.description}</p>
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
                      <div className="flex items-center justify-between">
                        <span className={`text-xs flex items-center gap-1 ${days <= 3 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                          <CalendarDays className="h-3 w-3" />
                          {days === 0
                            ? (isAr ? 'ينتهي اليوم' : 'Expires today')
                            : `${days} ${isAr ? 'يوم متبقي' : 'days left'}`}
                        </span>
                        {offer.doctorName && (
                          <span className="text-xs text-muted-foreground">{offer.doctorName}</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs mt-1"
                        onClick={() => {
                          if (!isAuthenticated) { navigate('/login'); return; }
                          setBookingDoctorId(offer.doctorId || doctors[0]?.id);
                          setBookingOpen(true);
                        }}
                        data-testid={`btn-book-offer-${offer.id}`}
                      >
                        {isAr ? 'احجز الآن' : 'Book Now'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── CONTACT SECTION ──────────────────────────────────────────── */}
        <div id="section-contact">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Booking/Contact Form */}
            <Card>
              <CardContent className="p-6">
                {contactSent ? (
                  <div className="text-center py-8 space-y-3">
                    <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                      <CheckCircle className="h-7 w-7 text-green-600" />
                    </div>
                    <h3 className="font-bold">{isAr ? 'تم إرسال رسالتك!' : 'Message Sent!'}</h3>
                    <p className="text-sm text-muted-foreground">{isAr ? 'سنتصل بك لتأكيد الموعد خلال دقائق' : 'We will call to confirm shortly'}</p>
                    <Button variant="outline" size="sm" onClick={() => { setContactSent(false); setContactForm({ name: '', phone: '', type: 'general', notes: '' }); }}>
                      {isAr ? 'إرسال استفسار آخر' : 'Send Another'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Send className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">{isAr ? 'احجز استشارتك' : 'Book Your Consultation'}</h3>
                        <p className="text-xs text-muted-foreground">{isAr ? 'سنتصل بك لتأكيد الموعد خلال دقائق' : 'We will call to confirm within minutes'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{isAr ? 'اسم المريض' : 'Patient Name'}</Label>
                        <Input placeholder={isAr ? 'الاسم الكامل' : 'Full Name'} value={contactForm.name}
                          onChange={e => setContactForm(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{isAr ? 'رقم الهاتف' : 'Phone Number'}</Label>
                        <Input placeholder="01XXXXXXXXX" value={contactForm.phone} dir="ltr"
                          onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))} className="h-9 text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'نوع الاستشارة' : 'Consultation Type'}</Label>
                      <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                        value={contactForm.type} onChange={e => setContactForm(p => ({ ...p, type: e.target.value }))}>
                        <option value="general">{isAr ? 'كشف عام' : 'General Checkup'}</option>
                        <option value="followup">{isAr ? 'متابعة' : 'Follow-up'}</option>
                        <option value="surgery">{isAr ? 'استشارة جراحية' : 'Surgical Consultation'}</option>
                        <option value="emergency">{isAr ? 'حالة طارئة' : 'Emergency'}</option>
                      </select>
                    </div>

                    {/* Specialty selector */}
                    {clinicSpecialties.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-xs">{isAr ? 'التخصص المطلوب' : 'Desired Specialty'}</Label>
                        <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={contactSpecialtyId} onChange={e => { setContactSpecialtyId(e.target.value); setAiSpecialtyMsg(null); }}>
                          <option value="">{isAr ? '-- اختر التخصص --' : '-- Select Specialty --'}</option>
                          {clinicSpecialties.map(s => (
                            <option key={s.id} value={s.id}>{isAr ? s.nameAr || s.name : s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'الأعراض / الملاحظات' : 'Symptoms / Notes'}</Label>
                      <Textarea placeholder={isAr ? 'اكتب أعراضك هنا ثم اضغط زر الذكاء الاصطناعي...' : 'Describe your symptoms, then press the AI button...'}
                        value={contactForm.notes} onChange={e => { setContactForm(p => ({ ...p, notes: e.target.value })); setAiSpecialtyMsg(null); }} rows={3} className="resize-none text-sm" />
                    </div>

                    {/* AI detect button */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 border-primary/50 text-primary hover:bg-primary/5"
                      onClick={handleAiDetectSpecialty}
                      disabled={isDetectingSpecialty || !contactForm.notes.trim()}
                    >
                      {isDetectingSpecialty
                        ? <><RefreshCw className="h-4 w-4 animate-spin" />{isAr ? 'جارٍ التحليل...' : 'Analyzing...'}</>
                        : <><Sparkles className="h-4 w-4" />{isAr ? 'حدد التخصص المناسب لأعراضك بالذكاء الاصطناعي' : 'AI: Detect Best Specialty for Your Symptoms'}</>
                      }
                    </Button>

                    {/* AI response message */}
                    {aiSpecialtyMsg && (
                      <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${aiSpecialtyMsg.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                        <Bot className="h-4 w-4 mt-0.5 shrink-0" />
                        <p>{aiSpecialtyMsg.text}</p>
                      </div>
                    )}

                    <Button className="w-full gap-2" disabled={!contactForm.name || !contactForm.phone}
                      onClick={() => {
                        const sp = clinicSpecialties.find(s => s.id === contactSpecialtyId);
                        consultationRequestStore.add({
                          id: `cr-${Date.now()}`,
                          clinicId: clinicId!,
                          patientName: contactForm.name,
                          patientPhone: contactForm.phone,
                          consultationType: contactForm.type,
                          specialtyId: contactSpecialtyId || undefined,
                          specialtyName: sp?.name,
                          specialtyNameAr: sp?.nameAr,
                          symptoms: contactForm.notes,
                          aiMessage: aiSpecialtyMsg?.text,
                          status: 'pending',
                          createdAt: new Date().toISOString(),
                        });
                        setContactSent(true);
                      }}>
                      <Send className="h-4 w-4" />{isAr ? 'ابعت رسالتك' : 'Send Message'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Clinic Info Card */}
            <Card>
              <CardContent className="p-6 space-y-4">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />{isAr ? 'معلومات العيادة' : 'Clinic Information'}
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{isAr ? 'موقعنا' : 'Location'}</p>
                      <p className="text-xs text-muted-foreground">{isAr ? clinic.addressAr || clinic.address : clinic.address}, {isAr ? clinic.cityAr : clinic.city}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                    <Phone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{isAr ? 'اتصل بنا' : 'Call Us'}</p>
                      <a href={`tel:${clinic.phone}`} className="text-xs text-primary hover:underline" dir="ltr">{clinic.phone}</a>
                    </div>
                  </div>
                  {clinic.workingHours && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                      <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium">{isAr ? 'ساعات العمل' : 'Working Hours'}</p>
                        <p className="text-xs text-muted-foreground">{isAr ? clinic.workingHoursAr || clinic.workingHours : clinic.workingHours}</p>
                      </div>
                    </div>
                  )}
                </div>
                {clinic.socialLinks && Object.values(clinic.socialLinks).some(Boolean) && (
                  <div>
                    <p className="text-xs font-medium mb-2">{isAr ? 'التواصل الاجتماعي' : 'Social Media'}</p>
                    <div className="flex gap-2">
                      {clinic.socialLinks.facebook && <a href={clinic.socialLinks.facebook} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"><SiFacebook className="h-4 w-4 text-blue-600 dark:text-blue-400" /></a>}
                      {clinic.socialLinks.instagram && <a href={clinic.socialLinks.instagram} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center hover:bg-pink-200 dark:hover:bg-pink-800/50 transition-colors"><SiInstagram className="h-4 w-4 text-pink-500 dark:text-pink-400" /></a>}
                      {clinic.socialLinks.linkedin && <a href={clinic.socialLinks.linkedin} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"><Linkedin className="h-4 w-4 text-blue-700 dark:text-blue-400" /></a>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  {isAr ? 'تقييمات المرضى' : 'Patient Reviews'}
                </CardTitle>
                {user?.role === 'patient' && !patientAlreadyRated && (
                  <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setRatingOpen(true)} data-testid="btn-rate-clinic">
                    <Star className="h-3 w-3" />{isAr ? 'قيّم' : 'Rate'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {clinicRating > 0 && (
                <div className="flex items-center gap-4 p-3 bg-muted/40 rounded-xl">
                  <span className="text-3xl font-bold">{clinicRating}</span>
                  <div>
                    <StarRating value={Math.round(clinicRating)} readOnly />
                    <p className="text-xs text-muted-foreground mt-0.5">{ratingCount} {isAr ? 'تقييم' : 'reviews'}</p>
                  </div>
                </div>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {reviews.map(r => (
                  <div key={r.id} className="p-3 border rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center"><User className="h-3.5 w-3.5 text-muted-foreground" /></div>
                        <StarRating value={r.stars} readOnly />
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    {r.comment && <p className="text-xs text-muted-foreground mt-2">{r.comment}</p>}
                  </div>
                ))}
                {reviews.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Star className="h-6 w-6 mx-auto mb-1 opacity-50" />
                    <p className="text-sm">{isAr ? 'لا توجد تقييمات بعد' : 'No reviews yet'}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Navigation className="h-5 w-5 text-primary" />
                {isAr ? 'موقع العيادة' : 'Clinic Location'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{isAr ? clinic.addressAr : clinic.address}, {isAr ? clinic.cityAr : clinic.city}</p>
              {embedUrl ? (
                <div className="rounded-xl overflow-hidden border border-border h-48">
                  <iframe
                    src={embedUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={isAr ? 'موقع العيادة' : 'Clinic Location'}
                  />
                </div>
              ) : (
                <div className="h-48 bg-muted/40 rounded-xl flex items-center justify-center border border-border border-dashed">
                  <div className="text-center text-muted-foreground">
                    <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{isAr ? 'الموقع غير محدد بدقة' : 'Precise coordinates not set'}</p>
                  </div>
                </div>
              )}
              <Button variant="outline" className="w-full gap-2" onClick={() => window.open(mapsUrl, '_blank')} data-testid="btn-get-directions">
                <Navigation className="h-4 w-4" />
                {isAr ? 'احصل على الاتجاهات' : 'Get Directions'}
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </CardContent>
          </Card>
        </div>
        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <footer className="mt-4 border-t border-border pt-8 pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <Stethoscope className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-bold text-sm">{isAr ? clinic.nameAr : clinic.name}</p>
                  <p className="text-xs text-muted-foreground">{isAr ? 'منصة الرعاية الطبية' : 'Medical Care Platform'}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isAr ? 'نسعى لتقديم أفضل خدمة طبية متكاملة بأحدث التقنيات العالمية وأعلى معايير الجودة لمرضانا.' : 'We strive to provide the best integrated medical service with the latest global technologies.'}
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">{isAr ? 'روابط هامة' : 'Quick Links'}</h4>
              <ul className="space-y-2">
                {[{id:'home',ar:'الرئيسية',en:'Home'},{id:'about',ar:'عن الطبيب',en:'About'},{id:'services',ar:'الخدمات',en:'Services'},{id:'booking',ar:'حجز موعد',en:'Book'},{id:'faq',ar:'الأسئلة الشائعة',en:'FAQ'}].map(l => (
                  <li key={l.id}>
                    <button className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                      onClick={() => document.getElementById(`section-${l.id}`)?.scrollIntoView({ behavior: 'smooth' })}>
                      <ChevronRight className="h-3 w-3" style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                      {isAr ? l.ar : l.en}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">{isAr ? 'مواعيد العيادة' : 'Clinic Hours'}</h4>
              {clinic.workingHours && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-muted-foreground">{isAr ? clinic.workingHoursAr || clinic.workingHours : clinic.workingHours}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs">
                <div className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                <span className="text-muted-foreground">{isAr ? 'الجمعة: عطلة رسمية' : 'Friday: Official Holiday'}</span>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">{isAr ? 'تواصل معنا' : 'Contact Us'}</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground">{isAr ? clinic.addressAr || clinic.address : clinic.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                  <a href={`tel:${clinic.phone}`} className="text-xs text-muted-foreground hover:text-primary" dir="ltr">{clinic.phone}</a>
                </div>
                {clinic.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                    <a href={clinic.website} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary">{isAr ? 'زيارة الموقع' : 'Visit Website'}</a>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} {isAr ? `جميع الحقوق محفوظة لـ ${clinic.nameAr}` : `All rights reserved to ${clinic.name}`}</p>
            <p className="text-xs text-muted-foreground">{isAr ? 'تم التطوير بواسطة ' : 'Powered by '}<span className="text-primary font-medium">ClinicFlow</span></p>
          </div>
        </footer>

      </div>

      {/* ── FLOATING BUTTONS ─────────────────────────────────────────── */}
      <div className="fixed bottom-6 z-50 flex flex-col gap-3" style={{ left: isRTL ? '1.5rem' : 'auto', right: isRTL ? 'auto' : '1.5rem' }}>
        {clinic.phone && (
          <a href={`https://wa.me/2${clinic.phone.replace(/^0/, '')}?text=${encodeURIComponent(isAr ? `مرحباً، أريد حجز موعد في ${clinic.nameAr}` : `Hello, I would like to book an appointment at ${clinic.name}`)}`}
            target="_blank" rel="noopener noreferrer"
            className="h-12 w-12 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
            style={{ backgroundColor: '#25D366' }} title={isAr ? 'تواصل عبر واتساب' : 'WhatsApp'}>
            <MessageCircle className="h-6 w-6 text-white" />
          </a>
        )}
        <button className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shadow-lg hover:scale-110 transition-transform opacity-80 hover:opacity-100"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} title={isAr ? 'العودة للأعلى' : 'Back to top'}>
          <ChevronUp className="h-5 w-5 text-primary-foreground" />
        </button>
      </div>

      <Dialog open={ratingOpen} onOpenChange={setRatingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{isAr ? 'تقييم العيادة' : 'Rate the Clinic'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-center"><StarRating value={newStars} onChange={setNewStars} /></div>
            <div className="space-y-2">
              <Label>{isAr ? 'تعليق (اختياري)' : 'Comment (optional)'}</Label>
              <Textarea value={newComment} onChange={e => setNewComment(e.target.value)} rows={3} data-testid="input-clinic-review" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRatingOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSubmitRating} data-testid="btn-submit-clinic-review">{isAr ? 'إرسال' : 'Submit'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5" />
              {isAr ? 'مسح رمز QR لمشاركة العيادة' : 'Scan QR to Share Clinic'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="p-3 bg-white rounded-xl border border-border shadow-sm">
              <QRCodeSVG value={clinicUrl} size={200} />
            </div>
            <p className="text-xs text-muted-foreground break-all px-2">{clinicUrl}</p>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 w-full"
              onClick={() => { navigator.clipboard.writeText(clinicUrl); toast({ title: isAr ? 'تم نسخ الرابط' : 'Link copied!' }); }}
              data-testid="btn-copy-clinic-link"
            >
              <Copy className="h-4 w-4" />
              {isAr ? 'نسخ الرابط' : 'Copy Link'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5" />{isAr ? 'تعديل ملف العيادة' : 'Edit Clinic Profile'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* ── Banner Image ── */}
            <div className="space-y-2">
              <Label>{isAr ? 'صورة البانر (الهيرو)' : 'Hero Banner Image'}</Label>
              <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerFile} />
              <div
                className="relative w-full h-32 rounded-xl overflow-hidden border-2 border-dashed border-border bg-muted cursor-pointer group"
                onClick={() => bannerInputRef.current?.click()}
              >
                {editData.coverImageUrl ? (
                  <>
                    <img src={editData.coverImageUrl} alt="banner" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="h-5 w-5 text-white" />
                      <span className="text-white text-sm font-medium">{isAr ? 'تغيير الصورة' : 'Change Image'}</span>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <ImagePlus className="h-8 w-8" />
                    <span className="text-sm">{isAr ? 'اضغط لرفع صورة البانر' : 'Click to upload banner image'}</span>
                  </div>
                )}
              </div>
              {editData.coverImageUrl && (
                <Button variant="ghost" size="sm" className="text-destructive gap-1.5 h-7"
                  onClick={() => setEditData(p => ({ ...p, coverImageUrl: undefined }))}>
                  <Trash2 className="h-3.5 w-3.5" />{isAr ? 'حذف الصورة' : 'Remove Image'}
                </Button>
              )}
            </div>
            <Separator />
            <div className="space-y-1">
              <Label>{isAr ? 'الوصف (إنجليزي)' : 'Description (English)'}</Label>
              <Textarea value={editData.description || ''} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-1">
              <Label>{isAr ? 'الوصف (عربي)' : 'Description (Arabic)'}</Label>
              <Textarea value={editData.descriptionAr || ''} onChange={e => setEditData(p => ({ ...p, descriptionAr: e.target.value }))} rows={3} dir="rtl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isAr ? 'ساعات العمل (إنجليزي)' : 'Working Hours (EN)'}</Label>
                <Input value={editData.workingHours || ''} onChange={e => setEditData(p => ({ ...p, workingHours: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'ساعات العمل (عربي)' : 'Working Hours (AR)'}</Label>
                <Input value={editData.workingHoursAr || ''} onChange={e => setEditData(p => ({ ...p, workingHoursAr: e.target.value }))} dir="rtl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isAr ? 'خط العرض' : 'Latitude'}</Label>
                <Input type="number" step="0.0001" value={editData.latitude || ''} onChange={e => setEditData(p => ({ ...p, latitude: Number(e.target.value) || undefined }))} placeholder="30.0444" />
              </div>
              <div className="space-y-1">
                <Label>{isAr ? 'خط الطول' : 'Longitude'}</Label>
                <Input type="number" step="0.0001" value={editData.longitude || ''} onChange={e => setEditData(p => ({ ...p, longitude: Number(e.target.value) || undefined }))} placeholder="31.2357" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{isAr ? 'الموقع الإلكتروني' : 'Website URL'}</Label>
              <Input value={editData.website || ''} onChange={e => setEditData(p => ({ ...p, website: e.target.value }))} placeholder="https://..." />
            </div>
            <Separator />
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{isAr ? 'إحصائيات العيادة (قيم البداية)' : 'Clinic Statistics (Base Values)'}</p>
            <p className="text-xs text-muted-foreground">{isAr ? 'حدد قيم البداية. سيُضاف إليها تلقائياً ما يتم تسجيله عبر المنصة.' : 'Set initial base values. Platform activity will be added automatically.'}</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'سنة التأسيس' : 'Founded Year'}</Label>
                <Input type="number" placeholder="2010" value={editData.statsFoundedYear || ''}
                  onChange={e => setEditData(p => ({ ...p, statsFoundedYear: Number(e.target.value) || undefined }))} className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'مرضى (قاعدة)' : 'Patients (base)'}</Label>
                <Input type="number" placeholder="0" value={editData.statsBasePatients ?? ''}
                  onChange={e => setEditData(p => ({ ...p, statsBasePatients: Number(e.target.value) || 0 }))} className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{isAr ? 'عمليات (قاعدة)' : 'Surgeries (base)'}</Label>
                <Input type="number" placeholder="0" value={editData.statsBaseSurgeries ?? ''}
                  onChange={e => setEditData(p => ({ ...p, statsBaseSurgeries: Number(e.target.value) || 0 }))} className="text-sm" />
              </div>
            </div>
            <Separator />
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{isAr ? 'روابط التواصل الاجتماعي' : 'Social Media Links'}</p>
            {[
              { key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/...' },
              { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
              { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/...' },
              { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@...' },
              { key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@...' },
              { key: 'twitter', label: 'X / Twitter', placeholder: 'https://x.com/...' },
              { key: 'website', label: isAr ? 'موقع' : 'Website', placeholder: 'https://...' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="flex items-center gap-2">
                <Label className="w-24 shrink-0 text-xs">{label}</Label>
                <Input
                  value={(editData.socialLinks as Record<string, string> | undefined)?.[key] || ''}
                  onChange={e => setEditData(p => ({ ...p, socialLinks: { ...p.socialLinks, [key]: e.target.value || undefined } }))}
                  placeholder={placeholder}
                  className="text-xs"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSaveEdit} data-testid="btn-save-clinic-profile">{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Doctor Booking Wizard ──────────────────────────────────────── */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-0">
            <DialogTitle>{isAr ? 'حجز موعد' : 'Book Appointment'}</DialogTitle>
          </DialogHeader>
          {bookingOpen && (
            <BookingWizard
              patientId={user?.patientId || user?.id}
              initialDoctorId={bookingDoctorId}
              initialClinicId={clinicId}
              onComplete={() => setBookingOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ─── AI Booking Assistant ─────────────────────────────────────── */}
      <AIBookingAssistant
        initialClinicId={clinicId}
        patientId={user?.role === 'patient' ? (user.patientId || user.id) : undefined}
      />
    </div>
  );
}
