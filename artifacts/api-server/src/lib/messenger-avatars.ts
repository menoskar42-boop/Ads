import { randomUUID } from "node:crypto";

export const MESSENGER_AVATAR_MIGRATION_ERROR = "تحديث قاعدة البيانات مطلوب";
export const MAX_MESSENGER_AVATAR_BYTES = 2 * 1024 * 1024;

const allowedContentTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const schemaCache = new WeakMap<object, { checkedAt: number; ready: boolean }>();

export type MessengerAvatarPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
};

export type MessengerAvatarStorage = {
  put: (key: string, body: Buffer, contentType: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
};

export function parseMessengerAvatarInput(
  contentType: unknown,
  input: unknown,
):
  | { ok: true; contentType: string; bytes: Buffer }
  | { ok: false; reason: "type" | "size" | "data" } {
  if (
    typeof contentType !== "string" ||
    !allowedContentTypes.has(contentType.split(";", 1)[0].trim().toLowerCase())
  ) {
    return { ok: false, reason: "type" };
  }
  const normalizedType = (contentType as string).split(";", 1)[0].trim().toLowerCase();
  if (!Buffer.isBuffer(input)) return { ok: false, reason: "data" };
  const bytes = input;
  if (bytes.length > MAX_MESSENGER_AVATAR_BYTES) {
    return { ok: false, reason: "size" };
  }
  const signatureMatches =
    (normalizedType === "image/jpeg" &&
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff) ||
    (normalizedType === "image/png" &&
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (normalizedType === "image/webp" &&
      bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP");
  if (!signatureMatches) return { ok: false, reason: "data" };
  return { ok: true, contentType: normalizedType, bytes };
}

export async function hasMessengerAvatarSchema(
  pool: MessengerAvatarPool,
): Promise<boolean> {
  const cached = schemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS column_count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_profiles'
         AND column_name = ANY($1::text[])`,
      [["avatar_object_key", "avatar_updated_at"]],
    );
    const ready = Number(result.rows[0]?.column_count) === 2;
    schemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    schemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

export function messengerAvatarSelect(alias: string, ready: boolean): string {
  return ready
    ? `${alias}.avatar_object_key, ${alias}.avatar_updated_at`
    : "NULL::text AS avatar_object_key, NULL::timestamptz AS avatar_updated_at";
}

export function messengerAvatarUrl(
  userId: string,
  objectKey: string | null | undefined,
  updatedAt: Date | string | null | undefined,
): string | null {
  if (!objectKey) return null;
  const version = updatedAt ? new Date(updatedAt).getTime() : 0;
  return `/api/messenger/avatars/${encodeURIComponent(userId)}?v=${version}`;
}

export function messengerAvatarContentType(objectKey: string): string | null {
  if (objectKey.endsWith(".jpg") || objectKey.endsWith(".jpeg")) return "image/jpeg";
  if (objectKey.endsWith(".png")) return "image/png";
  if (objectKey.endsWith(".webp")) return "image/webp";
  return null;
}

export function isOwnMessengerAvatarKey(userId: string, objectKey: string): boolean {
  return objectKey.startsWith(
    `oscar-messenger/avatars/${encodeURIComponent(userId)}/`,
  );
}

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function saveMessengerAvatar(
  pool: MessengerAvatarPool,
  userId: string,
  contentType: unknown,
  body: unknown,
  storage: MessengerAvatarStorage,
): Promise<
  | { status: "migration" | "not_found" }
  | { status: "invalid"; reason: "type" | "size" | "data" }
  | { status: "saved"; avatarUrl: string; oldAvatarCleanupFailed: boolean }
> {
  if (!(await hasMessengerAvatarSchema(pool))) return { status: "migration" };
  const parsed = parseMessengerAvatarInput(contentType, body);
  if (!parsed.ok) return { status: "invalid", reason: parsed.reason };

  const current = await pool.query(
    `SELECT avatar_object_key FROM messenger_profiles WHERE user_id = $1`,
    [userId],
  );
  if (!current.rows[0]) return { status: "not_found" };

  const oldKey =
    typeof current.rows[0].avatar_object_key === "string"
      ? current.rows[0].avatar_object_key
      : null;
  const objectKey =
    `oscar-messenger/avatars/${encodeURIComponent(userId)}/` +
    `${randomUUID()}.${extensionFor(parsed.contentType)}`;
  await storage.put(objectKey, parsed.bytes, parsed.contentType);
  let updated;
  try {
    updated = await pool.query(
      `UPDATE messenger_profiles
       SET avatar_object_key = $2, avatar_updated_at = now(), updated_at = now()
       WHERE user_id = $1
       RETURNING avatar_updated_at`,
      [userId, objectKey],
    );
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    throw error;
  }
  if (!updated.rows[0]) {
    await storage.delete(objectKey).catch(() => undefined);
    return { status: "not_found" };
  }

  let oldAvatarCleanupFailed = false;
  if (oldKey && oldKey !== objectKey) {
    try {
      if (!isOwnMessengerAvatarKey(userId, oldKey)) {
        oldAvatarCleanupFailed = true;
      } else {
        await storage.delete(oldKey);
      }
    } catch {
      oldAvatarCleanupFailed = true;
    }
  }
  return {
    status: "saved",
    avatarUrl: messengerAvatarUrl(
      userId,
      objectKey,
      updated.rows[0].avatar_updated_at,
    )!,
    oldAvatarCleanupFailed,
  };
}

export async function deleteMessengerAvatar(
  pool: MessengerAvatarPool,
  userId: string,
  storage: Pick<MessengerAvatarStorage, "delete">,
): Promise<"migration" | "not_found" | "deleted"> {
  if (!(await hasMessengerAvatarSchema(pool))) return "migration";
  const current = await pool.query(
    `SELECT avatar_object_key FROM messenger_profiles WHERE user_id = $1`,
    [userId],
  );
  if (!current.rows[0]) return "not_found";
  const objectKey =
    typeof current.rows[0].avatar_object_key === "string"
      ? current.rows[0].avatar_object_key
      : null;
  if (objectKey) {
    if (!isOwnMessengerAvatarKey(userId, objectKey)) return "not_found";
    await storage.delete(objectKey);
  }
  const cleared = await pool.query(
    `UPDATE messenger_profiles
     SET avatar_object_key = NULL, avatar_updated_at = NULL, updated_at = now()
     WHERE user_id = $1
     RETURNING user_id`,
    [userId],
  );
  return cleared.rows[0] ? "deleted" : "not_found";
}
