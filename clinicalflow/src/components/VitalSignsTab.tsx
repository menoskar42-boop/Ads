import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useVitalSigns } from '@/hooks/useVitalSigns';
import { useUsers } from '@/hooks/useUsers';
import { useAuth } from '@/hooks/useAuth';
import { formatDate } from '@/lib/dateFormat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, Heart, Thermometer, Weight, Activity, Droplets } from 'lucide-react';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface VitalSignsTabProps {
  patientId: string;
}

const initialForm = {
  systolic: '', diastolic: '', heartRate: '', temperature: '', weight: '', height: '', oxygenSaturation: '', notes: '', recordedAt: new Date().toISOString().split('T')[0],
};

const getBPStatus = (sys: number, dia: number) => {
  if (sys >= 140 || dia >= 90) return { label: 'High', labelAr: 'مرتفع', color: 'bg-destructive/10 text-destructive' };
  if (sys >= 120 || dia >= 80) return { label: 'Elevated', labelAr: 'مرتفع قليلاً', color: 'bg-chart-4/10 text-chart-4' };
  return { label: 'Normal', labelAr: 'طبيعي', color: 'bg-chart-2/10 text-chart-2' };
};

const VitalSignsTab: React.FC<VitalSignsTabProps> = ({ patientId }) => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { vitals, addVital, updateVital, deleteVital } = useVitalSigns({ patientId });
  const { users } = useUsers();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);

  const patientVitals = vitals
    .filter(v => v.patientId === patientId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  const getDoctorName = (doctorId: string) => {
    const u = users.find(x => x.id === doctorId);
    return language === 'ar' ? u?.nameAr : u?.name;
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...initialForm, recordedAt: new Date().toISOString().split('T')[0] });
    setDialogOpen(true);
  };

  const openEdit = (id: string) => {
    const v = vitals.find(x => x.id === id);
    if (!v) return;
    setEditingId(id);
    setForm({
      systolic: String(v.systolic), diastolic: String(v.diastolic),
      heartRate: String(v.heartRate), temperature: String(v.temperature),
      weight: String(v.weight), height: v.height ? String(v.height) : '',
      oxygenSaturation: v.oxygenSaturation ? String(v.oxygenSaturation) : '',
      notes: v.notes || '', recordedAt: v.recordedAt.split('T')[0],
    });
    setDialogOpen(true);
  };

  const saveVital = () => {
    const sys = Number(form.systolic);
    const dia = Number(form.diastolic);
    const hr = Number(form.heartRate);
    const temp = Number(form.temperature);
    const wt = Number(form.weight);
    if (!sys || !dia || !hr || !temp || !wt) {
      toast.error(language === 'ar' ? 'يرجى ملء الحقول المطلوبة' : 'Please fill required fields');
      return;
    }
    const data = {
      patientId,
      doctorId: user?.id || 'doc-1',
      systolic: sys, diastolic: dia, heartRate: hr, temperature: temp, weight: wt,
      height: form.height ? Number(form.height) : undefined,
      oxygenSaturation: form.oxygenSaturation ? Number(form.oxygenSaturation) : undefined,
      notes: form.notes || undefined,
      recordedAt: new Date(form.recordedAt).toISOString(),
    };
    if (editingId) {
      updateVital(editingId, data);
      toast.success(language === 'ar' ? 'تم تحديث القراءة' : 'Vitals updated');
    } else {
      addVital(data);
      toast.success(language === 'ar' ? 'تمت إضافة القراءة' : 'Vitals recorded');
    }
    setDialogOpen(false);
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteVital(deleteId);
      toast.success(language === 'ar' ? 'تم حذف القراءة' : 'Vitals deleted');
      setDeleteId(null);
    }
  };

  // Chart data (chronological)
  const chartData = [...patientVitals].reverse().map(v => ({
    date: formatDate(v.recordedAt.split('T')[0], language),
    [language === 'ar' ? 'انقباضي' : 'Systolic']: v.systolic,
    [language === 'ar' ? 'انبساطي' : 'Diastolic']: v.diastolic,
    [language === 'ar' ? 'نبض القلب' : 'Heart Rate']: v.heartRate,
  }));

  const latest = patientVitals[0];

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      {latest && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Heart className="h-4 w-4 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'ضغط الدم' : 'Blood Pressure'}</p>
                  <p className="font-semibold text-sm text-foreground">{latest.systolic}/{latest.diastolic} <span className="text-xs font-normal text-muted-foreground">mmHg</span></p>
                  <Badge className={getBPStatus(latest.systolic, latest.diastolic).color} variant="secondary">
                    {language === 'ar' ? getBPStatus(latest.systolic, latest.diastolic).labelAr : getBPStatus(latest.systolic, latest.diastolic).label}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-chart-1/10 flex items-center justify-center">
                  <Activity className="h-4 w-4 text-chart-1" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'نبض القلب' : 'Heart Rate'}</p>
                  <p className="font-semibold text-sm text-foreground">{latest.heartRate} <span className="text-xs font-normal text-muted-foreground">bpm</span></p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-chart-3/10 flex items-center justify-center">
                  <Thermometer className="h-4 w-4 text-chart-3" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'الحرارة' : 'Temperature'}</p>
                  <p className="font-semibold text-sm text-foreground">{latest.temperature} <span className="text-xs font-normal text-muted-foreground">°C</span></p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-chart-2/10 flex items-center justify-center">
                  <Weight className="h-4 w-4 text-chart-2" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{language === 'ar' ? 'الوزن' : 'Weight'}</p>
                  <p className="font-semibold text-sm text-foreground">{latest.weight} <span className="text-xs font-normal text-muted-foreground">kg</span></p>
                  {latest.height && (
                    <p className="text-xs text-muted-foreground">BMI: {(latest.weight / ((latest.height / 100) ** 2)).toFixed(1)}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trend Chart */}
      {chartData.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{language === 'ar' ? 'اتجاه العلامات الحيوية' : 'Vital Signs Trend'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }} />
                <Legend />
                <Line type="monotone" dataKey={language === 'ar' ? 'انقباضي' : 'Systolic'} stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey={language === 'ar' ? 'انبساطي' : 'Diastolic'} stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey={language === 'ar' ? 'نبض القلب' : 'Heart Rate'} stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">{language === 'ar' ? 'سجل القراءات' : 'Records History'}</h3>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          {language === 'ar' ? 'إضافة قراءة' : 'Record Vitals'}
        </Button>
      </div>

      {/* Records List */}
      {patientVitals.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {language === 'ar' ? 'لا توجد قراءات للعلامات الحيوية' : 'No vital signs recorded'}
          </CardContent>
        </Card>
      ) : (
        patientVitals.map(v => {
          const bpStatus = getBPStatus(v.systolic, v.diastolic);
          return (
            <Card key={v.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="text-xs text-muted-foreground">
                    {formatDate(v.recordedAt.split('T')[0], language)} • {getDoctorName(v.doctorId) || '—'}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v.id)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(v.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Heart className="h-3.5 w-3.5 text-destructive" />
                    <span className="text-foreground">{v.systolic}/{v.diastolic}</span>
                    <Badge className={bpStatus.color} variant="secondary">
                      {language === 'ar' ? bpStatus.labelAr : bpStatus.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-chart-1" />
                    <span className="text-foreground">{v.heartRate} bpm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-3.5 w-3.5 text-chart-3" />
                    <span className="text-foreground">{v.temperature}°C</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Weight className="h-3.5 w-3.5 text-chart-2" />
                    <span className="text-foreground">{v.weight} kg</span>
                  </div>
                </div>
                {(v.oxygenSaturation || v.notes) && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {v.oxygenSaturation && (
                        <span className="flex items-center gap-1">
                          <Droplets className="h-3 w-3" /> SpO₂: {v.oxygenSaturation}%
                        </span>
                      )}
                      {v.notes && <span>{v.notes}</span>}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId
                ? (language === 'ar' ? 'تعديل القراءة' : 'Edit Vitals')
                : (language === 'ar' ? 'تسجيل علامات حيوية' : 'Record Vital Signs')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>{language === 'ar' ? 'التاريخ' : 'Date'} *</Label>
              <Input type="date" value={form.recordedAt} onChange={e => setForm(f => ({ ...f, recordedAt: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{language === 'ar' ? 'الانقباضي' : 'Systolic'} * <span className="text-xs text-muted-foreground">mmHg</span></Label>
                <Input type="number" value={form.systolic} onChange={e => setForm(f => ({ ...f, systolic: e.target.value }))} placeholder="120" />
              </div>
              <div className="grid gap-2">
                <Label>{language === 'ar' ? 'الانبساطي' : 'Diastolic'} * <span className="text-xs text-muted-foreground">mmHg</span></Label>
                <Input type="number" value={form.diastolic} onChange={e => setForm(f => ({ ...f, diastolic: e.target.value }))} placeholder="80" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{language === 'ar' ? 'نبض القلب' : 'Heart Rate'} * <span className="text-xs text-muted-foreground">bpm</span></Label>
                <Input type="number" value={form.heartRate} onChange={e => setForm(f => ({ ...f, heartRate: e.target.value }))} placeholder="72" />
              </div>
              <div className="grid gap-2">
                <Label>{language === 'ar' ? 'الحرارة' : 'Temperature'} * <span className="text-xs text-muted-foreground">°C</span></Label>
                <Input type="number" step="0.1" value={form.temperature} onChange={e => setForm(f => ({ ...f, temperature: e.target.value }))} placeholder="36.6" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{language === 'ar' ? 'الوزن' : 'Weight'} * <span className="text-xs text-muted-foreground">kg</span></Label>
                <Input type="number" step="0.1" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="70" />
              </div>
              <div className="grid gap-2">
                <Label>{language === 'ar' ? 'الطول' : 'Height'} <span className="text-xs text-muted-foreground">cm</span></Label>
                <Input type="number" value={form.height} onChange={e => setForm(f => ({ ...f, height: e.target.value }))} placeholder="175" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{language === 'ar' ? 'تشبع الأكسجين' : 'O₂ Saturation'} <span className="text-xs text-muted-foreground">%</span></Label>
              <Input type="number" value={form.oxygenSaturation} onChange={e => setForm(f => ({ ...f, oxygenSaturation: e.target.value }))} placeholder="98" />
            </div>
            <div className="grid gap-2">
              <Label>{language === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder={language === 'ar' ? 'ملاحظات إضافية...' : 'Additional notes...'} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{language === 'ar' ? 'إلغاء' : 'Cancel'}</Button>
            <Button onClick={saveVital}>{language === 'ar' ? 'حفظ' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === 'ar' ? 'حذف القراءة' : 'Delete Record'}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'ar' ? 'هل أنت متأكد؟ لا يمكن التراجع عن هذا الإجراء.' : 'Are you sure? This action cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === 'ar' ? 'إلغاء' : 'Cancel'}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {language === 'ar' ? 'حذف' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VitalSignsTab;
