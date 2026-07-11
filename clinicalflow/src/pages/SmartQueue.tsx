import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePatients } from '@/hooks/usePatients';
import { useUsers } from '@/hooks/useUsers';
import {
  appointmentStore,
  buildQueue,
  confirmPaymentAndQueue,
  markAsEmergency,
  removeFromQueue,
  sendToDoctor,
  completeVisit,
  visitStore,
} from '@/stores/visitStore';
import {
  getQueueSettings,
  predictQueueTiming,
  smartReorder,
  computeNoShowScore,
  getDelayLevel,
  recordActualDuration,
  type TimedAppointment,
} from '@/stores/queueEngineStore';
import { Appointment, Patient, User } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Users, AlertTriangle, Zap, Play, CheckCircle2,
  Trash2, Clock, RefreshCw, Activity, AlertCircle,
} from 'lucide-react';

// ─── Priority badge ───────────────────────────────────────────
function PriorityBadge({ apt, isAr }: { apt: Appointment; isAr: boolean }) {
  if (apt.isEmergency) {
    return <Badge variant="destructive" className="text-xs">{isAr ? 'طوارئ' : 'Emergency'}</Badge>;
  }
  if (apt.isUrgent) {
    return <Badge className="bg-orange-500 hover:bg-orange-600 text-xs">{isAr ? 'عاجل' : 'Urgent'}</Badge>;
  }
  return <Badge variant="secondary" className="text-xs">{isAr ? 'عادي' : 'Normal'}</Badge>;
}

// ─── Status badge ─────────────────────────────────────────────
function StatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const map: Record<string, { label: string; labelAr: string; cls: string }> = {
    in_queue:    { label: 'In Queue',    labelAr: 'في الانتظار',   cls: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700' },
    with_doctor: { label: 'With Doctor', labelAr: 'مع الطبيب',     cls: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700' },
    done:        { label: 'Done',        labelAr: 'انتهى',         cls: 'bg-muted text-muted-foreground border-border' },
    expected:    { label: 'Expected',    labelAr: 'متوقع',         cls: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700' },
  };
  const m = map[status] || { label: status, labelAr: status, cls: 'bg-muted text-muted-foreground' };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${m.cls}`}>
      {isAr ? m.labelAr : m.label}
    </span>
  );
}

// ─── Visit type badge ─────────────────────────────────────────
function VisitTypeBadge({ vt, isAr }: { vt?: string; isAr: boolean }) {
  if (!vt) return null;
  const label = vt === 'consultation'
    ? (isAr ? 'استشارة' : 'Consultation')
    : (isAr ? 'كشف' : 'Check-up');
  return (
    <span className="text-xs px-2 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700">
      {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────
const SmartQueue: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { patients } = usePatients();
  const { users } = useUsers();
  const isAr = language === 'ar';

  const [queue, setQueue] = useState<TimedAppointment[]>([]);
  const [pending, setPending] = useState<Appointment[]>([]);

  const clinicId = user?.clinicId || '';

  const refresh = useCallback(() => {
    const settings = getQueueSettings(clinicId);
    let raw = buildQueue(clinicId);
    // Apply smart reordering if enabled
    if (settings.smartOptimizationEnabled) {
      raw = smartReorder(raw, clinicId);
    }
    const timed = predictQueueTiming(raw, clinicId);
    setQueue(timed);

    // Pending = today's scheduled/confirmed/expected not yet in queue
    const today = new Date().toISOString().split('T')[0];
    const p = appointmentStore.filter(
      a => a.clinicId === clinicId &&
        ['scheduled', 'confirmed', 'expected'].includes(a.status) &&
        a.date === today,
    );
    setPending(p);
  }, [clinicId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 15_000);
    return () => clearInterval(id);
  }, [refresh]);

  const getPatient = (id: string): Patient | undefined => patients.find(p => p.id === id);
  const getDoctor  = (id: string): User | undefined => users.find(u => u.id === id);

  const patientName = (patientId: string) => {
    const p = getPatient(patientId);
    if (!p) return patientId;
    return isAr ? p.nameAr || p.name : p.name;
  };

  const doctorName = (doctorId: string) => {
    const d = getDoctor(doctorId);
    if (!d) return doctorId;
    return isAr ? d.nameAr || d.name : d.name;
  };

  const handleConfirmPayment = (apt: Appointment) => {
    const result = confirmPaymentAndQueue(apt.id, user?.id);
    if (result.ok) {
      toast.success(isAr ? 'تم تأكيد الدفع ودخول الطابور' : 'Payment confirmed — patient added to queue');
      refresh();
    } else {
      toast.error(isAr ? 'فشل التأكيد' : `Failed: ${result.reason}`);
    }
  };

  const handleEmergency = (apt: Appointment) => {
    const result = markAsEmergency(apt.id, user?.id);
    if (result.ok) {
      toast.warning(isAr ? 'تم رفع الأولوية إلى طوارئ' : 'Escalated to Emergency');
      refresh();
    } else {
      toast.error(isAr ? 'فشل التصعيد' : `Failed: ${result.reason}`);
    }
  };

  const handleStart = (apt: Appointment) => {
    const visit = visitStore.get(v => v.appointmentId === apt.id);
    if (visit) {
      const ok = sendToDoctor(visit.id);
      if (ok) {
        const now = new Date().toISOString();
        appointmentStore.update(a => a.id === apt.id, { status: 'with_doctor', startedAt: now });
        toast.success(isAr ? 'المريض مع الطبيب الآن' : 'Patient sent to doctor');
        refresh();
        return;
      }
    }
    toast.error(isAr ? 'لم يتم إيجاد الزيارة' : 'Visit not found');
  };

  const handleDone = (apt: Appointment) => {
    const visit = visitStore.get(v => v.appointmentId === apt.id);
    if (visit) {
      const ok = completeVisit(visit.id);
      if (ok) {
        const now = new Date().toISOString();
        const actualDuration = apt.startedAt
          ? Math.round((Date.now() - new Date(apt.startedAt).getTime()) / 60_000)
          : undefined;
        appointmentStore.update(a => a.id === apt.id, {
          status: 'done',
          finishedAt: now,
          ...(actualDuration !== undefined && { actualDuration }),
        });
        if (actualDuration !== undefined) {
          recordActualDuration(clinicId, apt.visitTypeCategory, actualDuration);
        }
        toast.success(isAr ? 'تمت الزيارة' : 'Visit completed');
        refresh();
        return;
      }
    }
    toast.error(isAr ? 'لا يمكن إنهاء الزيارة' : 'Cannot complete visit');
  };

  const handleRemove = (apt: Appointment) => {
    const ok = removeFromQueue(apt.id, user?.id);
    if (ok) {
      toast.info(isAr ? 'تمت إزالة المريض من الطابور' : 'Patient removed from queue');
      refresh();
    }
  };

  const settings = getQueueSettings(clinicId);
  const strategyLabel: Record<string, { en: string; ar: string }> = {
    fifo:          { en: 'FIFO',               ar: 'الأول يُخدَّم أولاً' },
    urgent_first:  { en: 'Urgent First',       ar: 'العاجل أولاً' },
    consult_mix:   { en: 'Consultations Mix',  ar: 'خلط الكشوفات' },
    consult_first: { en: 'Consultations First',ar: 'الكشوفات أولاً' },
    custom:        { en: 'Custom Pattern',     ar: 'نمط مخصص' },
  };
  const stratLabel = strategyLabel[settings.strategyType] || strategyLabel['fifo'];

  const navigate = useNavigate();

  return (
    <div className="p-4 space-y-4 max-w-3xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">
            {isAr ? 'الطابور الذكي' : 'Smart Queue'}
          </h1>
          <Badge variant="outline" className="text-xs">
            {isAr ? stratLabel.ar : stratLabel.en}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
            <button
              className="px-3 py-1.5 bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              onClick={() => navigate('/queue')}
            >
              {isAr ? 'عادي' : 'Normal'}
            </button>
            <button className="px-3 py-1.5 bg-primary text-primary-foreground">
              {isAr ? 'ذكي' : 'Smart AI'}
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={refresh} className="gap-1">
            <RefreshCw className="h-4 w-4" />
            {isAr ? 'تحديث' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="py-3">
          <CardContent className="p-0 flex flex-col items-center">
            <span className="text-2xl font-bold text-blue-600">{queue.length}</span>
            <span className="text-xs text-muted-foreground mt-0.5">{isAr ? 'في الطابور' : 'In Queue'}</span>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-0 flex flex-col items-center">
            <span className="text-2xl font-bold text-orange-500">
              {queue.filter(a => a.isUrgent || a.isEmergency).length}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">{isAr ? 'عاجل/طوارئ' : 'Priority'}</span>
          </CardContent>
        </Card>
        <Card className="py-3">
          <CardContent className="p-0 flex flex-col items-center">
            <span className="text-2xl font-bold text-muted-foreground">{pending.length}</span>
            <span className="text-xs text-muted-foreground mt-0.5">{isAr ? 'منتظر' : 'Pending'}</span>
          </CardContent>
        </Card>
      </div>

      {/* Active queue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            {isAr ? 'الطابور الحالي' : 'Active Queue'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {isAr ? 'الطابور فارغ' : 'Queue is empty'}
            </p>
          ) : (
            <div className="divide-y">
              {queue.map((apt, idx) => (
                <div
                  key={apt.id}
                  className={`p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${apt.isEmergency ? 'bg-red-50' : apt.isUrgent ? 'bg-orange-50' : ''}`}
                >
                  {/* Position + priority */}
                  <div className="flex items-center gap-2 min-w-[80px]">
                    <span className="text-lg font-bold text-muted-foreground w-7 text-center">{idx + 1}</span>
                    <PriorityBadge apt={apt} isAr={isAr} />
                  </div>

                  {/* Patient info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-sm truncate">{patientName(apt.patientId)}</p>
                      {/* No-show risk warning */}
                      {computeNoShowScore(apt) >= 40 && apt.status === 'in_queue' && (
                        <AlertCircle
                          className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0"
                          title={isAr ? 'احتمال غياب' : 'No-show risk'}
                        />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{doctorName(apt.doctorId)}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <StatusBadge status={apt.status} isAr={isAr} />
                      <VisitTypeBadge vt={apt.visitTypeCategory} isAr={isAr} />
                      {apt.checkedInAt && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />
                          {new Date(apt.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    {/* Timing row */}
                    {apt.status === 'in_queue' && (
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {/* Delay indicator */}
                        {(() => {
                          const level = getDelayLevel(apt.waitMinutes);
                          const dot = level === 'green'  ? 'bg-green-500'
                                    : level === 'yellow' ? 'bg-yellow-500'
                                    : 'bg-red-500';
                          const label = apt.waitMinutes === 0
                            ? (isAr ? 'الآن' : 'Now')
                            : isAr
                              ? `${apt.waitMinutes} د`
                              : `${apt.waitMinutes} min`;
                          return (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                              {label}
                              {level === 'red' && <span className="text-red-500 font-medium">{isAr ? '⚠️ تأخير' : '⚠️ delay'}</span>}
                            </span>
                          );
                        })()}
                        {/* Expected start time */}
                        <span className="text-xs text-muted-foreground">
                          {isAr ? 'متوقع: ' : 'Est: '}
                          {new Date(apt.expectedStartAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {/* Duration estimate */}
                        <span className="text-xs text-muted-foreground">
                          ~{apt.estimatedDuration}{isAr ? ' د' : ' min'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {apt.status === 'in_queue' && (
                      <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={() => handleStart(apt)}>
                        <Play className="h-3 w-3" />
                        {isAr ? 'ابدأ' : 'Start'}
                      </Button>
                    )}
                    {apt.status === 'with_doctor' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-green-500 text-green-700" onClick={() => handleDone(apt)}>
                        <CheckCircle2 className="h-3 w-3" />
                        {isAr ? 'انتهى' : 'Done'}
                      </Button>
                    )}
                    {!apt.isEmergency && apt.status !== 'done' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-red-400 text-red-600" onClick={() => handleEmergency(apt)}>
                        <AlertTriangle className="h-3 w-3" />
                        {isAr ? 'طوارئ' : 'Emergency'}
                      </Button>
                    )}
                    {apt.status === 'in_queue' && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => handleRemove(apt)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending — today's appointments not yet in queue */}
      {pending.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {isAr ? 'المواعيد المنتظرة اليوم' : "Today's Pending Appointments"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {pending.map(apt => (
                <div key={apt.id} className="p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{patientName(apt.patientId)}</p>
                    <p className="text-xs text-muted-foreground">{apt.time} — {doctorName(apt.doctorId)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleConfirmPayment(apt)}>
                      <Zap className="h-3 w-3" />
                      {isAr ? 'تأكيد الدخول' : 'Confirm & Queue'}
                    </Button>
                    {!apt.isEmergency && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => handleEmergency(apt)}>
                        <AlertTriangle className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
};

export default SmartQueue;
