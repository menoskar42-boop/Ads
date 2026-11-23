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

export function readableError(error: unknown, fallback = "حصلت مشكلة، حاول مرة أخرى"): string {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = Number(error.status);
    if (status === 401) return "انتهت الجلسة. سجّل الدخول مرة أخرى.";
    if (status === 409) return "اسم المستخدم مستخدم بالفعل.";
    if (status === 429) return "انتظر قليلًا ثم حاول البحث مرة أخرى.";
    if (status === 503) return "التخزين لم يُجهّز بعد. أعد المحاولة بعد تهيئة التطبيق.";
  }
  return fallback;
}

export function safeReturnPath(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  if (/^\/(?:compose(?:\?[^#]*)?|new-message)$/.test(path)) return path;
  const invite = path.match(/^\/\?invite=([a-z0-9_]{3,30})$/i);
  return invite ? `/?invite=${invite[1].toLowerCase()}` : "/";
}
