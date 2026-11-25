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

export function webMicrophoneErrorMessage(
  errorName: string,
  permissionState: string,
  userAgent: string,
): string | null {
  if (errorName === "NotFoundError") {
    return "مفيش ميكروفون متوصّل بالجهاز ده";
  }
  if (errorName !== "NotAllowedError" && errorName !== "SecurityError") {
    return null;
  }
  if (permissionState === "prompt") {
    return "لم يُسمح باستخدام الميكروفون. اسمح للمتصفح بالتسجيل ثم حاول مرة أخرى.";
  }
  if (permissionState !== "denied" && permissionState !== "unsupported") {
    return "لم يُسمح باستخدام الميكروفون. اسمح للمتصفح بالتسجيل ثم حاول مرة أخرى.";
  }

  const isIPhoneSafari =
    /iPhone|iPad|iPod/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS/i.test(userAgent);
  if (isIPhoneSafari) {
    return "الميكروفون مقفول للموقع ده. من الآيفون: الإعدادات ← Safari ← الميكروفون ← اسأل أو سماح.";
  }
  return "الميكروفون مقفول للموقع ده. من كروم: اضغط على القفل جنب العنوان ← الأذونات ← الميكروفون ← سماح، وبعدين ارجع واضغط بدء التسجيل.\nلو مالقيتهاش: إعدادات الموبايل ← التطبيقات ← Chrome ← الأذونات ← الميكروفون ← سماح.";
}
