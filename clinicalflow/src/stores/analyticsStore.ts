// analyticsStore.ts — computed BI analytics from localStorage stores
// No external deps — reads from existing stores, returns chart-ready data.

import { Appointment, Invoice, Visit } from '@/types';

// ─── lazy loaders (avoid circular imports) ───────────────────────────────────
function loadAppointments(): Appointment[] {
  try { return JSON.parse(localStorage.getItem('cf_appointments') || '[]'); } catch { return []; }
}
function loadInvoices(): Invoice[] {
  try { return JSON.parse(localStorage.getItem('cf_invoices') || '[]'); } catch { return []; }
}
function loadVisits(): Visit[] {
  try { return JSON.parse(localStorage.getItem('cf_visits') || '[]'); } catch { return []; }
}
function loadMedicalNotes(): Array<{ id: string; category: string; title: string; patientId: string; createdAt: string }> {
  try { return JSON.parse(localStorage.getItem('cf_medical_notes') || '[]'); } catch { return []; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toYMD(d: Date) { return d.toISOString().slice(0, 10); }
function toYM(d: Date)  { return d.toISOString().slice(0, 7); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// ─── Revenue Analytics ────────────────────────────────────────────────────────
export interface DailyRevenue { date: string; revenue: number; appointments: number }
export interface TopService    { serviceId: string; label: string; revenue: number; count: number }

export function getRevenueAnalytics(clinicId: string, days = 30) {
  const invoices = loadInvoices().filter(i => i.isActive && (i as any).clinicId === clinicId);
  const apts     = loadAppointments().filter(a => a.clinicId === clinicId);

  // Daily revenue for last `days` days
  const today = new Date();
  const daily: DailyRevenue[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = toYMD(addDays(today, -i));
    const dayInvoices = invoices.filter(inv => inv.createdAt?.startsWith(d));
    daily.push({
      date: d,
      revenue: dayInvoices.reduce((s, inv) => s + inv.paidAmount, 0),
      appointments: apts.filter(a => a.date === d).length,
    });
  }

  // Monthly revenue — last 6 months
  const monthly: Array<{ month: string; revenue: number; appointments: number }> = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(today); d.setMonth(d.getMonth() - m);
    const ym = toYM(d);
    const monthInvoices = invoices.filter(inv => inv.createdAt?.startsWith(ym));
    monthly.push({
      month: ym,
      revenue: monthInvoices.reduce((s, inv) => s + inv.paidAmount, 0),
      appointments: apts.filter(a => a.date?.startsWith(ym)).length,
    });
  }

  // Top services by revenue (use specialtyId as proxy since serviceId is on items)
  const serviceRevMap: Record<string, number> = {};
  const serviceCountMap: Record<string, number> = {};
  apts.forEach(a => {
    const matchedInvoice = invoices.find(inv => {
      const v = loadVisits().find(v => v.id === inv.visitId);
      return v?.appointmentId === a.id;
    });
    if (matchedInvoice?.paidAmount) {
      serviceRevMap[a.specialtyId] = (serviceRevMap[a.specialtyId] || 0) + matchedInvoice.paidAmount;
      serviceCountMap[a.specialtyId] = (serviceCountMap[a.specialtyId] || 0) + 1;
    }
  });
  const topServices = Object.entries(serviceRevMap)
    .map(([serviceId, revenue]) => ({ serviceId, label: serviceId, revenue, count: serviceCountMap[serviceId] || 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const totalRevenue  = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const totalPending  = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.totalAmount - i.paidAmount), 0);
  const collectionPct = invoices.reduce((s, i) => s + i.totalAmount, 0) > 0
    ? Math.round(invoices.reduce((s, i) => s + i.paidAmount, 0) / invoices.reduce((s, i) => s + i.totalAmount, 0) * 100)
    : 0;

  return { daily, monthly, topServices, totalRevenue, totalPending, collectionPct };
}

// ─── Patient Analytics ────────────────────────────────────────────────────────
export interface PatientGrowth { month: string; total: number; newPatients: number; returning: number }

export function getPatientAnalytics(clinicId: string) {
  const apts = loadAppointments().filter(a => a.clinicId === clinicId);
  const today = new Date();

  // New vs returning per month (last 6 months)
  const monthly: PatientGrowth[] = [];
  const seenBefore = new Set<string>();

  // Build full history before the 6-month window to correctly classify returning
  const sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  apts.filter(a => a.date && new Date(a.date) < sixMonthsAgo).forEach(a => seenBefore.add(a.patientId));

  for (let m = 5; m >= 0; m--) {
    const d = new Date(today); d.setMonth(d.getMonth() - m);
    const ym = toYM(d);
    const monthApts = apts.filter(a => a.date?.startsWith(ym));
    const monthPatients = new Set(monthApts.map(a => a.patientId));
    let newP = 0, retP = 0;
    monthPatients.forEach(pid => {
      if (seenBefore.has(pid)) retP++; else { newP++; seenBefore.add(pid); }
    });
    monthly.push({ month: ym, total: monthPatients.size, newPatients: newP, returning: retP });
  }

  const allPatientIds  = new Set(apts.map(a => a.patientId));
  const todayStr = toYMD(today);
  const todayPatients  = new Set(apts.filter(a => a.date === todayStr).map(a => a.patientId)).size;
  const thisMonthStr   = toYM(today);
  const monthPatients  = new Set(apts.filter(a => a.date?.startsWith(thisMonthStr)).map(a => a.patientId)).size;

  return { monthly, totalPatients: allPatientIds.size, todayPatients, monthPatients };
}

// ─── Peak Times ───────────────────────────────────────────────────────────────
export interface HourSlot { hour: number; label: string; count: number }
export interface DaySlot  { day: string; dayIndex: number; count: number }

export function getPeakTimeAnalytics(clinicId: string) {
  const apts = loadAppointments().filter(a => a.clinicId === clinicId && a.time);

  // Per hour (0–23)
  const hourMap: Record<number, number> = {};
  apts.forEach(a => {
    const h = parseInt(a.time.split(':')[0], 10);
    if (!isNaN(h)) hourMap[h] = (hourMap[h] || 0) + 1;
  });
  const byHour: HourSlot[] = Array.from({ length: 14 }, (_, i) => i + 7).map(h => ({
    hour: h,
    label: `${h.toString().padStart(2, '0')}:00`,
    count: hourMap[h] || 0,
  }));

  // Per day of week
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayNamesAr = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayMap: Record<number, number> = {};
  apts.forEach(a => {
    if (a.date) {
      const d = new Date(a.date).getDay();
      dayMap[d] = (dayMap[d] || 0) + 1;
    }
  });
  const byDay: DaySlot[] = [0,1,2,3,4,5,6].map(i => ({
    day: dayNames[i], dayIndex: i, count: dayMap[i] || 0,
  }));
  const byDayAr: DaySlot[] = [0,1,2,3,4,5,6].map(i => ({
    day: dayNamesAr[i], dayIndex: i, count: dayMap[i] || 0,
  }));

  const peakHour = [...byHour].sort((a, b) => b.count - a.count)[0];
  const peakDay  = [...byDay].sort((a, b) => b.count - a.count)[0];

  return { byHour, byDay, byDayAr, peakHour, peakDay };
}

// ─── Referral Source Analytics ────────────────────────────────────────────────
export interface SourceStat { source: string; label: string; labelAr: string; count: number; pct: number }

export function getReferralSourceAnalytics(clinicId: string) {
  const apts = loadAppointments().filter(a => a.clinicId === clinicId);
  const sourceMap: Record<string, number> = { whatsapp: 0, reception: 0, online: 0, unknown: 0 };
  apts.forEach(a => {
    const s = (a as any).source || 'unknown';
    sourceMap[s] = (sourceMap[s] || 0) + 1;
  });
  const total = apts.length || 1;
  const LABELS: Record<string, { en: string; ar: string }> = {
    whatsapp:  { en: 'WhatsApp',    ar: 'واتساب' },
    reception: { en: 'Walk-in/Reception', ar: 'استقبال' },
    online:    { en: 'Online Portal', ar: 'حجز إلكتروني' },
    unknown:   { en: 'Unknown',     ar: 'غير محدد' },
  };
  const stats: SourceStat[] = Object.entries(sourceMap).map(([src, count]) => ({
    source: src,
    label: LABELS[src]?.en || src,
    labelAr: LABELS[src]?.ar || src,
    count,
    pct: Math.round(count / total * 100),
  }));

  // Conversion: booked → completed
  const completed  = apts.filter(a => a.status === 'completed').length;
  const conversion = apts.length > 0 ? Math.round(completed / apts.length * 100) : 0;

  // Monthly source trend (last 4 months)
  const today = new Date();
  const trend = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(today); d.setMonth(d.getMonth() - (3 - i));
    const ym = toYM(d);
    const monthApts = apts.filter(a => a.date?.startsWith(ym));
    return {
      month: ym,
      whatsapp:  monthApts.filter(a => (a as any).source === 'whatsapp').length,
      reception: monthApts.filter(a => (a as any).source === 'reception' || !(a as any).source).length,
      online:    monthApts.filter(a => (a as any).source === 'online').length,
    };
  });

  return { stats, conversion, trend, totalAppointments: apts.length, completedAppointments: completed };
}

// ─── Diagnosis Insights ───────────────────────────────────────────────────────
export interface DiagnosisStat { title: string; count: number; pct: number }

export function getDiagnosisAnalytics(clinicId: string) {
  const notes = loadMedicalNotes();
  const diagNotes = notes.filter(n => n.category === 'diagnosis');

  // Most common diagnoses
  const map: Record<string, number> = {};
  diagNotes.forEach(n => {
    const key = n.title.trim();
    map[key] = (map[key] || 0) + 1;
  });
  const total = diagNotes.length || 1;
  const top: DiagnosisStat[] = Object.entries(map)
    .map(([title, count]) => ({ title, count, pct: Math.round(count / total * 100) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Monthly trend for top 3 diagnoses
  const topTitles = top.slice(0, 3).map(d => d.title);
  const today = new Date();
  const trend = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(today); d.setMonth(d.getMonth() - (4 - i));
    const ym = toYM(d);
    const monthNotes = diagNotes.filter(n => n.createdAt?.startsWith(ym));
    const row: Record<string, number | string> = { month: ym };
    topTitles.forEach(t => {
      row[t] = monthNotes.filter(n => n.title === t).length;
    });
    return row;
  });

  // Category breakdown (all medical note categories)
  const catMap: Record<string, number> = {};
  notes.forEach(n => { catMap[n.category] = (catMap[n.category] || 0) + 1; });
  const categoryBreakdown = Object.entries(catMap)
    .map(([cat, count]) => ({ category: cat, count }))
    .sort((a, b) => b.count - a.count);

  return { top, trend, topTitles, categoryBreakdown, totalDiagnoses: diagNotes.length };
}

// ─── Today Dashboard summary ──────────────────────────────────────────────────
export function getTodaySummary(clinicId: string) {
  const today = toYMD(new Date());
  const apts   = loadAppointments().filter(a => a.clinicId === clinicId && a.date === today);
  const visits = loadVisits().filter(v => v.clinicId === clinicId);
  const invoices = loadInvoices().filter(i => (i as any).clinicId === clinicId && i.createdAt?.startsWith(today));

  const revenue = invoices.reduce((s, i) => s + i.paidAmount, 0);
  const patientCount = new Set(apts.map(a => a.patientId)).size;

  // Avg waiting time from visits that have arrivalTime + consultationStart
  const waitTimes = visits
    .filter(v => v.arrivalTime && (v as any).consultationStartTime && v.createdAt.startsWith(today))
    .map(v => {
      const arr   = new Date(v.arrivalTime!).getTime();
      const start = new Date((v as any).consultationStartTime).getTime();
      return (start - arr) / 60000; // minutes
    })
    .filter(t => t > 0 && t < 240);
  const avgWaitMin = waitTimes.length > 0 ? Math.round(waitTimes.reduce((s, t) => s + t, 0) / waitTimes.length) : null;

  return { revenue, patientCount, avgWaitMin, appointmentCount: apts.length };
}
