import { randomUUID } from "node:crypto";
import type { Response } from "express";
import { parseMessengerLocationInput } from "./messenger-location.ts";

export const LIVE_LOCATION_MIGRATION_ERROR = "تحديث قاعدة البيانات مطلوب";
export const LIVE_LOCATION_BLOCKED_ERROR = "مش ممكن تبعت للشخص ده";
export const LIVE_LOCATION_DURATIONS = [15, 60, 480] as const;
export const LIVE_LOCATION_MIN_UPDATE_MS = 10_000;

export type LiveLocationPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
  connect: () => Promise<{
    query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
    release: () => void;
  }>;
};

const schemaCache = new WeakMap<object, { checkedAt: number; ready: boolean }>();

export async function hasLiveLocationSchema(pool: LiveLocationPool): Promise<boolean> {
  const cached = schemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS table_count
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_live_locations'`,
    );
    const ready = Number(result.rows[0]?.table_count) === 1;
    schemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    schemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

export async function requireLiveLocationSchema(
  pool: LiveLocationPool,
  res: Pick<Response, "status" | "json">,
): Promise<boolean> {
  if (await hasLiveLocationSchema(pool)) return true;
  res.status(503).json({ error: LIVE_LOCATION_MIGRATION_ERROR });
  return false;
}

export function isAllowedLiveLocationDuration(value: unknown): value is 15 | 60 | 480 {
  return value === 15 || value === 60 || value === 480;
}

export function parseLiveLocationPoint(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const parsed = parseMessengerLocationInput({
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM ?? null,
    capturedAt: new Date().toISOString(),
    clientMessageId: `live-${randomUUID()}`,
  });
  return parsed.valid
    ? {
        lat: parsed.value.lat,
        lng: parsed.value.lng,
        accuracyM: parsed.value.accuracyM,
      }
    : null;
}

export async function startLiveLocation(
  pool: LiveLocationPool,
  input: {
    id: string;
    conversationId: string;
    sharerId: string;
    durationMinutes: 15 | 60 | 480;
    lat: number;
    lng: number;
    accuracyM: number | null;
  },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT id FROM messenger_conversations WHERE id = $1 FOR UPDATE`,
      [input.conversationId],
    );
    await client.query(
      `UPDATE messenger_live_locations
       SET stopped_at = now(), last_lat = NULL, last_lng = NULL,
           last_accuracy_m = NULL, last_updated_at = now()
       WHERE conversation_id = $1 AND sharer_id = $2 AND stopped_at IS NULL`,
      [input.conversationId, input.sharerId],
    );
    const inserted = await client.query(
      `INSERT INTO messenger_live_locations
         (id, conversation_id, sharer_id, started_at, expires_at,
          last_lat, last_lng, last_accuracy_m, last_updated_at)
       VALUES ($1, $2, $3, now(), now() + ($4::int * interval '1 minute'),
               $5, $6, $7, now())
       RETURNING id, conversation_id, sharer_id, started_at, expires_at,
                 last_lat, last_lng, last_accuracy_m, last_updated_at`,
      [
        input.id,
        input.conversationId,
        input.sharerId,
        input.durationMinutes,
        input.lat,
        input.lng,
        input.accuracyM,
      ],
    );
    const profile = await client.query(
      `SELECT display_name FROM messenger_profiles WHERE user_id = $1`,
      [input.sharerId],
    );
    await client.query("COMMIT");
    return {
      ...inserted.rows[0],
      sharer_name: profile.rows[0]?.display_name ?? "",
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateLiveLocation(
  pool: LiveLocationPool,
  input: {
    conversationId: string;
    requesterId: string;
    lat: number;
    lng: number;
    accuracyM: number | null;
  },
): Promise<{ status: 200 | 403 | 409 | 429; updatedAt?: Date | string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query(
      `SELECT id, sharer_id, expires_at, last_updated_at,
              expires_at <= now() AS expired,
              last_updated_at > now() - interval '10 seconds' AS too_soon
       FROM messenger_live_locations
       WHERE conversation_id = $1 AND sharer_id = $2 AND stopped_at IS NULL
       ORDER BY started_at DESC LIMIT 1 FOR UPDATE`,
      [input.conversationId, input.requesterId],
    );
    const location = selected.rows[0];
    if (!location) {
      await client.query("ROLLBACK");
      const otherActive = await pool.query(
        `SELECT 1 FROM messenger_live_locations
         WHERE conversation_id = $1 AND stopped_at IS NULL AND expires_at > now()
         LIMIT 1`,
        [input.conversationId],
      );
      return { status: otherActive.rows.length ? 403 : 409 };
    }
    if (location.sharer_id !== input.requesterId) {
      await client.query("ROLLBACK");
      return { status: 403 };
    }
    if (location.expired) {
      await client.query(
        `UPDATE messenger_live_locations
         SET last_lat = NULL, last_lng = NULL, last_accuracy_m = NULL
         WHERE id = $1`,
        [location.id],
      );
      await client.query("COMMIT");
      return { status: 409 };
    }
    if (location.too_soon) {
      await client.query("ROLLBACK");
      return { status: 429 };
    }
    const updated = await client.query(
      `UPDATE messenger_live_locations
       SET last_lat = $2, last_lng = $3, last_accuracy_m = $4,
           last_updated_at = now()
       WHERE id = $1
       RETURNING last_updated_at`,
      [location.id, input.lat, input.lng, input.accuracyM],
    );
    await client.query("COMMIT");
    return { status: 200, updatedAt: updated.rows[0]?.last_updated_at };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function stopLiveLocation(
  pool: LiveLocationPool,
  conversationId: string,
  requesterId: string,
): Promise<{ stopped: boolean; forbidden: boolean }> {
  const result = await pool.query(
    `UPDATE messenger_live_locations
     SET stopped_at = now(), last_lat = NULL, last_lng = NULL,
         last_accuracy_m = NULL, last_updated_at = now()
     WHERE conversation_id = $1 AND sharer_id = $2 AND stopped_at IS NULL
     RETURNING id`,
    [conversationId, requesterId],
  );
  if (result.rows.length) return { stopped: true, forbidden: false };
  const active = await pool.query(
    `SELECT sharer_id FROM messenger_live_locations
     WHERE conversation_id = $1 AND stopped_at IS NULL AND expires_at > now()
     LIMIT 1`,
    [conversationId],
  );
  return {
    stopped: false,
    forbidden: active.rows.length > 0 && active.rows[0].sharer_id !== requesterId,
  };
}

export async function stopLiveLocationsForConversation(
  pool: LiveLocationPool,
  conversationId: string,
): Promise<void> {
  await pool.query(
    `UPDATE messenger_live_locations
     SET stopped_at = now(), last_lat = NULL, last_lng = NULL,
         last_accuracy_m = NULL, last_updated_at = now()
     WHERE conversation_id = $1 AND stopped_at IS NULL`,
    [conversationId],
  );
}

export async function stopLiveLocationsBetweenUsers(
  pool: LiveLocationPool,
  firstUserId: string,
  secondUserId: string,
): Promise<void> {
  await pool.query(
    `UPDATE messenger_live_locations live
     SET stopped_at = now(), last_lat = NULL, last_lng = NULL,
         last_accuracy_m = NULL, last_updated_at = now()
     WHERE live.stopped_at IS NULL
       AND live.conversation_id IN (
         SELECT id FROM messenger_conversations
         WHERE (user_a = $1 AND user_b = $2)
            OR (user_a = $2 AND user_b = $1)
       )`,
    [firstUserId, secondUserId],
  );
}

export async function listLiveLocations(
  pool: LiveLocationPool,
  conversationId: string,
  requesterId: string,
) {
  await pool.query(
    `UPDATE messenger_live_locations
     SET last_lat = NULL, last_lng = NULL, last_accuracy_m = NULL
     WHERE conversation_id = $1 AND expires_at <= now()
       AND (last_lat IS NOT NULL OR last_lng IS NOT NULL OR last_accuracy_m IS NOT NULL)`,
    [conversationId],
  );
  const result = await pool.query(
    `SELECT live.sharer_id, profile.display_name AS sharer_name,
            live.expires_at, live.last_lat, live.last_lng,
            live.last_accuracy_m, live.last_updated_at
     FROM messenger_live_locations live
     JOIN messenger_profiles profile ON profile.user_id = live.sharer_id
     WHERE live.conversation_id = $1 AND live.stopped_at IS NULL
       AND live.expires_at > now()
       AND live.last_lat IS NOT NULL AND live.last_lng IS NOT NULL
     ORDER BY live.started_at DESC`,
    [conversationId],
  );
  return result.rows.map((row) => ({
    sharerId: row.sharer_id,
    sharerName: row.sharer_name,
    expiresAt: new Date(row.expires_at).toISOString(),
    lat: Number(row.last_lat),
    lng: Number(row.last_lng),
    accuracyM: row.last_accuracy_m == null ? null : Number(row.last_accuracy_m),
    updatedAt: row.last_updated_at ? new Date(row.last_updated_at).toISOString() : null,
    isMine: row.sharer_id === requesterId,
  }));
}
