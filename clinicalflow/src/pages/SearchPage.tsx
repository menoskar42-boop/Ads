import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { userStore } from '@/stores/userStore';
import { specialtyStore } from '@/stores/specialtyStore';
import { doctorProfileStore } from '@/stores/doctorProfileStore';
import { ratingStore } from '@/stores/ratingStore';
import { scheduleStore } from '@/stores/scheduleStore';
import { clinicStore } from '@/stores/clinicStore';
import { getClinicsForDoctor } from '@/stores/doctorClinicStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Star, MapPin, Clock, ArrowLeft, Stethoscope,
  SlidersHorizontal, X, Calendar, Home
} from 'lucide-react';
import logoImg from '@assets/Untitled_design_1772868317886.png';
import { EGYPT_GOVERNORATES } from '@/lib/governorates';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getNextSlot(doctorId: string): string | null {
  const now = new Date();
  const schedules = scheduleStore.filter(s => s.doctorId === doctorId && s.isActive);
  for (let d = 0; d < 7; d++) {
    const date = new Date(now);
    date.setDate(now.getDate() + d);
    const dayOfWeek = date.getDay();
    const daySchedules = schedules.filter(s => s.dayOfWeek === dayOfWeek);
    for (const s of daySchedules) {
      const slotTime = new Date(date);
      const [h, m] = s.startTime.split(':').map(Number);
      slotTime.setHours(h, m, 0, 0);
      if (slotTime > now) {
        return d === 0
          ? `Today ${s.startTime}`
          : d === 1
          ? `Tomorrow ${s.startTime}`
          : `${DAYS[dayOfWeek]} ${s.startTime}`;
      }
    }
  }
  return null;
}

interface DoctorCard {
  id: string;
  name: string;
  specialtyId: string;
  specialtyName: string;
  clinicNames: string[];
  rating: number;
  reviewCount: number;
  nextSlot: string | null;
  city: string;
  cities: string[];
  photoUrl?: string;
  homeVisitEnabled: boolean;
  homeVisitAreas?: string[];
}

const SearchPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { language, setLanguage, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedSpecialty, setSelectedSpecialty] = useState(searchParams.get('specialty') || 'all');
  const [selectedCity, setSelectedCity] = useState(searchParams.get('city') || 'all');
  const [homeVisitOnly, setHomeVisitOnly] = useState(searchParams.get('homeVisit') === 'true');
  const [showFilters, setShowFilters] = useState(false);

  const specialties = specialtyStore.filter(s => s.isActive);
  const allClinics = clinicStore.getAll().filter(c => c.isActive);
  const cities = Array.from(new Set(allClinics.map(c => c.city))).sort();

  const doctors: DoctorCard[] = useMemo(() => {
    const doctors = userStore.filter(u => u.role === 'doctor' && u.isActive);
    return doctors.map(doc => {
      const profile = doctorProfileStore.get(p => p.id === doc.id);
      const specialty = specialtyStore.get(s => s.id === doc.specialtyId);
      const ratings = ratingStore.filter(r => r.doctorId === doc.id);
      const avgRating = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
        : 0;
      const clinicIds = getClinicsForDoctor(doc.id);
      const clinics = clinicIds
        .map(cid => allClinics.find(c => c.id === cid))
        .filter(Boolean) as typeof allClinics;
      const clinicCities = Array.from(new Set(clinics.map(c => c.city)));

      return {
        id: doc.id,
        name: doc.name,
        specialtyId: doc.specialtyId || '',
        specialtyName: specialty?.name || 'General',
        clinicNames: clinics.map(c => c.name),
        rating: avgRating,
        reviewCount: ratings.length,
        nextSlot: getNextSlot(doc.id),
        city: clinicCities[0] || '',
        cities: clinicCities,
        photoUrl: profile?.photoUrl,
        homeVisitEnabled: !!doc.homeVisitEnabled,
        homeVisitAreas: doc.homeVisitAreas,
      };
    });
  }, []);

  const filtered = useMemo(() => {
    return doctors.filter(doc => {
      const qMatch = !query.trim() ||
        doc.name.toLowerCase().includes(query.toLowerCase()) ||
        doc.specialtyName.toLowerCase().includes(query.toLowerCase()) ||
        doc.clinicNames.some(n => n.toLowerCase().includes(query.toLowerCase())) ||
        (doc.homeVisitAreas?.some(a => a.toLowerCase().includes(query.toLowerCase())));
      const spMatch = selectedSpecialty === 'all' || doc.specialtyId === selectedSpecialty;
      const cityMatch = selectedCity === 'all' || doc.cities.includes(selectedCity);
      const hvMatch = !homeVisitOnly || doc.homeVisitEnabled;
      return qMatch && spMatch && cityMatch && hvMatch;
    });
  }, [doctors, query, selectedSpecialty, selectedCity, homeVisitOnly]);

  const handleSearch = () => {
    const params: Record<string, string> = {};
    if (query) params.q = query;
    if (selectedSpecialty !== 'all') params.specialty = selectedSpecialty;
    if (selectedCity !== 'all') params.city = selectedCity;
    if (homeVisitOnly) params.homeVisit = 'true';
    setSearchParams(params);
  };

  const clearFilters = () => {
    setQuery('');
    setSelectedSpecialty('all');
    setSelectedCity('all');
    setHomeVisitOnly(false);
    setSearchParams({});
  };

  const hasFilters = query || selectedSpecialty !== 'all' || selectedCity !== 'all' || homeVisitOnly;

  return (
    <div className="min-h-screen bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <img src={logoImg} alt="ClinicalFlow" className="h-8 w-8 rounded-lg object-cover" />
              <span className="font-semibold text-foreground hidden sm:inline text-sm">ClinicalFlow</span>
            </Link>

            <div className="flex-1 flex items-center gap-2 min-w-0">
              <div className="relative flex-1 max-w-xl">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 pr-4"
                  placeholder={isAr ? 'ابحث عن طبيب أو تخصص أو عيادة...' : 'Search doctors, specialties, clinics...'}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  data-testid="input-search-query"
                />
              </div>
              <Button onClick={handleSearch} className="shrink-0" data-testid="button-search">
                {isAr ? 'بحث' : 'Search'}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowFilters(v => !v)}
                className={showFilters ? 'border-primary text-primary' : ''}
                data-testid="button-toggle-filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
              data-testid="button-toggle-language"
            >
              {language === 'en' ? 'AR' : 'EN'}
            </Button>
            <Button variant="ghost" size="sm" asChild className="shrink-0 hidden sm:flex">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-1" />
                {language === 'ar' ? 'الرئيسية' : 'Home'}
              </Link>
            </Button>
          </div>

          {/* Filter bar */}
          {showFilters && (
            <div className="mt-3 flex flex-wrap gap-3 items-center pt-3 border-t border-border">
              <Select value={selectedSpecialty} onValueChange={setSelectedSpecialty}>
                <SelectTrigger className="w-48" data-testid="select-specialty">
                  <SelectValue placeholder={isAr ? 'كل التخصصات' : 'All Specialties'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? 'كل التخصصات' : 'All Specialties'}</SelectItem>
                  {specialties.map(s => (
                    <SelectItem key={s.id} value={s.id}>{isAr ? s.nameAr : s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger className="w-44" data-testid="select-city">
                  <SelectValue placeholder={isAr ? 'كل المحافظات' : 'All Governorates'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isAr ? 'كل المحافظات' : 'All Governorates'}</SelectItem>
                  {EGYPT_GOVERNORATES.map(g => (
                    <SelectItem key={g.en} value={g.en}>{isAr ? g.ar : g.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant={homeVisitOnly ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => setHomeVisitOnly(v => !v)}
                data-testid="button-filter-home-visit"
              >
                <Home className="h-3.5 w-3.5" />
                {isAr ? 'زيارة منزلية' : 'Home Visit'}
              </Button>

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground" data-testid="button-clear-filters">
                  <X className="h-3 w-3" />
                  {isAr ? 'مسح الفلاتر' : 'Clear filters'}
                </Button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Results */}
      <main className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {hasFilters ? (isAr ? 'نتائج البحث' : 'Search Results') : (isAr ? 'جميع الأطباء' : 'All Doctors')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isAr
                ? `${filtered.length} طبيب`
                : `${filtered.length} doctor${filtered.length !== 1 ? 's' : ''} found`}
              {selectedSpecialty !== 'all' && (isAr ? ` في ${specialties.find(s => s.id === selectedSpecialty)?.nameAr || specialties.find(s => s.id === selectedSpecialty)?.name}` : ` in ${specialties.find(s => s.id === selectedSpecialty)?.name}`)}
              {selectedCity !== 'all' && (isAr ? ` في محافظة ${EGYPT_GOVERNORATES.find(g => g.en === selectedCity)?.ar || selectedCity}` : ` near ${selectedCity}`)}
            </p>
          </div>
          {hasFilters && (
            <div className="flex flex-wrap gap-1">
              {query && (
                <Badge variant="secondary" className="gap-1">
                  "{query}"
                  <button onClick={() => setQuery('')}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {selectedSpecialty !== 'all' && (
                <Badge variant="secondary" className="gap-1">
                  {specialties.find(s => s.id === selectedSpecialty)?.name}
                  <button onClick={() => setSelectedSpecialty('all')}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {selectedCity !== 'all' && (
                <Badge variant="secondary" className="gap-1">
                  {isAr ? (EGYPT_GOVERNORATES.find(g => g.en === selectedCity)?.ar || selectedCity) : selectedCity}
                  <button onClick={() => setSelectedCity('all')}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {homeVisitOnly && (
                <Badge className="gap-1 bg-emerald-600 text-white border-0">
                  <Home className="h-3 w-3" />
                  {isAr ? 'زيارة منزلية' : 'Home Visit'}
                  <button onClick={() => setHomeVisitOnly(false)}><X className="h-3 w-3" /></button>
                </Badge>
              )}
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Stethoscope className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">{isAr ? 'لم يتم العثور على أطباء' : 'No doctors found'}</h3>
            <p className="text-muted-foreground mb-4">{isAr ? 'حاول تعديل البحث أو الفلاتر' : 'Try adjusting your search or filters'}</p>
            <Button variant="outline" onClick={clearFilters}>{isAr ? 'مسح كل الفلاتر' : 'Clear all filters'}</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(doc => (
              <Card
                key={doc.id}
                className="hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => navigate(`/doctor/${doc.id}`)}
                data-testid={`card-doctor-${doc.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 group-hover:from-primary/30 transition-colors">
                      {doc.photoUrl ? (
                        <img src={doc.photoUrl} alt={doc.name} className="h-14 w-14 rounded-xl object-cover" />
                      ) : (
                        <Stethoscope className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground text-sm truncate">{doc.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{doc.specialtyName}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="text-xs font-medium text-foreground">
                          {doc.rating > 0 ? doc.rating.toFixed(1) : (isAr ? 'جديد' : 'New')}
                        </span>
                        {doc.reviewCount > 0 && (
                          <span className="text-xs text-muted-foreground">({doc.reviewCount})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {doc.clinicNames.length > 0 && (
                    <div className="flex items-start gap-1.5 mb-1">
                      <MapPin className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.clinicNames.slice(0, 2).join(' · ')}
                        {doc.clinicNames.length > 2 && ` +${doc.clinicNames.length - 2} ${isAr ? 'أكثر' : 'more'}`}
                      </p>
                    </div>
                  )}
                  {doc.cities.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs font-medium text-primary/80">
                        {doc.cities.join(' · ')}
                      </span>
                    </div>
                  )}

                  {doc.nextSlot && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Calendar className="h-3 w-3 text-emerald-600 shrink-0" />
                      <p className="text-xs text-emerald-700 font-medium">{doc.nextSlot}</p>
                    </div>
                  )}

                  {doc.homeVisitEnabled && (
                    <div className="flex items-center gap-1 mb-3">
                      <Badge className="text-xs gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-0 px-2 py-0.5 h-auto">
                        <Home className="h-2.5 w-2.5" />
                        {isAr ? 'زيارة منزلية' : 'Home Visit'}
                      </Badge>
                    </div>
                  )}

                  <Button
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={e => {
                      e.stopPropagation();
                      if (user?.role === 'patient') navigate(`/patient/book?doctor=${doc.id}`);
                      else navigate(`/login?returnDoctor=${doc.id}`);
                    }}
                    data-testid={`button-book-${doc.id}`}
                  >
                    {isAr ? 'احجز موعد' : 'Book Appointment'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SearchPage;
