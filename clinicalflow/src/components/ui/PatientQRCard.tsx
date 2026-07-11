import React, { useEffect, useRef } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { QrCode, Printer, Copy } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types (inline to avoid import issues) ───────────────────────────────────
interface PatientLike {
  id: string;
  name: string;
  nameAr: string;
  phone: string;
  dateOfBirth?: string;
}

interface ClinicLike {
  id?: string;
  name: string;
  nameAr: string;
  phone?: string;
  address?: string;
  addressAr?: string;
}

interface PatientQRCardProps {
  patient: PatientLike;
  clinic?: ClinicLike | null;
}

// ─── QR generation via QR Server API (no library needed) ─────────────────────
function buildQRUrl(data: string, size = 200): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&format=png&margin=2&color=1a56db&bgcolor=ffffff`;
}

// ─── Component ────────────────────────────────────────────────────────────────
const PatientQRCard: React.FC<PatientQRCardProps> = ({ patient, clinic }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const printRef = useRef<HTMLDivElement>(null);

  // Portal URL — links patient to their portal view
  const baseUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/patient/portal`
    : 'https://clinicflow.app/patient/portal';

  const portalUrl = `${baseUrl}?pid=${patient.id}`;

  const qrImageUrl = buildQRUrl(portalUrl, 200);

  const handleCopy = () => {
    navigator.clipboard.writeText(portalUrl)
      .then(() => toast.success(isAr ? 'تم نسخ الرابط' : 'Link copied'))
      .catch(() => toast.error(isAr ? 'تعذّر النسخ' : 'Copy failed'));
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    const clinicName = isAr ? clinic?.nameAr : clinic?.name;
    const patientName = isAr ? patient.nameAr : patient.name;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="${isAr ? 'rtl' : 'ltr'}" lang="${language}">
      <head>
        <meta charset="UTF-8" />
        <title>${isAr ? 'بطاقة QR — ' : 'QR Card — '}${patientName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh; background: #f8fafc; padding: 16px;
          }
          .card {
            background: #fff;
            border-radius: 16px;
            border: 2px solid #e2e8f0;
            width: 320px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
          }
          .header {
            background: linear-gradient(135deg, #1a56db 0%, #1e40af 100%);
            padding: 18px;
            text-align: center;
            color: white;
          }
          .header h2 { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
          .header p  { font-size: 11px; opacity: 0.85; }
          .body { padding: 20px; text-align: center; }
          .qr-wrap {
            display: inline-flex; align-items: center; justify-content: center;
            padding: 12px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            margin: 0 auto 16px;
          }
          .qr-wrap img { width: 180px; height: 180px; display: block; }
          .patient-name {
            font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 4px;
          }
          .patient-phone {
            font-size: 12px; color: #64748b; margin-bottom: 12px;
          }
          .divider { border: none; border-top: 1px solid #e2e8f0; margin: 12px 0; }
          .info-text {
            font-size: 10px; color: #94a3b8; line-height: 1.5;
          }
          .footer {
            background: #f8fafc;
            border-top: 1px solid #e2e8f0;
            padding: 10px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
          }
          @media print {
            body { background: white; padding: 0; }
            .card { box-shadow: none; border: 1px solid #ddd; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h2>${clinicName || (isAr ? 'عيادة كلينيك فلو' : 'ClinicFlow Clinic')}</h2>
            <p>${isAr ? 'بطاقة المريض الإلكترونية' : 'Patient Digital Card'}</p>
          </div>
          <div class="body">
            <div class="qr-wrap">
              <img src="${qrImageUrl}" alt="QR Code" />
            </div>
            <div class="patient-name">${patientName}</div>
            <div class="patient-phone">${patient.phone}</div>
            <hr class="divider" />
            <p class="info-text">
              ${isAr
                ? 'امسح رمز QR للوصول إلى ملفك الطبي، مواعيدك، فواتيرك، وروشتاتك'
                : 'Scan QR code to access your medical records, appointments, invoices, and prescriptions'}
            </p>
          </div>
          <div class="footer">
            ${isAr ? 'مدعوم بـ ClinicFlow' : 'Powered by ClinicFlow'}
          </div>
        </div>
        <script>
          window.onload = function() {
            var img = document.querySelector('img');
            if (img.complete) { window.print(); }
            else { img.onload = function() { window.print(); }; }
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="flex flex-col items-center gap-4 py-2">

      {/* Card preview */}
      <div className="w-full max-w-[280px] rounded-2xl border border-border overflow-hidden shadow-sm">
        {/* Card header */}
        <div className="bg-primary px-4 py-3 text-center">
          <p className="text-primary-foreground font-semibold text-sm">
            {(isAr ? clinic?.nameAr : clinic?.name) || (isAr ? 'عيادتك' : 'Your Clinic')}
          </p>
          <p className="text-primary-foreground/70 text-xs mt-0.5">
            {isAr ? 'بطاقة المريض الرقمية' : 'Patient Digital Card'}
          </p>
        </div>

        {/* QR code area */}
        <div className="bg-background px-4 py-5 flex flex-col items-center gap-3">
          <div className="p-2.5 rounded-xl border border-border bg-white">
            <img
              src={qrImageUrl}
              alt="Patient QR Code"
              width={160}
              height={160}
              className="block"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          {/* Patient info */}
          <div className="text-center">
            <p className="font-semibold text-foreground text-sm">
              {isAr ? patient.nameAr : patient.name}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">{patient.phone}</p>
          </div>

          <Separator />

          <p className="text-xs text-muted-foreground text-center leading-relaxed px-2">
            {isAr
              ? 'امسح رمز QR للوصول إلى المواعيد، الفواتير، والروشتات'
              : 'Scan QR to access appointments, invoices & prescriptions'}
          </p>
        </div>

        {/* Card footer */}
        <div className="bg-muted/50 px-4 py-2 text-center border-t border-border">
          <p className="text-[10px] text-muted-foreground">
            {isAr ? 'مدعوم بـ ClinicFlow' : 'Powered by ClinicFlow'}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 w-full">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5"
          onClick={handleCopy}
        >
          <Copy className="h-3.5 w-3.5" />
          {isAr ? 'نسخ الرابط' : 'Copy Link'}
        </Button>
        <Button
          size="sm"
          className="flex-1 gap-1.5"
          onClick={handlePrint}
        >
          <Printer className="h-3.5 w-3.5" />
          {isAr ? 'طباعة' : 'Print Card'}
        </Button>
      </div>

      {/* URL hint */}
      <p className="text-[10px] text-muted-foreground text-center break-all px-2 max-w-[280px]">
        {portalUrl}
      </p>
    </div>
  );
};

export default PatientQRCard;
