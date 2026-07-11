import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useAppointments, useVisits, useInvoices } from '@/hooks/useVisits';
import { usePatients } from '@/hooks/usePatients';
import { useUsers } from '@/hooks/useUsers';
import { useSpecialties } from '@/hooks/useSpecialties';
import { usePermissions } from '@/hooks/usePermissions';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { formatDate, formatTime } from '@/lib/dateFormat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Calendar, Clock, Plus, User, Stethoscope, CheckCircle2, XCircle, CalendarDays,
  LogIn, AlertTriangle, ArrowRight, Search, DollarSign, Send, ClipboardCheck,
  Hourglass, UserCheck, Siren, RotateCcw, Bell, BellRing, MessageCircle, Phone, CheckCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import BookingWizard from '@/components/BookingWizard';
import { DragDropCalendar } from '@/components/DragDropCalendar';
import { useNavigate } from 'react-router-dom';
import { simulateSendReminder } from '@/stores/reminderStore';
import { consultationRequestStore, ConsultationRequest } from '@/stores/consultationRequestStore';
import { getToken } from '@/utils/authToken';

const Appointments: React.FC = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const { appointments, cancelAppointment, checkInAppointment, markNoShow, markUrgent } = useAppointments();
  const { visits, sendToDoctor, completeVisit } = useVisits();
  const { invoices, refundInvoice } = useInvoices();
  const { patients } = usePatients();
  const { doctors } = useUsers();
  const { specialties } = useSpecialties();
  const { settings: clinicSettings } = useClinicSettings();
  const [showBooking, setShowBooking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [consultationRequests, setConsultationRequests] = useState<ConsultationRequest[]>(() => consultationRequestStore.getAll());

  React.useEffect(() => {
    const unsub = consultationRequestStore.subscribe(() => setConsultationRequests(consultationRequestStore.getAll()));
    return unsub;
  }, []);

  // Filter consultation requests: doctors see only their specialty
  const filteredConsultations = useMemo(() => {
    const clinicReqs = consultationRequests.filter(r => r.clinicId === user?.clinicId && r.status === 'pending');
    if (user?.role === 'doctor') {
      const docSpec = doctors.find(d => d.id === user.id);
      if (docSpec?.specialtyId) {
        const sp = specialties.find(s => s.id === docSpec.specialtyId);
        return clinicReqs.filter(r => !r.specialtyId || r.specialtyId === docSpec.specialtyId);
      }
    }
    return clinicReqs;
  }, [consultationRequests, user, doctors, specialties]);

  const roleFiltered = useMemo(() => {
    if (user?.role === 'doctor') return appointments.filter(a => a.doctorId === user.id);
    return appointments;
  }, [appointments, user]);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const today = new Date().toISOString().split('T')[0];

  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return roleFiltered;
    const q = searchQuery.toLowerCase().trim();
    return roleFiltered.filter(a => {
      const patient = patients.find(p => p.id === a.patientId);
      const doctor = doctors.find(d => d.id === a.doctorId);
      const specialty = specialties.find(s => s.id === a.specialtyId);
      return (
        patient?.name.toLowerCase().includes(q) ||
        patient?.nameAr.includes(searchQuery.trim()) ||
        doctor?.name.toLowerCase().includes(q) ||
        doctor?.nameAr.includes(searchQuery.trim()) ||
        specialty?.name.toLowerCase().includes(q) ||
        specialty?.nameAr.includes(searchQuery.trim()) ||
        a.date.includes(q)
      );
    });
  }, [roleFiltered, searchQuery, patients, doctors, specialties]);

  const todayAppointments = searchFiltered.filter(a => a.date === today);
  const allFiltered = searchFiltered.filter(a => filterStatus === 'all' || a.status === filterStatus);

  const getName = (id: string, list: { id: string; name: string; nameAr: string }[]) => {
    const item = list.find(i => i.id === id);
    return language === 'ar' ? item?.nameAr : item?.name;
  };

  const getVisitForAppointment = (aptId: string) => visits.find(v => v.appointmentId === aptId);
  const getInvoiceForVisit = (visitId: string) => {
    const visit = visits.find(v => v.id === visitId);
    return visit ? invoices.find(i => i.id === visit.invoiceId) : undefined;
  };

  const getWorkflowStatus = (apt: typeof roleFiltered[0]) => {
    if (apt.status === 'cancelled') return 'cancelled';
    if (apt.status === 'no_show') return 'no_show';
    if (apt.status === 'converted' || apt.status === 'completed') {
      const visit = getVisitForAppointment(apt.id);
      if (visit) return visit.status;
      return apt.status === 'completed' ? 'completed' : 'checked_in';
    }
    return apt.status;
  };

  const getStatusBadge = (apt: typeof roleFiltered[0]) => {
    const wfStatus = getWorkflowStatus(apt);
    switch (wfStatus) {
      case 'scheduled': case 'confirmed':
        return <Badge variant="secondary" className="gap-1" data-testid={`badge-status-${apt.id}`}><Clock className="h-3 w-3" />{language === 'ar' ? 'مجدول' : 'Scheduled'}</Badge>;
      case 'booked': case 'checked_in':
        return <Badge className="gap-1 bg-blue-500 hover:bg-blue-500/80" data-testid={`badge-status-${apt.id}`}><LogIn className="h-3 w-3" />{language === 'ar' ? 'وصل' : 'Arrived'}</Badge>;
      case 'waiting':
        return <Badge className="gap-1 bg-amber-500 hover:bg-amber-500/80" data-testid={`badge-status-${apt.id}`}><Hourglass className="h-3 w-3" />{language === 'ar' ? 'في الانتظار' : 'Waiting'}</Badge>;
      case 'in_consultation':
        return <Badge className="gap-1 bg-purple-600 hover:bg-purple-600/80" data-testid={`badge-status-${apt.id}`}><Stethoscope className="h-3 w-3" />{language === 'ar' ? 'في الاستشارة' : 'In Consultation'}</Badge>;
      case 'completed':
        return <Badge className="gap-1 bg-chart-5 hover:bg-chart-5/80" data-testid={`badge-status-${apt.id}`}><CheckCircle2 className="h-3 w-3" />{language === 'ar' ? 'مكتمل' : 'Completed'}</Badge>;
      case 'cancelled':
        return <Badge variant="destructive" className="gap-1" data-testid={`badge-status-${apt.id}`}><XCircle className="h-3 w-3" />{language === 'ar' ? 'ملغي' : 'Cancelled'}</Badge>;
      case 'no_show':
        return <Badge variant="outline" className="gap-1" data-testid={`badge-status-${apt.id}`}><AlertTriangle className="h-3 w-3" />{language === 'ar' ? 'لم يحضر' : 'No Show'}</Badge>;
      default: return null;
    }
  };

  const handleCheckIn = async (id: string) => {
    const result = await checkInAppointment(id);
    if (result) {
      toast.success(language === 'ar' ? 'تم إنشاء الفاتورة — يرجى الدفع' : 'Invoice created — please proceed to payment');
      navigate('/billing');
    }
  };

  const handleNoShow = async (id: string) => {
    await markNoShow(id);
    toast.success(language === 'ar' ? 'تم التسجيل كعدم حضور' : 'Marked as No Show');
  };

  const handleMarkUrgent = (aptId: string) => {
    markUrgent(aptId);
    toast.success(language === 'ar' ? 'تم تحديد الموعد كمستعجل' : 'Marked as Urgent');
  };

  const handleRefund = async (invoiceId: string) => {
    await refundInvoice(invoiceId);
    toast.success(language === 'ar' ? 'تم استرداد المبلغ' : 'Invoice refunded');
  };

  const handleSendToDoctor = async (visitId: string) => {
    if (await sendToDoctor(visitId)) {
      toast.success(language === 'ar' ? 'تم إرسال المريض للطبيب' : 'Patient sent to doctor');
    }
  };

  const handleSendReminder = (apt: typeof roleFiltered[0]) => {
    const patient = patients.find(p => p.id === apt.patientId);
    const doctor = doctors.find(d => d.id === apt.doctorId);
    if (!patient || !doctor) return;
    const patientName = language === 'ar' ? patient.nameAr : patient.name;
    const doctorName = language === 'ar' ? doctor.nameAr : doctor.name;
    simulateSendReminder({
      appointmentId: apt.id,
      patientName,
      doctorName,
      date: apt.date,
      time: apt.time,
      type: 'confirmation',
      channel: 'whatsapp',
      clinicName: language === 'ar' ? clinicSettings.nameAr : clinicSettings.name,
      clinicAddress: language === 'ar' ? clinicSettings.addressAr : clinicSettings.address,
      language: language === 'ar' ? 'ar' : 'en',
    });
    // Reminder sent flag — stored only in local session
    toast.success(language === 'ar' ? 'تم إرسال التذكير للمريض' : 'Reminder sent to patient');
  };

  const handleCompleteVisit = async (visitId: string) => {
    if (await completeVisit(visitId)) {
      toast.success(language === 'ar' ? 'تم إكمال الزيارة' : 'Visit completed');
    }
  };

  const groupByDate = (apps: typeof allFiltered) => {
    const groups: Record<string, typeof allFiltered> = {};
    apps.forEach(a => {
      if (!groups[a.date]) groups[a.date] = [];
      groups[a.date].push(a);
    });
    return groups;
  };

  const AppointmentRow = ({ apt }: { apt: typeof roleFiltered[0] }) => {
    const wfStatus = getWorkflowStatus(apt);
    const visit = getVisitForAppointment(apt.id);
    const invoice = visit ? getInvoiceForVisit(visit.id) : undefined;
    const invoicePaid = invoice?.status === 'paid';
    const invoiceRefunded = invoice?.status === 'refunded';
    const isReception = user?.role === 'admin' || user?.role === 'reception';
    const isDoctor = user?.role === 'doctor';
    const isUrgent = apt.isUrgent || (visit?.isUrgent);

    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors" data-testid={`appointment-row-${apt.id}`}>
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-semibold text-foreground">{formatTime(apt.time, language)}</span>
              {getStatusBadge(apt)}
              {isUrgent && (
                <Badge variant="destructive" className="gap-1 text-xs" data-testid={`badge-urgent-${apt.id}`}>
                  <Siren className="h-3 w-3" />
                  {language === 'ar' ? 'مستعجل' : 'URGENT'}
                </Badge>
              )}
              {invoice && (
                <Badge variant={invoicePaid ? 'default' : invoiceRefunded ? 'secondary' : 'outline'} className={`gap-1 text-xs ${invoicePaid ? 'bg-green-600 hover:bg-green-600/80' : invoiceRefunded ? 'bg-amber-500 hover:bg-amber-500/80' : ''}`}>
                  <DollarSign className="h-3 w-3" />
                  {invoicePaid
                    ? (language === 'ar' ? 'مدفوع' : 'Paid')
                    : invoiceRefunded
                    ? (language === 'ar' ? 'مسترد' : 'Refunded')
                    : (language === 'ar' ? 'غير مدفوع' : 'Unpaid')}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><User className="h-3 w-3" />{getName(apt.patientId, patients)}</span>
              <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{getName(apt.doctorId, doctors)}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{getName(apt.specialtyId, specialties)}</p>
          </div>
        </div>

        <div className="flex gap-2 shrink-0 flex-wrap">
          {/* Step 1: Scheduled — Reminder + Pay + Mark Urgent */}
          {(wfStatus === 'scheduled' || wfStatus === 'confirmed') && isReception && (
            <>
              <Button
                size="sm"
                variant={apt.reminderSent24h ? 'secondary' : 'outline'}
                onClick={() => handleSendReminder(apt)}
                className="gap-1"
                data-testid={`button-reminder-${apt.id}`}
                title={language === 'ar' ? 'إرسال تذكير للمريض' : 'Send appointment reminder'}
              >
                {apt.reminderSent24h
                  ? <BellRing className="h-4 w-4" />
                  : <Bell className="h-4 w-4" />
                }
                {apt.reminderSent24h
                  ? (language === 'ar' ? 'أُرسل' : 'Sent')
                  : (language === 'ar' ? 'تذكير' : 'Remind')
                }
              </Button>
              <Button size="sm" onClick={() => handleCheckIn(apt.id)} className="gap-1" data-testid={`button-pay-${apt.id}`}>
                <DollarSign className="h-4 w-4" />
                {language === 'ar' ? 'دفع' : 'Pay'}
              </Button>
              {!isUrgent && (
                <Button size="sm" variant="destructive" onClick={() => handleMarkUrgent(apt.id)} className="gap-1" data-testid={`button-urgent-${apt.id}`}>
                  <Siren className="h-4 w-4" />
                  {language === 'ar' ? 'مستعجل' : 'Urgent'}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => handleNoShow(apt.id)} className="gap-1" data-testid={`button-noshow-${apt.id}`}>
                <AlertTriangle className="h-4 w-4" />
                {language === 'ar' ? 'لم يحضر' : 'No Show'}
              </Button>
              <Button size="sm" variant="ghost" data-testid={`button-cancel-${apt.id}`}
                onClick={async () => {
                  const result = await cancelAppointment(apt.id);
                  if (!result.ok) {
                    toast.error(
                      language === 'ar'
                        ? 'يتعذر إلغاء الموعد — الفاتورة مسددة كلياً أو جزئياً.'
                        : 'Cannot cancel — invoice is already paid (fully or partially).',
                    );
                  }
                }}>
                <XCircle className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Step 2: Arrived (checked_in/booked) — Pay invoice if unpaid */}
          {(wfStatus === 'checked_in' || wfStatus === 'booked') && visit && isReception && (
            <>
              {!invoicePaid && (
                <Button size="sm" variant="outline" onClick={() => navigate('/billing')} className="gap-1" data-testid={`button-pay-invoice-${apt.id}`}>
                  <DollarSign className="h-4 w-4" />
                  {language === 'ar' ? 'دفع الفاتورة' : 'Pay Invoice'}
                </Button>
              )}
              {!isUrgent && (
                <Button size="sm" variant="destructive" onClick={() => handleMarkUrgent(apt.id)} className="gap-1" data-testid={`button-urgent-${apt.id}`}>
                  <Siren className="h-4 w-4" />
                  {language === 'ar' ? 'مستعجل' : 'Urgent'}
                </Button>
              )}
            </>
          )}

          {/* Step 3: Waiting — Send to Doctor + Mark Urgent + Refund */}
          {wfStatus === 'waiting' && visit && isReception && (
            <>
              <Button size="sm" onClick={() => handleSendToDoctor(visit.id)} className="gap-1 bg-purple-600 hover:bg-purple-700" data-testid={`button-send-doctor-${apt.id}`}>
                <Send className="h-4 w-4" />
                {language === 'ar' ? 'إرسال للطبيب' : 'Send to Doctor'}
              </Button>
              {!isUrgent && (
                <Button size="sm" variant="destructive" onClick={() => handleMarkUrgent(apt.id)} className="gap-1" data-testid={`button-urgent-${apt.id}`}>
                  <Siren className="h-4 w-4" />
                  {language === 'ar' ? 'مستعجل' : 'Urgent'}
                </Button>
              )}
              {invoice && invoicePaid && (
                <Button size="sm" variant="outline" onClick={() => handleRefund(invoice.id)} className="gap-1" data-testid={`button-refund-${apt.id}`}>
                  <RotateCcw className="h-4 w-4" />
                  {language === 'ar' ? 'استرداد' : 'Refund'}
                </Button>
              )}
            </>
          )}

          {/* Step 4: In Consultation → Complete Visit (doctor) */}
          {wfStatus === 'in_consultation' && visit && (
            <>
              {isDoctor && (
                <Button size="sm" onClick={() => handleCompleteVisit(visit.id)} className="gap-1 bg-chart-5 hover:bg-chart-5/80" data-testid={`button-complete-${apt.id}`}>
                  <ClipboardCheck className="h-4 w-4" />
                  {language === 'ar' ? 'إكمال الزيارة' : 'Complete Visit'}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate(`/patients/${apt.patientId}`)} className="gap-1" data-testid={`button-view-patient-${apt.id}`}>
                <User className="h-4 w-4" />
                {language === 'ar' ? 'ملف المريض' : 'Patient File'}
              </Button>
            </>
          )}

          {/* Completed — view patient + refund option */}
          {wfStatus === 'completed' && (
            <>
              <Button size="sm" variant="ghost" onClick={() => navigate(`/patients/${apt.patientId}`)} className="gap-1" data-testid={`button-view-completed-${apt.id}`}>
                <ArrowRight className="h-4 w-4" />
                {language === 'ar' ? 'عرض' : 'View'}
              </Button>
              {isReception && invoice && invoicePaid && (
                <Button size="sm" variant="outline" onClick={() => handleRefund(invoice.id)} className="gap-1" data-testid={`button-refund-${apt.id}`}>
                  <RotateCcw className="h-4 w-4" />
                  {language === 'ar' ? 'استرداد' : 'Refund'}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const grouped = groupByDate(allFiltered);
  const sortedDates = Object.keys(grouped).sort().reverse();

  const todayScheduled = todayAppointments.filter(a => getWorkflowStatus(a) === 'scheduled' || getWorkflowStatus(a) === 'confirmed').length;
  const todayArrived = todayAppointments.filter(a => { const s = getWorkflowStatus(a); return s === 'checked_in' || s === 'booked'; }).length;
  const todayWaiting = todayAppointments.filter(a => getWorkflowStatus(a) === 'waiting').length;
  const todayInConsult = todayAppointments.filter(a => getWorkflowStatus(a) === 'in_consultation').length;
  const todayCompleted = todayAppointments.filter(a => getWorkflowStatus(a) === 'completed').length;
  const todayNoShow = todayAppointments.filter(a => a.status === 'no_show').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('appointments.title')}</h1>
          <p className="text-muted-foreground">{roleFiltered.length} {language === 'ar' ? 'موعد' : 'appointments'}</p>
        </div>
        {permissions.canAddAppointment && (
          <Button onClick={() => setShowBooking(true)} className="gap-2" data-testid="button-book-appointment">
            <Plus className="h-4 w-4" />{t('appointments.book')}
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={language === 'ar' ? 'بحث بالاسم أو التخصص أو التاريخ...' : 'Search by name, specialty, or date...'}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-10 rtl:pl-3 rtl:pr-10"
          data-testid="input-search-appointments"
        />
      </div>

      <Tabs defaultValue="today">
        <TabsList>
          <TabsTrigger value="today" data-testid="tab-today">{language === 'ar' ? 'اليوم' : 'Today'} ({todayAppointments.length})</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">{t('common.all')}</TabsTrigger>
          <TabsTrigger value="calendar" data-testid="tab-calendar">{language === 'ar' ? 'التقويم' : 'Calendar'}</TabsTrigger>
          <TabsTrigger value="consult-requests" data-testid="tab-consult-requests" className="gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" />
            {language === 'ar' ? 'طلبات الاستشارة' : 'Consultation Requests'}
            {filteredConsultations.length > 0 && (
              <Badge variant="destructive" className="h-4 px-1 text-xs">{filteredConsultations.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4 mt-4">
          <Card data-testid="pipeline-visualization">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {[
                  { label: language === 'ar' ? 'محجوز' : 'Booked', count: todayScheduled, bg: 'bg-muted', text: 'text-muted-foreground', border: 'border-border', testId: 'stat-scheduled', icon: <Clock className="h-4 w-4" /> },
                  { label: language === 'ar' ? 'مدفوع/وصل' : 'Paid/Arrived', count: todayArrived, bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-300 dark:border-blue-700', testId: 'stat-arrived', icon: <LogIn className="h-4 w-4" /> },
                  { label: language === 'ar' ? 'في الانتظار' : 'Waiting', count: todayWaiting, bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-700', testId: 'stat-waiting', icon: <Hourglass className="h-4 w-4" /> },
                  { label: language === 'ar' ? 'في الاستشارة' : 'In Consultation', count: todayInConsult, bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-600 dark:text-green-400', border: 'border-green-300 dark:border-green-700', testId: 'stat-in-consultation', icon: <Stethoscope className="h-4 w-4" /> },
                  { label: language === 'ar' ? 'مكتمل' : 'Completed', count: todayCompleted, bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-400 dark:border-emerald-700', testId: 'stat-completed', icon: <CheckCircle2 className="h-4 w-4" /> },
                ].map((step, idx, arr) => (
                  <React.Fragment key={step.testId}>
                    <div className={`flex items-center gap-3 rounded-md border ${step.border} ${step.bg} px-4 py-3 min-w-[130px] shrink-0`}>
                      <div className={`${step.text}`}>{step.icon}</div>
                      <div>
                        <p className={`text-xl font-bold ${step.text}`} data-testid={step.testId}>{step.count}</p>
                        <p className={`text-xs ${step.text} opacity-80 whitespace-nowrap`}>{step.label}</p>
                      </div>
                    </div>
                    {idx < arr.length - 1 && (
                      <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                  </React.Fragment>
                ))}

                <div className="mx-2 h-10 w-px bg-border shrink-0" />

                <div className="flex items-center gap-3 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950 px-4 py-3 min-w-[120px] shrink-0">
                  <div className="text-red-600 dark:text-red-400"><AlertTriangle className="h-4 w-4" /></div>
                  <div>
                    <p className="text-xl font-bold text-red-600 dark:text-red-400" data-testid="stat-noshow">{todayNoShow}</p>
                    <p className="text-xs text-red-600 dark:text-red-400 opacity-80 whitespace-nowrap">{language === 'ar' ? 'لم يحضر' : 'No Show'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {todayAppointments.length === 0 ? (
            <Card><CardContent className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <CalendarDays className="h-10 w-10 opacity-40" />
              <p className="text-sm font-medium">{language === 'ar' ? 'لا توجد مواعيد اليوم' : 'No appointments today'}</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {todayAppointments
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(apt => <AppointmentRow key={apt.id} apt={apt} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-2">
                {['all', 'scheduled', 'converted', 'completed', 'no_show', 'cancelled'].map(status => (
                  <Button key={status} variant={filterStatus === status ? 'default' : 'outline'} size="sm" onClick={() => setFilterStatus(status)} data-testid={`filter-${status}`}>
                    {status === 'all' ? t('common.all') :
                     status === 'scheduled' ? (language === 'ar' ? 'مجدول' : 'Scheduled') :
                     status === 'converted' ? (language === 'ar' ? 'وصل' : 'Arrived') :
                     status === 'completed' ? (language === 'ar' ? 'مكتمل' : 'Completed') :
                     status === 'no_show' ? (language === 'ar' ? 'لم يحضر' : 'No Show') :
                     (language === 'ar' ? 'ملغي' : 'Cancelled')}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {sortedDates.map(date => (
              <Card key={date}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    {formatDate(date, language, 'long')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {grouped[date].map(apt => <AppointmentRow key={apt.id} apt={apt} />)}
                  </div>
                </CardContent>
              </Card>
            ))}
            {sortedDates.length === 0 && (
              <Card><CardContent className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <CalendarDays className="h-10 w-10 opacity-40" />
                <p className="text-sm font-medium">{language === 'ar' ? 'لا توجد مواعيد' : 'No appointments found'}</p>
              </CardContent></Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <DragDropCalendar
            appointments={roleFiltered}
            getPatientName={id => {
              const p = patients.find(pt => pt.id === id);
              return (language === 'ar' ? p?.nameAr : p?.name) || '';
            }}
            getDoctorName={id => {
              const d = doctors.find(doc => doc.id === id);
              return (language === 'ar' ? d?.nameAr : d?.name) || '';
            }}
            onMove={async (apptId, newDate, newTime) => {
              const token = getToken();
              if (token) {
                try {
                  await fetch(`/api/appointments/${apptId}/reschedule`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ date: newDate, time: newTime }),
                  });
                } catch { /* ignore — UI already updated optimistically */ }
              }
              toast.success(language === 'ar' ? 'تم تحديث الموعد' : 'Appointment rescheduled');
            }}
          />
        </TabsContent>

        {/* ── Consultation Requests ── */}
        <TabsContent value="consult-requests" className="space-y-4 mt-4">
          {filteredConsultations.length === 0 ? (
            <Card>
              <CardContent className="py-14 text-center text-muted-foreground">
                <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium text-sm">{language === 'ar' ? 'لا توجد طلبات استشارة جديدة' : 'No consultation requests'}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredConsultations.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(req => (
                <Card key={req.id} className="border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{req.patientName}</p>
                          <a href={`tel:${req.patientPhone}`} className="flex items-center gap-1 text-xs text-primary hover:underline" dir="ltr">
                            <Phone className="h-3 w-3" />{req.patientPhone}
                          </a>
                          {req.specialtyId && (() => {
                            const sp = specialties.find(s => s.id === req.specialtyId);
                            return sp ? <Badge variant="outline" className="text-xs">{language === 'ar' ? sp.nameAr || sp.name : sp.name}</Badge> : null;
                          })()}
                          <Badge variant="secondary" className="text-xs">
                            {req.consultationType === 'general' ? (language === 'ar' ? 'كشف عام' : 'General')
                              : req.consultationType === 'followup' ? (language === 'ar' ? 'متابعة' : 'Follow-up')
                              : req.consultationType === 'surgery' ? (language === 'ar' ? 'جراحي' : 'Surgery')
                              : (language === 'ar' ? 'طارئ' : 'Emergency')}
                          </Badge>
                        </div>
                        {req.symptoms && <p className="text-xs text-muted-foreground">{req.symptoms}</p>}
                        {req.aiMessage && (
                          <p className="text-xs text-primary/80 bg-primary/5 rounded px-2 py-1">🤖 {req.aiMessage}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-GB')}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="text-xs h-7 gap-1"
                          onClick={() => { setShowBooking(true); }}
                          data-testid={`btn-book-consult-${req.id}`}>
                          <Calendar className="h-3 w-3" />{language === 'ar' ? 'حجز موعد' : 'Book'}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                          onClick={() => consultationRequestStore.update(r => r.id === req.id, { status: 'handled' })}
                          data-testid={`btn-done-consult-${req.id}`}>
                          <CheckCheck className="h-3.5 w-3.5" />{language === 'ar' ? 'تمت المعالجة' : 'Done'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showBooking} onOpenChange={setShowBooking}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{t('appointments.book')}</DialogTitle>
          </DialogHeader>
          <BookingWizard onComplete={() => setShowBooking(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Appointments;
