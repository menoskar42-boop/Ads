import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { getToken } from '@/utils/authToken';
import { roomStore, ROOM_STATUS_COLORS, ROOM_TYPE_LABELS, SEED_ROOMS, type Room, type RoomStatus } from '@/stores/roomStore';
import { useAppointments } from '@/hooks/useVisits';
import { usePatients } from '@/hooks/usePatients';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LayoutGrid, CalendarDays, Clock, Users, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8);

function normaliseRoom(r: any): Room {
  return {
    id: r.id,
    clinicId: r.clinic_id ?? '',
    name: r.name ?? '',
    nameAr: r.name_ar ?? r.name ?? '',
    type: r.type ?? r.room_type ?? 'examination',
    status: (r.status as RoomStatus) ?? 'available',
    floor: r.floor ?? undefined,
    isActive: r.is_active ?? true,
    occupiedSince: r.occupied_since ?? undefined,
    currentPatientId: r.current_patient_id ?? undefined,
    currentVisitId: r.current_visit_id ?? undefined,
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

const RoomManagement: React.FC = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const isAr = language === 'ar';
  const token = getToken();
  const { appointments } = useAppointments();
  const { patients } = usePatients();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    if (!token) {
      let all = roomStore.getAll().filter(r => r.clinicId === user?.clinicId && r.isActive);
      if (all.length === 0 && user?.clinicId) {
        SEED_ROOMS(user.clinicId).forEach(r => roomStore.add(r));
        all = roomStore.getAll().filter(r => r.clinicId === user?.clinicId && r.isActive);
      }
      setRooms(all);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<any[]>('/rooms');
      if (data && data.length > 0) {
        setRooms(data.map(normaliseRoom));
      } else {
        let all = roomStore.getAll().filter(r => r.clinicId === user?.clinicId && r.isActive);
        if (all.length === 0 && user?.clinicId) {
          SEED_ROOMS(user.clinicId).forEach(r => roomStore.add(r));
          all = roomStore.getAll().filter(r => r.clinicId === user?.clinicId && r.isActive);
        }
        setRooms(all);
      }
    } catch {
      let all = roomStore.getAll().filter(r => r.clinicId === user?.clinicId && r.isActive);
      if (all.length === 0 && user?.clinicId) {
        SEED_ROOMS(user.clinicId).forEach(r => roomStore.add(r));
        all = roomStore.getAll().filter(r => r.clinicId === user?.clinicId && r.isActive);
      }
      setRooms(all);
    } finally {
      setLoading(false);
    }
  }, [user?.clinicId, token]);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => setTick(t => t + 1), 30_000);
    if (!token) {
      const unsub = roomStore.subscribe(() => load());
      return () => { unsub(); if (intervalRef.current) clearInterval(intervalRef.current); };
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load, token]);

  const today = new Date().toISOString().split('T')[0];
  const todayAppointments = appointments.filter(a => a.date === today);

  const changeStatus = async (roomId: string, status: RoomStatus) => {
    const extra = status === 'occupied'
      ? { occupiedSince: new Date().toISOString() }
      : status === 'available'
      ? { occupiedSince: undefined, currentPatientId: undefined, currentVisitId: undefined }
      : {};

    if (!token) {
      roomStore.update(r => r.id === roomId, { status, ...extra });
      toast.success(isAr ? 'تم تحديث حالة الغرفة' : 'Room status updated');
      return;
    }
    try {
      await apiFetch(`/rooms/${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, occupied_since: extra.occupiedSince ?? null }),
      });
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status, ...extra } : r));
      toast.success(isAr ? 'تم تحديث حالة الغرفة' : 'Room status updated');
    } catch {
      roomStore.update(r => r.id === roomId, { status, ...extra });
      setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status, ...extra } : r));
      toast.success(isAr ? 'تم تحديث حالة الغرفة' : 'Room status updated');
    }
  };

  const getOccupancyDuration = (since?: string) => {
    if (!since) return null;
    const mins = Math.round((Date.now() - new Date(since).getTime()) / 60000);
    if (mins < 60) return isAr ? `${mins} د` : `${mins}m`;
    return isAr ? `${Math.floor(mins / 60)} س ${mins % 60} د` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const getRoomAppointments = (_room: Room) => [] as typeof todayAppointments;

  const timeLabel = (h: number) => {
    const suffix = h < 12 ? (isAr ? 'ص' : 'AM') : (isAr ? 'م' : 'PM');
    return `${h > 12 ? h - 12 : h}${suffix}`;
  };

  const statusMenu: { value: RoomStatus; labelEn: string; labelAr: string }[] = [
    { value: 'available',      labelEn: 'Available',       labelAr: 'متاحة' },
    { value: 'occupied',       labelEn: 'Occupied',        labelAr: 'مشغولة' },
    { value: 'cleaning',       labelEn: 'Cleaning',        labelAr: 'تنظيف' },
    { value: 'out_of_service', labelEn: 'Out of Service',  labelAr: 'خارج الخدمة' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{isAr ? 'إدارة الغرف' : 'Room Management'}</h1>
          <p className="text-muted-foreground">{rooms.length} {isAr ? 'غرفة' : 'rooms'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { load(); setTick(t => t + 1); }} className="gap-2" data-testid="button-refresh-rooms">
          <RefreshCw className="h-4 w-4" />
          {isAr ? 'تحديث' : 'Refresh'}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['available', 'occupied', 'cleaning', 'out_of_service'] as RoomStatus[]).map(s => {
              const count = rooms.filter(r => r.status === s).length;
              const colors = ROOM_STATUS_COLORS[s];
              return (
                <Card key={s} className="border-l-4" style={{ borderLeftColor: colors.dot.replace('bg-', '') }}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: colors.dot }} />
                    <div>
                      <p className="text-xl font-bold">{count}</p>
                      <p className="text-xs text-muted-foreground">{isAr ? colors.labelAr : colors.label}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Tabs defaultValue="cards">
            <TabsList>
              <TabsTrigger value="cards" className="gap-1.5">
                <LayoutGrid className="h-4 w-4" />{isAr ? 'بطاقات' : 'Cards'}
              </TabsTrigger>
              <TabsTrigger value="schedule" className="gap-1.5">
                <CalendarDays className="h-4 w-4" />{isAr ? 'الجدول اليومي' : 'Daily Schedule'}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="cards" className="mt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {rooms.map(room => {
                  const colors = ROOM_STATUS_COLORS[room.status];
                  const duration = getOccupancyDuration(room.occupiedSince);
                  const typeLabel = ROOM_TYPE_LABELS[room.type];
                  const patient = room.currentPatientId ? patients.find(p => p.id === room.currentPatientId) : null;
                  return (
                    <Card key={room.id} data-testid={`card-room-${room.id}`} className={`border-2 transition-all ${room.status === 'occupied' ? 'border-orange-400' : room.status === 'available' ? 'border-green-400' : 'border-border'}`}>
                      <CardHeader className="pb-2 flex-row items-start justify-between space-y-0">
                        <div>
                          <CardTitle className="text-base">{isAr ? room.nameAr : room.name}</CardTitle>
                          <p className="text-xs text-muted-foreground mt-0.5">{isAr ? typeLabel.ar : typeLabel.en}{room.floor ? ` · ${isAr ? 'الطابق' : 'Floor'} ${room.floor}` : ''}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: colors.dot }} />
                          <Badge variant="outline" className="text-xs" style={{ color: colors.text, borderColor: colors.dot }}>{isAr ? colors.labelAr : colors.label}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {room.status === 'occupied' && (
                          <div className="flex items-center gap-2 text-sm bg-orange-50 dark:bg-orange-950/20 rounded-lg p-2">
                            <Users className="h-4 w-4 text-orange-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{patient ? (isAr ? patient.nameAr : patient.name) : (isAr ? 'مريض' : 'Patient')}</p>
                              {duration && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {duration}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {statusMenu.filter(s => s.value !== room.status).map(s => (
                            <Button key={s.value} size="sm" variant="outline" className="h-7 text-xs" onClick={() => changeStatus(room.id, s.value)} data-testid={`button-room-status-${room.id}-${s.value}`}>
                              {isAr ? s.labelAr : s.labelEn}
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="mt-4">
              <div className="overflow-auto border rounded-lg">
                <div className="min-w-[600px]" style={{ direction: 'ltr' }}>
                  <div className="flex border-b bg-muted/30">
                    <div className="shrink-0 w-16 border-r py-2 px-1 text-xs text-muted-foreground text-center">{isAr ? 'الوقت' : 'Time'}</div>
                    {rooms.map(room => {
                      const colors = ROOM_STATUS_COLORS[room.status];
                      return (
                        <div key={room.id} className="flex-1 py-2 px-2 border-r last:border-r-0 text-center">
                          <p className="text-xs font-semibold text-foreground truncate">{isAr ? room.nameAr : room.name}</p>
                          <span className="inline-flex items-center gap-1 text-xs mt-0.5" style={{ color: colors.text }}>
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                            {isAr ? colors.labelAr : colors.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {HOURS.map(hour => (
                    <div key={hour} className="flex border-b last:border-b-0" style={{ minHeight: '52px' }}>
                      <div className="shrink-0 w-16 border-r flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">{timeLabel(hour)}</span>
                      </div>
                      {rooms.map(room => {
                        const roomAppts = getRoomAppointments(room).filter(a => {
                          const h = parseInt(a.time?.split(':')[0] || '0');
                          return h === hour;
                        });
                        return (
                          <div key={room.id} className="flex-1 border-r last:border-r-0 p-0.5 min-h-[52px]">
                            {roomAppts.map(a => {
                              const patient = patients.find(p => p.id === a.patientId);
                              return (
                                <div key={a.id} className="text-xs bg-primary/10 border border-primary/30 rounded px-1 py-0.5 mb-0.5 truncate">
                                  {isAr ? patient?.nameAr : patient?.name}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default RoomManagement;
