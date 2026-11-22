const minimumScheduleLeadMs = 60_000;

export function scheduledAtOrNull(value: Date, now = Date.now()): Date | null {
  const scheduledAt = new Date(value.getTime());
  if (!Number.isFinite(scheduledAt.getTime())) return null;
  if (scheduledAt.getTime() < now + minimumScheduleLeadMs) return null;
  return scheduledAt;
}

export function databaseCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

export function isPermanentMessageError(error: unknown): boolean {
  const code = databaseCode(error);
  return !!code && (code.startsWith("22") || code.startsWith("23"));
}

export function scheduledClientMessageId(id: string): string {
  return `scheduled:${id}`;
}
