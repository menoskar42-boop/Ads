import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { usePatients } from '@/hooks/usePatients';
import { visitTypeStore } from '@/stores/visitTypeStore';
import { getAvgVisitDuration, getQueueInfo, skipToEnd } from '@/stores/visitStore';
import { onDoctorNext, onNoShow, checkNearTurn, CLINIC_EVENTS, sendNotification } from '@/lib/clinicEngine';
import { useVisits } from '@/hooks/useVisits';
import { Visit, User, Patient, VisitType } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Bell, BellOff, Stethoscope, User as UserIcon, ArrowRight,
  CheckCircle2, AlertTriangle, Clock, Monitor, Volume2, VolumeX,
  PhoneCall, UserCheck, Activity, Home, MapPin, SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';

function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.8);
  } catch { /* AudioContext not available */ }
}



const QueueManagement: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { users } = useUsers();
  const { patients } = usePatients();
  const { visits, updateVisitStatus, sendToDoctor, completeVisit } = useVisits();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [lastCalledId, setLastCalledId] = useState<string | null>(null);
  const [obHighlightId, setObHighlightId] = useState<string | null>(() => {
    const id = sessionStorage.getItem('cf_ob_highlight');
    if (id) sessionStorage.removeItem('cf_ob_highlight');
    return id;
  });

  useEffect(() => {
    if (!obHighlightId) return;
    const t = setTimeout(() => setObHighlightId(null), 8000);
    return () => clearTimeout(t);
  }, [obHighlightId]);

  const isAr = language === 'ar';
  const today = new Date().toISOString().split('T')[0];
  const doctors = users.filter(u => u.role === 'doctor' && u.isActive);

  const getPatient = (id: string): Patient | undefined => patients.find(p => p.id === id);
  const getDoctor = (id: string): User | undefined => users.find(u => u.id === id);

  const getPatientName = (patientId: string) => {
    const p = getPatient(patientId);
    return p ? (isAr ? p.nameAr : p.name) : patientId;
  };

  const getDoctorName = (doctorId: string) => {
    const d = getDoctor(doctorId);
    return d ? (isAr ? d.nameAr : d.name) : doctorId;
  };

  const getVisitTypeName = (visitTypeId?: string): string | null => {
    if (!visitTypeId) return null;
    const vt = visitTypeStore.get(v => v.id === visitTypeId);
    if (!vt) return null;
    return isAr ? vt.nameAr : vt.name;
  };

  const getTodayVisits = (doctorId: string) => {
    return visits.filter(v => v.doctorId === doctorId && v.date === today);
  };

  const getWaiting = (doctorId: string) => {
    // Home visits never appear in the clinic queue
    const waiting = getTodayVisits(doctorId).filter(v => v.status === 'waiting' && !v.isHomeVisit);
    waiting.sort((a, b) => {
      const pa = a.priority === 'emergency' ? 3 : (a.isUrgent ? 2 : 1);
      const pb = b.priority === 'emergency' ? 3 : (b.isUrgent ? 2 : 1);
      if (pa !== pb) return pb - pa; // DESC: higher weight served first
      return (a.arrivalTime || a.createdAt).localeCompare(b.arrivalTime || b.createdAt);
    });
    return waiting;
  };

  const getTodayHomeVisits = (doctorId: string) => {
    return visits.filter(v => v.doctorId === doctorId && v.date === today && v.isHomeVisit)
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  const allTodayHomeVisits = visits.filter(v => v.date === today && v.isHomeVisit)
    .sort((a, b) => a.time.localeCompare(b.time));

  const getInConsultation = (doctorId: string) =>
    getTodayVisits(doctorId).find(v => v.status === 'in_consultation');

  const getCompleted = (doctorId: string) =>
    getTodayVisits(doctorId).filter(v => v.status === 'completed').length;

  const activeDoctors = doctors.filter(doc => {
    const tv = getTodayVisits(doc.id);
    return tv.some(v => v.status === 'waiting' || v.status === 'in_consultation' || v.status === 'checked_in');
  });

  const handleCallNext = async (doctorId: string) => {
    const waiting = getWaiting(doctorId);
    const next = waiting[0];
    if (!next) {
      toast.info(isAr ? 'لا يوجد مرضى في الانتظار' : 'No patients in queue');
      return;
    }
    try {
      await sendToDoctor(next.id);
      setLastCalledId(next.id);
      if (soundEnabled) playBeep();
      const name = getPatientName(next.patientId);
      toast.success(isAr ? `تم استدعاء ${name}` : `Called: ${name}`);
      const waitingAfter = getWaiting(doctorId).filter(v => v.id !== next.id);
      fireQueueNotifications(doctorId);
      onDoctorNext(next, doctorId, user?.clinicId || '', waitingAfter);
    } catch {
      toast.error(isAr ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const handleSendToDoctor = async (visitId: string, doctorId: string) => {
    try {
      const sent = visits.find(v => v.id === visitId);
      await sendToDoctor(visitId);
      if (soundEnabled) playBeep();
      toast.success(isAr ? 'تم إرسال المريض للطبيب' : 'Patient sent to doctor');
      const waitingAfter = getWaiting(doctorId).filter(v => v.id !== visitId);
      fireQueueNotifications(doctorId);
      if (sent) onDoctorNext(sent, doctorId, user?.clinicId || '', waitingAfter);
      if (user?.role === 'doctor') {
        navigate(`/clinical/${visitId}`);
      }
    } catch {
      toast.error(isAr ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const handleSkipToEnd = (visitId: string) => {
    const visit = visits.find(v => v.id === visitId);
    const ok = skipToEnd(visitId);
    if (ok) {
      toast.info(isAr ? 'تم تأخير المريض لآخر الطابور' : 'Patient moved to end of queue');
      if (visit) {
        const waitingAfter = getWaiting(visit.doctorId || '');
        checkNearTurn(visit.doctorId || '', user?.clinicId || '', waitingAfter);
        sendNotification(visit.patientId, CLINIC_EVENTS.QUEUE_UPDATED, { doctorId: visit.doctorId, clinicId: user?.clinicId });
      }
    }
  };

  const handleComplete = async (visitId: string) => {
    try {
      await completeVisit(visitId);
      toast.success(isAr ? 'تمت الاستشارة' : 'Visit completed');
    } catch {
      toast.error(isAr ? 'حدث خطأ' : 'Error occurred');
    }
  };

  const totalWaiting = visits.filter(v => v.date === today && v.status === 'waiting' && !v.isHomeVisit).length;
  const totalInConsultation = visits.filter(v => v.date === today && v.status === 'in_consultation').length;
  const totalCompleted = visits.filter(v => v.date === today && v.status === 'completed').length;

  const fireQueueNotifications = (doctorId: string) => {
    const waiting = getWaiting(doctorId);
    [{ pos: 3, msg: isAr ? 'دورك قرب' : 'Your turn is coming' },
     { pos: 2, msg: isAr ? 'فاضل مريضين' : 'Two patients ahead' }].forEach(({ pos, msg }) => {
      const v = waiting[pos - 1];
      if (v) {
        const name = getPatientName(v.patientId);
        toast.info(`${name} — ${msg}`, { duration: 5000 });
      }
    });
  };

  const formatEstimatedTime = (isoString: string) =>
    new Date(isoString).toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            {isAr ? 'إدارة طابور الانتظار' : 'Queue Management'}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAr ? 'التحكم بطابور المرضى واستدعائهم للأطباء' : 'Control patient flow and call patients to doctors'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
            <button className="px-3 py-1.5 bg-primary text-primary-foreground">
              {isAr ? 'عادي' : 'Normal'}
            </button>
            <button
              className="px-3 py-1.5 bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              onClick={() => navigate('/smart-queue')}
              data-testid="button-switch-smart-queue"
            >
              {isAr ? 'ذكي' : 'Smart AI'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {soundEnabled ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
            <Switch
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
              data-testid="switch-sound"
            />
            <Label className="text-sm text-muted-foreground cursor-pointer" onClick={() => setSoundEnabled(s => !s)}>
              {isAr ? 'تنبيه صوتي' : 'Sound Alert'}
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open('/queue-screen', '_blank')}
            data-testid="button-open-tv"
          >
            <Monitor className="h-4 w-4 me-1.5" />
            {isAr ? 'شاشة العرض' : 'TV Display'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalWaiting}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'في الانتظار' : 'Waiting'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
              <Stethoscope className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalInConsultation}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'في الاستشارة' : 'In Consultation'}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-chart-2/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-chart-2" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalCompleted}</p>
              <p className="text-xs text-muted-foreground">{isAr ? 'مكتمل اليوم' : 'Completed Today'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Home Visits Today stat */}
      {allTodayHomeVisits.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <Home className="h-4 w-4 text-orange-500" />
          <span className="text-sm text-muted-foreground">
            {allTodayHomeVisits.length} {isAr ? 'زيارة منزلية اليوم' : 'home visits scheduled today'}
          </span>
        </div>
      )}

      {activeDoctors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Activity className="h-12 w-12 mb-3 opacity-40" />
            <p className="text-sm">{isAr ? 'لا يوجد مرضى اليوم حتى الآن' : 'No active patients today'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {activeDoctors.map(doctor => {
            const waiting = getWaiting(doctor.id);
            const current = getInConsultation(doctor.id);
            const completedCount = getCompleted(doctor.id);

            return (
              <Card key={doctor.id} data-testid={`card-doctor-queue-${doctor.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Stethoscope className="h-4 w-4 text-primary" />
                      </div>
                      {isAr ? doctor.nameAr : doctor.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 me-1 text-chart-2" />
                        {completedCount}
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => handleCallNext(doctor.id)}
                        disabled={waiting.length === 0}
                        data-testid={`button-call-next-${doctor.id}`}
                        className="gap-1.5"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        {isAr ? 'استدعاء التالي' : 'Call Next'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {/* Current patient */}
                  <div className="rounded-lg border bg-purple-500/5 border-purple-500/20 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-2 flex items-center gap-1.5">
                      <Stethoscope className="h-3.5 w-3.5" />
                      {isAr ? 'في الاستشارة الآن' : 'Now In Consultation'}
                    </p>
                    {current ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <UserIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold text-foreground">
                            {getPatientName(current.patientId)}
                          </span>
                          {current.isUrgent && (
                            <Badge variant="destructive" className="text-xs px-1.5 py-0">
                              <AlertTriangle className="h-3 w-3 me-1" />
                              {isAr ? 'مستعجل' : 'Urgent'}
                            </Badge>
                          )}
                          {getVisitTypeName(current.visitTypeId) && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              {getVisitTypeName(current.visitTypeId)}
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleComplete(current.id)}
                          className="text-xs gap-1 h-7"
                          data-testid={`button-complete-${current.id}`}
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {isAr ? 'إنهاء' : 'Complete'}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        {isAr ? 'لا يوجد مريض في الاستشارة' : 'No patient in consultation'}
                      </p>
                    )}
                  </div>

                  {/* Waiting queue */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {isAr ? 'قائمة الانتظار' : 'Waiting Queue'}
                      {waiting.length > 0 && (
                        <Badge className="text-xs px-1.5 py-0 bg-amber-500 hover:bg-amber-500/80 ms-1">
                          {waiting.length}
                        </Badge>
                      )}
                    </p>
                    {waiting.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic px-1" data-testid={`text-empty-${doctor.id}`}>
                        {isAr ? 'لا يوجد مرضى في الانتظار' : 'No patients waiting'}
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {waiting.map((visit, idx) => {
                          const qInfo = getQueueInfo(doctor.id, visit.id);
                          return (
                            <div
                              key={visit.id}
                              className={`flex items-center gap-2 rounded-md px-3 py-2 transition-colors ${
                                visit.id === obHighlightId
                                  ? 'bg-emerald-500/10 border border-emerald-500/40 ring-1 ring-emerald-500/30'
                                  : visit.id === lastCalledId
                                  ? 'bg-primary/10 border border-primary/30'
                                  : 'bg-muted/40'
                              }`}
                              data-testid={`row-waiting-${visit.id}`}
                            >
                              <span className="text-sm font-bold text-muted-foreground w-5 shrink-0 text-center">
                                {idx + 1}
                              </span>
                              <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium block truncate">
                                  {getPatientName(visit.patientId)}
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Clock className="h-3 w-3" />
                                  {isAr
                                    ? `~${qInfo.estimatedWaitMinutes} د — ${formatEstimatedTime(qInfo.estimatedReadyAt)}`
                                    : `~${qInfo.estimatedWaitMinutes}m — ${formatEstimatedTime(qInfo.estimatedReadyAt)}`}
                                </span>
                              </div>
                              {visit.isUrgent && (
                                <Badge variant="destructive" className="text-xs px-1.5 py-0 shrink-0">
                                  <AlertTriangle className="h-3 w-3" />
                                </Badge>
                              )}
                              {getVisitTypeName(visit.visitTypeId) && (
                                <Badge variant="secondary" className="text-xs px-1.5 py-0 shrink-0">
                                  {getVisitTypeName(visit.visitTypeId)}
                                </Badge>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs gap-1 shrink-0"
                                onClick={() => handleSendToDoctor(visit.id, doctor.id)}
                                data-testid={`button-send-${visit.id}`}
                              >
                                <ArrowRight className="h-3 w-3" />
                                {isAr ? 'أرسل' : 'Send'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1 shrink-0"
                                onClick={() => handleSkipToEnd(visit.id)}
                                data-testid={`button-skip-${visit.id}`}
                                title={isAr ? 'تأخير لآخر الطابور' : 'Move to end of queue'}
                              >
                                <SkipForward className="h-3 w-3" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Home Visits Today section */}
      {allTodayHomeVisits.length > 0 && (
        <Card data-testid="card-home-visits-today">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
                <Home className="h-4 w-4 text-orange-500" />
              </div>
              {isAr ? 'الزيارات المنزلية اليوم' : "Home Visits Today"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {doctors.filter(doc => getTodayHomeVisits(doc.id).length > 0).map(doctor => {
              const docHVs = getTodayHomeVisits(doctor.id);
              return (
                <div key={doctor.id} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Stethoscope className="h-3.5 w-3.5" />
                    {isAr ? doctor.nameAr : doctor.name}
                  </p>
                  {docHVs.map(visit => (
                    <div
                      key={visit.id}
                      className="flex items-center gap-3 rounded-md border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10 px-3 py-2"
                      data-testid={`row-home-visit-${visit.id}`}
                    >
                      <Clock className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                      <span className="text-sm font-semibold text-foreground w-12 shrink-0">{visit.time}</span>
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium flex-1 truncate">{getPatientName(visit.patientId)}</span>
                      {visit.homeAddress && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 truncate max-w-[40%]">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {[visit.homeAddress, visit.homeArea, visit.homeCity].filter(Boolean).join(', ')}
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 dark:text-orange-400 shrink-0">
                        <Home className="h-3 w-3 me-1" />
                        {isAr ? 'منزلية' : 'Home'}
                      </Badge>
                    </div>
                  ))}
                  <Separator />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default QueueManagement;
