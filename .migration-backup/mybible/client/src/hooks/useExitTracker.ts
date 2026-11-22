import { useEffect, useRef, useCallback } from 'react';

type ClickableElement = 'verse' | 'video' | 'share' | 'link' | 'button' | 'plan';

/**
 * Tracks exit events (time, scroll, last click) and sends them to /api/exit on page leave.
 * Returns a trackClick(type) function for manual click registration.
 */
export function useExitTracker(pageUrl: string) {
  const startTime = useRef(Date.now());
  const maxScroll = useRef(0);
  const lastClick = useRef<string | null>(null);
  const sent = useRef(false);

  // Track scroll depth
  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = Math.min(100, Math.round((scrollTop / docHeight) * 100));
      if (pct > maxScroll.current) maxScroll.current = pct;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const sendExit = useCallback(() => {
    if (sent.current) return;
    sent.current = true;

    const timeSpent = Math.round((Date.now() - startTime.current) / 1000);
    const payload = JSON.stringify({
      pageUrl,
      timeSpent,
      scrollDepth: maxScroll.current,
      lastClickedElement: lastClick.current,
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/exit', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }, [pageUrl]);

  useEffect(() => {
    sent.current = false;
    startTime.current = Date.now();
    maxScroll.current = 0;
    lastClick.current = null;

    window.addEventListener('beforeunload', sendExit);
    return () => {
      window.removeEventListener('beforeunload', sendExit);
      sendExit();
    };
  }, [pageUrl, sendExit]);

  const trackClick = useCallback((type: ClickableElement) => {
    lastClick.current = type;
  }, []);

  return { trackClick };
}
