import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import express, { Router, type IRouter, type RequestHandler } from "express";
import {
  deleteR2Object,
  getR2Object,
  isR2Configured,
  putR2Object,
  voiceObjectKey,
} from "../lib/r2.ts";
import { parseMessageCursor } from "../lib/message-pagination.ts";
import { parseMessengerLocationInput } from "../lib/messenger-location.ts";
import { canDeleteOwnVoiceMessage } from "../lib/messenger-voice-delete.ts";
import {
  readVoicePlayback,
  uploadVoiceObjectAndPersist,
} from "../lib/messenger-voice-storage.ts";
import {
  editOwnTextMessage,
  MESSAGE_DELETED_LABEL,
  messagePublicContent,
  softDeleteOwnMessage,
} from "../lib/messenger-edit-delete.ts";
import {
  hasMessengerPushSchema,
  notifyConversationMessage,
} from "../lib/messenger-web-push.ts";
import {
  consumePeopleSearchQuota,
  hashPhoneForLookup,
  hasPhoneLookupKey,
  normalizePhoneE164,
  phoneProfileFlags,
  PHONE_LOOKUP_SQL,
  publicPhoneMatch,
} from "../lib/phone-discovery.ts";
import {
  displayNameKey,
  DISPLAY_NAME_TAKEN_AR,
  PHONE_TAKEN_AR,
  USERNAME_TAKEN_AR,
} from "../lib/messenger-names.ts";
import {
  buildContactResolveSql,
  contactResolveParams,
  ownedContactNicknameJoin,
  resolveContactMatches,
} from "../lib/contact-nicknames.ts";
import {
  blockedPeerIdsFor,
  canSendDirectMessage,
  filterBlockedPeople,
  hasMessengerBlocksSchema,
  isMessengerUserBlocked,
  requireMessengerBlocksSchema,
  MESSENGER_BLOCKED_SEND_ERROR,
} from "../lib/messenger-blocks.ts";
import {
  deleteMessengerAvatar,
  hasMessengerAvatarSchema,
  isOwnMessengerAvatarKey,
  messengerAvatarContentType,
  messengerAvatarSelect,
  messengerAvatarUrl,
  MAX_MESSENGER_AVATAR_BYTES,
  saveMessengerAvatar,
} from "../lib/messenger-avatars.ts";
import { logger } from "../lib/logger.ts";

type DbPool = Awaited<ReturnType<typeof loadPool>>;

async function loadPool() {
  if (!process.env.ADS_DATABASE_URL) return null;
  const db = await import("@workspace/db");
  return db.pool;
}

const router: IRouter = Router();
const searchWindows = new Map<string, { count: number; resetAt: number }>();
const MAX_VOICE_DURATION_MS = 120_000;

const parseMessengerAvatarBody: RequestHandler = (req, res, next) => {
  const parser = express.raw({
    type: ["image/jpeg", "image/png", "image/webp"],
    limit: MAX_MESSENGER_AVATAR_BYTES,
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
        ? "حجم الصورة لازم يكون 2 ميجا أو أقل"
        : "تعذر قراءة الصورة.",
    });
  });
};
const MAX_VOICE_BYTES = 4 * 1024 * 1024;
const AUDIO_CONTENT_TYPES = new Set(["audio/mp4", "audio/webm"]);
const voiceSchemaCache = new WeakMap<
  object,
  { checkedAt: number; ready: boolean }
>();
const messageEditDeleteSchemaCache = new WeakMap<
  object,
  { checkedAt: number; ready: boolean }
>();
const messageToolsSchemaCache = new WeakMap<
  object,
  { checkedAt: number; ready: boolean }
>();
const phoneDiscoverySchemaCache = new WeakMap<
  object,
  { checkedAt: number; ready: boolean }
>();
const displayNameKeySchemaCache = new WeakMap<
  object,
  { checkedAt: number; ready: boolean }
>();
const contactNicknameSchemaCache = new WeakMap<
  object,
  { checkedAt: number; ready: boolean }
>();
const locationSchemaCache = new WeakMap<
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

function peerUserIdForConversation(
  conversation: { user_a: string; user_b: string },
  userId: string,
): string {
  return conversation.user_a === userId ? conversation.user_b : conversation.user_a;
}

async function requireUnblockedConversation(
  pool: NonNullable<DbPool>,
  conversation: { user_a: string; user_b: string },
  userId: string,
  res: Parameters<RequestHandler>[1],
): Promise<boolean> {
  if (
    await canSendDirectMessage(
      pool,
      userId,
      peerUserIdForConversation(conversation, userId),
    )
  ) return true;
  res.status(403).json({ error: MESSENGER_BLOCKED_SEND_ERROR });
  return false;
}

function getPoolOrUnavailable(pool: DbPool, res: Parameters<RequestHandler>[1]) {
  if (!pool) {
    res.status(503).json({ error: "Messenger storage is not configured" });
    return null;
  }
  return pool;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function uniqueConstraint(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "constraint" in error &&
    typeof error.constraint === "string"
    ? error.constraint
    : "";
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

async function hasMessageEditDeleteSchema(
  pool: NonNullable<DbPool>,
): Promise<boolean> {
  const cached = messageEditDeleteSchemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS column_count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_messages'
         AND column_name = ANY($1::text[])`,
      [["edited_at", "deleted_at"]],
    );
    const ready = Number(result.rows[0]?.column_count) === 2;
    messageEditDeleteSchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    messageEditDeleteSchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
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

async function hasPhoneDiscoverySchema(pool: NonNullable<DbPool>): Promise<boolean> {
  const cached = phoneDiscoverySchemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS column_count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_profiles'
         AND column_name = ANY($1::text[])`,
      [["phone_lookup_hash", "phone_discoverable"]],
    );
    const ready = Number(result.rows[0]?.column_count) === 2;
    phoneDiscoverySchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    phoneDiscoverySchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

async function hasDisplayNameKeySchema(pool: NonNullable<DbPool>): Promise<boolean> {
  const cached = displayNameKeySchemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS column_count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_profiles'
         AND column_name = 'display_name_key'`,
    );
    const ready = Number(result.rows[0]?.column_count) === 1;
    displayNameKeySchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    displayNameKeySchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

async function hasContactNicknameSchema(pool: NonNullable<DbPool>): Promise<boolean> {
  const cached = contactNicknameSchemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS table_count
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_contact_nicknames'`,
    );
    const ready = Number(result.rows[0]?.table_count) === 1;
    contactNicknameSchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    contactNicknameSchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

async function hasLocationSchema(pool: NonNullable<DbPool>): Promise<boolean> {
  const cached = locationSchemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;
  try {
    const result = await pool.query(
      `SELECT count(*)::int AS column_count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'messenger_messages'
         AND column_name = ANY($1::text[])`,
      [[
        "location_lat",
        "location_lng",
        "location_accuracy_m",
        "location_captured_at",
      ]],
    );
    const ready = Number(result.rows[0]?.column_count) === 4;
    locationSchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    locationSchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
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
  nickname?: string | null;
  avatar_object_key?: string | null;
  avatar_updated_at?: Date | string | null;
}) {
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    nickname: row.nickname ?? null,
    avatarUrl: messengerAvatarUrl(
      row.user_id,
      row.avatar_object_key,
      row.avatar_updated_at,
    ),
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
  location_lat?: number | string | null;
  location_lng?: number | string | null;
  location_accuracy_m?: number | string | null;
  location_captured_at?: Date | string | null;
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
  edited_at?: Date | string | null;
  deleted_at?: Date | string | null;
  reply_preview_deleted_at?: Date | string | null;
}) {
  const content = messagePublicContent(row);
  const messageType =
    row.message_type === "audio" ||
    row.message_type === "media" ||
    row.message_type === "location"
      ? row.message_type
      : "text";
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: content.body,
    createdAt: new Date(row.created_at).toISOString(),
    deliveredAt: row.delivered_at
      ? new Date(row.delivered_at).toISOString()
      : null,
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : null,
    deleted: content.deleted,
    messageType,
    audioDurationMs:
      !content.deleted && messageType === "audio" && row.audio_duration_ms != null
        ? Number(row.audio_duration_ms)
        : null,
    audioUrl:
      !content.deleted && messageType === "audio"
        ? `/api/messenger/conversations/${encodeURIComponent(row.conversation_id)}/messages/${encodeURIComponent(row.id)}/audio`
        : null,
    locationLat:
      !content.deleted && messageType === "location" && row.location_lat != null
        ? Number(row.location_lat)
        : null,
    locationLng:
      !content.deleted && messageType === "location" && row.location_lng != null
        ? Number(row.location_lng)
        : null,
    locationAccuracyM:
      !content.deleted && messageType === "location" && row.location_accuracy_m != null
        ? Number(row.location_accuracy_m)
        : null,
    locationCapturedAt:
      !content.deleted && messageType === "location" && row.location_captured_at
        ? new Date(row.location_captured_at).toISOString()
        : null,
    mediaAttachment:
      !content.deleted && messageType === "media" && row.media_filename && row.media_content_type
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
            body: row.reply_preview_deleted_at ? "اتمسحت" : row.reply_preview_body,
            deleted: Boolean(row.reply_preview_deleted_at),
            messageType:
              row.reply_preview_type === "audio" ||
              row.reply_preview_type === "media" ||
              row.reply_preview_type === "location"
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
    nickname?: string | null;
    avatar_object_key?: string | null;
    avatar_updated_at?: Date | string | null;
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
      nickname: row.nickname ?? null,
      avatarUrl: messengerAvatarUrl(
        row.peer_id,
        row.avatar_object_key,
        row.avatar_updated_at,
      ),
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
  const phoneSchemaAvailable = await hasPhoneDiscoverySchema(pool);
  const pushSchemaAvailable = await hasMessengerPushSchema(pool);
  const avatarSchemaAvailable = await hasMessengerAvatarSchema(pool);
  const result = await pool.query(
    `SELECT user_id, username, display_name, created_at,
            ${phoneSchemaAvailable
              ? "phone_lookup_hash, phone_discoverable"
              : "NULL::text AS phone_lookup_hash, false::boolean AS phone_discoverable"},
            ${pushSchemaAvailable ? "push_show_preview" : "false::boolean AS push_show_preview"},
            ${messengerAvatarSelect("messenger_profiles", avatarSchemaAvailable)}
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
    avatarUrl: messengerAvatarUrl(
      row.user_id,
      row.avatar_object_key,
      row.avatar_updated_at,
    ),
    pushShowPreview: Boolean(row.push_show_preview),
    ...phoneProfileFlags(row, phoneSchemaAvailable, hasPhoneLookupKey()),
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

router.put(
  "/messenger/profile/avatar",
  requireAuth,
  parseMessengerAvatarBody,
  async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    if (!(await hasMessengerAvatarSchema(pool))) {
      res.status(503).json({ error: "تحديث قاعدة البيانات مطلوب" });
      return;
    }
    if (!isR2Configured()) {
      res.status(503).json({ error: "تخزين الصور غير متاح حاليًا" });
      return;
    }
    const result = await saveMessengerAvatar(
      pool,
      getUserId(res),
      req.get("content-type"),
      req.body,
      { put: putR2Object, delete: deleteR2Object },
    );
    if (result.status === "migration") {
      res.status(503).json({ error: "تحديث قاعدة البيانات مطلوب" });
      return;
    }
    if (result.status === "not_found") {
      res.status(404).json({ error: "الحساب غير موجود" });
      return;
    }
    if (result.status === "invalid") {
      res.status(400).json({
        error:
          result.reason === "size"
            ? "حجم الصورة لازم يكون 2 ميجا أو أقل"
            : result.reason === "type"
              ? "اختار صورة JPEG أو PNG أو WebP"
              : "ملف الصورة غير صالح",
      });
      return;
    }
    if (result.status !== "saved") return;
    if (result.oldAvatarCleanupFailed) {
      logger.warn({ event: "messenger_avatar_old_object_cleanup_failed" }, "Messenger avatar cleanup failed");
    }
    res.json({ avatarUrl: result.avatarUrl });
  } catch (error) {
    next(error);
  }
  },
);

router.delete("/messenger/profile/avatar", requireAuth, async (_req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    if (!(await hasMessengerAvatarSchema(pool))) {
      res.status(503).json({ error: "تحديث قاعدة البيانات مطلوب" });
      return;
    }
    if (!isR2Configured()) {
      res.status(503).json({ error: "تخزين الصور غير متاح حاليًا" });
      return;
    }
    const result = await deleteMessengerAvatar(
      pool,
      getUserId(res),
      { delete: deleteR2Object },
    );
    if (result === "migration") {
      res.status(503).json({ error: "تحديث قاعدة البيانات مطلوب" });
      return;
    }
    if (result === "not_found") {
      res.status(404).json({ error: "الحساب غير موجود" });
      return;
    }
    res.json({ profile: await userProfile(pool, getUserId(res)) });
  } catch (error) {
    next(error);
  }
});

router.get("/messenger/avatars/:userId", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    if (!(await hasMessengerAvatarSchema(pool))) {
      res.status(503).json({ error: "تحديث قاعدة البيانات مطلوب" });
      return;
    }
    const userId = String(req.params.userId ?? "");
    const viewerId = getUserId(res);
    if (
      viewerId !== userId &&
      (await hasMessengerBlocksSchema(pool)) &&
      (await isMessengerUserBlocked(pool, viewerId, userId))
    ) {
      res.status(404).json({ error: "الصورة غير موجودة" });
      return;
    }
    const result = await pool.query(
      `SELECT avatar_object_key FROM messenger_profiles WHERE user_id = $1`,
      [userId],
    );
    const objectKey = result.rows[0]?.avatar_object_key;
    if (
      typeof objectKey !== "string" ||
      !isOwnMessengerAvatarKey(userId, objectKey)
    ) {
      res.status(404).json({ error: "الصورة غير موجودة" });
      return;
    }
    if (!isR2Configured()) {
      res.status(503).json({ error: "تخزين الصور غير متاح حاليًا" });
      return;
    }
    const contentType = messengerAvatarContentType(objectKey);
    if (!contentType) {
      res.status(404).json({ error: "الصورة غير موجودة" });
      return;
    }
    const bytes = await getR2Object(objectKey);
    if (!bytes) {
      res.status(404).json({ error: "الصورة غير موجودة" });
      return;
    }
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(contentType).send(bytes);
  } catch (error) {
    next(error);
  }
});

router.put("/messenger/profile/phone", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    if (!(await hasPhoneDiscoverySchema(pool))) {
      res.status(503).json({ error: "Phone discovery database migration is required" });
      return;
    }
    if (typeof req.body?.discoverable !== "boolean") {
      res.status(400).json({ error: "Check the phone discovery setting" });
      return;
    }

    const userId = getUserId(res);
    const phoneNumberProvided = Object.hasOwn(req.body ?? {}, "phoneNumber");
    let phoneLookupHash: string | null = null;
    if (phoneNumberProvided && req.body.phoneNumber !== null) {
      if (typeof req.body.phoneNumber !== "string") {
        res.status(400).json({ error: "Enter a valid phone number" });
        return;
      }
      const phoneE164 = normalizePhoneE164(req.body.phoneNumber);
      if (!phoneE164) {
        res.status(400).json({ error: "Enter a valid phone number with its country code" });
        return;
      }
      phoneLookupHash = hashPhoneForLookup(phoneE164);
      if (!phoneLookupHash) {
        res.status(503).json({ error: "Phone discovery configuration is required" });
        return;
      }
      const duplicatePhone = await pool.query(
        `SELECT 1 FROM messenger_profiles
         WHERE phone_lookup_hash = $1 AND user_id <> $2
         LIMIT 1`,
        [phoneLookupHash, userId],
      );
      if (duplicatePhone.rows[0]) {
        res.status(409).json({ error: PHONE_TAKEN_AR, field: "phoneNumber" });
        return;
      }
    }

    if (req.body.discoverable && phoneNumberProvided && !phoneLookupHash) {
      res.status(400).json({ error: "Add a phone number before enabling discovery" });
      return;
    }
    if (req.body.discoverable && !phoneNumberProvided) {
      if (!hasPhoneLookupKey()) {
        res.status(503).json({ error: "Phone discovery lookup key is required" });
        return;
      }
      const currentPhone = await pool.query(
        `SELECT phone_lookup_hash IS NOT NULL AS has_phone
         FROM messenger_profiles WHERE user_id = $1`,
        [userId],
      );
      if (!currentPhone.rows[0]) {
        res.status(404).json({ error: "Complete profile setup first" });
        return;
      }
      if (!currentPhone.rows[0].has_phone) {
        res.status(400).json({ error: "Add a phone number before enabling discovery" });
        return;
      }
    }

    let result;
    try {
      result = phoneNumberProvided
        ? await pool.query(
            `UPDATE messenger_profiles
             SET phone_lookup_hash = $1::text,
                 phone_discoverable = ($2::boolean AND $1::text IS NOT NULL),
                 updated_at = now()
             WHERE user_id = $3
             RETURNING user_id`,
            [phoneLookupHash, req.body.discoverable, userId],
          )
        : await pool.query(
            `UPDATE messenger_profiles
             SET phone_discoverable = ($1 AND phone_lookup_hash IS NOT NULL),
                 updated_at = now()
             WHERE user_id = $2
             RETURNING user_id`,
            [req.body.discoverable, userId],
          );
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: PHONE_TAKEN_AR, field: "phoneNumber" });
        return;
      }
      throw error;
    }
    if (!result.rows[0]) {
      res.status(404).json({ error: "Complete profile setup first" });
      return;
    }
    res.json({ profile: await userProfile(pool, userId) });
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
    const normalizedDisplayName = displayNameKey(displayName);
    if (!normalizedDisplayName) {
      res.status(400).json({
        error: "اكتب اسم عرض يحتوي على حروف أو أرقام",
        field: "displayName",
      });
      return;
    }
    const userId = getUserId(res);
    const displayNameKeyAvailable = await hasDisplayNameKeySchema(pool);
    if (displayNameKeyAvailable) {
      const duplicateDisplayName = await pool.query(
        `SELECT 1 FROM messenger_profiles
         WHERE display_name_key = $1 AND user_id <> $2
         LIMIT 1`,
        [normalizedDisplayName, userId],
      );
      if (duplicateDisplayName.rows[0]) {
        res.status(409).json({ error: DISPLAY_NAME_TAKEN_AR, field: "displayName" });
        return;
      }
    }
    try {
      if (displayNameKeyAvailable) {
        await pool.query(
          `INSERT INTO messenger_profiles
             (user_id, username, username_lower, display_name, display_name_key)
           VALUES ($1, $2, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET
             username = EXCLUDED.username,
             username_lower = EXCLUDED.username_lower,
             display_name = EXCLUDED.display_name,
             display_name_key = EXCLUDED.display_name_key,
             updated_at = now()`,
          [userId, username, displayName, normalizedDisplayName],
        );
      } else {
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
      }
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        const constraint = uniqueConstraint(error);
        if (constraint === "messenger_profiles_display_name_key_uniq") {
          res.status(409).json({ error: DISPLAY_NAME_TAKEN_AR, field: "displayName" });
          return;
        }
        if (constraint === "messenger_profiles_username_lower_key") {
          res.status(409).json({ error: USERNAME_TAKEN_AR, field: "username" });
          return;
        }
        res.status(409).json({ error: USERNAME_TAKEN_AR, field: "username" });
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

router.get(
  "/messenger/location/capability",
  requireAuth,
  async (_req, res, next) => {
    try {
      const pool = await loadPool();
      const enabled = !!pool && await hasLocationSchema(pool);
      res.json({
        enabled,
        reason: enabled ? null : "database_update_required",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put("/messenger/contacts/:peerUserId/nickname", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    if (!(await hasContactNicknameSchema(pool))) {
      res.status(503).json({ error: "Contact nickname database migration is required" });
      return;
    }

    const ownerUserId = getUserId(res);
    const peerUserId = String(req.params.peerUserId ?? "");
    if (peerUserId === ownerUserId) {
      res.status(400).json({ error: "You cannot set a nickname for yourself" });
      return;
    }
    const peer = await pool.query(
      `SELECT 1 FROM messenger_profiles WHERE user_id = $1`,
      [peerUserId],
    );
    if (!peer.rows[0]) {
      res.status(404).json({ error: "Messenger profile not found" });
      return;
    }

    const requestedNickname = req.body?.nickname;
    if (requestedNickname !== null && typeof requestedNickname !== "string") {
      res.status(400).json({ error: "Enter a nickname or null to clear it" });
      return;
    }
    const nickname =
      typeof requestedNickname === "string" ? requestedNickname.trim() : null;
    if (nickname && Array.from(nickname).length > 60) {
      res.status(400).json({ error: "Nickname must be 60 characters or fewer" });
      return;
    }
    const nicknameKey = nickname ? displayNameKey(nickname) : "";
    if (nickname && !nicknameKey) {
      res.status(400).json({ error: "Enter a nickname containing visible characters" });
      return;
    }
    if (!nickname) {
      await pool.query(
        `DELETE FROM messenger_contact_nicknames
         WHERE owner_user_id = $1 AND peer_user_id = $2`,
        [ownerUserId, peerUserId],
      );
      res.json({ nickname: null });
      return;
    }

    await pool.query(
      `INSERT INTO messenger_contact_nicknames
         (owner_user_id, peer_user_id, nickname, nickname_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (owner_user_id, peer_user_id) DO UPDATE SET
         nickname = EXCLUDED.nickname,
         nickname_key = EXCLUDED.nickname_key,
         updated_at = now()`,
      [ownerUserId, peerUserId, nickname, nicknameKey],
    );
    res.json({ nickname });
  } catch (error) {
    next(error);
  }
});

router.get("/messenger/contacts/resolve", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    if (!(await hasContactNicknameSchema(pool))) {
      res.status(503).json({ error: "Contact nickname database migration is required" });
      return;
    }
    const userId = getUserId(res);
    if (!consumePeopleSearchQuota(searchWindows, userId, Date.now())) {
      res.status(429).json({ error: "Please wait before searching again" });
      return;
    }
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (!name || Array.from(name).length > 80) {
      res.status(400).json({ error: "Enter a name of 1 to 80 characters" });
      return;
    }
    const displayNameKeyAvailable = await hasDisplayNameKeySchema(pool);
    const avatarSchemaAvailable = await hasMessengerAvatarSchema(pool);
    const result = await pool.query(
      buildContactResolveSql(displayNameKeyAvailable, avatarSchemaAvailable),
      contactResolveParams(userId, name),
    );
    const candidates = result.rows.map((row) => ({
      userId: String(row.user_id),
      username: String(row.username),
      displayName: String(row.display_name),
      nickname: typeof row.nickname === "string" ? row.nickname : null,
      avatarUrl: messengerAvatarUrl(
        String(row.user_id),
        row.avatar_object_key,
        row.avatar_updated_at,
      ),
    }));
    res.json(resolveContactMatches(candidates, name));
  } catch (error) {
    next(error);
  }
});

router.get("/messenger/blocks", requireAuth, async (_req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool || !(await requireMessengerBlocksSchema(pool, res))) return;
    const result = await pool.query(
      `SELECT profile.user_id, profile.username, profile.display_name, blocks.created_at
       FROM messenger_blocks blocks
       JOIN messenger_profiles profile ON profile.user_id = blocks.blocked_id
       WHERE blocks.blocker_id = $1
       ORDER BY blocks.created_at DESC`,
      [getUserId(res)],
    );
    res.json({
      blockedUsers: result.rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/messenger/blocks", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool || !(await requireMessengerBlocksSchema(pool, res))) return;
    const userId = getUserId(res);
    const blockedId =
      typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
    if (!blockedId || blockedId.length > 255 || blockedId === userId) {
      res.status(400).json({ error: "اختار شخصًا صالحًا للحظر." });
      return;
    }
    const profile = await pool.query(
      `SELECT 1 FROM messenger_profiles WHERE user_id = $1`,
      [blockedId],
    );
    if (!profile.rows[0]) {
      res.status(404).json({ error: "الحساب غير موجود." });
      return;
    }
    await pool.query(
      `INSERT INTO messenger_blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
      [userId, blockedId],
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete("/messenger/blocks/:userId", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool || !(await requireMessengerBlocksSchema(pool, res))) return;
    await pool.query(
      `DELETE FROM messenger_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
      [getUserId(res), String(req.params.userId)],
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get("/messenger/people", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    const userId = getUserId(res);
    if (!consumePeopleSearchQuota(searchWindows, userId, Date.now())) {
      res.status(429).json({ error: "Please wait before searching again" });
      return;
    }

    const query = String(req.query.query ?? "").trim().slice(0, 60);
    if (query.length < 3) {
      res.status(400).json({ error: "Enter at least three characters" });
      return;
    }
    const nicknamesReady = await hasContactNicknameSchema(pool);
    const avatarsReady = await hasMessengerAvatarSchema(pool);
    const result = await pool.query(
      `SELECT peer.user_id, peer.username, peer.display_name,
              ${nicknamesReady ? "n.nickname" : "NULL::text AS nickname"},
              ${messengerAvatarSelect("peer", avatarsReady)}
       FROM messenger_profiles peer
       ${nicknamesReady ? ownedContactNicknameJoin("peer") : ""}
       WHERE peer.user_id <> $1
         AND (peer.username_lower LIKE $2 ESCAPE '\\' OR peer.display_name ILIKE $3)
       ORDER BY peer.username_lower
       LIMIT 20`,
      [
        userId,
        `${query.toLowerCase().replace(/[\\%_]/g, "\\$&")}%`,
        `%${query.replace(/[%_]/g, "\\$&")}%`,
      ],
    );
    const blockedPeerIds = await blockedPeerIdsFor(
      pool,
      userId,
      result.rows.map((row) => String(row.user_id)),
    );
    res.json({
      people: filterBlockedPeople(result.rows, blockedPeerIds).map(publicPerson),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/messenger/people/lookup-by-phone", requireAuth, async (req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    const userId = getUserId(res);
    if (!consumePeopleSearchQuota(searchWindows, userId, Date.now())) {
      res.status(429).json({ error: "Please wait before searching again" });
      return;
    }
    if (!(await hasPhoneDiscoverySchema(pool)) || !hasPhoneLookupKey()) {
      res.status(503).json({ error: "Phone discovery configuration is required" });
      return;
    }
    const rawPhoneNumber =
      typeof req.body?.phoneNumber === "string" ? req.body.phoneNumber.trim() : "";
    const phoneE164 = normalizePhoneE164(rawPhoneNumber);
    if (!phoneE164) {
      res.status(400).json({ error: "Enter a valid phone number with its country code" });
      return;
    }
    const phoneLookupHash = hashPhoneForLookup(phoneE164);
    if (!phoneLookupHash) {
      res.status(503).json({ error: "Phone discovery configuration is required" });
      return;
    }
    const nicknamesReady = await hasContactNicknameSchema(pool);
    const avatarsReady = await hasMessengerAvatarSchema(pool);
    const result = await pool.query(
      nicknamesReady || avatarsReady
        ? `SELECT peer.user_id, peer.username, peer.display_name,
                  ${nicknamesReady ? "n.nickname" : "NULL::text AS nickname"},
                  ${messengerAvatarSelect("peer", avatarsReady)}
           FROM messenger_profiles peer
           ${nicknamesReady ? ownedContactNicknameJoin("peer") : ""}
           WHERE peer.user_id <> $1
             AND peer.phone_lookup_hash = $2
             AND peer.phone_discoverable = true
           ORDER BY peer.username_lower
           LIMIT 20`
        : PHONE_LOOKUP_SQL,
      [userId, phoneLookupHash],
    );
    const blockedPeerIds = await blockedPeerIdsFor(
      pool,
      userId,
      result.rows.map((row) => String(row.user_id)),
    );
    res.json({
      people: filterBlockedPeople(result.rows, blockedPeerIds).map((row) => ({
        ...publicPhoneMatch(row),
        nickname: typeof row.nickname === "string" ? row.nickname : null,
        avatarUrl: messengerAvatarUrl(
          String(row.user_id),
          row.avatar_object_key,
          row.avatar_updated_at,
        ),
      })),
    });
  } catch (error) {
    next(error);
  }
});

function conversationSelect(
  contactNicknamesReady: boolean,
  editDeleteReady: boolean,
  avatarSchemaReady: boolean,
) {
  return `
  SELECT c.id,
         peer.user_id AS peer_id,
         peer.username,
         peer.display_name,
         ${contactNicknamesReady ? "n.nickname" : "NULL::text AS nickname"},
         ${messengerAvatarSelect("peer", avatarSchemaReady)},
          ${editDeleteReady
            ? `CASE WHEN latest.deleted_at IS NOT NULL
                     THEN '${MESSAGE_DELETED_LABEL}' ELSE latest.body END`
            : "latest.body"} AS last_message,
         unread.count AS unread_count,
         COALESCE(latest.created_at, c.updated_at, c.created_at) AS updated_at
  FROM messenger_conversations c
  JOIN messenger_profiles peer
    ON peer.user_id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
  ${contactNicknamesReady ? ownedContactNicknameJoin("peer") : ""}
  LEFT JOIN LATERAL (
     SELECT body, created_at ${editDeleteReady ? ", deleted_at" : ""}
     FROM messenger_messages
    WHERE conversation_id = c.id
    ORDER BY created_at DESC LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS count FROM messenger_messages
    WHERE conversation_id = c.id AND sender_id <> $1 AND read_at IS NULL
  ) unread ON true
  WHERE (c.user_a = $1 OR c.user_b = $1)
`;
}

export async function markConversationListMessagesDelivered(
  pool: NonNullable<DbPool>,
  userId: string,
  conversationIds: string[],
): Promise<void> {
  if (!conversationIds.length) return;
  await pool.query(
    `UPDATE messenger_messages SET delivered_at = now()
     WHERE delivered_at IS NULL AND sender_id <> $1
       AND conversation_id = ANY($2::text[])`,
    [userId, conversationIds],
  );
}

export async function markConversationMessagesRead(
  pool: NonNullable<DbPool>,
  conversationId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `UPDATE messenger_messages
     SET read_at = COALESCE(read_at, now()),
         delivered_at = COALESCE(delivered_at, now())
     WHERE conversation_id = $1 AND sender_id <> $2`,
    [conversationId, userId],
  );
}

router.get("/messenger/conversations", requireAuth, async (_req, res, next) => {
  try {
    const pool = getPoolOrUnavailable(await loadPool(), res);
    if (!pool) return;
    const userId = getUserId(res);
    const toolsReady = await hasMessageToolsSchema(pool);
    const contactNicknamesReady = await hasContactNicknameSchema(pool);
    const editDeleteReady = await hasMessageEditDeleteSchema(pool);
    const avatarSchemaReady = await hasMessengerAvatarSchema(pool);
    const includeArchived = String(_req.query.includeArchived ?? "") === "true";
    const result = await pool.query(
      `${conversationSelect(contactNicknamesReady, editDeleteReady, avatarSchemaReady)}
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
    await markConversationListMessagesDelivered(
      pool,
      userId,
      result.rows.map((row) => String(row.id)),
    );
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
    if (
      (await hasMessengerBlocksSchema(pool)) &&
      (await isMessengerUserBlocked(pool, userId, peerId))
    ) {
      res.status(403).json({ error: MESSENGER_BLOCKED_SEND_ERROR });
      return;
    }
    const [userA, userB] = [userId, peerId].sort();
    await pool.query(
      `INSERT INTO messenger_conversations (id, user_a, user_b)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_a, user_b) DO NOTHING`,
      [randomUUID(), userA, userB],
    );
    const contactNicknamesReady = await hasContactNicknameSchema(pool);
    const editDeleteReady = await hasMessageEditDeleteSchema(pool);
    const avatarSchemaReady = await hasMessengerAvatarSchema(pool);
    const result = await pool.query(
      `SELECT c.id,
              peer.user_id AS peer_id,
              peer.username,
              peer.display_name,
              ${contactNicknamesReady ? "n.nickname" : "NULL::text AS nickname"},
              ${messengerAvatarSelect("peer", avatarSchemaReady)},
              ${editDeleteReady
                ? `CASE WHEN latest.deleted_at IS NOT NULL
                         THEN '${MESSAGE_DELETED_LABEL}' ELSE latest.body END`
                : "latest.body"} AS last_message,
              unread.count AS unread_count,
              COALESCE(latest.created_at, c.updated_at, c.created_at) AS updated_at
       FROM messenger_conversations c
       JOIN messenger_profiles peer ON peer.user_id = $1
       ${contactNicknamesReady ? ownedContactNicknameJoin("peer", "$4") : ""}
       LEFT JOIN LATERAL (
          SELECT body, created_at ${editDeleteReady ? ", deleted_at" : ""}
          FROM messenger_messages
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
      const parsedCursor = parseMessageCursor(req.query.beforeMessageId);
      if (!parsedCursor.valid) {
        res.status(400).json({ error: "Message cursor is invalid" });
        return;
      }
      const limit = Math.min(
        100,
        Math.max(1, Number.parseInt(String(req.query.limit ?? "80"), 10) || 80),
      );
      const beforeMessageId = parsedCursor.cursor?.id ?? null;
      if (beforeMessageId) {
        const cursorExists = await pool.query(
          `SELECT 1 FROM messenger_messages
           WHERE id = $1 AND conversation_id = $2`,
          [beforeMessageId, conversationId],
        );
        if (!cursorExists.rows[0]) {
          res.status(400).json({ error: "Message cursor is invalid" });
          return;
        }
      }
      const audioColumns = (await hasVoiceMetadataSchema(pool))
        ? "m.message_type, m.audio_duration_ms"
        : "'text'::text AS message_type, NULL::integer AS audio_duration_ms";
      const editDeleteReady = await hasMessageEditDeleteSchema(pool);
      const editDeleteColumns = editDeleteReady
        ? ", m.edited_at, m.deleted_at"
        : ", NULL::timestamptz AS edited_at, NULL::timestamptz AS deleted_at";
      const locationColumns = (await hasLocationSchema(pool))
        ? `, m.location_lat, m.location_lng,
             m.location_accuracy_m, m.location_captured_at`
        : `, NULL::double precision AS location_lat,
             NULL::double precision AS location_lng,
             NULL::integer AS location_accuracy_m,
             NULL::timestamptz AS location_captured_at`;
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
              ${editDeleteReady
                ? "reply.deleted_at AS reply_preview_deleted_at"
                : "NULL::timestamptz AS reply_preview_deleted_at"},
             COALESCE((
               SELECT json_agg(json_build_object(
                 'emoji', grouped.emoji,
                 'count', grouped.count,
                 'reactedByMe', grouped.reacted_by_me
               ) ORDER BY grouped.emoji)
               FROM (
                 SELECT emoji, count(*)::int AS count,
                         bool_or(user_id = $4) AS reacted_by_me
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
              NULL::timestamptz AS reply_preview_deleted_at,
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
                    m.delivered_at, m.read_at, ${audioColumns} ${locationColumns}
                    ${editDeleteColumns} ${toolsColumns}
           FROM messenger_messages m
           ${toolsJoins}
           WHERE m.conversation_id = $1
              AND ($3::text IS NULL OR EXISTS (
                SELECT 1 FROM messenger_messages cursor
                WHERE cursor.id = $3 AND cursor.conversation_id = m.conversation_id
                  AND (m.created_at < cursor.created_at
                       OR (m.created_at = cursor.created_at AND m.id < cursor.id))
              ))
            ORDER BY m.created_at DESC, m.id DESC
           LIMIT $2
         )
          SELECT * FROM recent ORDER BY created_at ASC, id ASC`,
        [conversationId, limit, beforeMessageId, userId],
      );
      const fetchedMessageIds = result.rows
        .map((message) => message.id)
        .filter((id): id is string => typeof id === "string");
      if (fetchedMessageIds.length > 0) {
        await pool.query(
          `UPDATE messenger_messages SET delivered_at = COALESCE(delivered_at, now())
           WHERE id = ANY($1::text[]) AND conversation_id = $2 AND sender_id <> $3`,
          [fetchedMessageIds, conversationId, userId],
        );
      }
      res.json({ messages: result.rows.map(publicMessage) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/messenger/conversations/:conversationId/messages/:messageId",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const messageId = String(req.params.messageId);
      const userId = getUserId(res);
      if (!(await conversationForUser(pool, conversationId, userId))) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      if (!(await hasMessageEditDeleteSchema(pool))) {
        res.status(503).json({ error: "تحديث قاعدة البيانات مطلوب" });
        return;
      }
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (!body || body.length > 4000) {
        res.status(400).json({ error: "اكتب رسالة من 1 إلى 4000 حرف." });
        return;
      }
      const result = await editOwnTextMessage(pool, {
        conversationId,
        messageId,
        userId,
        body,
      });
      if (result.status === "not_found") {
        res.status(404).json({ error: "الرسالة مش موجودة." });
        return;
      }
      if (result.status === "not_owner") {
        res.status(403).json({ error: "مينفعش تعدّل رسالة شخص تاني." });
        return;
      }
      if (result.status === "not_editable") {
        res.status(409).json({ error: "تعديل الرسائل النصية فقط، ومش ممكن تعدّل رسالة اتمسحت." });
        return;
      }
      if (result.status === "expired") {
        res.status(409).json({ error: "عدّى 15 دقيقة على الرسالة ومابقاش ممكن تعديلها." });
        return;
      }
      res.json({ message: publicMessage(result.row as Parameters<typeof publicMessage>[0]) });
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
      if (!(await requireUnblockedConversation(pool, conversation, userId, res))) return;
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
      const editDeleteReady = await hasMessageEditDeleteSchema(pool);
      const editDeleteFields = editDeleteReady
        ? ", edited_at, deleted_at"
        : ", NULL::timestamptz AS edited_at, NULL::timestamptz AS deleted_at";
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
                        forwarded_from_message_id ${editDeleteFields}`
          : `INSERT INTO messenger_messages
               (id, conversation_id, sender_id, client_message_id, body)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
              RETURNING id, conversation_id, sender_id, body, created_at, delivered_at, read_at
                        ${editDeleteFields}`,
        toolsReady
          ? [id, conversationId, userId, clientMessageId, body, replyToMessageId || null]
          : [id, conversationId, userId, clientMessageId, body],
      );
      let row = inserted.rows[0];
      if (!row) {
        const duplicate = await pool.query(
          `SELECT id, conversation_id, sender_id, body, created_at, delivered_at, read_at,
                  ${toolsReady ? "message_type, reply_to_message_id, forwarded_from_message_id" : "'text'::text AS message_type"}
                  ${editDeleteFields}
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
      if (inserted.rows[0]) {
        void notifyConversationMessage(pool, {
          conversationId,
          senderId: userId,
          messageType: "text",
          body,
        });
      }
      res.status(inserted.rows[0] ? 201 : 200).json({ message: publicMessage(row) });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/conversations/:conversationId/location",
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
      if (!(await requireUnblockedConversation(pool, conversation, userId, res))) return;
      if (!(await hasLocationSchema(pool))) {
        res.status(503).json({ error: "Location message database update is required" });
        return;
      }
      const editDeleteReady = await hasMessageEditDeleteSchema(pool);
      const editDeleteFields = editDeleteReady
        ? ", edited_at, deleted_at"
        : ", NULL::timestamptz AS edited_at, NULL::timestamptz AS deleted_at";

      const parsed = parseMessengerLocationInput(req.body);
      if (!parsed.valid) {
        res.status(400).json({ error: "Check the location and try again" });
        return;
      }
      const { lat, lng, accuracyM, capturedAt, clientMessageId } = parsed.value;
      const id = randomUUID();
      const inserted = await pool.query(
        `INSERT INTO messenger_messages
           (id, conversation_id, sender_id, client_message_id, body,
            message_type, attachment_count, location_lat, location_lng,
            location_accuracy_m, location_captured_at)
         VALUES ($1, $2, $3, $4, '📍 الموقع', 'location', 0, $5, $6, $7, $8)
         ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
         RETURNING id, conversation_id, sender_id, body, created_at,
                   delivered_at, read_at, message_type, location_lat, location_lng,
                    location_accuracy_m, location_captured_at ${editDeleteFields}`,
        [
          id,
          conversationId,
          userId,
          clientMessageId,
          lat,
          lng,
          accuracyM,
          capturedAt,
        ],
      );
      let row = inserted.rows[0];
      if (!row) {
        const duplicate = await pool.query(
          `SELECT id, conversation_id, sender_id, body, created_at, delivered_at,
                  read_at, message_type, location_lat, location_lng,
                   location_accuracy_m, location_captured_at ${editDeleteFields}
           FROM messenger_messages
           WHERE conversation_id = $1 AND sender_id = $2 AND client_message_id = $3`,
          [conversationId, userId, clientMessageId],
        );
        row = duplicate.rows[0];
        if (row?.message_type !== "location") {
          res.status(409).json({ error: "This message ID was already used" });
          return;
        }
      } else {
        await pool.query(
          `UPDATE messenger_conversations SET updated_at = now() WHERE id = $1`,
          [conversationId],
        );
      }
      if (!row) {
        res.status(500).json({ error: "Could not save the location" });
        return;
      }
      if (inserted.rows[0]) {
        void notifyConversationMessage(pool, {
          conversationId,
          senderId: userId,
          messageType: "location",
          body: "",
        });
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
      if (!(await requireUnblockedConversation(pool, conversation, userId, res))) return;
      if (!isR2Configured()) {
        res.status(503).json({ error: "Voice storage is not configured" });
        return;
      }
      if (!(await hasVoiceMetadataSchema(pool))) {
        res.status(503).json({ error: "Voice message database update is required" });
        return;
      }
      const editDeleteReady = await hasMessageEditDeleteSchema(pool);
      const editDeleteFields = editDeleteReady
        ? ", edited_at, deleted_at"
        : ", NULL::timestamptz AS edited_at, NULL::timestamptz AS deleted_at";

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
                delivered_at, read_at, message_type, audio_duration_ms ${editDeleteFields}
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
      let row;
      const upload = await uploadVoiceObjectAndPersist({
        objectKey,
        body,
        contentType: contentType as "audio/mp4" | "audio/webm",
        store: { put: putR2Object, delete: deleteR2Object },
        persist: async () => {
          const inserted = await pool.query(
            `INSERT INTO messenger_messages
               (id, conversation_id, sender_id, client_message_id, body,
                attachment_count, message_type, audio_duration_ms,
                audio_content_type, audio_size_bytes)
             VALUES ($1, $2, $3, $4, 'رسالة صوتية', 1, 'audio', $5, $6, $7)
             ON CONFLICT (conversation_id, sender_id, client_message_id) DO NOTHING
             RETURNING id, conversation_id, sender_id, body, created_at,
                        delivered_at, read_at, message_type, audio_duration_ms ${editDeleteFields}`,
            [id, conversationId, userId, clientMessageId, durationMs, contentType, body.length],
          );
          return inserted.rows[0] ?? null;
        },
      });
      row = upload.row;
      if (!row) {
        const concurrentDuplicate = await pool.query(
          `SELECT id, conversation_id, sender_id, body, created_at,
                   delivered_at, read_at, message_type, audio_duration_ms ${editDeleteFields}
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

      await pool.query(
        `UPDATE messenger_conversations SET updated_at = now() WHERE id = $1`,
        [conversationId],
      );
      void notifyConversationMessage(pool, {
        conversationId,
        senderId: userId,
        messageType: "audio",
        body: "",
      });
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

      const editDeleteReady = await hasMessageEditDeleteSchema(pool);
      const result = await pool.query(
        `SELECT id, conversation_id, message_type, audio_content_type
         FROM messenger_messages
         WHERE id = $1 AND conversation_id = $2
           ${editDeleteReady ? "AND deleted_at IS NULL" : ""}`,
        [messageId, conversationId],
      );
      const row = result.rows[0] ?? null;
      const playback = await readVoicePlayback(
        row,
        (contentType) => voiceObjectKey(conversationId, messageId, contentType),
        { get: getR2Object },
      );
      if (playback.kind === "invalid-message") {
        res.status(404).json({ error: "Voice message not found" });
        return;
      }
      if (playback.kind === "file-missing") {
        res.status(404).json({ error: "Voice message file not found" });
        return;
      }
      res
        .status(200)
        .set({
          "Content-Type": playback.contentType,
          "Content-Length": String(playback.audio.length),
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        })
        .send(playback.audio);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/messenger/conversations/:conversationId/messages/:messageId",
  requireAuth,
  async (req, res, next) => {
    try {
      const pool = getPoolOrUnavailable(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const messageId = String(req.params.messageId);
      const userId = getUserId(res);
      if (!(await conversationForUser(pool, conversationId, userId))) {
        res.status(404).json({ error: "Conversation not found" });
        return;
      }
      if (!(await hasVoiceMetadataSchema(pool))) {
        res.status(503).json({ error: "Voice message database update is required" });
        return;
      }

      const editDeleteReady = await hasMessageEditDeleteSchema(pool);
      const result = await pool.query(
        `SELECT sender_id, message_type, audio_content_type
                ${editDeleteReady ? ", deleted_at" : ""}
         FROM messenger_messages
         WHERE id = $1 AND conversation_id = $2`,
        [messageId, conversationId],
      );
      const message = result.rows[0];
      // A successful retry after a lost response is harmless.
      if (!message) {
        res.json({ ok: true });
        return;
      }
      if (message.sender_id !== userId) {
        res.status(403).json({ error: "مينفعش تمسح رسالة شخص تاني." });
        return;
      }

      if (!editDeleteReady) {
        if (!canDeleteOwnVoiceMessage(message, userId)) {
          res.status(503).json({ error: "تحديث قاعدة البيانات مطلوب" });
          return;
        }
        if (!isR2Configured()) {
          res.status(503).json({ error: "Voice storage is not configured" });
          return;
        }
        const contentType = message.audio_content_type as "audio/mp4" | "audio/webm";
        await deleteR2Object(voiceObjectKey(conversationId, messageId, contentType));
        await pool.query(
          `DELETE FROM messenger_messages
           WHERE id = $1 AND conversation_id = $2 AND sender_id = $3
             AND message_type = 'audio'`,
          [messageId, conversationId, userId],
        );
        await pool.query(
          "UPDATE messenger_conversations SET updated_at = now() WHERE id = $1",
          [conversationId],
        );
        res.json({ ok: true });
        return;
      }

      const toolsReady = await hasMessageToolsSchema(pool);
      if (message.message_type === "media" && !toolsReady) {
        res.status(503).json({ error: "تحديث قاعدة البيانات مطلوب" });
        return;
      }
      const softDelete = await softDeleteOwnMessage(pool, {
        conversationId,
        messageId,
        userId,
        hasMediaTable: toolsReady,
        prepare: async (candidate) => {
          if (candidate.message_type === "audio" || candidate.message_type === "media") {
            if (!isR2Configured()) {
              throw new Error(
                candidate.message_type === "audio"
                  ? "Voice storage is not configured"
                  : "Private media storage is not configured",
              );
            }
          }
          if (candidate.message_type === "audio") {
            const contentType = candidate.audio_content_type;
            if (contentType === "audio/mp4" || contentType === "audio/webm") {
              await deleteR2Object(voiceObjectKey(conversationId, messageId, contentType));
            }
          } else if (candidate.message_type === "media") {
            const media = await pool.query<{ object_key: string }>(
              `SELECT object_key FROM messenger_message_media WHERE message_id = $1`,
              [messageId],
            );
            for (const item of media.rows) {
              await deleteR2Object(item.object_key);
            }
          }
        },
        cleanup: async () => {},
      });
      if (softDelete.status === "not_owner") {
        res.status(403).json({ error: "مينفعش تمسح رسالة شخص تاني." });
        return;
      }
      if (softDelete.status === "not_found") {
        res.status(404).json({ error: "الرسالة مش موجودة." });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Voice storage is not configured") {
        res.status(503).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.message === "Private media storage is not configured") {
        res.status(503).json({ error: error.message });
        return;
      }
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
      await markConversationMessagesRead(pool, conversationId, userId);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
