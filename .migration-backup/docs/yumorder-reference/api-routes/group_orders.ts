import { Router } from "express";
import { db, groupOrdersTable, groupOrderItemsTable, restaurantsTable, menuItemsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, attachUser } from "../middleware/auth";

const router = Router();

router.get("/group-orders", async (req, res) => {
  const { share_code, host_id } = req.query;
  let rows = await db.select().from(groupOrdersTable);
  if (share_code) rows = rows.filter(g => g.share_code === share_code);
  if (host_id) rows = rows.filter(g => g.host_id === host_id);
  res.json(rows);
});

router.get("/group-orders/code/:code", async (req, res) => {
  const [group] = await db.select().from(groupOrdersTable)
    .where(eq(groupOrdersTable.share_code, req.params.code)).limit(1);
  if (!group) return res.status(404).json({ error: "Not found" });
  const [restaurant] = await db.select({ id: restaurantsTable.id, name: restaurantsTable.name, image_url: restaurantsTable.image_url })
    .from(restaurantsTable).where(eq(restaurantsTable.id, group.restaurant_id)).limit(1);
  const items = await db.select().from(groupOrderItemsTable)
    .where(eq(groupOrderItemsTable.group_order_id, group.id))
    .orderBy(asc(groupOrderItemsTable.created_at));
  res.json({ ...group, restaurant, items });
});

router.get("/group-orders/:id", async (req, res) => {
  const [group] = await db.select().from(groupOrdersTable)
    .where(eq(groupOrdersTable.id, req.params.id)).limit(1);
  if (!group) return res.status(404).json({ error: "Not found" });
  res.json(group);
});

router.post("/group-orders", requireAuth, async (req, res) => {
  const { share_code: provided_code, host_id: _ignored, ...rest } = req.body;
  const share_code = provided_code || Math.random().toString(36).substring(2, 8).toUpperCase();
  const expires_at = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const [group] = await db.insert(groupOrdersTable)
    .values({ ...rest, share_code, expires_at, host_id: req.userId! })
    .returning();
  res.status(201).json(group);
});

router.patch("/group-orders/:id", requireAuth, async (req, res) => {
  const [existing] = await db.select({ host_id: groupOrdersTable.host_id })
    .from(groupOrdersTable).where(eq(groupOrdersTable.id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const isAdmin = (req.userRoles ?? []).includes("admin");
  if (!isAdmin && existing.host_id !== req.userId) {
    return res.status(403).json({ error: "Forbidden: only the host can update this group order" });
  }

  const [group] = await db.update(groupOrdersTable)
    .set({ ...req.body, updated_at: new Date() })
    .where(eq(groupOrdersTable.id, req.params.id))
    .returning();
  res.json(group);
});

router.get("/group-order-items", async (req, res) => {
  const { group_order_id } = req.query;
  if (!group_order_id) return res.status(400).json({ error: "group_order_id required" });
  const items = await db.select({
    id: groupOrderItemsTable.id,
    group_order_id: groupOrderItemsTable.group_order_id,
    participant_id: groupOrderItemsTable.participant_id,
    participant_name: groupOrderItemsTable.participant_name,
    menu_item_id: groupOrderItemsTable.menu_item_id,
    quantity: groupOrderItemsTable.quantity,
    price: groupOrderItemsTable.price,
    created_at: groupOrderItemsTable.created_at,
    menu_items: {
      name: menuItemsTable.name,
      image_url: menuItemsTable.image_url,
    }
  })
  .from(groupOrderItemsTable)
  .leftJoin(menuItemsTable, eq(groupOrderItemsTable.menu_item_id, menuItemsTable.id))
  .where(eq(groupOrderItemsTable.group_order_id, group_order_id as string))
  .orderBy(asc(groupOrderItemsTable.created_at));
  res.json(items);
});

router.post("/group-order-items", requireAuth, async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const forced = items.map(it => ({ ...it, participant_id: req.userId! }));
  const inserted = await db.insert(groupOrderItemsTable).values(forced).returning();
  res.status(201).json(Array.isArray(req.body) ? inserted : inserted[0]);
});

router.delete("/group-order-items/:id", requireAuth, async (req, res) => {
  const [existing] = await db.select({ participant_id: groupOrderItemsTable.participant_id })
    .from(groupOrderItemsTable).where(eq(groupOrderItemsTable.id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const isAdmin = (req.userRoles ?? []).includes("admin");
  if (!isAdmin && existing.participant_id !== req.userId) {
    return res.status(403).json({ error: "Forbidden: can only remove your own items" });
  }
  await db.delete(groupOrderItemsTable).where(eq(groupOrderItemsTable.id, req.params.id));
  res.status(204).send();
});

export default router;
