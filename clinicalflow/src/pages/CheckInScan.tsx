import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { parseQRPayload } from '@/lib/qrToken';
import { patientStore } from '@/stores/patientStore';
import {
  appointmentStore, invoiceStore, visitStore,
  checkInAppointment, createVisitWithInvoice, addToQueue,
} from '@/stores/visitStore';
import { getDoctors } from '@/stores/userStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, ShieldAlert, ScanLine, CheckCircle2, AlertCircle, UserPlus, Camera, CameraOff } from 'lucide-react';
import { toast } from 'sonner';

type ScanState = 'scanning' | 'confirm' | 'walkin_pick' | 'success' | 'error';
type RouteDecision = 'checkin' | 'walkin' | 'unpaid';

interface ScanResult {
  patientId: string;
  patientName: string;
  patientNameAr: string;
  phone: string;
  isDynamic: boolean;
  decision: RouteDecision;
  appointmentId?: string;
  unpaidInvoiceId?: string;
}

const CheckInScan: React.FC = () => {
  const { user } = useAuth();
  const { language, isRTL } = useLanguage();
  const navigate = useNavigate();
  const isAr = language === 'ar';
  const clinicId = user?.clinicId || '';

  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [processing, setProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const detectorRef = useRef<any>(null);

  const doctors = getDoctors().filter(d => !clinicId || d.clinicId === clinicId);
  const today = new Date().toISOString().slice(0, 10);

  // ── QR payload → routing decision ─────────────────────────────────────────
  const resolveAndRoute = useCallback((rawQr: string) => {
    const payload = parseQRPayload(rawQr);
    if (!payload) {
      setScanState('error');
      return;
    }

    const patient = patientStore.get(p => p.id === payload.patientId);
    if (!patient) { setScanState('error'); return; }

    // Unpaid invoice check
    const unpaidInvoice = invoiceStore.get(
      i => i.patientId === patient.id && (i.status === 'pending' || i.status === 'partial')
    );

    // Today's appointment check
    const todayApt = appointmentStore.get(
      a => a.patientId === patient.id &&
           a.date === today &&
           (!clinicId || a.clinicId === clinicId) &&
           a.status !== 'cancelled' &&
           a.status !== 'completed' &&
           a.status !== 'no_show'
    );

    let decision: RouteDecision = 'walkin';
    if (unpaidInvoice) decision = 'unpaid';
    else if (todayApt) decision = 'checkin';

    setScanResult({
      patientId: patient.id,
      patientName: patient.name,
      patientNameAr: patient.nameAr || patient.name,
      phone: patient.phone,
      isDynamic: payload.isDynamic,
      decision,
      appointmentId: todayApt?.id,
      unpaidInvoiceId: unpaidInvoice?.id,
    });

    if (decision === 'walkin') {
      setScanState('walkin_pick');
    } else {
      setScanState('confirm');
    }
  }, [clinicId, today]);

  // ── Camera ─────────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      if (!('BarcodeDetector' in window)) {
        setCameraError(isAr ? 'المتصفح لا يدعم المسح الضوئي. استخدم الإدخال اليدوي.' : 'Browser does not support camera scanning. Use manual input.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      setCameraActive(true);
    } catch {
      setCameraError(isAr ? 'تعذّر الوصول إلى الكاميرا.' : 'Camera access denied.');
    }
  }, [isAr]);

  // Scan loop
  useEffect(() => {
    if (!cameraActive || scanState !== 'scanning') return;

    let active = true;
    const tick = async () => {
      if (!active || !videoRef.current || !detectorRef.current) return;
      if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        try {
          const codes = await detectorRef.current.detect(videoRef.current);
          if (codes.length > 0) {
            stopCamera();
            resolveAndRoute(codes[0].rawValue);
            return;
          }
        } catch { /* ignore */ }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, [cameraActive, scanState, stopCamera, resolveAndRoute]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleConfirmCheckin = () => {
    if (!scanResult) return;
    setProcessing(true);
    try {
      if (scanResult.decision === 'checkin' && scanResult.appointmentId) {
        const result = checkInAppointment(scanResult.appointmentId);
        if (!result) throw new Error('checkin_failed');
        playBeep();
        setScanState('success');
        toast.success(isAr ? 'تم تسجيل الحضور بنجاح' : 'Check-in successful');
      }
    } catch {
      toast.error(isAr ? 'فشل تسجيل الحضور' : 'Check-in failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleWalkinCheckin = () => {
    if (!scanResult || !selectedDoctorId) return;
    setProcessing(true);
    try {
      const doctor = doctors.find(d => d.id === selectedDoctorId);
      const { visit } = createVisitWithInvoice({
        patientId: scanResult.patientId,
        doctorId: selectedDoctorId,
        specialtyId: doctor?.specialtyId || '',
        date: today,
        time: new Date().toTimeString().slice(0, 5),
        clinicId,
      });
      addToQueue(visit.id);
      playBeep();
      setScanState('success');
      toast.success(isAr ? 'تم تسجيل زيارة عيادية جديدة' : 'Walk-in registered successfully');
    } catch {
      toast.error(isAr ? 'فشل تسجيل الزيارة' : 'Registration failed');
    } finally {
      setProcessing(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    setManualInput('');
    resolveAndRoute(trimmed);
  };

  const reset = () => {
    setScanState('scanning');
    setScanResult(null);
    setSelectedDoctorId('');
    setManualInput('');
    setProcessing(false);
  };

  const patientName = scanResult ? (isAr ? scanResult.patientNameAr : scanResult.patientName) : '';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background p-4 flex flex-col items-center gap-4" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-bold text-foreground mb-1">
          {isAr ? 'مسح QR — تسجيل الحضور' : 'QR Check-in Scanner'}
        </h1>
        <p className="text-xs text-muted-foreground mb-4">
          {isAr ? 'امسح بطاقة المريض الرقمية لتسجيل حضوره' : "Scan the patient's digital card to check them in"}
        </p>

        {/* ── Scanning state ── */}
        {scanState === 'scanning' && (
          <div className="flex flex-col gap-3">
            {/* Camera preview */}
            <Card className="overflow-hidden">
              <div className="relative bg-black aspect-square flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white">
                    <ScanLine className="h-10 w-10 opacity-40" />
                    <p className="text-xs opacity-60">{isAr ? 'الكاميرا متوقفة' : 'Camera off'}</p>
                  </div>
                )}
                {cameraActive && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-primary rounded-xl opacity-70" />
                  </div>
                )}
              </div>
              <CardContent className="py-3 px-4 flex gap-2">
                {!cameraActive ? (
                  <Button size="sm" className="flex-1 gap-1.5" onClick={startCamera}>
                    <Camera className="h-3.5 w-3.5" />
                    {isAr ? 'تشغيل الكاميرا' : 'Start Camera'}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={stopCamera}>
                    <CameraOff className="h-3.5 w-3.5" />
                    {isAr ? 'إيقاف' : 'Stop'}
                  </Button>
                )}
              </CardContent>
            </Card>

            {cameraError && (
              <p className="text-xs text-destructive text-center">{cameraError}</p>
            )}

            {/* Manual input fallback */}
            <div className="relative">
              <div className="absolute inset-x-0 top-1/2 border-t border-border" />
              <span className="relative block mx-auto w-fit bg-background px-2 text-[10px] text-muted-foreground">
                {isAr ? 'أو أدخل يدوياً' : 'or enter manually'}
              </span>
            </div>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <Input
                className="flex-1 text-xs font-mono h-8"
                placeholder={isAr ? 'الصق بيانات QR هنا…' : 'Paste QR data here…'}
                value={manualInput}
                onChange={e => setManualInput(e.target.value)}
              />
              <Button size="sm" type="submit" className="h-8 px-3">
                {isAr ? 'فحص' : 'Scan'}
              </Button>
            </form>
          </div>
        )}

        {/* ── Confirm state (checkin or unpaid) ── */}
        {(scanState === 'confirm') && scanResult && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {scanResult.isDynamic
                  ? <ShieldCheck className="h-4 w-4 text-green-600" />
                  : <ShieldAlert className="h-4 w-4 text-amber-500" />}
                {isAr ? 'تأكيد الحضور' : 'Confirm Check-in'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/50 rounded-lg px-3 py-2 space-y-0.5">
                <p className="font-semibold text-foreground text-sm">{patientName}</p>
                <p className="text-xs text-muted-foreground">{scanResult.phone}</p>
              </div>

              {scanResult.decision === 'unpaid' && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800">
                      {isAr ? 'فاتورة غير مسددة' : 'Unpaid Invoice'}
                    </p>
                    <p className="text-[10px] text-amber-700">
                      {isAr ? 'يرجى تسوية الفاتورة قبل الدخول.' : 'Please settle the invoice before entry.'}
                    </p>
                  </div>
                </div>
              )}

              <Badge
                variant={scanResult.isDynamic ? 'default' : 'outline'}
                className={`text-[10px] ${scanResult.isDynamic ? 'bg-green-600 hover:bg-green-600' : 'text-amber-600 border-amber-400'}`}
              >
                {scanResult.isDynamic
                  ? (isAr ? 'QR ديناميكي — آمن' : 'Dynamic QR — Secure')
                  : (isAr ? 'QR ثابت — أمان منخفض' : 'Static QR — Low Security')}
              </Badge>

              <div className="flex gap-2 pt-1">
                {scanResult.decision === 'checkin' && (
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5"
                    onClick={handleConfirmCheckin}
                    disabled={processing}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {isAr ? 'تأكيد الحضور' : 'Confirm Check-in'}
                  </Button>
                )}
                {scanResult.decision === 'unpaid' && (
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 bg-amber-600 hover:bg-amber-700"
                    onClick={() => navigate('/billing')}
                  >
                    {isAr ? 'فتح الفواتير' : 'Open Billing'}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="flex-1" onClick={reset}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Walk-in doctor picker ── */}
        {scanState === 'walkin_pick' && scanResult && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                {isAr ? 'زيارة بدون حجز' : 'Walk-in Visit'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-muted/50 rounded-lg px-3 py-2 space-y-0.5">
                <p className="font-semibold text-foreground text-sm">{patientName}</p>
                <p className="text-xs text-muted-foreground">{scanResult.phone}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {isAr ? 'لا يوجد حجز لهذا المريض اليوم. اختر الطبيب لإضافته للقائمة.' : 'No appointment found for today. Select a doctor to add to the queue.'}
              </p>
              <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={isAr ? 'اختر الطبيب…' : 'Select doctor…'} />
                </SelectTrigger>
                <SelectContent>
                  {doctors.map(d => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {isAr ? (d.nameAr || d.name) : d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-1.5"
                  onClick={handleWalkinCheckin}
                  disabled={!selectedDoctorId || processing}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {isAr ? 'إضافة للقائمة' : 'Add to Queue'}
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={reset}>
                  {isAr ? 'إلغاء' : 'Cancel'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Success ── */}
        {scanState === 'success' && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="py-8 text-center space-y-3">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
              <p className="font-bold text-green-800 text-base">
                {isAr ? 'تم تسجيل الحضور!' : 'Check-in Complete!'}
              </p>
              {scanResult && (
                <p className="text-sm text-green-700">{patientName}</p>
              )}
              <Button size="sm" variant="outline" className="mt-2" onClick={reset}>
                {isAr ? 'مسح مريض آخر' : 'Scan Another'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Error ── */}
        {scanState === 'error' && (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-8 text-center space-y-3">
              <AlertCircle className="h-10 w-10 mx-auto text-destructive opacity-70" />
              <p className="font-semibold text-foreground text-sm">
                {isAr ? 'رمز QR غير صالح أو منتهي الصلاحية' : 'Invalid or expired QR code'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isAr ? 'اطلب من المريض تحديث البطاقة الرقمية.' : 'Ask the patient to refresh their digital card.'}
              </p>
              <Button size="sm" variant="outline" onClick={reset}>
                {isAr ? 'حاول مجدداً' : 'Try Again'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

function playBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* audio not available */ }
}

export default CheckInScan;
