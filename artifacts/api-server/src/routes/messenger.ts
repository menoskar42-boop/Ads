import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import express, { Router, type IRouter, type RequestHandler } from "express";
import {
  deleteR2Object,
  getR2Object,
  isR2Configured,
  putR2Object,
  voiceObjectKey,
} from "../lib/r2";

type DbPool = Awaited<ReturnType<typeof loadPool>>;

async function loadPool() {
  if (!process.env.DATABASE_URL) return null;
  const db = await import("@workspace/db");
  return db.pool;
}

const router: IRouter = Router();
const searchWindows = new Map<string, { count: number; resetAt: number }>();
const MAX_VOICE_DURATION_MS = 120_000;
const MAX_VOICE_BYTES = 4 * 1024 * 1024;
const AUDIO_CONTENT_TYPES = new Set(["audio/mp4", "audio/webm"]);
const voiceSchemaCache = new WeakMap<
  object,
  { checkedAt: number; ready: boolean }
>();
const messageToolsSchemaCache = new WeakMap<
  object,
  { checkedAt: number; ready: boolean }
>();

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

async function hasVoiceMetadataSchema(pool: NonNullable<DbPool>): Promise<boolean> {
  const cached = voiceSchemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;

  try {
    const result = await pool.query(
      `SELECT count(*)::int AS column_count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_messages'
         AND column_name = ANY($1::text[])`,
      [[
        "message_type",
        "audio_duration_ms",
        "audio_content_type",
        "audio_size_bytes",
      ]],
    );
    const ready = Number(result.rows[0]?.column_count) === 4;
    voiceSchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    voiceSchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

async function hasMessageToolsSchema(pool: NonNullable<DbPool>): Promise<boolean> {
  const cached = messageToolsSchemaCache.get(pool);
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
    messageToolsSchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    messageToolsSchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

function voiceCapability(enabled: boolean, reason: string | null) {
  return {
    enabled,
    maxDurationMs: MAX_VOICE_DURATION_MS,
    maxBytes: MAX_VOICE_BYTES,
    reason,
  };
}

function publicPerson(row: {
  user_id: string;
  username: string;
  display_name: string;
}) {
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
  };
}

function publicMessage(row: {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: Date | string;
  delivered_at: Date | string | null;
  read_at: Date | string | null;
  message_type?: string;
  audio_duration_ms?: number | string | null;
  audio_content_type?: string | null;
  forwarded_from_message_id?: string | null;
  reply_to_message_id?: string | null;
  reply_preview_id?: string | null;
  reply_preview_body?: string | null;
  reply_preview_type?: string | null;
  media_filename?: string | null;
  media_content_type?: string | null;
  media_kind?: string | null;
  media_size_bytes?: number | string | null;
  reactions?: Array<{ emoji: string; count: number; reactedByMe: boolean }> | null;
}) {
  const messageType =
    row.message_type === "audio" || row.message_type === "media"
      ? row.message_type
      : "text";
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: new Date(row.created_at).toISOString(),
    deliveredAt: row.delivered_at
      ? new Date(row.delivered_at).toISOString()
      : null,
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
      messageType === "media" && row.media_filename && row.media_content_type
        ? {
            filename: row.media_filename,
            contentType: row.media_content_type,
            kind: row.media_kind ?? "file",
            sizeBytes: Number(row.media_size_bytes ?? 0),
            url: `/api/messenger/conversations/${encodeURIComponent(row.conversation_id)}/messages/${encodeURIComponent(row.id)}/media`,
          }
        : null,
    replyToMessageId: row.reply_to_message_id ?? null,
    replyPreview:
      row.reply_preview_id && row.reply_preview_body != null
        ? {
            id: row.reply_preview_id,
            body: row.reply_preview_body,
            messageType:
              row.reply_preview_type === "audio" || row.reply_preview_type === "media"
                ? row.reply_preview_type
                : "text",
          }
        : null,
    forwarded: Boolean(row.forwarded_from_message_id),
    reactions: Array.isArray(row.reactions) ? row.reactions : [],
  };
}

function publicConversation(
  row: {
    id: string;
    peer_id: string;
    username: string;
    display_name: string;
    last_message: string | null;
    unread_count: string | number;
    updated_at: Date | string;
    is_pinned?: boolean;
    is_muted?: boolean;
    is_archived?: boolean;
  },
) {
  return {
    id: row.id,
    peer: {
      userId: row.peer_id,
      username: row.username,
      displayName: row.display_name,
    },
    lastMessage: row.last_message,
    unreadCount: Number(row.unread_count),
    updatedAt: new Date(row.updated_at).toISOString(),
    isPinned: Boolean(row.is_pinned),
    isMuted: Boolean(row.is_muted),
    isArchived: Boolean(row.is_archived),
  };
}

async function userProfile(pool: NonNullable<DbPool>, userId: string) {
  const result = await pool.query(
    `SELECT user_id, username, display_name, created_at
     FROM messenger_profiles WHERE user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

router.get("/messenger/profile", requireAuth, async (_req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    res.json({ profile: await userProfile(pool, getUserId(res)) });
  } catch (error) {
    next(error);
  }
});

router.put("/messenger/profile", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    const displayName = String(req.body?.displayName ?? "").trim();
    if (!/^[a-z0-9_]{3,30}$/.test(username) || displayName.length < 1 || displayName.length > 60) {
      res.status(400).json({ error: "Check the username and display name" });
      return;
    }
    const userId = getUserId(res);
    try {
      await pool.query(
        `INSERT INTO messenger_profiles (user_id, username, username_lower, display_name)
         VALUES ($1, $2, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET
           username = EXCLUDED.username,
           username_lower = EXCLUDED.username_lower,
           display_name = EXCLUDED.display_name,
           updated_at = now()`,
        [userId, username, displayName],
      );
    } catch (error: unknown) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      ) {
        res.status(409).json({ error: "That username is already in use" });
        return;
      }
      throw error;
    }
    res.json({ profile: await userProfile(pool, userId) });
  } catch (error) {
    next(error);
  }
});

router.get(
  "/messenger/voice-messages/capability",
  requireAuth,
  async (_req, res, next) => {
    try {
      const pool = await loadPool();
      if (!isR2Configured()) {
        res.json(voiceCapability(false, "storage_not_configured"));
        return;
      }
      if (!pool || !(await hasVoiceMetadataSchema(pool))) {
        res.json(voiceCapability(false, "database_update_required"));
        return;
      }
      res.json(voiceCapability(true, null));
    } catch (error) {
      next(error);
    }
  },
);

router.get("/messenger/people", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    const userId = getUserId(res);
    const now = Date.now();
    const window = searchWindows.get(userId);
    if (!window || now >= window.resetAt) {
      searchWindows.set(userId, { count: 1, resetAt: now + 60_000 });
    } else if (window.count >= 20) {
      res.status(429).json({ error: "Please wait before searching again" });
      return;
    } else {
      window.count += 1;
    }

    const query = String(req.query.query ?? "").trim().slice(0, 60);
    if (query.length < 3) {
      res.status(400).json({ error: "Enter at least three characters" });
      return;
    }
    const result = await pool.query(
      `SELECT user_id, username, display_name
       FROM messenger_profiles
       WHERE user_id <> $1
         AND (username_lower LIKE $2 ESCAPE '\\' OR display_name ILIKE $3)
       ORDER BY username_lower
       LIMIT 20`,
      [
        userId,
        `${query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`,
        `%${query.replace(/[%_]/g, "\\$&")}%`,
      ],
    );
    res.json({ people: result.rows.map(publicPerson) });
  } catch (error) {
    next(error);
  }
});

const conversationSelect = `
  SELECT c.id,
         peer.user_id AS peer_id,
         peer.username,
         peer.display_name,
         latest.body AS last_message,
         unread.count AS unread_count,
         COALESCE(latest.created_at, c.updated_at, c.created_at) AS updated_at
  FROM messenger_conversations c
  JOIN messenger_profiles peer
    ON peer.user_id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
  LEFT JOIN LATERAL (
    SELECT body, created_at FROM messenger_messages
    WHERE conversation_id = c.id
    ORDER BY created_at DESC LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS count FROM messenger_messages
    WHERE conversation_id = c.id AND sender_id <> $1 AND read_at IS NULL
  ) unread ON true
  WHERE (c.user_a = $1 OR c.user_b = $1)
`;

router.get("/messenger/conversations", requireAuth, async (_req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    const userId = getUserId(res);
    const toolsReady = await hasMessageToolsSchema(pool);
    const includeArchived = String(_req.query.includeArchived ?? "") === "true";
    const result = await pool.query(
      `${conversationSelect}
       ${toolsReady
         ? `AND ${includeArchived ? "EXISTS" : "NOT EXISTS"} (
              SELECT 1 FROM messenger_conversation_settings settings
              WHERE settings.conversation_id = c.id
                AND settings.user_id = $1 AND settings.is_archived = true
            )`
         : ""}
       ORDER BY updated_at DESC`,
      [userId],
    );
    const conversations = result.rows.map(publicConversation);
    if (toolsReady && conversations.length) {
      const settings = await pool.query(
        `SELECT conversation_id, is_pinned, is_muted, is_archived
         FROM messenger_conversation_settings
         WHERE user_id = $1 AND conversation_id = ANY($2::text[])`,
        [userId, conversations.map((item) => item.id)],
      );
      const byId = new Map(settings.rows.map((row) => [row.conversation_id, row]));
      for (const conversation of conversations) {
        const row = byId.get(conversation.id);
        if (row) {
          conversation.isPinned = Boolean(row.is_pinned);
          conversation.isMuted = Boolean(row.is_muted);
          conversation.isArchived = Boolean(row.is_archived);
        }
      }
      conversations.sort(
        (a, b) =>
          Number(b.isPinned) - Number(a.isPinned) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    }
    res.json({ conversations });
  } catch (error) {
    next(error);
  }
});

router.post("/messenger/conversations", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    const userId = getUserId(res);
    const username = String(req.body?.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      res.status(400).json({ error: "Enter a valid username" });
      return;
    }
    const found = await pool.query(
      `SELECT user_id FROM messenger_profiles WHERE username_lower = $1`,
      [username],
    );
    const peerId = found.rows[0]?.user_id as string | undefined;
    if (!peerId || peerId === userId) {
      res.status(404).json({ error: "Messenger profile not found" });
      return;
    }
    const [userA, userB] = [userId, peerId].sort();
    await pool.query(
      `INSERT INTO messenger_conversations (id, user_a, user_b)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_a, user_b) DO NOTHING`,
      [randomUUID(), userA, userB],
    );
    const result = await pool.query(
      `SELECT c.id,
              peer.user_id AS peer_id,
              peer.username,
              peer.display_name,
              latest.body AS last_message,
              unread.count AS unread_count,
              COALESCE(latest.created_at, c.updated_at, c.created_at) AS updated_at
       FROM messenger_conversations c
       JOIN messenger_profiles peer ON peer.user_id = $1
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM messenger_messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC LIMIT 1
       ) latest ON true
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS count FROM messenger_messages
         WHERE conversation_id = c.id AND sender_id <> $4 AND read_at IS NULL
       ) unread ON true
       WHERE c.user_a = $2 AND c.user_b = $3`,
      [peerId, userA, userB, userId],
    );
    if (!result.rows[0]) {
      res.status(500).json({ error: "Could not open the conversation" });
      return;
    }
    res.json({ conversation: publicConversation(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

async function conversationForUser(
  pool: NonNullable<DbPool>,
  conversationId: string,
  userId: string,
) {
  const result = await pool.query(
    `SELECT id, user_a, user_b FROM messenger_conversations
     WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
    [conversationId, userId],
  );
  return result.rows[0] as
    | { id: string; user_a: string; user_b: string }
    | undefined;
}

router.get(
  "/messenger/conversations/:conversationId/messages",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const userId = getUserId(res);
      const conversation = await conversationForUser(pool, conversationId, userId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50),
      );
      const audioColumns = (await hasVoiceMetadataSchema(pool))
        ? "m.message_type, m.audio_duration_ms"
        : "'text'::text AS message_type, NULL::integer AS audio_duration_ms";
      const toolsReady = await hasMessageToolsSchema(pool);
      const toolsColumns = toolsReady
        ? `, m.reply_to_message_id,
             m.forwarded_from_message_id,
             media.original_filename AS media_filename,
             media.content_type AS media_content_type,
             media.kind AS media_kind,
             media.size_bytes AS media_size_bytes,
             reply.id AS reply_preview_id,
             reply.body AS reply_preview_body,
             reply.message_type AS reply_preview_type,
             COALESCE((
               SELECT json_agg(json_build_object(
                 'emoji', grouped.emoji,
                 'count', grouped.count,
                 'reactedByMe', grouped.reacted_by_me
               ) ORDER BY grouped.emoji)
               FROM (
                 SELECT emoji, count(*)::int AS count,
                        bool_or(user_id = $3) AS reacted_by_me
                 FROM messenger_message_reactions
                 WHERE message_id = m.id
                 GROUP BY emoji
               ) grouped
             ), '[]'::json) AS reactions`
        : `, NULL::text AS reply_to_message_id,
             NULL::text AS forwarded_from_message_id,
             NULL::text AS media_filename,
             NULL::text AS media_content_type,
             NULL::text AS media_kind,
             NULL::integer AS media_size_bytes,
             NULL::text AS reply_preview_id,
             NULL::text AS reply_preview_body,
             NULL::text AS reply_preview_type,
             '[]'::json AS reactions`;
      const toolsJoins = toolsReady
        ? `LEFT JOIN messenger_message_media media ON media.message_id = m.id
           LEFT JOIN messenger_messages reply
             ON reply.id = m.reply_to_message_id
            AND reply.conversation_id = m.conversation_id`
        : "";
      const result = await pool.query(
        `WITH recent AS (
           SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
                  m.delivered_at, m.read_at, ${audioColumns} ${toolsColumns}
           FROM messenger_messages m
           ${toolsJoins}
           WHERE m.conversation_id = $1
           ORDER BY m.created_at DESC
           LIMIT $2
         )
         SELECT * FROM recent ORDER BY created_at ASC`,
        [conversationId, limit, userId],
      );
      await pool.query(
        `UPDATE messenger_messages SET delivered_at = COALESCE(delivered_at, now())
         WHERE conversation_id = $1 AND sender_id <> $2`,
        [conversationId, userId],
      );
      res.json({ messages: result.rows.map(publicMessage) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/conversations/:conversationId/messages",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const userId = getUserId(res);
      const conversation = await conversationForUser(pool, conversationId, userId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      const body = String(req.body?.body ?? "").trim();
      const clientMessageId = String(req.body?.clientMessageId ?? "");
      const replyToMessageId =
        typeof req.body?.replyToMessageId === "string"
          ? req.body.replyToMessageId.trim()
          : "";
      if (!body || body.length > 4000 || clientMessageId.length < 8 || clientMessageId.length > 80) {
        res.status(400).json({ error: "Check the message and try again" });
        return;
      }
      const toolsReady = await hasMessageToolsSchema(pool);
      if (replyToMessageId && !toolsReady) {
        res.status(503).json({ error: "Message tools database update is required" });
        return;
      }
      if (replyToMessageId) {
        const replyTarget = await pool.query(
          `SELECT id FROM messenger_messages
           WHERE id = $1 AND conversation_id = $2`,
          [replyToMessageId, conversationId],
        );
        if (!replyTarget.rows[0]) {
          res.status(404).json({ error: "Reply message not found" });
          return;
        }
      }
      const id = randomUUID();
      const inserted = await pool.query(
        toolsReady
          ? `INSERT INTO messenger_messages
               (id, conversation_id, sender_id, client_message_id, body, reply_to_message_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
             RETURNING id, conversation_id, sender_id, body, created_at,
                       delivered_at, read_at, message_type, reply_to_message_id,
                       forwarded_from_message_id`
          : `INSERT INTO messenger_messages
               (id, conversation_id, sender_id, client_message_id, body)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
             RETURNING id, conversation_id, sender_id, body, created_at, delivered_at, read_at`,
        toolsReady
          ? [id, conversationId, userId, clientMessageId, body, replyToMessageId || null]
          : [id, conversationId, userId, clientMessageId, body],
      );
      let row = inserted.rows[0];
      if (!row) {
        const duplicate = await pool.query(
          `SELECT id, conversation_id, sender_id, body, created_at, delivered_at, read_at,
                  ${toolsReady ? "message_type, reply_to_message_id, forwarded_from_message_id" : "'text'::text AS message_type"}
           FROM messenger_messages
           WHERE conversation_id = $1 AND sender_id = $2 AND client_message_id = $3`,
          [conversationId, userId, clientMessageId],
        );
        row = duplicate.rows[0];
      } else {
        await pool.query(
          `UPDATE messenger_conversations SET updated_at = now() WHERE id = $1`,
          [conversationId],
        );
      }
      if (!row) {
        res.status(500).json({ error: "Could not save the message" });
        return;
      }
      res.status(inserted.rows[0] ? 201 : 200).json({ message: publicMessage(row) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/conversations/:conversationId/audio-messages",
  requireAuth,
  express.raw({
    type: ["audio/mp4", "audio/webm"],
    limit: MAX_VOICE_BYTES,
  }),
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const userId = getUserId(res);
      const conversation = await conversationForUser(pool, conversationId, userId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      if (!isR2Configured()) {
        res.status(503).json({ error: "Voice storage is not configured" });
        return;
      }
      if (!(await hasVoiceMetadataSchema(pool))) {
        res.status(503).json({ error: "Voice message database update is required" });
        return;
      }

      const clientMessageId = String(
        req.header("x-client-message-id") ?? "",
      ).trim();
      const durationMs = Number.parseInt(String(req.query.durationMs ?? ""), 10);
      const contentType = String(req.header("content-type") ?? "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      const body = Buffer.isBuffer(req.body) ? req.body : null;

      if (
        clientMessageId.length < 8 ||
        clientMessageId.length > 80 ||
        !/^[A-Za-z0-9_-]+$/.test(clientMessageId) ||
        !Number.isInteger(durationMs) ||
        durationMs < 1 ||
        durationMs > MAX_VOICE_DURATION_MS ||
        !AUDIO_CONTENT_TYPES.has(contentType) ||
        !body ||
        body.length < 1 ||
        body.length > MAX_VOICE_BYTES
      ) {
        res.status(400).json({ error: "Check the voice message and try again" });
        return;
      }

      const duplicate = await pool.query(
        `SELECT id, conversation_id, sender_id, body, created_at,
                delivered_at, read_at, message_type, audio_duration_ms
         FROM messenger_messages
         WHERE conversation_id = $1 AND sender_id = $2 AND client_message_id = $3`,
        [conversationId, userId, clientMessageId],
      );
      if (duplicate.rows[0]) {
        const row = duplicate.rows[0];
        if (row.message_type !== "audio") {
          res.status(409).json({ error: "This message ID was already used" });
          return;
        }
        await pool.query(
          `UPDATE messenger_conversations SET updated_at = now() WHERE id = $1`,
          [conversationId],
        );
        res.status(200).json({ message: publicMessage(row) });
        return;
      }

      const id = randomUUID();
      const objectKey = voiceObjectKey(conversationId, id, contentType as "audio/mp4" | "audio/webm");
      try {
        await putR2Object(objectKey, body, contentType as "audio/mp4" | "audio/webm");
      } catch (error) {
        await deleteR2Object(objectKey).catch(() => undefined);
        throw error;
      }

      let row;
      try {
        const inserted = await pool.query(
          `INSERT INTO messenger_messages
             (id, conversation_id, sender_id, client_message_id, body,
              attachment_count, message_type, audio_duration_ms,
              audio_content_type, audio_size_bytes)
           VALUES ($1, $2, $3, $4, 'رسالة صوتية', 1, 'audio', $5, $6, $7)
           ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
           RETURNING id, conversation_id, sender_id, body, created_at,
                     delivered_at, read_at, message_type, audio_duration_ms`,
          [id, conversationId, userId, clientMessageId, durationMs, contentType, body.length],
        );
        row = inserted.rows[0];
        if (!row) {
          await deleteR2Object(objectKey).catch(() => undefined);
          const concurrentDuplicate = await pool.query(
            `SELECT id, conversation_id, sender_id, body, created_at,
                    delivered_at, read_at, message_type, audio_duration_ms
             FROM messenger_messages
             WHERE conversation_id = $1 AND sender_id = $2 AND client_message_id = $3`,
            [conversationId, userId, clientMessageId],
          );
          const existing = concurrentDuplicate.rows[0];
          if (existing?.message_type === "audio") {
            await pool.query(
              `UPDATE messenger_conversations SET updated_at = now() WHERE id = $1`,
              [conversationId],
            );
            res.status(200).json({ message: publicMessage(existing) });
            return;
          }
          res.status(409).json({ error: "This message was already sent" });
          return;
        }
      } catch (error) {
        await deleteR2Object(objectKey).catch(() => undefined);
        throw error;
      }

      await pool.query(
        `UPDATE messenger_conversations SET updated_at = now() WHERE id = $1`,
        [conversationId],
      );
      res.status(201).json({ message: publicMessage(row) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/messenger/conversations/:conversationId/messages/:messageId/audio",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const messageId = String(req.params.messageId);
      const userId = getUserId(res);
      const conversation = await conversationForUser(pool, conversationId, userId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      if (!isR2Configured()) {
        res.status(503).json({ error: "Voice storage is not configured" });
        return;
      }
      if (!(await hasVoiceMetadataSchema(pool))) {
        res.status(503).json({ error: "Voice message database update is required" });
        return;
      }

      const result = await pool.query(
        `SELECT id, conversation_id, message_type, audio_content_type
         FROM messenger_messages
         WHERE id = $1 AND conversation_id = $2`,
        [messageId, conversationId],
      );
      const row = result.rows[0];
      if (!row || row.message_type !== "audio" || !AUDIO_CONTENT_TYPES.has(row.audio_content_type)) {
        res.status(404).json({ error: "Voice message not found" });
        return;
      }

      const contentType = row.audio_content_type as "audio/mp4" | "audio/webm";
      const objectKey = voiceObjectKey(conversationId, messageId, contentType);
      const audio = await getR2Object(objectKey);
      if (!audio) {
        res.status(404).json({ error: "Voice message file not found" });
        return;
      }
      res
        .status(200)
        .set({
          "Content-Type": contentType,
          "Content-Length": String(audio.length),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        })
        .send(audio);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/conversations/:conversationId/read",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;
      const userId = getUserId(res);
      const conversationId = String(req.params.conversationId);
      const conversation = await conversationForUser(pool, conversationId, userId);
      if (!conversation) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      await pool.query(
        `UPDATE messenger_messages SET read_at = COALESCE(read_at, now())
         WHERE conversation_id = $1 AND sender_id <> $2`,
        [conversationId, userId],
      );
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
