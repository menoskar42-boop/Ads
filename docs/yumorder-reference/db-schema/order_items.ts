import { pgTable, real, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orderItemsTable = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  order_id: uuid("order_id").notNull(),
  menu_item_id: uuid("menu_item_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  price: real("price").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true, created_at: true });
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;
