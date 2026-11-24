export type MessengerAudioContentType = "audio/webm" | "audio/mp4";

const WEB_AUDIO_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
] as const;

export function chooseWebAudioMimeType(
  isTypeSupported?: (mimeType: string) => boolean,
): string | null {
  if (!isTypeSupported) return null;
  return (
    WEB_AUDIO_MIME_CANDIDATES.find((mimeType) => {
      try {
        return isTypeSupported(mimeType);
      } catch {
        return false;
      }
    }) ?? null
  );
}

export function baseMessengerAudioContentType(
  mimeType: string,
): MessengerAudioContentType | null {
  const baseType = mimeType.split(";", 1)[0]?.trim().toLowerCase();
  return baseType === "audio/webm" || baseType === "audio/mp4"
    ? baseType
    : null;
}

export function webAudioPlaybackRequestOptions(token: string | null) {
  return {
    credentials: "include" as const,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  };
}

export function webAudioPlaybackError(
  status: number,
  serverMessage?: string,
): string {
  if (status === 401) return "انتهت جلسة الدخول. سجّل الدخول مرة أخرى.";
  return serverMessage || "تعذر فتح الرسالة الصوتية.";
}
