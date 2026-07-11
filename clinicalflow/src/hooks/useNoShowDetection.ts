import { useEffect, useRef, useCallback } from 'react';
import { detectNoShow, NO_SHOW_THRESHOLD_MINUTES } from '@/stores/visitStore';

// Default polling interval: every 60 seconds.
// Detection itself is cheap (in-memory filter), so running it every minute
// adds no meaningful overhead.
const DEFAULT_INTERVAL_MS = 60_000;

export interface NoShowDetectionOptions {
  /** Override polling interval in milliseconds. */
  intervalMs?: number;
  /** Called once per newly detected no-show (notification hook, STEP 7). */
  onNoShow?: (visitId: string, patientId: string) => void;
  /** Set false to pause detection without unmounting (e.g. when clinic is closed). */
  enabled?: boolean;
}

/**
 * Background hook that periodically calls detectNoShow().
 * Mount it once at the top of the clinic workflow (e.g. Dashboard or Queue page).
 * Safe to mount multiple times — each instance has its own independent interval.
 *
 * Queue auto-fills naturally: callNextPatient() queries visits with
 * status='waiting' only, so no-show visits drop out of the queue immediately
 * without any additional logic (STEP 6).
 */
export function useNoShowDetection(options: NoShowDetectionOptions = {}) {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    onNoShow,
    enabled = true,
  } = options;

  // Stable ref so the interval callback always sees the latest onNoShow
  const onNoShowRef = useRef(onNoShow);
  useEffect(() => { onNoShowRef.current = onNoShow; }, [onNoShow]);

  const run = useCallback(() => {
    const marked = detectNoShow(
      onNoShowRef.current
        ? (visitId, patientId) => onNoShowRef.current!(visitId, patientId)
        : undefined,
    );
    return marked;
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Run once immediately on mount so there is no initial delay
    run();

    const id = setInterval(run, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, run]);

  return { NO_SHOW_THRESHOLD_MINUTES };
}
