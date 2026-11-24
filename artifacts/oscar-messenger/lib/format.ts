export function shortTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("") || "أ";
}

export function apiErrorDetails(
  error: unknown,
): { status: number; message?: string; field?: string } | null {
  if (typeof error !== "object" || error === null || !("status" in error)) return null;
  const record = error as Record<string, unknown>;
  const status = Number(record.status);
  if (!Number.isFinite(status)) return null;
  const data =
    typeof record.data === "object" && record.data !== null
      ? (record.data as Record<string, unknown>)
      : null;
  return {
    status,
    ...(typeof data?.error === "string" ? { message: data.error } : {}),
    ...(typeof data?.field === "string" ? { field: data.field } : {}),
  };
}

export function readableError(error: unknown, fallback = "حصلت مشكلة، حاول مرة أخرى"): string {
  const details = apiErrorDetails(error);
  if (details) {
    const { status } = details;
    if (status === 401) return "انتهت الجلسة. سجّل الدخول مرة أخرى.";
    if (status === 408 || status >= 500) {
      return "الخدمة غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل.";
    }
    if (status === 409) return details.message || "اسم المستخدم مستخدم بالفعل.";
    if (status === 429) return "انتظر قليلًا ثم حاول البحث مرة أخرى.";
    if (status === 503) return "التخزين لم يُجهّز بعد. أعد المحاولة بعد تهيئة التطبيق.";
  }
  if (
    error instanceof TypeError ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError")
  ) {
    return "الاتصال غير متاح مؤقتًا. تحقق من الإنترنت وحاول مرة أخرى.";
  }
  return fallback;
}

export function safeReturnPath(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  if (/^\/(?:compose(?:\?[^#]*)?|new-message)$/.test(path)) return path;
  if (/^\/chat\/[A-Za-z0-9_-]{1,128}$/.test(path)) return path;
  const invite = path.match(/^\/\?invite=([a-z0-9_]{3,30})$/i);
  return invite ? `/?invite=${invite[1].toLowerCase()}` : "/";
}
