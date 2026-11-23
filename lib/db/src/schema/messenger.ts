import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const messengerProfiles = pgTable(
  "messenger_profiles",
  {
    userId: text("user_id").primaryKey(),
    username: text("username").notNull(),
    usernameLower: text("username_lower").notNull(),
    displayName: text("display_name").notNull(),
    displayNameKey: text("display_name_key"),
    phoneLookupHash: text("phone_lookup_hash"),
    phoneDiscoverable: boolean("phone_discoverable").notNull().default(false),
    pushShowPreview: boolean("push_show_preview").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("messenger_profiles_username_lower_key").on(table.usernameLower),
    uniqueIndex("messenger_profiles_display_name_key_uniq")
      .on(table.displayNameKey)
      .where(sql`${table.displayNameKey} IS NOT NULL`),
    uniqueIndex("messenger_profiles_phone_lookup_hash_uniq")
      .on(table.phoneLookupHash)
      .where(sql`${table.phoneLookupHash} IS NOT NULL`),
    check(
      "messenger_profiles_phone_lookup_hash_check",
      sql`${table.phoneLookupHash} IS NULL OR ${table.phoneLookupHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "messenger_profiles_phone_discoverable_check",
      sql`NOT ${table.phoneDiscoverable} OR ${table.phoneLookupHash} IS NOT NULL`,
    ),
    index("messenger_profiles_phone_discoverable_idx")
      .on(table.phoneLookupHash)
      .where(sql`${table.phoneDiscoverable} = true AND ${table.phoneLookupHash} IS NOT NULL`),
  ],
);

export const messengerPushSubscriptions = pgTable(
  "messenger_push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  },
  (table) => [index("messenger_push_subscriptions_user_idx").on(table.userId)],
);

export const messengerConversations = pgTable(
  "messenger_conversations",
  {
    id: text("id").primaryKey(),
    userA: text("user_a")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    userB: text("user_b")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("messenger_conversations_pair_key").on(table.userA, table.userB),
    index("messenger_conversations_user_a_idx").on(table.userA, table.updatedAt),
    index("messenger_conversations_user_b_idx").on(table.userB, table.updatedAt),
  ],
);

export const messengerMessages = pgTable(
  "messenger_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => messengerConversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    clientMessageId: text("client_message_id").notNull(),
    body: text("body").notNull(),
    messageType: text("message_type").notNull().default("text"),
    audioDurationMs: integer("audio_duration_ms"),
    audioContentType: text("audio_content_type"),
    audioSizeBytes: integer("audio_size_bytes"),
    locationLat: doublePrecision("location_lat"),
    locationLng: doublePrecision("location_lng"),
    locationAccuracyM: integer("location_accuracy_m"),
    locationCapturedAt: timestamp("location_captured_at", { withTimezone: true }),
    replyToMessageId: text("reply_to_message_id"),
    forwardedFromMessageId: text("forwarded_from_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    attachmentCount: integer("attachment_count").notNull().default(0),
  },
  (table) => [
    unique("messenger_messages_client_key").on(
      table.conversationId,
      table.senderId,
      table.clientMessageId,
    ),
    index("messenger_messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("messenger_messages_conversation_unread_idx").on(
      table.conversationId,
      table.readAt,
    ),
  ],
);

export const messengerMessageMedia = pgTable(
  "messenger_message_media",
  {
    messageId: text("message_id")
      .primaryKey()
      .references(() => messengerMessages.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    kind: text("kind").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messenger_message_media_kind_idx").on(table.kind, table.createdAt)],
);

export const messengerMessageReactions = pgTable(
  "messenger_message_reactions",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => messengerMessages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("messenger_message_reactions_pkey").on(table.messageId, table.userId),
    index("messenger_message_reactions_message_idx").on(table.messageId),
  ],
);

export const messengerConversationSettings = pgTable(
  "messenger_conversation_settings",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => messengerConversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    isPinned: boolean("is_pinned").notNull().default(false),
    isMuted: boolean("is_muted").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("messenger_conversation_settings_pkey").on(
      table.conversationId,
      table.userId,
    ),
    index("messenger_conversation_settings_user_idx").on(
      table.userId,
      table.isArchived,
      table.isPinned,
    ),
  ],
);
