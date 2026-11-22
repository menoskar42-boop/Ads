import { createInsertSchema } from "drizzle-zod";
import { check, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { messengerConversations, messengerMessages, messengerProfiles } from "./messenger";

export type ScheduledMessageStatus = "pending" | "sent" | "failed" | "cancelled";

export const messengerScheduledMessages = pgTable(
  "messenger_scheduled_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => messengerConversations.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => messengerProfiles.userId, { onDelete: "cascade" }),
    clientScheduleId: text("client_schedule_id").notNull(),
    body: text("body").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    status: text("status").$type<ScheduledMessageStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentMessageId: text("sent_message_id").references(() => messengerMessages.id, {
      onDelete: "set null",
    }),
    failureCode: text("failure_code"),
  },
  (table) => [
    unique("messenger_scheduled_messages_client_key").on(
      table.conversationId,
      table.senderId,
      table.clientScheduleId,
    ),
    index("messenger_scheduled_messages_due_idx").on(table.status, table.scheduledAt),
    index("messenger_scheduled_messages_sender_idx").on(
      table.senderId,
      table.status,
      table.scheduledAt,
    ),
    check(
      "messenger_scheduled_messages_status_check",
      sql`${table.status} IN ('pending', 'sent', 'failed', 'cancelled')`,
    ),
    check(
      "messenger_scheduled_messages_body_check",
      sql`length(${table.body}) BETWEEN 1 AND 4000`,
    ),
  ],
);

export const insertMessengerScheduledMessageSchema = createInsertSchema(
  messengerScheduledMessages,
).omit({
  createdAt: true,
  updatedAt: true,
  sentAt: true,
  sentMessageId: true,
  failureCode: true,
});

export type InsertMessengerScheduledMessage = z.infer<
  typeof insertMessengerScheduledMessageSchema
>;
export type MessengerScheduledMessage = typeof messengerScheduledMessages.$inferSelect;
