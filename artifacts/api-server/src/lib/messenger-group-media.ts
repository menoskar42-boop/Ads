import { randomUUID } from "node:crypto";
import type { Response } from "express";
import {
  MAX_MESSENGER_MEDIA_BYTES,
  mediaSizeIsAllowed,
  messengerMediaKind,
  normalizeMessengerMediaType,
  sanitizeMessengerFilename,
  type MessengerMediaType,
} from "./messenger-media-policy.ts";
import {
  groupMediaObjectKey,
  groupVoiceObjectKey,
} from "./r2.ts";
import {
  readVoicePlayback,
  uploadVoiceObjectAndPersist,
} from "./messenger-voice-storage.ts";

export const GROUP_AUDIO_MAX_BYTES = 4 * 1024 * 1024;
export const GROUP_AUDIO_MAX_DURATION_MS = 120_000;
export const GROUP_MEDIA_MIGRATION_ERROR = "تحديث قاعدة البيانات مطلوب";

export type GroupMediaPool = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
  connect: () => Promise<{
    query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }>;
    release: () => void;
  }>;
};

export type GroupMediaStore = {
  put: (key: string, body: Buffer, contentType: string) => Promise<void>;
  get: (key: string) => Promise<Buffer | null>;
  delete: (key: string) => Promise<void>;
};

export type GroupMessageRow = {
  id: string;
  group_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: Date | string;
  message_type?: string | null;
  audio_duration_ms?: number | string | null;
  audio_content_type?: string | null;
  original_filename?: string | null;
  content_type?: string | null;
  kind?: string | null;
  size_bytes?: number | string | null;
};

const groupMediaSchemaCache = new WeakMap<object, { checkedAt: number; ready: boolean }>();

export async function hasGroupMediaSchema(pool: GroupMediaPool): Promise<boolean> {
  const cached = groupMediaSchemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'messenger_group_message_media') AS table_count,
         (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'messenger_group_messages'
            AND column_name = ANY($1::text[])) AS column_count`,
      [["message_type", "audio_duration_ms", "audio_content_type", "audio_size_bytes"]],
    );
    const ready =
      Number(result.rows[0]?.table_count) === 1 &&
      Number(result.rows[0]?.column_count) === 4;
    groupMediaSchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    groupMediaSchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

export async function requireGroupMediaSchema(
  pool: GroupMediaPool,
  res: Pick<Response, "status" | "json">,
): Promise<boolean> {
  if (await hasGroupMediaSchema(pool)) return true;
  res.status(503).json({ error: GROUP_MEDIA_MIGRATION_ERROR });
  return false;
}

export function groupAudioContentType(value: string): "audio/mp4" | "audio/webm" | null {
  const normalized = value.split(";", 1)[0]?.trim().toLowerCase();
  return normalized === "audio/mp4" || normalized === "audio/webm" ? normalized : null;
}

export function validateGroupAudioUpload(input: {
  contentType: string;
  clientMessageId: string;
  durationMs: number;
  body: Buffer | null;
}): string | null {
  const contentType = groupAudioContentType(input.contentType);
  if (
    !contentType ||
    !/^[A-Za-z0-9_-]{8,80}$/.test(input.clientMessageId) ||
    !Number.isInteger(input.durationMs) ||
    input.durationMs < 1 ||
    input.durationMs > GROUP_AUDIO_MAX_DURATION_MS ||
    !input.body ||
    input.body.length < 1 ||
    input.body.length > GROUP_AUDIO_MAX_BYTES
  ) {
    return "تحقق من التسجيل الصوتي ومدته وحجمه ثم حاول مرة أخرى.";
  }
  return null;
}

export function hasMessengerMediaSignature(
  contentType: MessengerMediaType,
  body: Buffer,
): boolean {
  if (contentType === "image/jpeg") {
    return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  }
  if (contentType === "image/png") {
    return body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (contentType === "image/webp") {
    return body.length >= 12 &&
      body.toString("ascii", 0, 4) === "RIFF" &&
      body.toString("ascii", 8, 12) === "WEBP";
  }
  if (contentType === "video/mp4") {
    return body.length >= 12 && body.toString("ascii", 4, 8) === "ftyp";
  }
  if (contentType === "video/webm") {
    return body.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  }
  if (contentType === "application/pdf") {
    return body.subarray(0, 5).toString("ascii") === "%PDF-";
  }
  if (body.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(body);
    return true;
  } catch {
    return false;
  }
}

export function validateGroupMediaUpload(input: {
  contentType: string;
  clientMessageId: string;
  filename: string;
  body: Buffer | null;
}):
  | {
      contentType: MessengerMediaType;
      clientMessageId: string;
      filename: string;
      kind: "image" | "video" | "file";
      body: Buffer;
    }
  | { error: string } {
  const contentType = normalizeMessengerMediaType(input.contentType);
  const filename = sanitizeMessengerFilename(input.filename);
  if (
    !contentType ||
    !/^[A-Za-z0-9_-]{8,80}$/.test(input.clientMessageId) ||
    !input.body ||
    !mediaSizeIsAllowed(input.body.length) ||
    input.body.length > MAX_MESSENGER_MEDIA_BYTES ||
    !hasMessengerMediaSignature(contentType, input.body)
  ) {
    return { error: "تحقق من نوع الملف وحجمه ومحتواه ثم حاول مرة أخرى." };
  }
  return {
    contentType,
    clientMessageId: input.clientMessageId,
    filename,
    kind: messengerMediaKind(contentType),
    body: input.body,
  };
}

export function publicGroupMessage(row: GroupMessageRow, includeMedia = false) {
  const messageType = row.message_type === "audio" || row.message_type === "media"
    ? row.message_type
    : "text";
  const publicMessage = {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
  };
  if (!includeMedia) return publicMessage;
  const groupId = encodeURIComponent(row.group_id);
  const messageId = encodeURIComponent(row.id);
  return {
    ...publicMessage,
    messageType,
    audioDurationMs:
      messageType === "audio" && row.audio_duration_ms != null
        ? Number(row.audio_duration_ms)
        : null,
    audioUrl:
      messageType === "audio"
        ? `/api/messenger/groups/${groupId}/messages/${messageId}/audio`
        : null,
    mediaAttachment:
      messageType === "media" && row.original_filename && row.content_type
        ? {
            filename: row.original_filename,
            contentType: row.content_type,
            kind: row.kind ?? "file",
            sizeBytes: Number(row.size_bytes ?? 0),
            url: `/api/messenger/groups/${groupId}/messages/${messageId}/media`,
          }
        : null,
  };
}

export function groupMessagePreview(
  messageType: string | null | undefined,
  kind: string | null | undefined,
  body: string,
): string {
  if (messageType === "audio") return "رسالة صوتية";
  if (messageType === "media") {
    if (kind === "image") return "صورة";
    if (kind === "video") return "فيديو";
    return "ملف";
  }
  return body;
}

type GroupPersistResult = { row: any | null; notMember: boolean };

async function persistGroupMessage(
  pool: GroupMediaPool,
  input: {
    groupId: string;
    userId: string;
    clientMessageId: string;
    messageId: string;
    body: string;
    messageType: "audio" | "media";
    durationMs?: number;
    contentType: string;
    sizeBytes: number;
    filename?: string;
    kind?: string;
    objectKey?: string;
  },
): Promise<GroupPersistResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const group = await client.query(
      `SELECT id FROM messenger_groups WHERE id = $1 FOR SHARE`,
      [input.groupId],
    );
    const member = group.rows[0]
      ? await client.query(
          `SELECT 1 FROM messenger_group_members WHERE group_id = $1 AND user_id = $2`,
          [input.groupId, input.userId],
        )
      : { rows: [] };
    if (!member.rows.length) {
      await client.query("ROLLBACK");
      return { row: null, notMember: true };
    }
    const inserted = await client.query(
      `INSERT INTO messenger_group_messages
         (id, group_id, sender_id, client_message_id, body, message_type,
          audio_duration_ms, audio_content_type, audio_size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (group_id, sender_id, client_message_id) DO NOTHING
       RETURNING id, group_id, sender_id, body, created_at, message_type,
                 audio_duration_ms, audio_content_type`,
      [
        input.messageId,
        input.groupId,
        input.userId,
        input.clientMessageId,
        input.body,
        input.messageType,
        input.durationMs ?? null,
        input.messageType === "audio" ? input.contentType : null,
        input.messageType === "audio" ? input.sizeBytes : null,
      ],
    );
    const row = inserted.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { row: null, notMember: false };
    }
    if (input.messageType === "media") {
      await client.query(
        `INSERT INTO messenger_group_message_media
           (message_id, object_key, original_filename, content_type, kind, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.messageId,
          input.objectKey,
          input.filename,
          input.contentType,
          input.kind,
          input.sizeBytes,
        ],
      );
      Object.assign(row, {
        original_filename: input.filename,
        content_type: input.contentType,
        kind: input.kind,
        size_bytes: input.sizeBytes,
      });
    }
    await client.query(
      "UPDATE messenger_groups SET updated_at = now() WHERE id = $1",
      [input.groupId],
    );
    await client.query("COMMIT");
    return { row, notMember: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function existingGroupMessage(
  pool: GroupMediaPool,
  groupId: string,
  userId: string,
  clientMessageId: string,
) {
  const result = await pool.query(
    `SELECT message.id, message.group_id, message.sender_id, profile.display_name AS sender_name,
            message.body, message.created_at, message.message_type,
            message.audio_duration_ms, message.audio_content_type,
            media.original_filename, media.content_type, media.kind, media.size_bytes
     FROM messenger_group_messages message
     JOIN messenger_profiles profile ON profile.user_id = message.sender_id
     LEFT JOIN messenger_group_message_media media ON media.message_id = message.id
     WHERE message.group_id = $1 AND message.sender_id = $2
       AND message.client_message_id = $3`,
    [groupId, userId, clientMessageId],
  );
  return result.rows[0] ?? null;
}

async function isGroupMember(
  pool: GroupMediaPool,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM messenger_group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId],
  );
  return result.rows.length > 0;
}

export async function uploadGroupAudioMessage(input: {
  pool: GroupMediaPool;
  store: GroupMediaStore;
  storageReady?: boolean;
  groupId: string;
  userId: string;
  clientMessageId: string;
  durationMs: number;
  contentType: string;
  body: Buffer | null;
}): Promise<{ status: number; error?: string; message?: unknown; created?: boolean }> {
  if (!(await hasGroupMediaSchema(input.pool))) {
    return { status: 503, error: GROUP_MEDIA_MIGRATION_ERROR };
  }
  const validationError = validateGroupAudioUpload(input);
  if (validationError) return { status: 400, error: validationError };
  if (!(await isGroupMember(input.pool, input.groupId, input.userId))) {
    return { status: 404, error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." };
  }
  if (input.storageReady === false) {
    return { status: 503, error: "التخزين الخاص للوسائط غير متاح حاليًا." };
  }
  const contentType = groupAudioContentType(input.contentType)!;
  const body = input.body!;
  const existing = await existingGroupMessage(
    input.pool,
    input.groupId,
    input.userId,
    input.clientMessageId,
  );
  if (existing) {
    if (existing.message_type !== "audio") {
      return { status: 409, error: "معرّف الرسالة استُخدم من قبل." };
    }
    return { status: 200, message: publicGroupMessage(existing, true), created: false };
  }

  const messageId = randomUUID();
  const objectKey = groupVoiceObjectKey(input.groupId, messageId, contentType);
  const upload = await uploadVoiceObjectAndPersist({
    objectKey,
    body,
    contentType,
    store: input.store,
    persist: async () => {
      const saved = await persistGroupMessage(input.pool, {
        groupId: input.groupId,
        userId: input.userId,
        clientMessageId: input.clientMessageId,
        messageId,
        body: "رسالة صوتية",
        messageType: "audio",
        durationMs: input.durationMs,
        contentType,
        sizeBytes: body.length,
      });
      return saved.notMember ? null : saved.row;
    },
  });
  if (upload.row) {
    const sender = await input.pool.query(
      `SELECT display_name FROM messenger_profiles WHERE user_id = $1`,
      [input.userId],
    );
    const message = publicGroupMessage({
      ...upload.row,
      sender_name: sender.rows[0]?.display_name ?? "",
    }, true);
    return { status: 201, message, created: true };
  }
  if (!(await isGroupMember(input.pool, input.groupId, input.userId))) {
    return { status: 404, error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." };
  }
  const duplicate = await existingGroupMessage(
    input.pool,
    input.groupId,
    input.userId,
    input.clientMessageId,
  );
  if (duplicate?.message_type === "audio") {
    return { status: 200, message: publicGroupMessage(duplicate, true), created: false };
  }
  return { status: 409, error: "تعذر حفظ الرسالة. حاول مرة أخرى." };
}

export async function uploadGroupMediaMessage(input: {
  pool: GroupMediaPool;
  store: GroupMediaStore;
  storageReady?: boolean;
  groupId: string;
  userId: string;
  clientMessageId: string;
  contentType: string;
  filename: string;
  body: Buffer | null;
}): Promise<{ status: number; error?: string; message?: unknown; created?: boolean }> {
  if (!(await hasGroupMediaSchema(input.pool))) {
    return { status: 503, error: GROUP_MEDIA_MIGRATION_ERROR };
  }
  const validation = validateGroupMediaUpload(input);
  if ("error" in validation) return { status: 400, error: validation.error };
  if (!(await isGroupMember(input.pool, input.groupId, input.userId))) {
    return { status: 404, error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." };
  }
  if (input.storageReady === false) {
    return { status: 503, error: "التخزين الخاص للوسائط غير متاح حاليًا." };
  }
  const existing = await existingGroupMessage(
    input.pool,
    input.groupId,
    input.userId,
    input.clientMessageId,
  );
  if (existing) {
    if (existing.message_type !== "media") {
      return { status: 409, error: "معرّف الرسالة استُخدم من قبل." };
    }
    return { status: 200, message: publicGroupMessage(existing, true), created: false };
  }

  const messageId = randomUUID();
  const objectKey = groupMediaObjectKey(input.groupId, messageId, validation.contentType);
  let stored = false;
  let committed = false;
  try {
    await input.store.put(objectKey, validation.body, validation.contentType);
    stored = true;
    const saved = await persistGroupMessage(input.pool, {
      groupId: input.groupId,
      userId: input.userId,
      clientMessageId: input.clientMessageId,
      messageId,
      body: groupMessagePreview("media", validation.kind, ""),
      messageType: "media",
      contentType: validation.contentType,
      sizeBytes: validation.body.length,
      filename: validation.filename,
      kind: validation.kind,
      objectKey,
    });
    if (saved.row) {
      committed = true;
      const sender = await input.pool.query(
        `SELECT display_name FROM messenger_profiles WHERE user_id = $1`,
        [input.userId],
      );
      return {
        status: 201,
        message: publicGroupMessage({
          ...saved.row,
          sender_name: sender.rows[0]?.display_name ?? "",
        }, true),
        created: true,
      };
    }
    if (saved.notMember) {
      return { status: 404, error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." };
    }
  } finally {
    if (stored && !committed) await input.store.delete(objectKey).catch(() => undefined);
  }
  if (!(await isGroupMember(input.pool, input.groupId, input.userId))) {
    return { status: 404, error: "المجموعة غير موجودة أو لم تعد عضوًا فيها." };
  }
  const duplicate = await existingGroupMessage(
    input.pool,
    input.groupId,
    input.userId,
    input.clientMessageId,
  );
  if (duplicate?.message_type === "media") {
    return { status: 200, message: publicGroupMessage(duplicate, true), created: false };
  }
  return { status: 409, error: "تعذر حفظ الرسالة. حاول مرة أخرى." };
}

export async function readGroupMessageObject(input: {
  pool: GroupMediaPool;
  store: Pick<GroupMediaStore, "get">;
  storageReady?: boolean;
  groupId: string;
  userId: string;
  messageId: string;
  messageType: "audio" | "media";
}): Promise<
  | { status: 503 | 404; error: string }
  | {
      status: 200;
      body: Buffer;
      contentType: string;
      filename: string | null;
      kind: string | null;
    }
> {
  if (!(await hasGroupMediaSchema(input.pool))) {
    return { status: 503, error: GROUP_MEDIA_MIGRATION_ERROR };
  }
  if (!(await isGroupMember(input.pool, input.groupId, input.userId))) {
    return { status: 404, error: "الرسالة غير موجودة." };
  }
  if (input.storageReady === false) {
    return { status: 503, error: "التخزين الخاص للوسائط غير متاح حاليًا." };
  }
  if (input.messageType === "audio") {
    const result = await input.pool.query(
      `SELECT message_type, audio_content_type
       FROM messenger_group_messages
       WHERE id = $1 AND group_id = $2 AND message_type = 'audio'`,
      [input.messageId, input.groupId],
    );
    const row = result.rows[0] ?? null;
    const playback = await readVoicePlayback(
      row,
      (contentType) => groupVoiceObjectKey(input.groupId, input.messageId, contentType),
      input.store,
    );
    if (playback.kind !== "ready") return { status: 404, error: "الرسالة الصوتية غير متاحة." };
    return {
      status: 200,
      body: playback.audio,
      contentType: playback.contentType,
      filename: null,
      kind: null,
    };
  }
  const result = await input.pool.query(
    `SELECT media.object_key, media.original_filename, media.content_type, media.kind
     FROM messenger_group_messages message
     JOIN messenger_group_message_media media ON media.message_id = message.id
     WHERE message.id = $1 AND message.group_id = $2 AND message.message_type = 'media'`,
    [input.messageId, input.groupId],
  );
  const metadata = result.rows[0];
  if (!metadata || !normalizeMessengerMediaType(String(metadata.content_type ?? ""))) {
    return { status: 404, error: "المرفق غير متاح." };
  }
  const body = await input.store.get(metadata.object_key);
  if (!body) return { status: 404, error: "ملف المرفق غير متاح." };
  return {
    status: 200,
    body,
    contentType: metadata.content_type,
    filename: metadata.original_filename,
    kind: metadata.kind,
  };
}
