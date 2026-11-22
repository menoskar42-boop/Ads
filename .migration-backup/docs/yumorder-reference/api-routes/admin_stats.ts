import { Router } from "express";
import { db, ordersTable, restaurantsTable, profilesTable, userRolesTable, couponsTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.get("/admin/stats", requireAuth, requireRole("admin"), async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [allOrders, allRestaurants, allProfiles, customerRoles] = await Promise.all([
    db.select().from(ordersTable).orderBy(desc(ordersTable.created_at)),
    db.select().from(restaurantsTable),
    db.select({ id: profilesTable.user_id, created_at: profilesTable.created_at, email: profilesTable.email }).from(profilesTable),
    db.select({ user_id: userRolesTable.user_id }).from(userRolesTable).where(eq(userRolesTable.role, "customer")),
  ]);

  const validOrders = allOrders.filter(o => o.status !== "rejected");
  const todayOrders = validOrders.filter(o => new Date(o.created_at) >= todayStart);
  const weekOrders = validOrders.filter(o => new Date(o.created_at) >= weekStart);
  const monthOrders = validOrders.filter(o => new Date(o.created_at) >= monthStart);

  const pendingOrders = allOrders.filter(o => o.status === "pending");
  const activeOrders = allOrders.filter(o => !["delivered", "rejected"].includes(o.status));

  const approvedRestaurants = allRestaurants.filter(r => r.is_approved && r.is_active);
  const pendingRestaurants = allRestaurants.filter(r => !r.is_approved);

  const totalRevenue = validOrders.reduce((s, o) => s + Number(o.total), 0);
  const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.total), 0);
  const weekRevenue = weekOrders.reduce((s, o) => s + Number(o.total), 0);
  const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.total), 0);

  // Revenue by day for last 14 days
  const revenueChart: { date: string; orders: number; revenue: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const dayOrders = validOrders.filter(o => {
      const od = new Date(o.created_at);
      return od >= d && od < next;
    });
    revenueChart.push({
      date: d.toISOString().slice(0, 10),
      orders: dayOrders.length,
      revenue: Math.round(dayOrders.reduce((s, o) => s + Number(o.total), 0) * 100) / 100,
    });
  }

  // Top restaurants by revenue
  const restaurantRevenue: Record<string, { id: string; name: string; revenue: number; orders: number }> = {};
  for (const r of allRestaurants) {
    restaurantRevenue[r.id] = { id: r.id, name: r.name, revenue: 0, orders: 0 };
  }
  for (const o of validOrders) {
    if (restaurantRevenue[o.restaurant_id]) {
      restaurantRevenue[o.restaurant_id].revenue += Number(o.total);
      restaurantRevenue[o.restaurant_id].orders += 1;
    }
  }
  const topRestaurants = Object.values(restaurantRevenue)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Status breakdown
  const statusBreakdown: Record<string, number> = {};
  for (const o of allOrders) {
    statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1;
  }

  res.json({
    orders: {
      total: validOrders.length,
      today: todayOrders.length,
      this_week: weekOrders.length,
      this_month: monthOrders.length,
      pending: pendingOrders.length,
      active: activeOrders.length,
      status_breakdown: statusBreakdown,
    },
    revenue: {
      total: Math.round(totalRevenue * 100) / 100,
      today: Math.round(todayRevenue * 100) / 100,
      this_week: Math.round(weekRevenue * 100) / 100,
      this_month: Math.round(monthRevenue * 100) / 100,
      avg_order: validOrders.length > 0 ? Math.round((totalRevenue / validOrders.length) * 100) / 100 : 0,
    },
    restaurants: {
      total: allRestaurants.length,
      active: approvedRestaurants.length,
      pending_approval: pendingRestaurants.length,
    },
    customers: {
      total: customerRoles.length,
    },
    charts: {
      revenue_by_day: revenueChart,
      top_restaurants: topRestaurants,
    },
  });
});

router.get("/admin/driver-stats", requireAuth, requireRole("admin"), async (_req, res) => {
  res.json([]);
});

export default router;
