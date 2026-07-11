import React, { useState, useCallback, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp, Users, UserX, RefreshCw, Send,
  Zap, Lock, MessageSquare, Clock,
} from 'lucide-react';
import { getToken } from '@/utils/authToken';

type Segment  = 'inactive' | 'no_show' | 'recent' | 'high_value';
type MsgStatus = 'sent' | 'pending' | 'error';

interface LogEntry {
  id: string;
  patientName: string;
  phone: string;
  segment: Segment;
  message: string;
  status: MsgStatus;
  sentAt: string;
}

interface Stats {
  total: number;
  sent: number;
  pending: number;
  segments: { inactive: number; no_show: number; recent: number; high_value: number };
}

const SEGMENT_META: Record<Segment, { labelAr: string; labelEn: string; color: string; Icon: React.ComponentType<{ className?: string }> }> = {
  inactive:   { labelAr: 'غير نشط (30+ يوم)',  labelEn: 'Inactive (30+ days)',  color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', Icon: Clock },
  no_show:    { labelAr: 'تغيّب عن الموعد',     labelEn: 'No-show',              color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             Icon: UserX },
  recent:     { labelAr: 'زيارة حديثة',          labelEn: 'Recent Visit',         color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',          Icon: RefreshCw },
  high_value: { labelAr: 'مريض متكرر',           labelEn: 'High-Value Patient',   color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',      Icon: Users },
};

const STATUS_META: Record<MsgStatus, { labelAr: string; labelEn: string; cls: string }> = {
  sent:    { labelAr: 'أُرسل',       labelEn: 'Sent',    cls: 'text-green-600 dark:text-green-400' },
  pending: { labelAr: 'في الانتظار', labelEn: 'Pending', cls: 'text-amber-600 dark:text-amber-400' },
  error:   { labelAr: 'خطأ',         labelEn: 'Error',   cls: 'text-destructive' },
};

const HOW_IT_WORKS = [
  { ar: '🔍 يفحص مرضى لم يزوروا منذ 30+ يوم → يرسل رسالة إعادة تفعيل',    en: '🔍 Finds inactive patients (30+ days) → sends reactivation message' },
  { ar: '❌ يحدد المرضى الذين غابوا عن مواعيدهم → يرسل رسالة استرداد',      en: '❌ Identifies no-show patients → sends recovery message' },
  { ar: '✅ يرصد الزيارات الحديثة (7 أيام) → يرسل تذكير متابعة',             en: '✅ Spots recent visits (7 days) → sends follow-up reminder' },
  { ar: '⭐ يكافئ المرضى المتكررين (3+) بمواعيد مخصصة',                      en: '⭐ Rewards loyal patients (3+ visits) with priority booking offers' },
  { ar: '🛡️ كولداون 7 أيام لكل مريض — لا رسائل مزعجة',                     en: '🛡️ 7-day cooldown per patient — no spam' },
  { ar: '📊 يسجل كل رسالة ونتيجتها لتتبع الأداء',                           en: '📊 Logs every message and result for performance tracking' },
];

export default function GrowthEngine() {
  const { language } = useLanguage();
  const permissions  = usePermissions();
  const { toast }    = useToast();
  const isAr         = language === 'ar';

  const [running,    setRunning]    = useState(false);
  const [lastResult, setLastResult] = useState<{ sent?: number; skipped?: number; segments?: Record<string, number> } | null>(null);
  const [stats,      setStats]      = useState<Stats | null>(null);
  const [logs,       setLogs]       = useState<LogEntry[]>([]);
  const [loading,    setLoading]    = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const token = getToken();
      const res   = await fetch('/api/growth/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setLogs(data.logs || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const runEngine = async () => {
    setRunning(true);
    setLastResult(null);
    try {
      const token = getToken();
      const res   = await fetch('/api/growth/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setLastResult(data);
      toast({
        title: isAr
          ? `تم الإرسال لـ ${data.sent ?? 0} مريض`
          : `Sent to ${data.sent ?? 0} patients`,
      });
      await fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: isAr ? 'فشل تشغيل المحرك' : 'Engine failed', description: msg, variant: 'destructive' });
    } finally { setRunning(false); }
  };

  if (!permissions.canViewPatients) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Lock className="h-8 w-8" />
        <p>{isAr ? 'غير مصرح لك بالوصول' : 'Access denied'}</p>
      </div>
    );
  }

  const segmentResultStr = lastResult?.segments
    ? Object.entries(lastResult.segments).map(([k, v]) => `${k}(${v})`).join(', ')
    : '';

  return (
    <div className="space-y-4 max-w-5xl" dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">
            {isAr ? 'محرك النمو — استبقاء المرضى' : 'Growth Engine — Patient Retention'}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm" className="h-8 text-xs gap-1"
            onClick={fetchStatus} disabled={loading}
            data-testid="button-refresh-growth"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm" className="h-8 text-xs gap-1.5"
            onClick={runEngine} disabled={running}
            data-testid="button-run-growth"
          >
            {running
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />{isAr ? 'جارٍ التشغيل…' : 'Running…'}</>
              : <><Zap className="h-3.5 w-3.5" />{isAr ? 'تشغيل المحرك' : 'Run Engine'}</>}
          </Button>
        </div>
      </div>

      {/* ── Last run result banner ── */}
      {lastResult && (
        <div className="rounded-lg border border-green-200 dark:border-green-800/40 bg-green-50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
          <Send className="h-4 w-4 shrink-0" />
          {isAr
            ? `✅ تم الإرسال لـ ${lastResult.sent ?? 0} مريض · تخطي ${lastResult.skipped ?? 0} · ${segmentResultStr}`
            : `✅ Sent to ${lastResult.sent ?? 0} patients · Skipped ${lastResult.skipped ?? 0} · ${segmentResultStr}`}
        </div>
      )}

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: isAr ? 'إجمالي الرسائل' : 'Total Messages', value: stats?.total   ?? 0, Icon: MessageSquare, color: 'text-primary' },
          { label: isAr ? 'تم الإرسال'     : 'Sent',           value: stats?.sent    ?? 0, Icon: Send,          color: 'text-green-600 dark:text-green-400' },
          { label: isAr ? 'في الانتظار'    : 'Pending (WA)',   value: stats?.pending ?? 0, Icon: Clock,         color: 'text-amber-600 dark:text-amber-400' },
          { label: isAr ? 'غير نشط'        : 'Inactive Found', value: stats?.segments?.inactive ?? 0, Icon: UserX, color: 'text-orange-600 dark:text-orange-400' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                <s.Icon className={`h-4 w-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Segment breakdown ── */}
      {stats && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              {isAr ? 'تقسيم المرضى حسب الشريحة' : 'Patient Segments Breakdown'}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(SEGMENT_META) as Segment[]).map(seg => {
                const { labelAr, labelEn, color, Icon } = SEGMENT_META[seg];
                const count = stats.segments[seg] ?? 0;
                return (
                  <div key={seg} className={`rounded-lg px-3 py-2.5 flex items-center gap-2 ${color}`}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-xs font-medium leading-tight">{isAr ? labelAr : labelEn}</p>
                      <p className="text-lg font-bold">{count}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── How it works ── */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm">{isAr ? 'كيف يعمل المحرك' : 'How it works'}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-muted-foreground">
            {HOW_IT_WORKS.map((item, i) => (
              <div key={i}>{isAr ? item.ar : item.en}</div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Message log ── */}
      {logs.length > 0 ? (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              {isAr ? 'سجل الرسائل الأخيرة' : 'Recent Messages Log'}
              <Badge variant="secondary" className="ms-auto text-[10px] h-4 px-1.5">{logs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="overflow-hidden border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-start px-2 py-1.5 font-medium text-muted-foreground">{isAr ? 'المريض' : 'Patient'}</th>
                    <th className="text-start px-2 py-1.5 font-medium text-muted-foreground">{isAr ? 'الشريحة' : 'Segment'}</th>
                    <th className="text-start px-2 py-1.5 font-medium text-muted-foreground hidden sm:table-cell">{isAr ? 'الرسالة' : 'Message'}</th>
                    <th className="text-start px-2 py-1.5 font-medium text-muted-foreground">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="text-start px-2 py-1.5 font-medium text-muted-foreground hidden md:table-cell">{isAr ? 'الوقت' : 'Time'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((l, i) => {
                    const seg = SEGMENT_META[l.segment];
                    const st  = STATUS_META[l.status] ?? STATUS_META.pending;
                    return (
                      <tr key={l.id || i} className="hover:bg-muted/30 transition-colors" data-testid={`row-growth-${i}`}>
                        <td className="px-2 py-2 font-medium">
                          <p>{l.patientName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{l.phone}</p>
                        </td>
                        <td className="px-2 py-2">
                          {seg && (
                            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${seg.color}`}>
                              {isAr ? seg.labelAr : seg.labelEn}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-muted-foreground max-w-xs truncate hidden sm:table-cell" dir="rtl">
                          {l.message}
                        </td>
                        <td className={`px-2 py-2 font-medium ${st.cls}`}>{isAr ? st.labelAr : st.labelEn}</td>
                        <td className="px-2 py-2 text-muted-foreground hidden md:table-cell">
                          {new Date(l.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        !loading && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
              <TrendingUp className="h-8 w-8" />
              <p className="text-sm">
                {isAr
                  ? 'لم يتم تشغيل المحرك بعد. اضغط "تشغيل المحرك" للبدء.'
                  : 'Engine has not run yet. Click "Run Engine" to start.'}
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
