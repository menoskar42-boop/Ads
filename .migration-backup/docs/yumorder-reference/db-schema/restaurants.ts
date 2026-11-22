import { pgTable, text, boolean, real, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const verticalTypeEnum = ["restaurant", "supermarket", "pharmacy", "sweets", "drinks"] as const;
export type VerticalType = typeof verticalTypeEnum[number];

export const restaurantsTable = pgTable("restaurants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  image_url: text("image_url"),
  address: text("address"),
  phone: text("phone"),
  city_id: uuid("city_id"),
  owner_id: text("owner_id"),
  vertical: text("vertical").notNull().default("restaurant").$type<VerticalType>(),
  opening_time: text("opening_time").notNull().default("09:00"),
  closing_time: text("closing_time").notNull().default("23:00"),
  delivery_fee: real("delivery_fee"),
  delivery_time_min: integer("delivery_time_min"),
  rating: real("rating"),
  is_active: boolean("is_active").default(false),
  is_approved: boolean("is_approved").default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRestaurantSchema = createInsertSchema(restaurantsTable).omit({ id: true, created_at: true, updated_at: true });
export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;
export type Restaurant = typeof restaurantsTable.$inferSelect;
