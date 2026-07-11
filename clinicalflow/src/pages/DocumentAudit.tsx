import { useState, useMemo } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useDocumentAudit } from '@/hooks/useDocumentAudit';
import { useDocuments } from '@/hooks/useDocuments';
import { useUsers } from '@/hooks/useUsers';
import { usePatients } from '@/hooks/usePatients';
import { DocumentAuditAction } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Shield, Search, Eye, Upload, Download, FileText, Trash2,
  User, ClipboardList, FlaskConical, Scan, Pencil,
} from 'lucide-react';

type ActionMeta = { icon: React.ElementType; label: string; labelAr: string; color: string };

const ACTION_CONFIG: Record<DocumentAuditAction, ActionMeta> = {
  view:              { icon: Eye,          label: 'View Document',      labelAr: 'عرض مستند',          color: 'bg-blue-600/15 text-blue-700 dark:bg-blue-400/20 dark:text-blue-300' },
  upload:            { icon: Upload,       label: 'Upload',             labelAr: 'رفع',                color: 'bg-green-600/15 text-green-700 dark:bg-green-400/20 dark:text-green-300' },
  download:          { icon: Download,     label: 'Download',           labelAr: 'تحميل',              color: 'bg-purple-600/15 text-purple-700 dark:bg-purple-400/20 dark:text-purple-300' },
  delete:            { icon: Trash2,       label: 'Delete',             labelAr: 'حذف',                color: 'bg-red-600/15 text-red-700 dark:bg-red-400/20 dark:text-red-300' },
  view_patient:      { icon: User,         label: 'View Patient',       labelAr: 'عرض ملف مريض',       color: 'bg-sky-600/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300' },
  view_prescription: { icon: ClipboardList,label: 'View Prescription',  labelAr: 'عرض وصفة طبية',     color: 'bg-amber-600/15 text-amber-700 dark:bg-amber-400/20 dark:text-amber-300' },
  edit_prescription: { icon: Pencil,       label: 'Edit Prescription',  labelAr: 'تعديل وصفة طبية',   color: 'bg-orange-600/15 text-orange-700 dark:bg-orange-400/20 dark:text-orange-300' },
  view_lab:          { icon: FlaskConical, label: 'View Lab Result',    labelAr: 'عرض نتيجة مختبر',   color: 'bg-teal-600/15 text-teal-700 dark:bg-teal-400/20 dark:text-teal-300' },
  view_radiology:    { icon: Scan,         label: 'View Radiology',     labelAr: 'عرض أشعة',          color: 'bg-indigo-600/15 text-indigo-700 dark:bg-indigo-400/20 dark:text-indigo-300' },
};

const ACTION_GROUPS = [
  { label: 'Documents', labelAr: 'المستندات', actions: ['view', 'upload', 'download', 'delete'] },
  { label: 'Patient Records', labelAr: 'ملفات المرضى', actions: ['view_patient'] },
  { label: 'Prescriptions', labelAr: 'الوصفات', actions: ['view_prescription', 'edit_prescription'] },
  { label: 'Lab & Radiology', labelAr: 'المختبر والأشعة', actions: ['view_lab', 'view_radiology'] },
];

const DocumentAudit: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { auditLogs } = useDocumentAudit();
  const { documents } = useDocuments();
  const { users } = useUsers();
  const { patients } = usePatients();
  const isAr = language === 'ar';
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const allUsers = users;

  const getUserName = (id: string) => {
    const u = allUsers.find(usr => usr.id === id);
    return u ? (isAr ? u.nameAr : u.name) : id;
  };

  const getPatientName = (id: string) => {
    const p = patients.find(pt => pt.id === id);
    return p ? (isAr ? p.nameAr : p.name) : id;
  };

  const getResourceLabel = (documentId: string) => {
    if (documentId.startsWith('patient:')) return isAr ? 'ملف المريض' : 'Patient Profile';
    if (documentId.startsWith('rx:')) return isAr ? 'وصفة طبية' : 'Prescription';
    const d = documents.find(doc => doc.id === documentId);
    return d ? (isAr ? d.titleAr : d.title) : documentId;
  };

  const clinicLogs = user?.role === 'super_admin'
    ? auditLogs
    : auditLogs.filter(l => !l.clinicId || l.clinicId === user?.clinicId);

  const filteredLogs = useMemo(() => {
    let logs = [...clinicLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (actionFilter !== 'all') {
      logs = logs.filter(l => l.action === actionFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      logs = logs.filter(l =>
        getUserName(l.userId).toLowerCase().includes(q) ||
        getPatientName(l.patientId).toLowerCase().includes(q) ||
        getResourceLabel(l.documentId).toLowerCase().includes(q)
      );
    }

    return logs;
  }, [clinicLogs, actionFilter, searchQuery]);

  const stats = useMemo(() => ({
    total: clinicLogs.length,
    docAccess: clinicLogs.filter(l => ['view', 'download'].includes(l.action)).length,
    uploads: clinicLogs.filter(l => l.action === 'upload').length,
    sensitive: clinicLogs.filter(l => ['view_prescription', 'edit_prescription', 'view_lab', 'view_radiology'].includes(l.action)).length,
  }), [clinicLogs]);

  if (user?.role !== 'admin' && user?.role !== 'super_admin') {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">{isAr ? 'غير مصرح' : 'Unauthorized'}</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-audit-title">
            {isAr ? 'سجل مراجعة الوصول الطبي' : 'Medical Access Audit Log'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAr ? 'تتبع جميع عمليات الوصول للبيانات الطبية الحساسة' : 'Track all access to sensitive medical data'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { value: stats.total, label: isAr ? 'إجمالي السجلات' : 'Total Records', color: 'text-foreground' },
          { value: stats.docAccess, label: isAr ? 'عرض المستندات' : 'Document Views', color: 'text-blue-600' },
          { value: stats.uploads, label: isAr ? 'عمليات الرفع' : 'Uploads', color: 'text-green-600' },
          { value: stats.sensitive, label: isAr ? 'وصول حساس' : 'Sensitive Access', color: 'text-amber-600' },
        ].map(({ value, label, color }) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-base">{isAr ? 'سجل الوصول' : 'Access Log'}</CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial sm:min-w-[220px]">
                <Search className={`absolute top-2.5 h-4 w-4 text-muted-foreground ${isAr ? 'right-2.5' : 'left-2.5'}`} />
                <Input
                  placeholder={isAr ? 'بحث...' : 'Search...'}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={isAr ? 'pr-8' : 'pl-8'}
                  data-testid="input-search-audit"
                />
              </div>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[160px]" data-testid="select-audit-action">
                  <SelectValue placeholder={isAr ? 'جميع الإجراءات' : 'All Actions'} />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="all">{isAr ? 'جميع الإجراءات' : 'All Actions'}</SelectItem>
                  {ACTION_GROUPS.map(group => (
                    <div key={group.label}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t first:border-t-0 mt-1">
                        {isAr ? group.labelAr : group.label}
                      </div>
                      {group.actions.map(action => (
                        <SelectItem key={action} value={action}>
                          {isAr ? ACTION_CONFIG[action as DocumentAuditAction].labelAr : ACTION_CONFIG[action as DocumentAuditAction].label}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isAr ? 'التاريخ والوقت' : 'Date & Time'}</TableHead>
                  <TableHead>{isAr ? 'المستخدم' : 'User'}</TableHead>
                  <TableHead>{isAr ? 'المريض' : 'Patient'}</TableHead>
                  <TableHead>{isAr ? 'المورد' : 'Resource'}</TableHead>
                  <TableHead>{isAr ? 'الإجراء' : 'Action'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {isAr ? 'لا توجد سجلات' : 'No audit records found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map(log => {
                    const cfg = ACTION_CONFIG[log.action] ?? ACTION_CONFIG.view;
                    const Icon = cfg.icon;
                    return (
                      <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="font-medium">{getUserName(log.userId)}</TableCell>
                        <TableCell>{getPatientName(log.patientId)}</TableCell>
                        <TableCell className="max-w-[200px]">
                          <div className="flex items-center gap-1.5 truncate">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                            <span className="truncate">{getResourceLabel(log.documentId)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={`gap-1 whitespace-nowrap ${cfg.color}`}>
                            <Icon className="h-3 w-3" />
                            {isAr ? cfg.labelAr : cfg.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentAudit;
