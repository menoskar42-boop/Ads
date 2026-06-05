import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const appRoleEnum = ["customer", "restaurant_owner", "admin", "driver"] as const;
export type AppRole = typeof appRoleEnum[number];

export const userRolesTable = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: text("user_id").notNull(),
  role: text("role").notNull().$type<AppRole>(),
});

export const insertUserRoleSchema = createInsertSchema(userRolesTable).omit({ id: true });
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserRole = typeof userRolesTable.$inferSelect;
