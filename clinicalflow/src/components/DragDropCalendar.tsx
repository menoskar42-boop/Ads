import React, { useState, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import type { Appointment } from '@/types';

interface Props {
  appointments: Appointment[];
  onMove: (appointmentId: string, newDate: string, newTime: string) => void;
  getPatientName: (id: string) => string;
  getDoctorName: (id: string) => string;
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  confirmed: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  completed: 'bg-gray-100 border-gray-400 text-gray-600 dark:bg-gray-700/40 dark:text-gray-400',
  cancelled: 'bg-red-100 border-red-400 text-red-700 line-through dark:bg-red-900/40 dark:text-red-400',
  converted: 'bg-purple-100 border-purple-400 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  no_show: 'bg-amber-100 border-amber-400 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
};

const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 → 20:00

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export const DragDropCalendar: React.FC<Props> = ({ appointments, onMove, getPatientName, getDoctorName }) => {
  const { language, isRTL } = useLanguage();
  const isAr = language === 'ar';
  const [view, setView] = useState<'day' | 'week'>('week');
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    // go to start of week (Saturday for Egypt)
    const day = d.getDay(); // 0=Sun..6=Sat
    const diff = day === 6 ? 0 : -(day + 1);
    d.setDate(d.getDate() + diff);
    return d;
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  const todayStr = toDateStr(new Date());

  // Columns
  const dayNames = isAr
    ? ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const columns: Date[] = view === 'day'
    ? [currentDate]
    : Array.from({ length: 7 }, (_, i) => addDays(currentDate, i));

  // Navigation
  const navigate = (dir: 1 | -1) => {
    setCurrentDate(d => addDays(d, dir * (view === 'day' ? 1 : 7)));
  };

  // Header label
  const headerLabel = view === 'week'
    ? `${toDateStr(columns[0])} — ${toDateStr(columns[6])}`
    : toDateStr(currentDate);

  // Appointments in a cell
  const getCell = (dateStr: string, hour: number) =>
    appointments.filter(a => {
      if (a.date !== dateStr) return false;
      const h = parseInt(a.time?.split(':')[0] || '0');
      return h === hour;
    });

  // Conflict detection: same doctor, same date+hour, multiple appointments
  const hasConflict = (dateStr: string, hour: number) => {
    const cell = getCell(dateStr, hour).filter(a => a.status !== 'cancelled');
    if (cell.length < 2) return false;
    const doctors = cell.map(a => a.doctorId);
    return doctors.length !== new Set(doctors).size;
  };

  // Drag handlers
  const onDragStart = (e: React.DragEvent, apptId: string) => {
    dragRef.current = apptId;
    setDragId(apptId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnd = () => {
    dragRef.current = null;
    setDragId(null);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDrop = (e: React.DragEvent, dateStr: string, hour: number) => {
    e.preventDefault();
    const id = dragRef.current;
    if (!id) return;
    const appt = appointments.find(a => a.id === id);
    if (!appt) return;

    const newTime = `${String(hour).padStart(2, '0')}:00`;

    // Conflict check: same doctor at same slot
    const conflicting = appointments.find(a =>
      a.id !== id &&
      a.doctorId === appt.doctorId &&
      a.date === dateStr &&
      parseInt(a.time?.split(':')[0] || '0') === hour &&
      a.status !== 'cancelled'
    );

    if (conflicting) {
      setConflict(isAr
        ? `تعارض: الطبيب لديه موعد آخر في هذا الوقت`
        : `Conflict: Doctor has another appointment at this time`);
      setTimeout(() => setConflict(null), 3000);
      return;
    }

    onMove(id, dateStr, newTime);
    setDragId(null);
  };

  const timeLabel = (h: number) => {
    const suffix = h < 12 ? (isAr ? 'ص' : 'AM') : (isAr ? 'م' : 'PM');
    const display = h > 12 ? h - 12 : h;
    return `${display}:00 ${suffix}`;
  };

  const colWidth = view === 'week' ? `${100 / (columns.length + 1)}%` : '100%';

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            {isAr ? 'اليوم' : 'Today'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(1)}>
            {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <span className="text-sm font-medium text-muted-foreground">{headerLabel}</span>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={view === 'day' ? 'default' : 'outline'} onClick={() => setView('day')}>
            {isAr ? 'يوم' : 'Day'}
          </Button>
          <Button size="sm" variant={view === 'week' ? 'default' : 'outline'} onClick={() => setView('week')}>
            {isAr ? 'أسبوع' : 'Week'}
          </Button>
        </div>
      </div>

      {/* Conflict warning */}
      {conflict && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {conflict}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs">
        {Object.entries(STATUS_COLORS).map(([status, cls]) => (
          <span key={status} className={`px-2 py-0.5 rounded border ${cls}`}>{status}</span>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="overflow-auto border rounded-lg">
        <div className="min-w-[600px]">
          {/* Header row */}
          <div className="flex border-b bg-muted/30" style={{ direction: 'ltr' }}>
            <div className="shrink-0 w-16 border-r" />
            {columns.map((col, i) => {
              const dateStr = toDateStr(col);
              const isToday = dateStr === todayStr;
              return (
                <div
                  key={i}
                  className={`flex-1 text-center py-2 text-xs font-medium border-r last:border-r-0 ${isToday ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                >
                  <div>{dayNames[col.getDay()]}</div>
                  <div className={`text-base font-bold ${isToday ? 'text-primary' : 'text-foreground'}`}>{col.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Time rows */}
          {HOURS.map(hour => (
            <div key={hour} className="flex border-b last:border-b-0" style={{ minHeight: '60px', direction: 'ltr' }}>
              {/* Time label */}
              <div className="shrink-0 w-16 border-r flex items-start justify-end pr-2 pt-1">
                <span className="text-xs text-muted-foreground">{timeLabel(hour)}</span>
              </div>
              {/* Cells */}
              {columns.map((col, ci) => {
                const dateStr = toDateStr(col);
                const cell = getCell(dateStr, hour);
                const cellConflict = hasConflict(dateStr, hour);
                return (
                  <div
                    key={ci}
                    className={`flex-1 border-r last:border-r-0 p-0.5 relative min-h-[60px] transition-colors
                      ${cellConflict ? 'bg-destructive/5' : ''}
                      hover:bg-muted/40`}
                    onDragOver={onDragOver}
                    onDrop={e => onDrop(e, dateStr, hour)}
                  >
                    {cellConflict && (
                      <AlertTriangle className="h-3 w-3 text-destructive absolute top-0.5 right-0.5" />
                    )}
                    {cell.map(appt => (
                      <div
                        key={appt.id}
                        draggable={appt.status !== 'completed' && appt.status !== 'cancelled'}
                        onDragStart={e => onDragStart(e, appt.id)}
                        onDragEnd={onDragEnd}
                        className={`text-xs rounded border px-1 py-0.5 mb-0.5 cursor-grab select-none transition-opacity
                          ${STATUS_COLORS[appt.status] || 'bg-muted border-border'}
                          ${dragId === appt.id ? 'opacity-40' : ''}
                          ${appt.status === 'completed' || appt.status === 'cancelled' ? 'cursor-default' : 'hover:opacity-80'}`}
                        title={`${getPatientName(appt.patientId)} — ${getDoctorName(appt.doctorId)}`}
                      >
                        <p className="font-medium truncate">{getPatientName(appt.patientId)}</p>
                        <p className="opacity-70 truncate">{getDoctorName(appt.doctorId)}</p>
                        {appt.isUrgent && <Badge variant="destructive" className="text-[9px] h-3.5 px-1">{isAr ? 'عاجل' : 'Urgent'}</Badge>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {isAr ? '* اسحب الموعد إلى خانة مختلفة لتغيير وقته' : '* Drag an appointment to reschedule it'}
      </p>
    </div>
  );
};

export default DragDropCalendar;
