const WAKE_ENABLED_KEY = "messenger.oscar-ai.wake-enabled.v1";
const CONSENT_KEY = "messenger.oscar-ai.google-consent.v1";
export const OSCAR_AI_WAKE_CHANGE_EVENT = "messenger:oscar-ai-wake-changed";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readOscarAiWakeEnabled(): boolean {
  return storage()?.getItem(WAKE_ENABLED_KEY) === "true";
}

export function writeOscarAiWakeEnabled(enabled: boolean): void {
  try {
    const target = storage();
    target?.setItem(WAKE_ENABLED_KEY, enabled ? "true" : "false");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(OSCAR_AI_WAKE_CHANGE_EVENT));
    }
  } catch {
    // The default remains off if browser storage is unavailable.
  }
}

export function hasOscarAiGoogleConsent(): boolean {
  return storage()?.getItem(CONSENT_KEY) === "accepted";
}

export function saveOscarAiGoogleConsent(): void {
  try {
    storage()?.setItem(CONSENT_KEY, "accepted");
  } catch {
    // The consent dialog will be shown again if storage is unavailable.
  }
}
