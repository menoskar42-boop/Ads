import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePatients } from '@/hooks/usePatients';
import { useAppointments, useVisits, useInvoices } from '@/hooks/useVisits';
import { useUsers } from '@/hooks/useUsers';
import { useSpecialties, useServices } from '@/hooks/useSpecialties';
import { formatDate } from '@/lib/dateFormat';
import MedicalNotesTab from '@/components/MedicalNotesTab';
import VitalSignsTab from '@/components/VitalSignsTab';
import VisitTimelineTab from '@/components/VisitTimelineTab';
import PrescriptionsTab from '@/components/PrescriptionsTab';
import MedicalDocumentsTab from '@/components/MedicalDocumentsTab';
import BodyMapTab from '@/components/BodyMapTab';
import SpecialtyFormsTab from '@/components/SpecialtyFormsTab';
import EnhancedDocumentsTab from '@/components/EnhancedDocumentsTab';
import PatientQRCard from '@/components/PatientQRCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, User, Phone, Calendar, Clock, FileText, DollarSign,
  Stethoscope, Pencil, Trash2, ClipboardList, Activity, History,
  Pill, CalendarPlus, FolderOpen, MoreVertical, QrCode, Star, Gift,
  FlaskConical, TrendingUp, TrendingDown, Award, Send, Package,
  CheckCircle2, Truck, X, MessageSquare, Coins, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import BookingWizard from '@/components/BookingWizard';
import { useAuth } from '@/hooks/useAuth';
import { getClinicById } from '@/stores/clinicStore';
import {
  getPatientBalance, getPatientTransactions, calcPointsValue,
  addBonusPoints, getClinicLoyaltyConfig,
  LoyaltyTransaction,
} from '@/stores/loyaltyStore';
import {
  getPatientLabOrders, updateLabOrderStatus, generateWhatsAppMessage,
  LabOrder, LabOrderStatus,
} from '@/stores/labOrderStore';
import { feedbackStore, PatientFeedback } from '@/stores/feedbackStore';

// ─── Status maps ──────────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
  scheduled: 'bg-primary/10 text-primary',
  confirmed: 'bg-chart-1/10 text-chart-1',
  cancelled: 'bg-destructive/10 text-destructive',
  completed: 'bg-chart-2/10 text-chart-2',
  converted: 'bg-primary/10 text-primary',
  no_show: 'bg-chart-4/10 text-chart-4',
  checked_in: 'bg-primary/10 text-primary',
  booked: 'bg-primary/10 text-primary',
  waiting: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  in_consultation: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  pending: 'bg-chart-4/10 text-chart-4',
  paid: 'bg-chart-2/10 text-chart-2',
  partially_paid: 'bg-chart-3/10 text-chart-3',
  refunded: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const statusLabels: Record<string, { en: string; ar: string }> = {
  scheduled:       { en: 'Scheduled',      ar: 'مجدول' },
  confirmed:       { en: 'Confirmed',       ar: 'مؤكد' },
  cancelled:       { en: 'Cancelled',       ar: 'ملغي' },
  completed:       { en: 'Completed',       ar: 'مكتمل' },
  converted:       { en: 'Arrived',         ar: 'وصل' },
  no_show:         { en: 'No Show',         ar: 'لم يحضر' },
  checked_in:      { en: 'Arrived',         ar: 'وصل' },
  booked:          { en: 'Booked',          ar: 'محجوز' },
  waiting:         { en: 'Waiting',         ar: 'في الانتظار' },
  in_consultation: { en: 'In Consultation', ar: 'في الاستشارة' },
  pending:         { en: 'Pending',         ar: 'معلق' },
  paid:            { en: 'Paid',            ar: 'مدفوع' },
  partially_paid:  { en: 'Partially Paid',  ar: 'مدفوع جزئيا' },
  refunded:        { en: 'Refunded',        ar: 'مسترد' },
};

// Lab order status config
const LAB_STATUS: Record<LabOrderStatus, { en: string; ar: string; color: string }> = {
  draft:       { en: 'Draft',       ar: 'مسودة',       color: 'bg-muted text-muted-foreground' },
  sent:        { en: 'Sent',        ar: 'أُرسل',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  in_progress: { en: 'In Progress', ar: 'قيد التنفيذ',  color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  ready:       { en: 'Ready',       ar: 'جاهز',         color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  received:    { en: 'Received',    ar: 'تم الاستلام',  color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  delivered:   { en: 'Delivered',   ar: 'تم التسليم',   color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled:   { en: 'Cancelled',   ar: 'ملغي',         color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

// ─── Loyalty tier helpers ─────────────────────────────────────────────────────
function getLoyaltyTier(points: number): { label: string; labelAr: string; color: string; icon: string; nextAt: number } {
  if (points >= 10000) return { label: 'Platinum', labelAr: 'بلاتيني', color: 'text-cyan-600', icon: '💎', nextAt: 10000 };
  if (points >= 5000)  return { label: 'Gold',     labelAr: 'ذهبي',    color: 'text-amber-500', icon: '🥇', nextAt: 10000 };
  if (points >= 1000)  return { label: 'Silver',   labelAr: 'فضي',     color: 'text-muted-foreground', icon: '🥈', nextAt: 5000 };
  return { label: 'Bronze', labelAr: 'برونزي', color: 'text-orange-600', icon: '🥉', nextAt: 1000 };
}

// ─── Health Timeline Tab (B2) ─────────────────────────────────────────────────
const HealthTimelineTab: React.FC<{
  patientId: string;
  appointments: any[];
  visits: any[];
  invoices: any[];
  isAr: boolean;
}> = ({ patientId, appointments, visits, invoices, isAr }) => {
  const events = [
    ...appointments.map(a => ({ date: a.date, type: 'appointment' as const, label: isAr ? 'موعد' : 'Appointment', status: a.status, id: a.id })),
    ...visits.map(v => ({ date: v.date, type: 'visit' as const, label: isAr ? 'زيارة' : 'Visit', status: v.status, id: v.id })),
    ...invoices.map(i => ({ date: i.createdAt?.split('T')[0] || '', type: 'invoice' as const, label: isAr ? 'فاتورة' : 'Invoice', status: i.status, id: i.id })),
  ].filter(e => e.date).sort((a, b) => b.date.localeCompare(a.date));

  const typeIcon: Record<string, string> = { appointment: '📅', visit: '🏥', invoice: '🧾' };
  const typeColor: Record<string, string> = { appointment: 'bg-primary/10 text-primary', visit: 'bg-chart-2/10 text-chart-2', invoice: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' };

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>{isAr ? 'لا توجد أحداث بعد' : 'No events yet'}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          {isAr ? 'الخط الزمني الصحي الكامل' : 'Complete Health Timeline'}
          <Badge variant="outline">{events.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="relative divide-y">
          {events.map((e, i) => (
            <div key={`${e.type}-${e.id}`} className="flex items-start gap-4 p-4">
              <div className="flex flex-col items-center">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${typeColor[e.type]}`}>
                  {typeIcon[e.type]}
                </div>
                {i < events.length - 1 && <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: '16px' }} />}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{e.label}</span>
                  <Badge variant="outline" className="text-xs">{e.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{new Date(e.date).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Patient Feedback Tab (F5) ────────────────────────────────────────────────
const PatientFeedbackTab: React.FC<{
  patientId: string;
  patientName: string;
  clinicId: string;
  isAr: boolean;
}> = ({ patientId, patientName, clinicId, isAr }) => {
  const [feedbacks, setFeedbacks] = React.useState<PatientFeedback[]>(() =>
    feedbackStore.getAll().filter(f => f.patientId === patientId)
  );

  React.useEffect(() => {
    const unsub = feedbackStore.subscribe(() =>
      setFeedbacks(feedbackStore.getAll().filter(f => f.patientId === patientId))
    );
    return unsub;
  }, [patientId]);

  const feedbackLink = `${window.location.origin}/feedback/${clinicId}/${patientId}`;
  const avgStars = feedbacks.length > 0 ? (feedbacks.reduce((s, f) => s + f.stars, 0) / feedbacks.length).toFixed(1) : null;

  const copyLink = () => {
    navigator.clipboard.writeText(feedbackLink);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium">{isAr ? 'رابط التقييم' : 'Feedback Link'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{isAr ? 'شارك هذا الرابط مع المريض' : 'Share this link with the patient'}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={copyLink}>
                <Copy className="h-3.5 w-3.5" />{isAr ? 'نسخ' : 'Copy'}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => {
                const phone = '';
                const msg = encodeURIComponent(`${isAr ? 'يرجى تقييم تجربتك معنا' : 'Please rate your experience'}: ${feedbackLink}`);
                window.open(`https://wa.me/?text=${msg}`, '_blank');
              }}>
                <Send className="h-3.5 w-3.5" />{isAr ? 'واتساب' : 'WhatsApp'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {feedbacks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{isAr ? 'لا توجد تقييمات بعد' : 'No feedback yet'}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {avgStars && (
            <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <Star className="h-6 w-6 text-yellow-500 fill-yellow-400" />
              <div>
                <span className="text-2xl font-bold text-yellow-700">{avgStars}</span>
                <span className="text-sm text-muted-foreground ml-1">/ 5 · {feedbacks.length} {isAr ? 'تقييم' : 'reviews'}</span>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {feedbacks.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map(f => (
              <Card key={f.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(n => (
                        <Star key={n} className={`h-4 w-4 ${n <= f.stars ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'}`} />
                      ))}
                    </div>
                    <div className="flex-1">
                      {f.comment && <p className="text-sm">{f.comment}</p>}
                      {f.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {f.tags.map(tag => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1.5">{new Date(f.submittedAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const PatientProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { patients, updatePatient, deletePatient } = usePatients();
  const { appointments } = useAppointments();
  const { visits } = useVisits();
  const { invoices, invoiceItems } = useInvoices();
  const { users } = useUsers();
  const { specialties } = useSpecialties();
  const { services } = useServices();
  const { user } = useAuth();
  const isAr = language === 'ar';

  const [editOpen, setEditOpen]     = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [qrOpen, setQrOpen]         = useState(false);

  // Bonus points dialog
  const [bonusOpen, setBonusOpen]   = useState(false);
  const [bonusForm, setBonusForm]   = useState({ points: '', reason: '', reasonAr: '' });

  const [editForm, setEditForm] = useState({
    name: '', nameAr: '', phone: '', email: '',
    dateOfBirth: '', gender: '' as 'male' | 'female', nationalId: '',
  });

  // ─── Loyalty state (refreshable)
  const clinicId = user?.clinicId || patient?.clinicId || 'clinic-1';
  const clinic   = getClinicById(clinicId);
  const [loyaltyBalance, setLoyaltyBalance]   = useState(() => getPatientBalance(id || '', clinicId));
  const [loyaltyTxs, setLoyaltyTxs]           = useState<LoyaltyTransaction[]>(() => getPatientTransactions(id || '', clinicId));
  const [labOrders, setLabOrders]             = useState<LabOrder[]>(() => getPatientLabOrders(id || '', clinicId));

  const refreshLoyalty = () => {
    setLoyaltyBalance(getPatientBalance(id || '', clinicId));
    setLoyaltyTxs(getPatientTransactions(id || '', clinicId));
  };
  const refreshLabs = () => setLabOrders(getPatientLabOrders(id || '', clinicId));

  React.useEffect(() => {
    refreshLoyalty();
    refreshLabs();
  }, [id, clinicId]); // eslint-disable-line

  const patient = patients.find(p => p.id === id);

  const openEdit = () => {
    if (!patient) return;
    setEditForm({
      name: patient.name, nameAr: patient.nameAr, phone: patient.phone,
      email: patient.email || '', dateOfBirth: patient.dateOfBirth,
      gender: patient.gender, nationalId: patient.nationalId || '',
    });
    setEditOpen(true);
  };

  const saveEdit = () => {
    if (!patient || !editForm.name.trim() || !editForm.nameAr.trim() || !editForm.phone.trim()) {
      toast.error(isAr ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    updatePatient(patient.id, {
      name: editForm.name.trim(), nameAr: editForm.nameAr.trim(),
      phone: editForm.phone.trim(), email: editForm.email.trim() || undefined,
      dateOfBirth: editForm.dateOfBirth, gender: editForm.gender,
      nationalId: editForm.nationalId.trim() || undefined,
    });
    setEditOpen(false);
    toast.success(isAr ? 'تم تحديث بيانات المريض' : 'Patient updated successfully');
  };

  const confirmDelete = () => {
    if (!patient) return;
    deletePatient(patient.id);
    toast.success(isAr ? 'تم حذف المريض' : 'Patient deleted successfully');
    navigate('/patients');
  };

  if (!patient) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{isAr ? 'المريض غير موجود' : 'Patient not found'}</p>
        <Button variant="link" onClick={() => navigate('/patients')}>{isAr ? 'العودة' : 'Go back'}</Button>
      </div>
    );
  }

  // ─── Derived data
  const patientAppointments = appointments
    .filter(a => a.patientId === id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  const patientVisits = visits
    .filter(v => v.patientId === id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const patientInvoices = invoices
    .filter(inv => inv.patientId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const getName       = (userId: string) => { const u = users.find(x => x.id === userId); return isAr ? u?.nameAr : u?.name; };
  const getSpecialty  = (specId: string) => { const s = specialties.find(x => x.id === specId); return isAr ? s?.nameAr : s?.name; };
  const getServiceName = (svcId: string) => { const s = services.find(x => x.id === svcId); return isAr ? s?.nameAr : s?.name; };
  const getAge = (dob: string) => Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000));

  const totalPaid        = patientInvoices.reduce((s, inv) => s + inv.paidAmount, 0);
  const totalOutstanding = patientInvoices.reduce((s, inv) => s + (inv.totalAmount - inv.paidAmount), 0);

  // Loyalty helpers
  const loyaltyCfg  = getClinicLoyaltyConfig(clinicId);
  const tier        = getLoyaltyTier(loyaltyBalance);
  const pointsEgp   = calcPointsValue(loyaltyBalance, clinicId);
  const tierProgress = Math.min(100, Math.round((loyaltyBalance / tier.nextAt) * 100));

  // ─── Bonus points submit
  const handleBonus = () => {
    const pts = parseInt(bonusForm.points);
    if (!pts || pts <= 0) { toast.error(isAr ? 'أدخل عدد النقاط' : 'Enter points amount'); return; }
    if (!bonusForm.reason.trim()) { toast.error(isAr ? 'أدخل السبب' : 'Enter a reason'); return; }
    addBonusPoints(patient.id, clinicId, pts, bonusForm.reason, bonusForm.reasonAr || bonusForm.reason);
    toast.success(isAr ? `تم إضافة ${pts} نقطة` : `Added ${pts} bonus points`);
    setBonusOpen(false);
    setBonusForm({ points: '', reason: '', reasonAr: '' });
    refreshLoyalty();
  };

  // ─── Lab order WhatsApp
  const handleLabWhatsApp = (order: LabOrder) => {
    const msg  = generateWhatsAppMessage(order, isAr ? patient.nameAr : patient.name, (isAr ? clinic?.nameAr : clinic?.name) || 'Clinic');
    const phone = order.labPhone.replace(/\D/g, '');
    window.open(`https://wa.me/2${phone}?text=${msg}`, '_blank');
    if (order.status === 'draft') { updateLabOrderStatus(order.id, 'sent'); refreshLabs(); }
  };

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/patients')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">
            {isAr ? patient.nameAr : patient.name}
          </h1>
          <p className="text-muted-foreground text-sm">{isAr ? 'ملف المريض' : 'Patient Profile'}</p>
        </div>
        <Button size="sm" onClick={() => setBookingOpen(true)} className="gap-1.5" data-testid="button-book-appointment">
          <CalendarPlus className="h-4 w-4" />
          {isAr ? 'حجز موعد' : 'Book Appointment'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" data-testid="button-patient-actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setQrOpen(true)}>
              <QrCode className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {isAr ? 'QR Code المريض' : 'Patient QR Code'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setBonusOpen(true)}>
              <Gift className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {isAr ? 'إضافة نقاط' : 'Add Bonus Points'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={openEdit} data-testid="menu-item-edit-patient">
              <Pencil className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {isAr ? 'تعديل' : 'Edit'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteOpen(true)} className="text-destructive" data-testid="menu-item-delete-patient">
              <Trash2 className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {isAr ? 'حذف' : 'Delete'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Info Cards ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Age / Gender */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isAr ? 'العمر / الجنس' : 'Age / Gender'}</p>
                <p className="font-semibold text-foreground">
                  {getAge(patient.dateOfBirth)} {isAr ? 'سنة' : 'yrs'} · {patient.gender === 'male' ? t('patients.male') : t('patients.female')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Phone */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-chart-1/10 flex items-center justify-center">
                <Phone className="h-5 w-5 text-chart-1" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('patients.phone')}</p>
                <p className="font-semibold text-foreground">{patient.phone}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Total Visits */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-chart-2/10 flex items-center justify-center">
                <Stethoscope className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي الزيارات' : 'Total Visits'}</p>
                <p className="font-semibold text-foreground">{patientVisits.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loyalty Balance Card */}
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-lg">
                {tier.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{isAr ? 'نقاط الولاء' : 'Loyalty Points'}</p>
                <p className={`font-bold text-lg ${tier.color}`}>
                  {loyaltyBalance.toLocaleString()} {isAr ? 'نقطة' : 'pts'}
                </p>
                <p className="text-xs text-muted-foreground">
                  ≈ {pointsEgp.toFixed(1)} ج.م · {isAr ? tier.labelAr : tier.label}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Paid / Outstanding ──────────────────────────────────────────────── */}
      {(totalPaid > 0 || totalOutstanding > 0) && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-chart-2/10 flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-chart-2" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{isAr ? 'إجمالي المدفوع' : 'Total Paid'}</p>
                  <p className="font-semibold text-chart-2">{totalPaid.toLocaleString()} ج.م</p>
                </div>
              </div>
            </CardContent>
          </Card>
          {totalOutstanding > 0 && (
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                    <DollarSign className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{isAr ? 'متبقي' : 'Outstanding'}</p>
                    <p className="font-semibold text-destructive">{totalOutstanding.toLocaleString()} ج.م</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="appointments">
        <TabsList className="w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="appointments" className="gap-1.5 shrink-0">
            <Calendar className="h-4 w-4" />
            {isAr ? 'المواعيد' : 'Appointments'} ({patientAppointments.length})
          </TabsTrigger>
          <TabsTrigger value="visits" className="gap-1.5 shrink-0">
            <Stethoscope className="h-4 w-4" />
            {isAr ? 'الزيارات' : 'Visits'} ({patientVisits.length})
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 shrink-0">
            <FileText className="h-4 w-4" />
            {isAr ? 'الفواتير' : 'Invoices'} ({patientInvoices.length})
          </TabsTrigger>
          <TabsTrigger value="loyalty" className="gap-1.5 shrink-0">
            <Award className="h-4 w-4" />
            {isAr ? 'النقاط' : 'Loyalty'}
            {loyaltyBalance > 0 && (
              <span className="ms-1 bg-amber-500 text-white text-[10px] rounded-full px-1.5 py-px leading-none">
                {loyaltyBalance.toLocaleString()}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="lab-orders" className="gap-1.5 shrink-0">
            <FlaskConical className="h-4 w-4" />
            {isAr ? 'المعامل' : 'Lab Orders'}
            {labOrders.filter(o => !['delivered','cancelled'].includes(o.status)).length > 0 && (
              <span className="ms-1 bg-primary text-primary-foreground text-[10px] rounded-full px-1.5 py-px leading-none">
                {labOrders.filter(o => !['delivered','cancelled'].includes(o.status)).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="medical-notes" className="gap-1.5 shrink-0">
            <ClipboardList className="h-4 w-4" />
            {isAr ? 'السجلات الطبية' : 'Medical Notes'}
          </TabsTrigger>
          <TabsTrigger value="vital-signs" className="gap-1.5 shrink-0">
            <Activity className="h-4 w-4" />
            {isAr ? 'العلامات الحيوية' : 'Vital Signs'}
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5 shrink-0">
            <History className="h-4 w-4" />
            {isAr ? 'السجل الزمني' : 'Timeline'}
          </TabsTrigger>
          <TabsTrigger value="prescriptions" className="gap-1.5 shrink-0">
            <Pill className="h-4 w-4" />
            {isAr ? 'الوصفات' : 'Prescriptions'}
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5 shrink-0">
            <FolderOpen className="h-4 w-4" />
            {isAr ? 'المستندات الطبية' : 'Documents'}
          </TabsTrigger>
          <TabsTrigger value="health-timeline" className="gap-1.5 shrink-0">
            <TrendingUp className="h-4 w-4" />
            {isAr ? 'الخط الزمني الصحي' : 'Health Timeline'}
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5 shrink-0">
            <MessageSquare className="h-4 w-4" />
            {isAr ? 'التقييمات' : 'Feedback'}
          </TabsTrigger>
          <TabsTrigger value="body-map" className="gap-1.5 shrink-0">
            <Activity className="h-4 w-4" />
            {isAr ? 'خريطة الجسم' : 'Body Map'}
          </TabsTrigger>
          <TabsTrigger value="specialty-forms" className="gap-1.5 shrink-0">
            <ClipboardList className="h-4 w-4" />
            {isAr ? 'نماذج تخصصية' : 'Specialty Forms'}
          </TabsTrigger>
          <TabsTrigger value="enhanced-docs" className="gap-1.5 shrink-0">
            <FolderOpen className="h-4 w-4" />
            {isAr ? 'ملفات طبية' : 'Media Files'}
          </TabsTrigger>
        </TabsList>

        {/* ── Appointments Tab ─────────────────────────────────────────────── */}
        <TabsContent value="appointments">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead>{isAr ? 'الوقت' : 'Time'}</TableHead>
                    <TableHead>{isAr ? 'الطبيب' : 'Doctor'}</TableHead>
                    <TableHead>{isAr ? 'التخصص' : 'Specialty'}</TableHead>
                    <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patientAppointments.map(apt => (
                    <TableRow key={apt.id}>
                      <TableCell>{formatDate(apt.date, language)}</TableCell>
                      <TableCell className="flex items-center gap-1.5"><Clock className="h-3 w-3 text-muted-foreground" />{apt.time}</TableCell>
                      <TableCell>{getName(apt.doctorId) || '—'}</TableCell>
                      <TableCell>{getSpecialty(apt.specialtyId) || '—'}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[apt.status] || ''} variant="secondary">
                          {isAr ? statusLabels[apt.status]?.ar : statusLabels[apt.status]?.en || apt.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {patientAppointments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {isAr ? 'لا توجد مواعيد' : 'No appointments'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Visits Tab ───────────────────────────────────────────────────── */}
        <TabsContent value="visits">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{isAr ? 'التاريخ' : 'Date'}</TableHead>
                    <TableHead>{isAr ? 'الطبيب' : 'Doctor'}</TableHead>
                    <TableHead>{isAr ? 'التخصص' : 'Specialty'}</TableHead>
                    <TableHead>{isAr ? 'الحالة' : 'Status'}</TableHead>
                    <TableHead>{isAr ? 'ملاحظات' : 'Notes'}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patientVisits.map(visit => (
                    <TableRow key={visit.id}>
                      <TableCell>{formatDate(visit.date, language)}</TableCell>
                      <TableCell>{getName(visit.doctorId) || '—'}</TableCell>
                      <TableCell>{getSpecialty(visit.specialtyId) || '—'}</TableCell>
                      <TableCell>
                        <Badge className={statusColors[visit.status] || ''} variant="secondary">
                          {isAr ? statusLabels[visit.status]?.ar : statusLabels[visit.status]?.en || visit.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                        {visit.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {patientVisits.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {isAr ? 'لا توجد زيارات' : 'No visits'}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Invoices Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="invoices">
          <div className="space-y-4">
            {patientInvoices.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  {isAr ? 'لا توجد فواتير' : 'No invoices'}
                </CardContent>
              </Card>
            ) : (
              patientInvoices.map(inv => {
                const visit = patientVisits.find(v => v.id === inv.visitId);
                const items = invoiceItems.filter(i => i.invoiceId === inv.id);
                return (
                  <Card key={inv.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          {inv.id}
                        </CardTitle>
                        <Badge className={statusColors[inv.status] || ''} variant="secondary">
                          {isAr ? statusLabels[inv.status]?.ar : statusLabels[inv.status]?.en || inv.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                        <span>{isAr ? 'التاريخ' : 'Date'}: {visit ? formatDate(visit.date, language) : '—'}</span>
                        <span>{isAr ? 'الطبيب' : 'Doctor'}: {visit ? getName(visit.doctorId) : '—'}</span>
                      </div>
                      {items.length > 0 && (
                        <>
                          <Separator />
                          <div className="space-y-1">
                            {items.map(item => (
                              <div key={item.id} className="flex justify-between text-sm">
                                <span className="text-foreground">{getServiceName(item.serviceId) || item.serviceId}</span>
                                <span className="text-muted-foreground">
                                  {item.quantity} × {item.unitPrice} = <span className="text-foreground font-medium">{item.totalPrice} ج.م</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      <Separator />
                      <div className="flex justify-between text-sm font-medium">
                        <span>{isAr ? 'الإجمالي' : 'Total'}</span>
                        <span>{inv.totalAmount} ج.م</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{isAr ? 'المدفوع' : 'Paid'}</span>
                        <span className="text-chart-2">{inv.paidAmount} ج.م</span>
                      </div>
                      {inv.totalAmount - inv.paidAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{isAr ? 'المتبقي' : 'Remaining'}</span>
                          <span className="text-destructive">{inv.totalAmount - inv.paidAmount} ج.م</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* ── Loyalty Tab ──────────────────────────────────────────────────── */}
        <TabsContent value="loyalty">
          <div className="space-y-5">

            {/* Tier + Progress Card */}
            <Card className="border-amber-200 overflow-hidden">
              <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 to-orange-500" />
              <CardContent className="pt-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  {/* Tier badge */}
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center text-3xl border border-amber-200">
                      {tier.icon}
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">{isAr ? 'المستوى الحالي' : 'Current Tier'}</p>
                      <p className={`text-xl font-bold ${tier.color}`}>{isAr ? tier.labelAr : tier.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {loyaltyBalance.toLocaleString()} {isAr ? 'نقطة' : 'points'}
                      </p>
                    </div>
                  </div>

                  <div className="sm:flex-1 space-y-2">
                    {/* Points value */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{isAr ? 'قيمة النقاط' : 'Points Value'}</span>
                      <span className="font-semibold text-foreground">{pointsEgp.toFixed(2)} ج.م</span>
                    </div>
                    {/* Progress to next tier */}
                    {loyaltyBalance < 10000 && (
                      <>
                        <Progress value={tierProgress} className="h-2" />
                        <p className="text-xs text-muted-foreground">
                          {isAr
                            ? `${(tier.nextAt - loyaltyBalance).toLocaleString()} نقطة للمستوى التالي`
                            : `${(tier.nextAt - loyaltyBalance).toLocaleString()} pts to next tier`}
                        </p>
                      </>
                    )}
                    {/* Config info */}
                    {loyaltyCfg.isEnabled && (
                      <p className="text-xs text-muted-foreground">
                        {isAr
                          ? `اكسب نقطة لكل ${Math.round(1 / loyaltyCfg.pointsPerEgp)} ج.م · استبدل كل 100 نقطة بـ ${(loyaltyCfg.egpPerPoint * 100).toFixed(0)} ج.م`
                          : `Earn 1 pt per ${Math.round(1 / loyaltyCfg.pointsPerEgp)} EGP · 100 pts = ${(loyaltyCfg.egpPerPoint * 100).toFixed(0)} EGP`}
                      </p>
                    )}
                  </div>

                  {/* Add bonus button */}
                  <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setBonusOpen(true)}>
                    <Gift className="h-4 w-4 text-amber-500" />
                    {isAr ? 'إضافة نقاط' : 'Add Points'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Transactions list */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {isAr ? 'سجل المعاملات' : 'Transaction History'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loyaltyTxs.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Award className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{isAr ? 'لا توجد معاملات بعد' : 'No transactions yet'}</p>
                    <p className="text-xs mt-1">{isAr ? 'ستظهر النقاط هنا بعد أول دفعة' : 'Points will appear here after first payment'}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{isAr ? 'التاريخ' : 'Date'}</TableHead>
                        <TableHead>{isAr ? 'النوع' : 'Type'}</TableHead>
                        <TableHead>{isAr ? 'الوصف' : 'Description'}</TableHead>
                        <TableHead className="text-end">{isAr ? 'النقاط' : 'Points'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loyaltyTxs.map(tx => {
                        const isPositive = tx.points > 0;
                        return (
                          <TableRow key={tx.id}>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {new Date(tx.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                {tx.type === 'earn'   && <TrendingUp   className="h-3.5 w-3.5 text-green-600" />}
                                {tx.type === 'redeem' && <TrendingDown  className="h-3.5 w-3.5 text-red-500" />}
                                {tx.type === 'bonus'  && <Gift          className="h-3.5 w-3.5 text-amber-500" />}
                                {tx.type === 'expire' && <X             className="h-3.5 w-3.5 text-muted-foreground" />}
                                <span className="text-xs">
                                  {tx.type === 'earn'   ? (isAr ? 'مكسوب' : 'Earned')   : ''}
                                  {tx.type === 'redeem' ? (isAr ? 'مستبدل' : 'Redeemed') : ''}
                                  {tx.type === 'bonus'  ? (isAr ? 'مكافأة' : 'Bonus')    : ''}
                                  {tx.type === 'expire' ? (isAr ? 'منتهي' : 'Expired')   : ''}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {isAr ? tx.descriptionAr : tx.description}
                            </TableCell>
                            <TableCell className={`text-end font-semibold ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                              {isPositive ? '+' : ''}{tx.points.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Lab Orders Tab ───────────────────────────────────────────────── */}
        <TabsContent value="lab-orders">
          <div className="space-y-4">
            {labOrders.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-muted-foreground">
                  <FlaskConical className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">{isAr ? 'لا توجد طلبات معمل لهذا المريض' : 'No lab orders for this patient'}</p>
                  <p className="text-xs mt-1">{isAr ? 'يمكن إنشاء الطلبات من صفحة المعامل' : 'Create orders from the Lab Orders page'}</p>
                </CardContent>
              </Card>
            ) : (
              labOrders.map(order => {
                const sc = LAB_STATUS[order.status];
                const isActive = !['delivered', 'cancelled'].includes(order.status);
                const isOverdue = isActive && new Date(order.dueDate) < new Date();
                return (
                  <Card key={order.id} className={isOverdue ? 'border-red-200' : ''}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FlaskConical className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{order.labName}</p>
                            <p className="text-xs text-muted-foreground">{order.labPhone}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {isAr ? 'موعد الاستلام:' : 'Due:'}{' '}
                              <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                                {formatDate(order.dueDate, language)}
                                {isOverdue && ` ⚠ ${isAr ? 'متأخر' : 'Overdue'}`}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`${sc.color} text-xs`} variant="secondary">
                            {isAr ? sc.ar : sc.en}
                          </Badge>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600" onClick={() => handleLabWhatsApp(order)}>
                            <MessageSquare className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <Separator className="my-3" />

                      {/* Items */}
                      <div className="space-y-1.5">
                        {order.items.map(item => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <div>
                              <span className="font-medium">{isAr ? item.nameAr : item.name}</span>
                              {item.shade && <span className="text-muted-foreground text-xs ms-1.5">Shade: {item.shade}</span>}
                              {item.toothNumbers && item.toothNumbers.length > 0 && (
                                <span className="text-muted-foreground text-xs ms-1.5">[{item.toothNumbers.join(',')}]</span>
                              )}
                            </div>
                            <span className="text-muted-foreground">{item.quantity} × {item.unitPrice} ج.م</span>
                          </div>
                        ))}
                      </div>

                      {/* Footer totals */}
                      <div className="mt-3 pt-3 border-t flex justify-between items-center">
                        <div className="text-sm">
                          <span className="text-muted-foreground">{isAr ? 'الإجمالي:' : 'Total:'}</span>
                          <span className="font-semibold ms-1">{order.totalPrice.toLocaleString()} ج.م</span>
                          {order.paidAmount > 0 && (
                            <span className="text-xs text-muted-foreground ms-2">
                              ({isAr ? 'مدفوع:' : 'Paid:'} {order.paidAmount.toLocaleString()} ج.م)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* ── Medical Notes Tab ────────────────────────────────────────────── */}
        <TabsContent value="medical-notes">
          <MedicalNotesTab patientId={id!} />
        </TabsContent>

        {/* ── Vital Signs Tab ──────────────────────────────────────────────── */}
        <TabsContent value="vital-signs">
          <VitalSignsTab patientId={id!} />
        </TabsContent>

        {/* ── Timeline Tab ─────────────────────────────────────────────────── */}
        <TabsContent value="timeline">
          <VisitTimelineTab patientId={id!} />
        </TabsContent>

        {/* ── Prescriptions Tab ────────────────────────────────────────────── */}
        <TabsContent value="prescriptions">
          <PrescriptionsTab patientId={id!} />
        </TabsContent>

        {/* ── Documents Tab ────────────────────────────────────────────────── */}
        <TabsContent value="documents">
          <MedicalDocumentsTab patientId={id!} />
        </TabsContent>

        {/* ── Health Timeline Tab (B2) ──────────────────────────────────────── */}
        <TabsContent value="health-timeline">
          <HealthTimelineTab
            patientId={id!}
            appointments={patientAppointments}
            visits={patientVisits}
            invoices={patientInvoices}
            isAr={isAr}
          />
        </TabsContent>

        {/* ── Feedback Tab (F5) ─────────────────────────────────────────────── */}
        <TabsContent value="feedback">
          <PatientFeedbackTab patientId={id!} patientName={isAr ? patient.nameAr : patient.name} clinicId={user?.clinicId || ''} isAr={isAr} />
        </TabsContent>

        {/* ── Body Map Tab (F4) ─────────────────────────────────────────────── */}
        <TabsContent value="body-map">
          <BodyMapTab patientId={id!} />
        </TabsContent>

        {/* ── Specialty Forms Tab (F6) ──────────────────────────────────────── */}
        <TabsContent value="specialty-forms">
          <SpecialtyFormsTab patientId={id!} />
        </TabsContent>

        {/* ── Enhanced Documents Tab (F7) ───────────────────────────────────── */}
        <TabsContent value="enhanced-docs">
          <EnhancedDocumentsTab patientId={id!} />
        </TabsContent>

      </Tabs>

      {/* ── Edit Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isAr ? 'تعديل بيانات المريض' : 'Edit Patient'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{isAr ? 'الاسم (إنجليزي)' : 'Name (English)'} *</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label>{isAr ? 'الاسم (عربي)' : 'Name (Arabic)'} *</Label>
              <Input dir="rtl" value={editForm.nameAr} onChange={e => setEditForm(f => ({ ...f, nameAr: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t('patients.phone')} *</Label>
                <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{isAr ? 'البريد الإلكتروني' : 'Email'}</Label>
                <Input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{isAr ? 'تاريخ الميلاد' : 'Date of Birth'}</Label>
                <Input type="date" value={editForm.dateOfBirth} onChange={e => setEditForm(f => ({ ...f, dateOfBirth: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>{isAr ? 'الجنس' : 'Gender'}</Label>
                <Select value={editForm.gender} onValueChange={v => setEditForm(f => ({ ...f, gender: v as 'male' | 'female' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t('patients.male')}</SelectItem>
                    <SelectItem value="female">{t('patients.female')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{isAr ? 'رقم الهوية' : 'National ID'}</Label>
              <Input value={editForm.nationalId} onChange={e => setEditForm(f => ({ ...f, nationalId: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={saveEdit}>{isAr ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── QR Code Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isAr ? 'QR Code المريض' : 'Patient QR Code'}</DialogTitle>
          </DialogHeader>
          {qrOpen && <PatientQRCard patient={patient} clinic={clinic} />}
        </DialogContent>
      </Dialog>

      {/* ── Bonus Points Dialog ──────────────────────────────────────────────── */}
      <Dialog open={bonusOpen} onOpenChange={setBonusOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-amber-500" />
              {isAr ? 'إضافة نقاط مكافأة' : 'Add Bonus Points'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 rounded-lg p-3 text-sm flex justify-between">
              <span className="text-muted-foreground">{isAr ? 'الرصيد الحالي' : 'Current Balance'}</span>
              <span className="font-bold text-amber-600">{loyaltyBalance.toLocaleString()} {isAr ? 'نقطة' : 'pts'}</span>
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? 'عدد النقاط *' : 'Points to Add *'}</Label>
              <Input
                type="number" min="1" placeholder="100"
                value={bonusForm.points}
                onChange={e => setBonusForm(f => ({ ...f, points: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? 'السبب (إنجليزي) *' : 'Reason (English) *'}</Label>
              <Input
                placeholder={isAr ? 'مثال: Birthday bonus' : 'e.g. Birthday bonus'}
                value={bonusForm.reason}
                onChange={e => setBonusForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{isAr ? 'السبب (عربي)' : 'Reason (Arabic)'}</Label>
              <Input
                dir="rtl"
                placeholder={isAr ? 'مثال: مكافأة عيد الميلاد' : 'e.g. مكافأة عيد الميلاد'}
                value={bonusForm.reasonAr}
                onChange={e => setBonusForm(f => ({ ...f, reasonAr: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBonusOpen(false)}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleBonus} className="bg-amber-500 hover:bg-amber-600 text-white">
              <Gift className="h-4 w-4 me-1.5" />
              {isAr ? 'إضافة النقاط' : 'Add Points'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Book Appointment Dialog ──────────────────────────────────────────── */}
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isAr ? 'حجز موعد' : 'Book Appointment'}</DialogTitle>
          </DialogHeader>
          {bookingOpen && (
            <BookingWizard
              patientId={id}
              onComplete={() => {
                setBookingOpen(false);
                toast.success(isAr ? 'تم حجز الموعد بنجاح' : 'Appointment booked successfully');
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation ──────────────────────────────────────────────── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAr ? 'حذف المريض' : 'Delete Patient'}</AlertDialogTitle>
            <AlertDialogDescription>
              {isAr
                ? `هل أنت متأكد من حذف "${patient.nameAr}"؟ لا يمكن التراجع عن هذا الإجراء.`
                : `Are you sure you want to delete "${patient.name}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{isAr ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isAr ? 'حذف' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default PatientProfile;
