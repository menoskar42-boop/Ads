export const MESSAGE_TOMBSTONE_BODY = "\u200b";
export const MESSAGE_DELETED_LABEL = "🚫 الرسالة دى اتمسحت";
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

export type EditableMessageCandidate = {
  sender_id: string;
  message_type: string;
  created_at: Date | string;
  deleted_at?: Date | string | null;
};

export function canEditOwnTextMessage(
  message: EditableMessageCandidate,
  userId: string,
  nowMs = Date.now(),
): boolean {
  const createdAt = new Date(message.created_at).getTime();
  return (
    message.sender_id === userId &&
    message.message_type === "text" &&
    !message.deleted_at &&
    Number.isFinite(createdAt) &&
    createdAt <= nowMs &&
    nowMs - createdAt <= MESSAGE_EDIT_WINDOW_MS
  );
}

export function messagePublicContent<T extends {
  body: string;
  deleted_at?: Date | string | null;
}>(row: T): { body: string; deleted: boolean } {
  const deleted =
    Boolean(row.deleted_at) || row.body === MESSAGE_TOMBSTONE_BODY;
  return { body: deleted ? "" : row.body, deleted };
}

export type EditDeleteQueryPool = {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
};

export type EditMessageResult =
  | { status: "updated"; row: Record<string, unknown> }
  | { status: "not_found" }
  | { status: "not_owner" }
  | { status: "not_editable" }
  | { status: "expired" };

export async function editOwnTextMessage(
  pool: EditDeleteQueryPool,
  input: {
    conversationId: string;
    messageId: string;
    userId: string;
    body: string;
    nowMs?: number;
  },
): Promise<EditMessageResult> {
  const selected = await pool.query<EditableMessageCandidate>(
    `SELECT sender_id, message_type, created_at, deleted_at
     FROM messenger_messages
     WHERE id = $1 AND conversation_id = $2`,
    [input.messageId, input.conversationId],
  );
  const message = selected.rows[0];
  if (!message) return { status: "not_found" };
  if (message.sender_id !== input.userId) return { status: "not_owner" };
  if (
    message.message_type !== "text" ||
    message.deleted_at
  ) {
    return { status: "not_editable" };
  }
  if (!canEditOwnTextMessage(message, input.userId, input.nowMs)) {
    return { status: "expired" };
  }

  const updated = await pool.query<Record<string, unknown>>(
    `UPDATE messenger_messages
     SET body = $4, edited_at = now()
     WHERE id = $1 AND conversation_id = $2 AND sender_id = $3
       AND message_type = 'text' AND deleted_at IS NULL
       AND created_at >= now() - interval '15 minutes'
     RETURNING id, conversation_id, sender_id, body, created_at,
               delivered_at, read_at, message_type, edited_at, deleted_at`,
    [input.messageId, input.conversationId, input.userId, input.body],
  );
  const row = updated.rows[0];
  if (!row) return { status: "expired" };
  await pool.query(
    "UPDATE messenger_conversations SET updated_at = now() WHERE id = $1",
    [input.conversationId],
  );
  return { status: "updated", row };
}

export type SoftDeleteMessageResult =
  | { status: "deleted"; messageType: string; alreadyDeleted: boolean }
  | { status: "not_found" | "not_owner" };

export async function softDeleteOwnMessage(
  pool: EditDeleteQueryPool,
  input: {
    conversationId: string;
    messageId: string;
    userId: string;
    hasMediaTable: boolean;
    prepare?: (message: {
      message_type: string;
      audio_content_type: string | null;
    }) => Promise<void>;
    cleanup: (message: {
      message_type: string;
      audio_content_type: string | null;
    }) => Promise<void>;
  },
): Promise<SoftDeleteMessageResult> {
  const selected = await pool.query<{
    sender_id: string;
    message_type: string;
    audio_content_type: string | null;
    deleted_at: Date | string | null;
  }>(
    `SELECT sender_id, message_type, audio_content_type, deleted_at
     FROM messenger_messages
     WHERE id = $1 AND conversation_id = $2`,
    [input.messageId, input.conversationId],
  );
  const message = selected.rows[0];
  if (!message) return { status: "not_found" };
  if (message.sender_id !== input.userId) return { status: "not_owner" };

  const alreadyDeleted = Boolean(message.deleted_at);
  await input.prepare?.(message);
  if (!alreadyDeleted) {
    const updated = await pool.query(
      `UPDATE messenger_messages
       SET body = $4,
           deleted_at = COALESCE(deleted_at, now()),
           attachment_count = 0,
           audio_duration_ms = NULL,
           audio_content_type = NULL,
           audio_size_bytes = NULL,
           location_lat = NULL,
           location_lng = NULL,
           location_accuracy_m = NULL,
           location_captured_at = NULL
       WHERE id = $1 AND conversation_id = $2 AND sender_id = $3
         AND deleted_at IS NULL
       RETURNING id`,
      [
        input.messageId,
        input.conversationId,
        input.userId,
        MESSAGE_TOMBSTONE_BODY,
      ],
    );
    if (!updated.rows[0]) return { status: "not_found" };
  }

  await input.cleanup(message);
  if (input.hasMediaTable) {
    await pool.query(
      "DELETE FROM messenger_message_media WHERE message_id = $1",
      [input.messageId],
    );
  }
  await pool.query(
    "UPDATE messenger_conversations SET updated_at = now() WHERE id = $1",
    [input.conversationId],
  );
  return {
    status: "deleted",
    messageType: message.message_type,
    alreadyDeleted,
  };
}
