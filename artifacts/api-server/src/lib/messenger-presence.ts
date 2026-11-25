import { hasMessengerBlocksSchema } from "./messenger-blocks.ts";

export type MessengerPresencePool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export type MessengerPresence = {
  online: boolean;
  lastSeenAt: string | null;
};

export const PRESENCE_MIGRATION_ERROR = "تحديث قاعدة البيانات مطلوب";
export const PRESENCE_TOUCH_INTERVAL_MS = 60_000;
export const PRESENCE_ONLINE_WINDOW_MS = 75_000;
export const TYPING_TTL_MS = 6_000;
export const TYPING_THROTTLE_MS = 3_000;

const schemaCache = new WeakMap<object, { checkedAt: number; ready: boolean }>();
const lastTouchAt = new Map<string, number>();
const typingExpiresAt = new Map<string, number>();
const lastTypingAt = new Map<string, number>();

function typingKey(conversationId: string, userId: string): string {
  return `${conversationId}:${userId}`;
}

function pruneTyping(nowMs: number): void {
  for (const [key, expiresAt] of typingExpiresAt) {
    if (expiresAt <= nowMs) {
      typingExpiresAt.delete(key);
      lastTypingAt.delete(key);
    }
  }
  for (const [userId, touchedAt] of lastTouchAt) {
    if (nowMs - touchedAt >= PRESENCE_TOUCH_INTERVAL_MS) {
      lastTouchAt.delete(userId);
    }
  }
}

const typingCleanup = setInterval(() => pruneTyping(Date.now()), 30_000);
typingCleanup.unref?.();

export async function hasPresenceSchema(
  pool: MessengerPresencePool,
): Promise<boolean> {
  const cached = schemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;

  try {
    const result = await pool.query(
      `SELECT count(*)::int AS column_count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_profiles'
         AND column_name IN ('last_seen_at', 'presence_visible')`,
    );
    const ready = Number(result.rows[0]?.column_count) === 2;
    schemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    schemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

export async function touchLastSeen(
  pool: MessengerPresencePool,
  userId: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const lastAttempt = lastTouchAt.get(userId);
  if (lastAttempt !== undefined && nowMs - lastAttempt < PRESENCE_TOUCH_INTERVAL_MS) {
    return false;
  }
  lastTouchAt.set(userId, nowMs);
  if (!(await hasPresenceSchema(pool))) return false;

  await pool.query(
    `UPDATE messenger_profiles
     SET last_seen_at = now()
     WHERE user_id = $1
       AND (last_seen_at IS NULL OR last_seen_at < now() - interval '60 seconds')`,
    [userId],
  );
  return true;
}

export async function presenceFor(
  pool: MessengerPresencePool,
  viewerId: string,
  peer: string | Record<string, unknown>,
  nowMs = Date.now(),
): Promise<MessengerPresence | null> {
  if (!(await hasPresenceSchema(pool))) return null;

  let row: Record<string, unknown>;
  if (
    typeof peer === "object" &&
    peer !== null &&
    "viewer_presence_visible" in peer &&
    "peer_presence_visible" in peer
  ) {
    row = peer;
    if (String(peer.peer_id ?? "") === viewerId) return null;
  } else {
    const peerId = typeof peer === "string" ? peer : String(peer.peer_id ?? "");
    if (!peerId || peerId === viewerId) return null;
    const blocksReady = await hasMessengerBlocksSchema(pool);
    const blockedExpr = blocksReady
      ? `EXISTS (
           SELECT 1 FROM messenger_blocks
           WHERE (blocker_id = $1 AND blocked_id = $2)
              OR (blocker_id = $2 AND blocked_id = $1)
         )`
      : "false";
    const result = await pool.query(
      `SELECT viewer.presence_visible AS viewer_presence_visible,
              other.presence_visible AS peer_presence_visible,
              other.last_seen_at AS peer_last_seen_at,
              ${blockedExpr} AS presence_blocked
       FROM messenger_profiles viewer
       JOIN messenger_profiles other ON other.user_id = $2
       WHERE viewer.user_id = $1`,
      [viewerId, peerId],
    );
    if (!result.rows[0]) return null;
    row = result.rows[0];
  }

  if (
    row.viewer_presence_visible !== true ||
    row.peer_presence_visible !== true ||
    row.presence_blocked === true
  ) {
    return null;
  }

  const value = row.peer_last_seen_at;
  const lastSeen = value == null
    ? null
    : value instanceof Date
      ? new Date(value.getTime())
      : new Date(value as string | number);
  const lastSeenMs = lastSeen && Number.isFinite(lastSeen.getTime())
    ? lastSeen.getTime()
    : null;

  return {
    online: lastSeenMs !== null && nowMs - lastSeenMs < PRESENCE_ONLINE_WINDOW_MS,
    lastSeenAt: lastSeenMs === null ? null : lastSeen!.toISOString(),
  };
}

export function recordTyping(
  conversationId: string,
  userId: string,
  nowMs = Date.now(),
): boolean {
  pruneTyping(nowMs);
  const key = typingKey(conversationId, userId);
  const lastSent = lastTypingAt.get(key);
  if (lastSent !== undefined && nowMs - lastSent < TYPING_THROTTLE_MS) {
    return false;
  }
  lastTypingAt.set(key, nowMs);
  typingExpiresAt.set(key, nowMs + TYPING_TTL_MS);
  return true;
}

export function isTyping(
  conversationId: string,
  userId: string,
  nowMs = Date.now(),
): boolean {
  pruneTyping(nowMs);
  const expiresAt = typingExpiresAt.get(typingKey(conversationId, userId));
  return expiresAt !== undefined && expiresAt > nowMs;
}

export async function canUserSharePresence(
  pool: MessengerPresencePool,
  userId: string,
): Promise<boolean> {
  if (!(await hasPresenceSchema(pool))) return false;
  const result = await pool.query(
    "SELECT presence_visible FROM messenger_profiles WHERE user_id = $1",
    [userId],
  );
  return result.rows[0]?.presence_visible === true;
}
