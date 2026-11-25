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

export function buildScheduledMessageRescheduleUpdate(
  body: string,
  scheduledAt: Date,
  id: string,
  userId: string,
): { sql: string; values: [string, Date, string, string] } {
  return {
    sql: `UPDATE messenger_scheduled_messages
          SET body = $1,
              scheduled_at = $2,
              status = CASE WHEN status = 'failed' THEN 'pending' ELSE status END,
              failure_code = CASE WHEN status = 'failed' THEN NULL ELSE failure_code END,
              updated_at = now()
          WHERE id = $3 AND sender_id = $4
            AND sent_message_id IS NULL AND sent_at IS NULL
            AND ((status = 'pending' AND scheduled_at > now()) OR status = 'failed')
          RETURNING id`,
    values: [body, scheduledAt, id, userId],
  };
}
