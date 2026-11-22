import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const messengerProfiles = pgTable(
  "messenger_profiles",
  {
    userId: text("user_id").primaryKey(),
    username: text("username").notNull(),
    usernameLower: text("username_lower").notNull(),
    displayName: text("display_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("messenger_profiles_username_lower_key").on(table.usernameLower)],
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
