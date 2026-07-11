import React from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useAppointments, useVisits, useInvoices } from '@/hooks/useVisits';
import { useMedicalNotes } from '@/hooks/useMedicalNotes';
import { useVitalSigns } from '@/hooks/useVitalSigns';
import { usePrescriptions } from '@/hooks/usePrescriptions';
import { useDocuments } from '@/hooks/useDocuments';
import { useUsers } from '@/hooks/useUsers';
import { useSpecialties } from '@/hooks/useSpecialties';
import { formatDate, formatTime } from '@/lib/dateFormat';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Calendar, Stethoscope, FileText, DollarSign, ClipboardList,
  Activity, Clock, CheckCircle, XCircle, AlertTriangle, UserCheck, Pill,
  FolderOpen, FlaskConical, ScanLine, EyeOff,
} from 'lucide-react';

interface TimelineEvent {
  id: string;
  date: string;
  time?: string;
  type: 'appointment' | 'visit' | 'invoice_paid' | 'medical_note' | 'vital_sign' | 'prescription' | 'document';
  title: string;
  subtitle?: string;
  status?: string;
  icon: React.ReactNode;
  color: string;
  isPrivate?: boolean;
}

const statusColors: Record<string, string> = {
  scheduled: 'bg-primary/10 text-primary',
  confirmed: 'bg-chart-1/10 text-chart-1',
  cancelled: 'bg-destructive/10 text-destructive',
  completed: 'bg-chart-2/10 text-chart-2',
  converted: 'bg-chart-3/10 text-chart-3',
  no_show: 'bg-chart-4/10 text-chart-4',
  checked_in: 'bg-chart-1/10 text-chart-1',
  booked: 'bg-primary/10 text-primary',
  paid: 'bg-chart-2/10 text-chart-2',
  partially_paid: 'bg-chart-3/10 text-chart-3',
  pending: 'bg-chart-4/10 text-chart-4',
};

const iconByType: Record<string, { icon: React.ReactNode; color: string }> = {
  appointment: { icon: <Calendar className="h-4 w-4" />, color: 'bg-primary text-primary-foreground' },
  visit: { icon: <Stethoscope className="h-4 w-4" />, color: 'bg-chart-1 text-primary-foreground' },
  invoice_paid: { icon: <DollarSign className="h-4 w-4" />, color: 'bg-chart-2 text-primary-foreground' },
  medical_note: { icon: <ClipboardList className="h-4 w-4" />, color: 'bg-chart-3 text-primary-foreground' },
  vital_sign: { icon: <Activity className="h-4 w-4" />, color: 'bg-chart-4 text-primary-foreground' },
  prescription: { icon: <Pill className="h-4 w-4" />, color: 'bg-chart-5 text-primary-foreground' },
  document: { icon: <FolderOpen className="h-4 w-4" />, color: 'bg-indigo-500 text-primary-foreground' },
};

const categoryLabels: Record<string, { en: string; ar: string }> = {
  general: { en: 'General', ar: 'عام' },
  diagnosis: { en: 'Diagnosis', ar: 'تشخيص' },
  prescription: { en: 'Prescription', ar: 'وصفة طبية' },
  allergy: { en: 'Allergy', ar: 'حساسية' },
  chronic_condition: { en: 'Chronic', ar: 'مزمن' },
  surgical_history: { en: 'Surgery', ar: 'جراحة' },
  follow_up: { en: 'Follow-up', ar: 'متابعة' },
};

const docTypeLabels: Record<string, { en: string; ar: string }> = {
  prescription: { en: 'Prescription', ar: 'وصفة طبية' },
  lab_test: { en: 'Lab Test', ar: 'تحليل' },
  radiology: { en: 'Radiology', ar: 'أشعة' },
  medical_report: { en: 'Medical Report', ar: 'تقرير طبي' },
};

interface VisitTimelineTabProps {
  patientId: string;
}

const VisitTimelineTab: React.FC<VisitTimelineTabProps> = ({ patientId }) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { appointments } = useAppointments();
  const { visits } = useVisits();
  const { invoices, payments } = useInvoices();
  const { notes } = useMedicalNotes({ patientId });
  const { vitals } = useVitalSigns();
  const { prescriptions } = usePrescriptions({ patientId });
  const { getPatientDocuments } = useDocuments();
  const { users } = useUsers();
  const { specialties } = useSpecialties();

  // Only admins and receptionists see doctor identities
  const canSeeDoctorIdentity = user?.role === 'admin' || user?.role === 'reception' || user?.role === 'super_admin';

  const getName = (userId: string) => {
    const u = users.find(x => x.id === userId);
    return language === 'ar' ? u?.nameAr : u?.name;
  };

  const getSpecialty = (specId: string) => {
    const s = specialties.find(x => x.id === specId);
    return language === 'ar' ? s?.nameAr : s?.name;
  };

  // Build subtitle with optional doctor identity
  const buildSubtitle = (
    doctorId: string,
    specialtyId: string,
    extra?: string,
    isOwnEntry = false,
  ): { text: string; isPrivate: boolean } => {
    const spec = getSpecialty(specialtyId) || '—';

    if (canSeeDoctorIdentity) {
      const doctor = getName(doctorId) || '—';
      return { text: `${doctor} · ${spec}${extra ? ` — ${extra}` : ''}`, isPrivate: false };
    }

    if (isOwnEntry) {
      // Doctor viewing their own entry — show full name
      const doctor = getName(doctorId) || '—';
      return { text: `${doctor} · ${spec}${extra ? ` — ${extra}` : ''}`, isPrivate: false };
    }

    // Doctor viewing another doctor's entry — hide identity
    return {
      text: `${spec}${extra ? ` — ${extra}` : ''}`,
      isPrivate: true,
    };
  };

  // Build timeline events
  const events: TimelineEvent[] = [];

  // Appointments
  appointments
    .filter(a => a.patientId === patientId)
    .forEach(a => {
      const isOwn = a.doctorId === user?.id;
      const { text, isPrivate } = buildSubtitle(a.doctorId, a.specialtyId, a.notes, isOwn);
      events.push({
        id: `apt-${a.id}`,
        date: a.date,
        time: a.time,
        type: 'appointment',
        title: language === 'ar' ? 'موعد' : 'Appointment',
        subtitle: text,
        status: a.status,
        isPrivate,
        ...iconByType.appointment,
      });
    });

  // Visits
  visits
    .filter(v => v.patientId === patientId)
    .forEach(v => {
      const isOwn = v.doctorId === user?.id;
      const { text, isPrivate } = buildSubtitle(v.doctorId, v.specialtyId, v.notes, isOwn);
      events.push({
        id: `visit-${v.id}`,
        date: v.date,
        time: v.time,
        type: 'visit',
        title: language === 'ar' ? 'زيارة سريرية' : 'Clinical Visit',
        subtitle: text,
        status: v.status,
        isPrivate,
        ...iconByType.visit,
      });
    });

  // Payments (as invoice events)
  payments
    .filter(p => p.isActive)
    .forEach(p => {
      const inv = invoices.find(i => i.id === p.invoiceId && i.patientId === patientId);
      if (!inv) return;
      events.push({
        id: `pay-${p.id}`,
        date: p.date,
        time: undefined,
        type: 'invoice_paid',
        title: language === 'ar' ? 'دفعة مالية' : 'Payment Received',
        subtitle: `${p.amount} ج.م · ${p.method}`,
        status: inv.status,
        ...iconByType.invoice_paid,
      });
    });

  // Medical Notes
  notes
    .filter(n => n.patientId === patientId)
    .forEach(n => {
      const cat = categoryLabels[n.category] || categoryLabels.general;
      const isOwn = n.doctorId === user?.id;
      const catLabel = language === 'ar' ? cat.ar : cat.en;

      let subtitleText: string;
      let isPrivate = false;

      if (canSeeDoctorIdentity) {
        subtitleText = `${catLabel} · ${getName(n.doctorId) || '—'}`;
      } else if (isOwn) {
        subtitleText = `${catLabel} · ${getName(n.doctorId) || '—'}`;
      } else {
        // Hide doctor identity - show only category
        subtitleText = catLabel;
        isPrivate = true;
      }

      events.push({
        id: `note-${n.id}`,
        date: n.createdAt.split('T')[0],
        time: n.createdAt.split('T')[1]?.slice(0, 5),
        type: 'medical_note',
        title: n.title,
        subtitle: subtitleText,
        isPrivate,
        ...iconByType.medical_note,
      });
    });

  // Vital Signs — no doctor identity needed
  vitals
    .filter(v => v.patientId === patientId)
    .forEach(v => {
      events.push({
        id: `vs-${v.id}`,
        date: v.recordedAt.split('T')[0],
        time: v.recordedAt.split('T')[1]?.slice(0, 5),
        type: 'vital_sign',
        title: language === 'ar' ? 'قياس علامات حيوية' : 'Vital Signs Recorded',
        subtitle: `BP ${v.systolic}/${v.diastolic} · HR ${v.heartRate} · ${v.temperature}°C · ${v.weight}kg`,
        ...iconByType.vital_sign,
      });
    });

  // Prescriptions — doctors already scoped to their own via usePrescriptions hook
  prescriptions
    .filter(rx => rx.patientId === patientId)
    .forEach(rx => {
      const medNames = rx.medications.map(m => language === 'ar' && m.nameAr ? m.nameAr : m.name).join(', ');
      const isOwn = rx.doctorId === user?.id;

      let subtitleText: string;
      let isPrivate = false;

      if (canSeeDoctorIdentity) {
        subtitleText = `${medNames} · ${getName(rx.doctorId) || '—'}`;
      } else {
        // Doctors only see their own prescriptions (enforced by hook), so always own
        subtitleText = medNames;
        isPrivate = false;
      }

      events.push({
        id: `rx-${rx.id}`,
        date: rx.prescribedAt,
        time: rx.createdAt.split('T')[1]?.slice(0, 5),
        type: 'prescription',
        title: language === 'ar' ? 'وصفة طبية' : 'Prescription',
        subtitle: subtitleText,
        status: rx.status,
        isPrivate,
        ...iconByType.prescription,
      });
    });

  // Medical Documents
  const patientDocs = getPatientDocuments(patientId);
  patientDocs.forEach(doc => {
    const typeLabel = docTypeLabels[doc.documentType] || docTypeLabels.medical_report;
    const isOwn = doc.doctorId === user?.id;
    const spec = getSpecialty(doc.specialtyId) || '—';
    const typeLabelStr = language === 'ar' ? typeLabel.ar : typeLabel.en;

    let subtitleText: string;
    let isPrivate = false;

    if (canSeeDoctorIdentity) {
      subtitleText = `${typeLabelStr} · ${spec} · ${getName(doc.doctorId) || '—'}`;
    } else if (isOwn) {
      subtitleText = `${typeLabelStr} · ${spec} · ${getName(doc.doctorId) || '—'}`;
    } else {
      // Hide doctor identity — show only type and specialty
      subtitleText = `${typeLabelStr} · ${spec}`;
      isPrivate = true;
    }

    events.push({
      id: `doc-${doc.id}`,
      date: doc.uploadDate,
      time: doc.createdAt.split('T')[1]?.slice(0, 5),
      type: 'document',
      title: language === 'ar' ? doc.titleAr : doc.title,
      subtitle: subtitleText,
      isPrivate,
      ...iconByType.document,
    });
  });

  // Sort descending
  events.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return (b.time || '').localeCompare(a.time || '');
  });

  // Group by date
  const grouped: Record<string, TimelineEvent[]> = {};
  events.forEach(e => {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  });

  const dateKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          {language === 'ar' ? 'لا توجد أحداث سريرية مسجلة' : 'No clinical events recorded'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!canSeeDoctorIdentity && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
          <EyeOff className="h-3.5 w-3.5 shrink-0" />
          {language === 'ar'
            ? 'وضع الخصوصية: أسماء الأطباء الآخرين مخفية لحماية الخصوصية المهنية'
            : 'Privacy mode: Other doctors\' identities are hidden to protect professional privacy'}
        </div>
      )}

      {dateKeys.map(date => (
        <div key={date}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              {formatDate(date, language, 'long')}
            </span>
            <Badge variant="outline" className="text-xs">
              {grouped[date].length} {language === 'ar' ? 'حدث' : grouped[date].length === 1 ? 'event' : 'events'}
            </Badge>
          </div>

          <div className="relative ml-4 border-l-2 border-border pl-6 space-y-4">
            {grouped[date].map(event => (
              <div key={event.id} className="relative">
                {/* Timeline dot */}
                <div className={`absolute -left-[31px] top-1 h-6 w-6 rounded-full flex items-center justify-center ${event.color}`}>
                  {event.icon}
                </div>

                <Card className="border-border/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-foreground">{event.title}</span>
                          {event.status && (
                            <Badge className={statusColors[event.status] || ''} variant="secondary">
                              {event.status}
                            </Badge>
                          )}
                          {event.isPrivate && (
                            <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                              <EyeOff className="h-2.5 w-2.5" />
                              {language === 'ar' ? 'مخفي' : 'Private'}
                            </Badge>
                          )}
                        </div>
                        {event.subtitle && (
                          <p className="text-xs text-muted-foreground truncate">{event.subtitle}</p>
                        )}
                      </div>
                      {event.time && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                          <Clock className="h-3 w-3" />
                          {formatTime(event.time, language)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default VisitTimelineTab;
