import React, { useEffect, useRef, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { syncPendingActions, getPendingCount } from '@/stores/offlineQueue';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

type SyncState = 'idle' | 'syncing' | 'done';

export default function NetworkStatusBanner() {
  const { isOnline } = useNetworkStatus();
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [pendingCount, setPendingCount] = useState(getPendingCount);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [showDone, setShowDone] = useState(false);
  const prevOnline = useRef(isOnline);
  const doneTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refresh pending count every 5 s while offline
  useEffect(() => {
    if (isOnline) return;
    const id = setInterval(() => setPendingCount(getPendingCount()), 5_000);
    return () => clearInterval(id);
  }, [isOnline]);

  // When network returns, run sync
  useEffect(() => {
    if (isOnline && !prevOnline.current) {
      setSyncState('syncing');
      syncPendingActions().then(({ synced }) => {
        setPendingCount(getPendingCount());
        setSyncState('done');
        if (synced > 0) {
          setShowDone(true);
          doneTimer.current = setTimeout(() => setShowDone(false), 3_000);
        } else {
          setSyncState('idle');
        }
      });
    }
    prevOnline.current = isOnline;
    return () => { if (doneTimer.current) clearTimeout(doneTimer.current); };
  }, [isOnline]);

  // Offline banner
  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white text-xs font-medium w-full">
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <span>
          {isAr ? 'وضع عدم الاتصال' : 'Offline Mode'}
          {pendingCount > 0 && (
            <span className="ml-1 opacity-80">
              {isAr ? `— ${pendingCount} إجراء في الانتظار` : `— ${pendingCount} action${pendingCount > 1 ? 's' : ''} queued`}
            </span>
          )}
        </span>
      </div>
    );
  }

  // Syncing / done banner (briefly visible after reconnect)
  if (syncState === 'syncing') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500 text-white text-xs font-medium w-full">
        <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
        <span>{isAr ? 'جارٍ المزامنة...' : 'Syncing...'}</span>
      </div>
    );
  }

  if (showDone) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-xs font-medium w-full">
        <Wifi className="h-3.5 w-3.5 shrink-0" />
        <span>{isAr ? 'تمت المزامنة — متصل الآن' : 'Synced — back online'}</span>
      </div>
    );
  }

  return null; // online + idle: show nothing
}
