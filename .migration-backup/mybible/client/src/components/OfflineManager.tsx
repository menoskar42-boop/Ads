import { WifiOff, Download, CheckCircle, XCircle, X, PackageCheck, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOfflineSync } from '@/hooks/useOfflineSync';

function formatRelativeDate(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays === 1) return 'منذ يوم';
  if (diffDays < 30) return `منذ ${diffDays} أيام`;
  return `منذ ${Math.floor(diffDays / 30)} شهر`;
}

export function OfflineManager() {
  const { status, progress, startSync, startUpdate, cancelSync, updateAvail, lastSyncDate } = useOfflineSync();

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const remaining = progress.total > 0
    ? Math.ceil(((progress.total - progress.done) * 80) / 1000 / 60)
    : 4;

  const hasSynced = !!lastSyncDate;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3" dir="rtl">
      <div className="flex items-center gap-2">
        <WifiOff className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">تصفح بدون إنترنت</p>
          <p className="text-xs text-muted-foreground">
            {hasSynced
              ? `آخر تحميل: ${formatRelativeDate(lastSyncDate!)}`
              : 'يُنزّل الكتاب المقدس كاملاً (٦٦ سفراً + التفاسير) ويحفظه على جهازك'}
          </p>
        </div>
      </div>

      {/* الأسفار القانونية الثانية مُضمَّنة دائماً في التطبيق */}
      <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
        <PackageCheck className="h-4 w-4 text-green-500 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">الأسفار القانونية الثانية</span> (طوبيا، يهوديت، المكابيين، حكمة سليمان، يشوع بن سيراخ، باروخ…) مُضمَّنة في التطبيق ومتاحة أوفلاين تلقائياً بدون تنزيل إضافي.
        </p>
      </div>

      {/* Update available banner */}
      {hasSynced && updateAvail === 'update-available' && status === 'idle' && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-2">
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">تحديث جديد متاح للمحتوى</p>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900" onClick={startUpdate}>
            <RefreshCw className="h-3.5 w-3.5" />
            تحديث
          </Button>
        </div>
      )}

      {/* Checking for updates indicator */}
      {hasSynced && updateAvail === 'checking' && status === 'idle' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>جاري التحقق من التحديثات…</span>
        </div>
      )}

      {status === 'idle' && !hasSynced && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            الحجم: ~20MB · الوقت المتوقع: 2-4 دقائق
          </p>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={startSync}>
            <Download className="h-4 w-4" />
            تنزيل
          </Button>
        </div>
      )}

      {status === 'idle' && hasSynced && updateAvail === 'up-to-date' && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
            <span>المحتوى محدَّث</span>
          </div>
          <Button size="sm" variant="ghost" className="gap-1.5 shrink-0 text-muted-foreground text-xs" onClick={startSync}>
            <Download className="h-3.5 w-3.5" />
            إعادة التنزيل الكامل
          </Button>
        </div>
      )}

      {status === 'idle' && hasSynced && updateAvail === 'unknown' && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">لا يوجد اتصال للتحقق من التحديثات</p>
          <Button size="sm" variant="ghost" className="gap-1.5 shrink-0 text-muted-foreground text-xs" onClick={startSync}>
            <Download className="h-3.5 w-3.5" />
            إعادة التنزيل
          </Button>
        </div>
      )}

      {status === 'syncing' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.currentBook && `جاري: ${progress.currentBook}`}</span>
            <span className="flex items-center gap-1">
              {pct}%
              <button onClick={cancelSync} className="mr-2 text-muted-foreground hover:text-destructive">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {progress.done.toLocaleString('ar-EG')} / {progress.total.toLocaleString('ar-EG')} ·
            {remaining > 1 ? ` ${remaining} دقائق متبقية` : ' أقل من دقيقة'}
          </p>
        </div>
      )}

      {status === 'done' && (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>تم التنزيل! الكتاب المقدس كاملاً (بما فيه الأسفار القانونية الثانية) متاح الآن بدون إنترنت</span>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-destructive text-sm">
            <XCircle className="h-4 w-4 shrink-0" />
            <span>فشل التنزيل، تحقق من الاتصال وأعد المحاولة</span>
          </div>
          <Button size="sm" variant="outline" onClick={hasSynced ? startUpdate : startSync}>إعادة</Button>
        </div>
      )}
    </div>
  );
}
