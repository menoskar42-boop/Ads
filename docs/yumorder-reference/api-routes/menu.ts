import { Router } from "express";
import { db, menuCategoriesTable, menuItemsTable, restaurantsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

async function isRestaurantOwnerOrAdmin(restaurantId: string, userId: string, userRoles: string[]): Promise<boolean> {
  if (userRoles.includes("admin")) return true;
  const [r] = await db.select({ owner_id: restaurantsTable.owner_id })
    .from(restaurantsTable)
    .where(eq(restaurantsTable.id, restaurantId))
    .limit(1);
  return r?.owner_id === userId;
}

// Menu categories
router.get("/menu/categories", async (req, res) => {
  const { restaurant_id } = req.query;
  if (!restaurant_id) return res.status(400).json({ error: "restaurant_id required" });
  const cats = await db.select().from(menuCategoriesTable)
    .where(eq(menuCategoriesTable.restaurant_id, restaurant_id as string))
    .orderBy(asc(menuCategoriesTable.sort_order));
  res.json(cats);
});

router.post("/menu/categories", requireAuth, async (req, res) => {
  const allowed = await isRestaurantOwnerOrAdmin(req.body.restaurant_id, req.userId!, req.userRoles ?? []);
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  const [cat] = await db.insert(menuCategoriesTable).values(req.body).returning();
  res.status(201).json(cat);
});

router.delete("/menu/categories/:id", requireAuth, async (req, res) => {
  const [cat] = await db.select({ restaurant_id: menuCategoriesTable.restaurant_id })
    .from(menuCategoriesTable).where(eq(menuCategoriesTable.id, req.params.id)).limit(1);
  if (!cat) return res.status(404).json({ error: "Not found" });
  const allowed = await isRestaurantOwnerOrAdmin(cat.restaurant_id, req.userId!, req.userRoles ?? []);
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  await db.delete(menuCategoriesTable).where(eq(menuCategoriesTable.id, req.params.id));
  res.status(204).send();
});

// Menu items
router.get("/menu/items", async (req, res) => {
  const { restaurant_id, available } = req.query;
  if (!restaurant_id) return res.status(400).json({ error: "restaurant_id required" });
  let items = await db.select().from(menuItemsTable)
    .where(eq(menuItemsTable.restaurant_id, restaurant_id as string));
  if (available === "true") items = items.filter(i => i.is_available);
  res.json(items);
});

router.post("/menu/items", requireAuth, async (req, res) => {
  const allowed = await isRestaurantOwnerOrAdmin(req.body.restaurant_id, req.userId!, req.userRoles ?? []);
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  const [item] = await db.insert(menuItemsTable).values(req.body).returning();
  res.status(201).json(item);
});

router.patch("/menu/items/:id", requireAuth, async (req, res) => {
  const [existing] = await db.select({ restaurant_id: menuItemsTable.restaurant_id })
    .from(menuItemsTable).where(eq(menuItemsTable.id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const allowed = await isRestaurantOwnerOrAdmin(existing.restaurant_id, req.userId!, req.userRoles ?? []);
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  const [item] = await db.update(menuItemsTable)
    .set({ ...req.body, updated_at: new Date() })
    .where(eq(menuItemsTable.id, req.params.id))
    .returning();
  res.json(item);
});

router.delete("/menu/items/:id", requireAuth, async (req, res) => {
  const [existing] = await db.select({ restaurant_id: menuItemsTable.restaurant_id })
    .from(menuItemsTable).where(eq(menuItemsTable.id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const allowed = await isRestaurantOwnerOrAdmin(existing.restaurant_id, req.userId!, req.userRoles ?? []);
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  await db.delete(menuItemsTable).where(eq(menuItemsTable.id, req.params.id));
  res.status(204).send();
});

export default router;
