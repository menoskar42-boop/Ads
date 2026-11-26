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

// Voice and location (owner 2026-11-26): «اتحكم فى نوع الصوت راجل او ست … الافتراضى خليه ست» and
// «عاوز أوسكار يعرف اللوكيشن بتاعى». Both stay on this device.
const VOICE_KEY = "messenger.oscar-ai.voice.v1";
const LOCATION_KEY = "messenger.oscar-ai.share-location.v1";
export type OscarAiVoice = "female" | "male";

export function readOscarAiVoice(): OscarAiVoice {
  return storage()?.getItem(VOICE_KEY) === "male" ? "male" : "female";
}

export function writeOscarAiVoice(voice: OscarAiVoice): void {
  try {
    storage()?.setItem(VOICE_KEY, voice);
  } catch {
    // Falls back to the female default.
  }
}

export function readOscarAiShareLocation(): boolean {
  return storage()?.getItem(LOCATION_KEY) !== "false";
}

export function writeOscarAiShareLocation(enabled: boolean): void {
  try {
    storage()?.setItem(LOCATION_KEY, enabled ? "true" : "false");
  } catch {
    // Default stays on; the browser still asks for location permission.
  }
}

const MESSAGE_MODE_KEY = "messenger.oscar-ai.message-mode.v1";
export type OscarAiMessageMode = "voice" | "text";

/** «ابعت رسالة لفلان»: the user's own recorded voice (default) or text written by Gemini. */
export function readOscarAiMessageMode(): OscarAiMessageMode {
  return storage()?.getItem(MESSAGE_MODE_KEY) === "text" ? "text" : "voice";
}

export function writeOscarAiMessageMode(mode: OscarAiMessageMode): void {
  try {
    storage()?.setItem(MESSAGE_MODE_KEY, mode);
  } catch {
    // Falls back to the voice default.
  }
}
