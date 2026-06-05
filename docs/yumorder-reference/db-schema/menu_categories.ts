import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const menuCategoriesTable = pgTable("menu_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  restaurant_id: uuid("restaurant_id").notNull(),
  name: text("name").notNull(),
  sort_order: integer("sort_order"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMenuCategorySchema = createInsertSchema(menuCategoriesTable).omit({ id: true, created_at: true });
export type InsertMenuCategory = z.infer<typeof insertMenuCategorySchema>;
export type MenuCategory = typeof menuCategoriesTable.$inferSelect;
