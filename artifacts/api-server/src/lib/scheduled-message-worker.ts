import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import { notifyConversationMessage } from "./messenger-web-push";
import {
  databaseCode,
  isPermanentMessageError,
  scheduledClientMessageId,
} from "./scheduled-message-policy";
import { hasMessengerBlocksSchema, isMessengerUserBlocked } from "./messenger-blocks";

type ScheduledRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
};

type DbPool = (typeof import("@workspace/db"))["pool"];

const intervalMs = 5_000;
const maxMessagesPerTick = 20;

async function markFailed(pool: DbPool, id: string): Promise<void> {
  await pool.query(
    `UPDATE messenger_scheduled_messages
     SET status = 'failed', failure_code = 'delivery_failed', updated_at = now()
     WHERE id = $1 AND status = 'pending'`,
    [id],
  );
}

async function processOneDueMessage(pool: DbPool): Promise<boolean> {
  let rollback: (() => Promise<unknown>) | undefined;
  let release: (() => void) | undefined;
  let selectedId: string | null = null;
  let transactionOpen = false;

  try {
    const connection = await pool.connect();
    rollback = () => connection.query("ROLLBACK");
    release = () => connection.release();
    await connection.query("BEGIN");
    transactionOpen = true;

    const selected = await connection.query<ScheduledRow>(
      `SELECT id, conversation_id, sender_id, body
       FROM messenger_scheduled_messages
       WHERE status = 'pending' AND scheduled_at <= now()
       ORDER BY scheduled_at ASC, id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );
    const scheduled = selected.rows[0];
    if (!scheduled) {
      await connection.query("COMMIT");
      transactionOpen = false;
      return false;
    }
    selectedId = scheduled.id;

    if (await hasMessengerBlocksSchema(pool)) {
      const conversation = await connection.query<{ user_a: string; user_b: string }>(
        `SELECT user_a, user_b FROM messenger_conversations WHERE id = $1`,
        [scheduled.conversation_id],
      );
      const participants = conversation.rows[0];
      const recipientId = participants
        ? participants.user_a === scheduled.sender_id
          ? participants.user_b
          : participants.user_a
        : "";
      if (
        recipientId &&
        await isMessengerUserBlocked(connection, scheduled.sender_id, recipientId)
      ) {
        await connection.query(
          `UPDATE messenger_scheduled_messages
           SET status = 'failed', failure_code = 'blocked', updated_at = now()
           WHERE id = $1 AND status = 'pending'`,
          [scheduled.id],
        );
        await connection.query("COMMIT");
        transactionOpen = false;
        logger.info({ scheduledMessageId: scheduled.id }, "Scheduled message blocked");
        return true;
      }
    }

    const clientMessageId = scheduledClientMessageId(scheduled.id);
    const inserted = await connection.query<{ id: string }>(
      `INSERT INTO messenger_messages
         (id, conversation_id, sender_id, client_message_id, body)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
       RETURNING id`,
      [
        randomUUID(),
        scheduled.conversation_id,
        scheduled.sender_id,
        clientMessageId,
        scheduled.body,
      ],
    );
    const sentMessageId =
      inserted.rows[0]?.id ??
      (
        await connection.query<{ id: string }>(
          `SELECT id FROM messenger_messages
           WHERE conversation_id = $1 AND sender_id = $2 AND client_message_id = $3`,
          [scheduled.conversation_id, scheduled.sender_id, clientMessageId],
        )
      ).rows[0]?.id;
    if (!sentMessageId) {
      throw new Error("Scheduled message insert did not return an id");
    }

    await connection.query(
      `UPDATE messenger_conversations SET updated_at = now() WHERE id = $1`,
      [scheduled.conversation_id],
    );
    await connection.query(
      `UPDATE messenger_scheduled_messages
       SET status = 'sent', sent_message_id = $2, sent_at = now(),
           failure_code = NULL, updated_at = now()
       WHERE id = $1 AND status = 'pending'`,
      [scheduled.id, sentMessageId],
    );
    await connection.query("COMMIT");
    transactionOpen = false;
    if (inserted.rows[0]) {
      void notifyConversationMessage(pool, {
        conversationId: scheduled.conversation_id,
        senderId: scheduled.sender_id,
        messageType: "text",
        body: scheduled.body,
      });
    }
    logger.info({ scheduledMessageId: scheduled.id }, "Scheduled message sent");
    return true;
  } catch (error) {
    if (rollback && transactionOpen) {
      try {
        await rollback();
      } catch {
        // Keep the original database error for logging and recovery.
      }
    }
    if (selectedId && isPermanentMessageError(error)) {
      try {
        await markFailed(pool, selectedId);
        logger.error(
          { scheduledMessageId: selectedId, databaseCode: databaseCode(error) },
          "Scheduled message could not be sent",
        );
        return true;
      } catch (markError) {
        logger.error(
          { scheduledMessageId: selectedId, databaseCode: databaseCode(markError) },
          "Could not record scheduled message failure",
        );
        return false;
      }
    }
    throw error;
  } finally {
    release?.();
  }
}

export async function startScheduledMessageWorker(): Promise<void> {
  if (!process.env.ADS_DATABASE_URL) {
    logger.warn("Scheduled message worker is idle because database storage is not configured");
    return;
  }

  const { pool } = await import("@workspace/db");
  let running = false;
  let timer: NodeJS.Timeout | undefined;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (let count = 0; count < maxMessagesPerTick; count += 1) {
        const processed = await processOneDueMessage(pool);
        if (!processed) break;
      }
    } catch (error) {
      if (databaseCode(error) === "42P01") {
        logger.warn(
          "Scheduled message table is not available; apply its migration and restart the API server",
        );
        if (timer) clearInterval(timer);
        timer = undefined;
      } else {
        logger.error(
          { databaseCode: databaseCode(error) },
          "Scheduled message worker will retry",
        );
      }
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  logger.info({ intervalMs }, "Scheduled message worker started");
}
