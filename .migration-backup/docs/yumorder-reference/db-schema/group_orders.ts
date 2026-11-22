import { pgTable, text, real, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const groupOrdersTable = pgTable("group_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurant_id: uuid("restaurant_id").notNull(),
  host_id: text("host_id").notNull(),
  share_code: text("share_code").notNull().unique(),
  status: text("status").notNull().default("open"),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupOrderItemsTable = pgTable("group_order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  group_order_id: uuid("group_order_id").notNull(),
  menu_item_id: uuid("menu_item_id").notNull(),
  participant_id: text("participant_id").notNull(),
  participant_name: text("participant_name"),
  quantity: integer("quantity").notNull().default(1),
  price: real("price").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGroupOrderSchema = createInsertSchema(groupOrdersTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertGroupOrder = z.infer<typeof insertGroupOrderSchema>;
export type GroupOrder = typeof groupOrdersTable.$inferSelect;

export const insertGroupOrderItemSchema = createInsertSchema(groupOrderItemsTable).omit({ id: true, created_at: true });
export type InsertGroupOrderItem = z.infer<typeof insertGroupOrderItemSchema>;
export type GroupOrderItem = typeof groupOrderItemsTable.$inferSelect;
