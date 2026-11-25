import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import express, { Router, type RequestHandler } from "express";
import {
  deleteR2Object,
  getR2Object,
  isR2Configured,
  putR2Object,
  voiceObjectKey,
} from "../lib/r2";
import {
  MAX_MESSENGER_MEDIA_BYTES,
  MESSENGER_MEDIA_TYPES,
  mediaSizeIsAllowed,
  messengerMediaKind,
  messengerMediaObjectKey,
  normalizeMessengerMediaType,
  sanitizeMessengerFilename,
} from "../lib/messenger-media-policy";
import { canForwardMessageType } from "../lib/messenger-location";
import { notifyConversationMessage } from "../lib/messenger-web-push";
import { canSendDirectMessage, MESSENGER_BLOCKED_SEND_ERROR } from "../lib/messenger-blocks";

type DbPool = Awaited<ReturnType<typeof loadPool>>;

async function loadPool() {
  if (!process.env.ADS_DATABASE_URL) return null;
  const db = await import("@workspace/db");
  return db.pool;
}

const router = Router();
const allowedReactions = new Set(["👍", "❤️", "😂", "😮", "🙏"]);
const mediaSchemaCache = new WeakMap<object, { checkedAt: number; ready: boolean }>();

const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.locals.userId = userId;
  next();
};

function userIdFrom(res: Parameters<RequestHandler>[1]): string {
  return String(res.locals.userId);
}

async function mediaSchemaReady(pool: NonNullable<DbPool>): Promise<boolean> {
  const cached = mediaSchemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'messenger_messages'
            AND column_name IN ('reply_to_message_id', 'forwarded_from_message_id')) AS columns_ready,
         (SELECT count(*)::int FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = ANY($1::text[])) AS tables_ready`,
      [[
        "messenger_message_media",
        "messenger_message_reactions",
        "messenger_conversation_settings",
      ]],
    );
    const ready =
      Number(result.rows[0]?.columns_ready) === 2 &&
      Number(result.rows[0]?.tables_ready) === 3;
    mediaSchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    mediaSchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

function requirePool(pool: DbPool, res: Parameters<RequestHandler>[1]) {
  if (!pool) {
    res.status(503).json({ error: "Messenger storage is not configured" });
    return null;
  }
  return pool;
}

async function requireConversation(
  pool: NonNullable<DbPool>,
  conversationId: string,
  userId: string,
) {
  const result = await pool.query(
    `SELECT id, user_a, user_b FROM messenger_conversations
     WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
    [conversationId, userId],
  );
  return result.rows[0] ?? null;
}

function publicMediaMessage(row: {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: Date | string;
  delivered_at: Date | string | null;
  read_at: Date | string | null;
  message_type: string;
  audio_duration_ms?: number | string | null;
  audio_content_type?: string | null;
  audio_size_bytes?: number | string | null;
  forwarded_from_message_id?: string | null;
  original_filename?: string | null;
  content_type?: string | null;
  kind?: string | null;
  size_bytes?: number | string | null;
}) {
  const messageType = row.message_type === "audio" || row.message_type === "media"
    ? row.message_type
    : "text";
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : null,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    messageType,
    audioDurationMs:
      messageType === "audio" && row.audio_duration_ms != null
        ? Number(row.audio_duration_ms)
        : null,
    audioUrl:
      messageType === "audio"
        ? `/api/messenger/conversations/${encodeURIComponent(row.conversation_id)}/messages/${encodeURIComponent(row.id)}/audio`
        : null,
    mediaAttachment:
      messageType === "media" && row.original_filename && row.content_type
        ? {
            filename: row.original_filename,
            contentType: row.content_type,
            kind: row.kind ?? "file",
            sizeBytes: Number(row.size_bytes ?? 0),
            url: `/api/messenger/conversations/${encodeURIComponent(row.conversation_id)}/messages/${encodeURIComponent(row.id)}/media`,
          }
        : null,
    replyToMessageId: null,
    replyPreview: null,
    forwarded: Boolean(row.forwarded_from_message_id),
    reactions: [],
  };
}

const parseMediaBody: RequestHandler = (req, res, next) => {
  const parser = express.raw({
    type: Object.keys(MESSENGER_MEDIA_TYPES),
    limit: MAX_MESSENGER_MEDIA_BYTES,
  });
  parser(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 413
        ? 413
        : 400;
    res.status(status).json({
      error: status === 413
        ? "الحد الأقصى للمرفق 8 ميجابايت."
        : "تعذر قراءة الملف المرفق.",
    });
  });
};

router.get("/messenger/features/capability", requireAuth, async (_req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool) return;
    const schemaReady = await mediaSchemaReady(pool);
    const storageReady = isR2Configured();
    res.json({
      enabled: schemaReady,
      mediaEnabled: schemaReady && storageReady,
      maxMediaBytes: MAX_MESSENGER_MEDIA_BYTES,
      allowedContentTypes: Object.keys(MESSENGER_MEDIA_TYPES),
      reason: !schemaReady
        ? "database_update_required"
        : !storageReady
          ? "storage_not_configured"
          : null,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/messenger/search", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool) return;
    const query = String(req.query.query ?? "").trim().slice(0, 80);
    if (query.length < 2) {
      res.status(400).json({ error: "اكتب حرفين على الأقل للبحث." });
      return;
    }
    const userId = userIdFrom(res);
    const escaped = query.replace(/[\\%_]/g, "\\$&");
    const result = await pool.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.message_type,
              m.created_at, peer.display_name AS peer_name
       FROM messenger_messages m
       JOIN messenger_conversations c ON c.id = m.conversation_id
       JOIN messenger_profiles peer
         ON peer.user_id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
       WHERE (c.user_a = $1 OR c.user_b = $1)
         AND m.body ILIKE $2 ESCAPE '\\'
       ORDER BY m.created_at DESC
       LIMIT 40`,
      [userId, `%${escaped}%`],
    );
    res.json({
      results: result.rows.map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        peerName: row.peer_name,
        body: row.body,
        messageType: row.message_type === "audio" || row.message_type === "media"
          ? row.message_type
          : "text",
        createdAt: new Date(row.created_at).toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/messenger/conversations/:conversationId/settings",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const userId = userIdFrom(res);
      const conversation = await requireConversation(pool, conversationId, userId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      if (!(await mediaSchemaReady(pool))) {
        res.status(503).json({ error: "Message tools database update is required" });
        return;
      }
      const allowedKeys = ["isPinned", "isMuted", "isArchived"] as const;
      const updates: Partial<Record<(typeof allowedKeys)[number], boolean>> = {};
      for (const key of allowedKeys) {
        if (Object.hasOwn(req.body ?? {}, key)) {
          if (typeof req.body[key] !== "boolean") {
            res.status(400).json({ error: "Conversation settings must be true or false" });
            return;
          }
          updates[key] = req.body[key];
        }
      }
      if (!Object.keys(updates).length) {
        res.status(400).json({ error: "Choose a conversation setting to update" });
        return;
      }
      const result = await pool.query(
        `INSERT INTO messenger_conversation_settings
           (conversation_id, user_id, is_pinned, is_muted, is_archived)
         VALUES ($1, $2, COALESCE($3, false), COALESCE($4, false), COALESCE($5, false))
         ON CONFLICT (conversation_id, user_id) DO UPDATE SET
           is_pinned = COALESCE($3, messenger_conversation_settings.is_pinned),
           is_muted = COALESCE($4, messenger_conversation_settings.is_muted),
           is_archived = COALESCE($5, messenger_conversation_settings.is_archived),
           updated_at = now()
         RETURNING is_pinned, is_muted, is_archived`,
        [
          conversationId,
          userId,
          updates.isPinned ?? null,
          updates.isMuted ?? null,
          updates.isArchived ?? null,
        ],
      );
      res.json({
        settings: {
          isPinned: result.rows[0].is_pinned,
          isMuted: result.rows[0].is_muted,
          isArchived: result.rows[0].is_archived,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/conversations/:conversationId/messages/:messageId/reactions",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const messageId = String(req.params.messageId);
      const userId = userIdFrom(res);
      if (!(await requireConversation(pool, conversationId, userId))) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      if (!(await mediaSchemaReady(pool))) {
        res.status(503).json({ error: "Message tools database update is required" });
        return;
      }
      const emoji = String(req.body?.emoji ?? "");
      if (!allowedReactions.has(emoji)) {
        res.status(400).json({ error: "اختَر تفاعلًا من القائمة المتاحة." });
        return;
      }
      const message = await pool.query(
        `SELECT id FROM messenger_messages
         WHERE id = $1 AND conversation_id = $2`,
        [messageId, conversationId],
      );
      if (!message.rows[0]) {
        res.status(404).json({ error: "Message not found" });
        return;
      }
      const current = await pool.query(
        `SELECT emoji FROM messenger_message_reactions
         WHERE message_id = $1 AND user_id = $2`,
        [messageId, userId],
      );
      if (current.rows[0]?.emoji === emoji) {
        await pool.query(
          `DELETE FROM messenger_message_reactions
           WHERE message_id = $1 AND user_id = $2`,
          [messageId, userId],
        );
      } else {
        await pool.query(
          `INSERT INTO messenger_message_reactions (message_id, user_id, emoji)
           VALUES ($1, $2, $3)
           ON CONFLICT (message_id, user_id) DO UPDATE SET
             emoji = EXCLUDED.emoji, created_at = now()`,
          [messageId, userId, emoji],
        );
      }
      const reactions = await pool.query(
        `SELECT emoji, count(*)::int AS count, bool_or(user_id = $2) AS reacted_by_me
         FROM messenger_message_reactions
         WHERE message_id = $1
         GROUP BY emoji ORDER BY emoji`,
        [messageId, userId],
      );
      res.json({
        reactions: reactions.rows.map((row) => ({
          emoji: row.emoji,
          count: Number(row.count),
          reactedByMe: Boolean(row.reacted_by_me),
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/conversations/:conversationId/media",
  requireAuth,
  parseMediaBody,
  async (req, res, next) => {
    let objectKey = "";
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const userId = userIdFrom(res);
      const conversation = await requireConversation(pool, conversationId, userId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      if (!(await canSendDirectMessage(
        pool,
        userId,
        conversation.user_a === userId ? conversation.user_b : conversation.user_a,
      ))) {
        res.status(403).json({ error: MESSENGER_BLOCKED_SEND_ERROR });
        return;
      }
      if (!(await mediaSchemaReady(pool))) {
        res.status(503).json({ error: "Message tools database update is required" });
        return;
      }
      if (!isR2Configured()) {
        res.status(503).json({ error: "Private media storage is not configured" });
        return;
      }
      const contentType = normalizeMessengerMediaType(
        String(req.header("content-type") ?? ""),
      );
      const clientMessageId = String(req.header("x-client-message-id") ?? "").trim();
      const filename = sanitizeMessengerFilename(
        decodeFilename(String(req.header("x-original-filename") ?? "")),
      );
      const body = Buffer.isBuffer(req.body) ? req.body : null;
      if (
        !contentType ||
        !/^[A-Za-z0-9_-]{8,80}$/.test(clientMessageId) ||
        !body ||
        !mediaSizeIsAllowed(body.length)
      ) {
        res.status(400).json({ error: "تحقق من نوع الملف وحجمه ثم حاول مرة أخرى." });
        return;
      }

      const duplicate = await pool.query(
        `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
                m.delivered_at, m.read_at, m.message_type, m.forwarded_from_message_id,
                media.original_filename, media.content_type, media.kind, media.size_bytes
         FROM messenger_messages m
         JOIN messenger_message_media media ON media.message_id = m.id
         WHERE m.conversation_id = $1 AND m.sender_id = $2
           AND m.client_message_id = $3 AND m.message_type = 'media'`,
        [conversationId, userId, clientMessageId],
      );
      if (duplicate.rows[0]) {
        res.status(200).json({ message: publicMediaMessage(duplicate.rows[0]) });
        return;
      }

      const messageId = randomUUID();
      objectKey = messengerMediaObjectKey(conversationId, messageId, contentType);
      const abortController = new AbortController();
      const abortUpload = () => abortController.abort();
      req.once("aborted", abortUpload);
      try {
        await putR2Object(objectKey, body, contentType, abortController.signal);
        if (req.aborted) {
          await deleteR2Object(objectKey).catch(() => undefined);
          return;
        }
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const inserted = await client.query(
            `INSERT INTO messenger_messages
               (id, conversation_id, sender_id, client_message_id, body,
                attachment_count, message_type)
             VALUES ($1, $2, $3, $4, $5, 1, 'media')
             ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
             RETURNING id, conversation_id, sender_id, body, created_at,
                       delivered_at, read_at, message_type`,
            [messageId, conversationId, userId, clientMessageId, `📎 ${filename}`],
          );
          if (!inserted.rows[0]) {
            await client.query("ROLLBACK");
            await deleteR2Object(objectKey).catch(() => undefined);
            const existing = await pool.query(
              `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
                      m.delivered_at, m.read_at, m.message_type, m.forwarded_from_message_id,
                      media.original_filename, media.content_type, media.kind, media.size_bytes
               FROM messenger_messages m
               LEFT JOIN messenger_message_media media ON media.message_id = m.id
               WHERE m.conversation_id = $1 AND m.sender_id = $2 AND m.client_message_id = $3`,
              [conversationId, userId, clientMessageId],
            );
            if (!existing.rows[0]) {
              res.status(409).json({ error: "This message ID was already used" });
              return;
            }
            if (existing.rows[0].message_type !== "media") {
              res.status(409).json({ error: "This message ID was already used" });
              return;
            }
            res.status(200).json({ message: publicMediaMessage(existing.rows[0]) });
            return;
          }
          await client.query(
            `INSERT INTO messenger_message_media
               (message_id, object_key, original_filename, content_type, kind, size_bytes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              messageId,
              objectKey,
              filename,
              contentType,
              messengerMediaKind(contentType),
              body.length,
            ],
          );
          await client.query(
            "UPDATE messenger_conversations SET updated_at = now() WHERE id = $1",
            [conversationId],
          );
          await client.query("COMMIT");
          objectKey = "";
          void notifyConversationMessage(pool, {
            conversationId,
            senderId: userId,
            messageType: "media",
            body: "",
          });
          res.status(201).json({
            message: publicMediaMessage({
              ...inserted.rows[0],
              forwarded_from_message_id: null,
              original_filename: filename,
              content_type: contentType,
              kind: messengerMediaKind(contentType),
              size_bytes: body.length,
            }),
          });
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          await deleteR2Object(objectKey).catch(() => undefined);
          objectKey = "";
          throw error;
        } finally {
          client.release();
        }
      } finally {
        req.off("aborted", abortUpload);
      }
    } catch (error) {
      if (objectKey) await deleteR2Object(objectKey).catch(() => undefined);
      next(error);
    }
  },
);

router.get(
  "/messenger/conversations/:conversationId/messages/:messageId/media",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const messageId = String(req.params.messageId);
      if (!(await requireConversation(pool, conversationId, userIdFrom(res)))) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      if (!(await mediaSchemaReady(pool))) {
        res.status(503).json({ error: "Message tools database update is required" });
        return;
      }
      if (!isR2Configured()) {
        res.status(503).json({ error: "Private media storage is not configured" });
        return;
      }
      const result = await pool.query(
        `SELECT media.object_key, media.original_filename,
                media.content_type, media.kind, media.size_bytes
         FROM messenger_message_media media
         JOIN messenger_messages m ON m.id = media.message_id
         WHERE m.id = $1 AND m.conversation_id = $2 AND m.message_type = 'media'`,
        [messageId, conversationId],
      );
      const metadata = result.rows[0];
      if (!metadata) {
        res.status(404).json({ error: "Attachment not found" });
        return;
      }
      const contentType = normalizeMessengerMediaType(metadata.content_type);
      if (!contentType) {
        res.status(404).json({ error: "Attachment type is not supported" });
        return;
      }
      const file = await getR2Object(metadata.object_key);
      if (!file) {
        res.status(404).json({ error: "Attachment file not found" });
        return;
      }
      const disposition = metadata.kind === "file" ? "attachment" : "inline";
      res
        .status(200)
        .set({
          "Content-Type": contentType,
          "Content-Length": String(file.length),
          "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(metadata.original_filename)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        })
        .send(file);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/messages/:messageId/forward",
  requireAuth,
  async (req, res, next) => {
    let copiedObjectKey = "";
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const userId = userIdFrom(res);
      const messageId = String(req.params.messageId);
      const targetConversationId = String(req.body?.targetConversationId ?? "");
      if (!(await mediaSchemaReady(pool))) {
        res.status(503).json({ error: "Message tools database update is required" });
        return;
      }
      const sourceResult = await pool.query(
        `SELECT m.id, m.conversation_id, m.sender_id, m.client_message_id, m.body,
                m.created_at, m.delivered_at, m.read_at, m.message_type,
                m.audio_duration_ms, m.audio_content_type, m.audio_size_bytes,
                media.object_key, media.original_filename, media.content_type,
                media.kind, media.size_bytes
         FROM messenger_messages m
         JOIN messenger_conversations c ON c.id = m.conversation_id
         LEFT JOIN messenger_message_media media ON media.message_id = m.id
         WHERE m.id = $1 AND (c.user_a = $2 OR c.user_b = $2)`,
        [messageId, userId],
      );
      const source = sourceResult.rows[0];
      if (!source) {
        res.status(404).json({ error: "Message not found" });
        return;
      }
      if (!canForwardMessageType(source.message_type)) {
        res.status(400).json({ error: "Location messages cannot be forwarded" });
        return;
      }
      const target = await requireConversation(pool, targetConversationId, userId);
      if (!target) {
        res.status(404).json({ error: "Destination conversation not found" });
        return;
      }
      if (
        !(await canSendDirectMessage(
          pool,
          userId,
          target.user_a === userId ? target.user_b : target.user_a,
        ))
      ) {
        res.status(403).json({ error: MESSENGER_BLOCKED_SEND_ERROR });
        return;
      }

      const newId = randomUUID();
      let audioBytes: Buffer | null = null;
      let mediaObjectKey: string | null = null;
      if (source.message_type === "audio" || source.message_type === "media") {
        if (!isR2Configured()) {
          res.status(503).json({ error: "Private media storage is not configured" });
          return;
        }
        const sourceKey = source.message_type === "audio"
          ? voiceObjectKey(
              source.conversation_id,
              source.id,
              source.audio_content_type as "audio/mp4" | "audio/webm",
            )
          : source.object_key;
        if (!sourceKey) {
          res.status(404).json({ error: "Attachment not found" });
          return;
        }
        audioBytes = await getR2Object(sourceKey);
        if (!audioBytes) {
          res.status(404).json({ error: "Attachment file not found" });
          return;
        }
        const extensionType = source.message_type === "audio"
          ? source.audio_content_type
          : source.content_type;
        if (source.message_type === "media") {
          const safeType = normalizeMessengerMediaType(String(extensionType ?? ""));
          if (!safeType) {
            res.status(400).json({ error: "Attachment type is not supported" });
            return;
          }
          mediaObjectKey = messengerMediaObjectKey(
            targetConversationId,
            newId,
            safeType,
          );
          copiedObjectKey = mediaObjectKey;
          await putR2Object(mediaObjectKey, audioBytes, safeType);
        } else {
          if (extensionType !== "audio/mp4" && extensionType !== "audio/webm") {
            res.status(400).json({ error: "Voice message type is not supported" });
            return;
          }
          copiedObjectKey = voiceObjectKey(
            targetConversationId,
            newId,
            extensionType,
          );
          await putR2Object(copiedObjectKey, audioBytes, extensionType);
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `INSERT INTO messenger_messages
             (id, conversation_id, sender_id, client_message_id, body,
              attachment_count, message_type, audio_duration_ms,
              audio_content_type, audio_size_bytes, forwarded_from_message_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id, conversation_id, sender_id, body, created_at,
                     delivered_at, read_at, message_type, audio_duration_ms,
                     audio_content_type, audio_size_bytes, forwarded_from_message_id`,
          [
            newId,
            targetConversationId,
            userId,
            `forward:${newId}`,
            source.body,
            source.message_type === "text" ? 0 : 1,
            source.message_type,
            source.message_type === "audio" ? source.audio_duration_ms : null,
            source.message_type === "audio" ? source.audio_content_type : null,
            source.message_type === "audio" ? source.audio_size_bytes : null,
            source.id,
          ],
        );
        if (source.message_type === "media" && mediaObjectKey) {
          await client.query(
            `INSERT INTO messenger_message_media
               (message_id, object_key, original_filename, content_type, kind, size_bytes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              newId,
              mediaObjectKey,
              source.original_filename,
              source.content_type,
              source.kind,
              source.size_bytes,
            ],
          );
        }
        await client.query(
          "UPDATE messenger_conversations SET updated_at = now() WHERE id = $1",
          [targetConversationId],
        );
        await client.query("COMMIT");
        if (inserted.rows[0]) {
          void notifyConversationMessage(pool, {
            conversationId: targetConversationId,
            senderId: userId,
            messageType: source.message_type,
            body: source.body,
          });
        }
        res.status(201).json({
          message: publicMediaMessage({
            ...inserted.rows[0],
            original_filename: source.original_filename,
            content_type: source.content_type,
            kind: source.kind,
            size_bytes: source.size_bytes,
          }),
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        if (copiedObjectKey) await deleteR2Object(copiedObjectKey).catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (copiedObjectKey) await deleteR2Object(copiedObjectKey).catch(() => undefined);
      next(error);
    }
  },
);

function decodeFilename(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default router;
