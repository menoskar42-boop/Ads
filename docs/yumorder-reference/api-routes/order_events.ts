import { Router } from "express";
import { db, orderEventsTable, ordersTable, driversTable, restaurantsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

async function callerCanAccessOrder(orderId: string, callerId: string, userRoles: string[]) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return false;
  if (userRoles.includes("admin") || order.customer_id === callerId) return true;
  if (order.restaurant_id) {
    const [r] = await db.select({ owner_id: restaurantsTable.owner_id }).from(restaurantsTable)
      .where(eq(restaurantsTable.id, order.restaurant_id)).limit(1);
    if (r?.owner_id === callerId) return true;
  }
  if (order.driver_id) {
    const [d] = await db.select({ user_id: driversTable.user_id }).from(driversTable)
      .where(eq(driversTable.id, order.driver_id)).limit(1);
    if (d?.user_id === callerId) return true;
  }
  return false;
}

router.get("/order-events", requireAuth, async (req, res) => {
  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ error: "order_id required" });
  const allowed = await callerCanAccessOrder(order_id as string, req.userId!, req.userRoles ?? []);
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  const events = await db.select().from(orderEventsTable)
    .where(eq(orderEventsTable.order_id, order_id as string))
    .orderBy(asc(orderEventsTable.created_at));
  res.json(events);
});

export default router;
