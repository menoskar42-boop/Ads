// Auto-logout after TIMEOUT_MS of inactivity (mouse/key/touch events).
import { useEffect, useRef } from 'react';

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const EVENTS = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];

export function useInactivityLogout(isAuthenticated: boolean, onLogout: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onLogout(), TIMEOUT_MS);
    };

    reset();
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));

    return () => {
      if (timer.current) clearTimeout(timer.current);
      EVENTS.forEach(e => window.removeEventListener(e, reset));
    };
  }, [isAuthenticated, onLogout]);
}
