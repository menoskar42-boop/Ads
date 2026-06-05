import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

export const orderEventsTable = pgTable("order_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_id: uuid("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  note: text("note"),
  actor_id: text("actor_id"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrderEvent = typeof orderEventsTable.$inferSelect;
