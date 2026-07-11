import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EGYPT_GOVERNORATES } from '@/lib/governorates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Stethoscope, MapPin, Star, ChevronLeft, ChevronRight, Calendar,
  Clock, Building2, Users, Brain, ArrowRight, Phone, Shield, Award,
  Heart, Activity, Microscope, Bone, Eye, Baby, Search, Navigation,
  Tag, CheckCircle, Facebook, Instagram, Linkedin, Youtube, Twitter,
  Globe, Zap, TrendingUp, MessageSquare, QrCode, Home, LogOut,
} from 'lucide-react';
import HomeVisitBookingDialog from '@/components/HomeVisitBookingDialog';
import BookingWizard from '@/components/BookingWizard';
import AIBookingAssistant from '@/components/AIBookingAssistant';
import { clinicStore } from '@/stores/clinicStore';
import { userStore } from '@/stores/userStore';
import { specialtyStore } from '@/stores/specialtyStore';
import { doctorClinicStore } from '@/stores/doctorClinicStore';
import { scheduleStore } from '@/stores/scheduleStore';
import { getAverageRating, getRatingsForTarget } from '@/stores/ratingStore';
import { getActiveOffers } from '@/stores/offerStore';
import { Clinic, User, Specialty } from '@/types';
import logoImg from '@assets/Untitled_design_1772868317886.png';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNextSlot(doctorId: string): string | null {
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayOfWeek = d.getDay();
    const schedule = scheduleStore.get(
      (s) => s.doctorId === doctorId && s.dayOfWeek === dayOfWeek && s.isActive
    );
    if (schedule) {
      const [h, m] = schedule.startTime.split(':').map(Number);
      if (i === 0) {
        const now = new Date();
        if (h * 60 + m <= now.getHours() * 60 + now.getMinutes()) continue;
      }
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return `${label} ${schedule.startTime}`;
    }
  }
  return null;
}

// ─── Slider ──────────────────────────────────────────────────────────────────

const SLIDES = [
  {
    gradient: 'from-blue-600 to-cyan-500',
    icon: <Search className="h-16 w-16 text-white/80" />,
    title: 'Find and Book the Best Doctors',
    subtitle: 'Search by specialty or location and get instant appointment confirmation.',
  },
  {
    gradient: 'from-emerald-600 to-teal-500',
    icon: <Building2 className="h-16 w-16 text-white/80" />,
    title: 'Manage Your Clinic Efficiently',
    subtitle: 'Powerful tools for scheduling, queue management, and patient records.',
  },
  {
    gradient: 'from-violet-600 to-purple-500',
    icon: <Brain className="h-16 w-16 text-white/80" />,
    title: 'AI Assistant for Smarter Booking',
    subtitle: 'Our AI helps patients choose the right doctor based on their symptoms.',
  },
];

function HeroSlider() {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const next = useCallback(() => setCurrent((c) => (c + 1) % SLIDES.length), []);
  const prev = useCallback(() => setCurrent((c) => (c - 1 + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    timerRef.current = setInterval(next, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [next]);

  const slide = SLIDES[current];

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${slide.gradient} transition-all duration-700`} style={{ minHeight: 260 }}>
      <div className="flex flex-col items-center justify-center h-full py-14 px-6 text-center gap-4">
        {slide.icon}
        <h2 className="text-2xl md:text-3xl font-bold text-white">{slide.title}</h2>
        <p className="text-white/80 text-sm md:text-base max-w-lg">{slide.subtitle}</p>
      </div>
      <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 rounded-full p-2 transition-colors" data-testid="slider-prev">
        <ChevronLeft className="h-5 w-5 text-white" />
      </button>
      <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 rounded-full p-2 transition-colors" data-testid="slider-next">
        <ChevronRight className="h-5 w-5 text-white" />
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`h-2 rounded-full transition-all ${i === current ? 'w-6 bg-white' : 'w-2 bg-white/50'}`}
            data-testid={`slider-dot-${i}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Specialty Icons ──────────────────────────────────────────────────────────

const SPECIALTY_ICONS: Record<string, ReactNode> = {
  'General Medicine': <Activity className="h-7 w-7" />,
  'Pediatrics': <Baby className="h-7 w-7" />,
  'Cardiology': <Heart className="h-7 w-7" />,
  'Dermatology': <Microscope className="h-7 w-7" />,
  'Orthopedics': <Bone className="h-7 w-7" />,
  'Neurology': <Brain className="h-7 w-7" />,
  'Dentistry': <Shield className="h-7 w-7" />,
  'Ophthalmology': <Eye className="h-7 w-7" />,
};

const SPECIALTY_COLORS = [
  'bg-blue-50 text-blue-600 hover:bg-blue-100',
  'bg-emerald-50 text-emerald-600 hover:bg-emerald-100',
  'bg-rose-50 text-rose-600 hover:bg-rose-100',
  'bg-violet-50 text-violet-600 hover:bg-violet-100',
  'bg-amber-50 text-amber-600 hover:bg-amber-100',
  'bg-cyan-50 text-cyan-600 hover:bg-cyan-100',
  'bg-pink-50 text-pink-600 hover:bg-pink-100',
  'bg-indigo-50 text-indigo-600 hover:bg-indigo-100',
];

// ─── Star Display ─────────────────────────────────────────────────────────────

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} className={`h-3.5 w-3.5 ${s <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`} />
      ))}
    </span>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────

const LandingPage = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const isPatientLoggedIn = isAuthenticated && user?.role === 'patient';
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  // ─── View-All dialogs
  const [showAllClinics, setShowAllClinics] = useState(false);
  const [clinicSearch, setClinicSearch] = useState('');
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const [apptSearch, setApptSearch] = useState('');
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [offersTab, setOffersTab] = useState<'latest' | 'featured'>('latest');
  const [offerSearch, setOfferSearch] = useState('');
  const [showHvDialog, setShowHvDialog] = useState(false);
  const [offerBookingOpen, setOfferBookingOpen] = useState(false);
  const [offerBookingDoctorId, setOfferBookingDoctorId] = useState<string | undefined>(undefined);

  const handleOfferBook = (clinicId: string) => {
    setShowAllOffers(false);
    navigate(`/clinic/${clinicId}`);
  };

  const allDoctors = userStore.filter((u) => u.role === 'doctor' && u.isActive);
  const homeVisitDoctors = allDoctors.filter((d) => d.homeVisitEnabled);
  const clinics = clinicStore.getAll();
  const specialties = specialtyStore.filter((s) => s.isActive);
  const offers = getActiveOffers();

  // ─── Ratings map
  const doctorRatings = Object.fromEntries(
    allDoctors.map((d) => [d.id, getAverageRating(d.id, 'doctor')])
  );

  // ─── Top rated doctors (sorted by avg rating)
  const topDoctors = [...allDoctors]
    .sort((a, b) => (doctorRatings[b.id]?.avg ?? 0) - (doctorRatings[a.id]?.avg ?? 0))
    .slice(0, 6);

  // ─── Search-filtered doctors
  const searchedDoctors = allDoctors.filter((d) => {
    const matchSpec = !selectedSpecialty || d.specialtyId === selectedSpecialty;
    const matchCity = !selectedCity || (() => {
      const links = doctorClinicStore.filter((l) => l.doctorId === d.id && l.isActive);
      const cIds = links.length > 0 ? links.map((l) => l.clinicId) : [d.clinicId];
      return cIds.some((cId) => {
        const clinic = clinicStore.get((c) => c.id === cId);
        return clinic?.city.toLowerCase() === selectedCity.toLowerCase();
      });
    })();
    return matchSpec && matchCity;
  });

  // ─── Nearest available appointments (today/tomorrow)
  const allUpcomingAppointments = allDoctors
    .map((doc) => {
      const slot = getNextSlot(doc.id);
      const links = doctorClinicStore.filter((l) => l.doctorId === doc.id && l.isActive);
      const clinicId = links.length > 0 ? links[0].clinicId : doc.clinicId;
      const clinic = clinicStore.get((c) => c.id === clinicId);
      return { doc, slot, clinic };
    })
    .filter((x) => x.slot !== null);
  const upcomingAppointments = allUpcomingAppointments.slice(0, 6);

  // ─── Patient testimonials from ratings
  const allRatings = clinics.flatMap((c) => getRatingsForTarget(c.id, 'clinic'));
  const testimonials = allRatings.filter((r) => r.comment).slice(0, 4);

  // ─── Nearby doctors
  const requestLocation = () => {
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationLoading(false);
      },
      () => setLocationLoading(false)
    );
  };

  const nearbyDoctors = userLocation
    ? allDoctors
        .map((doc) => {
          const links = doctorClinicStore.filter((l) => l.doctorId === doc.id && l.isActive);
          const cId = links.length > 0 ? links[0].clinicId : doc.clinicId;
          const clinic = clinicStore.get((c) => c.id === cId);
          const dist =
            clinic?.latitude && clinic?.longitude
              ? calcDistance(userLocation.lat, userLocation.lng, clinic.latitude, clinic.longitude)
              : Infinity;
          return { doc, clinic, dist };
        })
        .filter((x) => x.dist < 100)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 4)
    : [];

  const getSpecialtyName = (id: string) => specialties.find((s) => s.id === id)?.name ?? '';

  const cities = [...new Set(clinics.map((c) => c.city))];

  // ─── Doctor card
  const DoctorCard = ({ doc, showDistance, dist }: { doc: User; showDistance?: boolean; dist?: number }) => {
    const rating = doctorRatings[doc.id] ?? { avg: 0, count: 0 };
    const slot = getNextSlot(doc.id);
    const links = doctorClinicStore.filter((l) => l.doctorId === doc.id && l.isActive);
    const allDocClinics = (links.length > 0 ? links.map((l) => l.clinicId) : [doc.clinicId])
      .map((cid) => clinicStore.get((c) => c.id === cid))
      .filter(Boolean) as NonNullable<ReturnType<typeof clinicStore.get>>[];
    const docCities = [...new Set(allDocClinics.map((c) => c.city))];
    const clinic = allDocClinics[0];

    return (
      <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/doctor/${doc.id}`)} data-testid={`card-doctor-${doc.id}`}>
        <CardContent className="p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Stethoscope className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground text-sm truncate">{doc.name}</h3>
              <p className="text-xs text-muted-foreground truncate">{getSpecialtyName(doc.specialtyId ?? '')}</p>
              {clinic && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Building2 className="h-3 w-3" />
                  <span className="truncate">{allDocClinics.map((c) => c.name).join(' · ')}</span>
                </p>
              )}
              {docCities.length > 0 && (
                <p className="text-xs text-primary/80 font-medium flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3" />
                  {docCities.join(' · ')}
                </p>
              )}
            </div>
          </div>
          {rating.count > 0 && (
            <div className="flex items-center gap-1.5 mb-2">
              <Stars rating={rating.avg} />
              <span className="text-xs text-muted-foreground">{rating.avg} ({rating.count})</span>
            </div>
          )}
          {showDistance && dist !== undefined && dist < Infinity && (
            <p className="text-xs text-emerald-600 flex items-center gap-1 mb-2">
              <Navigation className="h-3 w-3" />
              {dist.toFixed(1)} {isAr ? 'كم' : 'km away'}
            </p>
          )}
          {slot && (
            <p className="text-xs text-blue-600 flex items-center gap-1 mb-3">
              <Clock className="h-3 w-3" />
              {slot}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 text-xs h-8"
              onClick={(e) => { e.stopPropagation(); navigate(`/doctor/${doc.id}`); }}
              data-testid={`button-view-profile-landing-${doc.id}`}
            >
              {isAr ? 'عرض الملف' : 'View Profile'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs h-8"
              onClick={(e) => {
                e.stopPropagation();
                if (isAuthenticated && user) {
                  setOfferBookingDoctorId(doc.id);
                  setOfferBookingOpen(true);
                } else {
                  navigate('/login');
                }
              }}
              data-testid={`button-quick-book-${doc.id}`}
            >
              {isAr ? 'احجز سريع' : 'Quick Book'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* ─── Navigation ──────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <img src={logoImg} alt="ClinicFlow" className="h-9 w-9 rounded-lg" />
              <span className="text-lg font-bold text-foreground">ClinicFlow</span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
              <button onClick={() => document.getElementById('doctors-section')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-primary transition-colors" data-testid="nav-find-doctors">{isAr ? 'ابحث عن طبيب' : 'Find Doctors'}</button>
              <button onClick={() => document.getElementById('specialties-section')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-primary transition-colors" data-testid="nav-specialties">{isAr ? 'التخصصات' : 'Specialties'}</button>
              <button onClick={() => document.getElementById('offers-section')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-primary transition-colors" data-testid="nav-offers">{isAr ? 'عروض طبية' : 'Medical Offers'}</button>
              <button onClick={() => document.getElementById('home-visits-section')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-emerald-600 text-emerald-600 font-medium transition-colors flex items-center gap-1" data-testid="nav-home-visits"><Home className="h-3.5 w-3.5" />{isAr ? 'زيارة منزلية' : 'Home Visits'}</button>
              <button onClick={() => document.getElementById('for-doctors-section')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-primary transition-colors" data-testid="nav-for-doctors">{isAr ? 'للأطباء' : 'For Doctors'}</button>
              <button onClick={() => document.getElementById('for-clinics-section')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-primary transition-colors" data-testid="nav-for-clinics">{isAr ? 'للعيادات' : 'For Clinics'}</button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                data-testid="button-toggle-language"
              >
                {language === 'en' ? 'AR' : 'EN'}
              </Button>
              {isAuthenticated ? (
                <>
                  <span className="text-sm text-muted-foreground hidden sm:inline font-medium">
                    {user?.name}
                  </span>
                  {isPatientLoggedIn && (
                    <Button size="sm" onClick={() => navigate('/patient/appointments')} data-testid="button-nav-my-appointments">
                      {isAr ? 'مواعيدي' : 'My Appointments'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-muted-foreground hover:text-foreground"
                    onClick={() => { logout(); navigate('/'); }}
                    data-testid="button-nav-logout"
                  >
                    <LogOut className="h-4 w-4" />
                    {isAr ? 'خروج' : 'Logout'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => navigate('/login')} data-testid="button-nav-login">{isAr ? 'تسجيل الدخول' : 'Login'}</Button>
                  <Button size="sm" onClick={() => navigate('/register')} data-testid="button-nav-signup">{isAr ? 'سجل الآن' : 'Sign Up'}</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-16">

        {/* ─── Hero Section ─────────────────────────────────────────── */}
        <section className="space-y-8">
          <div className="text-center space-y-4 py-8">
            <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5 px-4 py-1 text-sm">
              {isAr ? 'المنصة الطبية الأولى في مصر' : "Egypt's #1 Medical Booking Platform"}
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
              {isAr ? <>ابحث واحجز مع <span className="text-primary">أفضل الأطباء</span> بالقرب منك</> : <>Find and Book the <span className="text-primary">Best Doctors</span> Near You</>}
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              {isAr ? 'ابحث عن الأطباء حسب التخصص والموقع، اقرأ آراء المرضى، واحجز مواعيدك فورًا — كل ذلك في مكان واحد.' : 'Search doctors by specialty and location, read verified reviews, and book appointments instantly — all in one place.'}
            </p>
            <div className="flex flex-wrap gap-3 justify-center mt-6">
              {isPatientLoggedIn ? (
                <>
                  <Button size="lg" onClick={() => navigate('/patient/book')} data-testid="button-hero-book">
                    {isAr ? 'احجز موعد' : 'Book an Appointment'}
                  </Button>
                  <Button
                    size="lg"
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                    onClick={() => setShowHvDialog(true)}
                    data-testid="button-hero-home-visit"
                  >
                    <Home className="h-5 w-5" />
                    {isAr ? 'اطلب زيارة منزلية' : 'Request Home Visit'}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => navigate('/patient/appointments')} data-testid="button-hero-appointments">
                    {isAr ? 'مواعيدي' : 'My Appointments'}
                  </Button>
                </>
              ) : (
                <>
                  <Button size="lg" onClick={() => navigate('/register?type=patient')} data-testid="button-hero-patient">
                    {isAr ? 'سجّل كمريض' : 'Sign Up as Patient'}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => navigate('/cf-admin-access')} data-testid="button-hero-super-admin">
                    {isAr ? 'إدارة المنصة' : 'Platform Admin'}
                  </Button>
                  <Button
                    size="lg"
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                    onClick={() => setShowHvDialog(true)}
                    data-testid="button-hero-home-visit"
                  >
                    <Home className="h-5 w-5" />
                    {isAr ? 'اطلب زيارة منزلية' : 'Request Home Visit'}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => navigate('/register?type=doctor')} data-testid="button-hero-doctor">
                    {isAr ? 'سجّل كطبيب' : 'Register as Doctor'}
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => navigate('/register?type=clinic')} data-testid="button-hero-clinic">
                    {isAr ? 'سجّل عيادتك' : 'Register a Clinic'}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Search Box */}
          <div className="bg-white rounded-2xl shadow-lg border border-border p-6">
            <h2 className="text-center text-base font-semibold text-foreground mb-4">{isAr ? 'ابحث عن طبيب' : 'Search for a Doctor'}</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                <SelectTrigger className="flex-1" data-testid="select-specialty">
                  <SelectValue placeholder={isAr ? 'اختر التخصص' : 'Select Specialty'} />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="_all">{isAr ? 'كل التخصصات' : 'All Specialties'}</SelectItem>
                  {specialties.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{isAr ? s.nameAr : s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger className="flex-1" data-testid="select-city">
                  <SelectValue placeholder={isAr ? 'اختر المحافظة' : 'Select Governorate'} />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="_all">{isAr ? 'كل المحافظات' : 'All Governorates'}</SelectItem>
                  {EGYPT_GOVERNORATES.map((g) => (
                    <SelectItem key={g.en} value={g.en}>{isAr ? g.ar : g.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="sm:w-auto gap-2"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (selectedSpecialty && selectedSpecialty !== '_all') params.set('specialty', selectedSpecialty);
                  if (selectedCity && selectedCity !== '_all') params.set('city', selectedCity);
                  navigate(`/search?${params.toString()}`);
                }}
                data-testid="button-search"
              >
                <Search className="h-4 w-4" />
                {isAr ? 'ابحث عن طبيب' : 'Find Doctor'}
              </Button>
            </div>
          </div>

          {/* Image Slider */}
          <HeroSlider />
        </section>

        {/* ─── Nearest Available Appointments ───────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{isAr ? 'أقرب المواعيد المتاحة' : 'Nearest Available Appointments'}</h2>
              <p className="text-muted-foreground text-sm mt-1">{isAr ? 'احجز مكانك قبل أن يمتلئ' : 'Book your slot before it fills up'}</p>
            </div>
            {allUpcomingAppointments.length > 6 && (
              <Button variant="outline" size="sm" className="gap-1.5 text-sm" onClick={() => setShowAllAppointments(true)} data-testid="btn-view-all-appointments">
                {isAr ? 'مشاهدة الكل' : 'View All'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingAppointments.map(({ doc, slot, clinic }) => (
              <Card
                key={doc.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/doctor/${doc.id}`)}
                data-testid={`card-appointment-${doc.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Stethoscope className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{getSpecialtyName(doc.specialtyId ?? '')}</p>
                    </div>
                  </div>
                  {clinic && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                      <Building2 className="h-3 w-3" />
                      {clinic.name}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-3 py-2 mb-3">
                    <Calendar className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">{slot}</span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={(e) => { e.stopPropagation(); navigate('/login'); }}
                    data-testid={`button-book-now-${doc.id}`}
                  >
                    {isAr ? 'احجز الآن' : 'Book Now'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ─── Top Rated Doctors ─────────────────────────────────────── */}
        <section id="doctors-section">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{isAr ? 'أعلى الأطباء تقييمًا' : 'Top Rated Doctors'}</h2>
              <p className="text-muted-foreground text-sm mt-1">
                {(selectedSpecialty && selectedSpecialty !== '_all') || (selectedCity && selectedCity !== '_all')
                  ? (isAr ? `نتائج مفلترة (${searchedDoctors.length} نتيجة)` : `Showing filtered results (${searchedDoctors.length} found)`)
                  : (isAr ? 'موثوق به من آلاف المرضى' : 'Trusted by thousands of patients')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {((selectedSpecialty && selectedSpecialty !== '_all') || (selectedCity && selectedCity !== '_all')
              ? searchedDoctors
              : topDoctors
            ).map((doc) => (
              <DoctorCard key={doc.id} doc={doc} />
            ))}
          </div>
        </section>

        {/* ─── Medical Specialties ──────────────────────────────────── */}
        <section id="specialties-section">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground">{isAr ? 'تصفح حسب التخصص' : 'Browse by Specialty'}</h2>
            <p className="text-muted-foreground text-sm mt-1">{isAr ? 'ابحث عن الطبيب المناسب لاحتياجك' : 'Find the right specialist for your needs'}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {specialties.map((spec, idx) => (
              <button
                key={spec.id}
                className={`flex flex-col items-center gap-3 p-5 rounded-xl border border-border transition-all cursor-pointer ${SPECIALTY_COLORS[idx % SPECIALTY_COLORS.length]}`}
                onClick={() => {
                  setSelectedSpecialty(spec.id);
                  document.getElementById('doctors-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                data-testid={`button-specialty-${spec.id}`}
              >
                {SPECIALTY_ICONS[spec.name] ?? <Activity className="h-7 w-7" />}
                <span className="text-sm font-semibold">{spec.name}</span>
                <span className="text-xs opacity-70">
                  {allDoctors.filter((d) => d.specialtyId === spec.id).length} {isAr ? 'طبيب' : 'Doctors'}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ─── Medical Offers ───────────────────────────────────────── */}
        <section id="offers-section">
          <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{isAr ? 'أحدث العروض الطبية' : 'Latest Medical Offers'}</h2>
              <p className="text-muted-foreground text-sm mt-1">{isAr ? 'عروض حصرية من أفضل العيادات' : 'Exclusive deals from top clinics'}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setOffersTab('latest')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${offersTab === 'latest' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                  data-testid="btn-offers-latest"
                >
                  {isAr ? 'الأحدث' : 'Latest'}
                </button>
                <button
                  onClick={() => setOffersTab('featured')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${offersTab === 'featured' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                  data-testid="btn-offers-featured"
                >
                  {isAr ? 'الأكثر تميزاً' : 'Most Featured'}
                </button>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5 text-sm" onClick={() => setShowAllOffers(true)} data-testid="btn-view-all-offers">
                {isAr ? 'مشاهدة الكل' : 'View All'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(offersTab === 'featured'
              ? [...offers].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))
              : offers
            ).slice(0, 4).map((offer) => (
              <Card key={offer.id} className="hover:shadow-md transition-shadow" data-testid={`card-offer-${offer.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">{offer.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{offer.clinicName}</p>
                      {offer.doctorName && (
                        <p className="text-xs text-muted-foreground">{offer.doctorName}</p>
                      )}
                    </div>
                    {offer.originalPrice && offer.discountedPrice && offer.originalPrice !== offer.discountedPrice && (
                      <div className="text-right">
                        <p className="text-xs line-through text-muted-foreground">{offer.originalPrice} ج.م</p>
                        <p className="text-base font-bold text-primary">{offer.discountedPrice} ج.م</p>
                        <Badge className="text-xs bg-rose-100 text-rose-700 border-0">
                          {Math.round((1 - offer.discountedPrice / offer.originalPrice) * 100)}% OFF
                        </Badge>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{offer.description}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {isAr ? 'ينتهي' : 'Expires'} {new Date(offer.expiresAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <Button size="sm" className="text-xs h-7" onClick={() => handleOfferBook(offer.clinicId)} data-testid={`button-offer-book-${offer.id}`}>
                      {isAr ? 'احجز الآن' : 'Book Now'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* ─── Home Visit Doctors ───────────────────────────────────── */}
        {homeVisitDoctors.length > 0 && (
          <section id="home-visits-section">
            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Home className="h-5 w-5 text-emerald-600" />
                  <h2 className="text-2xl font-bold text-foreground">
                    {isAr ? 'أطباء الزيارات المنزلية' : 'Home Visit Doctors'}
                  </h2>
                </div>
                <p className="text-muted-foreground text-sm">
                  {isAr ? 'أطباء متخصصون يزورونك في بيتك' : 'Qualified doctors who come to you'}
                </p>
              </div>
              <Button
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                onClick={() => setShowHvDialog(true)}
                data-testid="button-request-home-visit"
              >
                <Home className="h-4 w-4" />
                {isAr ? 'اطلب زيارة منزلية' : 'Request Home Visit'}
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {homeVisitDoctors.map((doc) => {
                const spec = specialties.find((s) => s.id === doc.specialtyId);
                const rating = doctorRatings[doc.id] ?? { avg: 0, count: 0 };
                return (
                  <Card
                    key={doc.id}
                    className="hover:shadow-md transition-shadow border border-emerald-100 dark:border-emerald-900/40 cursor-pointer"
                    onClick={() => navigate(`/doctor/${doc.id}`)}
                    data-testid={`card-hv-doctor-${doc.id}`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                          <Stethoscope className="h-6 w-6 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate">
                            {isAr ? doc.nameAr : doc.name}
                          </p>
                          <p className="text-xs text-muted-foreground">{spec?.name}</p>
                          {rating.count > 0 && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              <span className="text-xs text-muted-foreground">
                                {rating.avg.toFixed(1)} ({rating.count})
                              </span>
                            </div>
                          )}
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs shrink-0">
                          <Home className="h-3 w-3 mr-1" />
                          {isAr ? 'منزلي' : 'Home'}
                        </Badge>
                      </div>
                      <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
                        {doc.homeVisitPrice && (
                          <div className="flex items-center justify-between">
                            <span>{isAr ? 'سعر الزيارة' : 'Visit Price'}</span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {doc.homeVisitPrice} ج.م
                            </span>
                          </div>
                        )}
                        {doc.homeVisitDurationMin && (
                          <div className="flex items-center justify-between">
                            <span>{isAr ? 'مدة الزيارة' : 'Duration'}</span>
                            <span>{doc.homeVisitDurationMin} {isAr ? 'دقيقة' : 'min'}</span>
                          </div>
                        )}
                        {doc.homeVisitRadiusKm && (
                          <div className="flex items-center justify-between">
                            <span>{isAr ? 'نطاق التغطية' : 'Coverage'}</span>
                            <span>{doc.homeVisitRadiusKm} {isAr ? 'كم' : 'km'}</span>
                          </div>
                        )}
                        {doc.homeVisitAreas && doc.homeVisitAreas.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {doc.homeVisitAreas.slice(0, 3).map((area) => (
                              <Badge key={area} variant="outline" className="text-xs py-0 px-1.5 border-emerald-200 text-emerald-700">
                                {area}
                              </Badge>
                            ))}
                            {doc.homeVisitAreas.length > 3 && (
                              <Badge variant="outline" className="text-xs py-0 px-1.5 border-muted text-muted-foreground">
                                +{doc.homeVisitAreas.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        className="w-full gap-2 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowHvDialog(true);
                        }}
                        data-testid={`btn-book-hv-${doc.id}`}
                      >
                        <Home className="h-3.5 w-3.5" />
                        {isAr ? 'اطلب زيارة منزلية' : 'Request Home Visit'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Nearby Doctors ───────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{isAr ? 'أطباء بالقرب منك' : 'Doctors Near You'}</h2>
              <p className="text-muted-foreground text-sm mt-1">
                {userLocation ? (isAr ? 'بناءً على موقعك الحالي' : 'Based on your current location') : (isAr ? 'اسمح بالوصول إلى موقعك للعثور على أقرب الأطباء' : 'Allow location access to find nearby doctors')}
              </p>
            </div>
            {!userLocation && (
              <Button variant="outline" size="sm" className="gap-2" onClick={requestLocation} disabled={locationLoading} data-testid="button-detect-location">
                <Navigation className="h-4 w-4" />
                {locationLoading ? (isAr ? 'جارٍ التحديد…' : 'Detecting…') : (isAr ? 'موقعي الحالي' : 'Use My Location')}
              </Button>
            )}
          </div>
          {userLocation ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {nearbyDoctors.length > 0
                ? nearbyDoctors.map(({ doc, dist }) => (
                    <DoctorCard key={doc.id} doc={doc} showDistance dist={dist} />
                  ))
                : (
                  <p className="text-muted-foreground col-span-4 text-center py-8">{isAr ? 'لا يوجد أطباء بالقرب من موقعك.' : 'No doctors found near your location.'}</p>
                )}
            </div>
          ) : (
            <div className="bg-muted/40 rounded-2xl p-10 text-center">
              <Navigation className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">{isAr ? 'اضغط "موقعي الحالي" لاكتشاف الأطباء بالقرب منك.' : 'Click "Use My Location" to discover doctors near you.'}</p>
            </div>
          )}
        </section>

        {/* ─── For Doctors and Clinics ──────────────────────────────── */}
        <section className="grid md:grid-cols-2 gap-6" id="for-doctors-section">
          {/* For Doctors */}
          <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-8 text-white" id="for-clinics-section">
            <div className="flex items-center gap-2 mb-4">
              <Stethoscope className="h-6 w-6" />
              <h2 className="text-xl font-bold">{isAr ? 'للأطباء' : 'For Doctors'}</h2>
            </div>
            <p className="text-white/80 text-sm mb-5">
              {isAr ? 'نمّ عيادتك مع ClinicFlow. تواصل مع آلاف المرضى وأدر جدولك بسهولة.' : 'Grow your practice with ClinicFlow. Reach thousands of patients and manage your schedule effortlessly.'}
            </p>
            <ul className="space-y-2 mb-6">
              {(isAr
                ? ['صفحة ملف شخصي احترافية', 'مطابقة المرضى بالذكاء الاصطناعي', 'جدولة الزيارات المنزلية', 'إدارة المواعيد أونلاين']
                : ['Professional public profile page', 'AI-powered patient matching', 'Home visit scheduling', 'Online appointment management']
              ).map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-white/90">
                  <CheckCircle className="h-4 w-4 text-blue-200 flex-shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" className="bg-white text-blue-700 hover:bg-blue-50" onClick={() => navigate('/register?type=doctor')} data-testid="button-doctor-register-cta">
                {isAr ? 'سجّل كطبيب' : 'Register as Doctor'}
              </Button>
              <Button variant="ghost" className="text-white hover:bg-white/10 gap-1" onClick={() => navigate('/register?type=doctor')}>
                {isAr ? 'اعرف المزيد' : 'Learn More'} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* For Clinics */}
          <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-8 text-white">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="h-6 w-6" />
              <h2 className="text-xl font-bold">{isAr ? 'للعيادات' : 'For Clinics'}</h2>
            </div>
            <p className="text-white/80 text-sm mb-5">
              {isAr ? 'منصة متكاملة لإدارة العيادات مع استراتيجيات الطوابير الذكية وتحليلات الذكاء الاصطناعي.' : 'A complete clinic management platform with smart queue strategies, AI analytics, and powerful tools.'}
            </p>
            <ul className="space-y-2 mb-6">
              {(isAr
                ? ['نظام إدارة الطابور الذكي', 'جدولة متعددة الأطباء', 'صفحة تسويقية + رمز QR', 'تقارير الإيرادات والتحليلات']
                : ['Smart queue management system', 'Multi-doctor scheduling', 'Marketing clinic page + QR code', 'Revenue reports and analytics']
              ).map((b) => (
                <li key={b} className="flex items-center gap-2 text-sm text-white/90">
                  <CheckCircle className="h-4 w-4 text-emerald-200 flex-shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" className="bg-white text-emerald-700 hover:bg-emerald-50" onClick={() => navigate('/register?type=clinic')} data-testid="button-clinic-register-cta">
                {isAr ? 'سجّل عيادتك' : 'Register a Clinic'}
              </Button>
              <Button variant="ghost" className="text-white hover:bg-white/10 gap-1" onClick={() => navigate('/register?type=clinic')}>
                {isAr ? 'عرض الخطط' : 'View Plans'} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {/* ─── Platform Features ────────────────────────────────────── */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground">{isAr ? 'لماذا ClinicFlow؟' : 'Why Choose ClinicFlow?'}</h2>
            <p className="text-muted-foreground text-sm mt-1">{isAr ? 'مصمم لمنظومة الرعاية الصحية المصرية' : 'Built for Egyptian healthcare'}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(isAr ? [
              { icon: <Brain className="h-6 w-6 text-violet-600" />, bg: 'bg-violet-50', title: 'مطابقة الطبيب بالذكاء الاصطناعي', desc: 'صِف أعراضك واحصل على توصية بالطبيب المناسب' },
              { icon: <Shield className="h-6 w-6 text-blue-600" />, bg: 'bg-blue-50', title: 'أطباء موثّقون', desc: 'جميع الأطباء موثّقون ببيانات وشهادات حقيقية' },
              { icon: <Zap className="h-6 w-6 text-amber-600" />, bg: 'bg-amber-50', title: 'حجز فوري', desc: 'احجز مواعيدك في ثوانٍ مع توافر مواعيد حقيقي' },
              { icon: <TrendingUp className="h-6 w-6 text-emerald-600" />, bg: 'bg-emerald-50', title: 'تحليلات العيادة', desc: 'تقارير وإحصاءات قوية لتنمية عيادتك بكفاءة' },
              { icon: <QrCode className="h-6 w-6 text-rose-600" />, bg: 'bg-rose-50', title: 'صفحات حجز QR', desc: 'كل طبيب وعيادة لها رمز QR قابل للمشاركة للحجز الفوري' },
              { icon: <Globe className="h-6 w-6 text-cyan-600" />, bg: 'bg-cyan-50', title: 'دعم متعدد العيادات', desc: 'يمكن للأطباء العمل في عيادات متعددة بحساب واحد' },
              { icon: <MessageSquare className="h-6 w-6 text-indigo-600" />, bg: 'bg-indigo-50', title: 'آراء المرضى', desc: 'نظام تقييم شفاف يبني الثقة بين الأطباء والمرضى' },
              { icon: <Users className="h-6 w-6 text-pink-600" />, bg: 'bg-pink-50', title: 'مكافآت الإحالة', desc: 'اكسب مكافآت بدعوة أصدقاء وأطباء وعيادات للانضمام' },
            ] : [
              { icon: <Brain className="h-6 w-6 text-violet-600" />, bg: 'bg-violet-50', title: 'AI Doctor Matching', desc: 'Describe your symptoms and get the right doctor recommendation' },
              { icon: <Shield className="h-6 w-6 text-blue-600" />, bg: 'bg-blue-50', title: 'Verified Doctors', desc: 'All doctors are verified with real credentials and certifications' },
              { icon: <Zap className="h-6 w-6 text-amber-600" />, bg: 'bg-amber-50', title: 'Instant Booking', desc: 'Book appointments in seconds with real-time slot availability' },
              { icon: <TrendingUp className="h-6 w-6 text-emerald-600" />, bg: 'bg-emerald-50', title: 'Clinic Analytics', desc: 'Powerful reports and insights to grow your clinic efficiently' },
              { icon: <QrCode className="h-6 w-6 text-rose-600" />, bg: 'bg-rose-50', title: 'QR Booking Pages', desc: 'Each doctor and clinic gets a shareable QR code for instant booking' },
              { icon: <Globe className="h-6 w-6 text-cyan-600" />, bg: 'bg-cyan-50', title: 'Multi-Clinic Support', desc: 'Doctors can work across multiple clinics with one account' },
              { icon: <MessageSquare className="h-6 w-6 text-indigo-600" />, bg: 'bg-indigo-50', title: 'Patient Reviews', desc: 'Transparent rating system builds trust between doctors and patients' },
              { icon: <Users className="h-6 w-6 text-pink-600" />, bg: 'bg-pink-50', title: 'Referral Rewards', desc: 'Earn rewards by inviting friends, doctors, and clinics to join' },
            ]).map((f) => (
              <div key={f.title} className="rounded-xl border border-border p-5 hover:shadow-sm transition-shadow">
                <div className={`${f.bg} h-11 w-11 rounded-xl flex items-center justify-center mb-3`}>
                  {f.icon}
                </div>
                <h3 className="font-semibold text-sm text-foreground mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── How It Works ─────────────────────────────────────────── */}
        <section className="bg-muted/30 rounded-2xl p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground">{isAr ? 'كيف يعمل؟' : 'How It Works'}</h2>
            <p className="text-muted-foreground text-sm mt-1">{isAr ? 'احجز موعدك في 3 خطوات بسيطة' : 'Book your appointment in 3 simple steps'}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(isAr ? [
              { step: '1', icon: <Search className="h-8 w-8 text-primary" />, title: 'ابحث عن طبيب', desc: 'تصفح حسب التخصص أو الموقع أو التقييمات للعثور على الطبيب المثالي.' },
              { step: '2', icon: <Calendar className="h-8 w-8 text-primary" />, title: 'اختر موعدًا', desc: 'اختر وقتًا مناسبًا من المواعيد المتاحة.' },
              { step: '3', icon: <CheckCircle className="h-8 w-8 text-primary" />, title: 'تأكيد الحجز', desc: 'يُؤكَّد موعدك فورًا — بدون انتظار.' },
            ] : [
              { step: '1', icon: <Search className="h-8 w-8 text-primary" />, title: 'Search a Doctor', desc: 'Browse by specialty, location, or ratings to find the perfect doctor.' },
              { step: '2', icon: <Calendar className="h-8 w-8 text-primary" />, title: 'Choose a Slot', desc: 'Pick a convenient time from available appointment slots.' },
              { step: '3', icon: <CheckCircle className="h-8 w-8 text-primary" />, title: 'Confirm Booking', desc: 'Your appointment is confirmed instantly — no waiting.' },
            ]).map((s) => (
              <div key={s.step} className="flex flex-col items-center text-center gap-3">
                <div className="relative">
                  <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                    {s.icon}
                  </div>
                  <span className="absolute -top-2 -right-2 h-6 w-6 bg-primary text-white rounded-full text-xs font-bold flex items-center justify-center">{s.step}</span>
                </div>
                <h3 className="font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Patient Testimonials ─────────────────────────────────── */}
        {testimonials.length > 0 && (
          <section>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">{isAr ? 'ماذا يقول مرضانا' : 'What Our Patients Say'}</h2>
              <p className="text-muted-foreground text-sm mt-1">{isAr ? 'آراء حقيقية من مرضى حقيقيين' : 'Real reviews from real patients'}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {testimonials.map((r) => {
                const clinic = clinicStore.get((c) => c.id === r.targetId);
                return (
                  <Card key={r.id} className="hover:shadow-sm transition-shadow" data-testid={`card-testimonial-${r.id}`}>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-1 mb-2">
                        {Array.from({ length: r.stars }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 text-amber-400 fill-amber-400" />
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground italic mb-3">"{r.comment}"</p>
                      {clinic && (
                        <p className="text-xs text-foreground font-medium flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {clinic.name}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Clinic Map Section ───────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground">{isAr ? 'مواقع عياداتنا' : 'Our Clinic Locations'}</h2>
              <p className="text-muted-foreground text-sm mt-1">{isAr ? 'ابحث عن شريك ClinicFlow بالقرب منك' : 'Find a ClinicFlow partner near you'}</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-sm" onClick={() => setShowAllClinics(true)} data-testid="btn-view-all-clinics">
              {isAr ? 'مشاهدة الكل' : 'View All'}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {clinics.map((clinic) => {
              const rating = getAverageRating(clinic.id, 'clinic');
              return (
                <Card
                  key={clinic.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/clinic/${clinic.id}`)}
                  data-testid={`card-clinic-${clinic.id}`}
                >
                  <CardContent className="p-5">
                    <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center mb-3">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-foreground text-sm">{clinic.name}</h3>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" />
                      {clinic.address}
                    </p>
                    {rating.count > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        <Stars rating={rating.avg} />
                        <span className="text-xs text-muted-foreground">{rating.avg} ({rating.count})</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Phone className="h-3 w-3" />
                      {clinic.phone}
                    </p>
                    <Button size="sm" variant="outline" className="w-full mt-3 text-xs h-7" data-testid={`button-view-clinic-${clinic.id}`}>
                      {isAr ? 'عرض العيادة' : 'View Clinic'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* ─── Final CTA ────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-gradient-to-br from-primary to-blue-600 p-10 text-center text-white">
          <h2 className="text-3xl font-bold mb-3">{isAr ? 'مستعد للبدء؟' : 'Ready to Get Started?'}</h2>
          <p className="text-white/80 mb-6 max-w-lg mx-auto">
            {isAr ? 'انضم لآلاف المرضى والأطباء والعيادات التي تستخدم ClinicFlow في جميع أنحاء مصر.' : 'Join thousands of patients, doctors, and clinics already using ClinicFlow across Egypt.'}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {isPatientLoggedIn ? (
              <>
                <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-blue-50" onClick={() => navigate('/patient/book')} data-testid="button-cta-book">
                  {isAr ? 'احجز موعد' : 'Book an Appointment'}
                </Button>
                <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-blue-50" onClick={() => navigate('/patient/appointments')} data-testid="button-cta-appointments">
                  {isAr ? 'مواعيدي' : 'My Appointments'}
                </Button>
              </>
            ) : (
              <>
                <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-blue-50" onClick={() => navigate('/register?type=patient')} data-testid="button-cta-patient">
                  {isAr ? 'سجّل كمريض' : 'Sign Up as Patient'}
                </Button>
                <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-blue-50" onClick={() => navigate('/register?type=doctor')} data-testid="button-cta-doctor">
                  {isAr ? 'سجّل كطبيب' : 'Register as Doctor'}
                </Button>
                <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-blue-50" onClick={() => navigate('/register?type=clinic')} data-testid="button-cta-clinic">
                  {isAr ? 'سجّل عيادتك' : 'Register a Clinic'}
                </Button>
              </>
            )}
          </div>
        </section>
      </div>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="bg-foreground text-background mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src={logoImg} alt="ClinicFlow" className="h-8 w-8 rounded-lg" />
                <span className="text-lg font-bold">ClinicFlow</span>
              </div>
              <p className="text-sm text-background/60 mb-4">{isAr ? 'المنصة الرائدة في مصر لحجز المواعيد الطبية التي تربط المرضى بالأطباء والعيادات.' : "Egypt's leading medical appointment booking platform connecting patients, doctors, and clinics."}</p>
              <div className="flex gap-3">
                {[
                  { icon: <Facebook className="h-4 w-4" />, href: '#', label: 'Facebook' },
                  { icon: <Instagram className="h-4 w-4" />, href: '#', label: 'Instagram' },
                  { icon: <Linkedin className="h-4 w-4" />, href: '#', label: 'LinkedIn' },
                  { icon: <Youtube className="h-4 w-4" />, href: '#', label: 'YouTube' },
                  { icon: <Twitter className="h-4 w-4" />, href: '#', label: 'Twitter' },
                ].map((s) => (
                  <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}
                    className="h-8 w-8 rounded-full bg-background/10 hover:bg-background/20 flex items-center justify-center transition-colors" data-testid={`link-footer-${s.label.toLowerCase()}`}>
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">{isAr ? 'للمرضى' : 'For Patients'}</h3>
              <ul className="space-y-2 text-sm text-background/60">
                <li><button onClick={() => navigate('/register?type=patient')} className="hover:text-background transition-colors" data-testid="footer-link-signup-patient">{isAr ? 'إنشاء حساب' : 'Sign Up'}</button></li>
                <li><button onClick={() => navigate('/login')} className="hover:text-background transition-colors" data-testid="footer-link-login">{isAr ? 'تسجيل الدخول' : 'Login'}</button></li>
                <li><button onClick={() => navigate('/login')} className="hover:text-background transition-colors" data-testid="footer-link-book">{isAr ? 'احجز موعد' : 'Book Appointment'}</button></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">{isAr ? 'لمقدمي الخدمات' : 'For Providers'}</h3>
              <ul className="space-y-2 text-sm text-background/60">
                <li><button onClick={() => navigate('/register?type=doctor')} className="hover:text-background transition-colors" data-testid="footer-link-doctor">{isAr ? 'سجّل كطبيب' : 'Register as Doctor'}</button></li>
                <li><button onClick={() => navigate('/register?type=clinic')} className="hover:text-background transition-colors" data-testid="footer-link-clinic">{isAr ? 'سجّل عيادتك' : 'Register a Clinic'}</button></li>
                <li><button onClick={() => navigate('/login')} className="hover:text-background transition-colors" data-testid="footer-link-dashboard">{isAr ? 'دخول لوحة التحكم' : 'Dashboard Login'}</button></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold mb-4">{isAr ? 'الشركة' : 'Company'}</h3>
              <ul className="space-y-2 text-sm text-background/60">
                <li><span className="cursor-default" data-testid="footer-link-about">{isAr ? 'عن ClinicFlow' : 'About ClinicFlow'}</span></li>
                <li><span className="cursor-default" data-testid="footer-link-contact">{isAr ? 'تواصل معنا' : 'Contact Us'}</span></li>
                <li><span className="cursor-default" data-testid="footer-link-privacy">{isAr ? 'سياسة الخصوصية' : 'Privacy Policy'}</span></li>
                <li><span className="cursor-default" data-testid="footer-link-terms">{isAr ? 'شروط الخدمة' : 'Terms of Service'}</span></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-background/20 mt-8 pt-6 flex flex-col items-center gap-2">
            <p className="text-center text-xs text-background/40">
              {isAr ? '2026 ClinicFlow. جميع الحقوق محفوظة. مصمم لمنظومة الرعاية الصحية في مصر.' : "2026 ClinicFlow. All rights reserved. Built for Egypt's healthcare ecosystem."}
            </p>
            <button
              onClick={() => navigate('/cf-admin-access')}
              className="text-xs text-background/20 hover:text-background/50 transition-colors"
              data-testid="footer-link-super-admin"
            >
              {isAr ? 'إدارة المنصة' : 'Platform Admin'}
            </button>
          </div>
        </div>
      </footer>

      {/* ─── View All Clinics Dialog ──────────────────────────────── */}
      <Dialog open={showAllClinics} onOpenChange={setShowAllClinics}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-primary" />
              {isAr ? 'جميع العيادات المشتركة' : 'All Partner Clinics'}
            </DialogTitle>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={clinicSearch}
                onChange={(e) => setClinicSearch(e.target.value)}
                placeholder={isAr ? 'ابحث بالاسم أو المدينة أو العنوان...' : 'Search by name, city, or address...'}
                className="pl-9"
                data-testid="input-clinic-search"
              />
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4">
            {(() => {
              const q = clinicSearch.toLowerCase().trim();
              const filtered = clinics.filter((c) =>
                !q || c.name.toLowerCase().includes(q) || c.city.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)
              );
              return filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Building2 className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p>{isAr ? 'لا توجد عيادات مطابقة' : 'No clinics found'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filtered.map((clinic) => {
                    const rating = getAverageRating(clinic.id, 'clinic');
                    return (
                      <Card
                        key={clinic.id}
                        className="cursor-pointer hover:shadow-md transition-shadow border-border/60"
                        onClick={() => { navigate(`/clinic/${clinic.id}`); setShowAllClinics(false); }}
                        data-testid={`modal-card-clinic-${clinic.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="h-9 w-9 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">{clinic.name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />{clinic.address}
                              </p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="h-3 w-3" />{clinic.phone}
                              </p>
                              {rating.count > 0 && (
                                <div className="flex items-center gap-1 mt-1">
                                  <Stars rating={rating.avg} />
                                  <span className="text-xs text-muted-foreground">{rating.avg} ({rating.count})</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="w-full mt-3 text-xs h-7" data-testid={`modal-btn-view-clinic-${clinic.id}`}>
                            {isAr ? 'عرض العيادة' : 'View Clinic'}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── View All Appointments Dialog ────────────────────────────── */}
      <Dialog open={showAllAppointments} onOpenChange={setShowAllAppointments}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              {isAr ? 'جميع المواعيد المتاحة' : 'All Available Appointments'}
            </DialogTitle>
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={apptSearch}
                onChange={(e) => setApptSearch(e.target.value)}
                placeholder={isAr ? 'ابحث بالطبيب أو التخصص أو العيادة...' : 'Search by doctor, specialty, or clinic...'}
                className="pl-9"
                data-testid="input-appt-search"
              />
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4">
            {(() => {
              const q = apptSearch.toLowerCase().trim();
              const filtered = allUpcomingAppointments.filter(({ doc, clinic }) => {
                if (!q) return true;
                const spec = getSpecialtyName(doc.specialtyId ?? '').toLowerCase();
                return (
                  doc.name.toLowerCase().includes(q) ||
                  (doc.nameAr || '').includes(apptSearch) ||
                  spec.includes(q) ||
                  (clinic?.name || '').toLowerCase().includes(q)
                );
              });
              return filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p>{isAr ? 'لا توجد مواعيد متاحة' : 'No appointments found'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filtered.map(({ doc, slot, clinic }) => (
                    <Card
                      key={doc.id}
                      className="cursor-pointer hover:shadow-md transition-shadow border-border/60"
                      onClick={() => { navigate(`/doctor/${doc.id}`); setShowAllAppointments(false); }}
                      data-testid={`modal-card-appt-${doc.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Stethoscope className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{isAr ? doc.nameAr || doc.name : doc.name}</p>
                            <p className="text-xs text-muted-foreground">{getSpecialtyName(doc.specialtyId ?? '')}</p>
                          </div>
                        </div>
                        {clinic && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                            <Building2 className="h-3 w-3" />{clinic.name}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-3 py-1.5 mb-2">
                          <Calendar className="h-3.5 w-3.5 text-blue-600" />
                          <span className="text-xs font-medium text-blue-700">{slot}</span>
                        </div>
                        <Button
                          size="sm"
                          className="w-full text-xs h-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isPatientLoggedIn) {
                              setOfferBookingDoctorId(doc.id);
                              setOfferBookingOpen(true);
                              setShowAllAppointments(false);
                            } else {
                              navigate(`/login?returnDoctor=${doc.id}`);
                              setShowAllAppointments(false);
                            }
                          }}
                          data-testid={`modal-btn-book-${doc.id}`}
                        >
                          {isAr ? 'احجز الآن' : 'Book Now'}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── View All Offers Dialog ───────────────────────────────────── */}
      <Dialog open={showAllOffers} onOpenChange={setShowAllOffers}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Tag className="h-5 w-5 text-primary" />
              {isAr ? 'جميع العروض الطبية' : 'All Medical Offers'}
            </DialogTitle>
            <div className="flex gap-2 mt-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={offerSearch}
                  onChange={(e) => setOfferSearch(e.target.value)}
                  placeholder={isAr ? 'ابحث في العروض...' : 'Search offers...'}
                  className="pl-9"
                  data-testid="input-offer-modal-search"
                />
              </div>
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setOffersTab('latest')}
                  className={`px-3 text-xs font-medium transition-colors ${offersTab === 'latest' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                  data-testid="modal-btn-latest"
                >
                  {isAr ? 'الأحدث' : 'Latest'}
                </button>
                <button
                  onClick={() => setOffersTab('featured')}
                  className={`px-3 text-xs font-medium transition-colors border-l border-border ${offersTab === 'featured' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                  data-testid="modal-btn-featured"
                >
                  {isAr ? 'الأكثر تميزاً' : 'Most Featured'}
                </button>
              </div>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto px-6 py-4">
            {(() => {
              const q = offerSearch.toLowerCase().trim();
              const sorted = offersTab === 'featured'
                ? [...offers].sort((a, b) => (b.discountPercent ?? 0) - (a.discountPercent ?? 0))
                : offers;
              const filtered = sorted.filter((o) =>
                !q ||
                o.title.toLowerCase().includes(q) ||
                o.titleAr.includes(offerSearch) ||
                o.clinicName.toLowerCase().includes(q) ||
                (o.doctorName || '').toLowerCase().includes(q)
              );
              return filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Tag className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p>{isAr ? 'لا توجد عروض مطابقة' : 'No offers found'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filtered.map((offer) => (
                    <Card key={offer.id} className="border-border/60 hover:shadow-md transition-shadow" data-testid={`modal-card-offer-${offer.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">{isAr ? offer.titleAr : offer.title}</p>
                            <p className="text-xs text-muted-foreground">{offer.clinicName}</p>
                            {offer.doctorName && <p className="text-xs text-muted-foreground">{offer.doctorName}</p>}
                          </div>
                          {offer.originalPrice && offer.discountedPrice && offer.originalPrice !== offer.discountedPrice && (
                            <div className="text-right shrink-0">
                              <p className="text-xs line-through text-muted-foreground">{offer.originalPrice} ج.م</p>
                              <p className="text-sm font-bold text-primary">{offer.discountedPrice} ج.م</p>
                              <Badge className="text-xs bg-rose-100 text-rose-700 border-0">
                                {Math.round((1 - offer.discountedPrice / offer.originalPrice) * 100)}% OFF
                              </Badge>
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{isAr ? offer.descriptionAr : offer.description}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {isAr ? 'ينتهي' : 'Expires'} {new Date(offer.expiresAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <Button size="sm" className="text-xs h-7" onClick={() => handleOfferBook(offer.clinicId)} data-testid={`modal-btn-book-offer-${offer.id}`}>
                            {isAr ? 'احجز الآن' : 'Book Now'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      <HomeVisitBookingDialog open={showHvDialog} onClose={() => setShowHvDialog(false)} />

      {/* ─── AI Booking Assistant ─────────────────────────────────────── */}
      <AIBookingAssistant
        patientId={user?.role === 'patient' ? (user?.patientId || user?.id) : undefined}
      />

      {/* ─── Offer Booking Wizard ─────────────────────────────────────── */}
      <Dialog open={offerBookingOpen} onOpenChange={setOfferBookingOpen}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-0">
            <DialogTitle>{isAr ? 'حجز موعد' : 'Book Appointment'}</DialogTitle>
          </DialogHeader>
          {offerBookingOpen && (
            <BookingWizard
              patientId={user?.patientId || user?.id}
              initialDoctorId={offerBookingDoctorId}
              onComplete={() => setOfferBookingOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LandingPage;
