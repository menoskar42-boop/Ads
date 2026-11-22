import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { Router, type IRouter, type RequestHandler } from "express";

type DbPool = Awaited<ReturnType<typeof loadPool>>;

async function loadPool() {
  if (!process.env.DATABASE_URL) return null;
  const db = await import("@workspace/db");
  return db.pool;
}

const router: IRouter = Router();
const searchWindows = new Map<string, { count: number; resetAt: number }>();

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
}) {
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
  WHERE c.user_a = $1 OR c.user_b = $1
`;

router.get("/messenger/conversations", requireAuth, async (_req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    const result = await pool.query(
      `${conversationSelect} ORDER BY updated_at DESC`,
      [getUserId(res)],
    );
    res.json({ conversations: result.rows.map(publicConversation) });
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
      const result = await pool.query(
        `WITH recent AS (
           SELECT id, conversation_id, sender_id, body, created_at, delivered_at, read_at
           FROM messenger_messages
           WHERE conversation_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         )
         SELECT * FROM recent ORDER BY created_at ASC`,
        [conversationId, limit],
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
      if (!body || body.length > 4000 || clientMessageId.length < 8 || clientMessageId.length > 80) {
        res.status(400).json({ error: "Check the message and try again" });
        return;
      }
      const id = randomUUID();
      const inserted = await pool.query(
        `INSERT INTO messenger_messages
           (id, conversation_id, sender_id, client_message_id, body)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
         RETURNING id, conversation_id, sender_id, body, created_at, delivered_at, read_at`,
        [id, conversationId, userId, clientMessageId, body],
      );
      let row = inserted.rows[0];
      if (!row) {
        const duplicate = await pool.query(
          `SELECT id, conversation_id, sender_id, body, created_at, delivered_at, read_at
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
