import React, { useState, useMemo, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSpecialties } from '@/hooks/useSpecialties';
import { useUsers } from '@/hooks/useUsers';
import { usePatients } from '@/hooks/usePatients';
import { useAppointments } from '@/hooks/useVisits';
import { appointmentStore } from '@/stores/visitStore';
import { useSchedule } from '@/hooks/useSchedule';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/dateFormat';
import { getEnabledClinicVisitTypes } from '@/stores/visitTypeStore';
import { getClinicsForDoctor, getDoctorsForClinic } from '@/stores/doctorClinicStore';
import { getActiveSpecialtyIdsForClinic } from '@/stores/clinicSpecialtyStore';
import { getClinicById } from '@/stores/clinicStore';
import { userStore } from '@/stores/userStore';
import { getHomeVisitSlots, getHomeVisitWorkingDays } from '@/stores/homeVisitScheduleStore';
import { scheduleStore } from '@/stores/scheduleStore';
import { EGYPT_GOVERNORATES, DEFAULT_GOVERNORATE_EN } from '@/lib/governorates';
import { VisitType } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, ArrowRight, Calendar, Check, Clock, Stethoscope, User,
  Sparkles, AlertTriangle, ClipboardList, Home, Building2, MapPin, Locate, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import AIBookingAssistant from '@/components/AIBookingAssistant';

interface BookingWizardProps {
  patientId?: string;
  initialDoctorId?: string;
  initialClinicId?: string;   // ← NEW: pass clinic context from ClinicPublicPage
  onComplete?: () => void;
}

type Step = 'patient' | 'clinic_select' | 'specialty' | 'visit_type' | 'ai_assistant' | 'doctor' | 'doctor_browse' | 'home_visit_mode' | 'home_address' | 'date' | 'time' | 'confirm';


const VisitTypeCard: React.FC<{
  visitType: VisitType;
  selected: boolean;
  onSelect: () => void;
  language: string;
}> = ({ visitType, selected, onSelect, language }) => {
  const isAr = language === 'ar';
  return (
    <Button
      variant={selected ? 'default' : 'outline'}
      className={`h-auto p-4 justify-start gap-3 flex items-start ${visitType.isUrgent ? 'border-destructive/40' : ''}`}
      onClick={onSelect}
      data-testid={`button-visit-type-${visitType.id}`}
    >
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
        visitType.isUrgent ? 'bg-destructive/10' : 'bg-primary/10'
      }`}>
        {visitType.isUrgent
          ? <AlertTriangle className="h-5 w-5 text-destructive" />
          : <ClipboardList className="h-5 w-5 text-primary" />
        }
      </div>
      <div className="text-start">
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            {isAr ? visitType.nameAr : visitType.name}
          </span>
          {visitType.isUrgent && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              {isAr ? 'مستعجل' : 'Urgent'}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs opacity-80">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {visitType.durationMinutes} {isAr ? 'دقيقة' : 'min'}
          </span>
          <span className="font-bold">
            {visitType.price} {isAr ? 'ج.م' : 'EGP'}
          </span>
        </div>
      </div>
    </Button>
  );
};

const BookingWizard: React.FC<BookingWizardProps> = ({ patientId, initialDoctorId, initialClinicId, onComplete }) => {
  const { t, language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { specialties } = useSpecialties();
  const { activeDoctors, platformDoctors } = useUsers();
  const { patients } = usePatients();
  const { createAppointment } = useAppointments();
  const { getAvailableSlots, getDoctorWorkingDays } = useSchedule();
  const navigate = useNavigate();

  const isAr = language === 'ar';

  // ── Determine the best initial clinic ──────────────────────────────────────
  // Priority: explicit initialClinicId → first clinic of doctor → user's clinic → ''
  const getInitialClinicId = (): string => {
    if (initialClinicId) return initialClinicId;
    if (initialDoctorId) {
      const links = getClinicsForDoctor(initialDoctorId);
      if (links.length === 1) return links[0];
    }
    if (user?.clinicId) return user.clinicId;
    return '';
  };

  const getInitialStep = (): Step => {
    if (initialDoctorId) {
      const doc = userStore.getAll().find(u => u.id === initialDoctorId);
      if (doc?.homeVisitEnabled) return 'home_visit_mode';
      // If doctor works in multiple clinics, show clinic selection
      const links = getClinicsForDoctor(initialDoctorId);
      if (links.length > 1) return 'clinic_select';
      // Single clinic — skip to visit type
      return 'visit_type';
    }
    if (patientId) return 'specialty';
    return 'patient';
  };

  const [step, setStep] = useState<Step>(getInitialStep);
  const [bookingClinicId, setBookingClinicId] = useState<string>(getInitialClinicId);
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || '');
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState(() => {
    if (initialDoctorId) {
      const doc = userStore.getAll().find(u => u.id === initialDoctorId);
      return doc?.specialtyId || '';
    }
    return '';
  });
  const [selectedDoctorId, setSelectedDoctorId] = useState(initialDoctorId || '');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedVisitTypeId, setSelectedVisitTypeId] = useState('');
  const [notes, setNotes] = useState('');

  // Home visit state
  const [isHomeVisit, setIsHomeVisit] = useState(false);
  const [homeAddress, setHomeAddress] = useState('');
  const [homeArea, setHomeArea] = useState('');
  const [homeCity, setHomeCity] = useState(DEFAULT_GOVERNORATE_EN);
  const [homeLocationPin, setHomeLocationPin] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);

  const [clinicVisitTypes, setClinicVisitTypes] = useState<VisitType[]>([]);

  useEffect(() => {
    if (bookingClinicId) {
      setClinicVisitTypes(getEnabledClinicVisitTypes(bookingClinicId));
    }
  }, [bookingClinicId]);

  // When opening from a clinic page, show only that clinic's active specialties
  const activeSpecialties = useMemo(() => {
    if (bookingClinicId) {
      const clinicActiveIds = new Set(getActiveSpecialtyIdsForClinic(bookingClinicId));
      return specialties.filter(s => clinicActiveIds.has(s.id));
    }
    return specialties.filter(s => s.isActive);
  }, [specialties, bookingClinicId]);

  // Doctors linked to the booking clinic (for clinic-context filtering)
  const clinicDoctorIds = useMemo(() =>
    bookingClinicId ? new Set(getDoctorsForClinic(bookingClinicId)) : null,
    [bookingClinicId]
  );

  const filteredDoctors = activeDoctors.filter(d => d.specialtyId === selectedSpecialtyId);
  const selectedDoctor = platformDoctors.find(d => d.id === selectedDoctorId);

  const workingDays = selectedDoctorId
    ? (isHomeVisit ? getHomeVisitWorkingDays(selectedDoctorId) : getDoctorWorkingDays(selectedDoctorId))
    : [];

  const availableSlots = selectedDoctorId && selectedDate
    ? (isHomeVisit ? getHomeVisitSlots(selectedDoctorId, selectedDate) : getAvailableSlots(selectedDoctorId, selectedDate))
    : [];

  const selectedVisitType = clinicVisitTypes.find(vt => vt.id === selectedVisitTypeId);

  const availableDates = useMemo(() => {
    if (!workingDays.length) return [];
    const dates: string[] = [];
    const today = new Date();
    const now = new Date();
    for (let i = 0; i <= 60 && dates.length < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (!workingDays.includes(d.getDay())) continue;
      // For today: only include if there are remaining slots later today
      if (i === 0) {
        const dateStr = d.toISOString().split('T')[0];
        const slots = selectedDoctorId ? getAvailableSlots(selectedDoctorId, dateStr) : [];
        const hasRemainingSlots = slots.some((slot: string) => {
          const [h, m] = slot.split(':').map(Number);
          return h * 60 + m > now.getHours() * 60 + now.getMinutes();
        });
        if (hasRemainingSlots) dates.push(dateStr);
        continue;
      }
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, [workingDays, selectedDoctorId]);

  const getName = (id: string, list: { id: string; name: string; nameAr: string }[]) => {
    const item = list.find(i => i.id === id);
    return isAr ? item?.nameAr : item?.name;
  };

  const handleConfirm = async () => {
    const today = new Date().toISOString().split('T')[0];
    const blockedStatuses = ['cancelled', 'completed', 'no_show', 'converted'];
    const existingUpcoming = appointmentStore.filter(
      a =>
        a.patientId === selectedPatientId &&
        a.doctorId === selectedDoctorId &&
        !blockedStatuses.includes(a.status) &&
        a.date >= today
    );
    if (existingUpcoming.length > 0) {
      toast.error(
        isAr
          ? 'لديك حجز قائم بالفعل عند هذا الدكتور. يرجى إلغاؤه أولاً قبل الحجز مجدداً.'
          : 'You already have an upcoming appointment with this doctor. Please cancel it first.'
      );
      return;
    }

    try {
      await createAppointment({
        patientId: selectedPatientId,
        doctorId: selectedDoctorId,
        specialtyId: selectedSpecialtyId,
        date: selectedDate,
        time: selectedTime,
        clinicId: bookingClinicId || undefined,
        notes: notes || undefined,
        visitTypeId: selectedVisitTypeId || undefined,
        isHomeVisit: isHomeVisit || undefined,
        homeAddress: isHomeVisit ? homeAddress : undefined,
        homeArea: isHomeVisit ? homeArea : undefined,
        homeCity: isHomeVisit ? homeCity : undefined,
        homeLocationPin: isHomeVisit && homeLocationPin ? homeLocationPin : undefined,
      });
      toast.success(t('booking.success'));
      if (onComplete) {
        onComplete();
      } else if (patientId) {
        navigate('/patient/appointments');
      } else {
        navigate('/appointments');
      }
    } catch (e: any) {
      if (e.message === 'SLOT_CONFLICT') {
        toast.error(t('booking.slotConflict') || 'This time slot is already booked. Please choose another.');
        setSelectedTime('');
        setStep('time');
      } else if (e.message === 'INTERVAL_FULL') {
        toast.error(isAr
          ? 'هذه الفترة الزمنية ممتلئة. يرجى اختيار وقت آخر.'
          : 'This time interval is full. Please choose a different time.');
        setSelectedTime('');
        setStep('time');
      } else {
        toast.error('Booking failed');
      }
    }
  };

  const BackButton = ({ to }: { to: Step }) => (
    <Button variant="ghost" size="sm" onClick={() => setStep(to)} className="gap-1 mb-4" data-testid={`button-back-to-${to}`}>
      <ArrowLeft className={`h-4 w-4 ${isRTL ? 'rotate-180' : ''}`} />
      {t('common.back')}
    </Button>
  );

  // ── Patient selection ──
  if (step === 'patient') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" />{t('booking.selectPatient')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPatientId} onValueChange={v => { setSelectedPatientId(v); setStep('specialty'); }}>
            <SelectTrigger data-testid="select-patient"><SelectValue placeholder={t('booking.selectPatient')} /></SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              {patients.map(p => (
                <SelectItem key={p.id} value={p.id}>{isAr ? p.nameAr : p.name} — {p.phone}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    );
  }

  const handleAIBookingComplete = () => {
    if (onComplete) { onComplete(); } else if (patientId) { navigate('/patient/appointments'); } else { navigate('/appointments'); }
  };

  // ── Clinic selection (only shown when doctor works in multiple clinics) ──
  if (step === 'clinic_select') {
    const doctorClinicIds = getClinicsForDoctor(selectedDoctorId);
    const doctorClinics = doctorClinicIds.map(cid => getClinicById(cid)).filter(Boolean) as NonNullable<ReturnType<typeof getClinicById>>[];
    const preselectedDoctor = platformDoctors.find(d => d.id === selectedDoctorId);

    // Back goes to home_visit_mode if doctor has home visits, otherwise specialty
    const backTarget: Step = preselectedDoctor?.homeVisitEnabled ? 'home_visit_mode' : 'specialty';

    return (
      <div>
        <BackButton to={backTarget} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              {isAr ? 'اختر العيادة' : 'Select a Clinic'}
            </CardTitle>
            <CardDescription>
              {isAr
                ? `اختر العيادة التي تريد حجز موعد مع ${preselectedDoctor?.nameAr || preselectedDoctor?.name} فيها`
                : `Choose where you'd like to see ${preselectedDoctor?.name}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preselectedDoctor && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Stethoscope className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">{isAr ? preselectedDoctor.nameAr : preselectedDoctor.name}</p>
                  <p className="text-xs text-muted-foreground">{specialties.find(s => s.id === preselectedDoctor.specialtyId)?.[isAr ? 'nameAr' : 'name']}</p>
                </div>
              </div>
            )}
            {doctorClinics.length === 0 ? (
              <p className="text-center text-muted-foreground py-6 text-sm">
                {isAr ? 'لا توجد عيادات متاحة لهذا الطبيب' : 'No clinics available for this doctor'}
              </p>
            ) : (
              doctorClinics.map(clinic => (
                <button
                  key={clinic.id}
                  className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left rtl:text-right group"
                  onClick={() => {
                    setBookingClinicId(clinic.id);
                    setStep('visit_type');
                  }}
                  data-testid={`btn-select-clinic-${clinic.id}`}
                >
                  <div className="h-10 w-10 rounded-lg bg-chart-2/10 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                    <Building2 className="h-5 w-5 text-chart-2 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{isAr ? clinic.nameAr : clinic.name}</p>
                    {clinic.address && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {isAr ? clinic.addressAr || clinic.address : clinic.address}
                      </p>
                    )}
                    {clinic.phone && <p className="text-xs text-muted-foreground mt-0.5">{clinic.phone}</p>}
                  </div>
                  <ArrowRight className={`h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 ${isAr ? 'rotate-180' : ''}`} />
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'specialty') {
    return (
      <div>
        {!patientId && <BackButton to="patient" />}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" />{t('booking.selectSpecialty')}</CardTitle>
            <CardDescription>{t('booking.specialtyDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              className="w-full h-auto p-4 justify-start border-primary/30 bg-primary/5 hover:bg-primary/10"
              onClick={() => setStep('ai_assistant')}
              data-testid="button-ai-assistant-booking"
            >
              <Sparkles className="h-5 w-5 text-primary mr-3 rtl:mr-0 rtl:ml-3" />
              <div className="text-left rtl:text-right">
                <span className="font-semibold block">{isAr ? 'مساعد الحجز الذكي' : 'AI Assistant'}</span>
                <span className="text-xs text-muted-foreground">{isAr ? 'وصّف الأعراض واحنا نساعدك' : 'Describe symptoms and we\'ll help you'}</span>
              </div>
            </Button>
            <Separator />
            <div className="grid gap-3 sm:grid-cols-2">
              {activeSpecialties.map(sp => (
                <Button
                  key={sp.id}
                  variant="outline"
                  className="h-auto p-4 justify-start"
                  onClick={() => { setSelectedSpecialtyId(sp.id); setSelectedDoctorId(''); setStep('doctor_browse'); }}
                  data-testid={`button-specialty-${sp.id}`}
                >
                  <Stethoscope className="h-5 w-5 text-primary mr-3 rtl:mr-0 rtl:ml-3" />
                  <span className="font-medium">{isAr ? sp.nameAr : sp.name}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── AI Assistant ──
  if (step === 'ai_assistant') {
    return (
      <div>
        <BackButton to="specialty" />
        <AIBookingAssistant mode="embedded" patientId={selectedPatientId} onBookingComplete={handleAIBookingComplete} />
      </div>
    );
  }

  // ── Visit Type selection ──
  if (step === 'visit_type') {
    const hasVisitTypes = clinicVisitTypes.length > 0;
    // Back: if came from clinic_select → back there; if single-clinic doctor → home_visit_mode or specialty
    const visitTypeBackTo: Step = (() => {
      if (isHomeVisit) return 'home_address';
      const links = selectedDoctorId ? getClinicsForDoctor(selectedDoctorId) : [];
      if (links.length > 1) return 'clinic_select';
      const doc = selectedDoctorId ? platformDoctors.find(d => d.id === selectedDoctorId) : undefined;
      if (doc?.homeVisitEnabled) return 'home_visit_mode';
      return 'specialty';
    })();

    return (
      <div>
        <BackButton to={visitTypeBackTo} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {isAr ? 'نوع الزيارة' : 'Visit Type'}
            </CardTitle>
            <CardDescription>
              {isAr ? 'اختر نوع الزيارة لهذا الموعد' : 'Select the type of visit for this appointment'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasVisitTypes ? (
              <>
                {clinicVisitTypes.map(vt => (
                  <VisitTypeCard
                    key={vt.id}
                    visitType={vt}
                    selected={selectedVisitTypeId === vt.id}
                    onSelect={() => { setSelectedVisitTypeId(vt.id); setStep('date'); }}
                    language={language}
                  />
                ))}
                <Separator />
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground text-sm"
                  onClick={() => { setSelectedVisitTypeId(''); setStep('date'); }}
                  data-testid="button-skip-visit-type"
                >
                  {isAr ? 'تخطّي (بدون تحديد نوع)' : 'Skip (no visit type)'}
                </Button>
              </>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{isAr ? 'لا توجد أنواع زيارة مفعّلة' : 'No visit types enabled'}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setStep('date')}>
                  {isAr ? 'متابعة' : 'Continue'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Doctor Browse (after specialty, before visit location) ──
  if (step === 'doctor_browse') {
    const selectedSpecialtyName = getName(selectedSpecialtyId, specialties);
    const browseDoctors = platformDoctors.filter(d =>
      d.specialtyId === selectedSpecialtyId &&
      d.isActive &&
      (!clinicDoctorIds || clinicDoctorIds.has(d.id))
    );

    const alternativeSpecialties = activeSpecialties.filter(sp =>
      sp.id !== selectedSpecialtyId &&
      platformDoctors.some(d =>
        d.specialtyId === sp.id &&
        d.isActive &&
        (!clinicDoctorIds || clinicDoctorIds.has(d.id))
      )
    );

    const getNextSlot = (doctorId: string): string | null => {
      const today = new Date();
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dayOfWeek = d.getDay();
        const schedule = scheduleStore.get(s => s.doctorId === doctorId && s.dayOfWeek === dayOfWeek && s.isActive);
        if (schedule) {
          const [h, m] = schedule.startTime.split(':').map(Number);
          if (i === 0) {
            const now = new Date();
            if (h * 60 + m <= now.getHours() * 60 + now.getMinutes()) continue;
          }
          return i === 0 ? `${isAr ? 'اليوم' : 'Today'} ${schedule.startTime}` :
                 i === 1 ? `${isAr ? 'غداً' : 'Tomorrow'} ${schedule.startTime}` :
                 d.toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` ${schedule.startTime}`;
        }
      }
      return null;
    };

    return (
      <div>
        <BackButton to="specialty" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              {isAr ? `أطباء ${selectedSpecialtyName}` : `${selectedSpecialtyName} Doctors`}
            </CardTitle>
            <CardDescription>
              {isAr ? 'اختر الطبيب المناسب لك' : 'Choose the right doctor for you'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {browseDoctors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{isAr ? 'لا يوجد أطباء في هذا التخصص حالياً' : 'No doctors available in this specialty'}</p>
                {alternativeSpecialties.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs text-muted-foreground mb-2">{isAr ? 'تخصصات متاحة:' : 'Available specialties:'}</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {alternativeSpecialties.slice(0, 4).map(sp => (
                        <Button key={sp.id} variant="outline" size="sm" className="text-xs"
                          onClick={() => { setSelectedSpecialtyId(sp.id); }}>
                          {isAr ? sp.nameAr : sp.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              browseDoctors.map(doc => {
                const docClinics = getClinicsForDoctor(doc.id).map(cid => getClinicById(cid)).filter(Boolean);
                const slot = getNextSlot(doc.id);
                return (
                  <button
                    key={doc.id}
                    className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left rtl:text-right group"
                    onClick={() => {
                      setSelectedDoctorId(doc.id);
                      setSelectedSpecialtyId(doc.specialtyId || selectedSpecialtyId);
                      const links = getClinicsForDoctor(doc.id);
                      if (doc.homeVisitEnabled) {
                        setStep('home_visit_mode');
                      } else if (bookingClinicId && links.includes(bookingClinicId)) {
                        // Already in clinic context — skip clinic selector
                        setStep('visit_type');
                      } else if (links.length > 1) {
                        setStep('clinic_select');
                      } else {
                        if (links.length === 1) setBookingClinicId(links[0]);
                        setStep('visit_type');
                      }
                    }}
                    data-testid={`btn-select-doctor-${doc.id}`}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Stethoscope className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{isAr ? doc.nameAr : doc.name}</p>
                      <div className="flex flex-wrap gap-x-3 mt-0.5">
                        {docClinics.slice(0, 2).map(c => c && (
                          <p key={c.id} className="text-xs text-muted-foreground flex items-center gap-1">
                            <Building2 className="h-3 w-3" />{isAr ? c.nameAr : c.name}
                          </p>
                        ))}
                      </div>
                      {slot && (
                        <p className="text-xs text-blue-600 flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />{slot}
                        </p>
                      )}
                    </div>
                    <ArrowRight className={`h-4 w-4 text-muted-foreground group-hover:text-primary shrink-0 ${isAr ? 'rotate-180' : ''}`} />
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Home Visit Mode ──
  if (step === 'home_visit_mode') {
    const backTo: Step = selectedSpecialtyId ? 'doctor_browse' : 'specialty';
    return (
      <div>
        <BackButton to={backTo} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" />
              {isAr ? 'نوع الزيارة' : 'Visit Mode'}
            </CardTitle>
            <CardDescription>
              {isAr ? 'هل تريد زيارة العيادة أم زيارة منزلية؟' : 'Would you like a clinic visit or a home visit?'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <button
              className="w-full flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left rtl:text-right"
              onClick={() => {
                setIsHomeVisit(false);
                const links = getClinicsForDoctor(selectedDoctorId);
                if (links.length > 1) {
                  setStep('clinic_select');
                } else {
                  if (links.length === 1) setBookingClinicId(links[0]);
                  setStep('visit_type');
                }
              }}
              data-testid="button-clinic-visit"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="text-start">
                <p className="font-semibold">{isAr ? 'زيارة العيادة' : 'Clinic Visit'}</p>
                <p className="text-xs text-muted-foreground">{isAr ? 'احجز موعدًا في العيادة' : 'Book an appointment at the clinic'}</p>
              </div>
            </button>
            <button
              className="w-full flex items-center gap-3 p-4 rounded-lg border border-emerald-200 bg-emerald-50/50 hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left rtl:text-right dark:border-emerald-800 dark:bg-emerald-950/20"
              onClick={() => { setIsHomeVisit(true); setStep('home_address'); }}
              data-testid="button-home-visit"
            >
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                <Home className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="text-start">
                <p className="font-semibold text-emerald-800 dark:text-emerald-300">{isAr ? 'زيارة منزلية' : 'Home Visit'}</p>
                <p className="text-xs text-emerald-700/70 dark:text-emerald-400">
                  {isAr
                    ? `الطبيب يجيء إليك · ${selectedDoctor?.homeVisitPrice || 0} ج.م`
                    : `Doctor comes to you · ${selectedDoctor?.homeVisitPrice || 0} EGP`}
                </p>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Home Address ──
  if (step === 'home_address') {
    const canProceed = homeAddress.trim().length >= 5;
    return (
      <div>
        <BackButton to="home_visit_mode" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              {isAr ? 'عنوان الزيارة المنزلية' : 'Home Visit Address'}
            </CardTitle>
            <CardDescription>
              {isAr ? 'أدخل عنوانك بالتفصيل ليتمكن الطبيب من الوصول إليك' : 'Enter your address in detail so the doctor can reach you'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="home-address">{isAr ? 'العنوان *' : 'Street Address *'}</Label>
              <Input
                id="home-address"
                value={homeAddress}
                onChange={e => setHomeAddress(e.target.value)}
                placeholder={isAr ? 'الشارع، المبنى، الطابق...' : 'Street, building, floor...'}
                data-testid="input-home-address"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="home-area">{isAr ? 'المنطقة / الحي' : 'Area / District'}</Label>
              <Input
                id="home-area"
                value={homeArea}
                onChange={e => setHomeArea(e.target.value)}
                placeholder={isAr ? 'المنطقة أو الحي...' : 'Area or district...'}
                data-testid="input-home-area"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? 'المحافظة' : 'Governorate'}</Label>
              <Select value={homeCity} onValueChange={setHomeCity}>
                <SelectTrigger data-testid="select-home-city">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60 max-h-60 overflow-y-auto">
                  {EGYPT_GOVERNORATES.map(g => (
                    <SelectItem key={g.en} value={g.en}>{isAr ? g.ar : g.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="home-location-pin">{isAr ? 'رابط الموقع (اختياري)' : 'Location Link (optional)'}</Label>
              <div className="flex gap-2">
                <Input
                  id="home-location-pin"
                  value={homeLocationPin}
                  onChange={e => setHomeLocationPin(e.target.value)}
                  placeholder="https://maps.google.com/..."
                  className="flex-1"
                  data-testid="input-home-location-pin"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={locationLoading}
                  onClick={() => {
                    setLocationLoading(true);
                    navigator.geolocation.getCurrentPosition(
                      pos => {
                        setHomeLocationPin(`https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`);
                        setLocationLoading(false);
                      },
                      () => setLocationLoading(false)
                    );
                  }}
                  data-testid="button-detect-home-location"
                >
                  {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {homeLocationPin && homeLocationPin.startsWith('https://') && (
              <a
                href={homeLocationPin}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline underline-offset-2 flex items-center gap-1"
              >
                <MapPin className="h-3 w-3" />
                {isAr ? 'معاينة الموقع على الخريطة' : 'Preview on map'}
              </a>
            )}
            {selectedDoctor?.homeVisitPrice && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-3 flex items-center gap-3">
                <Home className="h-4 w-4 text-orange-500 shrink-0" />
                <span className="text-sm text-orange-700 dark:text-orange-300">
                  {isAr
                    ? `رسوم الزيارة المنزلية: ${selectedDoctor.homeVisitPrice} ج.م`
                    : `Home visit fee: ${selectedDoctor.homeVisitPrice} EGP`}
                </span>
              </div>
            )}
            <Button
              className="w-full gap-2"
              onClick={() => setStep('date')}
              disabled={!canProceed}
              data-testid="button-confirm-address"
            >
              <ArrowRight className="h-4 w-4" />
              {isAr ? 'متابعة لاختيار الموعد' : 'Continue to Select Date'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Date selection ──
  if (step === 'date') {
    const backTo: Step = isHomeVisit ? 'home_address' : 'visit_type';
    return (
      <div>
        <BackButton to={backTo} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />{t('booking.selectDate')}</CardTitle>
            <CardDescription>{t('booking.dateDescription')} {getName(selectedDoctorId, platformDoctors)}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-3">
              {availableDates.map(date => (
                <Button key={date} variant="outline" className="h-auto p-3"
                  onClick={() => { setSelectedDate(date); setSelectedTime(''); setStep('time'); }}
                  data-testid={`button-date-${date}`}
                >
                  <Calendar className="h-4 w-4 mr-2 rtl:mr-0 rtl:ml-2 text-primary" />
                  {formatDate(date, language)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Time selection ──
  if (step === 'time') {
    return (
      <div>
        <BackButton to="date" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />{t('booking.selectTime')}</CardTitle>
            <CardDescription>{t('booking.timeDescription')} {formatDate(selectedDate, language)}</CardDescription>
          </CardHeader>
          <CardContent>
            {availableSlots.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">{t('booking.noSlots')}</p>
            ) : (
              <div className="grid gap-2 grid-cols-3 sm:grid-cols-4">
                {availableSlots.map(slot => (
                  <Button key={slot} variant={selectedTime === slot ? 'default' : 'outline'}
                    onClick={() => { setSelectedTime(slot); setStep('confirm'); }}
                    data-testid={`button-slot-${slot}`}
                  >
                    {slot}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Confirmation ──
  return (
    <div>
      <BackButton to="time" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Check className="h-5 w-5 text-primary" />{t('booking.confirmTitle')}</CardTitle>
          <CardDescription>{t('booking.confirmDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border p-4">
            {!patientId && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('appointments.patient')}</span>
                <span className="font-medium">{getName(selectedPatientId, patients)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('booking.specialty')}</span>
              <span className="font-medium">{getName(selectedSpecialtyId, specialties)}</span>
            </div>
            {selectedVisitType && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{isAr ? 'نوع الزيارة' : 'Visit Type'}</span>
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">{isAr ? selectedVisitType.nameAr : selectedVisitType.name}</span>
                  {selectedVisitType.isUrgent && <Badge variant="destructive" className="text-xs px-1.5 py-0">{isAr ? 'مستعجل' : 'Urgent'}</Badge>}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('appointments.doctor')}</span>
              <span className="font-medium">{getName(selectedDoctorId, platformDoctors)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{isAr ? 'نوع الزيارة' : 'Visit Mode'}</span>
              <span className="flex items-center gap-1.5 font-medium">
                {isHomeVisit
                  ? <><Home className="h-3.5 w-3.5 text-orange-500" />{isAr ? 'زيارة منزلية' : 'Home Visit'}</>
                  : <><Building2 className="h-3.5 w-3.5 text-primary" />{isAr ? 'زيارة العيادة' : 'Clinic Visit'}</>
                }
              </span>
            </div>
            {isHomeVisit && homeAddress && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{isAr ? 'العنوان' : 'Address'}</span>
                <span className="font-medium text-right max-w-[60%]">
                  {[homeAddress, homeArea, homeCity].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('appointments.date')}</span>
              <span className="font-medium">{formatDate(selectedDate, language)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('appointments.time')}</span>
              <span className="font-medium">{selectedTime}</span>
            </div>
            {(selectedVisitType || isHomeVisit) && (
              <>
                <Separator />
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-muted-foreground">{isAr ? 'التكلفة' : 'Cost'}</span>
                  <span className="text-primary">
                    {isHomeVisit && selectedDoctor?.homeVisitPrice
                      ? `${selectedDoctor.homeVisitPrice} ${isAr ? 'ج.م' : 'EGP'}`
                      : selectedVisitType
                        ? `${selectedVisitType.price} ${isAr ? 'ج.م' : 'EGP'}`
                        : '—'
                    }
                  </span>
                </div>
              </>
            )}
          </div>
          <Button className="w-full gap-2" size="lg" onClick={handleConfirm} data-testid="button-confirm-booking">
            <Check className="h-5 w-5" />
            {t('booking.confirmBooking')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default BookingWizard;
