import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { useSchedule } from '@/hooks/useSchedule';
import { useUsers } from '@/hooks/useUsers';
import { useSpecialties } from '@/hooks/useSpecialties';
import { getToken } from '@/utils/authToken';
import {
  getDoctorHomeVisitSchedules, addHomeVisitSchedule, removeHomeVisitSchedule
} from '@/stores/homeVisitScheduleStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar, Clock, Plus, Trash2, Ban, ArrowLeft, Home, Navigation, Timer, Save } from 'lucide-react';
import { toast } from 'sonner';

const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const DoctorSchedule: React.FC = () => {
  const { doctorId: urlDoctorId } = useParams<{ doctorId?: string }>();
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const { getDoctorSchedule, getDoctorBlockedDates, addSchedule, removeSchedule, updateSchedule, addBlockedDate, removeBlockedDate } = useSchedule();
  const { doctors } = useUsers();
  const { specialties } = useSpecialties();

  const getDefaultDoctorId = () => {
    if (urlDoctorId) return urlDoctorId;
    if (user?.role === 'doctor') return user.id;
    return doctors[0]?.id || '';
  };

  const [selectedDoctorId, setSelectedDoctorId] = useState(getDefaultDoctorId());

  useEffect(() => {
    if (urlDoctorId) setSelectedDoctorId(urlDoctorId);
  }, [urlDoctorId]);
  const [showAddDay, setShowAddDay] = useState(false);
  const [showBlockDate, setShowBlockDate] = useState(false);
  const [newDay, setNewDay] = useState(0);
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('14:00');
  const [blockDate, setBlockDate] = useState('');
  const [blockReason, setBlockReason] = useState('');

  // Home visit state
  const [showAddHvDay, setShowAddHvDay] = useState(false);
  const [hvNewDay, setHvNewDay] = useState(5);
  const [hvNewStart, setHvNewStart] = useState('10:00');
  const [hvNewEnd, setHvNewEnd] = useState('18:00');
  const [hvNewMax, setHvNewMax] = useState(4);
  const [hvPrice, setHvPrice] = useState('');
  const [hvDuration, setHvDuration] = useState('');
  const [hvRadius, setHvRadius] = useState('');
  const [hvDailyLimit, setHvDailyLimit] = useState('');
  const [hvAreasInput, setHvAreasInput] = useState('');
  const [hvSettingsDirty, setHvSettingsDirty] = useState(false);

  const isOwnSchedule = user?.role === 'doctor' && selectedDoctorId === user.id;
  const canEdit = permissions.canManageSchedule || isOwnSchedule;

  useEffect(() => {
    const doc = doctors.find(d => d.id === selectedDoctorId);
    if (doc) {
      setHvPrice(String((doc as any).homeVisitPrice || ''));
      setHvDuration(String((doc as any).homeVisitDurationMinutes || ''));
      setHvRadius(String((doc as any).homeVisitRadiusKm || ''));
      setHvDailyLimit(String((doc as any).homeVisitDailyLimit || ''));
      setHvAreasInput(((doc as any).homeVisitAreas || []).join(', '));
      setHvSettingsDirty(false);
    }
  }, [selectedDoctorId, doctors]);

  const schedule = getDoctorSchedule(selectedDoctorId);
  const blockedDates = getDoctorBlockedDates(selectedDoctorId);
  const days = language === 'ar' ? DAYS_AR : DAYS_EN;

  const selectedDoctor = doctors.find(d => d.id === selectedDoctorId);
  const doctorSpecialty = specialties.find(s => s.id === selectedDoctor?.specialtyId);

  const handleAddDay = () => {
    // Check if day already exists
    const exists = schedule.find(s => s.dayOfWeek === newDay && s.isActive);
    if (exists) {
      toast.error(language === 'ar' ? 'هذا اليوم موجود بالفعل' : 'This day already exists');
      return;
    }
    addSchedule({ doctorId: selectedDoctorId, dayOfWeek: newDay, startTime: newStart, endTime: newEnd, isActive: true });
    setShowAddDay(false);
    toast.success(t('doctors.scheduleUpdated'));
  };

  const handleBlockDate = () => {
    if (!blockDate) return;
    addBlockedDate({ doctorId: selectedDoctorId, date: blockDate, reason: blockReason || undefined });
    setShowBlockDate(false);
    setBlockDate('');
    setBlockReason('');
    toast.success(language === 'ar' ? 'تم حظر التاريخ' : 'Date blocked');
  };

  const handleAddHvDay = () => {
    const exists = getDoctorHomeVisitSchedules(selectedDoctorId).find(
      s => s.dayOfWeek === hvNewDay && s.isActive
    );
    if (exists) {
      toast.error(language === 'ar' ? 'هذا اليوم موجود بالفعل' : 'This day already exists');
      return;
    }
    addHomeVisitSchedule({
      doctorId: selectedDoctorId,
      dayOfWeek: hvNewDay,
      startTime: hvNewStart,
      endTime: hvNewEnd,
      maxVisitsPerDay: hvNewMax,
      isActive: true,
    });
    setShowAddHvDay(false);
    toast.success(language === 'ar' ? 'تم تحديث جدول الزيارات المنزلية' : 'Home visit schedule updated');
  };

  const handleSaveHvSettings = async () => {
    const payload = {
      homeVisitEnabled: true,
      homeVisitPrice: hvPrice ? Number(hvPrice) : undefined,
      homeVisitDurationMinutes: hvDuration ? Number(hvDuration) : undefined,
      homeVisitRadiusKm: hvRadius ? Number(hvRadius) : undefined,
      homeVisitDailyLimit: hvDailyLimit ? Number(hvDailyLimit) : undefined,
      homeVisitAreas: hvAreasInput
        ? hvAreasInput.split(',').map(s => s.trim()).filter(Boolean)
        : [],
    };
    const token = getToken();
    if (token) {
      try {
        await fetch(`/api/users/${selectedDoctorId}/home-visit`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        });
      } catch { /* localStorage already updated */ }
    }
    setHvSettingsDirty(false);
    toast.success(language === 'ar' ? 'تم حفظ إعدادات الزيارة المنزلية' : 'Home visit settings saved');
  };

  const hvSchedules = getDoctorHomeVisitSchedules(selectedDoctorId);

  return (
    <div className="space-y-6">
      <div>
        {urlDoctorId && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 mb-2 -ml-2"
            onClick={() => navigate('/doctors')}
            data-testid="button-back-to-doctors"
          >
            <ArrowLeft className="h-4 w-4" />
            {language === 'ar' ? 'العودة للأطباء' : 'Back to Doctors'}
          </Button>
        )}
        <h1 className="text-2xl font-bold text-foreground">
          {urlDoctorId && selectedDoctor
            ? (language === 'ar'
              ? `جدول د. ${selectedDoctor.nameAr}`
              : `Dr. ${selectedDoctor.name}'s Schedule`)
            : t('doctors.schedule')}
        </h1>
        <p className="text-muted-foreground">{t('doctors.manageSchedule')}</p>
      </div>

      {permissions.canManageSchedule && (
        <Card>
          <CardContent className="pt-6">
            <Label>{t('appointments.doctor')}</Label>
            <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {doctors.map(d => (
                  <SelectItem key={d.id} value={d.id}>{language === 'ar' ? d.nameAr : d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                {t('doctors.workingDays')}
              </CardTitle>
              <CardDescription>
                {language === 'ar' ? doctorSpecialty?.nameAr : doctorSpecialty?.name}
              </CardDescription>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => setShowAddDay(true)} className="gap-1">
                <Plus className="h-4 w-4" />{t('doctors.addDay')}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'اليوم' : 'Day'}</TableHead>
                  <TableHead>{t('doctors.startTime')}</TableHead>
                  <TableHead>{t('doctors.endTime')}</TableHead>
                  {canEdit && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule
                  .filter(s => s.isActive)
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                  .map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{days[s.dayOfWeek]}</TableCell>
                      <TableCell>{s.startTime}</TableCell>
                      <TableCell>{s.endTime}</TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => { removeSchedule(s.id); toast.success(t('doctors.scheduleUpdated')); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                {schedule.filter(s => s.isActive).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 4 : 3} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <Clock className="h-10 w-10 opacity-40" />
                        <p className="text-sm font-medium">{language === 'ar' ? 'لا توجد أيام عمل' : 'No working days set'}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Ban className="h-5 w-5 text-destructive" />
              {language === 'ar' ? 'التواريخ المحظورة' : 'Blocked Dates'}
            </CardTitle>
            {canEdit && (
              <Button size="sm" variant="outline" onClick={() => setShowBlockDate(true)} className="gap-1">
                <Plus className="h-4 w-4" />{language === 'ar' ? 'حظر تاريخ' : 'Block Date'}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {blockedDates.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground py-12">
                <Ban className="h-10 w-10 opacity-40" />
                <p className="text-sm font-medium">{language === 'ar' ? 'لا توجد تواريخ محظورة' : 'No blocked dates'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {blockedDates.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="font-medium text-foreground">{b.date}</p>
                      {b.reason && <p className="text-sm text-muted-foreground">{b.reason}</p>}
                    </div>
                    {canEdit && (
                      <Button variant="ghost" size="icon" onClick={() => removeBlockedDate(b.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Home Visit Section */}
      {selectedDoctor?.homeVisitEnabled && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-foreground">
              {language === 'ar' ? 'إدارة الزيارات المنزلية' : 'Home Visit Management'}
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Home Visit Schedule */}
            <Card className="border-emerald-200 dark:border-emerald-900">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                    <Clock className="h-5 w-5" />
                    {language === 'ar' ? 'أيام الزيارة المنزلية' : 'Home Visit Days'}
                  </CardTitle>
                  <CardDescription>
                    {language === 'ar' ? 'الجدول الأسبوعي للزيارات المنزلية' : 'Weekly home visit schedule'}
                  </CardDescription>
                </div>
                {canEdit && (
                  <Button size="sm" onClick={() => setShowAddHvDay(true)} className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Plus className="h-4 w-4" />
                    {language === 'ar' ? 'إضافة يوم' : 'Add Day'}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{language === 'ar' ? 'اليوم' : 'Day'}</TableHead>
                      <TableHead>{language === 'ar' ? 'من' : 'Start'}</TableHead>
                      <TableHead>{language === 'ar' ? 'إلى' : 'End'}</TableHead>
                      <TableHead>{language === 'ar' ? 'حد يومي' : 'Max/Day'}</TableHead>
                      {canEdit && <TableHead className="w-12" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hvSchedules
                      .filter(s => s.isActive)
                      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                      .map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{days[s.dayOfWeek]}</TableCell>
                          <TableCell>{s.startTime}</TableCell>
                          <TableCell>{s.endTime}</TableCell>
                          <TableCell>{s.maxVisitsPerDay}</TableCell>
                          {canEdit && (
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => {
                                removeHomeVisitSchedule(s.id);
                                toast.success(language === 'ar' ? 'تم الحذف' : 'Removed');
                              }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    {hvSchedules.filter(s => s.isActive).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canEdit ? 5 : 4} className="py-16">
                          <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                            <Home className="h-10 w-10 opacity-40" />
                            <p className="text-sm font-medium">
                              {language === 'ar' ? 'لا توجد أيام زيارات منزلية' : 'No home visit days set'}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Home Visit Settings */}
            {canEdit && (
              <Card className="border-emerald-200 dark:border-emerald-900">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
                    <Navigation className="h-5 w-5" />
                    {language === 'ar' ? 'إعدادات الزيارة المنزلية' : 'Home Visit Settings'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{language === 'ar' ? 'السعر (ج.م)' : 'Price (ج.م)'}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={hvPrice}
                        onChange={e => { setHvPrice(e.target.value); setHvSettingsDirty(true); }}
                        placeholder="e.g. 500"
                        data-testid="input-hv-price"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{language === 'ar' ? 'المدة (دقيقة)' : 'Duration (min)'}</Label>
                      <Input
                        type="number"
                        min="15"
                        value={hvDuration}
                        onChange={e => { setHvDuration(e.target.value); setHvSettingsDirty(true); }}
                        placeholder="e.g. 45"
                        data-testid="input-hv-duration"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{language === 'ar' ? 'نطاق التغطية (كم)' : 'Radius (km)'}</Label>
                      <Input
                        type="number"
                        min="1"
                        value={hvRadius}
                        onChange={e => { setHvRadius(e.target.value); setHvSettingsDirty(true); }}
                        placeholder="e.g. 15"
                        data-testid="input-hv-radius"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{language === 'ar' ? 'الحد اليومي' : 'Daily Limit'}</Label>
                      <Input
                        type="number"
                        min="1"
                        value={hvDailyLimit}
                        onChange={e => { setHvDailyLimit(e.target.value); setHvSettingsDirty(true); }}
                        placeholder="e.g. 4"
                        data-testid="input-hv-daily-limit"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{language === 'ar' ? 'مناطق التغطية (فاصل بفاصلة)' : 'Coverage Areas (comma-separated)'}</Label>
                    <Input
                      value={hvAreasInput}
                      onChange={e => { setHvAreasInput(e.target.value); setHvSettingsDirty(true); }}
                      placeholder={language === 'ar' ? 'مثال: مدينة نصر، مصر الجديدة' : 'e.g. Nasr City, Heliopolis'}
                      data-testid="input-hv-areas"
                    />
                    <p className="text-xs text-muted-foreground">
                      {hvAreasInput
                        ? hvAreasInput.split(',').map(s => s.trim()).filter(Boolean).length + ' ' + (language === 'ar' ? 'منطقة' : 'area(s)')
                        : ''}
                    </p>
                  </div>
                  <Button
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={!hvSettingsDirty}
                    onClick={handleSaveHvSettings}
                    data-testid="button-save-hv-settings"
                  >
                    <Save className="h-4 w-4" />
                    {language === 'ar' ? 'حفظ الإعدادات' : 'Save Settings'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Add Day Dialog */}
      <Dialog open={showAddDay} onOpenChange={setShowAddDay}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('doctors.addDay')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{language === 'ar' ? 'اليوم' : 'Day'}</Label>
              <Select value={String(newDay)} onValueChange={v => setNewDay(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {days.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('doctors.startTime')}</Label>
                <Input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('doctors.endTime')}</Label>
                <Input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
              </div>
            </div>
            <Button className="w-full" onClick={handleAddDay}>{t('common.save')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Block Date Dialog */}
      <Dialog open={showBlockDate} onOpenChange={setShowBlockDate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{language === 'ar' ? 'حظر تاريخ' : 'Block Date'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{t('appointments.date')}</Label>
              <Input type="date" value={blockDate} onChange={e => setBlockDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{language === 'ar' ? 'السبب (اختياري)' : 'Reason (optional)'}</Label>
              <Input value={blockReason} onChange={e => setBlockReason(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleBlockDate}>{t('common.save')}</Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Add Home Visit Day Dialog */}
      <Dialog open={showAddHvDay} onOpenChange={setShowAddHvDay}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {language === 'ar' ? 'إضافة يوم زيارة منزلية' : 'Add Home Visit Day'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>{language === 'ar' ? 'اليوم' : 'Day'}</Label>
              <Select value={String(hvNewDay)} onValueChange={v => setHvNewDay(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {days.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{language === 'ar' ? 'من' : 'Start Time'}</Label>
                <Input type="time" value={hvNewStart} onChange={e => setHvNewStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{language === 'ar' ? 'إلى' : 'End Time'}</Label>
                <Input type="time" value={hvNewEnd} onChange={e => setHvNewEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{language === 'ar' ? 'الحد الأقصى للزيارات' : 'Max Visits / Day'}</Label>
              <Input
                type="number"
                min="1"
                max="20"
                value={hvNewMax}
                onChange={e => setHvNewMax(Number(e.target.value))}
              />
            </div>
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleAddHvDay}>
              {language === 'ar' ? 'إضافة' : 'Add Day'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DoctorSchedule;
