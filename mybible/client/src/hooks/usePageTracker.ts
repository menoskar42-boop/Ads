import { useEffect, useRef, useCallback } from 'react';

interface ClickCounts {
  verse_click: number;
  video_click: number;
  share_click: number;
}

/**
 * Tracks time on page, scroll depth, and click types.
 * Sends data to /api/metrics on unmount via sendBeacon (fire-and-forget).
 */
export function usePageTracker(pageUrl: string) {
  const startTime = useRef(Date.now());
  const maxScroll = useRef(0);
  const clicks = useRef<ClickCounts>({ verse_click: 0, video_click: 0, share_click: 0 });
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

  // Send data on unmount
  const sendMetric = useCallback(() => {
    if (sent.current) return;
    sent.current = true;

    const timeSpent = Math.round((Date.now() - startTime.current) / 1000);
    if (timeSpent < 2) return; // ignore bounces under 2 seconds

    const payload = JSON.stringify({
      pageUrl,
      timeSpent,
      scrollPercent: maxScroll.current,
      verseClicks: clicks.current.verse_click,
      videoClicks: clicks.current.video_click,
      shareClicks: clicks.current.share_click,
    });

    // sendBeacon ensures data is sent even when tab is closing
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/metrics', new Blob([payload], { type: 'application/json' }));
    } else {
      fetch('/api/metrics', {
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
    clicks.current = { verse_click: 0, video_click: 0, share_click: 0 };

    window.addEventListener('beforeunload', sendMetric);
    return () => {
      window.removeEventListener('beforeunload', sendMetric);
      sendMetric();
    };
  }, [pageUrl, sendMetric]);

  const trackClick = useCallback((type: keyof ClickCounts) => {
    clicks.current[type] = (clicks.current[type] || 0) + 1;
  }, []);

  return { trackClick };
}
