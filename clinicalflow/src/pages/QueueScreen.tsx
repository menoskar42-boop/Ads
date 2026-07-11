import { useState, useEffect } from 'react';
import { Visit, User, Patient } from '@/types';
import { visitStore, getQueueInfo } from '@/stores/visitStore';
import { userStore } from '@/stores/userStore';
import { patientStore } from '@/stores/patientStore';
import { visitTypeStore } from '@/stores/visitTypeStore';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';
import { AlertTriangle, User as UserIcon, Clock, Stethoscope, ClipboardList } from 'lucide-react';

function useReactiveStore<T>(store: { getAll: () => T[]; subscribe: (cb: () => void) => () => void }) {
  const [items, setItems] = useState<T[]>(store.getAll());
  useEffect(() => {
    const unsub = store.subscribe(() => setItems([...store.getAll()]));
    return unsub;
  }, [store]);
  return items;
}

const QueueScreen = () => {
  const { language, isRTL } = useLanguage();
  const visits = useReactiveStore(visitStore);
  const users = useReactiveStore(userStore);
  const patients = useReactiveStore(patientStore);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const doctors = users.filter(u => u.role === 'doctor' && u.isActive);

  const getPatientName = (patientId: string) => {
    const p = patients.find(pt => pt.id === patientId);
    if (!p) return patientId;
    return language === 'ar' ? p.nameAr : p.name;
  };

  const getDoctorName = (doctorId: string) => {
    const d = users.find(u => u.id === doctorId);
    if (!d) return doctorId;
    return language === 'ar' ? d.nameAr : d.name;
  };

  const getVisitTypeName = (visitTypeId?: string): string | null => {
    if (!visitTypeId) return null;
    const vt = visitTypeStore.get(v => v.id === visitTypeId);
    if (!vt) return null;
    return language === 'ar' ? vt.nameAr : vt.name;
  };

  const formatArrivalTime = (iso?: string) => {
    if (!iso) return '--:--';
    const d = new Date(iso);
    return d.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeDoctors = doctors.filter(doc => {
    const todayVisits = visits.filter(
      v => v.doctorId === doc.id && v.date === today &&
        (v.status === 'waiting' || v.status === 'in_consultation')
    );
    return todayVisits.length > 0;
  });

  const getDoctorQueue = (doctorId: string) => {
    const waiting = visits.filter(
      v => v.doctorId === doctorId && v.date === today && v.status === 'waiting'
    );
    waiting.sort((a, b) => {
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;
      return (a.arrivalTime || a.createdAt).localeCompare(b.arrivalTime || b.createdAt);
    });
    return waiting.slice(0, 5);
  };

  const getCurrentPatient = (doctorId: string) => {
    return visits.find(
      v => v.doctorId === doctorId && v.date === today && v.status === 'in_consultation'
    );
  };

  return (
    <div
      className="min-h-screen bg-background p-6 sm:p-8"
      dir={isRTL ? 'rtl' : 'ltr'}
      data-testid="queue-screen"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-8">
          <div className="flex items-center gap-3">
            <Stethoscope className="h-8 w-8 text-primary" />
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground" data-testid="text-queue-title">
              {language === 'ar' ? 'شاشة الانتظار' : 'Patient Queue'}
            </h1>
          </div>
          <div className="text-xl font-medium text-muted-foreground" data-testid="text-queue-time">
            {currentTime.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
            <span className="mx-2">|</span>
            {currentTime.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>

        {activeDoctors.length === 0 && (
          <div className="flex items-center justify-center h-64">
            <p className="text-2xl text-muted-foreground" data-testid="text-no-active-doctors">
              {language === 'ar' ? 'لا يوجد أطباء نشطين حالياً' : 'No active doctors at this time'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {activeDoctors.map(doctor => {
            const currentPatient = getCurrentPatient(doctor.id);
            const queue = getDoctorQueue(doctor.id);

            return (
              <Card
                key={doctor.id}
                className="p-0 overflow-visible"
                data-testid={`card-doctor-queue-${doctor.id}`}
              >
                <div className="bg-primary text-primary-foreground px-5 py-4 rounded-t-md">
                  <h2 className="text-xl font-bold truncate" data-testid={`text-doctor-name-${doctor.id}`}>
                    {getDoctorName(doctor.id)}
                  </h2>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {language === 'ar' ? 'المريض الحالي' : 'Now Seeing'}
                    </p>
                    {currentPatient ? (
                      <div
                        className="flex items-center gap-3 bg-primary/10 rounded-md px-4 py-3 flex-wrap"
                        data-testid={`text-current-patient-${doctor.id}`}
                      >
                        <UserIcon className="h-5 w-5 text-primary shrink-0" />
                        <span className="text-lg font-semibold text-foreground truncate flex-1">
                          {getPatientName(currentPatient.patientId)}
                        </span>
                        {currentPatient.isUrgent && (
                          <Badge variant="destructive" className="shrink-0" data-testid={`badge-urgent-current-${doctor.id}`}>
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {language === 'ar' ? 'مستعجل' : 'URGENT'}
                          </Badge>
                        )}
                        {getVisitTypeName(currentPatient.visitTypeId) && (
                          <Badge variant="secondary" className="shrink-0 gap-1" data-testid={`badge-visit-type-current-${doctor.id}`}>
                            <ClipboardList className="h-3 w-3" />
                            {getVisitTypeName(currentPatient.visitTypeId)}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic px-4 py-3" data-testid={`text-no-current-${doctor.id}`}>
                        {language === 'ar' ? 'لا يوجد مريض حالياً' : 'No patient currently'}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {language === 'ar' ? 'قائمة الانتظار' : 'Waiting Queue'}
                    </p>
                    {queue.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic px-4 py-2" data-testid={`text-empty-queue-${doctor.id}`}>
                        {language === 'ar' ? 'لا يوجد مرضى في الانتظار' : 'No patients waiting'}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {queue.map((visit, idx) => (
                          <div
                            key={visit.id}
                            className="flex items-center gap-3 rounded-md px-4 py-2.5 hover-elevate"
                            data-testid={`row-queue-patient-${visit.id}`}
                          >
                            <span className="text-base font-bold text-muted-foreground w-6 text-center shrink-0">
                              {idx + 1}
                            </span>
                            <UserIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-base font-medium text-foreground truncate flex-1">
                              {getPatientName(visit.patientId)}
                            </span>
                            {visit.isUrgent && (
                              <Badge variant="destructive" className="shrink-0" data-testid={`badge-urgent-${visit.id}`}>
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {language === 'ar' ? 'مستعجل' : 'URGENT'}
                              </Badge>
                            )}
                            {getVisitTypeName(visit.visitTypeId) && (
                              <Badge variant="secondary" className="shrink-0 text-xs gap-1" data-testid={`badge-vt-${visit.id}`}>
                                {getVisitTypeName(visit.visitTypeId)}
                              </Badge>
                            )}
                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatArrivalTime(visit.arrivalTime)}
                              </div>
                              {(() => {
                                const q = getQueueInfo(doctor.id, visit.id);
                                return q.position > 0 ? (
                                  <span className="text-xs text-primary font-medium">
                                    ~{new Date(q.estimatedReadyAt).toLocaleTimeString(
                                      language === 'ar' ? 'ar-EG' : 'en-US',
                                      { hour: '2-digit', minute: '2-digit' }
                                    )}
                                  </span>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default QueueScreen;
