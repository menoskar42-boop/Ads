import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { useSpecialties } from '@/hooks/useSpecialties';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  TrendingUp, Users, Clock, DollarSign, BarChart2, ActivitySquare,
  CalendarDays, Stethoscope, Share2, Brain,
} from 'lucide-react';
import {
  getRevenueAnalytics, getPatientAnalytics, getPeakTimeAnalytics,
  getReferralSourceAnalytics, getDiagnosisAnalytics, getTodaySummary,
} from '@/stores/analyticsStore';

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }: {
  icon: React.ElementType; label: string; value: React.ReactNode; sub?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-start gap-4">
        <div className={`h-11 w-11 rounded-lg bg-muted flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-foreground leading-tight truncate">{value}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
const EGPTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-xs space-y-1">
      <p className="font-medium text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue') || p.dataKey === 'revenue'
            ? `${p.value.toLocaleString()} ج.م` : p.value}
        </p>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const BIDashboard: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { doctors } = useUsers();
  const { specialties } = useSpecialties();
  const isAr = language === 'ar';

  const clinicId = user?.clinicId ?? 'clinic-1';

  // ─── Filters ─────────────────────────────────────────────────
  const [dateRange, setDateRange] = useState<'7' | '30' | '90'>('30');
  const [doctorFilter, setDoctorFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('overview');

  // ─── Analytics data ───────────────────────────────────────────
  const revenue   = useMemo(() => getRevenueAnalytics(clinicId, Number(dateRange)), [clinicId, dateRange]);
  const patients  = useMemo(() => getPatientAnalytics(clinicId), [clinicId]);
  const peakTimes = useMemo(() => getPeakTimeAnalytics(clinicId), [clinicId]);
  const referrals = useMemo(() => getReferralSourceAnalytics(clinicId), [clinicId]);
  const diagnosis = useMemo(() => getDiagnosisAnalytics(clinicId), [clinicId]);
  const today     = useMemo(() => getTodaySummary(clinicId), [clinicId]);

  // ─── Label helpers ────────────────────────────────────────────
  const shortMonth = (ym: string) => {
    const [y, m] = ym.split('-');
    const date = new Date(Number(y), Number(m) - 1);
    return date.toLocaleString(isAr ? 'ar-EG' : 'en-US', { month: 'short' });
  };

  const monthlyRevData = revenue.monthly.map(r => ({
    ...r, label: shortMonth(r.month), revenue: r.revenue,
  }));

  const patientData = patients.monthly.map(p => ({
    ...p, label: shortMonth(p.month),
  }));

  const topServicesWithName = revenue.topServices.map(s => ({
    ...s,
    label: specialties.find(sp => sp.id === s.serviceId)
      ? (isAr ? specialties.find(sp => sp.id === s.serviceId)!.nameAr : specialties.find(sp => sp.id === s.serviceId)!.name)
      : s.label.slice(0, 12),
  }));

  const byDay = isAr ? peakTimes.byDayAr : peakTimes.byDay;

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary" />
            {isAr ? 'لوحة التحليلات والذكاء الإداري' : 'BI Analytics Dashboard'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isAr ? 'رؤى قابلة للتنفيذ لدعم قرارات العيادة' : 'Actionable insights for clinical decision support'}
          </p>
        </div>
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="space-y-0.5">
            <Label className="text-xs text-muted-foreground">{isAr ? 'الفترة' : 'Period'}</Label>
            <Select value={dateRange} onValueChange={v => setDateRange(v as any)}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{isAr ? '7 أيام' : '7 days'}</SelectItem>
                <SelectItem value="30">{isAr ? '30 يوم' : '30 days'}</SelectItem>
                <SelectItem value="90">{isAr ? '90 يوم' : '90 days'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-0.5">
            <Label className="text-xs text-muted-foreground">{isAr ? 'الطبيب' : 'Doctor'}</Label>
            <Select value={doctorFilter} onValueChange={setDoctorFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? 'كل الأطباء' : 'All Doctors'}</SelectItem>
                {doctors.map(d => (
                  <SelectItem key={d.id} value={d.id}>{isAr ? d.nameAr || d.name : d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Today KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={DollarSign}  label={isAr ? 'إيرادات اليوم' : "Today's Revenue"}
          value={`${today.revenue.toLocaleString()} ج.م`} color="text-green-600" />
        <StatCard icon={Users}       label={isAr ? 'مرضى اليوم' : 'Patients Today'}
          value={today.patientCount} color="text-blue-600" />
        <StatCard icon={Clock}       label={isAr ? 'متوسط وقت الانتظار' : 'Avg Wait Time'}
          value={today.avgWaitMin != null ? `${today.avgWaitMin} ${isAr ? 'دقيقة' : 'min'}` : '—'}
          color="text-yellow-600" />
        <StatCard icon={CalendarDays} label={isAr ? 'مواعيد اليوم' : "Today's Appts"}
          value={today.appointmentCount} color="text-purple-600" />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1 mb-1">
          <TabsTrigger value="overview"  className="text-xs">{isAr ? 'نظرة عامة' : 'Overview'}</TabsTrigger>
          <TabsTrigger value="revenue"   className="text-xs">{isAr ? 'الإيرادات' : 'Revenue'}</TabsTrigger>
          <TabsTrigger value="patients"  className="text-xs">{isAr ? 'المرضى' : 'Patients'}</TabsTrigger>
          <TabsTrigger value="peak"      className="text-xs">{isAr ? 'أوقات الذروة' : 'Peak Times'}</TabsTrigger>
          <TabsTrigger value="referrals" className="text-xs">{isAr ? 'مصادر الحجز' : 'Booking Sources'}</TabsTrigger>
          <TabsTrigger value="diagnosis" className="text-xs">{isAr ? 'التشخيصات' : 'Diagnoses'}</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <StatCard icon={TrendingUp}   label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
              value={`${revenue.totalRevenue.toLocaleString()} ج.م`} color="text-green-600" />
            <StatCard icon={ActivitySquare} label={isAr ? 'معدل التحصيل' : 'Collection Rate'}
              value={`${revenue.collectionPct}%`} color="text-blue-600" />
            <StatCard icon={Users}        label={isAr ? 'إجمالي المرضى' : 'Total Patients'}
              value={patients.totalPatients} color="text-purple-600" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Revenue bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{isAr ? 'الإيرادات الشهرية' : 'Monthly Revenue'}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyRevData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={48} />
                    <Tooltip content={<EGPTooltip />} />
                    <Bar dataKey="revenue" name={isAr ? 'الإيراد' : 'Revenue'} fill="hsl(var(--chart-1))" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Patient growth line chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{isAr ? 'نمو المرضى' : 'Patient Growth'}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={patientData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} />
                    <Tooltip />
                    <Line dataKey="newPatients" name={isAr ? 'جدد' : 'New'} stroke={COLORS[0]} strokeWidth={2} dot={false} />
                    <Line dataKey="returning"   name={isAr ? 'عائدون' : 'Returning'} stroke={COLORS[2]} strokeWidth={2} dot={false} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── REVENUE ── */}
        <TabsContent value="revenue" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon={DollarSign}    label={isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
              value={`${revenue.totalRevenue.toLocaleString()} ج.م`} color="text-green-600" />
            <StatCard icon={ActivitySquare} label={isAr ? 'متبقٍ غير محصَّل' : 'Pending Collection'}
              value={`${revenue.totalPending.toLocaleString()} ج.م`} color="text-red-600" />
            <StatCard icon={TrendingUp}    label={isAr ? 'معدل التحصيل' : 'Collection Rate'}
              value={`${revenue.collectionPct}%`} color="text-blue-600" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isAr ? 'الإيرادات اليومية' : 'Daily Revenue'} ({dateRange} {isAr ? 'يوم' : 'days'})</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenue.daily.filter((_, i) => i % Math.ceil(Number(dateRange) / 15) === 0)}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tickFormatter={d => d.slice(5)} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} width={50} />
                  <Tooltip content={<EGPTooltip />} />
                  <Bar dataKey="revenue" name={isAr ? 'الإيراد' : 'Revenue'} fill="hsl(var(--chart-1))" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isAr ? 'أعلى الخدمات إيراداً' : 'Top Services by Revenue'}</CardTitle>
            </CardHeader>
            <CardContent>
              {topServicesWithName.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
              ) : (
                <div className="space-y-2">
                  {topServicesWithName.map((s, i) => (
                    <div key={s.serviceId} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium truncate">{s.label}</span>
                          <span className="text-muted-foreground ml-2 shrink-0">{s.revenue.toLocaleString()} ج.م</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${Math.round(s.revenue / (topServicesWithName[0]?.revenue || 1) * 100)}%`,
                            backgroundColor: COLORS[i % COLORS.length],
                          }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PATIENTS ── */}
        <TabsContent value="patients" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon={Users}      label={isAr ? 'إجمالي المرضى' : 'Total Patients'}
              value={patients.totalPatients} color="text-blue-600" />
            <StatCard icon={Users}      label={isAr ? 'مرضى هذا الشهر' : 'This Month'}
              value={patients.monthPatients} color="text-green-600" />
            <StatCard icon={CalendarDays} label={isAr ? 'مرضى اليوم' : 'Today'}
              value={patients.todayPatients} color="text-purple-600" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isAr ? 'المرضى الجدد مقابل العائدين (شهرياً)' : 'New vs Returning Patients (Monthly)'}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={patientData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="newPatients" name={isAr ? 'جدد' : 'New'} stackId="a" fill={COLORS[0]} />
                  <Bar dataKey="returning"   name={isAr ? 'عائدون' : 'Returning'} stackId="a" fill={COLORS[2]} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── PEAK TIMES ── */}
        <TabsContent value="peak" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Clock}        label={isAr ? 'أكثر ساعة ازدحاماً' : 'Busiest Hour'}
              value={peakTimes.peakHour ? peakTimes.peakHour.label : '—'}
              sub={peakTimes.peakHour ? `${peakTimes.peakHour.count} ${isAr ? 'موعد' : 'appts'}` : undefined}
              color="text-orange-500" />
            <StatCard icon={CalendarDays} label={isAr ? 'أكثر يوم ازدحاماً' : 'Busiest Day'}
              value={(isAr ? peakTimes.byDayAr : peakTimes.byDay).find(d => d.dayIndex === peakTimes.peakDay?.dayIndex)?.day || '—'}
              sub={peakTimes.peakDay ? `${peakTimes.peakDay.count} ${isAr ? 'موعد' : 'appts'}` : undefined}
              color="text-orange-500" />
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isAr ? 'توزيع المواعيد حسب الساعة' : 'Appointments by Hour'}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={peakTimes.byHour} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Bar dataKey="count" name={isAr ? 'مواعيد' : 'Appointments'} fill="hsl(var(--chart-4))" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isAr ? 'توزيع المواعيد حسب اليوم' : 'Appointments by Day of Week'}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byDay} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Bar dataKey="count" name={isAr ? 'مواعيد' : 'Appointments'} radius={[4,4,0,0]}>
                    {byDay.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── REFERRALS / BOOKING SOURCES ── */}
        <TabsContent value="referrals" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <StatCard icon={Share2}       label={isAr ? 'إجمالي المواعيد' : 'Total Bookings'}
              value={referrals.totalAppointments} color="text-blue-600" />
            <StatCard icon={ActivitySquare} label={isAr ? 'معدل التحويل' : 'Conversion Rate'}
              value={`${referrals.conversion}%`}
              sub={isAr ? 'محجوز → مكتمل' : 'booked → completed'} color="text-green-600" />
            <StatCard icon={TrendingUp}   label={isAr ? 'مكتملة' : 'Completed'}
              value={referrals.completedAppointments} color="text-purple-600" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{isAr ? 'توزيع مصادر الحجز' : 'Booking Source Distribution'}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={referrals.stats.map(s => ({ name: isAr ? s.labelAr : s.label, value: s.count }))}
                      cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, pct }) => `${name}: ${pct}%`}
                      labelLine={false}>
                      {referrals.stats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{isAr ? 'اتجاه المصادر شهرياً' : 'Source Trend Monthly'}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={referrals.trend.map(t => ({ ...t, label: t.month.slice(5) }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} />
                    <Tooltip />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="reception" name={isAr ? 'استقبال' : 'Walk-in'} stackId="a" fill={COLORS[0]} />
                    <Bar dataKey="whatsapp"  name="WhatsApp" stackId="a" fill={COLORS[1]} />
                    <Bar dataKey="online"    name={isAr ? 'إلكتروني' : 'Online'} stackId="a" fill={COLORS[2]} radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{isAr ? 'تفاصيل المصادر' : 'Source Details'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {referrals.stats.map((s, i) => (
                  <div key={s.source} className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 text-sm">{isAr ? s.labelAr : s.label}</span>
                    <Badge variant="outline" className="text-xs">{s.pct}%</Badge>
                    <span className="text-sm font-medium w-10 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DIAGNOSES ── */}
        <TabsContent value="diagnosis" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Brain}       label={isAr ? 'إجمالي التشخيصات' : 'Total Diagnoses'}
              value={diagnosis.totalDiagnoses} color="text-violet-600" />
            <StatCard icon={Stethoscope} label={isAr ? 'أشيع تشخيص' : 'Most Common'}
              value={diagnosis.top[0]?.title.slice(0, 20) || '—'}
              sub={diagnosis.top[0] ? `${diagnosis.top[0].count} ${isAr ? 'حالة' : 'cases'}` : undefined}
              color="text-violet-600" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{isAr ? 'أكثر التشخيصات شيوعاً' : 'Most Common Diagnoses'}</CardTitle>
              </CardHeader>
              <CardContent>
                {diagnosis.top.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">{isAr ? 'لا توجد بيانات تشخيص' : 'No diagnosis data'}</p>
                ) : (
                  <div className="space-y-2">
                    {diagnosis.top.map((d, i) => (
                      <div key={d.title} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="truncate font-medium">{d.title}</span>
                            <span className="text-muted-foreground ml-2 shrink-0">{d.count} ({d.pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{
                              width: `${d.pct}%`, backgroundColor: COLORS[i % COLORS.length],
                            }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{isAr ? 'توزيع أنواع السجلات الطبية' : 'Medical Record Categories'}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={diagnosis.categoryBreakdown.map(c => ({ name: c.category, value: c.count }))}
                      cx="50%" cy="50%" outerRadius={75} dataKey="value">
                      {diagnosis.categoryBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Diagnosis trend over time */}
          {diagnosis.topTitles.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{isAr ? 'اتجاه التشخيصات الأكثر شيوعاً' : 'Top Diagnoses Trend'}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={diagnosis.trend.map(t => ({ ...t, label: (t.month as string).slice(5) }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={32} />
                    <Tooltip />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    {diagnosis.topTitles.map((title, i) => (
                      <Line key={title} dataKey={title} name={title.slice(0, 18)}
                        stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BIDashboard;
