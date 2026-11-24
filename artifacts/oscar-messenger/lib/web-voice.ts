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
