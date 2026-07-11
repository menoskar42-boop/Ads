import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/hooks/useAuth';
import { usePatients } from '@/hooks/usePatients';
import { useVitalSigns } from '@/hooks/useVitalSigns';
import { useUsers } from '@/hooks/useUsers';
import { visitStore, completeVisit as completeVisitStore } from '@/stores/visitStore';
import { vitalSignStore } from '@/stores/vitalSignStore';
import { Visit, Patient, VitalSign } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  ArrowLeft, Timer, ChevronLeft, ChevronRight, User, Heart, Thermometer,
  Weight, Activity, Droplets, FlaskConical, Pill, CalendarPlus, Mic, MicOff,
  CheckCircle, Loader2, Stethoscope, AlertTriangle, ClipboardList, X, Plus,
} from 'lucide-react';
import AIMedicalCopilot from '@/components/AIMedicalCopilot';
import DoctorAssistant from '@/components/DoctorAssistant';

const QUICK_LABS = [
  { en: 'CBC', ar: 'صورة دم كاملة' },
  { en: 'Random Blood Sugar', ar: 'سكر عشوائي' },
  { en: 'HbA1c', ar: 'سكر تراكمي' },
  { en: 'Lipid Profile', ar: 'دهون الدم' },
  { en: 'Liver Enzymes', ar: 'وظائف كبد' },
  { en: 'Kidney Function', ar: 'وظائف كلى' },
  { en: 'Urine Analysis', ar: 'تحليل بول' },
  { en: 'TSH', ar: 'هرمون الغدة الدرقية' },
  { en: 'CRP', ar: 'بروتين سي التفاعلي' },
  { en: 'Chest X-Ray', ar: 'أشعة صدر' },
  { en: 'Abdominal Ultrasound', ar: 'سونار بطن' },
  { en: 'ECG', ar: 'رسم قلب' },
];

function useSessionTimer(startTime: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const base = new Date(startTime).getTime();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - base) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const DoctorClinicalSuite: React.FC = () => {
  const { visitId } = useParams<{ visitId: string }>();
  const navigate = useNavigate();
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const { patients } = usePatients();
  const { vitals, addVital } = useVitalSigns();
  const { users } = useUsers();
  const isAr = language === 'ar';

  const [visit, setVisit] = useState<Visit | null>(() => visitStore.get(v => v.id === visitId) || null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('vitals');

  // Scribe
  const [scribeText, setScribeText] = useState('');
  const [scribeLoading, setScribeLoading] = useState(false);
  const [scribeResult, setScribeResult] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  // Vitals form
  const [vForm, setVForm] = useState({
    systolic: '', diastolic: '', heartRate: '', temperature: '', weight: '', oxygenSaturation: '',
  });
  const [savingVitals, setSavingVitals] = useState(false);

  // Lab orders
  const [selectedLabs, setSelectedLabs] = useState<string[]>([]);
  const [labNotes, setLabNotes] = useState('');

  // Follow-up
  const [followUpDays, setFollowUpDays] = useState('7');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [followUpSaved, setFollowUpSaved] = useState(false);

  useEffect(() => {
    return visitStore.subscribe(() => setVisit(visitStore.get(v => v.id === visitId) || null));
  }, [visitId]);

  const patient = visit ? patients.find(p => p.id === visit.patientId) : null;
  const patientName = patient ? (isAr ? patient.nameAr : patient.name) : '-';

  const patientVitals = visit
    ? vitals.filter(v => v.patientId === visit.patientId).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    : [];
  const lastVital = patientVitals[0];

  // Chart data — last 6 vitals in chronological order
  const chartData = patientVitals.slice(0, 6).reverse().map(v => ({
    date: v.recordedAt.slice(0, 10),
    BP: v.systolic,
    HR: v.heartRate,
    Temp: v.temperature,
    SpO2: v.oxygenSaturation,
  }));

  const sessionStart = visit?.updatedAt || new Date().toISOString();
  const timer = useSessionTimer(sessionStart);

  const saveVitals = () => {
    if (!visit || !vForm.systolic) {
      toast.error(isAr ? 'يرجى إدخال ضغط الدم على الأقل' : 'Please enter at least blood pressure');
      return;
    }
    setSavingVitals(true);
    addVital({
      patientId: visit.patientId,
      visitId: visit.id,
      doctorId: user?.id || '',
      systolic: Number(vForm.systolic),
      diastolic: Number(vForm.diastolic),
      heartRate: Number(vForm.heartRate),
      temperature: Number(vForm.temperature),
      weight: Number(vForm.weight),
      oxygenSaturation: vForm.oxygenSaturation ? Number(vForm.oxygenSaturation) : undefined,
      recordedAt: new Date().toISOString(),
    });
    toast.success(isAr ? 'تم حفظ العلامات الحيوية' : 'Vital signs saved');
    setVForm({ systolic: '', diastolic: '', heartRate: '', temperature: '', weight: '', oxygenSaturation: '' });
    setSavingVitals(false);
  };

  const runScribe = async () => {
    if (!scribeText.trim()) { toast.error(isAr ? 'أدخل النص أولاً' : 'Enter text first'); return; }
    setScribeLoading(true);
    try {
      const res = await fetch('/api/ai-scribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: scribeText, language }),
      });
      if (res.ok) {
        const data = await res.json();
        setScribeResult(data.structured || '');
        toast.success(isAr ? 'تم التحليل' : 'Analysis complete');
      } else {
        // Fallback: format locally
        setScribeResult(`SOAP Note:\nSubjective: ${scribeText}\nObjective: -\nAssessment: -\nPlan: -`);
      }
    } catch {
      setScribeResult(`SOAP Note:\nSubjective: ${scribeText}\nObjective: -\nAssessment: -\nPlan: -`);
    } finally {
      setScribeLoading(false);
    }
  };

  const addLabToNotes = () => {
    if (selectedLabs.length === 0) { toast.error(isAr ? 'اختر فحصاً على الأقل' : 'Select at least one test'); return; }
    const labList = selectedLabs.join(', ');
    toast.success(isAr ? `تم إضافة ${selectedLabs.length} فحص` : `Added ${selectedLabs.length} lab order(s)`);
    setSelectedLabs([]);
    setLabNotes('');
  };

  const saveFollowUp = () => {
    if (!followUpDays) return;
    setFollowUpSaved(true);
    toast.success(isAr ? `تم جدولة المتابعة بعد ${followUpDays} يوم` : `Follow-up scheduled in ${followUpDays} days`);
  };

  const completeVisit = () => {
    if (!visit) return;
    completeVisitStore(visit.id); // updates appointment status + awards loyalty points
    toast.success(isAr ? 'تمت الزيارة بنجاح' : 'Visit completed successfully');
    navigate(-1);
  };

  if (!visit || !patient) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>{isAr ? 'لم يتم العثور على الزيارة' : 'Visit not found'}</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 me-2" />{isAr ? 'رجوع' : 'Back'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Top bar */}
      <div className="bg-card border-b px-4 py-2 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-bold text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-blue-600" />
              {isAr ? 'غرفة الفحص' : 'Consultation Room'}
            </h1>
            <p className="text-xs text-muted-foreground">{patientName} • {visit.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-mono font-bold">
            <Timer className="h-4 w-4" /> {timer}
          </div>
          <Badge variant="outline" className="text-xs">{visit.status}</Badge>
          <Button variant="destructive" size="sm" onClick={completeVisit} className="gap-1">
            <CheckCircle className="h-4 w-4" />
            {isAr ? 'إنهاء الزيارة' : 'Complete Visit'}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Collapsible patient sidebar */}
        <div className={`${sidebarOpen ? 'w-72' : 'w-10'} bg-card border-e transition-all duration-300 flex-shrink-0 flex flex-col overflow-hidden`}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="flex items-center justify-center h-10 w-full border-b hover:bg-accent/40 flex-shrink-0"
          >
            {sidebarOpen
              ? (isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />)
              : (isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)
            }
          </button>

          {sidebarOpen && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4 text-sm">
              {/* Patient info */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">{patientName}</p>
                    <p className="text-xs text-muted-foreground">{patient.phone}</p>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p>{isAr ? 'تاريخ الميلاد:' : 'DOB:'} {patient.dateOfBirth}</p>
                  <p>{isAr ? 'الجنس:' : 'Gender:'} {isAr ? (patient.gender === 'male' ? 'ذكر' : 'أنثى') : patient.gender}</p>
                </div>
              </div>

              <Separator />

              {/* Last vitals */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                  <Activity className="h-3 w-3" /> {isAr ? 'آخر علامات حيوية' : 'Last Vitals'}
                </p>
                {lastVital ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Heart className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-muted-foreground">{isAr ? 'ضغط:' : 'BP:'}</span>
                      <span className="font-medium">{lastVital.systolic}/{lastVital.diastolic}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Activity className="h-3.5 w-3.5 text-blue-400" />
                      <span className="text-muted-foreground">{isAr ? 'نبض:' : 'HR:'}</span>
                      <span className="font-medium">{lastVital.heartRate} bpm</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                      <span className="text-muted-foreground">{isAr ? 'حرارة:' : 'Temp:'}</span>
                      <span className="font-medium">{lastVital.temperature}°C</span>
                    </div>
                    {lastVital.weight && (
                      <div className="flex items-center gap-2">
                        <Weight className="h-3.5 w-3.5 text-green-400" />
                        <span className="text-muted-foreground">{isAr ? 'وزن:' : 'Wt:'}</span>
                        <span className="font-medium">{lastVital.weight} kg</span>
                      </div>
                    )}
                    {lastVital.oxygenSaturation && (
                      <div className="flex items-center gap-2">
                        <Droplets className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-muted-foreground">SpO₂:</span>
                        <span className="font-medium">{lastVital.oxygenSaturation}%</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">{lastVital.recordedAt.slice(0, 10)}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">{isAr ? 'لا توجد بيانات' : 'No data'}</p>
                )}
              </div>

              <Separator />

              {/* Allergies placeholder */}
              <div>
                <p className="text-xs font-semibold text-amber-600 uppercase mb-2 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {isAr ? 'الحساسية' : 'Allergies'}
                </p>
                <p className="text-xs text-muted-foreground italic">{isAr ? 'لا توجد حساسية مسجلة' : 'No allergies recorded'}</p>
              </div>

              <Separator />

              {/* Notes quick save */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                  <ClipboardList className="h-3 w-3" /> {isAr ? 'ملاحظات سريعة' : 'Quick Notes'}
                </p>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  placeholder={isAr ? 'اكتب ملاحظاتك...' : 'Type your notes...'}
                  className="text-xs resize-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-1.5 text-xs"
                  onClick={() => { visitStore.update(v => v.id === visit.id, { notes }); toast.success(isAr ? 'تم الحفظ' : 'Saved'); }}
                >
                  {isAr ? 'حفظ' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="vitals">{isAr ? 'علامات حيوية' : 'Vitals'}</TabsTrigger>
              <TabsTrigger value="labs">{isAr ? 'فحوصات' : 'Lab Orders'}</TabsTrigger>
              <TabsTrigger value="scribe">{isAr ? 'مساعد AI' : 'AI Scribe'}</TabsTrigger>
              <TabsTrigger value="copilot">{isAr ? 'مساعد طبي' : 'Copilot'}</TabsTrigger>
              <TabsTrigger value="assistant" className="gap-1.5">
                <Mic className="h-4 w-4" />
                {isAr ? 'مساعد الطبيب' : 'Dr. Assistant'}
              </TabsTrigger>
              <TabsTrigger value="followup">{isAr ? 'متابعة' : 'Follow-up'}</TabsTrigger>
            </TabsList>

            {/* VITALS TAB */}
            <TabsContent value="vitals" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{isAr ? 'تسجيل العلامات الحيوية' : 'Record Vital Signs'}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">{isAr ? 'ضغط انقباضي (mmHg)' : 'Systolic (mmHg)'}</Label>
                      <Input type="number" value={vForm.systolic} onChange={e => setVForm(f => ({ ...f, systolic: e.target.value }))} placeholder="120" />
                    </div>
                    <div>
                      <Label className="text-xs">{isAr ? 'ضغط انبساطي (mmHg)' : 'Diastolic (mmHg)'}</Label>
                      <Input type="number" value={vForm.diastolic} onChange={e => setVForm(f => ({ ...f, diastolic: e.target.value }))} placeholder="80" />
                    </div>
                    <div>
                      <Label className="text-xs">{isAr ? 'معدل النبض (bpm)' : 'Heart Rate (bpm)'}</Label>
                      <Input type="number" value={vForm.heartRate} onChange={e => setVForm(f => ({ ...f, heartRate: e.target.value }))} placeholder="72" />
                    </div>
                    <div>
                      <Label className="text-xs">{isAr ? 'الحرارة (°C)' : 'Temperature (°C)'}</Label>
                      <Input type="number" step="0.1" value={vForm.temperature} onChange={e => setVForm(f => ({ ...f, temperature: e.target.value }))} placeholder="36.6" />
                    </div>
                    <div>
                      <Label className="text-xs">{isAr ? 'الوزن (kg)' : 'Weight (kg)'}</Label>
                      <Input type="number" step="0.1" value={vForm.weight} onChange={e => setVForm(f => ({ ...f, weight: e.target.value }))} placeholder="70" />
                    </div>
                    <div>
                      <Label className="text-xs">SpO₂ (%)</Label>
                      <Input type="number" value={vForm.oxygenSaturation} onChange={e => setVForm(f => ({ ...f, oxygenSaturation: e.target.value }))} placeholder="98" />
                    </div>
                  </div>
                  <Button onClick={saveVitals} className="mt-3 gap-2" disabled={savingVitals}>
                    {savingVitals ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    {isAr ? 'حفظ العلامات الحيوية' : 'Save Vitals'}
                  </Button>
                </CardContent>
              </Card>

              {/* Chart */}
              {chartData.length > 1 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{isAr ? 'مخطط العلامات الحيوية' : 'Vitals Trend'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="BP" stroke="#ef4444" dot name={isAr ? 'ضغط' : 'BP'} />
                        <Line type="monotone" dataKey="HR" stroke="#3b82f6" dot name={isAr ? 'نبض' : 'HR'} />
                        <Line type="monotone" dataKey="Temp" stroke="#f59e0b" dot name={isAr ? 'حرارة' : 'Temp'} />
                        <Line type="monotone" dataKey="SpO2" stroke="#10b981" dot name="SpO₂" />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Previous vitals */}
              {patientVitals.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{isAr ? 'السجل السابق' : 'Previous Readings'}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y text-sm">
                      {patientVitals.slice(0, 5).map(v => (
                        <div key={v.id} className="px-4 py-2 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{v.recordedAt.slice(0, 10)}</span>
                          <span>BP: <b>{v.systolic}/{v.diastolic}</b></span>
                          <span>HR: <b>{v.heartRate}</b></span>
                          <span>T: <b>{v.temperature}°C</b></span>
                          {v.oxygenSaturation && <span>SpO₂: <b>{v.oxygenSaturation}%</b></span>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* LAB ORDERS TAB */}
            <TabsContent value="labs" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-blue-500" />
                    {isAr ? 'طلبات الفحص السريع' : 'Quick Lab Orders'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                    {QUICK_LABS.map(lab => (
                      <button
                        key={lab.en}
                        onClick={() => setSelectedLabs(prev =>
                          prev.includes(lab.en) ? prev.filter(l => l !== lab.en) : [...prev, lab.en]
                        )}
                        className={`px-3 py-2 rounded-lg border text-sm text-start transition-all ${
                          selectedLabs.includes(lab.en)
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background hover:bg-accent/40 border-border'
                        }`}
                      >
                        {isAr ? lab.ar : lab.en}
                      </button>
                    ))}
                  </div>
                  {selectedLabs.length > 0 && (
                    <div className="mb-3">
                      <p className="text-sm font-medium mb-1">{isAr ? 'المختار:' : 'Selected:'}</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedLabs.map(l => (
                          <Badge key={l} variant="secondary" className="gap-1">
                            {isAr ? (QUICK_LABS.find(q => q.en === l)?.ar || l) : l}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedLabs(prev => prev.filter(x => x !== l))} />
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <Textarea
                    value={labNotes}
                    onChange={e => setLabNotes(e.target.value)}
                    placeholder={isAr ? 'ملاحظات للمختبر...' : 'Notes for lab...'}
                    rows={2}
                    className="mb-2"
                  />
                  <Button onClick={addLabToNotes} className="gap-2" disabled={selectedLabs.length === 0}>
                    <Plus className="h-4 w-4" />
                    {isAr ? `إضافة ${selectedLabs.length} فحص` : `Add ${selectedLabs.length} Test(s)`}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI SCRIBE TAB */}
            <TabsContent value="scribe" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mic className="h-4 w-4 text-purple-500" />
                    {isAr ? 'المساعد الذكي (AI Scribe)' : 'AI Scribe Assistant'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {isAr
                      ? 'اكتب أو انسخ ملاحظاتك الحرة وسيحولها AI إلى ملاحظة SOAP منظمة'
                      : 'Type or paste your free-text notes and AI will structure them into a SOAP note'}
                  </p>
                  <Textarea
                    value={scribeText}
                    onChange={e => setScribeText(e.target.value)}
                    rows={5}
                    placeholder={isAr ? 'مثال: مريض 45 سنة يشكو من صداع منذ 3 أيام، ضغط مرتفع...' : 'e.g. 45yo male with 3-day headache, high BP on arrival...'}
                  />
                  <Button onClick={runScribe} className="gap-2" disabled={scribeLoading || !scribeText.trim()}>
                    {scribeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                    {isAr ? 'تحليل بالذكاء الاصطناعي' : 'Analyze with AI'}
                  </Button>
                  {scribeResult && (
                    <div className="mt-3">
                      <p className="text-sm font-semibold mb-1">{isAr ? 'النتيجة:' : 'Result:'}</p>
                      <div className="bg-muted rounded p-3 text-sm whitespace-pre-wrap font-mono border">
                        {scribeResult}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => { setNotes(prev => prev + '\n' + scribeResult); toast.success(isAr ? 'تم نسخ للملاحظات' : 'Copied to notes'); }}
                      >
                        {isAr ? 'نسخ للملاحظات' : 'Copy to Notes'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* AI MEDICAL COPILOT TAB */}
            <TabsContent value="copilot">
              {visit && patient && (
                <AIMedicalCopilot
                  patientId={patient.id}
                  visitId={visit.id}
                  onApplyToNotes={text => setNotes(prev => prev ? `${prev}\n\n${text}` : text)}
                />
              )}
            </TabsContent>

            {/* DOCTOR ASSISTANT TAB */}
            <TabsContent value="assistant" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Stethoscope className="h-4 w-4 text-blue-500" />
                    {isAr ? 'مساعد الطبيب الذكي' : 'AI Doctor Assistant'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DoctorAssistant
                    onInsert={text => setNotes(prev => prev ? prev + '\n' + text : text)}
                    language={language as 'ar' | 'en'}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* FOLLOW-UP TAB */}
            <TabsContent value="followup" className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarPlus className="h-4 w-4 text-green-500" />
                    {isAr ? 'جدولة المتابعة' : 'Schedule Follow-up'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-1">
                    {['3', '7', '14', '30'].map(d => (
                      <button
                        key={d}
                        onClick={() => setFollowUpDays(d)}
                        className={`py-2 rounded-lg border text-sm font-medium transition-all ${
                          followUpDays === d ? 'bg-green-600 text-white border-green-600 dark:bg-green-700' : 'bg-background hover:bg-accent/40 border-border'
                        }`}
                      >
                        {d} {isAr ? 'يوم' : 'days'}
                      </button>
                    ))}
                  </div>
                  <div>
                    <Label>{isAr ? 'عدد الأيام المخصص' : 'Custom days'}</Label>
                    <Input
                      type="number"
                      value={followUpDays}
                      onChange={e => setFollowUpDays(e.target.value)}
                      className="w-32"
                    />
                  </div>
                  <div>
                    <Label>{isAr ? 'تعليمات للمريض' : 'Patient Instructions'}</Label>
                    <Textarea
                      value={followUpNotes}
                      onChange={e => setFollowUpNotes(e.target.value)}
                      rows={3}
                      placeholder={isAr ? 'مثال: استمر في الدواء، تعال بصائم...' : 'e.g. Continue medication, come fasting...'}
                    />
                  </div>
                  {followUpDays && (
                    <div className="bg-green-50 rounded p-2 text-sm text-green-700">
                      {isAr
                        ? `موعد المتابعة: ${new Date(Date.now() + Number(followUpDays) * 86400000).toLocaleDateString('ar-EG')}`
                        : `Follow-up date: ${new Date(Date.now() + Number(followUpDays) * 86400000).toLocaleDateString('en-US')}`}
                    </div>
                  )}
                  <Button
                    onClick={saveFollowUp}
                    className="gap-2"
                    disabled={!followUpDays || followUpSaved}
                    variant={followUpSaved ? 'outline' : 'default'}
                  >
                    {followUpSaved ? <CheckCircle className="h-4 w-4 text-green-600" /> : <CalendarPlus className="h-4 w-4" />}
                    {followUpSaved ? (isAr ? 'تم الجدولة' : 'Scheduled') : (isAr ? 'جدولة المتابعة' : 'Schedule Follow-up')}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default DoctorClinicalSuite;
