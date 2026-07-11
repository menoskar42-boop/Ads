import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { usePatients } from '@/hooks/usePatients';
import { useUsers } from '@/hooks/useUsers';
import { specialtyStore } from '@/stores/specialtyStore';
import { getBranchesForClinic } from '@/stores/branchStore';
import { getAvailableSlots } from '@/stores/scheduleStore';
import { appointmentStore } from '@/stores/visitStore';
import { addCallLog, getCallLogsForPatient, setPatientVip, CallOutcome, CallLog } from '@/stores/callLogStore';
import { useAppointments } from '@/hooks/useVisits';
import { Patient } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Phone, Search, Star, Calendar, Clock, User, X,
  PhoneCall, CheckCircle2, RefreshCw, Lock, ChevronRight,
  Mic, Square, Send, Loader2, AlertCircle, Bot,
  BellRing, PhoneOff, PhoneIncoming,
} from 'lucide-react';
import { getToken } from '@/utils/authToken';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OUTCOME_LABELS: Record<CallOutcome, { en: string; ar: string; color: string }> = {
  booked:       { en: 'Booked',       ar: 'تم الحجز',      color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  rescheduled:  { en: 'Rescheduled',  ar: 'أُعيد الجدولة', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  cancelled:    { en: 'Cancelled',    ar: 'مُلغى',          color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  inquiry:      { en: 'Inquiry',      ar: 'استفسار',        color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  no_answer:    { en: 'No Answer',    ar: 'لا يوجد رد',     color: 'bg-muted text-muted-foreground' },
};

function genDates(count = 7): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function fmtDate(iso: string, lang: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PatientCard({ patient, isAr, onVipToggle }: { patient: Patient; isAr: boolean; onVipToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <User className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">{isAr ? patient.nameAr || patient.name : patient.name}</p>
          {patient.isVip && <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0 h-4 gap-0.5 dark:bg-amber-900/30 dark:text-amber-400"><Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />VIP</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{patient.phone}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className={`text-xs h-7 px-2 ${patient.isVip ? 'text-amber-600' : 'text-muted-foreground'}`}
        onClick={onVipToggle}
        title={patient.isVip ? (isAr ? 'إزالة VIP' : 'Remove VIP') : (isAr ? 'تعيين VIP' : 'Set VIP')}
      >
        <Star className={`h-3.5 w-3.5 ${patient.isVip ? 'fill-amber-500 text-amber-500' : ''}`} />
      </Button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CallCenter() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const permissions = usePermissions();
  const { createAppointment, cancelAppointment } = useAppointments();
  const { patients: allPatients } = usePatients();
  const { toast } = useToast();
  const isAr = language === 'ar';

  // ── STEP 1: patient search state ──────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchResults, setSearchResults] = useState<Patient[]>([]);

  // STEP 7: debounced search (<300ms feels instant)
  const handleSearch = useCallback((val: string) => {
    setQuery(val);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!val.trim()) { setSearchResults([]); return; }
    searchRef.current = setTimeout(() => {
      const q = val.toLowerCase();
      const results = allPatients.filter(p =>
        p.phone.includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.nameAr && p.nameAr.includes(q)) ||
        (p.nationalId && p.nationalId.includes(q))
      ).slice(0, 8);
      setSearchResults(results);
    }, 200);
  }, [allPatients]);

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    setSearchResults([]);
    setQuery('');
    setLogs(getCallLogsForPatient(p.id));
  };

  const clearPatient = () => { setSelectedPatient(null); setQuery(''); setSearchResults([]); };

  // ── STEP 2: unified calendar state ───────────────────────────────────────
  const clinicId = user?.clinicId ?? '';
  const { users: allUsers } = useUsers();
  const doctors = useMemo(() =>
    allUsers.filter(u => u.role === 'doctor' && u.isActive && (u.clinicId === clinicId || !clinicId)),
    [allUsers, clinicId]
  );
  const branches = useMemo(() => getBranchesForClinic(clinicId), [clinicId]);
  const dates = useMemo(() => genDates(7), []);

  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(dates[0]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  const availableSlots = useMemo(() => {
    if (!selectedDoctorId || !selectedDate) return [];
    return getAvailableSlots(selectedDoctorId, selectedDate);
  }, [selectedDoctorId, selectedDate]);

  // ── STEP 3: booking form state ────────────────────────────────────────────
  const [bookingNotes, setBookingNotes] = useState('');
  const [booking, setBooking] = useState(false);

  const handleBook = async () => {
    if (!selectedPatient || !selectedDoctorId || !selectedDate || !selectedSlot) return;
    setBooking(true);
    try {
      const doctor = allUsers.find(u => u.id === selectedDoctorId);
      await createAppointment({
        patientId:   selectedPatient.id,
        doctorId:    selectedDoctorId,
        specialtyId: doctor?.specialtyId ?? '',
        date:        selectedDate,
        time:        selectedSlot,
        clinicId,
        notes:       bookingNotes || undefined,
        isUrgent:    selectedPatient.isVip,
      });
      // STEP 4: log the call
      const log = addCallLog({
        clinicId,
        patientId: selectedPatient.id,
        userId:    user?.id ?? '',
        notes:     bookingNotes || `Booked ${selectedDate} ${selectedSlot}`,
        outcome:   'booked',
        callTime:  new Date().toISOString(),
      });
      setLogs(prev => [log, ...prev]);
      toast({ title: isAr ? 'تم الحجز بنجاح' : 'Appointment booked' });
      setSelectedSlot('');
      setBookingNotes('');
    } catch {
      toast({ title: isAr ? 'فشل الحجز' : 'Booking failed', variant: 'destructive' });
    } finally {
      setBooking(false);
    }
  };

  // ── STEP 4: call log state ────────────────────────────────────────────────
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [callNotes, setCallNotes] = useState('');
  const [callOutcome, setCallOutcome] = useState<CallOutcome>('inquiry');

  const handleLogCall = () => {
    if (!selectedPatient) return;
    const log = addCallLog({
      clinicId,
      patientId: selectedPatient.id,
      userId:    user?.id ?? '',
      notes:     callNotes,
      outcome:   callOutcome,
      callTime:  new Date().toISOString(),
    });
    setLogs(prev => [log, ...prev]);
    setCallNotes('');
    toast({ title: isAr ? 'تم تسجيل المكالمة' : 'Call logged' });
  };

  // ── STEP 5: VIP toggle ────────────────────────────────────────────────────
  const handleVipToggle = () => {
    if (!selectedPatient) return;
    const next = !selectedPatient.isVip;
    setPatientVip(selectedPatient.id, next);
    setSelectedPatient(p => p ? { ...p, isVip: next } : p);
    toast({ title: next ? (isAr ? 'تم تعيين المريض كـ VIP' : 'Patient marked as VIP') : (isAr ? 'تم إزالة VIP' : 'VIP removed') });
  };

  // ── STEP 6: quick cancel ─────────────────────────────────────────────────
  const upcomingApts = useMemo(() => {
    if (!selectedPatient) return [];
    const today = new Date().toISOString().slice(0, 10);
    return appointmentStore
      .filter(a => a.patientId === selectedPatient.id && a.date >= today && a.status === 'scheduled')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [selectedPatient]);

  const handleCancel = async (aptId: string) => {
    const result = await cancelAppointment(aptId);
    if (result.ok) {
      toast({ title: isAr ? 'تم الإلغاء' : 'Appointment cancelled' });
      const log = addCallLog({ clinicId, patientId: selectedPatient!.id, userId: user?.id ?? '', notes: 'Cancelled via call center', outcome: 'cancelled', callTime: new Date().toISOString() });
      setLogs(prev => [log, ...prev]);
    }
  };

  // ── AI Voice Simulator state ──────────────────────────────────────────────
  const [simPhone, setSimPhone] = useState('0100000001');
  const [simText, setSimText] = useState('');
  const [simMsgs, setSimMsgs] = useState<Array<{ role: 'user' | 'bot' | 'emergency'; text: string; transcription?: string }>>([]);
  const [simLoading, setSimLoading] = useState(false);
  const [simListening, setSimListening] = useState(false);
  const [simVoiceError, setSimVoiceError] = useState('');
  const simRecRef = useRef<any>(null);
  const simScrollRef = useRef<HTMLDivElement>(null);

  const sendSimMessage = async (textOverride?: string) => {
    const msg = (textOverride ?? simText).trim();
    if (!msg || simLoading) return;
    setSimText('');
    setSimMsgs(prev => [...prev, { role: 'user', text: msg }]);
    setSimLoading(true);
    try {
      const token = getToken();
      const res = await fetch('/api/call-center/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ phone: simPhone || 'cc-test', text: msg, clinicId }),
      });
      const data = await res.json();
      setSimMsgs(prev => [...prev, {
        role: data.isEmergency ? 'emergency' : 'bot',
        text: data.reply || (isAr ? 'لم يرد النظام.' : 'No response.'),
        transcription: data.transcription,
      }]);
    } catch {
      setSimMsgs(prev => [...prev, { role: 'bot', text: isAr ? 'تعذّر الاتصال.' : 'Connection error.' }]);
    } finally {
      setSimLoading(false);
      setTimeout(() => simScrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const startSimVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSimVoiceError(isAr ? 'المتصفح لا يدعم التعرف على الصوت.' : 'Voice not supported in this browser.'); return; }
    setSimVoiceError('');
    const rec = new SR();
    rec.lang = 'ar-EG';
    rec.interimResults = false;
    simRecRef.current = rec;
    rec.onstart  = () => setSimListening(true);
    rec.onend    = () => setSimListening(false);
    rec.onresult = (e: any) => {
      const t = e.results[0]?.[0]?.transcript || '';
      if (t) { setSimText(t); setTimeout(() => sendSimMessage(t), 400); }
    };
    rec.onerror  = () => { setSimListening(false); setSimVoiceError(isAr ? 'لم أتمكن من فهم الصوت.' : 'Could not capture voice.'); };
    rec.start();
  };

  // ── Voice Reminders state ──────────────────────────────────────────────────
  type ReminderStatus = 'idle' | 'running' | 'done' | 'error';
  type CallLogEntry = {
    callSid: string; apptId: string; phone: string; patientName: string;
    doctorName: string; apptTime: string; apptDate: string;
    status: string; attempt: number; digit: string | null; createdAt: string;
  };
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus>('idle');
  const [reminderResult, setReminderResult] = useState<{ called?: number; skipped?: number; errors?: number } | null>(null);
  const [reminderLogs,   setReminderLogs]   = useState<CallLogEntry[]>([]);
  const [reminderStats,  setReminderStats]  = useState<{ total: number; confirmed: number; cancelled: number; noAnswer: number; initiated: number } | null>(null);
  const [twilioReady,    setTwilioReady]    = useState<boolean | null>(null);

  const fetchReminderStatus = useCallback(async () => {
    try {
      const token = getToken();
      const res   = await fetch('/api/voice-reminders/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return;
      const data = await res.json();
      setTwilioReady(data.twilioConfigured);
      setReminderStats(data.stats);
      setReminderLogs(data.logs || []);
    } catch { /* silent */ }
  }, []);

  // Load status on mount
  useState(() => { fetchReminderStatus(); });

  const runReminders = async () => {
    setReminderStatus('running');
    setReminderResult(null);
    try {
      const token = getToken();
      const res = await fetch('/api/voice-reminders/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (!res.ok) {
        setReminderStatus('error');
        toast({ title: isAr ? 'خطأ في تشغيل المكالمات' : 'Reminder call error', description: data.hint || data.error, variant: 'destructive' });
      } else {
        setReminderStatus('done');
        setReminderResult(data);
        toast({ title: isAr ? `تم الاتصال بـ ${data.called ?? 0} مريض` : `Called ${data.called ?? 0} patients` });
        await fetchReminderStatus();
      }
    } catch {
      setReminderStatus('error');
      toast({ title: isAr ? 'فشل الاتصال بالخادم' : 'Server error', variant: 'destructive' });
    }
  };

  if (!permissions.canViewAppointments) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Lock className="h-8 w-8" />
        <p>{isAr ? 'غير مصرح' : 'Access denied'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <PhoneCall className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">{isAr ? 'مركز الحجز المركزي' : 'Call Center & Central Booking'}</h1>
      </div>

      {/* ── AI Voice Simulator Card ── */}
      <Card className="border-primary/20 bg-primary/[0.02]">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-primary" />
            {isAr ? 'محاكي الحجز الصوتي — ذكاء اصطناعي' : 'AI Voice Booking Simulator'}
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
              {isAr ? 'تجربة آلية WhatsApp بالصوت أو النص' : 'Test the WhatsApp bot via voice or text'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">

          {/* Phone row */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">{isAr ? 'هاتف:' : 'Phone:'}</span>
            <Input
              value={simPhone}
              onChange={e => setSimPhone(e.target.value)}
              className="h-7 text-xs flex-1 font-mono"
              placeholder="0100000001"
              dir="ltr"
              data-testid="input-sim-phone"
            />
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground"
              onClick={() => setSimMsgs([])}
              title={isAr ? 'مسح المحادثة' : 'Clear chat'}
              data-testid="button-sim-clear"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          {/* Chat bubbles */}
          {simMsgs.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3 bg-background/60">
              {simMsgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {m.role === 'emergency' ? (
                    <div className="bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded-xl px-3 py-2 flex items-start gap-1.5 max-w-[92%]">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span dir="rtl" className="whitespace-pre-wrap">{m.text}</span>
                    </div>
                  ) : (
                    <div
                      className={`text-xs rounded-xl px-3 py-2 max-w-[82%] whitespace-pre-wrap ${
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted border border-border text-foreground'
                      }`}
                      dir="rtl"
                    >
                      {m.transcription && (
                        <span className="block text-[10px] opacity-60 mb-1">🎤 {m.transcription}</span>
                      )}
                      {m.text}
                    </div>
                  )}
                </div>
              ))}
              {simLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted border border-border rounded-xl px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {isAr ? 'جارٍ المعالجة…' : 'Processing…'}
                  </div>
                </div>
              )}
              <div ref={simScrollRef} />
            </div>
          )}

          {/* Input row */}
          <div className="flex gap-1.5">
            <Button
              variant={simListening ? 'destructive' : 'outline'}
              size="sm"
              className={`h-8 w-8 p-0 shrink-0 ${simListening ? 'animate-pulse' : ''}`}
              onClick={simListening ? () => { simRecRef.current?.stop(); setSimListening(false); } : startSimVoice}
              disabled={simLoading}
              title={simListening ? (isAr ? 'إيقاف' : 'Stop') : (isAr ? 'تحدث بالعربية' : 'Speak in Arabic')}
              data-testid="button-sim-mic"
            >
              {simListening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </Button>
            <Input
              value={simText}
              onChange={e => setSimText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendSimMessage()}
              placeholder={
                simListening
                  ? (isAr ? '🎙️ أنا أسمعك…' : '🎙️ Listening…')
                  : (isAr ? 'اكتب رسالة المريض… (مثال: عايز أحجز عند دكتور قلب)' : 'Type patient message… (e.g. I want to book a cardiologist)')
              }
              className="flex-1 h-8 text-sm"
              dir="rtl"
              disabled={simLoading || simListening}
              data-testid="input-sim-message"
            />
            <Button
              size="sm"
              className="h-8 px-3 shrink-0"
              onClick={() => sendSimMessage()}
              disabled={!simText.trim() || simLoading || simListening}
              data-testid="button-sim-send"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>

          {simVoiceError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{simVoiceError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── STEP 1: Global Patient Search ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 pr-4"
              placeholder={isAr ? 'ابحث بالاسم أو رقم الهاتف أو الرقم القومي…' : 'Search by name, phone or national ID…'}
              value={query}
              onChange={e => handleSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* STEP 7: fast inline results */}
          {searchResults.length > 0 && (
            <div className="mt-2 border rounded-md divide-y overflow-hidden">
              {searchResults.map(p => (
                <button
                  key={p.id}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 text-left transition-colors"
                  onClick={() => selectPatient(p)}
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{isAr ? p.nameAr || p.name : p.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">{p.phone}</span>
                    {p.isVip && <Badge className="ml-2 bg-amber-100 text-amber-700 text-[10px] px-1 h-4 dark:bg-amber-900/30 dark:text-amber-400"><Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500 mr-0.5" />VIP</Badge>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}

          {query && searchResults.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground px-1">{isAr ? 'لم يُعثر على مريض' : 'No patient found'}</p>
          )}
        </CardContent>
      </Card>

      {selectedPatient && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Left column: patient + call log + quick actions ── */}
          <div className="space-y-4">
            {/* Patient card */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">{isAr ? 'المريض' : 'Patient'}</CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearPatient}><X className="h-3.5 w-3.5" /></Button>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <PatientCard patient={selectedPatient} isAr={isAr} onVipToggle={handleVipToggle} />
              </CardContent>
            </Card>

            {/* STEP 6: upcoming appointments + quick actions */}
            {upcomingApts.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm">{isAr ? 'المواعيد القادمة' : 'Upcoming Appointments'}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  {upcomingApts.map(apt => {
                    const doc = allUsers.find(u => u.id === apt.doctorId);
                    return (
                      <div key={apt.id} className="flex items-center justify-between gap-2 text-xs p-2 rounded bg-muted/40">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{isAr ? doc?.nameAr || doc?.name : doc?.name}</p>
                          <p className="text-muted-foreground">{fmtDate(apt.date, language)} · {apt.time}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-1.5" onClick={() => { setSelectedDoctorId(apt.doctorId); setSelectedDate(apt.date); }}>
                            <RefreshCw className="h-3 w-3 mr-0.5" />{isAr ? 'إعادة' : 'Reschedule'}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1.5 text-destructive hover:text-destructive" onClick={() => handleCancel(apt.id)}>
                            <X className="h-3 w-3 mr-0.5" />{isAr ? 'إلغاء' : 'Cancel'}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* STEP 4: call log form */}
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-primary" />{isAr ? 'تسجيل المكالمة' : 'Log Call'}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <select
                  value={callOutcome}
                  onChange={e => setCallOutcome(e.target.value as CallOutcome)}
                  className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {(Object.keys(OUTCOME_LABELS) as CallOutcome[]).map(k => (
                    <option key={k} value={k}>{isAr ? OUTCOME_LABELS[k].ar : OUTCOME_LABELS[k].en}</option>
                  ))}
                </select>
                <Textarea
                  className="text-xs min-h-[60px] resize-none"
                  placeholder={isAr ? 'ملاحظات المكالمة…' : 'Call notes…'}
                  value={callNotes}
                  onChange={e => setCallNotes(e.target.value)}
                />
                <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={handleLogCall}>
                  <CheckCircle2 className="h-3.5 w-3.5" />{isAr ? 'حفظ' : 'Save Log'}
                </Button>
              </CardContent>
            </Card>

            {/* Call history */}
            {logs.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm">{isAr ? 'سجل المكالمات' : 'Call History'}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2 max-h-48 overflow-y-auto">
                  {logs.slice(0, 10).map(l => (
                    <div key={l.id} className="text-xs space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${OUTCOME_LABELS[l.outcome]?.color || ''}`}>
                          {isAr ? OUTCOME_LABELS[l.outcome]?.ar : OUTCOME_LABELS[l.outcome]?.en}
                        </span>
                        <span className="text-muted-foreground">{new Date(l.callTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {l.notes && <p className="text-muted-foreground truncate">{l.notes}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right 2/3: booking calendar ── */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-primary" />{isAr ? 'حجز موعد جديد' : 'Book New Appointment'}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">

                {/* STEP 3: branch + doctor selectors */}
                <div className="grid grid-cols-2 gap-3">
                  {branches.length > 1 && (
                    <div className="space-y-1">
                      <Label className="text-xs">{isAr ? 'الفرع' : 'Branch'}</Label>
                      <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                        <option value="all">{isAr ? 'جميع الفروع' : 'All Branches'}</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{isAr ? b.nameAr || b.name : b.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div className={`space-y-1 ${branches.length > 1 ? '' : 'col-span-2'}`}>
                    <Label className="text-xs">{isAr ? 'الطبيب' : 'Doctor'}</Label>
                    <select value={selectedDoctorId} onChange={e => { setSelectedDoctorId(e.target.value); setSelectedSlot(''); }}
                      className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
                      <option value="">{isAr ? 'اختر طبيبًا…' : 'Select doctor…'}</option>
                      {doctors.map(d => {
                        const spec = d.specialtyId ? specialtyStore.get(s => s.id === d.specialtyId) : null;
                        return (
                          <option key={d.id} value={d.id}>
                            {isAr ? d.nameAr || d.name : d.name}{spec ? ` — ${isAr ? spec.nameAr || spec.name : spec.name}` : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* STEP 2: date strip */}
                <div>
                  <Label className="text-xs mb-1.5 block">{isAr ? 'التاريخ' : 'Date'}</Label>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {dates.map(d => (
                      <button key={d} onClick={() => { setSelectedDate(d); setSelectedSlot(''); }}
                        className={`shrink-0 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${selectedDate === d ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
                        {fmtDate(d, language)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* STEP 2: available slots grid */}
                {selectedDoctorId && (
                  <div>
                    <Label className="text-xs mb-1.5 block flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {isAr ? 'المواعيد المتاحة' : 'Available Slots'}
                      {availableSlots.length > 0 && <span className="text-muted-foreground">({availableSlots.length})</span>}
                    </Label>
                    {availableSlots.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">{isAr ? 'لا توجد مواعيد متاحة في هذا اليوم' : 'No slots available for this day'}</p>
                    ) : (
                      <div className="grid grid-cols-5 sm:grid-cols-7 gap-1.5">
                        {availableSlots.map(slot => (
                          <button key={slot} onClick={() => setSelectedSlot(slot)}
                            className={`py-1.5 rounded text-xs font-mono font-medium border transition-colors ${selectedSlot === slot ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
                            {slot}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Notes + Book button */}
                {selectedSlot && (
                  <div className="space-y-2 pt-1 border-t">
                    <Textarea
                      className="text-xs min-h-[50px] resize-none"
                      placeholder={isAr ? 'ملاحظات (اختياري)…' : 'Notes (optional)…'}
                      value={bookingNotes}
                      onChange={e => setBookingNotes(e.target.value)}
                    />
                    <Button className="w-full gap-2" onClick={handleBook} disabled={booking}>
                      <Calendar className="h-4 w-4" />
                      {booking
                        ? (isAr ? 'جارٍ الحجز…' : 'Booking…')
                        : (isAr ? `احجز ${selectedDate} الساعة ${selectedSlot}` : `Book ${selectedDate} at ${selectedSlot}`)}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── STEP 2: unified doctor availability overview (no patient selected) ── */}
      {!selectedPatient && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm">{isAr ? 'نظرة عامة — الأطباء المتاحون اليوم' : 'Overview — Doctors Available Today'}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {doctors.map(doc => {
                const slots = getAvailableSlots(doc.id, dates[0]);
                const spec  = doc.specialtyId ? specialtyStore.get(s => s.id === doc.specialtyId) : null;
                return (
                  <div key={doc.id} className="border rounded-lg p-3 space-y-1 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedDoctorId(doc.id)}>
                    <p className="text-sm font-medium">{isAr ? doc.nameAr || doc.name : doc.name}</p>
                    {spec && <p className="text-xs text-muted-foreground">{isAr ? spec.nameAr || spec.name : spec.name}</p>}
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant={slots.length > 0 ? 'default' : 'secondary'} className="text-[10px] h-4 px-1.5">
                        {slots.length > 0 ? `${slots.length} ${isAr ? 'موعد' : 'slots'}` : (isAr ? 'لا يوجد' : 'Full')}
                      </Badge>
                      {slots.length > 0 && <span className="text-[10px] text-muted-foreground">{slots[0]} – {slots[slots.length - 1]}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Voice Reminder Calls Card ── */}
      <Card className="border-blue-200/60 dark:border-blue-800/40 bg-blue-50/30 dark:bg-blue-950/10">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <BellRing className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            {isAr ? 'مكالمات تذكير المواعيد — تلقائية' : 'Automated Appointment Reminder Calls'}
            {twilioReady === false && (
              <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1.5 text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">
                {isAr ? 'Twilio غير مُعدَّل' : 'Twilio not configured'}
              </Badge>
            )}
            {twilioReady === true && (
              <Badge className="ml-auto text-[10px] h-4 px-1.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {isAr ? 'جاهز' : 'Ready'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">

          {/* Stats row */}
          {reminderStats && reminderStats.total > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: isAr ? 'مُتصَل' : 'Called',     value: reminderStats.total,     color: 'text-foreground' },
                { label: isAr ? 'مؤكَّد' : 'Confirmed',  value: reminderStats.confirmed,  color: 'text-green-600 dark:text-green-400' },
                { label: isAr ? 'مُلغى' : 'Cancelled',   value: reminderStats.cancelled,  color: 'text-destructive' },
                { label: isAr ? 'بلا رد' : 'No Answer',  value: reminderStats.noAnswer,   color: 'text-muted-foreground' },
              ].map(s => (
                <div key={s.label} className="text-center p-2 rounded-lg bg-background/60 border border-border">
                  <p className={`text-lg font-semibold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Result from last run */}
          {reminderResult && reminderStatus === 'done' && (
            <div className="text-xs rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 px-3 py-2 text-green-700 dark:text-green-400 flex items-center gap-2">
              <PhoneIncoming className="h-3.5 w-3.5 shrink-0" />
              {isAr
                ? `تم الاتصال بـ ${reminderResult.called ?? 0} مريض · تخطي ${reminderResult.skipped ?? 0} · أخطاء ${reminderResult.errors ?? 0}`
                : `Called ${reminderResult.called ?? 0} · Skipped ${reminderResult.skipped ?? 0} · Errors ${reminderResult.errors ?? 0}`}
            </div>
          )}

          {/* Not configured notice */}
          {twilioReady === false && (
            <div className="text-xs rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2 text-amber-700 dark:text-amber-400 space-y-1">
              <p className="font-medium flex items-center gap-1.5"><PhoneOff className="h-3.5 w-3.5" />{isAr ? 'Twilio غير مُعدَّل' : 'Twilio not configured'}</p>
              <p className="opacity-80">{isAr ? 'أضف TWILIO_ACCOUNT_SID و TWILIO_AUTH_TOKEN و TWILIO_FROM_NUMBER في Secrets.' : 'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER in Secrets.'}</p>
            </div>
          )}

          {/* Run button */}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={runReminders}
              disabled={reminderStatus === 'running' || twilioReady === false}
              data-testid="button-run-reminders"
            >
              {reminderStatus === 'running'
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{isAr ? 'جارٍ الاتصال…' : 'Calling…'}</>
                : <><BellRing className="h-3.5 w-3.5" />{isAr ? 'تشغيل مكالمات التذكير' : 'Run Reminder Calls'}</>}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={fetchReminderStatus} data-testid="button-refresh-reminders">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Recent call log table */}
          {reminderLogs.length > 0 && (
            <div className="overflow-hidden border rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">{isAr ? 'المريض' : 'Patient'}</th>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">{isAr ? 'الموعد' : 'Appt'}</th>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">{isAr ? 'الطبيب' : 'Doctor'}</th>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">{isAr ? 'المحاولة' : 'Try'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reminderLogs.slice(0, 10).map((l, i) => {
                    const statusMap: Record<string, { label: string; labelAr: string; cls: string }> = {
                      initiated:  { label: 'Calling',   labelAr: 'جارٍ',    cls: 'text-blue-600 dark:text-blue-400' },
                      confirmed:  { label: 'Confirmed', labelAr: 'مؤكَّد',  cls: 'text-green-600 dark:text-green-400' },
                      cancelled:  { label: 'Cancelled', labelAr: 'مُلغى',   cls: 'text-destructive' },
                      no_answer:  { label: 'No Answer', labelAr: 'بلا رد',  cls: 'text-muted-foreground' },
                      error:      { label: 'Error',     labelAr: 'خطأ',     cls: 'text-destructive' },
                    };
                    const s = statusMap[l.status] || { label: l.status, labelAr: l.status, cls: 'text-muted-foreground' };
                    return (
                      <tr key={l.callSid || i} className="hover:bg-muted/30" data-testid={`row-reminder-${i}`}>
                        <td className="px-2 py-1.5 font-medium">{l.patientName}</td>
                        <td className="px-2 py-1.5 text-muted-foreground font-mono">{l.apptDate} {l.apptTime}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{l.doctorName}</td>
                        <td className={`px-2 py-1.5 font-medium ${s.cls}`}>{isAr ? s.labelAr : s.label}</td>
                        <td className="px-2 py-1.5 text-center text-muted-foreground">{l.attempt}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
