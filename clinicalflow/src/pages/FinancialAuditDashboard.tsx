import React, { useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { getClinicAuditLogs, AuditLog } from '@/stores/auditStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Lock, Receipt, Tag, Undo2, ShieldX, Activity } from 'lucide-react';

// ─── Thresholds for anomaly detection ────────────────────────────────────────
const REFUND_ALERT_THRESHOLD    = 3;  // >3 refunds within 60 minutes
const HIGH_DISC_ALERT_THRESHOLD = 2;  // >2 high-discount approvals within 1 day

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isRefund(log: AuditLog)       { return log.entity === 'invoice' && log.action === 'delete'; }
function isHighDiscount(log: AuditLog) {
  return log.entity === 'invoice' && log.action === 'update' &&
    log.description.toLowerCase().includes('%') &&
    (() => { const m = log.description.match(/(\d+)%/); return m ? parseInt(m[1]) > 30 : false; })();
}
function isPayment(log: AuditLog)  { return log.entity === 'invoice' && log.action === 'update' && log.description.toLowerCase().includes('payment'); }
function isDenied(log: AuditLog)   { return log.action === 'denied' && log.entity === 'invoice'; }

function todayStr() { return new Date().toISOString().slice(0, 10); }
function isToday(log: AuditLog)    { return log.createdAt.slice(0, 10) === todayStr(); }

// ─── Row color per action type ────────────────────────────────────────────────
function rowClass(log: AuditLog): string {
  if (isRefund(log))       return 'bg-red-50 border-l-4 border-red-500 dark:bg-red-950/20';
  if (isDenied(log))       return 'bg-red-50 border-l-4 border-red-400 dark:bg-red-950/20';
  if (isHighDiscount(log)) return 'bg-orange-50 border-l-4 border-orange-400 dark:bg-orange-950/20';
  if (isPayment(log))      return 'bg-green-50/50 dark:bg-transparent';
  return '';
}

function actionLabel(log: AuditLog, isAr: boolean): string {
  if (isRefund(log))       return isAr ? 'استرداد' : 'Refund';
  if (isHighDiscount(log)) return isAr ? 'خصم كبير' : 'High Discount';
  if (isPayment(log))      return isAr ? 'دفعة' : 'Payment';
  if (isDenied(log))       return isAr ? 'محظور' : 'Denied';
  return log.action;
}

function actionBadgeStyle(log: AuditLog): string {
  if (isRefund(log))       return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
  if (isDenied(log))       return 'bg-red-200 text-red-900 dark:bg-red-900/60 dark:text-red-200';
  if (isHighDiscount(log)) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
  if (isPayment(log))      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
  return 'bg-muted text-muted-foreground';
}

// ─── Widget card ──────────────────────────────────────────────────────────────
function Widget({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const FinancialAuditDashboard: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { doctors } = useUsers();
  const isAr = language === 'ar';

  const clinicId = user?.clinicId ?? 'clinic-1';

  const [filterType, setFilterType] = useState<'all' | 'payment' | 'discount' | 'refund' | 'denied'>('all');
  const [filterDate, setFilterDate] = useState(todayStr());
  const [search, setSearch]         = useState('');

  // ─── Raw invoice logs ──────────────────────────────────────────
  const allLogs = getClinicAuditLogs(clinicId, 1000);
  const invoiceLogs = allLogs.filter(l => l.entity === 'invoice');

  // ─── Today's summary counts ────────────────────────────────────
  const todayLogs         = invoiceLogs.filter(isToday);
  const refundsToday      = todayLogs.filter(isRefund).length;
  const highDiscountsToday= todayLogs.filter(isHighDiscount).length;
  const paymentsToday     = todayLogs.filter(isPayment).length;
  const deniedToday       = todayLogs.filter(isDenied).length;

  // ─── Anomaly detection ─────────────────────────────────────────
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const refundsLastHour = invoiceLogs.filter(
    l => isRefund(l) && new Date(l.createdAt).getTime() > oneHourAgo
  ).length;
  const anomalyRefund   = refundsLastHour   > REFUND_ALERT_THRESHOLD;
  const anomalyDiscount = highDiscountsToday > HIGH_DISC_ALERT_THRESHOLD;
  const showAlert       = anomalyRefund || anomalyDiscount;

  const alertMessage = useMemo(() => {
    const parts: string[] = [];
    if (anomalyRefund)   parts.push(isAr ? `${refundsLastHour} استردادات في آخر ساعة` : `${refundsLastHour} refunds in the last hour`);
    if (anomalyDiscount) parts.push(isAr ? `${highDiscountsToday} خصومات كبيرة اليوم` : `${highDiscountsToday} high discounts today`);
    return parts.join(' — ');
  }, [anomalyRefund, anomalyDiscount, refundsLastHour, highDiscountsToday, isAr]);

  // ─── Filtered log list ─────────────────────────────────────────
  const filtered = useMemo(() => {
    return invoiceLogs.filter(l => {
      if (filterDate && !l.createdAt.startsWith(filterDate)) return false;
      if (filterType === 'payment'  && !isPayment(l))      return false;
      if (filterType === 'discount' && !isHighDiscount(l)) return false;
      if (filterType === 'refund'   && !isRefund(l))       return false;
      if (filterType === 'denied'   && !isDenied(l))       return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          l.description.toLowerCase().includes(q) ||
          (l.entityId ?? '').toLowerCase().includes(q) ||
          (l.userName ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [invoiceLogs, filterType, filterDate, search]);

  // ─── Guard ────────────────────────────────────────────────────
  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <Lock className="h-12 w-12 opacity-30" />
        <p>{isAr ? 'ليس لديك صلاحية لعرض هذه الصفحة' : 'Admin access required'}</p>
      </div>
    );
  }

  const getUserName = (log: AuditLog) => {
    if (log.userName) return log.userName;
    if (!log.userId)  return isAr ? 'النظام' : 'System';
    const d = doctors.find(doc => doc.id === log.userId);
    return d ? (isAr ? d.nameAr || d.name : d.name) : log.userId.slice(0, 10);
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── Page title ── */}
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">{isAr ? 'مراقبة النشاط المالي' : 'Financial Activity Monitor'}</h1>
      </div>

      {/* ── Anomaly Alert Banner ── */}
      {showAlert && (
        <div className="flex items-start gap-3 rounded-lg border border-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-400">
              {isAr ? 'نشاط غير طبيعي في النظام' : 'Unusual Financial Activity Detected'}
            </p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">{alertMessage}</p>
          </div>
        </div>
      )}

      {/* ── Summary widgets ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Widget icon={Receipt}  label={isAr ? 'دفعات اليوم'      : 'Payments Today'}       value={paymentsToday}      color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" />
        <Widget icon={Undo2}    label={isAr ? 'استردادات اليوم'  : 'Refunds Today'}         value={refundsToday}       color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" />
        <Widget icon={Tag}      label={isAr ? 'خصومات كبيرة اليوم' : 'High Discounts Today'} value={highDiscountsToday} color="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" />
        <Widget icon={ShieldX}  label={isAr ? 'طلبات محظورة'     : 'Denied Attempts'}       value={deniedToday}        color="bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400" />
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">{isAr ? 'سجل العمليات المالية' : 'Financial Operations Log'}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder={isAr ? 'بحث...' : 'Search...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs w-44"
            />
            <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? 'الكل' : 'All'}</SelectItem>
                <SelectItem value="payment">{isAr ? 'دفعات' : 'Payments'}</SelectItem>
                <SelectItem value="discount">{isAr ? 'خصومات كبيرة' : 'High Discounts'}</SelectItem>
                <SelectItem value="refund">{isAr ? 'استردادات' : 'Refunds'}</SelectItem>
                <SelectItem value="denied">{isAr ? 'محظورة' : 'Denied'}</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="h-8 text-xs w-38"
            />
          </div>

          {/* ── Log table ── */}
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {isAr ? 'لا توجد سجلات' : 'No records found'}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{isAr ? 'النوع' : 'Type'}</th>
                    <th className="px-3 py-2 text-start font-medium">{isAr ? 'المستخدم' : 'User'}</th>
                    <th className="px-3 py-2 text-start font-medium">{isAr ? 'التفاصيل' : 'Details'}</th>
                    <th className="px-3 py-2 text-start font-medium">{isAr ? 'الفاتورة' : 'Invoice'}</th>
                    <th className="px-3 py-2 text-start font-medium">{isAr ? 'الوقت' : 'Time'}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map(log => (
                    <tr key={log.id} className={`border-t ${rowClass(log)}`}>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${actionBadgeStyle(log)}`}>
                          {actionLabel(log, isAr)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {getUserName(log)}
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate text-muted-foreground">
                        {log.description}
                      </td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">
                        {log.entityId ? log.entityId.slice(0, 14) + '…' : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {fmtDate(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 100 && (
                <p className="text-xs text-muted-foreground px-3 py-2 border-t">
                  {isAr ? `عرض 100 من ${filtered.length}` : `Showing 100 of ${filtered.length}`}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FinancialAuditDashboard;
