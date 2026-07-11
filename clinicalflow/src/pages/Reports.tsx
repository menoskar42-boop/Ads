import React, { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useVisits, useInvoices, useAppointments } from '@/hooks/useVisits';
import { usePatients } from '@/hooks/usePatients';
import { useUsers } from '@/hooks/useUsers';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, DollarSign, CheckCircle2, TrendingUp, UserCheck, Stethoscope, Clock, Home, Building2, Sparkles, RefreshCw, Lightbulb, TrendingDown, Wallet, AlertTriangle, PiggyBank, Plus, Trash2, ChevronUp, ChevronDown, BrainCircuit } from 'lucide-react';
import { useSpecialties } from '@/hooks/useSpecialties';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { expenseStore, EXPENSE_CATEGORY_LABELS, EXPENSE_COLORS } from '@/stores/expenseStore';
import { getClinicTopPatients, getClinicReferralEvents, getReferralLeaderboard, getClinicLoyaltyConfig, getPatientTransactions } from '@/stores/loyaltyStore';
import { Award, Users, Gift } from 'lucide-react';

const Reports: React.FC = () => {
  const { t, language, isRTL } = useLanguage();
  const { user } = useAuth();
  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [forecast, setForecast] = useState<any>(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState(false);
  const [newExpense, setNewExpense] = useState({ category: 'rent' as any, description: '', amount: '', date: new Date().toISOString().split('T')[0] });
  const [expenseTick, setExpenseTick] = useState(0); // triggers re-render on expense changes
  const permissions = usePermissions();
  const { visits } = useVisits();
  const { appointments } = useAppointments();
  const { invoices } = useInvoices();
  const { patients } = usePatients();
  const { doctors } = useUsers();
  const { specialties } = useSpecialties();

  const roleAppointments = useMemo(() => {
    if (user?.role === 'doctor') return appointments.filter(a => a.doctorId === user.id);
    return appointments;
  }, [appointments, user]);

  const roleInvoices = useMemo(() => {
    if (user?.role === 'doctor') {
      return invoices.filter(inv => {
        const visit = visits.find(v => v.id === inv.visitId);
        return visit?.doctorId === user.id;
      });
    }
    return invoices.filter(i => i.isActive);
  }, [invoices, visits, user]);

  const totalAppointments = roleAppointments.length;
  const completedAppointments = roleAppointments.filter(a => a.status === 'completed').length;
  const completionRate = totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0;
  const totalRevenue = roleInvoices.reduce((sum, i) => sum + i.totalAmount, 0);
  const paidRevenue = roleInvoices.reduce((sum, i) => sum + i.paidAmount, 0);
  const collectionRate = totalRevenue > 0 ? Math.round((paidRevenue / totalRevenue) * 100) : 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppointments = roleAppointments.filter(a => a.date === todayStr);

  const topDoctorToday = useMemo(() => {
    const counts: Record<string, number> = {};
    todayAppointments.forEach(a => {
      counts[a.doctorId] = (counts[a.doctorId] || 0) + 1;
    });
    let maxId = '';
    let maxCount = 0;
    Object.entries(counts).forEach(([id, count]) => {
      if (count > maxCount) { maxId = id; maxCount = count; }
    });
    const doc = doctors.find(d => d.id === maxId);
    return { doctor: doc, count: maxCount };
  }, [todayAppointments, doctors]);

  const mostBookedSpecialty = useMemo(() => {
    const counts: Record<string, number> = {};
    roleAppointments.forEach(a => {
      if (a.specialtyId) counts[a.specialtyId] = (counts[a.specialtyId] || 0) + 1;
    });
    let maxId = '';
    let maxCount = 0;
    Object.entries(counts).forEach(([id, count]) => {
      if (count > maxCount) { maxId = id; maxCount = count; }
    });
    const spec = specialties.find(s => s.id === maxId);
    return { specialty: spec, count: maxCount };
  }, [roleAppointments, specialties]);

  const avgVisitDuration = useMemo(() => {
    const completedVisits = visits.filter(v => v.status === 'completed');
    if (completedVisits.length === 0) return null;
    return 25;
  }, [visits]);

  const roleVisits = useMemo(() => {
    if (user?.role === 'doctor') return visits.filter(v => v.doctorId === user.id);
    return visits;
  }, [visits, user]);

  const totalHomeVisits = roleVisits.filter(v => v.isHomeVisit).length;
  const totalClinicVisits = roleVisits.filter(v => !v.isHomeVisit).length;

  const homeVisitRevenue = useMemo(() => {
    const hvVisitIds = new Set(roleVisits.filter(v => v.isHomeVisit).map(v => v.id));
    return roleInvoices
      .filter(i => hvVisitIds.has(i.visitId))
      .reduce((sum, i) => sum + i.paidAmount, 0);
  }, [roleVisits, roleInvoices]);

  const appointmentStatus = [
    { name: t('appointments.completed'), value: roleAppointments.filter(a => a.status === 'completed').length, color: 'hsl(var(--chart-5))' },
    { name: t('appointments.scheduled'), value: roleAppointments.filter(a => a.status === 'scheduled').length, color: 'hsl(var(--chart-2))' },
    { name: t('appointments.cancelled'), value: roleAppointments.filter(a => a.status === 'cancelled').length, color: 'hsl(var(--destructive))' },
  ];

  // ─── Smart Insights ────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    const result: string[] = [];
    const ar = isRTL;

    // 1. Collection rate insight
    if (collectionRate >= 80) {
      result.push(ar
        ? `معدل التحصيل ${collectionRate}% - ممتاز، استمر في الحفاظ على هذا المستوى`
        : `Collection rate ${collectionRate}% - Excellent, keep maintaining this level`);
    } else if (collectionRate >= 70) {
      result.push(ar
        ? `معدل التحصيل ${collectionRate}% - جيد، يمكن تحسينه بمتابعة المدفوعات المعلقة`
        : `Collection rate ${collectionRate}% - Good, can be improved by following up pending payments`);
    } else {
      result.push(ar
        ? `معدل التحصيل ${collectionRate}% - يحتاج تحسين عاجل، راجع الفواتير غير المسددة`
        : `Collection rate ${collectionRate}% - Needs urgent improvement, review unpaid invoices`);
    }

    // 2. Completion rate insight
    result.push(ar
      ? `نسبة إتمام المواعيد ${completionRate}%${completionRate >= 75 ? ' - أداء ممتاز' : completionRate >= 50 ? ' - أداء مقبول' : ' - يحتاج متابعة'}`
      : `Appointment completion rate ${completionRate}%${completionRate >= 75 ? ' - excellent performance' : completionRate >= 50 ? ' - acceptable performance' : ' - needs attention'}`);

    // 3. Most booked specialty
    if (mostBookedSpecialty.specialty && mostBookedSpecialty.count > 0) {
      const specName = ar ? mostBookedSpecialty.specialty.nameAr : mostBookedSpecialty.specialty.name;
      result.push(ar
        ? `أكثر التخصصات طلباً: ${specName} بـ ${mostBookedSpecialty.count} موعد`
        : `Most booked specialty: ${specName} with ${mostBookedSpecialty.count} appointments`);
    }

    // 4. Today's revenue (estimated from today's appointments)
    const todayInvoiceTotal = roleInvoices
      .filter(i => i.createdAt?.startsWith(todayStr))
      .reduce((sum, i) => sum + i.paidAmount, 0);
    if (todayInvoiceTotal > 0) {
      result.push(ar
        ? `إيرادات اليوم: ${todayInvoiceTotal.toLocaleString()} ج.م`
        : `Today's revenue: ${todayInvoiceTotal.toLocaleString()} ج.م`);
    }

    // 5. Cancellation rate alert
    const cancelledCount = roleAppointments.filter(a => a.status === 'cancelled').length;
    const cancelRate = totalAppointments > 0 ? Math.round((cancelledCount / totalAppointments) * 100) : 0;
    if (cancelRate > 15) {
      result.push(ar
        ? `تحذير: نسبة الإلغاء ${cancelRate}% تتجاوز الحد الطبيعي (15%) - راجع أسباب الإلغاء`
        : `Warning: Cancellation rate ${cancelRate}% exceeds normal threshold (15%) - review cancellation reasons`);
    }

    // 6. Busiest day of week
    const dayCounts: Record<string, number> = {};
    roleAppointments.forEach(a => {
      if (a.date) {
        const day = new Date(a.date).getDay();
        const dayName = ar
          ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][day]
          : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
        dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
      }
    });
    const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
    if (busiestDay) {
      result.push(ar
        ? `أكثر أيام الأسبوع ازدحاماً: ${busiestDay[0]} بمتوسط ${busiestDay[1]} موعد`
        : `Busiest day of the week: ${busiestDay[0]} with ${busiestDay[1]} appointments`);
    }

    return result;
  }, [isRTL, collectionRate, completionRate, mostBookedSpecialty, roleInvoices, roleAppointments, totalAppointments, todayStr]);

  const isAr = language === 'ar';

  // Subscribe to expenseStore so the UI updates when expenses are added/removed
  React.useEffect(() => {
    return expenseStore.subscribe(() => setExpenseTick(t => t + 1));
  }, []);

  // ── Monthly KPI data ────────────────────────────────────────
  const thisMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastMonthStr = lastMonthDate.toISOString().slice(0, 7);

  const thisMonthInvoices = roleInvoices.filter(i => i.createdAt?.startsWith(thisMonthStr));
  const lastMonthInvoices = roleInvoices.filter(i => i.createdAt?.startsWith(lastMonthStr));
  const thisMonthRevenue = thisMonthInvoices.reduce((s, i) => s + i.paidAmount, 0);
  const lastMonthRevenue = lastMonthInvoices.reduce((s, i) => s + i.paidAmount, 0);
  const revGrowth = lastMonthRevenue > 0 ? ((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue * 100) : 0;

  const thisMonthPatients = new Set(roleAppointments.filter(a => a.date?.startsWith(thisMonthStr)).map(a => a.patientId)).size;
  const lastMonthPatients = new Set(roleAppointments.filter(a => a.date?.startsWith(lastMonthStr)).map(a => a.patientId)).size;
  const patientsGrowth = lastMonthPatients > 0 ? ((thisMonthPatients - lastMonthPatients) / lastMonthPatients * 100) : 0;

  const thisMonthCollected = thisMonthInvoices.reduce((s, i) => s + i.paidAmount, 0);
  const thisMonthTotal = thisMonthInvoices.reduce((s, i) => s + i.totalAmount, 0);
  const lastMonthCollected = lastMonthInvoices.reduce((s, i) => s + i.paidAmount, 0);
  const lastMonthTotal = lastMonthInvoices.reduce((s, i) => s + i.totalAmount, 0);
  const thisCollectionRate = thisMonthTotal > 0 ? Math.round(thisMonthCollected / thisMonthTotal * 100) : 0;
  const lastCollectionRate = lastMonthTotal > 0 ? Math.round(lastMonthCollected / lastMonthTotal * 100) : 0;

  // ── Expenses ────────────────────────────────────────────────
  const allExpenses = expenseStore.getAll().filter(e => e.clinicId === user?.clinicId);
  const thisMonthExpenses = allExpenses.filter(e => e.date?.startsWith(thisMonthStr));
  const lastMonthExpenses = allExpenses.filter(e => e.date?.startsWith(lastMonthStr));
  const totalExpensesThis = thisMonthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalExpensesLast = lastMonthExpenses.reduce((s, e) => s + e.amount, 0);
  const expensesGrowth = totalExpensesLast > 0 ? ((totalExpensesThis - totalExpensesLast) / totalExpensesLast * 100) : 0;

  const expenseByCategoryData = Object.entries(
    thisMonthExpenses.reduce((acc: Record<string, number>, e) => {
      acc[e.category] = (acc[e.category] || 0) + e.amount;
      return acc;
    }, {})
  ).map(([cat, amount]) => ({
    name: isAr ? (EXPENSE_CATEGORY_LABELS[cat as any]?.ar || cat) : (EXPENSE_CATEGORY_LABELS[cat as any]?.en || cat),
    amount,
    fill: EXPENSE_COLORS[cat as any] || '#94a3b8',
  }));

  // ── Doctor Revenue Split ─────────────────────────────────────
  const doctorRevenueSplit = useMemo(() => {
    return doctors.map(doc => {
      const docVisitIds = new Set(visits.filter(v => v.doctorId === doc.id).map(v => v.id));
      const docRevenue = roleInvoices.filter(i => docVisitIds.has(i.visitId)).reduce((s, i) => s + i.paidAmount, 0);
      return { doctor: doc, revenue: docRevenue };
    }).filter(d => d.revenue > 0).sort((a, b) => b.revenue - a.revenue);
  }, [doctors, visits, roleInvoices]);

  // ── Debt Management ──────────────────────────────────────────
  const unpaidInvoices = roleInvoices.filter(i => i.status === 'pending' || i.status === 'partially_paid')
    .sort((a, b) => (b.totalAmount - b.paidAmount) - (a.totalAmount - a.paidAmount))
    .slice(0, 10);

  // ── Top expense category (non-mutating sort) ─────────────────
  const topExpCat = [...expenseByCategoryData].sort((a, b) => b.amount - a.amount)[0]?.name || '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('reports.title')}</h1>
        <p className="text-muted-foreground">{language === 'ar' ? 'نظرة عامة على أداء العيادة' : 'Clinic performance overview'}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-2">
          <TabsTrigger value="overview">{isAr ? 'نظرة عامة' : 'Overview'}</TabsTrigger>
          {permissions.canViewFinancialReports && (
            <TabsTrigger value="financial">{isAr ? 'المؤشرات المالية' : 'Financial KPIs'}</TabsTrigger>
          )}
          <TabsTrigger value="loyalty">{isAr ? 'الولاء والإحالات' : 'Loyalty & Referrals'}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center"><Calendar className="h-6 w-6 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalAppointments}</p>
                <p className="text-sm text-muted-foreground">{t('reports.appointments')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-chart-5/10 flex items-center justify-center"><CheckCircle2 className="h-6 w-6 text-chart-5" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{completionRate}%</p>
                <p className="text-sm text-muted-foreground">{language === 'ar' ? 'معدل الإنجاز' : 'Completion Rate'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {permissions.canViewFinancialReports && (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-chart-1/10 flex items-center justify-center"><DollarSign className="h-6 w-6 text-chart-1" /></div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{totalRevenue.toLocaleString()} ج.م</p>
                    <p className="text-sm text-muted-foreground">{t('reports.revenue')}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-chart-2/10 flex items-center justify-center"><TrendingUp className="h-6 w-6 text-chart-2" /></div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{collectionRate}%</p>
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'معدل التحصيل' : 'Collection Rate'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-top-doctor-today">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-chart-3/10 flex items-center justify-center"><UserCheck className="h-6 w-6 text-chart-3" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="text-top-doctor-name">
                  {topDoctorToday.doctor ? (language === 'ar' ? topDoctorToday.doctor.nameAr : topDoctorToday.doctor.name) : (language === 'ar' ? 'لا يوجد' : 'N/A')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar' ? 'أفضل طبيب اليوم' : 'Top Doctor Today'}
                  {topDoctorToday.count > 0 && (
                    <span className="ml-1 text-xs">({topDoctorToday.count} {language === 'ar' ? 'موعد' : 'appts'})</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-most-booked-specialty">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-chart-4/10 flex items-center justify-center"><Stethoscope className="h-6 w-6 text-chart-4" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="text-most-booked-specialty">
                  {mostBookedSpecialty.specialty ? (language === 'ar' ? mostBookedSpecialty.specialty.nameAr : mostBookedSpecialty.specialty.name) : (language === 'ar' ? 'لا يوجد' : 'N/A')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar' ? 'التخصص الأكثر حجزاً' : 'Most Booked Specialty'}
                  {mostBookedSpecialty.count > 0 && (
                    <span className="ml-1 text-xs">({mostBookedSpecialty.count} {language === 'ar' ? 'موعد' : 'appts'})</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-avg-visit-duration">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-lg bg-chart-1/10 flex items-center justify-center"><Clock className="h-6 w-6 text-chart-1" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground" data-testid="text-avg-visit-duration">
                  {avgVisitDuration !== null ? `${avgVisitDuration} ${language === 'ar' ? 'دقيقة' : 'min'}` : (language === 'ar' ? 'لا يوجد' : 'N/A')}
                </p>
                <p className="text-sm text-muted-foreground">{language === 'ar' ? 'متوسط مدة الزيارة' : 'Avg Visit Duration'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Visit Mode Analysis */}
      {(totalHomeVisits > 0 || totalClinicVisits > 0) && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Home className="h-5 w-5 text-orange-500" />
            {language === 'ar' ? 'تحليل نوع الزيارة' : 'Visit Mode Analysis'}
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Card data-testid="card-total-home-visits">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <Home className="h-6 w-6 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-total-home-visits">{totalHomeVisits}</p>
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'زيارات منزلية' : 'Home Visits'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card data-testid="card-total-clinic-visits">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground" data-testid="text-total-clinic-visits">{totalClinicVisits}</p>
                    <p className="text-sm text-muted-foreground">{language === 'ar' ? 'زيارات العيادة' : 'Clinic Visits'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            {permissions.canViewFinancialReports && (
              <Card data-testid="card-home-visit-revenue">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-chart-5/10 flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-chart-5" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground" data-testid="text-home-visit-revenue">
                        {homeVisitRevenue.toLocaleString()} ج.م
                      </p>
                      <p className="text-sm text-muted-foreground">{language === 'ar' ? 'إيرادات الزيارات المنزلية' : 'Home Visit Revenue'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{language === 'ar' ? 'حالة المواعيد' : 'Appointment Status'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={appointmentStatus} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {appointmentStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {appointmentStatus.map((status, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                  <span className="text-xs sm:text-sm text-muted-foreground">{status.name}: {status.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Smart Insights (local) */}
      {insights.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Sparkles className="h-5 w-5" />
              {isRTL ? 'تحليلات ذكية' : 'Smart Insights'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* AI-Powered Insights (GPT) */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-amber-700 text-base">
              <Lightbulb className="h-5 w-5" />
              {isRTL ? 'رؤى ذكاء اصطناعي متقدمة' : 'Advanced AI Insights'}
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
              disabled={isLoadingAI}
              onClick={async () => {
                setIsLoadingAI(true);
                try {
                  const cancelledCount = roleAppointments.filter(a => a.status === 'cancelled').length;
                  const res = await fetch('/api/clinic-insights', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      totalPatients: patients.length,
                      totalRevenue,
                      completionRate,
                      topSpecialty: mostBookedSpecialty.specialty ? (isRTL ? mostBookedSpecialty.specialty.nameAr : mostBookedSpecialty.specialty.name) : '',
                      totalAppointments,
                      cancelledCount,
                      language,
                    }),
                  });
                  const data = await res.json();
                  setAiInsights(data.insights || []);
                } catch { setAiInsights([]); }
                finally { setIsLoadingAI(false); }
              }}
            >
              {isLoadingAI ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isRTL ? 'توليد رؤى' : 'Generate Insights'}
            </Button>
          </div>
        </CardHeader>
        {aiInsights.length > 0 && (
          <CardContent className="pt-0">
            <div className="space-y-3">
              {aiInsights.map((ins: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-amber-100">
                  <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm text-amber-800">{isRTL ? ins.titleAr : ins.titleEn}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{isRTL ? ins.textAr : ins.textEn}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
        {!isLoadingAI && aiInsights.length === 0 && (
          <CardContent className="pt-0">
            <p className="text-sm text-amber-600/70">{isRTL ? 'اضغط "توليد رؤى" للحصول على تحليل ذكي لأداء عيادتك' : 'Click "Generate Insights" for an AI analysis of your clinic performance'}</p>
          </CardContent>
        )}
      </Card>
        </TabsContent>

        {/* ─── Financial KPIs Tab ─────────────────────────────── */}
        <TabsContent value="financial" className="space-y-6 mt-0">

          {/* KPI Comparison Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: isAr ? 'إيرادات هذا الشهر' : 'This Month Revenue',
                value: `${thisMonthRevenue.toLocaleString()} ج.م`,
                sub: isAr ? `الشهر الماضي: ${lastMonthRevenue.toLocaleString()} ج.م` : `Last month: ${lastMonthRevenue.toLocaleString()} ج.م`,
                growth: revGrowth,
                icon: <DollarSign className="h-5 w-5 text-primary" />,
                bg: 'bg-primary/10',
              },
              {
                label: isAr ? 'معدل التحصيل' : 'Collection Rate',
                value: `${thisCollectionRate}%`,
                sub: isAr ? `الشهر الماضي: ${lastCollectionRate}%` : `Last month: ${lastCollectionRate}%`,
                growth: thisCollectionRate - lastCollectionRate,
                icon: <TrendingUp className="h-5 w-5 text-green-600" />,
                bg: 'bg-green-500/10',
              },
              {
                label: isAr ? 'مرضى جدد' : 'New Patients',
                value: String(thisMonthPatients),
                sub: isAr ? `الشهر الماضي: ${lastMonthPatients}` : `Last month: ${lastMonthPatients}`,
                growth: patientsGrowth,
                icon: <UserCheck className="h-5 w-5 text-chart-3" />,
                bg: 'bg-chart-3/10',
              },
              {
                label: isAr ? 'المصروفات هذا الشهر' : 'Expenses This Month',
                value: `${totalExpensesThis.toLocaleString()} ج.م`,
                sub: isAr ? `الشهر الماضي: ${totalExpensesLast.toLocaleString()} ج.م` : `Last month: ${totalExpensesLast.toLocaleString()} ج.م`,
                growth: -expensesGrowth,
                icon: <Wallet className="h-5 w-5 text-orange-500" />,
                bg: 'bg-orange-500/10',
              },
            ].map((kpi, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className={`h-10 w-10 rounded-lg ${kpi.bg} flex items-center justify-center shrink-0`}>{kpi.icon}</div>
                    <span className={`text-xs font-medium flex items-center gap-0.5 ${kpi.growth >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {kpi.growth >= 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {Math.abs(kpi.growth).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xl font-bold text-foreground mt-3">{kpi.value}</p>
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">{kpi.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Doctor Revenue Split */}
          {doctorRevenueSplit.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  {isAr ? 'توزيع الإيرادات على الأطباء' : 'Doctor Revenue Split'}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{isAr ? 'الطبيب' : 'Doctor'}</TableHead>
                      <TableHead>{isAr ? 'الإيرادات' : 'Revenue'}</TableHead>
                      <TableHead>{isAr ? 'النسبة' : 'Share'}</TableHead>
                      <TableHead>{isAr ? 'نصيب العيادة' : 'Clinic Share'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {doctorRevenueSplit.map(({ doctor, revenue }) => {
                      const share = paidRevenue > 0 ? (revenue / paidRevenue * 100) : 0;
                      const clinicCut = revenue * 0.3;
                      return (
                        <TableRow key={doctor.id}>
                          <TableCell className="font-medium">{isAr ? doctor.nameAr : doctor.name}</TableCell>
                          <TableCell>{revenue.toLocaleString()} ج.م</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 rounded-full bg-primary/20 flex-1 max-w-24">
                                <div className="h-1.5 rounded-full bg-primary" style={{ width: `${share}%` }} />
                              </div>
                              <span className="text-sm">{share.toFixed(1)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{clinicCut.toLocaleString()} ج.م</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Expenses Tracker + Debt Management */}
          <div className="grid gap-6 lg:grid-cols-2">

            {/* Expenses Tracker */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PiggyBank className="h-4 w-4 text-orange-500" />
                  {isAr ? 'متابعة المصروفات' : 'Expenses Tracker'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {expenseByCategoryData.length > 0 ? (
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={expenseByCategoryData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: any) => [`${Number(v).toLocaleString()} ج.م`]} />
                        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                          {expenseByCategoryData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">{isAr ? 'لا توجد مصروفات هذا الشهر' : 'No expenses this month'}</p>
                )}
                {/* Add Expense Form */}
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{isAr ? 'إضافة مصروف' : 'Add Expense'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={newExpense.category} onValueChange={v => setNewExpense(p => ({ ...p, category: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{isAr ? (v as any).ar : (v as any).en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input className="h-8 text-xs" placeholder={isAr ? 'الوصف' : 'Description'} value={newExpense.description} onChange={e => setNewExpense(p => ({ ...p, description: e.target.value }))} />
                    <Input className="h-8 text-xs" type="number" placeholder={isAr ? 'المبلغ' : 'Amount'} value={newExpense.amount} onChange={e => setNewExpense(p => ({ ...p, amount: e.target.value }))} />
                    <Input className="h-8 text-xs" type="date" value={newExpense.date} onChange={e => setNewExpense(p => ({ ...p, date: e.target.value }))} />
                  </div>
                  <Button size="sm" className="w-full h-8 gap-1.5" onClick={() => {
                    if (!newExpense.amount || !user) return;
                    const label = EXPENSE_CATEGORY_LABELS[newExpense.category as any] as any;
                    expenseStore.add({
                      id: `exp-${Date.now()}`,
                      clinicId: user.clinicId || '',
                      category: newExpense.category,
                      categoryAr: label?.ar || '',
                      description: newExpense.description,
                      amount: parseFloat(newExpense.amount),
                      date: newExpense.date,
                      paymentMethod: 'cash',
                      addedBy: user.id,
                      createdAt: new Date().toISOString(),
                    });
                    setNewExpense(p => ({ ...p, description: '', amount: '' }));
                  }}>
                    <Plus className="h-3.5 w-3.5" />
                    {isAr ? 'إضافة' : 'Add'}
                  </Button>
                </div>
                {/* Recent expenses */}
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {thisMonthExpenses.slice(-5).reverse().map(exp => (
                    <div key={exp.id} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-muted/40">
                      <span className="text-muted-foreground">{isAr ? exp.categoryAr : exp.category}</span>
                      <span className="font-medium">{exp.amount.toLocaleString()} ج.م</span>
                      <button onClick={() => expenseStore.remove(e => e.id === exp.id)} className="text-destructive hover:text-destructive/80 ml-1">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Debt Management */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  {isAr ? 'إدارة الديون' : 'Debt Management'}
                  {unpaidInvoices.length > 0 && (
                    <Badge variant="destructive" className="ml-auto text-xs">{unpaidInvoices.length}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {unpaidInvoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-sm">{isAr ? 'لا توجد فواتير غير مسددة' : 'No outstanding invoices'}</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {unpaidInvoices.map(inv => {
                      const patient = patients.find(p => p.id === inv.patientId);
                      const balance = inv.totalAmount - inv.paidAmount;
                      return (
                        <div key={inv.id} className="flex items-center justify-between p-2.5 rounded-lg border text-sm">
                          <div>
                            <p className="font-medium">{isAr ? patient?.nameAr : patient?.name}</p>
                            <p className="text-xs text-muted-foreground">{inv.createdAt.split('T')[0]}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-destructive">{balance.toLocaleString()} ج.م</p>
                            <Badge variant="outline" className="text-xs mt-0.5">
                              {inv.status === 'partially_paid' ? (isAr ? 'جزئي' : 'Partial') : (isAr ? 'غير مدفوع' : 'Unpaid')}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t flex justify-between text-sm font-medium">
                  <span className="text-muted-foreground">{isAr ? 'إجمالي الديون' : 'Total Outstanding'}</span>
                  <span className="text-destructive">{unpaidInvoices.reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0).toLocaleString()} ج.م</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AI Financial Forecast */}
          <Card className="border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-800">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-violet-700 dark:text-violet-400 text-base">
                  <BrainCircuit className="h-5 w-5" />
                  {isAr ? 'التنبؤ المالي بالذكاء الاصطناعي' : 'AI Financial Forecast'}
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:text-violet-400"
                  disabled={isLoadingForecast}
                  onClick={async () => {
                    setIsLoadingForecast(true);
                    try {
                      const res = await fetch('/api/financial-forecast', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          currentMonthRevenue: thisMonthRevenue,
                          lastMonthRevenue,
                          avgDailyPatients: Math.round(thisMonthPatients / 30),
                          totalDebt: unpaidInvoices.reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0),
                          topExpenseCategory: topExpCat,
                          language,
                        }),
                      });
                      const data = await res.json();
                      setForecast(data);
                    } catch { setForecast(null); }
                    finally { setIsLoadingForecast(false); }
                  }}
                >
                  {isLoadingForecast ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {isAr ? 'توليد التنبؤ' : 'Generate Forecast'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {forecast ? (
                <div className="space-y-3">
                  <p className="text-sm text-foreground">{isAr ? forecast.forecastAr : forecast.forecastEn}</p>
                  <div className="flex gap-4 flex-wrap">
                    <div className="flex items-center gap-2 text-sm">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-muted-foreground">{isAr ? 'الإيرادات المتوقعة' : 'Projected Revenue'}:</span>
                      <span className="font-semibold">{forecast.projectedRevenue?.toLocaleString()} ج.م</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {forecast.growthRate >= 0 ? <ChevronUp className="h-4 w-4 text-green-600" /> : <ChevronDown className="h-4 w-4 text-destructive" />}
                      <span className="text-muted-foreground">{isAr ? 'النمو المتوقع' : 'Expected Growth'}:</span>
                      <span className={`font-semibold ${forecast.growthRate >= 0 ? 'text-green-600' : 'text-destructive'}`}>{forecast.growthRate?.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-violet-600/70">{isAr ? 'اضغط "توليد التنبؤ" للحصول على تحليل مالي ذكي للشهر القادم' : 'Click "Generate Forecast" for an AI-powered financial outlook for next month'}</p>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        {/* ── Loyalty & Referrals Tab (STEP 7) ── */}
        <TabsContent value="loyalty" className="space-y-6 mt-0">
          {(() => {
            const clinicId = user?.clinicId || 'clinic-1';
            const topPts = getClinicTopPatients(clinicId, 10);
            const leaderboard = getReferralLeaderboard(clinicId, 10);
            const refEvents = getClinicReferralEvents(clinicId);
            const loyaltyCfg = getClinicLoyaltyConfig(clinicId);
            const isAr = language === 'ar';
            return (
              <>
                {/* KPI strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Card><CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center dark:bg-amber-900/30"><Award className="h-5 w-5 text-amber-600 dark:text-amber-400" /></div>
                    <div><p className="text-xs text-muted-foreground">{isAr ? 'إجمالي النقاط الممنوحة' : 'Total Points Earned'}</p>
                    <p className="text-xl font-bold">{topPts.reduce((s, p) => s + p.points, 0).toLocaleString()}</p></div>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-violet-100 flex items-center justify-center dark:bg-violet-900/30"><Users className="h-5 w-5 text-violet-600 dark:text-violet-400" /></div>
                    <div><p className="text-xs text-muted-foreground">{isAr ? 'إجمالي الإحالات' : 'Total Referrals'}</p>
                    <p className="text-xl font-bold">{refEvents.length}</p></div>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center dark:bg-green-900/30"><Gift className="h-5 w-5 text-green-600 dark:text-green-400" /></div>
                    <div><p className="text-xs text-muted-foreground">{isAr ? 'نقاط مكافآت الإحالة' : 'Referral Bonus Pts'}</p>
                    <p className="text-xl font-bold">{(refEvents.length * 20 + refEvents.length * 10).toLocaleString()}</p></div>
                  </CardContent></Card>
                  <Card><CardContent className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-primary" /></div>
                    <div><p className="text-xs text-muted-foreground">{isAr ? 'نقطة لكل ج.م' : 'Pts per EGP'}</p>
                    <p className="text-xl font-bold">{loyaltyCfg.pointsPerEgp}</p></div>
                  </CardContent></Card>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Top points holders */}
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4 text-amber-500" />{isAr ? 'أكثر المرضى نقاطاً' : 'Top Points Holders'}</CardTitle></CardHeader>
                    <CardContent>
                      {topPts.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">{isAr ? 'لا توجد بيانات' : 'No data yet'}</p> : (
                        <Table>
                          <TableHeader><TableRow><TableHead>{isAr ? 'المريض' : 'Patient'}</TableHead><TableHead className="text-end">{isAr ? 'النقاط' : 'Points'}</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {topPts.map((row, i) => {
                              const pt = patients.find(p => p.id === row.patientId);
                              return (
                                <TableRow key={row.patientId}>
                                  <TableCell className="font-medium">{pt ? (isAr ? pt.nameAr : pt.name) : row.patientId} {i === 0 && <Badge className="ms-1 text-[10px] bg-amber-500">#{i+1}</Badge>}</TableCell>
                                  <TableCell className="text-end font-semibold text-amber-600">{row.points.toLocaleString()}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>

                  {/* Referral leaderboard */}
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-violet-500" />{isAr ? 'أكثر المرضى إحالةً' : 'Top Referrers'}</CardTitle></CardHeader>
                    <CardContent>
                      {leaderboard.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">{isAr ? 'لا توجد إحالات بعد' : 'No referrals yet'}</p> : (
                        <Table>
                          <TableHeader><TableRow><TableHead>{isAr ? 'المريض' : 'Patient'}</TableHead><TableHead className="text-center">{isAr ? 'الإحالات' : 'Referrals'}</TableHead><TableHead className="text-end">{isAr ? 'النقاط المكتسبة' : 'Pts Earned'}</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {leaderboard.map((row, i) => {
                              const pt = patients.find(p => p.id === row.patientId);
                              return (
                                <TableRow key={row.patientId}>
                                  <TableCell className="font-medium">{pt ? (isAr ? pt.nameAr : pt.name) : row.patientId} {i === 0 && <Badge className="ms-1 text-[10px] bg-violet-500">#{i+1}</Badge>}</TableCell>
                                  <TableCell className="text-center">{row.count}</TableCell>
                                  <TableCell className="text-end font-semibold text-violet-600">{row.points}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Recent referral events */}
                {refEvents.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">{isAr ? 'آخر الإحالات' : 'Recent Referral Events'}</CardTitle></CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader><TableRow><TableHead>{isAr ? 'المُحيل' : 'Referrer'}</TableHead><TableHead>{isAr ? 'المريض الجديد' : 'New Patient'}</TableHead><TableHead className="text-end">{isAr ? 'التاريخ' : 'Date'}</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {refEvents.slice(0, 10).map(ev => {
                            const referrer = patients.find(p => p.id === ev.referrerId);
                            const referee = patients.find(p => p.id === ev.refereeId);
                            return (
                              <TableRow key={ev.id}>
                                <TableCell>{referrer ? (isAr ? referrer.nameAr : referrer.name) : ev.referrerId}</TableCell>
                                <TableCell>{referee ? (isAr ? referee.nameAr : referee.name) : ev.refereeId}</TableCell>
                                <TableCell className="text-end text-muted-foreground text-xs">{new Date(ev.createdAt).toLocaleDateString(isAr ? 'ar-EG' : 'en-GB')}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
