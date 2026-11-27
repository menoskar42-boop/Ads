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

const CALL_OWNER_NAME_KEY = "messenger.oscar-ai.call-owner-name.v1";

export function readOscarAiCallOwnerName(): string {
  return storage()?.getItem(CALL_OWNER_NAME_KEY)?.trim() ?? "";
}

export function writeOscarAiCallOwnerName(name: string): void {
  try {
    const value = name.trim().slice(0, 60);
    if (value) storage()?.setItem(CALL_OWNER_NAME_KEY, value);
    else storage()?.removeItem(CALL_OWNER_NAME_KEY);
  } catch {
    // The Messenger profile name remains the fallback.
  }
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

const TTS_PROVIDER_KEY = "messenger.oscar-ai.tts-provider.v1";
export type OscarAiTtsProvider = "web-speech" | "gemini-tts";

export function readOscarAiTtsProvider(): OscarAiTtsProvider {
  return storage()?.getItem(TTS_PROVIDER_KEY) === "gemini-tts" ? "gemini-tts" : "web-speech";
}

export function writeOscarAiTtsProvider(provider: OscarAiTtsProvider): void {
  try {
    storage()?.setItem(TTS_PROVIDER_KEY, provider);
  } catch {
    // Falls back to browser speech.
  }
}

const CONVERSATION_MODE_KEY = "messenger.oscar-ai.conversation-mode.v1";
/** «live» = Gemini Live (default) · «turn» = بالأدوار: Flash-Lite + the phone's own voice (cheaper). */
export type OscarAiConversationMode = "live" | "turn";

export function readOscarAiConversationMode(): OscarAiConversationMode {
  return storage()?.getItem(CONVERSATION_MODE_KEY) === "turn" ? "turn" : "live";
}

export function writeOscarAiConversationMode(mode: OscarAiConversationMode): void {
  try {
    storage()?.setItem(CONVERSATION_MODE_KEY, mode);
  } catch {
    // Falls back to Gemini Live.
  }
}
