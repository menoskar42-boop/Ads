import {
  boolean,
  check,
  integer,
  index,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { messengerProfiles } from "./messenger";

export const messengerGroups = pgTable(
  "messenger_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messenger_groups_updated_idx").on(table.updatedAt)],
);

export const messengerGroupMembers = pgTable(
  "messenger_group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => messengerGroups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("messenger_group_members_pkey").on(table.groupId, table.userId),
    index("messenger_group_members_user_idx").on(table.userId, table.joinedAt),
  ],
);

export const messengerGroupMessages = pgTable(
  "messenger_group_messages",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => messengerGroups.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    clientMessageId: text("client_message_id").notNull(),
    body: text("body").notNull(),
    messageType: text("message_type").notNull().default("text"),
    audioDurationMs: integer("audio_duration_ms"),
    audioContentType: text("audio_content_type"),
    audioSizeBytes: integer("audio_size_bytes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("messenger_group_messages_client_key").on(
      table.groupId,
      table.senderId,
      table.clientMessageId,
    ),
    index("messenger_group_messages_created_idx").on(table.groupId, table.createdAt),
    check(
      "messenger_group_messages_type_check",
      sql`(
        (${table.messageType} = 'text'
          AND ${table.audioDurationMs} IS NULL
          AND ${table.audioContentType} IS NULL
          AND ${table.audioSizeBytes} IS NULL)
        OR
        (${table.messageType} = 'audio'
          AND ${table.audioDurationMs} IS NOT NULL
          AND ${table.audioDurationMs} BETWEEN 1 AND 120000
          AND ${table.audioContentType} IS NOT NULL
          AND ${table.audioContentType} IN ('audio/mp4', 'audio/webm')
          AND ${table.audioSizeBytes} IS NOT NULL
          AND ${table.audioSizeBytes} BETWEEN 1 AND 4194304)
        OR
        (${table.messageType} = 'media'
          AND ${table.audioDurationMs} IS NULL
          AND ${table.audioContentType} IS NULL
          AND ${table.audioSizeBytes} IS NULL)
      )`,
    ),
  ],
);

export const messengerGroupMessageMedia = pgTable(
  "messenger_group_message_media",
  {
    messageId: text("message_id")
      .primaryKey()
      .references(() => messengerGroupMessages.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull().unique(),
    originalFilename: text("original_filename").notNull(),
    contentType: text("content_type").notNull(),
    kind: text("kind").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "messenger_group_message_media_filename_check",
      sql`char_length(${table.originalFilename}) BETWEEN 1 AND 180`,
    ),
    check(
      "messenger_group_message_media_content_type_check",
      sql`${table.contentType} IN (
        'image/jpeg', 'image/png', 'image/webp',
        'video/mp4', 'video/webm', 'application/pdf', 'text/plain'
      )`,
    ),
    check(
      "messenger_group_message_media_kind_check",
      sql`${table.kind} IN ('image', 'video', 'file')`,
    ),
    check(
      "messenger_group_message_media_size_check",
      sql`${table.sizeBytes} BETWEEN 1 AND 8388608`,
    ),
  ],
);

export const messengerGroupSettings = pgTable(
  "messenger_group_settings",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => messengerGroups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    isMuted: boolean("is_muted").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("messenger_group_settings_pkey").on(table.groupId, table.userId),
    index("messenger_group_settings_user_idx").on(table.userId, table.isMuted),
  ],
);

export const messengerStatusUpdates = pgTable(
  "messenger_status_updates",
  {
    id: text("id").primaryKey(),
    authorId: text("author_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    body: text("body").notNull(),
    audienceMode: text("audience_mode").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("messenger_status_updates_expiry_idx").on(table.expiresAt),
    index("messenger_status_updates_author_idx").on(table.authorId, table.createdAt),
  ],
);

export const messengerStatusAudience = pgTable(
  "messenger_status_audience",
  {
    statusId: text("status_id")
      .notNull()
      .references(() => messengerStatusUpdates.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
  },
  (table) => [
    unique("messenger_status_audience_pkey").on(table.statusId, table.userId),
    index("messenger_status_audience_user_idx").on(table.userId, table.statusId),
  ],
);

export const messengerContentReports = pgTable(
  "messenger_content_reports",
  {
    id: text("id").primaryKey(),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("messenger_content_reports_reporter_target_key").on(
      table.reporterId,
      table.targetType,
      table.targetId,
    ),
    index("messenger_content_reports_created_idx").on(table.createdAt),
  ],
);

export type MessengerGroup = typeof messengerGroups.$inferSelect;
export type MessengerGroupMember = typeof messengerGroupMembers.$inferSelect;
export type MessengerGroupMessage = typeof messengerGroupMessages.$inferSelect;
export type MessengerGroupMessageMedia = typeof messengerGroupMessageMedia.$inferSelect;
export type MessengerStatusUpdate = typeof messengerStatusUpdates.$inferSelect;
export type MessengerContentReport = typeof messengerContentReports.$inferSelect;
