import React, { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { usePermissions } from '@/hooks/usePermissions';
import {
  getClinicAuditLogs, getWarningLogs, getSecurityEvents, resolveSecurityEvent,
  clearOldLogs, AuditLog, AuditAction, AuditEntity, SecurityEvent,
} from '@/stores/auditStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { ShieldAlert, ShieldCheck, Eye, FileClock, AlertTriangle, Trash2, Search, Lock } from 'lucide-react';

// ─── Severity badge ───────────────────────────────────────────────────────────
function SeverityBadge({ s }: { s: string }) {
  if (s === 'critical') return <Badge className="bg-red-600 text-white text-xs">critical</Badge>;
  if (s === 'warn')     return <Badge className="bg-yellow-500 text-white text-xs">warn</Badge>;
  return <Badge variant="outline" className="text-xs">info</Badge>;
}

// ─── Action badge ─────────────────────────────────────────────────────────────
const ACTION_COLORS: Record<AuditAction, string> = {
  create:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  update:  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  delete:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  view:    'bg-muted text-muted-foreground',
  login:   'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  logout:  'bg-muted text-muted-foreground',
  export:  'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  denied:  'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-300',
};

function ActionBadge({ action }: { action: AuditAction }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[action] ?? 'bg-muted text-muted-foreground'}`}>
      {action}
    </span>
  );
}

const AuditLogPage: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { doctors } = useUsers();
  const permissions = usePermissions();
  const isAr = language === 'ar';

  const clinicId = user?.clinicId ?? 'clinic-1';

  // ─── State ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('logs');
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('all');
  const [filterAction, setFilterAction] = useState<'all' | AuditAction>('all');
  const [filterEntity, setFilterEntity] = useState<'all' | AuditEntity>('all');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'warn' | 'critical'>('all');
  const [tick, setTick] = useState(0);

  // ─── Data ─────────────────────────────────────────────────────
  const allLogs = useMemo(() => getClinicAuditLogs(clinicId, 500), [clinicId, tick]);
  const warnings = useMemo(() => getWarningLogs(clinicId), [clinicId, tick]);
  const secEvents = useMemo(() => getSecurityEvents(clinicId), [clinicId, tick]);

  // ─── Filtered logs ────────────────────────────────────────────
  const filtered = useMemo(() => {
    return allLogs.filter(l => {
      if (filterUser !== 'all' && l.userId !== filterUser) return false;
      if (filterAction !== 'all' && l.action !== filterAction) return false;
      if (filterEntity !== 'all' && l.entity !== filterEntity) return false;
      if (filterSeverity !== 'all' && l.severity !== filterSeverity) return false;
      if (search) {
        const q = search.toLowerCase();
        return l.description.toLowerCase().includes(q) ||
          l.entity.toLowerCase().includes(q) ||
          (l.entityId ?? '').toLowerCase().includes(q) ||
          (l.userName ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [allLogs, filterUser, filterAction, filterEntity, filterSeverity, search]);

  // ─── Helpers ──────────────────────────────────────────────────
  const getUserName = (userId?: string) => {
    if (!userId) return isAr ? 'النظام' : 'System';
    const d = doctors.find(doc => doc.id === userId);
    return d ? (isAr ? d.nameAr || d.name : d.name) : userId.slice(0, 10);
  };

  const handleResolve = (id: string) => {
    resolveSecurityEvent(id);
    setTick(t => t + 1);
    toast.success(isAr ? 'تم حل الحدث الأمني' : 'Security event resolved');
  };

  const handleClearOld = () => {
    const deleted = clearOldLogs(clinicId, 90);
    setTick(t => t + 1);
    toast.success(isAr ? `تم حذف ${deleted} سجل قديم` : `Cleared ${deleted} old logs`);
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleString(isAr ? 'ar-EG' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  // ─── Guard ────────────────────────────────────────────────────
  if (!permissions.canViewDocumentAudit && user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
        <Lock className="h-12 w-12 opacity-30" />
        <p>{isAr ? 'لا تملك صلاحية الوصول لسجل المراجعة' : 'You do not have access to the audit log'}</p>
      </div>
    );
  }

  const ACTIONS: AuditAction[] = ['create', 'update', 'delete', 'view', 'login', 'logout', 'export', 'denied'];
  const ENTITIES: AuditEntity[] = ['patient', 'appointment', 'invoice', 'user', 'prescription', 'document', 'inventory', 'claim', 'report', 'settings'];

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-primary" />
            {isAr ? 'سجل المراجعة والأمان' : 'Audit & Security Log'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isAr ? 'تتبع جميع العمليات والأحداث الأمنية' : 'Track all operations and security events'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleClearOld} className="gap-2 text-xs">
          <Trash2 className="h-3.5 w-3.5" />
          {isAr ? 'حذف السجلات القديمة (+90 يوم)' : 'Clear old logs (90+ days)'}
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: isAr ? 'إجمالي السجلات' : 'Total Logs',      value: allLogs.length,   icon: FileClock,    color: 'text-blue-600' },
          { label: isAr ? 'تحذيرات' : 'Warnings',                value: warnings.length,  icon: AlertTriangle, color: 'text-yellow-600' },
          { label: isAr ? 'أحداث أمنية نشطة' : 'Active Security', value: secEvents.length, icon: ShieldAlert,  color: 'text-red-600' },
          { label: isAr ? 'عمليات اليوم' : 'Today\'s Actions',   value: allLogs.filter(l => l.createdAt.startsWith(new Date().toISOString().slice(0, 10))).length, icon: Eye, color: 'text-green-600' },
        ].map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`h-8 w-8 ${k.color} shrink-0`} />
              <div>
                <p className="text-xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="logs">{isAr ? 'سجل العمليات' : 'Activity Log'}</TabsTrigger>
          <TabsTrigger value="security" className="relative">
            {isAr ? 'الأحداث الأمنية' : 'Security Events'}
            {secEvents.length > 0 && (
              <span className="ms-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 inline-flex items-center justify-center">{secEvents.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="warnings">{isAr ? 'التحذيرات' : 'Warnings'}</TabsTrigger>
        </TabsList>

        {/* ── Activity Log ── */}
        <TabsContent value="logs" className="mt-4 space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="relative flex-1 min-w-40">
              <Search className="absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="ps-8 h-8 text-xs" placeholder={isAr ? 'بحث...' : 'Search...'}
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder={isAr ? 'المستخدم' : 'User'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? 'كل المستخدمين' : 'All Users'}</SelectItem>
                {doctors.map(d => <SelectItem key={d.id} value={d.id}>{isAr ? d.nameAr || d.name : d.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterAction} onValueChange={v => setFilterAction(v as any)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder={isAr ? 'الإجراء' : 'Action'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? 'كل الإجراءات' : 'All Actions'}</SelectItem>
                {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterEntity} onValueChange={v => setFilterEntity(v as any)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder={isAr ? 'الكيان' : 'Entity'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? 'كل الكيانات' : 'All Entities'}</SelectItem>
                {ENTITIES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSeverity} onValueChange={v => setFilterSeverity(v as any)}>
              <SelectTrigger className="h-8 w-28 text-xs"><SelectValue placeholder={isAr ? 'الخطورة' : 'Severity'} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isAr ? 'الكل' : 'All'}</SelectItem>
                <SelectItem value="warn">{isAr ? 'تحذير' : 'Warn'}</SelectItem>
                <SelectItem value="critical">{isAr ? 'حرج' : 'Critical'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">{isAr ? `${filtered.length} سجل` : `${filtered.length} records`}</p>

          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">{isAr ? 'الوقت' : 'Time'}</TableHead>
                  <TableHead className="text-xs">{isAr ? 'المستخدم' : 'User'}</TableHead>
                  <TableHead className="text-xs">{isAr ? 'الإجراء' : 'Action'}</TableHead>
                  <TableHead className="text-xs">{isAr ? 'الكيان' : 'Entity'}</TableHead>
                  <TableHead className="text-xs">{isAr ? 'الوصف' : 'Description'}</TableHead>
                  <TableHead className="text-xs">{isAr ? 'الخطورة' : 'Severity'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                      {isAr ? 'لا توجد سجلات' : 'No log entries found'}
                    </TableCell>
                  </TableRow>
                ) : filtered.slice(0, 200).map(log => (
                  <TableRow key={log.id} className={log.severity === 'critical' ? 'bg-red-50 dark:bg-red-950/20' : log.severity === 'warn' ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(log.createdAt)}</TableCell>
                    <TableCell className="text-xs font-medium">{log.userName ?? getUserName(log.userId)}</TableCell>
                    <TableCell><ActionBadge action={log.action} /></TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono">{log.entity}</span>
                      {log.entityId && <span className="text-muted-foreground"> ·{log.entityId.slice(0, 8)}</span>}
                    </TableCell>
                    <TableCell className="text-xs max-w-64 truncate">{log.description}</TableCell>
                    <TableCell><SeverityBadge s={log.severity} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Security Events ── */}
        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-red-500" />
                {isAr ? 'الأحداث الأمنية غير المحلولة' : 'Unresolved Security Events'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {secEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ShieldCheck className="h-12 w-12 mb-3 text-green-500 opacity-60" />
                  <p>{isAr ? 'لا توجد أحداث أمنية نشطة' : 'No active security events'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {secEvents.map(ev => (
                    <div key={ev.id} className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono bg-red-200 text-red-900 px-2 py-0.5 rounded">{ev.eventType}</span>
                          <span className="text-xs text-muted-foreground">{fmtDate(ev.createdAt)}</span>
                        </div>
                        <p className="text-sm text-foreground">{ev.description}</p>
                        {ev.userId && <p className="text-xs text-muted-foreground">{isAr ? 'المستخدم:' : 'User:'} {getUserName(ev.userId)}</p>}
                      </div>
                      <Button variant="outline" size="sm" className="text-green-700 border-green-300 h-7 text-xs shrink-0"
                        onClick={() => handleResolve(ev.id)}>
                        <ShieldCheck className="h-3.5 w-3.5 me-1" />
                        {isAr ? 'حل' : 'Resolve'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Warnings ── */}
        <TabsContent value="warnings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                {isAr ? 'التحذيرات والأنشطة المشبوهة' : 'Warnings & Suspicious Activity'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {warnings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ShieldCheck className="h-12 w-12 mb-3 text-green-500 opacity-60" />
                  <p>{isAr ? 'لا توجد تحذيرات' : 'No warnings'}</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">{isAr ? 'الوقت' : 'Time'}</TableHead>
                        <TableHead className="text-xs">{isAr ? 'المستخدم' : 'User'}</TableHead>
                        <TableHead className="text-xs">{isAr ? 'الوصف' : 'Description'}</TableHead>
                        <TableHead className="text-xs">{isAr ? 'الخطورة' : 'Severity'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warnings.slice(0, 100).map(log => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(log.createdAt)}</TableCell>
                          <TableCell className="text-xs">{log.userName ?? getUserName(log.userId)}</TableCell>
                          <TableCell className="text-xs max-w-80 truncate">{log.description}</TableCell>
                          <TableCell><SeverityBadge s={log.severity} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuditLogPage;
