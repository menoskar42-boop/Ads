import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useVisits, useAppointments, useInvoices } from '@/hooks/useVisits';
import { usePatients } from '@/hooks/usePatients';
import { useUsers } from '@/hooks/useUsers';
import { useSpecialties } from '@/hooks/useSpecialties';
import { usePrescriptions } from '@/hooks/usePrescriptions';
import { formatTime } from '@/lib/dateFormat';
import { roomStore, ROOM_STATUS_COLORS } from '@/stores/roomStore';
import { useClinicSettings } from '@/hooks/useClinicSettings';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AIScribeTab from '@/components/AIScribeTab';
import DoctorCoachBubble from '@/components/DoctorCoachBubble';
import AICommandBar from '@/components/AICommandBar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Users, Calendar, DollarSign, Stethoscope, Plus, ArrowRight,
  Clock, CheckCircle2, XCircle, Activity, LogIn, AlertTriangle, Receipt,
  Send, ClipboardCheck, Hourglass, UserCheck, User, PhoneCall, Zap, Home, MapPin,
  Copy, Gift, Printer, ExternalLink, Building2, Check, X, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { getRegistrationByUserId } from '@/stores/registrationStore';
import { addDoctorClinicLink } from '@/stores/doctorClinicStore';
import PrintBookingSheet from '@/components/PrintBookingSheet';

const Dashboard: React.FC = () => {
  const { t, language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { settings: clinicSettings } = useClinicSettings();
  const navigate = useNavigate();
  const permissions = usePermissions();
  const { visits, sendToDoctor, completeVisit, callNextPatient } = useVisits();
  const { appointments, checkInAppointment, markNoShow } = useAppointments();
  const { invoices } = useInvoices();
  const { patients } = usePatients();
  const { activeDoctors } = useUsers();
  const { specialties } = useSpecialties();
  const { prescriptions } = usePrescriptions();

  const userName = language === 'ar' ? user?.nameAr : user?.name;
  const today = new Date().toISOString().split('T')[0];
  const [printOpen, setPrintOpen] = useState(false);
  const [clinicPreviewOpen, setClinicPreviewOpen] = useState(false);
  const [scribeOpen, setScribeOpen] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  // ── Join requests for doctors ──────────────────────────────────────────────
  const JOIN_REQUESTS_KEY = 'cf_join_requests_v1';
  interface JoinRequest { id: string; doctorId: string; clinicId: string; status: 'pending' | 'accepted' | 'rejected'; createdAt: string; }
  const loadJoinRequests = (): JoinRequest[] => {
    try { return JSON.parse(localStorage.getItem(JOIN_REQUESTS_KEY) || '[]'); } catch { return []; }
  };
  const [pendingJoinRequests, setPendingJoinRequests] = useState<JoinRequest[]>(() =>
    user?.role === 'doctor' ? loadJoinRequests().filter(r => r.doctorId === user.id && r.status === 'pending') : []
  );
  const handleAcceptJoinRequest = (req: JoinRequest) => {
    const all = loadJoinRequests().map(r => r.id === req.id ? { ...r, status: 'accepted' as const } : r);
    localStorage.setItem(JOIN_REQUESTS_KEY, JSON.stringify(all));
    addDoctorClinicLink(req.doctorId, req.clinicId);
    setPendingJoinRequests(prev => prev.filter(r => r.id !== req.id));
    toast.success(isAr ? 'تم قبول طلب الانضمام' : 'Join request accepted');
  };
  const handleRejectJoinRequest = (req: JoinRequest) => {
    const all = loadJoinRequests().map(r => r.id === req.id ? { ...r, status: 'rejected' as const } : r);
    localStorage.setItem(JOIN_REQUESTS_KEY, JSON.stringify(all));
    setPendingJoinRequests(prev => prev.filter(r => r.id !== req.id));
    toast.success(isAr ? 'تم رفض طلب الانضمام' : 'Join request rejected');
  };
  const clinic = user?.clinicId ? {
    id: user.clinicId,
    name: clinicSettings?.name ?? clinicSettings?.clinicName ?? '',
    nameAr: clinicSettings?.nameAr ?? clinicSettings?.clinicNameAr ?? '',
    phone: clinicSettings?.phone ?? '',
    address: clinicSettings?.address ?? '',
    addressAr: clinicSettings?.addressAr ?? '',
    workingHours: clinicSettings?.workingHours,
  } : undefined;
  const isAr = language === 'ar';

  const todayAppointments = appointments.filter(a => {
    const dateMatch = a.date === today;
    if (user?.role === 'doctor') return dateMatch && a.doctorId === user.id;
    return dateMatch;
  });

  const todayVisits = visits.filter(v => {
    const dateMatch = v.date === today;
    if (user?.role === 'doctor') return dateMatch && v.doctorId === user.id;
    return dateMatch;
  });

  const getPatientName = (patientId: string) => {
    const pt = patients.find(p => p.id === patientId);
    return language === 'ar' ? pt?.nameAr : pt?.name;
  };

  const getSpecialtyName = (specialtyId: string) => {
    const sp = specialties.find(s => s.id === specialtyId);
    return language === 'ar' ? sp?.nameAr : sp?.name;
  };

  const getDoctorName = (doctorId: string) => {
    const doc = activeDoctors.find(d => d.id === doctorId);
    return language === 'ar' ? doc?.nameAr : doc?.name;
  };

  const formatArrivalTime = (arrivalTime?: string) => {
    if (!arrivalTime) return language === 'ar' ? 'غير محدد' : 'N/A';
    try {
      const date = new Date(arrivalTime);
      const hours = date.getHours();
      const minutes = date.getMinutes();
      if (language === 'ar') {
        const period = hours >= 12 ? 'م' : 'ص';
        const hour12 = hours % 12 || 12;
        return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
      }
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
    } catch {
      return arrivalTime;
    }
  };

  const handleSendToDoctor = async (visitId: string) => {
    if (await sendToDoctor(visitId)) toast.success(language === 'ar' ? 'تم إرسال المريض للطبيب' : 'Patient sent to doctor');
  };

  const handleCompleteVisit = async (visitId: string) => {
    if (await completeVisit(visitId)) toast.success(language === 'ar' ? 'تم إكمال الزيارة' : 'Visit completed');
  };

  const handleCallNextPatient = async (doctorId: string) => {
    const result = await callNextPatient(doctorId);
    if (result) {
      const patientName = getPatientName(result.patientId);
      toast.success(language === 'ar' ? `تم استدعاء ${patientName}` : `Called ${patientName}`);
    } else {
      toast.info(language === 'ar' ? 'لا يوجد مرضى في الانتظار' : 'No patients waiting');
    }
  };

  const isReception = user?.role === 'admin' || user?.role === 'reception';
  const isDoctor = user?.role === 'doctor';

  const waitingVisits = todayVisits
    .filter(v => v.status === 'waiting')
    .sort((a, b) => {
      const pa = a.priority === 'emergency' ? 3 : (a.isUrgent ? 2 : 1);
      const pb = b.priority === 'emergency' ? 3 : (b.isUrgent ? 2 : 1);
      if (pa !== pb) return pb - pa; // DESC: higher weight served first
      return (a.arrivalTime || a.createdAt).localeCompare(b.arrivalTime || b.createdAt);
    });

  const urgentWaitingVisits = waitingVisits.filter(v => v.isUrgent);
  const inConsultationVisits = todayVisits.filter(v => v.status === 'in_consultation');
  const completedVisitsCount = todayVisits.filter(v => v.status === 'completed').length;
  const todayNoShow = todayAppointments.filter(a => a.status === 'no_show').length;

  const activeInvoices = invoices.filter(i => i.isActive);
  const roleInvoices = isDoctor
    ? activeInvoices.filter(i => { const visit = visits.find(v => v.id === i.visitId); return visit?.doctorId === user?.id; })
    : activeInvoices;
  const todayInvoices = roleInvoices.filter(i => i.createdAt.startsWith(today));
  const revenueToday = todayInvoices.reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);

  if (isReception) {
    const statCards = [
      {
        title: language === 'ar' ? 'مواعيد اليوم' : "Today's Appointments",
        value: todayAppointments.length,
        icon: Calendar,
        color: 'text-chart-2',
        bgColor: 'bg-chart-2/10',
      },
      {
        title: language === 'ar' ? 'في الانتظار' : 'Waiting',
        value: waitingVisits.length,
        icon: Hourglass,
        color: 'text-amber-500',
        bgColor: 'bg-amber-500/10',
      },
      {
        title: language === 'ar' ? 'حالات مستعجلة' : 'Urgent',
        value: urgentWaitingVisits.length,
        icon: Zap,
        color: 'text-destructive',
        bgColor: 'bg-destructive/10',
      },
      {
        title: language === 'ar' ? 'في الاستشارة' : 'In Consultation',
        value: inConsultationVisits.length,
        icon: Stethoscope,
        color: 'text-purple-600',
        bgColor: 'bg-purple-600/10',
      },
      {
        title: language === 'ar' ? 'مكتمل' : 'Completed',
        value: completedVisitsCount,
        icon: CheckCircle2,
        color: 'text-chart-5',
        bgColor: 'bg-chart-5/10',
      },
      {
        title: language === 'ar' ? 'لم يحضر' : 'No Show',
        value: todayNoShow,
        icon: AlertTriangle,
        color: 'text-muted-foreground',
        bgColor: 'bg-muted/50',
      },
    ];

    if (permissions.canViewFinancialReports) {
      statCards.push({
        title: language === 'ar' ? 'إيرادات اليوم' : "Today's Revenue",
        value: `${revenueToday.toLocaleString()} ج.م` as any,
        icon: DollarSign,
        color: 'text-chart-5',
        bgColor: 'bg-chart-5/10',
      });
    }

    if (user?.role === 'admin') {
      statCards.push({
        title: t('dashboard.totalPatients'),
        value: patients.length,
        icon: Users,
        color: 'text-chart-1',
        bgColor: 'bg-chart-1/10',
      });
    }

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-dashboard-title">{t('dashboard.title')}</h1>
            <p className="text-muted-foreground">
              {isAr ? `مرحبا، ${userName}` : `Welcome back, ${userName}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {clinic && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setClinicPreviewOpen(true)} data-testid="btn-preview-clinic">
                <ExternalLink className="h-4 w-4" />
                {isAr ? 'معاينة صفحة العيادة' : 'Preview Clinic Page'}
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setPrintOpen(true)} data-testid="btn-print-booking-sheet">
              <Printer className="h-4 w-4" />
              {isAr ? 'طباعة صفحة الحجز' : 'Print Booking Page'}
            </Button>
          </div>
        </div>

        {clinic && (
          <PrintBookingSheet
            open={printOpen}
            onClose={() => setPrintOpen(false)}
            type="clinic"
            name={clinic.name}
            nameAr={clinic.nameAr}
            url={`${window.location.origin}/clinic/${clinic.id}`}
            phone={clinic.phone}
            address={clinic.address}
            addressAr={clinic.addressAr}
            hours={clinic.workingHours}
            isAr={isAr}
          />
        )}

        {/* ── Clinic Preview Dialog (read-only) ── */}
        {clinic && (
          <Dialog open={clinicPreviewOpen} onOpenChange={setClinicPreviewOpen}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] p-0 overflow-hidden">
              <DialogHeader className="px-6 pt-4 pb-3 border-b flex flex-row items-center justify-between gap-4">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <ExternalLink className="h-4 w-4 text-primary" />
                  {isAr ? 'معاينة صفحة العيادة' : 'Clinic Page Preview'}
                  <Badge variant="secondary" className="text-xs font-normal">{isAr ? 'للعرض فقط' : 'Read-only'}</Badge>
                </DialogTitle>
                <Button size="sm" variant="outline" className="gap-1.5 shrink-0"
                  onClick={() => { setClinicPreviewOpen(false); window.open(`/clinic/${clinic.id}`, '_blank'); }}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  {isAr ? 'فتح للتعديل' : 'Open to Edit'}
                </Button>
              </DialogHeader>
              <div style={{ height: 'calc(90vh - 76px)', overflow: 'hidden' }}>
                <iframe
                  src={`/clinic/${clinic.id}`}
                  className="w-full h-full border-0"
                  style={{ pointerEvents: 'none' }}
                  title={isAr ? 'معاينة صفحة العيادة' : 'Clinic Page Preview'}
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* ── Today Summary Bar ── */}
        <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-2.5 flex items-center gap-4 flex-wrap text-sm">
          <span className="font-semibold text-primary">
            {isAr ? `اليوم: ${new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}` : `Today: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`}
          </span>
          <span className="text-muted-foreground">|</span>
          <span>{isAr ? 'مواعيد اليوم:' : "Today's appointments:"} <b>{todayAppointments.length}</b></span>
          <span>{isAr ? 'مكتملة:' : 'Completed:'} <b className="text-green-600 dark:text-green-400">{completedVisitsCount}</b></span>
          <span>{isAr ? 'ملغاة:' : 'Cancelled:'} <b className="text-destructive">{todayAppointments.filter(a => a.status === 'cancelled').length}</b></span>
          {permissions.canViewFinancialReports && (
            <span>{isAr ? 'إيرادات اليوم:' : "Today's Revenue:"} <b className="text-green-600 dark:text-green-400">{revenueToday.toLocaleString()} ج.م</b></span>
          )}
        </div>

        <div className={`grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-${Math.min(statCards.length, 8)}`}>
          {statCards.map((stat, index) => (
            <Card key={index} data-testid={`stat-card-${index}`}>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <div className={`h-12 w-12 rounded-lg ${stat.bgColor} flex items-center justify-center shrink-0`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold text-foreground leading-tight">{stat.value}</p>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{stat.title}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Peak Hours + Live Feed + Room Status + Predictive Revenue ── */}
        {(() => {
          const peakHoursData = Array.from({ length: 13 }, (_, i) => {
            const h = i + 8;
            return {
              hour: `${h > 12 ? h - 12 : h}${h >= 12 ? (isAr ? 'م' : 'pm') : (isAr ? 'ص' : 'am')}`,
              count: todayAppointments.filter(a => parseInt(a.time?.split(':')[0] || '0') === h).length,
            };
          });

          // Live feed: combine recent appts + payments
          const liveFeedItems = [
            ...appointments.slice(0, 5).map(a => {
              const pt = patients.find(p => p.id === a.patientId);
              return { id: `a-${a.id}`, type: 'appointment' as const, patientName: isAr ? (pt?.nameAr || pt?.name || '-') : (pt?.name || '-'), description: isAr ? 'موعد جديد' : 'New appointment', timestamp: a.createdAt };
            }),
            ...todayInvoices.filter(i => i.paidAmount > 0).slice(0, 5).map(i => {
              const pt = patients.find(p => p.id === i.patientId);
              return { id: `i-${i.id}`, type: 'payment' as const, patientName: isAr ? (pt?.nameAr || pt?.name || '-') : (pt?.name || '-'), description: `${isAr ? 'دفع' : 'Payment'} ${i.paidAmount} ج.م`, timestamp: i.createdAt };
            }),
            ...todayVisits.filter(v => v.status === 'completed').slice(0, 5).map(v => {
              const pt = patients.find(p => p.id === v.patientId);
              return { id: `v-${v.id}`, type: 'visit_complete' as const, patientName: isAr ? (pt?.nameAr || pt?.name || '-') : (pt?.name || '-'), description: isAr ? 'اكتمل الكشف' : 'Visit completed', timestamp: v.updatedAt || v.createdAt };
            }),
          ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8);

          const typeIcon = (t: string) => t === 'payment' ? '💰' : t === 'visit_complete' ? '✅' : '📅';

          // Predictive revenue
          const now = new Date();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const dayOfMonth = now.getDate();
          const thisMonthInvoices = roleInvoices.filter(i => i.createdAt.startsWith(today.slice(0, 7)));
          const totalRevThisMonth = thisMonthInvoices.reduce((s, i) => s + i.paidAmount, 0);
          const avgPerDay = dayOfMonth > 0 ? totalRevThisMonth / dayOfMonth : 0;
          const predicted = Math.round(totalRevThisMonth + avgPerDay * (daysInMonth - dayOfMonth));

          // Room status
          const rooms = roomStore.getAll().filter(r => r.clinicId === user?.clinicId);

          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Peak Hours */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    {isAr ? 'أوقات الذروة اليوم' : "Today's Peak Hours"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {todayAppointments.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">{isAr ? 'لا توجد مواعيد اليوم' : 'No appointments today'}</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={peakHoursData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name={isAr ? 'مواعيد' : 'Appointments'} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Predictive Revenue + Room Status */}
              <div className="space-y-4">
                {permissions.canViewFinancialReports && (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">{isAr ? 'الإيرادات المتوقعة لنهاية الشهر' : 'Predicted Month-End Revenue'}</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">{predicted.toLocaleString()} ج.م</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {isAr ? `محقق: ${totalRevThisMonth.toLocaleString()} ج.م | متبقي: ${daysInMonth - dayOfMonth} يوم` : `Achieved: ${totalRevThisMonth.toLocaleString()} EGP | ${daysInMonth - dayOfMonth} days left`}
                      </p>
                    </CardContent>
                  </Card>
                )}
                {rooms.length > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5" /> {isAr ? 'حالة الغرف' : 'Room Status'}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {(['available', 'occupied', 'cleaning', 'out_of_service'] as const).map(s => {
                          const c = rooms.filter(r => r.status === s).length;
                          if (!c) return null;
                          const sc = ROOM_STATUS_COLORS[s];
                          return (
                            <span key={s} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: sc.bg, color: sc.text }}>
                              {c} {isAr ? sc.labelAr : sc.label}
                            </span>
                          );
                        })}
                      </div>
                      <Button variant="link" size="sm" className="p-0 h-auto text-xs mt-1" onClick={() => navigate('/rooms')}>
                        {isAr ? 'عرض التفاصيل ←' : 'View details →'}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Live Operations Feed ── */}
        {isReception && (() => {
          const liveFeedItems = [
            ...appointments.slice(0, 5).map(a => {
              const pt = patients.find(p => p.id === a.patientId);
              return { id: `a-${a.id}`, emoji: '📅', patientName: isAr ? (pt?.nameAr || pt?.name || '-') : (pt?.name || '-'), description: isAr ? 'موعد' : 'Appointment', timestamp: a.createdAt };
            }),
            ...todayInvoices.filter(i => i.paidAmount > 0).slice(0, 5).map(i => {
              const pt = patients.find(p => p.id === i.patientId);
              return { id: `i-${i.id}`, emoji: '💰', patientName: isAr ? (pt?.nameAr || pt?.name || '-') : (pt?.name || '-'), description: `${i.paidAmount.toLocaleString()} ج.م`, timestamp: i.createdAt };
            }),
            ...todayVisits.filter(v => v.status === 'completed').slice(0, 5).map(v => {
              const pt = patients.find(p => p.id === v.patientId);
              return { id: `v-${v.id}`, emoji: '✅', patientName: isAr ? (pt?.nameAr || pt?.name || '-') : (pt?.name || '-'), description: isAr ? 'اكتمل الكشف' : 'Visit completed', timestamp: v.updatedAt || v.createdAt };
            }),
          ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 8);

          if (liveFeedItems.length === 0) return null;

          const relativeTime = (ts: string) => {
            const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
            if (diff < 1) return isAr ? 'الآن' : 'just now';
            if (diff < 60) return isAr ? `منذ ${diff} دقيقة` : `${diff}m ago`;
            const h = Math.floor(diff / 60);
            return isAr ? `منذ ${h} ساعة` : `${h}h ago`;
          };

          return (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  {isAr ? 'آخر العمليات' : 'Live Operations Feed'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {liveFeedItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <span className="text-base">{item.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm">{item.patientName}</span>
                        <span className="text-muted-foreground text-sm"> — {item.description}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{relativeTime(item.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {permissions.canAddPatient && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('dashboard.quickActions')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => navigate('/patients')} className="gap-2" data-testid="button-add-patient">
                  <Plus className="h-4 w-4" />{t('patients.add')}
                </Button>
                <Button onClick={() => navigate('/appointments')} variant="secondary" className="gap-2" data-testid="button-book-appointment">
                  <Calendar className="h-4 w-4" />{t('appointments.book')}
                </Button>
                {permissions.canViewBilling && (
                  <Button onClick={() => navigate('/billing')} variant="outline" className="gap-2" data-testid="button-billing">
                    <DollarSign className="h-4 w-4" />{t('billing.title')}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {urgentWaitingVisits.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-destructive" />
                {language === 'ar' ? 'حالات مستعجلة' : 'Urgent Patients'}
              </CardTitle>
              <CardDescription>
                {urgentWaitingVisits.length} {language === 'ar' ? 'مرضى مستعجلين في الانتظار' : 'urgent patients waiting'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {urgentWaitingVisits.map(visit => {
                  const invoice = invoices.find(i => i.id === visit.invoiceId);
                  return (
                    <div key={visit.id} className="flex items-center justify-between p-3 rounded-lg border border-destructive/30 bg-destructive/5" data-testid={`urgent-patient-${visit.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                          <Zap className="h-5 w-5 text-destructive" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{getPatientName(visit.patientId)}</p>
                            <Badge variant="destructive" className="gap-1">
                              <Zap className="h-3 w-3" />
                              {language === 'ar' ? 'مستعجل' : 'URGENT'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {getDoctorName(visit.doctorId)} — {language === 'ar' ? 'وصول:' : 'Arrived:'} {formatArrivalTime(visit.arrivalTime)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {invoice?.status === 'paid' ? (
                          <Badge className="gap-1 bg-green-600 dark:bg-green-500">
                            <DollarSign className="h-3 w-3" />{language === 'ar' ? 'مدفوع' : 'Paid'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <DollarSign className="h-3 w-3" />{language === 'ar' ? 'غير مدفوع' : 'Unpaid'}
                          </Badge>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleSendToDoctor(visit.id)} className="gap-1 text-xs" data-testid={`urgent-send-${visit.id}`}>
                          <Send className="h-3 w-3" />
                          {language === 'ar' ? 'للطبيب' : 'To Doctor'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Hourglass className="h-5 w-5 text-amber-500" />
                  {language === 'ar' ? 'قائمة الانتظار' : 'Waiting Queue'}
                </CardTitle>
                <CardDescription>
                  {waitingVisits.length} {language === 'ar' ? 'مرضى ينتظرون' : 'patients waiting'}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 mb-4">
                {activeDoctors.map(doctor => {
                  const doctorWaiting = waitingVisits.filter(v => v.doctorId === doctor.id);
                  if (doctorWaiting.length === 0) return null;
                  return (
                    <div key={doctor.id} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{language === 'ar' ? doctor.nameAr : doctor.name}: {doctorWaiting.length}</span>
                      <Button size="sm" variant="outline" onClick={() => handleCallNextPatient(doctor.id)} className="gap-1 text-xs" data-testid={`call-next-${doctor.id}`}>
                        <PhoneCall className="h-3 w-3" />
                        {language === 'ar' ? 'استدعاء التالي' : 'Call Next'}
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-3">
                {waitingVisits.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">{language === 'ar' ? 'لا يوجد مرضى في الانتظار' : 'No patients waiting'}</p>
                )}
                {waitingVisits.map((visit, index) => {
                  const invoice = invoices.find(i => i.id === visit.invoiceId);
                  return (
                    <div key={visit.id} className={`flex items-center justify-between p-3 rounded-lg border ${visit.isUrgent ? 'border-destructive/30 bg-destructive/5' : 'border-border'}`} data-testid={`waiting-queue-${visit.id}`}>
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold ${visit.isUrgent ? 'bg-destructive/10 text-destructive' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'}`}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-foreground">{getPatientName(visit.patientId)}</p>
                            {visit.isUrgent && (
                              <Badge variant="destructive" className="gap-1">
                                <Zap className="h-3 w-3" />
                                {language === 'ar' ? 'مستعجل' : 'URGENT'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {getDoctorName(visit.doctorId)} — {formatArrivalTime(visit.arrivalTime)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {invoice?.status === 'paid' ? (
                          <Badge className="gap-1 bg-green-600 dark:bg-green-500">
                            <DollarSign className="h-3 w-3" />{language === 'ar' ? 'مدفوع' : 'Paid'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <DollarSign className="h-3 w-3" />{language === 'ar' ? 'غير مدفوع' : 'Unpaid'}
                          </Badge>
                        )}
                        <Button size="sm" variant="outline" onClick={() => handleSendToDoctor(visit.id)} className="gap-1 text-xs" data-testid={`waiting-send-${visit.id}`}>
                          <Send className="h-3 w-3" />
                          {language === 'ar' ? 'للطبيب' : 'To Doctor'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-purple-600" />
                {language === 'ar' ? 'في الاستشارة حالياً' : 'In Consultation'}
              </CardTitle>
              <CardDescription>
                {inConsultationVisits.length} {language === 'ar' ? 'مرضى مع الأطباء' : 'patients with doctors'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {inConsultationVisits.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">{language === 'ar' ? 'لا يوجد مرضى في الاستشارة' : 'No patients in consultation'}</p>
                )}
                {inConsultationVisits.map(visit => (
                  <div key={visit.id} className="flex items-center justify-between p-3 rounded-lg border border-border" data-testid={`in-consultation-${visit.id}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <Stethoscope className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground">{getPatientName(visit.patientId)}</p>
                          {visit.isUrgent && (
                            <Badge variant="destructive" className="gap-1">
                              <Zap className="h-3 w-3" />
                              {language === 'ar' ? 'مستعجل' : 'URGENT'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {language === 'ar' ? 'مع' : 'With'} {getDoctorName(visit.doctorId)} — {getSpecialtyName(visit.specialtyId)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="gap-1 bg-purple-600">
                        <Stethoscope className="h-3 w-3" />
                        {language === 'ar' ? 'في الاستشارة' : 'In Consultation'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin/Reception — Home Visits Schedule */}
        {(() => {
          const adminHVAppointments = appointments.filter(a => a.date === today && a.isHomeVisit);
          if (adminHVAppointments.length === 0) return null;
          return (
            <Card data-testid="card-admin-home-visits">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Home className="h-5 w-5 text-orange-500" />
                  {language === 'ar' ? 'جدول الزيارات المنزلية' : 'Home Visits Schedule'}
                </CardTitle>
                <CardDescription>
                  {adminHVAppointments.length} {language === 'ar' ? 'زيارة منزلية مجدولة اليوم' : 'home visits scheduled today'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {adminHVAppointments
                    .sort((a, b) => a.time.localeCompare(b.time))
                    .map(apt => {
                      const pt = patients.find(p => p.id === apt.patientId);
                      const doc = activeDoctors.find(d => d.id === apt.doctorId);
                      return (
                        <div
                          key={apt.id}
                          className="flex items-center gap-3 p-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10"
                          data-testid={`admin-home-visit-${apt.id}`}
                        >
                          <div className="h-9 w-9 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                            <Home className="h-4 w-4 text-orange-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-foreground truncate">
                                {language === 'ar' ? pt?.nameAr : pt?.name}
                              </p>
                              {pt?.phone && (
                                <span className="text-xs text-muted-foreground">{pt.phone}</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 flex-wrap">
                              <Clock className="h-3 w-3" />{apt.time}
                              {doc && <><Stethoscope className="h-3 w-3 ml-1" />{language === 'ar' ? doc.nameAr : doc.name}</>}
                              {apt.homeCity && <><MapPin className="h-3 w-3 ml-1" />{[apt.homeArea, apt.homeCity].filter(Boolean).join(', ')}</>}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 dark:text-orange-400 shrink-0">
                            {language === 'ar' ? 'منزلية' : 'Home'}
                          </Badge>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {user?.role === 'admin' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">{t('dashboard.doctorsOnDuty')}</CardTitle>
                <CardDescription>{activeDoctors.length} {language === 'ar' ? 'أطباء نشطين' : 'active doctors'}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/doctors')}>
                <ArrowRight className={`h-4 w-4 ${isRTL ? 'rotate-180' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeDoctors.slice(0, 6).map((doctor) => {
                  const doctorVisits = todayVisits.filter(v => v.doctorId === doctor.id);
                  const inConsult = doctorVisits.filter(v => v.status === 'in_consultation').length;
                  const waiting = doctorVisits.filter(v => v.status === 'waiting').length;

                  return (
                    <div key={doctor.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-chart-2/10 flex items-center justify-center">
                          <Stethoscope className="h-5 w-5 text-chart-2" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{language === 'ar' ? doctor.nameAr : doctor.name}</p>
                          <p className="text-sm text-muted-foreground">{getSpecialtyName(doctor.specialtyId || '')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {inConsult > 0 && (
                          <Badge className="bg-purple-600 gap-1">
                            <Stethoscope className="h-3 w-3" />{inConsult}
                          </Badge>
                        )}
                        {waiting > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            <Hourglass className="h-3 w-3" />{waiting}
                          </Badge>
                        )}
                        {inConsult === 0 && waiting === 0 && (
                          <Badge variant="outline">{language === 'ar' ? 'متاح' : 'Available'}</Badge>
                        )}
                        {waiting > 0 && (
                          <Button size="sm" variant="outline" onClick={() => handleCallNextPatient(doctor.id)} className="gap-1 text-xs" data-testid={`doctor-call-next-${doctor.id}`}>
                            <PhoneCall className="h-3 w-3" />
                            {language === 'ar' ? 'التالي' : 'Next'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* نبض العيادة — B3 Daily Pulse Card */}
        {(() => {
          const completed = todayVisits.filter((v: any) => v.status === 'completed').length;
          const waiting   = todayVisits.filter((v: any) => v.status === 'waiting').length;
          const inConsult = todayVisits.filter((v: any) => v.status === 'in_consultation').length;
          const totalToday = todayAppointments.length;
          const efficiency = totalToday > 0 ? Math.round((completed / totalToday) * 100) : 0;
          return (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-primary">
                  <Activity className="h-5 w-5" />
                  {isAr ? 'نبض العيادة' : 'Clinic Pulse'}
                  <Badge variant="outline" className="text-xs font-normal ms-1">
                    {isAr ? 'اليوم' : 'Today'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: isAr ? 'المواعيد' : 'Appointments', value: totalToday, color: 'text-chart-2' },
                    { label: isAr ? 'مكتمل' : 'Completed',    value: completed,  color: 'text-green-600' },
                    { label: isAr ? 'في الانتظار' : 'Waiting', value: waiting,    color: 'text-amber-600' },
                    { label: isAr ? 'في الكشف' : 'In Consult', value: inConsult,  color: 'text-primary' },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
                {totalToday > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{isAr ? 'كفاءة اليوم' : "Today's efficiency"}</span>
                      <span className={efficiency >= 70 ? 'text-green-600 font-medium' : 'text-amber-600 font-medium'}>{efficiency}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${efficiency}%` }} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

      </div>
    );
  }

  if (isDoctor) {
    const currentPatient = todayVisits.find(v => v.status === 'in_consultation');
    const todayScheduled = appointments.filter(a =>
      a.doctorId === user?.id && a.date === today &&
      (a.status === 'scheduled' || a.status === 'confirmed')
    ).sort((a, b) => a.time.localeCompare(b.time));

    const upcomingAppointments = appointments.filter(a =>
      a.doctorId === user?.id && a.date > today &&
      a.status !== 'cancelled' && a.status !== 'no_show' && a.status !== 'converted'
    ).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const doctorWaiting = todayVisits
      .filter(v => v.status === 'waiting')
      .sort((a, b) => {
        const pa = a.priority === 'emergency' ? 3 : (a.isUrgent ? 2 : 1);
        const pb = b.priority === 'emergency' ? 3 : (b.isUrgent ? 2 : 1);
        if (pa !== pb) return pb - pa; // DESC: higher weight served first
        return (a.arrivalTime || a.createdAt).localeCompare(b.arrivalTime || b.createdAt);
      });
    const nextPatient = doctorWaiting[0] || null;

    const handleCallNext = async () => {
      if (!user) return;
      const result = await callNextPatient(user.id);
      if (result) {
        toast.success(language === 'ar' ? 'تم استدعاء المريض التالي' : 'Next patient called');
      } else {
        toast.info(language === 'ar' ? 'لا يوجد مرضى في الانتظار' : 'No patients waiting');
      }
    };

    const doctorPublicUrl = `${window.location.origin}/doctor/${user?.id}`;

    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-dashboard-title">{t('dashboard.title')}</h1>
            <p className="text-muted-foreground">
              {isAr ? `مرحبا، ${userName}` : `Welcome back, ${userName}`}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setPrintOpen(true)} data-testid="btn-print-booking-sheet-doctor">
            <Printer className="h-4 w-4" />
            {isAr ? 'طباعة صفحة الحجز' : 'Print Booking Page'}
          </Button>
        </div>

        <PrintBookingSheet
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          type="doctor"
          name={user?.name || ''}
          nameAr={user?.nameAr || ''}
          url={doctorPublicUrl}
          phone={clinic?.phone}
          address={clinic?.address}
          addressAr={clinic?.addressAr}
          hours={clinic?.workingHours}
          isAr={isAr}
        />

        {/* ── AI Coach Bubble ── */}
        <DoctorCoachBubble user={user} />

        {/* ── AI Command Bar ── */}
        <AICommandBar user={user} />

        {/* ── Next Patient Hero ── */}
        <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                {isAr ? 'المريض التالي في الطابور' : 'Next Patient in Queue'}
              </p>
              {nextPatient ? (
                <div>
                  <p className="text-xl font-bold text-foreground truncate">{getPatientName(nextPatient.patientId)}</p>
                  <p className="text-sm mt-0.5">
                    {nextPatient.priority === 'emergency'
                      ? <span className="text-red-500 font-medium">{isAr ? '🚨 طارئ' : '🚨 Emergency'}</span>
                      : nextPatient.isUrgent
                        ? <span className="text-amber-500 font-medium">{isAr ? '⚡ عاجل' : '⚡ Urgent'}</span>
                        : <span className="text-muted-foreground">{isAr ? `${doctorWaiting.length} مرضى في الانتظار` : `${doctorWaiting.length} patient(s) waiting`}</span>
                    }
                  </p>
                </div>
              ) : (
                <p className="text-lg font-medium text-muted-foreground">{isAr ? 'لا يوجد مرضى في الانتظار' : 'No patients waiting'}</p>
              )}
            </div>
            <Button
              size="lg"
              onClick={handleCallNext}
              disabled={doctorWaiting.length === 0}
              className="gap-2 shrink-0"
              data-testid="button-call-next-patient"
            >
              <UserCheck className="h-5 w-5" />
              {isAr ? 'استدعاء التالي' : 'Call Next Patient'}
            </Button>
          </div>
          {currentPatient && (
            <div className="mt-3 pt-3 border-t border-primary/20 flex items-center gap-2 text-sm text-muted-foreground">
              <Stethoscope className="h-4 w-4 text-purple-500 shrink-0" />
              <span>
                {isAr ? 'حالياً في الاستشارة:' : 'Currently in consultation:'}{' '}
                <span className="font-semibold text-foreground">{getPatientName(currentPatient.patientId)}</span>
              </span>
            </div>
          )}
        </div>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card data-testid="stat-card-appointments">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-chart-2/10 flex items-center justify-center shrink-0">
                  <Calendar className="h-6 w-6 text-chart-2" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-foreground leading-tight">{todayAppointments.length}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{language === 'ar' ? 'مواعيد اليوم' : "Today's Appointments"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-card-waiting">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Hourglass className="h-6 w-6 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-foreground leading-tight">{doctorWaiting.length}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{language === 'ar' ? 'في الانتظار' : 'Waiting'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-card-in-consultation">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-purple-600/10 flex items-center justify-center shrink-0">
                  <Stethoscope className="h-6 w-6 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-foreground leading-tight">{currentPatient ? 1 : 0}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{language === 'ar' ? 'في الاستشارة' : 'In Consultation'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card data-testid="stat-card-completed">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-chart-5/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-chart-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold text-foreground leading-tight">{completedVisitsCount}</p>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{language === 'ar' ? 'مكتمل' : 'Completed'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Pending Join Requests (doctor only) ── */}
        {user?.role === 'doctor' && pendingJoinRequests.length > 0 && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-base">
                <Building2 className="h-5 w-5" />
                {isAr ? `طلبات انضمام للعيادات (${pendingJoinRequests.length})` : `Clinic Join Requests (${pendingJoinRequests.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingJoinRequests.map(req => {
                const reqClinic: { name: string; nameAr: string } | null = null;
                return (
                  <div key={req.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-card border border-amber-500/20">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {reqClinic ? (isAr ? reqClinic.nameAr : reqClinic.name) : req.clinicId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {isAr ? 'طلب انضمام إلى عيادتك' : 'Clinic wants you to join'}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" className="gap-1 text-xs h-7" onClick={() => handleAcceptJoinRequest(req)}>
                        <Check className="h-3 w-3" />{isAr ? 'قبول' : 'Accept'}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7 border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => handleRejectJoinRequest(req)}>
                        <X className="h-3 w-3" />{isAr ? 'رفض' : 'Reject'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {(() => {
          const reg = user?.id ? getRegistrationByUserId(user.id) : null;
          if (!reg) return null;
          const shareLink = `${window.location.origin}/register?ref=${reg.referralCode}`;
          return (
            <Card className="border-primary/20 bg-primary/5" data-testid="card-referral-code">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Gift className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{language === 'ar' ? 'رمز الإحالة الخاص بك' : 'Your Referral Code'}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-lg tracking-widest text-primary" data-testid="text-referral-code">{reg.referralCode}</span>
                        <Badge variant="outline" className="text-xs">{language === 'ar' ? `رقم التسجيل: ${reg.regNumber}` : `Reg #: ${reg.regNumber}`}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 text-xs"
                      onClick={() => { navigator.clipboard.writeText(reg.referralCode); toast.success(language === 'ar' ? 'تم نسخ الرمز' : 'Code copied!'); }}
                      data-testid="btn-copy-referral-code"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {language === 'ar' ? 'نسخ الرمز' : 'Copy Code'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2 text-xs"
                      onClick={() => { navigator.clipboard.writeText(shareLink); toast.success(language === 'ar' ? 'تم نسخ الرابط' : 'Link copied!'); }}
                      data-testid="btn-copy-referral-link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {language === 'ar' ? 'نسخ الرابط' : 'Copy Link'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card data-testid="card-current-patient">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-purple-600" />
                {language === 'ar' ? 'المريض الحالي' : 'Current Patient'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentPatient ? (
                <div className={`p-4 rounded-lg border ${currentPatient.isUrgent ? 'border-destructive/30 bg-destructive/5' : 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <User className="h-6 w-6 text-purple-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground text-lg" data-testid="text-current-patient">{getPatientName(currentPatient.patientId)}</p>
                          {currentPatient.isUrgent && (
                            <Badge variant="destructive" className="gap-1"><Zap className="h-3 w-3" />{language === 'ar' ? 'مستعجل' : 'URGENT'}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{formatTime(currentPatient.time, language)} - {getSpecialtyName(currentPatient.specialtyId)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" className="gap-1 bg-primary" onClick={() => setScribeOpen(true)} data-testid="button-ai-scribe">
                        <Sparkles className="h-4 w-4" />
                        {language === 'ar' ? 'الكاتب الذكي' : 'AI Scribe'}
                      </Button>
                      <Button size="sm" onClick={() => handleCompleteVisit(currentPatient.id)} className="gap-1 bg-chart-5 hover:bg-chart-5/80" data-testid="button-complete-current">
                        <ClipboardCheck className="h-4 w-4" />
                        {language === 'ar' ? 'إكمال الزيارة' : 'Complete Visit'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => navigate(`/patients/${currentPatient.patientId}`)} className="gap-1" data-testid="button-patient-file-current">
                        <User className="h-4 w-4" />
                        {language === 'ar' ? 'الملف' : 'File'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Stethoscope className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">{language === 'ar' ? 'لا يوجد مريض حالياً' : 'No patient currently'}</p>
                  {nextPatient && (
                    <Button onClick={handleCallNext} className="mt-3 gap-2" data-testid="button-call-next-empty">
                      <PhoneCall className="h-4 w-4" />
                      {language === 'ar' ? 'استدعاء المريض التالي' : 'Call Next Patient'}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-next-patient">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-amber-500" />
                {language === 'ar' ? 'المريض التالي' : 'Next Patient'}
              </CardTitle>
              {nextPatient && !currentPatient && (
                <Button size="sm" onClick={handleCallNext} className="gap-1" data-testid="button-call-next-header">
                  <PhoneCall className="h-4 w-4" />
                  {language === 'ar' ? 'استدعاء' : 'Call'}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {nextPatient ? (
                <div className={`p-4 rounded-lg border ${nextPatient.isUrgent ? 'border-destructive/30 bg-destructive/5' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'}`}>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                      <User className="h-6 w-6 text-amber-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground" data-testid="text-next-patient">{getPatientName(nextPatient.patientId)}</p>
                        {nextPatient.isUrgent && (
                          <Badge variant="destructive" className="gap-1"><Zap className="h-3 w-3" />{language === 'ar' ? 'مستعجل' : 'URGENT'}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {nextPatient.arrivalTime
                          ? `${language === 'ar' ? 'وصل' : 'Arrived'} ${formatTime(new Date(nextPatient.arrivalTime).toTimeString().slice(0,5), language)}`
                          : formatTime(nextPatient.time, language)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Hourglass className="h-10 w-10 mx-auto opacity-30 mb-2" />
                  <p className="text-sm">{language === 'ar' ? 'لا يوجد مرضى في الانتظار' : 'No patients waiting'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Doctor — Home Visits Today */}
        {(() => {
          const doctorHomeVisits = todayVisits.filter(v => v.isHomeVisit)
            .sort((a, b) => a.time.localeCompare(b.time));
          if (doctorHomeVisits.length === 0) return null;
          return (
            <Card data-testid="card-doctor-home-visits">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Home className="h-5 w-5 text-orange-500" />
                  {language === 'ar' ? 'الزيارات المنزلية اليوم' : 'Home Visits Today'}
                </CardTitle>
                <CardDescription>
                  {doctorHomeVisits.length} {language === 'ar' ? 'زيارة منزلية' : 'home visits scheduled'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {doctorHomeVisits.map(visit => (
                    <div
                      key={visit.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10"
                      data-testid={`doctor-home-visit-${visit.id}`}
                    >
                      <div className="h-9 w-9 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                        <Home className="h-4.5 w-4.5 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{getPatientName(visit.patientId)}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {visit.time}
                          {visit.homeCity && <><MapPin className="h-3 w-3 ml-1" />{[visit.homeArea, visit.homeCity].filter(Boolean).join(', ')}</>}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs border-orange-300 text-orange-600 dark:text-orange-400 shrink-0">
                        {language === 'ar' ? 'منزلية' : 'Home'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* AI Scribe Sheet */}
        {currentPatient && (
          <Sheet open={scribeOpen} onOpenChange={setScribeOpen}>
            <SheetContent side={isAr ? 'left' : 'right'} className="w-full sm:max-w-xl overflow-y-auto">
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {isAr ? 'الكاتب الطبي الذكي' : 'AI Medical Scribe'}
                </SheetTitle>
              </SheetHeader>
              <AIScribeTab
                patientId={currentPatient.patientId}
                patientName={getPatientName(currentPatient.patientId) || ''}
                specialty={getSpecialtyName(currentPatient.specialtyId)}
              />
            </SheetContent>
          </Sheet>
        )}

        {/* Today's Scheduled Appointments */}
        {todayScheduled.length > 0 && (
          <Card data-testid="card-today-scheduled">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-chart-2" />
                {isAr ? 'مواعيد اليوم' : "Today's Appointments"}
              </CardTitle>
              <CardDescription>
                {todayScheduled.length} {isAr ? 'موعد — في انتظار الوصول' : 'appointments — awaiting arrival'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {todayScheduled.map(apt => {
                  const pt = patients.find(p => p.id === apt.patientId);
                  const ptName = isAr ? pt?.nameAr : pt?.name;
                  const isThisChecking = checkingInId === apt.id;
                  const handleCheckIn = async () => {
                    setCheckingInId(apt.id);
                    try {
                      await checkInAppointment(apt.id);
                      toast.success(isAr ? 'تم تسجيل وصول المريض' : 'Patient checked in');
                    } catch {
                      toast.error(isAr ? 'فشل تسجيل الوصول' : 'Check-in failed');
                    } finally {
                      setCheckingInId(null);
                    }
                  };
                  return (
                    <div key={apt.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10" data-testid={`today-apt-${apt.id}`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{ptName}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {apt.time}
                            {apt.notes && <span className="truncate max-w-[120px]">· {apt.notes}</span>}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={() => navigate(`/patients/${apt.patientId}`)}>
                          <User className="h-3.5 w-3.5" />
                          {isAr ? 'الملف' : 'File'}
                        </Button>
                        <Button size="sm" className="gap-1 h-8 text-xs" disabled={!!checkingInId} onClick={handleCheckIn}>
                          <LogIn className="h-3.5 w-3.5" />
                          {isThisChecking ? '...' : (isAr ? 'تسجيل الوصول' : 'Check In')}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Appointments */}
        {upcomingAppointments.length > 0 && (
          <Card data-testid="card-upcoming-appointments">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-chart-2" />
                {isAr ? 'المواعيد القادمة' : 'Upcoming Appointments'}
              </CardTitle>
              <CardDescription>
                {upcomingAppointments.length} {isAr ? 'موعد قادم' : 'upcoming'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {upcomingAppointments.slice(0, 8).map(apt => {
                  const pt = patients.find(p => p.id === apt.patientId);
                  const ptName = isAr ? pt?.nameAr : pt?.name;
                  const aptDate = new Date(apt.date);
                  const dateLabel = aptDate.toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
                  return (
                    <div key={apt.id} className="flex items-center justify-between p-3 rounded-lg border border-border" data-testid={`upcoming-apt-${apt.id}`}>
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-chart-2/10 flex items-center justify-center shrink-0">
                          <Calendar className="h-4 w-4 text-chart-2" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground text-sm">{ptName}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <span>{dateLabel}</span>
                            <span>·</span>
                            <Clock className="h-3 w-3" />
                            <span>{apt.time}</span>
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {apt.status === 'scheduled' ? (isAr ? 'مجدول' : 'Scheduled') : apt.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {doctorWaiting.length > 0 && (
          <Card data-testid="card-waiting-list">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-amber-500" />
                  {language === 'ar' ? 'قائمة الانتظار' : 'Waiting List'}
                </CardTitle>
                <CardDescription>
                  {doctorWaiting.length} {language === 'ar' ? 'مرضى' : 'patients'} - {completedVisitsCount} {language === 'ar' ? 'مكتمل اليوم' : 'completed today'}
                </CardDescription>
              </div>
              {!currentPatient && doctorWaiting.length > 0 && (
                <Button size="sm" onClick={handleCallNext} className="gap-1" data-testid="button-call-next-list">
                  <PhoneCall className="h-4 w-4" />
                  {language === 'ar' ? 'استدعاء التالي' : 'Call Next'}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {doctorWaiting.map((visit, idx) => (
                  <div key={visit.id} className={`flex items-center justify-between p-3 rounded-lg border ${visit.isUrgent ? 'border-destructive/30 bg-destructive/5' : 'border-border'}`} data-testid={`doctor-queue-${visit.id}`}>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {visit.isUrgent ? <Zap className="h-4 w-4 text-destructive" /> : idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground">{getPatientName(visit.patientId)}</p>
                          {visit.isUrgent && (
                            <Badge variant="destructive" className="gap-1 text-xs">
                              <Zap className="h-3 w-3" />
                              {language === 'ar' ? 'مستعجل' : 'URGENT'}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {visit.arrivalTime
                            ? `${language === 'ar' ? 'وصل' : 'Arrived'} ${formatTime(new Date(visit.arrivalTime).toTimeString().slice(0,5), language)}`
                            : formatTime(visit.time, language)}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => navigate(`/patients/${visit.patientId}`)} className="gap-1" data-testid={`button-patient-file-${visit.id}`}>
                      <User className="h-4 w-4" />
                      {language === 'ar' ? 'الملف' : 'File'}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-dashboard-title">{t('dashboard.title')}</h1>
        <p className="text-muted-foreground">
          {language === 'ar' ? `مرحبا، ${userName}` : `Welcome back, ${userName}`}
        </p>
      </div>
      <p className="text-muted-foreground">{language === 'ar' ? 'لا توجد بيانات للعرض' : 'No data to display'}</p>
    </div>
  );
};

export default Dashboard;
