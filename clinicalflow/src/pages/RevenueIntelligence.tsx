import React, { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { invoiceStore, invoiceItemStore, visitStore } from '@/stores/visitStore';
import { patientStore } from '@/stores/patientStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp, TrendingDown, AlertTriangle, Lightbulb, Wallet,
  Users, Calendar, Tag, Clock, CheckCircle2, XCircle,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return `${n.toLocaleString('ar-EG', { maximumFractionDigits: 0 })} ج.م`;
}

function last7Days() {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// ─── component ───────────────────────────────────────────────────────────────
const RevenueIntelligence: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';
  const clinicId = user?.clinicId || '';
  const today = new Date().toISOString().slice(0, 10);

  const [range, setRange] = useState<'7' | '30'>('7');

  // ── STEP 1: collect raw data ───────────────────────────────────────────────
  const { invoices, grossTotal, paidTotal, unpaidTotal, discountTotal, discountCount } =
    useMemo(() => {
      // Get visit IDs belonging to this clinic
      const clinicVisitIds = new Set(
        visitStore.filter(v => v.clinicId === clinicId && v.isActive !== false).map(v => v.id)
      );

      const invs = invoiceStore.filter(
        i => i.isActive !== false && clinicVisitIds.has(i.visitId)
      );

      let gross = 0;
      let paid = 0;
      let unpaid = 0;
      let disc = 0;
      let discCnt = 0;

      invs.forEach(inv => {
        // gross = totalAmount + discountAmt (reverse-compute from items)
        const items = invoiceItemStore.filter(it => it.invoiceId === inv.id);
        const itemsTotal = items.reduce((s, it) => s + it.totalPrice, 0);
        gross += itemsTotal || inv.totalAmount;

        paid += inv.paidAmount;
        if (inv.status !== 'paid' && inv.status !== 'refunded') {
          unpaid += inv.totalAmount - inv.paidAmount;
        }

        if (inv.discountType !== 'none' && inv.discountValue > 0) {
          const discAmt = inv.discountType === 'percentage'
            ? Math.round((itemsTotal || inv.totalAmount) * inv.discountValue / 100)
            : inv.discountValue;
          disc += discAmt;
          discCnt++;
        }
      });

      return {
        invoices: invs,
        grossTotal: gross,
        paidTotal: paid,
        unpaidTotal: unpaid,
        discountTotal: disc,
        discountCount: discCnt,
      };
    }, [clinicId]);

  // ── STEP 2: basic insights ─────────────────────────────────────────────────
  const { avgPerPatient, todayRevenue, discountPct, dailyData, patientCount } =
    useMemo(() => {
      const days = last7Days();

      // Map visitId → date
      const visitDateMap = new Map<string, string>();
      visitStore.filter(v => v.clinicId === clinicId).forEach(v => visitDateMap.set(v.id, v.date));

      // Daily paid amounts
      const dailyMap: Record<string, number> = {};
      days.forEach(d => { dailyMap[d] = 0; });

      invoices.forEach(inv => {
        const date = visitDateMap.get(inv.visitId);
        if (date && dailyMap[date] !== undefined) {
          dailyMap[date] += inv.paidAmount;
        }
      });

      const dailyArr = days.map(d => ({
        date: d.slice(5), // MM-DD
        revenue: dailyMap[d],
        label: d === today ? (isAr ? 'اليوم' : 'Today') : d.slice(5),
      }));

      // Today revenue
      const todayInvoiceIds = new Set(
        visitStore.filter(v => v.clinicId === clinicId && v.date === today).map(v => v.id)
      );
      const todayRev = invoices
        .filter(i => todayInvoiceIds.has(i.visitId))
        .reduce((s, i) => s + i.paidAmount, 0);

      // Unique patients
      const patientIds = new Set(invoices.map(i => i.patientId));
      const ptCount = patientIds.size;

      // Avg per patient
      const avg = ptCount > 0 ? Math.round(paidTotal / ptCount) : 0;

      // Discount %
      const discPct = grossTotal > 0 ? Math.round((discountTotal / grossTotal) * 100) : 0;

      return {
        avgPerPatient: avg,
        todayRevenue: todayRev,
        discountPct: discPct,
        dailyData: dailyArr,
        patientCount: ptCount,
      };
    }, [invoices, clinicId, paidTotal, grossTotal, discountTotal, today, isAr]);

  // ── STEP 3: alerts ────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const list: { type: 'warning' | 'error'; ar: string; en: string }[] = [];
    if (discountPct >= 20) {
      list.push({
        type: 'warning',
        ar: `نسبة الخصومات مرتفعة (${discountPct}%) — راجع سياسة الخصم`,
        en: `High discount rate (${discountPct}%) — review discount policy`,
      });
    }
    const unpaidPct = grossTotal > 0 ? Math.round((unpaidTotal / grossTotal) * 100) : 0;
    if (unpaidPct >= 30) {
      list.push({
        type: 'error',
        ar: `${unpaidPct}% من الإيرادات غير مُحصَّلة — تابع الفواتير المعلقة`,
        en: `${unpaidPct}% revenue uncollected — follow up on unpaid invoices`,
      });
    }
    if (todayRevenue === 0 && new Date().getHours() > 12) {
      list.push({
        type: 'warning',
        ar: 'لا يوجد إيراد اليوم حتى الآن',
        en: 'No revenue recorded today yet',
      });
    }
    return list;
  }, [discountPct, unpaidTotal, grossTotal, todayRevenue]);

  // ── STEP 4: suggestions ───────────────────────────────────────────────────
  const suggestions = useMemo(() => {
    const list: { ar: string; en: string }[] = [];
    if (avgPerPatient > 0 && avgPerPatient < 200) {
      list.push({
        ar: 'متوسط الإيراد للمريض منخفض — فكّر في مراجعة أسعار الخدمات',
        en: 'Low avg revenue per patient — consider reviewing service prices',
      });
    }
    if (patientCount >= 50) {
      list.push({
        ar: 'عدد المرضى مرتفع — فكّر في تمديد ساعات العمل أو إضافة طبيب',
        en: 'High patient volume — consider extending hours or adding a doctor',
      });
    }
    if (discountCount > patientCount * 0.4 && patientCount > 0) {
      list.push({
        ar: 'أكثر من 40% من المرضى يحصلون على خصم — ضع حداً أقصى للخصومات',
        en: 'Over 40% of patients receive discounts — set a maximum discount policy',
      });
    }
    if (unpaidTotal > paidTotal * 0.5 && paidTotal > 0) {
      list.push({
        ar: 'الفواتير غير المدفوعة تتجاوز 50% من المحصّل — فعّل نظام التذكير التلقائي',
        en: 'Unpaid invoices exceed 50% of collected — enable auto reminder system',
      });
    }
    // Empty slots heuristic: very low patient volume but clinic has revenue history → likely empty slots
    if (patientCount > 0 && patientCount < 10 && grossTotal > 0) {
      list.push({
        ar: 'يوجد مواعيد شاغرة — أطلق عرضاً ترويجياً لجذب المرضى',
        en: 'Empty slots detected — launch a promotion to attract more patients',
      });
    }
    return list;
  }, [avgPerPatient, patientCount, discountCount, unpaidTotal, paidTotal, grossTotal]);

  // ── STEP 5: render ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{isAr ? 'ذكاء الإيرادات' : 'Revenue Intelligence'}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAr ? 'تحليل إيرادات العيادة وتنبيهات ذكية' : 'Clinic revenue analysis with smart alerts'}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Wallet className="h-3.5 w-3.5" />
              {isAr ? 'إجمالى المحصّل' : 'Total Collected'}
            </div>
            <p className="text-2xl font-bold text-green-600">{fmt(paidTotal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <XCircle className="h-3.5 w-3.5" />
              {isAr ? 'فواتير غير مدفوعة' : 'Unpaid Invoices'}
            </div>
            <p className={`text-2xl font-bold ${unpaidTotal > 0 ? 'text-red-500' : 'text-foreground'}`}>
              {fmt(unpaidTotal)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Tag className="h-3.5 w-3.5" />
              {isAr ? 'إجمالى الخصومات' : 'Total Discounts'}
            </div>
            <p className={`text-2xl font-bold ${discountPct >= 20 ? 'text-orange-500' : 'text-foreground'}`}>
              {fmt(discountTotal)}
            </p>
            <p className="text-xs text-muted-foreground">{discountPct}% {isAr ? 'من الإجمالى' : 'of gross'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Calendar className="h-3.5 w-3.5" />
              {isAr ? 'إيراد اليوم' : "Today's Revenue"}
            </div>
            <p className="text-2xl font-bold text-primary">{fmt(todayRevenue)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Insights row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Users className="h-3.5 w-3.5" />
              {isAr ? 'متوسط الإيراد للمريض' : 'Avg Revenue / Patient'}
            </div>
            <p className="text-2xl font-bold">{fmt(avgPerPatient)}</p>
            <p className="text-xs text-muted-foreground">
              {patientCount} {isAr ? 'مريض إجمالاً' : 'total patients'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isAr ? 'نسبة التحصيل' : 'Collection Rate'}
            </div>
            <p className="text-2xl font-bold text-green-600">
              {grossTotal > 0 ? Math.round((paidTotal / grossTotal) * 100) : 0}%
            </p>
            <p className="text-xs text-muted-foreground">
              {fmt(paidTotal)} {isAr ? 'من' : 'of'} {fmt(grossTotal)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            {isAr ? 'الإيراد اليومى (آخر 7 أيام)' : 'Daily Revenue (Last 7 Days)'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={dailyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={v => `${v}`} />
              <Tooltip formatter={(v: number) => [fmt(v), isAr ? 'الإيراد' : 'Revenue']} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertTriangle className="h-4 w-4" />
              {isAr ? 'تنبيهات' : 'Alerts'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge variant={a.type === 'error' ? 'destructive' : 'outline'}
                  className={a.type === 'warning' ? 'border-orange-400 text-orange-700 bg-orange-100' : ''}>
                  {a.type === 'error' ? (isAr ? 'خطر' : 'Error') : (isAr ? 'تحذير' : 'Warning')}
                </Badge>
                <p className="text-sm">{isAr ? a.ar : a.en}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Lightbulb className="h-4 w-4" />
              {isAr ? 'اقتراحات ذكية' : 'Smart Suggestions'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-blue-500 mt-0.5 shrink-0">→</span>
                <p className="text-sm text-blue-800 dark:text-blue-200">{isAr ? s.ar : s.en}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {paidTotal === 0 && unpaidTotal === 0 && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
            <TrendingDown className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{isAr ? 'لا توجد بيانات إيرادات بعد' : 'No revenue data yet'}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RevenueIntelligence;
