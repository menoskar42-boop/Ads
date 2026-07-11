import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useAppointments, useInvoices, useVisits } from '@/hooks/useVisits';
import { useUsers } from '@/hooks/useUsers';
import { useSpecialties } from '@/hooks/useSpecialties';
import { formatDate, formatTime } from '@/lib/dateFormat';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Calendar, Clock, Stethoscope, User, XCircle, CheckCircle2,
  AlertTriangle, FileText, Pill, FlaskConical, Image, Award,
  TrendingUp, TrendingDown, Gift, Download, Eye, ClipboardList,
  Activity, Heart, Share2, CalendarPlus, Bell, BellOff, Copy, Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { prescriptionStore } from '@/stores/prescriptionStore';
import { documentStore } from '@/stores/documentStore';
import { medicalNoteStore } from '@/stores/medicalNoteStore';
import { vitalSignStore } from '@/stores/vitalSignStore';
import { getPatientBalance, getPatientTransactions, calcPointsValue, getClinicLoyaltyConfig, redeemPointsForBalance } from '@/stores/loyaltyStore';
import { patientStore } from '@/stores/patientStore';
import {
  getReminders, addReminder, toggleReminder, deleteReminder,
  type PatientReminder,
} from '@/stores/patientReminderStore';

const FREQ_LABELS: Record<string, { en: string; ar: string }> = {
  once_daily:   { en: 'Once daily',     ar: 'مرة يومياً' },
  twice_daily:  { en: 'Twice daily',    ar: 'مرتين يومياً' },
  three_daily:  { en: 'Three times/day',ar: 'ثلاث مرات يومياً' },
  four_daily:   { en: 'Four times/day', ar: 'أربع مرات يومياً' },
  as_needed:    { en: 'As needed',      ar: 'عند الحاجة' },
  weekly:       { en: 'Weekly',         ar: 'أسبوعياً' },
};

const DOC_TYPE_LABELS: Record<string, { en: string; ar: string; icon: React.ReactNode }> = {
  lab_test:      { en: 'Lab Test',    ar: 'تحليل',    icon: <FlaskConical className="h-4 w-4" /> },
  radiology:     { en: 'Radiology',   ar: 'أشعة',     icon: <Image className="h-4 w-4" /> },
  prescription:  { en: 'Prescription',ar: 'روشتة',    icon: <Pill className="h-4 w-4" /> },
  report:        { en: 'Report',      ar: 'تقرير',    icon: <FileText className="h-4 w-4" /> },
  consent_form:  { en: 'Consent',     ar: 'موافقة',   icon: <ClipboardList className="h-4 w-4" /> },
  other:         { en: 'Other',       ar: 'أخرى',     icon: <FileText className="h-4 w-4" /> },
};

const NOTE_CATEGORY_COLORS: Record<string, string> = {
  diagnosis:        'bg-primary/10 text-primary',
  allergy:          'bg-destructive/10 text-destructive',
  prescription:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  lab_result:       'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  chronic_condition:'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  surgery:          'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  general:          'bg-muted text-muted-foreground',
};

const PatientPortal: React.FC = () => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { appointments, cancelAppointment } = useAppointments();
  const { invoices } = useInvoices();
  const { visits } = useVisits();
  const { doctors } = useUsers();
  const { specialties } = useSpecialties();
  const navigate = useNavigate();
  const isAr = language === 'ar';

  const patientId = user?.patientId || user?.id || '';

  // STEP 5 — reminders
  const [reminders, setReminders] = React.useState<PatientReminder[]>(() => getReminders(patientId));
  const [newRem, setNewRem] = React.useState({ label: '', labelAr: '', timeHHMM: '08:00' });

  const addMedReminder = () => {
    if (!newRem.label.trim()) return;
    addReminder({ patientId, type: 'medication', label: newRem.label, labelAr: newRem.labelAr || newRem.label, timeHHMM: newRem.timeHHMM, daysOfWeek: [], enabled: true });
    setReminders(getReminders(patientId));
    setNewRem({ label: '', labelAr: '', timeHHMM: '08:00' });
    toast.success(isAr ? 'تم إضافة التذكير' : 'Reminder added');
  };

  const toggleRem = (id: string) => {
    toggleReminder(id);
    setReminders(getReminders(patientId));
  };

  const deleteRem = (id: string) => {
    deleteReminder(id);
    setReminders(getReminders(patientId));
  };

  const myAppointments = appointments
    .filter(a => a.patientId === patientId)
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));

  const today = new Date().toISOString().split('T')[0];
  const upcoming = myAppointments.filter(a => a.date >= today && (a.status === 'scheduled' || a.status === 'confirmed'));
  const past = myAppointments.filter(a => a.date < today || ['completed','converted','cancelled','no_show'].includes(a.status));

  // Medical data
  const myPrescriptions = prescriptionStore.filter(p => p.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const myDocuments = documentStore.filter(d => d.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const myNotes = medicalNoteStore.filter(n => n.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const myVitals = vitalSignStore.filter(v => v.patientId === patientId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, 5);

  // Loyalty
  const clinicIds = ['clinic-1', 'clinic-2', 'clinic-3'];
  let loyaltyBalance = 0;
  let loyaltyClinicId = 'clinic-1';
  for (const cid of clinicIds) {
    const b = getPatientBalance(patientId, cid);
    if (b > 0) { loyaltyBalance = b; loyaltyClinicId = cid; break; }
  }
  const loyaltyTxs = getPatientTransactions(patientId, loyaltyClinicId);
  const loyaltyCfg = getClinicLoyaltyConfig(loyaltyClinicId);
  const loyaltyEgp = calcPointsValue(loyaltyBalance, loyaltyClinicId);
  const loyaltyTier = loyaltyBalance >= 10000 ? { icon: '💎', label: isAr ? 'بلاتيني' : 'Platinum', color: 'text-cyan-600' }
    : loyaltyBalance >= 5000 ? { icon: '🥇', label: isAr ? 'ذهبي' : 'Gold', color: 'text-amber-500' }
    : loyaltyBalance >= 1000 ? { icon: '🥈', label: isAr ? 'فضي' : 'Silver', color: 'text-muted-foreground' }
    : { icon: '🥉', label: isAr ? 'برونزي' : 'Bronze', color: 'text-orange-600' };

  // STEP 6 — referral code + redeem state
  const myPatient = patientStore.get(p => p.id === patientId);
  const myReferralCode = myPatient?.referralCode ?? '';
  const [redeemAmt, setRedeemAmt] = React.useState('');
  const [loyaltyBalanceState, setLoyaltyBalanceState] = React.useState(loyaltyBalance);

  const handleRedeem = () => {
    const pts = parseInt(redeemAmt, 10);
    if (!pts || pts <= 0) return;
    const result = redeemPointsForBalance(patientId, loyaltyClinicId, pts);
    if (result.success) {
      toast.success(isAr ? `تم استبدال ${pts} نقطة بـ ${result.discountEgp.toFixed(2)} ج.م رصيد` : `Redeemed ${pts} pts → ${result.discountEgp.toFixed(2)} EGP credit`);
      setLoyaltyBalanceState(getPatientBalance(patientId, loyaltyClinicId));
      setRedeemAmt('');
    } else {
      toast.error(isAr ? result.errorAr : result.error);
    }
  };

  const shareReferralCode = async () => {
    const text = isAr
      ? `استخدم كودي ${myReferralCode} عند التسجيل في ClinicalFlow واحصل على نقاط ترحيب!`
      : `Use my referral code ${myReferralCode} when registering on ClinicalFlow and get welcome bonus points!`;
    try {
      if (navigator.share) { await navigator.share({ title: 'ClinicalFlow Referral', text }); }
      else { await navigator.clipboard.writeText(myReferralCode); toast.success(isAr ? 'تم نسخ الكود' : 'Code copied'); }
    } catch { /* browser share/clipboard cancelled */ }
  };

  const getName = (id: string, list: { id: string; name: string; nameAr: string }[]) => {
    const item = list.find(i => i.id === id);
    return isAr ? item?.nameAr : item?.name;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled': case 'confirmed':
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />{t('appointments.scheduled')}</Badge>;
      case 'completed': case 'converted':
        return <Badge className="gap-1 bg-chart-5 hover:bg-chart-5/80"><CheckCircle2 className="h-3 w-3" />{isAr ? 'مكتمل' : 'Completed'}</Badge>;
      case 'cancelled':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />{t('appointments.cancelled')}</Badge>;
      case 'no_show':
        return <Badge variant="outline" className="gap-1"><AlertTriangle className="h-3 w-3" />{isAr ? 'لم يحضر' : 'No Show'}</Badge>;
      default: return null;
    }
  };

  const handleCancel = async (id: string) => {
    const result = await cancelAppointment(id);
    if (!result.ok) {
      toast.error(
        language === 'ar'
          ? 'يتعذر إلغاء الموعد — الفاتورة مسددة بالفعل كلياً أو جزئياً. يرجى التواصل مع الاستقبال.'
          : 'Cannot cancel — this appointment has already been paid (fully or partially). Please contact reception.',
      );
      return;
    }
    toast.success(t('patient.cancelSuccess'));
  };

  // ── Prescription PDF print ───────────────────────────────────
  const printPrescription = (rx: typeof myPrescriptions[0]) => {
    const doctorName = getName(rx.doctorId, doctors) || '—';
    const medLines = rx.medications.map(m =>
      `• ${isAr ? m.nameAr : m.name} (${m.dosage}) — ${FREQ_LABELS[m.frequency]?.[isAr ? 'ar' : 'en'] || m.frequency}, ${m.duration}`
    ).join('\n');
    const win = window.open('', '_blank');
    if (!win) { toast.error('Allow pop-ups'); return; }
    win.document.write(`<!DOCTYPE html><html dir="${isAr ? 'rtl' : 'ltr'}"><head>
      <title>${isAr ? 'روشتة طبية' : 'Prescription'}</title>
      <meta charset="utf-8"/>
      <style>body{font-family:Arial,sans-serif;padding:2rem;max-width:600px;margin:auto}
      h2{color:#1d4ed8}pre{white-space:pre-wrap;font-size:0.95rem;margin:1rem 0}
      .footer{margin-top:2rem;font-size:0.8rem;color:#888}
      @media print{button{display:none}}</style></head><body>
      <h2>${isAr ? 'روشتة طبية' : 'Medical Prescription'}</h2>
      <p><strong>${isAr ? 'الطبيب:' : 'Doctor:'}</strong> ${doctorName}</p>
      <p><strong>${isAr ? 'التاريخ:' : 'Date:'}</strong> ${formatDate(rx.prescribedAt || rx.createdAt, language)}</p>
      ${rx.expiresAt ? `<p><strong>${isAr ? 'تنتهي:' : 'Expires:'}</strong> ${formatDate(rx.expiresAt, language)}</p>` : ''}
      <hr/><pre>${medLines}</pre>
      ${rx.notes ? `<p><strong>${isAr ? 'ملاحظات:' : 'Notes:'}</strong> ${rx.notes}</p>` : ''}
      <div class="footer">${isAr ? 'هذه الروشتة صادرة بواسطة نظام ClinicFlow. يرجى عدم تناول أي دواء دون استشارة طبيب.' : 'This prescription is issued via ClinicFlow. Do not take medication without physician advice.'}</div>
      <br/><button onclick="window.print()">🖨 ${isAr ? 'طباعة' : 'Print'}</button>
      </body></html>`);
    win.document.close();
  };

  const sharePrescription = async (rx: typeof myPrescriptions[0]) => {
    const doctorName = getName(rx.doctorId, doctors) || '—';
    const text = [
      isAr ? `روشتة طبية — ${doctorName}` : `Prescription — Dr. ${doctorName}`,
      isAr ? `التاريخ: ${formatDate(rx.prescribedAt || rx.createdAt, language)}` : `Date: ${formatDate(rx.prescribedAt || rx.createdAt, language)}`,
      ...rx.medications.map(m => `• ${isAr ? m.nameAr : m.name} (${m.dosage})`),
    ].join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: isAr ? 'روشتتي' : 'My Prescription', text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success(isAr ? 'تم النسخ إلى الحافظة' : 'Copied to clipboard');
      }
    } catch { /* browser share/clipboard cancelled */ }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const AppointmentCard = ({ apt }: { apt: typeof myAppointments[0] }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Calendar className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-medium text-foreground">{formatDate(apt.date, language)}</span>
            <span className="text-muted-foreground">•</span>
            <span className="text-foreground">{formatTime(apt.time, language)}</span>
            {getStatusBadge(apt.status)}
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{getName(apt.doctorId, doctors)}</span>
            <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{getName(apt.specialtyId, specialties)}</span>
          </div>
        </div>
      </div>
      {(apt.status === 'scheduled' || apt.status === 'confirmed') && (
        <div className="flex gap-2 flex-wrap shrink-0">
          {/* STEP 4 — Reschedule */}
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => navigate(`/patient/book?doctor=${apt.doctorId}&reschedule=${apt.id}`)}
          >
            <CalendarPlus className="h-4 w-4" />
            {isAr ? 'إعادة الجدولة' : 'Reschedule'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleCancel(apt.id)} className="gap-1 text-destructive border-destructive/40">
            <XCircle className="h-4 w-4" />{t('patient.cancelAppointment')}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {t('patient.welcome')}, {isAr ? user?.nameAr : user?.name}
          </h1>
          <p className="text-muted-foreground">{t('patient.dashboardDescription')}</p>
        </div>
        <Button onClick={() => navigate('/patient/book')} className="gap-2">
          <Calendar className="h-4 w-4" />{t('patient.bookAppointment')}
        </Button>
      </div>

      {/* Loyalty Card — shown only if patient has points */}
      {loyaltyBalance > 0 && (
        <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 flex items-center justify-center text-2xl shrink-0">
                {loyaltyTier.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                  <Award className="h-3 w-3 text-amber-500" />
                  {isAr ? 'رصيد نقاط الولاء' : 'Loyalty Points Balance'}
                </p>
                <p className={`text-xl font-bold ${loyaltyTier.color}`}>
                  {loyaltyBalance.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">{isAr ? 'نقطة' : 'pts'}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {loyaltyTier.label} · {isAr ? 'تساوي' : 'Worth'} {loyaltyEgp.toFixed(2)} {isAr ? 'ج.م' : 'EGP'}
                </p>
              </div>
              <div className="text-end shrink-0 hidden sm:block">
                <p className="text-xs text-muted-foreground">
                  {isAr ? `اكسب نقطة لكل ${Math.round(1 / loyaltyCfg.pointsPerEgp)} ج.م` : `Earn 1pt per ${Math.round(1 / loyaltyCfg.pointsPerEgp)} EGP`}
                </p>
                <p className="text-xs text-amber-600 font-medium mt-0.5">
                  {isAr ? `الحد الأدنى للاستبدال: ${loyaltyCfg.minRedeemPoints}` : `Min redeem: ${loyaltyCfg.minRedeemPoints} pts`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs — simplified to 3 primary + secondary */}
      <Tabs defaultValue="appointments">
        <TabsList className="w-full flex-wrap h-auto">
          {/* Primary: Appointments */}
          <TabsTrigger value="appointments" className="gap-1.5 flex-1">
            <Calendar className="h-4 w-4" />
            {isAr ? 'مواعيدي' : 'My Appointments'}
            {upcoming.length > 0 && (
              <span className="ms-1 bg-primary text-primary-foreground text-[10px] rounded-full px-1.5 py-px">{upcoming.length}</span>
            )}
          </TabsTrigger>
          {/* Primary: Queue Status */}
          <TabsTrigger value="queue" className="gap-1.5 flex-1">
            <Activity className="h-4 w-4" />
            {isAr ? 'طابوري' : 'My Queue'}
          </TabsTrigger>
          {/* Primary: My Files (prescriptions + documents) */}
          <TabsTrigger value="files" className="gap-1.5 flex-1">
            <FileText className="h-4 w-4" />
            {isAr ? 'ملفاتي' : 'My Files'}
            {(myPrescriptions.length + myDocuments.length) > 0 && (
              <span className="ms-1 bg-primary text-primary-foreground text-[10px] rounded-full px-1.5 py-px">{myPrescriptions.length + myDocuments.length}</span>
            )}
          </TabsTrigger>
          {/* Secondary: Medical Record */}
          <TabsTrigger value="notes" className="gap-1.5 flex-1">
            <ClipboardList className="h-4 w-4" />
            {isAr ? 'السجل' : 'Record'}
          </TabsTrigger>
          {/* Secondary: Reminders */}
          <TabsTrigger value="reminders" className="gap-1.5 flex-1">
            <Bell className="h-4 w-4" />
            {isAr ? 'تذكيراتي' : 'Reminders'}
            {reminders.filter(r => r.enabled).length > 0 && (
              <span className="ms-1 bg-violet-500 text-white text-[10px] rounded-full px-1.5 py-px">
                {reminders.filter(r => r.enabled).length}
              </span>
            )}
          </TabsTrigger>
          {loyaltyBalance > 0 && (
            <TabsTrigger value="loyalty" className="gap-1.5 flex-1">
              <Award className="h-4 w-4" />
              {isAr ? 'النقاط' : 'Points'}
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── Appointments Tab ── */}
        <TabsContent value="appointments" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{t('patient.upcomingAppointments')}</CardTitle>
              <CardDescription>{upcoming.length} {isAr ? 'موعد قادم' : 'upcoming'}</CardDescription>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>{t('patient.noUpcoming')}</p>
                  <Button variant="link" onClick={() => navigate('/patient/book')}>{t('patient.bookNow')}</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcoming.map(apt => <AppointmentCard key={apt.id} apt={apt} />)}
                </div>
              )}
            </CardContent>
          </Card>

          {past.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{t('patient.pastVisits')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {past.slice(0, 10).map(apt => <AppointmentCard key={apt.id} apt={apt} />)}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Queue Status Tab ── */}
        <TabsContent value="queue" className="space-y-4 mt-4">
          {(() => {
            const myQueueVisit = visits.find(v =>
              v.patientId === patientId && v.date === today &&
              (v.status === 'waiting' || v.status === 'in_consultation' || v.status === 'in_queue')
            );
            const queuePosition = myQueueVisit?.status === 'waiting'
              ? visits.filter(v => v.date === today && v.status === 'waiting' && v.clinicId === myQueueVisit.clinicId).findIndex(v => v.id === myQueueVisit.id) + 1
              : 0;
            return (
              <Card>
                <CardContent className="py-10 text-center">
                  {!myQueueVisit ? (
                    <>
                      <Activity className="h-12 w-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
                      <p className="text-lg font-medium text-muted-foreground">{isAr ? 'أنت لست في الطابور اليوم' : 'You are not in queue today'}</p>
                      <p className="text-sm text-muted-foreground mt-1">{isAr ? 'لا توجد بيانات' : 'No queue data available'}</p>
                    </>
                  ) : myQueueVisit.status === 'in_consultation' ? (
                    <>
                      <div className="h-20 w-20 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mx-auto mb-4">
                        <Stethoscope className="h-10 w-10 text-purple-600 dark:text-purple-400" />
                      </div>
                      <p className="text-xl font-bold text-purple-700">{isAr ? 'أنت الآن مع الطبيب' : 'You are with the doctor now'}</p>
                    </>
                  ) : (
                    <>
                      <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <span className="text-4xl font-bold text-primary">{queuePosition || '?'}</span>
                      </div>
                      <p className="text-xl font-bold text-foreground">{isAr ? 'رقمك في الطابور' : 'Your Queue Number'}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {queuePosition <= 1
                          ? (isAr ? 'دورك قريب جداً!' : 'Your turn is coming soon!')
                          : (isAr ? `${queuePosition - 1} أشخاص قبلك` : `${queuePosition - 1} people ahead of you`)}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* ── Files Tab (prescriptions + documents combined) ── */}
        <TabsContent value="files" className="space-y-4 mt-4">
          {myPrescriptions.length === 0 && myDocuments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>{isAr ? 'لا توجد ملفات بعد' : 'No files yet'}</p>
                <p className="text-xs mt-1 opacity-70">{isAr ? 'لا توجد بيانات' : 'No data available'}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {myPrescriptions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Pill className="h-4 w-4" />
                    {isAr ? 'الروشتات' : 'Prescriptions'} ({myPrescriptions.length})
                  </h3>
                  {myPrescriptions.slice(0, 5).map(rx => (
                    <Card key={rx.id} className={rx.status === 'active' ? 'border-green-200' : ''}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <p className="font-medium text-sm">{isAr ? 'روشتة طبية' : 'Prescription'} #{rx.id}</p>
                            <p className="text-xs text-muted-foreground">{getName(rx.doctorId, doctors) || '—'} · {formatDate(rx.prescribedAt || rx.createdAt, language)}</p>
                          </div>
                          <Badge className={rx.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}>
                            {rx.status === 'active' ? (isAr ? 'نشطة' : 'Active') : (isAr ? 'منتهية' : 'Completed')}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {rx.medications.map(med => (
                            <span key={med.id} className="text-xs px-2 py-1 rounded-full bg-muted border">
                              {isAr ? med.nameAr : med.name} · {med.dosage}
                            </span>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {myDocuments.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    {isAr ? 'المستندات' : 'Documents'} ({myDocuments.length})
                  </h3>
                  {myDocuments.map(doc => (
                    <Card key={doc.id}>
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            {DOC_TYPE_LABELS[doc.type]?.icon || <FileText className="h-4 w-4 text-primary" />}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{doc.title || (isAr ? DOC_TYPE_LABELS[doc.type]?.ar : DOC_TYPE_LABELS[doc.type]?.en)}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(doc.createdAt, language)}</p>
                          </div>
                        </div>
                        {doc.fileUrl && (
                          <Button size="sm" variant="outline" className="gap-1 shrink-0" onClick={() => window.open(doc.fileUrl, '_blank')}>
                            <Eye className="h-3.5 w-3.5" />
                            {isAr ? 'عرض' : 'View'}
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ── Prescriptions Tab (kept for direct linking) ── */}
        <TabsContent value="prescriptions" className="space-y-4 mt-4">
          {myPrescriptions.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Pill className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>{isAr ? 'لا توجد روشتات بعد' : 'No prescriptions yet'}</p>
              </CardContent>
            </Card>
          ) : (
            myPrescriptions.map(rx => (
              <Card key={rx.id} className={rx.status === 'active' ? 'border-green-200' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Pill className="h-4 w-4 text-primary" />
                      {isAr ? 'روشتة طبية' : 'Prescription'}
                      <span className="text-xs text-muted-foreground font-normal">#{rx.id}</span>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge className={rx.status === 'active' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}>
                        {rx.status === 'active' ? (isAr ? 'نشطة' : 'Active') : (isAr ? 'منتهية' : 'Completed')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(rx.prescribedAt || rx.createdAt, language)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? 'الطبيب:' : 'Doctor:'} {getName(rx.doctorId, doctors) || '—'}
                    {rx.expiresAt && ` · ${isAr ? 'تنتهي:' : 'Expires:'} ${formatDate(rx.expiresAt, language)}`}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rx.medications.map(med => (
                    <div key={med.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{isAr ? med.nameAr : med.name} <span className="text-muted-foreground font-normal">({med.dosage})</span></p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {FREQ_LABELS[med.frequency]?.[isAr ? 'ar' : 'en'] || med.frequency} · {med.duration}
                        </p>
                        {med.instructions && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">
                            {isAr ? med.instructionsAr : med.instructions}
                          </p>
                        )}
                      </div>
                      {med.refillsTotal > 0 && (
                        <Badge variant="outline" className="text-xs shrink-0">
                          {isAr ? `إعادة ${med.refillsTotal - med.refillsUsed}/${med.refillsTotal}` : `Refills: ${med.refillsTotal - med.refillsUsed}/${med.refillsTotal}`}
                        </Badge>
                      )}
                    </div>
                  ))}
                  {rx.notes && (
                    <p className="text-xs text-muted-foreground border-t pt-2">
                      <span className="font-medium">{isAr ? 'ملاحظات:' : 'Notes:'}</span> {rx.notes}
                    </p>
                  )}
                  {/* STEP 3 — PDF + Share */}
                  <div className="flex gap-2 pt-1 border-t">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={() => printPrescription(rx)}>
                      <Download className="h-3.5 w-3.5" />
                      {isAr ? 'تحميل PDF' : 'Download PDF'}
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-xs h-8" onClick={() => sharePrescription(rx)}>
                      <Share2 className="h-3.5 w-3.5" />
                      {isAr ? 'مشاركة' : 'Share'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Documents Tab ── */}
        <TabsContent value="documents" className="space-y-4 mt-4">
          {myDocuments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>{isAr ? 'لا توجد مستندات بعد' : 'No documents yet'}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Group by type */}
              {(['lab_test', 'radiology', 'prescription', 'report', 'other'] as const).map(type => {
                const typeDocs = myDocuments.filter(d => d.documentType === type);
                if (typeDocs.length === 0) return null;
                const typeInfo = DOC_TYPE_LABELS[type];
                return (
                  <Card key={type}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                        {typeInfo.icon}
                        {isAr ? typeInfo.ar : typeInfo.en}
                        <Badge variant="secondary" className="text-xs">{typeDocs.length}</Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {typeDocs.map(doc => (
                          <div key={doc.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
                                {typeInfo.icon}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{isAr ? doc.titleAr : doc.title}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(doc.uploadDate, language)} · {formatFileSize(doc.fileSize)}
                                </p>
                                {doc.notes && <p className="text-xs text-muted-foreground truncate">{doc.notes}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {doc.fileUrl ? (
                                <>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                                      <Eye className="h-3.5 w-3.5" />
                                    </a>
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" asChild>
                                    <a href={doc.fileUrl} download={doc.fileName}>
                                      <Download className="h-3.5 w-3.5" />
                                    </a>
                                  </Button>
                                </>
                              ) : (
                                <Badge variant="outline" className="text-xs">{isAr ? 'متاح قريباً' : 'Pending'}</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Medical Notes / Record Tab ── */}
        <TabsContent value="notes" className="space-y-4 mt-4">
          {/* Vitals summary */}
          {myVitals.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  {isAr ? 'آخر القياسات الحيوية' : 'Latest Vital Signs'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {myVitals.slice(0, 1).map(v => (
                    <React.Fragment key={v.id}>
                      {v.bloodPressureSystolic && (
                        <div className="text-center p-2 rounded-lg bg-red-50 border border-red-100">
                          <Heart className="h-4 w-4 text-red-500 mx-auto mb-1" />
                          <p className="text-xs text-muted-foreground">{isAr ? 'ضغط الدم' : 'Blood Pressure'}</p>
                          <p className="font-bold text-sm text-red-600">{v.bloodPressureSystolic}/{v.bloodPressureDiastolic}</p>
                        </div>
                      )}
                      {v.heartRate && (
                        <div className="text-center p-2 rounded-lg bg-pink-50 border border-pink-100">
                          <Activity className="h-4 w-4 text-pink-500 mx-auto mb-1" />
                          <p className="text-xs text-muted-foreground">{isAr ? 'نبض' : 'Heart Rate'}</p>
                          <p className="font-bold text-sm text-pink-600">{v.heartRate} bpm</p>
                        </div>
                      )}
                      {v.temperature && (
                        <div className="text-center p-2 rounded-lg bg-amber-50 border border-amber-100">
                          <Activity className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                          <p className="text-xs text-muted-foreground">{isAr ? 'حرارة' : 'Temperature'}</p>
                          <p className="font-bold text-sm text-amber-600">{v.temperature}°C</p>
                        </div>
                      )}
                      {v.weight && (
                        <div className="text-center p-2 rounded-lg bg-primary/5 border border-primary/15">
                          <Activity className="h-4 w-4 text-primary mx-auto mb-1" />
                          <p className="text-xs text-muted-foreground">{isAr ? 'الوزن' : 'Weight'}</p>
                          <p className="font-bold text-sm text-primary">{v.weight} kg</p>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {isAr ? `آخر تحديث: ${formatDate(myVitals[0].recordedAt.split('T')[0], language)}` : `Last updated: ${formatDate(myVitals[0].recordedAt.split('T')[0], language)}`}
                </p>
              </CardContent>
            </Card>
          )}

          {/* STEP 6 — Allergy / chronic warning banners */}
          {myNotes.some(n => n.category === 'allergy') && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-red-700 mb-1">{isAr ? 'تحذير: حساسية مسجلة' : 'Allergy Alert'}</p>
                {myNotes.filter(n => n.category === 'allergy').map(n => (
                  <p key={n.id} className="text-xs text-red-600">• {n.title}: {n.content}</p>
                ))}
              </div>
            </div>
          )}
          {myNotes.some(n => n.category === 'chronic_condition') && (
            <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/30 px-4 py-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-orange-700 mb-1">{isAr ? 'أمراض مزمنة' : 'Chronic Conditions'}</p>
                {myNotes.filter(n => n.category === 'chronic_condition').map(n => (
                  <p key={n.id} className="text-xs text-orange-600">• {n.title}</p>
                ))}
              </div>
            </div>
          )}

          {/* Medical notes */}
          {myNotes.length === 0 && myVitals.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>{isAr ? 'لا توجد سجلات طبية بعد' : 'No medical records yet'}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {myNotes.map(note => (
                <Card key={note.id} className={note.category === 'allergy' ? 'border-red-200 bg-red-50/40 dark:bg-red-950/10' : note.category === 'chronic_condition' ? 'border-orange-200 bg-orange-50/40 dark:bg-orange-950/10' : ''}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-semibold text-sm">{note.title}</p>
                          <Badge className={`text-xs ${NOTE_CATEGORY_COLORS[note.category] || 'bg-muted text-muted-foreground'}`} variant="secondary">
                            {note.category.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{note.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          {isAr ? 'الطبيب:' : 'Doctor:'} {getName(note.doctorId, doctors) || '—'} ·{' '}
                          {formatDate(note.createdAt.split('T')[0], language)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Reminders Tab ── */}
        <TabsContent value="reminders" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                {isAr ? 'إضافة تذكير دواء' : 'Add Medication Reminder'}
              </CardTitle>
              <CardDescription>
                {isAr ? 'سيتم تنبيهك بوقت تناول الدواء' : "Get notified when it's time for your medication"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'اسم الدواء (انجليزي)' : 'Medication name'}</label>
                  <Input
                    value={newRem.label}
                    onChange={e => setNewRem(r => ({ ...r, label: e.target.value }))}
                    placeholder="Aspirin 81mg"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'الاسم بالعربي (اختياري)' : 'Arabic name (optional)'}</label>
                  <Input
                    dir="rtl"
                    value={newRem.labelAr}
                    onChange={e => setNewRem(r => ({ ...r, labelAr: e.target.value }))}
                    placeholder="أسبرين"
                  />
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div className="space-y-1 flex-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'وقت التذكير' : 'Reminder time'}</label>
                  <Input
                    type="time"
                    value={newRem.timeHHMM}
                    onChange={e => setNewRem(r => ({ ...r, timeHHMM: e.target.value }))}
                  />
                </div>
                <Button onClick={addMedReminder} disabled={!newRem.label.trim()} className="gap-1.5">
                  <Bell className="h-4 w-4" />
                  {isAr ? 'إضافة' : 'Add'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {reminders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>{isAr ? 'لا توجد تذكيرات بعد' : 'No reminders yet'}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{isAr ? 'تذكيراتي' : 'My Reminders'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {reminders.map(rem => (
                  <div key={rem.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${rem.enabled ? 'border-violet-200 bg-violet-50/50 dark:bg-violet-950/20' : 'border-border bg-muted/30'}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${rem.enabled ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-muted text-muted-foreground'}`}>
                        {rem.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{isAr && rem.labelAr ? rem.labelAr : rem.label}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {rem.timeHHMM}
                          {rem.daysOfWeek.length === 0 && ` · ${isAr ? 'كل يوم' : 'Daily'}`}
                          {!rem.enabled && ` · ${isAr ? 'معطّل' : 'Disabled'}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggleRem(rem.id)}>
                        {rem.enabled ? <Bell className="h-4 w-4 text-violet-600" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteRem(rem.id)}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Loyalty Points Tab ── */}
        {loyaltyBalance > 0 && (
          <TabsContent value="loyalty" className="space-y-4 mt-4">
            {/* Referral Code Card */}
            {myReferralCode && (
              <Card className="border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 dark:bg-violet-900/30">
                      <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-violet-700">{isAr ? 'رمز الإحالة الخاص بك' : 'Your Referral Code'}</p>
                      <p className="text-xs text-muted-foreground">{isAr ? 'شارك الرمز واكسب 20 نقطة لكل صديق' : 'Share & earn 20 pts per friend who registers'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-center text-xl font-bold tracking-widest bg-white dark:bg-background border border-violet-200 rounded-lg py-2 px-4 text-violet-700">
                      {myReferralCode}
                    </code>
                    <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => { navigator.clipboard.writeText(myReferralCode); toast.success(isAr ? 'تم النسخ' : 'Copied'); }}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" className="gap-1.5 shrink-0 bg-violet-600 hover:bg-violet-700" onClick={shareReferralCode}>
                      <Share2 className="h-3.5 w-3.5" />
                      {isAr ? 'مشاركة' : 'Share'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Redeem Points Card */}
            <Card className="border-green-200 bg-green-50/40 dark:bg-green-950/10">
              <CardContent className="pt-4 pb-4">
                <p className="font-semibold text-sm text-green-700 mb-1">{isAr ? 'استبدال النقاط' : 'Redeem Points'}</p>
                <p className="text-xs text-muted-foreground mb-3">
                  {isAr ? `رصيدك: ${loyaltyBalanceState.toLocaleString()} نقطة · الحد الأدنى ${loyaltyCfg.minRedeemPoints} نقطة` : `Balance: ${loyaltyBalanceState.toLocaleString()} pts · Min ${loyaltyCfg.minRedeemPoints} pts`}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={loyaltyCfg.minRedeemPoints}
                    max={loyaltyBalanceState}
                    value={redeemAmt}
                    onChange={e => setRedeemAmt(e.target.value)}
                    placeholder={String(loyaltyCfg.minRedeemPoints)}
                    className="flex-1"
                    dir="ltr"
                  />
                  <Button onClick={handleRedeem} disabled={!redeemAmt || parseInt(redeemAmt) < loyaltyCfg.minRedeemPoints} className="gap-1.5 bg-green-600 hover:bg-green-700">
                    <Gift className="h-4 w-4" />
                    {isAr ? 'استبدال' : 'Redeem'}
                  </Button>
                </div>
                {redeemAmt && parseInt(redeemAmt) >= loyaltyCfg.minRedeemPoints && (
                  <p className="text-xs text-green-600 mt-1.5">
                    = {(parseInt(redeemAmt) * loyaltyCfg.egpPerPoint).toFixed(2)} {isAr ? 'ج.م رصيد' : 'EGP credit'}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-amber-200">
              <CardContent className="pt-5">
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-4xl">{loyaltyTier.icon}</span>
                  <div>
                    <p className="text-xs text-muted-foreground">{isAr ? 'المستوى' : 'Tier'}</p>
                    <p className={`text-xl font-bold ${loyaltyTier.color}`}>{loyaltyTier.label}</p>
                    <p className="text-sm text-muted-foreground">{loyaltyBalanceState.toLocaleString()} {isAr ? 'نقطة' : 'pts'} = {(loyaltyBalanceState * loyaltyCfg.egpPerPoint).toFixed(2)} {isAr ? 'ج.م' : 'EGP'}</p>
                  </div>
                </div>
                <Separator className="mb-4" />
                <div className="space-y-2">
                  {loyaltyTxs.slice(0, 10).map(tx => (
                    <div key={tx.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-2">
                        {tx.type === 'earn' && <TrendingUp className="h-3.5 w-3.5 text-green-600" />}
                        {tx.type === 'redeem' && <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                        {tx.type === 'bonus' && <Gift className="h-3.5 w-3.5 text-amber-500" />}
                        <span className="text-sm text-muted-foreground">{isAr ? tx.descriptionAr : tx.description}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-semibold ${tx.points > 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {tx.points > 0 ? '+' : ''}{tx.points.toLocaleString()}
                        </span>
                        <span className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default PatientPortal;
