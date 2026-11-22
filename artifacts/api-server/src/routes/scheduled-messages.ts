import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import {
  CancelMessengerScheduledMessageParams,
  CancelMessengerScheduledMessageResponse,
  CreateMessengerScheduledMessageBody,
  CreateMessengerScheduledMessageParams,
  CreateMessengerScheduledMessageResponse,
  ListMessengerScheduledMessagesResponse,
  UpdateMessengerScheduledMessageBody,
  UpdateMessengerScheduledMessageParams,
  UpdateMessengerScheduledMessageResponse,
} from "@workspace/api-zod";
import { Router, type IRouter, type RequestHandler } from "express";
import { scheduledAtOrNull } from "../lib/scheduled-message-policy";

type DbPool = Awaited<ReturnType<typeof loadPool>>;

async function loadPool() {
  if (!process.env.ADS_DATABASE_URL) return null;
  const db = await import("@workspace/db");
  return db.pool;
}

const router: IRouter = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.locals.userId = userId;
  next();
};

function getUserId(res: Parameters<RequestHandler>[1]): string {
  return String(res.locals.userId);
}

function getPoolOrUnavailable(pool: DbPool, res: Parameters<RequestHandler>[1]) {
  if (!pool) {
    res.status(503).json({ error: "Messenger storage is not configured" });
    return null;
  }
  return pool;
}

function isNonEmptyMessage(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 4000;
}

const scheduledMessageSelect = `
  SELECT s.id,
         s.conversation_id,
         s.body,
         s.scheduled_at,
         s.status,
         s.created_at,
         s.sent_at,
         CASE WHEN s.status = 'failed'
              THEN 'تعذر إرسال الرسالة تلقائيًا. يمكنك إرسالها من المحادثة.'
              ELSE NULL
         END AS failure_message,
         peer.display_name AS peer_name
  FROM messenger_scheduled_messages s
  JOIN messenger_conversations c ON c.id = s.conversation_id
  JOIN messenger_profiles peer
    ON peer.user_id = CASE WHEN c.user_a = s.sender_id THEN c.user_b ELSE c.user_a END
`;

async function getScheduledMessage(
  pool: NonNullable<DbPool>,
  id: string,
  userId: string,
) {
  const result = await pool.query(
    `${scheduledMessageSelect} WHERE s.id = $1 AND s.sender_id = $2`,
    [id, userId],
  );
  return result.rows[0];
}

router.get("/messenger/scheduled-messages", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    const result = await pool.query(
      `${scheduledMessageSelect}
       WHERE s.sender_id = $1
       ORDER BY CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END,
                s.scheduled_at ASC,
                s.updated_at DESC`,
      [getUserId(res)],
    );
    res.json(
      ListMessengerScheduledMessagesResponse.parse({
        scheduledMessages: result.rows.map((row) => ({
          id: row.id,
          conversationId: row.conversation_id,
          peerName: row.peer_name,
          body: row.body,
          scheduledAt: row.scheduled_at,
          status: row.status,
          createdAt: row.created_at,
          sentAt: row.sent_at,
          failureMessage: row.failure_message,
        })),
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Could not list scheduled messages");
    next(error);
  }
});

router.post(
  "/messenger/conversations/:conversationId/scheduled-messages",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;

      const params = CreateMessengerScheduledMessageParams.safeParse(req.params);
      const parsed = CreateMessengerScheduledMessageBody.safeParse(req.body);
      if (!params.success || !parsed.success) {
        res.status(400).json({ error: "راجع نص الرسالة وموعدها." });
        return;
      }
      const body = parsed.data.body.trim();
      const scheduledAt = scheduledAtOrNull(parsed.data.scheduledAt);
      if (!isNonEmptyMessage(body) || !scheduledAt) {
        res.status(400).json({
          error: "اكتب رسالة وحدد موعدًا بعد دقيقة على الأقل من الآن.",
        });
        return;
      }

      const userId = getUserId(res);
      const conversationId = params.data.conversationId;
      const conversation = await pool.query(
        `SELECT id FROM messenger_conversations
         WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
        [conversationId, userId],
      );
      if (!conversation.rows[0]) {
        res.status(404).json({ error: "المحادثة غير موجودة." });
        return;
      }

      const createdId = randomUUID();
      const inserted = await pool.query(
        `INSERT INTO messenger_scheduled_messages
           (id, conversation_id, sender_id, client_schedule_id, body, scheduled_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (conversation_id, sender_id, client_schedule_id) DO NOTHING
         RETURNING id`,
        [
          createdId,
          conversationId,
          userId,
          parsed.data.clientScheduleId,
          body,
          scheduledAt,
        ],
      );
      const id = inserted.rows[0]?.id ?? (
        await pool.query(
          `SELECT id FROM messenger_scheduled_messages
           WHERE conversation_id = $1 AND sender_id = $2 AND client_schedule_id = $3`,
          [conversationId, userId, parsed.data.clientScheduleId],
        )
      ).rows[0]?.id;
      if (!id) {
        res.status(500).json({ error: "تعذر حفظ موعد الرسالة." });
        return;
      }

      const row = await getScheduledMessage(pool, id, userId);
      if (!row) {
        res.status(500).json({ error: "تعذر تحميل موعد الرسالة." });
        return;
      }
      const response = CreateMessengerScheduledMessageResponse.parse({
        scheduledMessage: {
          id: row.id,
          conversationId: row.conversation_id,
          peerName: row.peer_name,
          body: row.body,
          scheduledAt: row.scheduled_at,
          status: row.status,
          createdAt: row.created_at,
          sentAt: row.sent_at,
          failureMessage: row.failure_message,
        },
      });
      res.status(inserted.rows[0] ? 201 : 200).json(response);
    } catch (error) {
      req.log.error({ err: error }, "Could not create scheduled message");
      next(error);
    }
  },
);

router.patch(
  "/messenger/scheduled-messages/:scheduledMessageId",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;

      const params = UpdateMessengerScheduledMessageParams.safeParse(req.params);
      const parsed = UpdateMessengerScheduledMessageBody.safeParse(req.body);
      if (!params.success || !parsed.success) {
        res.status(400).json({ error: "راجع نص الرسالة وموعدها." });
        return;
      }
      const body = parsed.data.body.trim();
      const scheduledAt = scheduledAtOrNull(parsed.data.scheduledAt);
      if (!isNonEmptyMessage(body) || !scheduledAt) {
        res.status(400).json({
          error: "اكتب رسالة وحدد موعدًا بعد دقيقة على الأقل من الآن.",
        });
        return;
      }

      const userId = getUserId(res);
      const id = params.data.scheduledMessageId;
      const updated = await pool.query(
        `UPDATE messenger_scheduled_messages
         SET body = $1, scheduled_at = $2, updated_at = now()
         WHERE id = $3 AND sender_id = $4
           AND status = 'pending' AND scheduled_at > now()
         RETURNING id`,
        [body, scheduledAt, id, userId],
      );
      if (!updated.rows[0]) {
        const existing = await getScheduledMessage(pool, id, userId);
        if (!existing) {
          res.status(404).json({ error: "الرسالة المجدولة غير موجودة." });
          return;
        }
        res.status(409).json({
          error: "لم يعد ممكنًا تعديل هذه الرسالة لأنها أُرسلت أو حان موعدها.",
        });
        return;
      }

      const row = await getScheduledMessage(pool, id, userId);
      if (!row) {
        res.status(500).json({ error: "تعذر تحميل موعد الرسالة." });
        return;
      }
      res.json(
        UpdateMessengerScheduledMessageResponse.parse({
          scheduledMessage: {
            id: row.id,
            conversationId: row.conversation_id,
            peerName: row.peer_name,
            body: row.body,
            scheduledAt: row.scheduled_at,
            status: row.status,
            createdAt: row.created_at,
            sentAt: row.sent_at,
            failureMessage: row.failure_message,
          },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Could not update scheduled message");
      next(error);
    }
  },
);

router.delete(
  "/messenger/scheduled-messages/:scheduledMessageId",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;

      const params = CancelMessengerScheduledMessageParams.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({ error: "معرّف الرسالة غير صالح." });
        return;
      }

      const userId = getUserId(res);
      const id = params.data.scheduledMessageId;
      const cancelled = await pool.query(
        `UPDATE messenger_scheduled_messages
         SET status = 'cancelled', updated_at = now()
         WHERE id = $1 AND sender_id = $2
           AND status = 'pending' AND scheduled_at > now()
         RETURNING id`,
        [id, userId],
      );
      if (!cancelled.rows[0]) {
        const existing = await getScheduledMessage(pool, id, userId);
        if (!existing) {
          res.status(404).json({ error: "الرسالة المجدولة غير موجودة." });
          return;
        }
        res.status(409).json({
          error: "لم يعد ممكنًا إلغاء هذه الرسالة لأنها أُرسلت أو حان موعدها.",
        });
        return;
      }

      const row = await getScheduledMessage(pool, id, userId);
      if (!row) {
        res.status(500).json({ error: "تعذر تحميل موعد الرسالة." });
        return;
      }
      res.json(
        CancelMessengerScheduledMessageResponse.parse({
          ok: true,
          scheduledMessage: {
            id: row.id,
            conversationId: row.conversation_id,
            peerName: row.peer_name,
            body: row.body,
            scheduledAt: row.scheduled_at,
            status: row.status,
            createdAt: row.created_at,
            sentAt: row.sent_at,
            failureMessage: row.failure_message,
          },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Could not cancel scheduled message");
      next(error);
    }
  },
);

export default router;
