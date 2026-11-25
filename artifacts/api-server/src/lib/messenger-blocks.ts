import type { Response } from "express";

export type MessengerBlocksPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export const MESSENGER_BLOCKS_MIGRATION_ERROR = "تحديث قاعدة البيانات مطلوب";
export const MESSENGER_BLOCKED_SEND_ERROR = "مش ممكن تبعت للشخص ده";

const schemaCache = new WeakMap<object, { checkedAt: number; ready: boolean }>();

export async function hasMessengerBlocksSchema(
  pool: MessengerBlocksPool,
): Promise<boolean> {
  const cached = schemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;

  try {
    const result = await pool.query(
      `SELECT count(*)::int AS table_count
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_blocks'`,
    );
    const ready = Number(result.rows[0]?.table_count) === 1;
    schemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    schemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

export async function requireMessengerBlocksSchema(
  pool: MessengerBlocksPool,
  res: Pick<Response, "status" | "json">,
): Promise<boolean> {
  if (await hasMessengerBlocksSchema(pool)) return true;
  res.status(503).json({ error: MESSENGER_BLOCKS_MIGRATION_ERROR });
  return false;
}

export async function isMessengerUserBlocked(
  pool: MessengerBlocksPool,
  firstUserId: string,
  secondUserId: string,
): Promise<boolean> {
  if (firstUserId === secondUserId) return false;
  const result = await pool.query(
    `SELECT 1 FROM messenger_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [firstUserId, secondUserId],
  );
  return result.rows.length > 0;
}

export async function canSendDirectMessage(
  pool: MessengerBlocksPool,
  senderId: string,
  recipientId: string,
): Promise<boolean> {
  if (!(await hasMessengerBlocksSchema(pool))) return true;
  return !(await isMessengerUserBlocked(pool, senderId, recipientId));
}

export async function blockedPeerIdsFor(
  pool: MessengerBlocksPool,
  userId: string,
  candidateUserIds: string[],
): Promise<Set<string>> {
  if (!candidateUserIds.length || !(await hasMessengerBlocksSchema(pool))) {
    return new Set();
  }
  const result = await pool.query(
    `SELECT CASE WHEN blocker_id = $1 THEN blocked_id ELSE blocker_id END AS peer_id
     FROM messenger_blocks
     WHERE (blocker_id = $1 AND blocked_id = ANY($2::text[]))
        OR (blocked_id = $1 AND blocker_id = ANY($2::text[]))`,
    [userId, candidateUserIds],
  );
  return new Set(result.rows.map((row) => String(row.peer_id)));
}

export function filterBlockedPeople<T extends { user_id: string }>(
  people: T[],
  blockedPeerIds: Set<string>,
): T[] {
  return people.filter((person) => !blockedPeerIds.has(person.user_id));
}

export function filterBlockedPushRecipients<T extends { user_id: string }>(
  recipients: T[],
  blockedPeerIds: Set<string>,
): T[] {
  return recipients.filter((recipient) => !blockedPeerIds.has(recipient.user_id));
}
