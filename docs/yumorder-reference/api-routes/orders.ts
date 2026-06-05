import { Router } from "express";
import { db, ordersTable, orderItemsTable, menuItemsTable, driversTable, restaurantsTable, orderEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import type { OrderStatus } from "@workspace/db";

/**
 * Allowed status transitions per actor role.
 * Customers cannot change order status — only restaurants, drivers, and admins.
 */
// Church model: restaurant staff handle full lifecycle (no external driver needed)
const RESTAURANT_TRANSITIONS: Partial<Record<string, OrderStatus[]>> = {
  pending:          ["accepted", "rejected"],
  accepted:         ["preparing", "rejected"],
  preparing:        ["out_for_delivery"],
  out_for_delivery: ["delivered"],
};
const DRIVER_TRANSITIONS: Partial<Record<string, OrderStatus[]>> = {
  picked_up:        ["out_for_delivery"],
  out_for_delivery: ["delivered"],
};

function isStatusTransitionAllowed(
  from: string,
  to: OrderStatus,
  callerId: string,
  customerId: string,
  restaurantOwnerId: string | undefined,
  driverUserId: string | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (restaurantOwnerId === callerId) return (RESTAURANT_TRANSITIONS[from] ?? []).includes(to);
  if (driverUserId === callerId) return (DRIVER_TRANSITIONS[from] ?? []).includes(to);
  // Customers cannot change status
  return false;
}

interface OrderItemInput {
  menu_item_id: string;
  quantity: number;
  price?: number;
  unit_price?: number; // frontend may send unit_price — normalise to price
  notes?: string;
}

const router = Router();

async function callerCanAccessOrder(orderId: string, callerId: string, userRoles: string[]) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
  if (!order) return { order: null, allowed: false };
  if (userRoles.includes("admin") || order.customer_id === callerId) return { order, allowed: true };
  if (order.restaurant_id) {
    const [r] = await db.select({ owner_id: restaurantsTable.owner_id }).from(restaurantsTable)
      .where(eq(restaurantsTable.id, order.restaurant_id)).limit(1);
    if (r?.owner_id === callerId) return { order, allowed: true };
  }
  if (order.driver_id) {
    const [d] = await db.select({ user_id: driversTable.user_id }).from(driversTable)
      .where(eq(driversTable.id, order.driver_id)).limit(1);
    if (d?.user_id === callerId) return { order, allowed: true };
  }
  return { order, allowed: false };
}

router.get("/orders", requireAuth, async (req, res) => {
  const callerId = req.userId!;
  const userRoles = req.userRoles ?? [];
  const isAdmin = userRoles.includes("admin");
  const { restaurant_id, driver_id, status__in } = req.query;

  let orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.created_at));

  if (isAdmin) {
    if (restaurant_id) orders = orders.filter(o => o.restaurant_id === restaurant_id);
    if (driver_id) orders = orders.filter(o => o.driver_id === driver_id);
  } else if (restaurant_id) {
    const [resto] = await db.select({ owner_id: restaurantsTable.owner_id }).from(restaurantsTable)
      .where(eq(restaurantsTable.id, restaurant_id as string)).limit(1);
    if (!resto || resto.owner_id !== callerId) return res.status(403).json({ error: "Forbidden" });
    orders = orders.filter(o => o.restaurant_id === restaurant_id);
  } else if (driver_id) {
    const [drv] = await db.select({ user_id: driversTable.user_id }).from(driversTable)
      .where(eq(driversTable.id, driver_id as string)).limit(1);
    if (!drv || drv.user_id !== callerId) return res.status(403).json({ error: "Forbidden" });
    orders = orders.filter(o => o.driver_id === driver_id);
  } else {
    orders = orders.filter(o => o.customer_id === callerId);
  }

  if (status__in) {
    const statuses = (status__in as string).split(",");
    orders = orders.filter(o => statuses.includes(o.status));
  }
  res.json(orders);
});

router.get("/orders/:id", requireAuth, async (req, res) => {
  const { order, allowed } = await callerCanAccessOrder(req.params.id, req.userId!, req.userRoles ?? []);
  if (!order) return res.status(404).json({ error: "Not found" });
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.order_id, req.params.id));
  res.json({ ...order, items });
});

router.post("/orders", requireAuth, async (req, res) => {
  const { items, customer_id: _ignored, ...orderData } = req.body;
  const [order] = await db.insert(ordersTable)
    .values({ ...orderData, customer_id: req.userId! })
    .returning();

  // Record the initial "order placed" event
  await db.insert(orderEventsTable).values({
    order_id: order.id,
    status: order.status,
    actor_id: req.userId!,
    note: "order_placed",
  });

  if (Array.isArray(items) && items.length) {
    await db.insert(orderItemsTable).values(
      items.map((item: OrderItemInput) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity ?? 1,
        price: item.price ?? item.unit_price ?? 0,
        order_id: order.id,
      })),
    );
  }
  res.status(201).json(order);
});

router.patch("/orders/:id", requireAuth, async (req, res) => {
  const { order, allowed } = await callerCanAccessOrder(req.params.id, req.userId!, req.userRoles ?? []);
  if (!order) return res.status(404).json({ error: "Not found" });
  if (!allowed) return res.status(403).json({ error: "Forbidden" });

  const { customer_id: _cid, status: newStatus, ...rest } = req.body;
  const isAdmin = (req.userRoles ?? []).includes("admin");

  // Enforce status-transition permissions when status is being changed
  if (newStatus && newStatus !== order.status) {
    const [resto] = order.restaurant_id
      ? await db.select({ owner_id: restaurantsTable.owner_id }).from(restaurantsTable)
          .where(eq(restaurantsTable.id, order.restaurant_id)).limit(1)
      : [undefined];
    const [drv] = order.driver_id
      ? await db.select({ user_id: driversTable.user_id }).from(driversTable)
          .where(eq(driversTable.id, order.driver_id)).limit(1)
      : [undefined];

    const ok = isStatusTransitionAllowed(
      order.status, newStatus as OrderStatus,
      req.userId!, order.customer_id,
      resto?.owner_id, drv?.user_id, isAdmin,
    );
    if (!ok) {
      return res.status(403).json({
        error: `Status transition '${order.status}' → '${newStatus}' not permitted for your role`,
      });
    }

    // Append a timestamped event to the order journey log
    await db.insert(orderEventsTable).values({
      order_id: order.id,
      status: newStatus,
      actor_id: req.userId!,
    });
  }

  const [updated] = await db.update(ordersTable)
    .set({ ...rest, ...(newStatus ? { status: newStatus } : {}), updated_at: new Date() })
    .where(eq(ordersTable.id, req.params.id))
    .returning();
  res.json(updated);
});

router.get("/order-items", requireAuth, async (req, res) => {
  const { order_id } = req.query;
  if (!order_id) return res.status(400).json({ error: "order_id required" });
  const { order, allowed } = await callerCanAccessOrder(order_id as string, req.userId!, req.userRoles ?? []);
  if (!order) return res.status(404).json({ error: "Not found" });
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  const items = await db.select({
    id: orderItemsTable.id,
    order_id: orderItemsTable.order_id,
    menu_item_id: orderItemsTable.menu_item_id,
    quantity: orderItemsTable.quantity,
    price: orderItemsTable.price,
    menu_items: {
      id: menuItemsTable.id,
      name: menuItemsTable.name,
      price: menuItemsTable.price,
      image_url: menuItemsTable.image_url,
      is_available: menuItemsTable.is_available,
    }
  })
  .from(orderItemsTable)
  .leftJoin(menuItemsTable, eq(orderItemsTable.menu_item_id, menuItemsTable.id))
  .where(eq(orderItemsTable.order_id, order_id as string));
  res.json(items);
});

router.post("/order-items", requireAuth, async (req, res) => {
  const items: OrderItemInput[] = Array.isArray(req.body) ? req.body : [req.body];
  const orderId = items[0]?.order_id as string | undefined;
  if (!orderId) return res.status(400).json({ error: "order_id required" });
  const { order, allowed } = await callerCanAccessOrder(orderId, req.userId!, req.userRoles ?? []);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (!allowed) return res.status(403).json({ error: "Forbidden" });
  const inserted = await db.insert(orderItemsTable).values(items as Parameters<typeof db.insert>[0]["$inferInsert"][]).returning();
  res.status(201).json(inserted);
});

export default router;
