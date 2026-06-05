import { pgTable, text, real, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const driversTable = pgTable("drivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull().unique(),
  full_name: text("full_name").notNull(),
  phone: text("phone"),
  city_id: uuid("city_id"),
  vehicle_type: text("vehicle_type"),
  vehicle_plate: text("vehicle_plate"),
  is_approved: boolean("is_approved").notNull().default(false),
  is_online: boolean("is_online").notNull().default(false),
  current_lat: real("current_lat"),
  current_lng: real("current_lng"),
  last_location_at: timestamp("last_location_at", { withTimezone: true }),
  rating: real("rating"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDriverSchema = createInsertSchema(driversTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertDriver = z.infer<typeof insertDriverSchema>;
export type Driver = typeof driversTable.$inferSelect;
