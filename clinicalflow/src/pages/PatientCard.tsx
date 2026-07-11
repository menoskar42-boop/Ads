import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/contexts/LanguageContext';
import { patientStore } from '@/stores/patientStore';
import { getClinicById } from '@/stores/clinicStore';
import { buildDynamicQR, buildStaticQR, buildMyCardAccessToken, validateMyCardAccessToken } from '@/lib/qrToken';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Share2, Copy, RefreshCw, ShieldCheck, ShieldAlert, QrCode } from 'lucide-react';
import { toast } from 'sonner';

const QR_REFRESH_MS = 15 * 60 * 1000; // refresh every 15 min

const PatientCard: React.FC = () => {
  const { language, isRTL } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const [params] = useSearchParams();
  const isAr = language === 'ar';

  // Resolve patient: auth session OR ?pid=&tok= (WhatsApp link)
  const urlPid = params.get('pid');
  const urlTok = params.get('tok');
  const accessByToken = urlPid && urlTok && validateMyCardAccessToken(urlPid, urlTok);
  const patientId = accessByToken ? urlPid : (user?.role === 'patient' ? user.id : null);

  const patient = patientId ? patientStore.get(p => p.id === patientId) : null;
  const clinic  = patient?.clinicId ? getClinicById(patient.clinicId) : null;

  const [qrContent, setQrContent] = useState('');
  const [useDynamic, setUseDynamic] = useState(true);
  const [refreshAt, setRefreshAt]  = useState(Date.now() + QR_REFRESH_MS);

  // Build / refresh QR content
  const refreshQR = () => {
    if (!patient) return;
    const cid = patient.clinicId || 'default';
    setQrContent(useDynamic ? buildDynamicQR(patient.id, cid) : buildStaticQR(patient.id, cid));
    setRefreshAt(Date.now() + QR_REFRESH_MS);
  };

  useEffect(() => { refreshQR(); }, [patient?.id, useDynamic]);

  // Auto-refresh dynamic QR every 15 minutes
  useEffect(() => {
    if (!useDynamic) return;
    const id = setInterval(refreshQR, QR_REFRESH_MS);
    return () => clearInterval(id);
  }, [useDynamic, patient?.id]);

  // Countdown display
  const [secsLeft, setSecsLeft] = useState(QR_REFRESH_MS / 1000);
  useEffect(() => {
    if (!useDynamic) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((refreshAt - Date.now()) / 1000));
      setSecsLeft(left);
      if (left === 0) refreshQR();
    }, 1000);
    return () => clearInterval(id);
  }, [useDynamic, refreshAt]);

  const handleCopyLink = () => {
    if (!patient) return;
    const tok = buildMyCardAccessToken(patient.id);
    const url = `${window.location.origin}/my-card?pid=${patient.id}&tok=${tok}`;
    navigator.clipboard.writeText(url)
      .then(() => toast.success(isAr ? 'تم نسخ الرابط' : 'Link copied'))
      .catch(() => toast.error(isAr ? 'تعذّر النسخ' : 'Copy failed'));
  };

  const handleShareWhatsApp = () => {
    if (!patient) return;
    const tok = buildMyCardAccessToken(patient.id);
    const url = encodeURIComponent(`${window.location.origin}/my-card?pid=${patient.id}&tok=${tok}`);
    const msg = encodeURIComponent(isAr ? `بطاقة المريض الرقمية:\n` : `Patient digital card:\n`);
    window.open(`https://wa.me/?text=${msg}${url}`, '_blank');
  };

  // ─── Access denied ─────────────────────────────────────────────────────────
  if (!patientId || (!isAuthenticated && !accessByToken)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir={isRTL ? 'rtl' : 'ltr'}>
        <Card className="w-full max-w-sm">
          <CardContent className="py-10 text-center space-y-3">
            <QrCode className="h-10 w-10 mx-auto text-muted-foreground opacity-40" />
            <p className="font-semibold text-foreground">{isAr ? 'رابط غير صالح' : 'Invalid Link'}</p>
            <p className="text-sm text-muted-foreground">
              {isAr ? 'يرجى تسجيل الدخول أو استخدام الرابط المرسل إليك.' : 'Please log in or use the link sent to you.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">{isAr ? 'جاري التحميل…' : 'Loading…'}</p>
      </div>
    );
  }

  const patientName = isAr ? patient.nameAr : patient.name;
  const clinicName  = isAr ? clinic?.nameAr : clinic?.name;

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-primary/5 to-background flex flex-col items-center justify-center p-4 gap-6"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Card */}
      <div className="w-full max-w-xs rounded-3xl overflow-hidden shadow-xl border border-border bg-background">
        {/* Header */}
        <div className="bg-primary px-5 py-4 text-center">
          <p className="text-primary-foreground font-bold text-base">
            {clinicName || (isAr ? 'عيادتك' : 'Your Clinic')}
          </p>
          <p className="text-primary-foreground/70 text-xs mt-0.5">
            {isAr ? 'بطاقة المريض الرقمية' : 'Patient Digital Card'}
          </p>
        </div>

        {/* QR body */}
        <div className="px-5 py-6 flex flex-col items-center gap-4">
          {qrContent ? (
            <div className="p-3 rounded-2xl border-2 border-border bg-white shadow-inner">
              <QRCodeSVG value={qrContent} size={190} level="M" includeMargin={false} fgColor="#1a56db" />
            </div>
          ) : (
            <div className="h-[190px] w-[190px] rounded-2xl bg-muted animate-pulse" />
          )}

          {/* Security badge + countdown */}
          <div className="flex items-center gap-2">
            {useDynamic ? (
              <Badge variant="default" className="text-xs gap-1 bg-green-600 hover:bg-green-600">
                <ShieldCheck className="h-3 w-3" />
                {isAr ? `ينتهي بعد ${secsLeft}ث` : `Expires in ${secsLeft}s`}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-400">
                <ShieldAlert className="h-3 w-3" />
                {isAr ? 'ثابت — أمان منخفض' : 'Static — Low security'}
              </Badge>
            )}
          </div>

          {/* Patient info */}
          <div className="text-center">
            <p className="font-bold text-foreground text-base">{patientName}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{patient.phone}</p>
            <p className="text-muted-foreground text-[10px] font-mono mt-1 bg-muted/50 px-2 py-0.5 rounded">
              ID: {patient.id.slice(-8).toUpperCase()}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-muted/40 px-5 py-2 text-center border-t border-border">
          <p className="text-[10px] text-muted-foreground">{isAr ? 'مدعوم بـ ClinicFlow' : 'Powered by ClinicFlow'}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={refreshQR}>
            <RefreshCw className="h-3.5 w-3.5" />
            {isAr ? 'تحديث' : 'Refresh'}
          </Button>
          <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={handleCopyLink}>
            <Copy className="h-3.5 w-3.5" />
            {isAr ? 'نسخ الرابط' : 'Copy Link'}
          </Button>
        </div>
        <Button size="sm" className="w-full gap-2 bg-green-600 hover:bg-green-700" onClick={handleShareWhatsApp}>
          <Share2 className="h-3.5 w-3.5" />
          {isAr ? 'مشاركة عبر واتساب' : 'Share via WhatsApp'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-muted-foreground"
          onClick={() => setUseDynamic(d => !d)}
        >
          {useDynamic
            ? (isAr ? 'التبديل إلى QR ثابت' : 'Switch to static QR')
            : (isAr ? 'التبديل إلى QR ديناميكي' : 'Switch to dynamic QR')}
        </Button>
      </div>
    </div>
  );
};

export default PatientCard;
