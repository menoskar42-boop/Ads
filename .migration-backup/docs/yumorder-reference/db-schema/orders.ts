import { pgTable, text, real, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orderStatusEnum = ["pending", "accepted", "preparing", "out_for_delivery", "delivered", "rejected", "picked_up"] as const;
export type OrderStatus = typeof orderStatusEnum[number];

export const ordersTable = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  customer_id: text("customer_id").notNull(),
  restaurant_id: uuid("restaurant_id").notNull(),
  driver_id: text("driver_id"),
  status: text("status").notNull().default("pending").$type<OrderStatus>(),
  total: real("total").notNull().default(0),
  delivery_address: text("delivery_address"),
  notes: text("notes"),
  coupon_code: text("coupon_code"),
  discount_amount: real("discount_amount").notNull().default(0),
  points_used: real("points_used").notNull().default(0),
  points_discount: real("points_discount").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
