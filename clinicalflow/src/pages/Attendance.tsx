import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { useUsers } from '@/hooks/useUsers';
import { getToken } from '@/utils/authToken';
import { attendanceStore, clinicLocationStore, AttendanceRecord } from '@/stores/attendanceStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, Clock, CheckCircle2, LogIn, LogOut, Users, AlertTriangle, Settings2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = '/api';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
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

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normaliseRecord(r: any): AttendanceRecord {
  const action = r.check_out && !r.check_in_only ? 'check_out' : 'check_in';
  return {
    id: r.id,
    clinicId: r.clinic_id ?? '',
    userId: r.user_id ?? '',
    userName: r.user_name ?? '',
    userNameAr: r.user_name_ar ?? '',
    userRole: r.user_role ?? '',
    action,
    latitude: r.latitude ?? 0,
    longitude: r.longitude ?? 0,
    accuracy: r.accuracy ?? 0,
    distanceFromClinic: r.distance_from_clinic ?? undefined,
    isWithinRange: r.is_within_range ?? true,
    timestamp: r.check_in ?? r.created_at ?? new Date().toISOString(),
  };
}

const Attendance: React.FC = () => {
  const { isAr, language } = useLanguage();
  const { user } = useAuth();
  const { users: staff } = useUsers();
  const token = getToken();

  const [records, setRecords] = useState<AttendanceRecord[]>(() => attendanceStore.getAll());
  const [isLocating, setIsLocating] = useState(false);
  const [clinicLat, setClinicLat] = useState('');
  const [clinicLon, setClinicLon] = useState('');
  const [clinicRadius, setClinicRadius] = useState('200');

  const clinicLocation = user?.clinicId ? clinicLocationStore.get(c => c.clinicId === user.clinicId) : null;

  const loadAttendance = useCallback(async () => {
    if (!token) {
      setRecords(attendanceStore.getAll());
      return;
    }
    const today = new Date().toISOString().slice(0, 7);
    try {
      const data = await apiFetch<any[]>(`/hr/attendance?month=${today}`);
      if (data && data.length > 0) {
        const normed = data.map(normaliseRecord);
        setRecords(normed);
      } else {
        setRecords(attendanceStore.getAll());
      }
    } catch {
      setRecords(attendanceStore.getAll());
    }
  }, [token]);

  useEffect(() => {
    if (clinicLocation) {
      setClinicLat(String(clinicLocation.latitude));
      setClinicLon(String(clinicLocation.longitude));
      setClinicRadius(String(clinicLocation.radiusMeters));
    }
    loadAttendance();
    if (!token) {
      const unsub = attendanceStore.subscribe(() => setRecords(attendanceStore.getAll()));
      return unsub;
    }
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecords = records.filter(r => r.timestamp.startsWith(todayStr) && r.clinicId === (user?.clinicId || ''));
  const myTodayRecords = todayRecords.filter(r => r.userId === user?.id);
  const lastAction = myTodayRecords.slice().reverse()[0];
  const isCheckedIn = lastAction?.action === 'check_in';

  const handleCheckAction = (action: 'check_in' | 'check_out') => {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        let isWithinRange = true;
        let distanceFromClinic: number | undefined;

        if (clinicLocation) {
          distanceFromClinic = getDistanceMeters(latitude, longitude, clinicLocation.latitude, clinicLocation.longitude);
          isWithinRange = distanceFromClinic <= clinicLocation.radiusMeters;
        }

        const record: AttendanceRecord = {
          id: `att-${Date.now()}`,
          clinicId: user?.clinicId || '',
          userId: user?.id || '',
          userName: user?.name || '',
          userNameAr: user?.nameAr || '',
          userRole: user?.role || '',
          action,
          latitude, longitude, accuracy,
          distanceFromClinic,
          isWithinRange,
          timestamp: new Date().toISOString(),
        };

        attendanceStore.add(record);
        setIsLocating(false);

        if (token) {
          try {
            await apiFetch('/hr/attendance', {
              method: 'POST',
              body: JSON.stringify({ action }),
            });
          } catch { /* localStorage already updated */ }
        }

        setRecords(prev => [...prev, record]);

        if (!isWithinRange && distanceFromClinic !== undefined) {
          toast.warning(
            isAr
              ? `أنت خارج النطاق المسموح به (${Math.round(distanceFromClinic)} م). تم التسجيل مع تنبيه.`
              : `You're outside the allowed range (${Math.round(distanceFromClinic)}m). Recorded with warning.`
          );
        } else {
          toast.success(action === 'check_in'
            ? (isAr ? 'تم تسجيل الحضور بنجاح' : 'Check-in recorded')
            : (isAr ? 'تم تسجيل الانصراف بنجاح' : 'Check-out recorded'));
        }
      },
      _err => {
        setIsLocating(false);
        toast.error(isAr ? 'لم يتم السماح بالوصول للموقع' : 'Location access denied');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const saveClinicLocation = () => {
    const lat = parseFloat(clinicLat), lon = parseFloat(clinicLon), radius = parseInt(clinicRadius);
    if (isNaN(lat) || isNaN(lon) || isNaN(radius)) {
      toast.error(isAr ? 'يرجى إدخال إحداثيات صحيحة' : 'Please enter valid coordinates');
      return;
    }
    if (clinicLocation) {
      clinicLocationStore.update(c => c.clinicId === user?.clinicId, { latitude: lat, longitude: lon, radiusMeters: radius });
    } else {
      clinicLocationStore.add({ clinicId: user?.clinicId || '', latitude: lat, longitude: lon, radiusMeters: radius });
    }
    toast.success(isAr ? 'تم حفظ موقع العيادة' : 'Clinic location saved');
  };

  const staffSummary = staff.filter(s => s.clinicId === user?.clinicId).map(s => {
    const sRecords = todayRecords.filter(r => r.userId === s.id);
    const last = sRecords.slice().reverse()[0];
    return { ...s, isCheckedIn: last?.action === 'check_in', checkInTime: sRecords.find(r => r.action === 'check_in')?.timestamp };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <MapPin className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{isAr ? 'حضور وانصراف الموظفين' : 'Staff GPS Attendance'}</h1>
          <p className="text-sm text-muted-foreground">{isAr ? 'تسجيل الحضور بالموقع الجغرافي' : 'Location-verified check-in / check-out'}</p>
        </div>
      </div>

      <Card className={isCheckedIn ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10' : ''}>
        <CardContent className="p-6 text-center space-y-4">
          <div className={`h-16 w-16 rounded-full mx-auto flex items-center justify-center ${isCheckedIn ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
            {isCheckedIn ? <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" /> : <Clock className="h-8 w-8 text-muted-foreground" />}
          </div>
          <div>
            <p className="font-semibold text-lg">{isAr ? (isCheckedIn ? 'أنت حاضر' : 'لم تسجّل الحضور بعد') : (isCheckedIn ? 'You are checked in' : 'Not checked in yet')}</p>
            {lastAction && <p className="text-sm text-muted-foreground">{new Date(lastAction.timestamp).toLocaleTimeString(isAr ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</p>}
          </div>
          <div className="flex gap-3 justify-center">
            {!isCheckedIn ? (
              <Button className="gap-2 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600" disabled={isLocating} onClick={() => handleCheckAction('check_in')} data-testid="button-check-in">
                {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                {isAr ? 'تسجيل الحضور' : 'Check In'}
              </Button>
            ) : (
              <Button variant="outline" className="gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20" disabled={isLocating} onClick={() => handleCheckAction('check_out')} data-testid="button-check-out">
                {isLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                {isAr ? 'تسجيل الانصراف' : 'Check Out'}
              </Button>
            )}
          </div>
          {isLocating && <p className="text-xs text-muted-foreground animate-pulse">{isAr ? 'جارٍ تحديد الموقع...' : 'Getting your location...'}</p>}
        </CardContent>
      </Card>

      {user?.role === 'admin' && (
        <Tabs defaultValue="today">
          <TabsList>
            <TabsTrigger value="today" className="gap-1.5"><Users className="h-4 w-4" />{isAr ? 'حضور اليوم' : "Today's Attendance"}</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5"><Settings2 className="h-4 w-4" />{isAr ? 'إعدادات الموقع' : 'Location Settings'}</TabsTrigger>
          </TabsList>

          <TabsContent value="today" className="mt-4">
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {staffSummary.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">{isAr ? 'لا يوجد موظفون' : 'No staff found'}</div>
                  ) : staffSummary.map(s => (
                    <div key={s.id} className="flex items-center gap-3 p-4" data-testid={`row-staff-${s.id}`}>
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold ${s.isCheckedIn ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'}`}>
                        {s.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{isAr ? s.nameAr : s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.role}</p>
                      </div>
                      <div className="text-right">
                        {s.isCheckedIn
                          ? <><Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"><CheckCircle2 className="h-3 w-3" />{isAr ? 'حاضر' : 'Present'}</Badge>
                            {s.checkInTime && <p className="text-xs text-muted-foreground mt-1">{new Date(s.checkInTime).toLocaleTimeString(isAr ? 'ar-EG' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}</p>}</>
                          : <Badge variant="outline" className="text-xs">{isAr ? 'غائب' : 'Absent'}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{isAr ? 'موقع العيادة' : 'Clinic Location'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{isAr ? 'خط العرض (Latitude)' : 'Latitude'}</label>
                    <Input value={clinicLat} onChange={e => setClinicLat(e.target.value)} placeholder="30.0444" className="text-sm" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">{isAr ? 'خط الطول (Longitude)' : 'Longitude'}</label>
                    <Input value={clinicLon} onChange={e => setClinicLon(e.target.value)} placeholder="31.2357" className="text-sm" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{isAr ? 'نطاق الحضور (بالأمتار)' : 'Check-in Radius (meters)'}</label>
                  <Input value={clinicRadius} onChange={e => setClinicRadius(e.target.value)} placeholder="200" type="number" min="50" max="1000" className="text-sm" />
                  <p className="text-xs text-muted-foreground">{isAr ? 'الموظف يجب أن يكون ضمن هذا النطاق للتسجيل' : 'Staff must be within this range to check in'}</p>
                </div>
                <Button onClick={saveClinicLocation} className="w-full">
                  <MapPin className="h-4 w-4 mr-2" />{isAr ? 'حفظ الموقع' : 'Save Location'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default Attendance;
