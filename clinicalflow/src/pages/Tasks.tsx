import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { getToken } from '@/utils/authToken';
import {
  getClinicTasks, addTask, updateTask, deleteTask, completeTask,
  StaffTask, TaskPriority, TaskStatus,
} from '@/stores/taskStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { ClipboardList, Plus, Edit2, Trash2, Check, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

const PRIORITY_CONFIG: Record<TaskPriority, { en: string; ar: string; color: string }> = {
  urgent: { en: 'Urgent',  ar: 'عاجل',    color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700' },
  high:   { en: 'High',    ar: 'مرتفع',   color: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700' },
  medium: { en: 'Medium',  ar: 'متوسط',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-700' },
  low:    { en: 'Low',     ar: 'منخفض',   color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' },
};

const STATUS_CONFIG: Record<TaskStatus, { en: string; ar: string }> = {
  pending:     { en: 'Pending',     ar: 'قيد الانتظار' },
  in_progress: { en: 'In Progress', ar: 'جارٍ التنفيذ'  },
  completed:   { en: 'Completed',   ar: 'مكتملة'       },
  cancelled:   { en: 'Cancelled',   ar: 'ملغاة'        },
};

const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const emptyForm = {
  title: '', titleAr: '', description: '', descriptionAr: '',
  assignedToId: '', priority: 'medium' as TaskPriority,
  status: 'pending' as TaskStatus, dueDate: '',
};

function normaliseTask(t: any): StaffTask {
  return {
    id: t.id,
    clinicId: t.clinic_id ?? '',
    title: t.title ?? '',
    titleAr: t.title_ar ?? t.titleAr ?? t.title ?? '',
    description: t.description ?? '',
    descriptionAr: t.description_ar ?? t.descriptionAr ?? '',
    assignedToId: t.assigned_to ?? t.assignedToId ?? '',
    assignedById: t.assigned_by ?? t.assignedById ?? '',
    priority: (t.priority as TaskPriority) ?? 'medium',
    status: (t.status as TaskStatus) ?? 'pending',
    dueDate: t.due_date ?? t.dueDate ?? '',
    completedAt: t.completed_at ?? t.completedAt ?? undefined,
    createdAt: t.created_at ?? t.createdAt ?? new Date().toISOString(),
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

const Tasks: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { users: apiUsers } = useUsers();
  const token = getToken();
  const clinicId = user?.clinicId || 'clinic-1';

  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const staffUsers = useMemo(() => {
    if (apiUsers.length > 0) return apiUsers.filter(u => u.clinicId === clinicId);
    return apiUsers.filter(u => u.clinicId === clinicId);
  }, [apiUsers, clinicId]);

  const [filterStatus,   setFilterStatus]   = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');

  const [dialog, setDialog] = useState<{ open: boolean; editing?: StaffTask }>({ open: false });
  const [form, setForm]     = useState({ ...emptyForm });

  const load = useCallback(async () => {
    setLoading(true);
    if (!token) {
      setTasks(getClinicTasks(clinicId));
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<any[]>('/tasks');
      setTasks(data.map(normaliseTask));
    } catch {
      setTasks(getClinicTasks(clinicId));
    } finally {
      setLoading(false);
    }
  }, [clinicId, token]);

  useEffect(() => { load(); }, [load]);

  const todayStr = new Date().toISOString().split('T')[0];
  const stats = useMemo(() => ({
    total:          tasks.length,
    pending:        tasks.filter(t => t.status === 'pending').length,
    inProgress:     tasks.filter(t => t.status === 'in_progress').length,
    completedToday: tasks.filter(t => t.status === 'completed' && t.completedAt?.startsWith(todayStr)).length,
  }), [tasks, todayStr]);

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (filterStatus   !== 'all') list = list.filter(t => t.status   === filterStatus);
    if (filterPriority !== 'all') list = list.filter(t => t.priority === filterPriority);
    if (filterAssignee !== 'all') list = list.filter(t => t.assignedToId === filterAssignee);
    list.sort((a, b) => {
      const pd = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pd !== 0) return pd;
      return a.dueDate.localeCompare(b.dueDate);
    });
    return list;
  }, [tasks, filterStatus, filterPriority, filterAssignee]);

  const getUserName = (userId: string) => {
    const u = staffUsers.find(su => su.id === userId);
    if (!u) return userId;
    return language === 'ar' ? (u.nameAr || u.name) : u.name;
  };

  const openAdd = () => {
    setForm({ ...emptyForm, dueDate: todayStr, assignedToId: user?.id || '' });
    setDialog({ open: true });
  };

  const openEdit = (t: StaffTask) => {
    setForm({
      title: t.title, titleAr: t.titleAr,
      description: t.description, descriptionAr: t.descriptionAr,
      assignedToId: t.assignedToId, priority: t.priority,
      status: t.status, dueDate: t.dueDate,
    });
    setDialog({ open: true, editing: t });
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.titleAr.trim()) {
      toast.error(isRTL ? 'العنوان مطلوب بالعربي والإنجليزي' : 'Title required in both languages');
      return;
    }
    if (!form.assignedToId) {
      toast.error(isRTL ? 'يرجى تحديد الموظف المسؤول' : 'Please select an assignee');
      return;
    }
    setBusy(true);
    try {
      if (!token) {
        if (dialog.editing) {
          updateTask(dialog.editing.id, { ...form });
          toast.success(isRTL ? 'تم تحديث المهمة' : 'Task updated');
        } else {
          addTask({ ...form, clinicId, assignedById: user?.id || '' });
          toast.success(isRTL ? 'تمت إضافة المهمة' : 'Task added');
        }
        setDialog({ open: false });
        await load();
        return;
      }
      const payload = {
        title: form.title, title_ar: form.titleAr,
        description: form.description, description_ar: form.descriptionAr,
        assigned_to: form.assignedToId, priority: form.priority,
        status: form.status, due_date: form.dueDate,
      };
      if (dialog.editing) {
        await apiFetch(`/tasks/${dialog.editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast.success(isRTL ? 'تم تحديث المهمة' : 'Task updated');
      } else {
        await apiFetch('/tasks', { method: 'POST', body: JSON.stringify(payload) });
        toast.success(isRTL ? 'تمت إضافة المهمة' : 'Task added');
      }
      setDialog({ open: false });
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async (id: string) => {
    if (!token) {
      completeTask(id);
      await load();
      toast.success(isRTL ? 'تم إتمام المهمة' : 'Task completed');
      return;
    }
    try {
      await apiFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString() }) });
      await load();
      toast.success(isRTL ? 'تم إتمام المهمة' : 'Task completed');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) {
      deleteTask(id);
      await load();
      toast.success(isRTL ? 'تم حذف المهمة' : 'Task deleted');
      return;
    }
    try {
      await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
      await load();
      toast.success(isRTL ? 'تم حذف المهمة' : 'Task deleted');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isRTL ? 'إدارة المهام' : 'Task Management'}
          </h1>
          <p className="text-muted-foreground">
            {isRTL ? 'تتبع وإدارة مهام الموظفين' : 'Track and manage staff tasks'}
          </p>
        </div>
        <Button onClick={openAdd} className="flex items-center gap-2" data-testid="button-add-task">
          <Plus className="h-4 w-4" />
          {isRTL ? 'مهمة جديدة' : 'New Task'}
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {[
          { icon: <ClipboardList className="h-8 w-8 text-primary shrink-0" />, val: stats.total,          label: isRTL ? 'إجمالي المهام' : 'Total Tasks' },
          { icon: <Clock          className="h-8 w-8 text-yellow-500 shrink-0" />, val: stats.pending,        label: isRTL ? 'قيد الانتظار' : 'Pending' },
          { icon: <AlertTriangle  className="h-8 w-8 text-orange-500 shrink-0" />, val: stats.inProgress,     label: isRTL ? 'جارٍ التنفيذ' : 'In Progress' },
          { icon: <CheckCircle2   className="h-8 w-8 text-green-500 shrink-0"  />, val: stats.completedToday, label: isRTL ? 'مكتملة اليوم' : 'Completed Today' },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="p-4 flex items-center gap-3">
              {s.icon}
              <div>
                <p className="text-2xl font-bold">{s.val}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder={isRTL ? 'الحالة' : 'Status'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'كل الحالات' : 'All Statuses'}</SelectItem>
            {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
              <SelectItem key={s} value={s}>{isRTL ? STATUS_CONFIG[s].ar : STATUS_CONFIG[s].en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-40"><SelectValue placeholder={isRTL ? 'الأولوية' : 'Priority'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'كل الأولويات' : 'All Priorities'}</SelectItem>
            {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map(p => (
              <SelectItem key={p} value={p}>{isRTL ? PRIORITY_CONFIG[p].ar : PRIORITY_CONFIG[p].en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAssignee} onValueChange={setFilterAssignee}>
          <SelectTrigger className="w-48"><SelectValue placeholder={isRTL ? 'الموظف' : 'Assignee'} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isRTL ? 'كل الموظفين' : 'All Staff'}</SelectItem>
            {staffUsers.map(u => (
              <SelectItem key={u.id} value={u.id}>{language === 'ar' ? (u.nameAr || u.name) : u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ClipboardList className="h-12 w-12 mb-3 opacity-30" />
              <p>{isRTL ? 'لا توجد مهام' : 'No tasks found'}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? 'المهمة' : 'Task'}</TableHead>
                  <TableHead>{isRTL ? 'المسؤول' : 'Assigned To'}</TableHead>
                  <TableHead>{isRTL ? 'الأولوية' : 'Priority'}</TableHead>
                  <TableHead>{isRTL ? 'الحالة' : 'Status'}</TableHead>
                  <TableHead>{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</TableHead>
                  <TableHead>{isRTL ? 'الإجراءات' : 'Actions'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(t => (
                  <TableRow key={t.id} data-testid={`row-task-${t.id}`}>
                    <TableCell className="font-medium max-w-xs">
                      {isRTL ? t.titleAr : t.title}
                      {(isRTL ? t.descriptionAr : t.description) && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {isRTL ? t.descriptionAr : t.description}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{getUserName(t.assignedToId)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${PRIORITY_CONFIG[t.priority].color}`}>
                        {isRTL ? PRIORITY_CONFIG[t.priority].ar : PRIORITY_CONFIG[t.priority].en}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === 'completed' ? 'default' : t.status === 'cancelled' ? 'destructive' : 'outline'}>
                        {isRTL ? STATUS_CONFIG[t.status].ar : STATUS_CONFIG[t.status].en}
                      </Badge>
                    </TableCell>
                    <TableCell dir="ltr" className="text-sm">{t.dueDate}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {t.status !== 'completed' && t.status !== 'cancelled' && (
                          <Button variant="ghost" size="icon" className="text-green-600 hover:text-green-700" onClick={() => handleComplete(t.id)} title={isRTL ? 'إتمام' : 'Complete'} data-testid={`button-complete-task-${t.id}`}>
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)} data-testid={`button-edit-task-${t.id}`}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)} data-testid={`button-delete-task-${t.id}`}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog.open} onOpenChange={open => setDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog.editing ? (isRTL ? 'تعديل المهمة' : 'Edit Task') : (isRTL ? 'إضافة مهمة جديدة' : 'Add New Task')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isRTL ? 'العنوان (إنجليزي)' : 'Title (English)'}</Label>
                <Input data-testid="input-task-title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Prepare examination room" />
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'العنوان (عربي)' : 'Title (Arabic)'}</Label>
                <Input data-testid="input-task-title-ar" value={form.titleAr} onChange={e => setForm(f => ({ ...f, titleAr: e.target.value }))} placeholder="تجهيز غرفة الفحص" dir="rtl" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isRTL ? 'الوصف (إنجليزي)' : 'Description (English)'}</Label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'الوصف (عربي)' : 'Description (Arabic)'}</Label>
                <Input value={form.descriptionAr} onChange={e => setForm(f => ({ ...f, descriptionAr: e.target.value }))} dir="rtl" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'المسؤول عن المهمة' : 'Assigned To'}</Label>
              <Select value={form.assignedToId} onValueChange={val => setForm(f => ({ ...f, assignedToId: val }))}>
                <SelectTrigger data-testid="select-task-assignee"><SelectValue placeholder={isRTL ? 'اختر موظفاً' : 'Select staff member'} /></SelectTrigger>
                <SelectContent>
                  {staffUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{language === 'ar' ? (u.nameAr || u.name) : u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{isRTL ? 'الأولوية' : 'Priority'}</Label>
                <Select value={form.priority} onValueChange={val => setForm(f => ({ ...f, priority: val as TaskPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map(p => (
                      <SelectItem key={p} value={p}>{isRTL ? PRIORITY_CONFIG[p].ar : PRIORITY_CONFIG[p].en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{isRTL ? 'الحالة' : 'Status'}</Label>
                <Select value={form.status} onValueChange={val => setForm(f => ({ ...f, status: val as TaskStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{isRTL ? STATUS_CONFIG[s].ar : STATUS_CONFIG[s].en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>{isRTL ? 'تاريخ الاستحقاق' : 'Due Date'}</Label>
              <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} dir="ltr" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false })}>{isRTL ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={handleSave} disabled={busy} data-testid="button-save-task">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isRTL ? 'حفظ' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tasks;
