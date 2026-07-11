import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { Printer, Download, QrCode, X } from 'lucide-react';
import logoImg from '@assets/Untitled_design_1772868317886.png';

interface PrintBookingSheetProps {
  open: boolean;
  onClose: () => void;
  type: 'clinic' | 'doctor';
  name: string;
  nameAr: string;
  url: string;
  phone?: string;
  address?: string;
  addressAr?: string;
  hours?: string;
  isAr?: boolean;
}

const PrintBookingSheet: React.FC<PrintBookingSheetProps> = ({
  open, onClose, type, name, nameAr, url, phone, address, addressAr, hours, isAr = false,
}) => {
  const [format, setFormat] = useState<'a4' | 'receipt'>('a4');
  const qrCanvasRef = useRef<HTMLDivElement>(null);

  const displayName = isAr ? nameAr : name;
  const displayAddress = isAr ? (addressAr || address) : address;
  const typeLabel = isAr
    ? (type === 'clinic' ? 'عيادة' : 'طبيب')
    : (type === 'clinic' ? 'Clinic' : 'Doctor');

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    if (!printWindow) return;

    const qrSvgEl = document.getElementById('print-qr-svg');
    const qrSvg = qrSvgEl ? qrSvgEl.outerHTML : '';

    if (format === 'a4') {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
        <head>
          <meta charset="UTF-8">
          <title>Print Booking Sheet</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #fff; color: #111; }
            .page { width: 210mm; min-height: 297mm; padding: 20mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
            .logo-row { display: flex; align-items: center; gap: 10px; }
            .logo-row img { width: 48px; height: 48px; border-radius: 10px; }
            .logo-row span { font-size: 20px; font-weight: 700; color: #1a1a2e; }
            .badge { background: #e8f4f8; color: #1a6891; font-size: 12px; padding: 4px 12px; border-radius: 20px; font-weight: 500; }
            .title { font-size: 36px; font-weight: 800; text-align: center; color: #1a1a2e; line-height: 1.2; }
            .subtitle { font-size: 18px; font-weight: 600; color: #1a6891; text-align: center; }
            .qr-box { border: 2px solid #e2e8f0; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; background: #f8fafc; }
            .qr-box svg { width: 220px !important; height: 220px !important; }
            .scan-label { font-size: 14px; color: #64748b; font-weight: 500; }
            .link-box { background: #f1f5f9; border-radius: 10px; padding: 12px 20px; font-size: 15px; color: #1a6891; font-family: monospace; word-break: break-all; text-align: center; }
            .info-row { display: flex; gap: 32px; flex-wrap: wrap; justify-content: center; }
            .info-item { display: flex; flex-direction: column; align-items: center; gap: 4px; }
            .info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
            .info-value { font-size: 14px; font-weight: 600; color: #1a1a2e; }
            .divider { width: 60px; height: 4px; background: linear-gradient(90deg, #1a6891, #5ba4cf); border-radius: 2px; margin: 8px auto; }
            .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: auto; }
            @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="logo-row">
              <span>ClinicalFlow</span>
            </div>
            <div class="badge">${typeLabel}</div>
            <div class="title">${isAr ? 'احجز موعدك الآن' : 'Book Your Appointment Online'}</div>
            <div class="subtitle">${displayName}</div>
            <div class="divider"></div>
            <div class="qr-box">
              ${qrSvg}
              <div class="scan-label">${isAr ? 'امسح الكود بكاميرا هاتفك' : 'Scan with your phone camera'}</div>
            </div>
            <div class="link-box">${url}</div>
            ${(phone || displayAddress || hours) ? `
            <div class="info-row">
              ${phone ? `<div class="info-item"><div class="info-label">${isAr ? 'الهاتف' : 'Phone'}</div><div class="info-value">${phone}</div></div>` : ''}
              ${displayAddress ? `<div class="info-item"><div class="info-label">${isAr ? 'العنوان' : 'Address'}</div><div class="info-value">${displayAddress}</div></div>` : ''}
              ${hours ? `<div class="info-item"><div class="info-label">${isAr ? 'ساعات العمل' : 'Working Hours'}</div><div class="info-value">${hours}</div></div>` : ''}
            </div>` : ''}
            <div class="footer">ClinicalFlow — ${isAr ? 'منصة حجز المواعيد الطبية' : 'Medical Appointment Booking Platform'}</div>
          </div>
          <script>window.onload = function(){ window.print(); }</script>
        </body>
        </html>
      `);
    } else {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
        <head>
          <meta charset="UTF-8">
          <title>Print Receipt</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Courier New', monospace; background: #fff; color: #000; }
            .receipt { width: 80mm; padding: 8mm; display: flex; flex-direction: column; align-items: center; gap: 8px; }
            .brand { font-size: 14px; font-weight: 700; letter-spacing: 1px; text-align: center; }
            .divider { width: 100%; border-top: 1px dashed #aaa; margin: 4px 0; }
            .name { font-size: 13px; font-weight: 600; text-align: center; }
            .qr-box svg { width: 120px !important; height: 120px !important; }
            .scan-label { font-size: 10px; color: #555; text-align: center; }
            .link { font-size: 9px; word-break: break-all; text-align: center; color: #333; margin-top: 2px; }
            .info { font-size: 10px; text-align: center; color: #444; }
            @media print { @page { size: 80mm auto; margin: 0; } body { print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="receipt">
            <div class="brand">ClinicalFlow</div>
            <div class="divider"></div>
            <div class="name">${displayName}</div>
            <div class="divider"></div>
            <div class="qr-box">${qrSvg}</div>
            <div class="scan-label">${isAr ? 'امسح للحجز' : 'Scan to Book'}</div>
            <div class="link">${url}</div>
            <div class="divider"></div>
            ${phone ? `<div class="info">${phone}</div>` : ''}
            ${displayAddress ? `<div class="info">${displayAddress}</div>` : ''}
            <div class="divider"></div>
            <div class="info" style="font-size:9px; color:#888;">ClinicalFlow</div>
          </div>
          <script>window.onload = function(){ window.print(); }</script>
        </body>
        </html>
      `);
    }
    printWindow.document.close();
  };

  const handleDownloadQR = () => {
    const canvas = document.getElementById('qr-download-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${name.replace(/\s+/g, '-')}-qr.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {isAr ? 'طباعة صفحة الحجز' : 'Print Booking Sheet'}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={format} onValueChange={v => setFormat(v as 'a4' | 'receipt')}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="a4">{isAr ? 'ملصق A4' : 'A4 Poster'}</TabsTrigger>
            <TabsTrigger value="receipt">{isAr ? 'إيصال صغير' : 'Small Receipt'}</TabsTrigger>
          </TabsList>

          <TabsContent value="a4" className="mt-4">
            <div className="border border-border rounded-xl p-6 bg-white text-center space-y-4 shadow-sm">
              <div className="flex items-center justify-center gap-2">
                <img src={logoImg} className="h-8 w-8 rounded-lg" alt="logo" />
                <span className="font-bold text-slate-800 text-lg">ClinicalFlow</span>
              </div>
              <div className="inline-block bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full font-medium">{typeLabel}</div>
              <h2 className="text-2xl font-extrabold text-slate-800 leading-tight">
                {isAr ? 'احجز موعدك الآن' : 'Book Your Appointment Online'}
              </h2>
              <p className="text-primary font-semibold text-lg">{displayName}</p>
              <div className="w-12 h-1 bg-gradient-to-r from-primary to-blue-400 rounded-full mx-auto" />
              <div className="flex justify-center p-4 bg-slate-50 rounded-xl border border-border">
                <div id="print-qr-svg">
                  <QRCodeSVG value={url} size={180} level="H" includeMargin />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{isAr ? 'امسح الكود بكاميرا هاتفك' : 'Scan with your phone camera'}</p>
              <div className="bg-slate-100 rounded-lg px-4 py-2 text-sm font-mono text-primary break-all">{url}</div>
              {(phone || displayAddress || hours) && (
                <div className="flex flex-wrap justify-center gap-6 pt-2 text-sm">
                  {phone && <div><p className="text-xs text-muted-foreground mb-0.5">{isAr ? 'الهاتف' : 'Phone'}</p><p className="font-medium">{phone}</p></div>}
                  {displayAddress && <div><p className="text-xs text-muted-foreground mb-0.5">{isAr ? 'العنوان' : 'Address'}</p><p className="font-medium">{displayAddress}</p></div>}
                  {hours && <div><p className="text-xs text-muted-foreground mb-0.5">{isAr ? 'ساعات العمل' : 'Hours'}</p><p className="font-medium">{hours}</p></div>}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="receipt" className="mt-4">
            <div className="border border-border rounded-xl bg-white shadow-sm mx-auto" style={{ maxWidth: 260 }}>
              <div className="p-4 space-y-3 font-mono text-center text-sm">
                <p className="font-bold tracking-widest text-base">ClinicalFlow</p>
                <div className="border-t border-dashed border-border" />
                <p className="font-semibold">{displayName}</p>
                <div className="border-t border-dashed border-border" />
                <div className="flex justify-center">
                  <div id="print-qr-svg">
                    <QRCodeSVG value={url} size={120} level="M" includeMargin />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{isAr ? 'امسح للحجز' : 'Scan to Book'}</p>
                <p className="text-xs break-all text-primary">{url}</p>
                <div className="border-t border-dashed border-border" />
                {phone && <p className="text-xs">{phone}</p>}
                {displayAddress && <p className="text-xs">{displayAddress}</p>}
                <div className="border-t border-dashed border-border" />
                <p className="text-xs text-muted-foreground">ClinicalFlow</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="hidden">
          <QRCodeCanvas id="qr-download-canvas" value={url} size={400} level="H" includeMargin />
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button className="flex-1 gap-2" onClick={handlePrint} data-testid="btn-print-sheet">
            <Printer className="h-4 w-4" />
            {isAr ? 'طباعة / PDF' : 'Print / PDF'}
          </Button>
          <Button variant="outline" className="flex-1 gap-2" onClick={handleDownloadQR} data-testid="btn-download-qr">
            <Download className="h-4 w-4" />
            {isAr ? 'تحميل رمز QR' : 'Download QR'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrintBookingSheet;
