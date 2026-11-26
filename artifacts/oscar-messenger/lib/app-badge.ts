// Unread count on the installed app icon, like WhatsApp (owner 2026-11-26). Badging API:
// iPhone home-screen app (iOS 16.4+, notifications allowed) and desktop Chrome/Edge.
// Android Chrome has no numbers for web apps; it shows a dot while a notification is unread.
export function updateAppBadge(unread: number): void {
  if (typeof navigator === "undefined") return;
  const badging = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (unread > 0) void badging.setAppBadge?.(unread)?.catch(() => undefined);
    else void badging.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    // Unsupported browser: nothing to show.
  }
}
