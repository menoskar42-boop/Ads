import { Router } from "express";
import { db, driversTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

/**
 * GET /drivers
 * - Admin / restaurant_owner: full list with optional filters
 * - Everyone else: their own driver record only
 */
router.get("/drivers", requireAuth, async (req, res) => {
  const userRoles = req.userRoles ?? [];
  const isAdmin = userRoles.includes("admin");
  const isRestaurantOwner = userRoles.includes("restaurant_owner");

  if (!isAdmin && !isRestaurantOwner) {
    const drivers = await db.select().from(driversTable)
      .where(eq(driversTable.user_id, req.userId!));
    return res.json(drivers);
  }

  let drivers = await db.select().from(driversTable).orderBy(desc(driversTable.created_at));
  const { city_id, is_online, is_approved } = req.query;
  if (city_id) drivers = drivers.filter(d => d.city_id === city_id);
  if (is_online === "true") drivers = drivers.filter(d => d.is_online === true);
  if (is_approved === "true") drivers = drivers.filter(d => d.is_approved === true);
  res.json(drivers);
});

/** GET /drivers/:id — public (used by order-tracking polling) */
router.get("/drivers/:id", async (req, res) => {
  const [driver] = await db.select().from(driversTable)
    .where(eq(driversTable.id, req.params.id)).limit(1);
  if (!driver) return res.status(404).json({ error: "Not found" });
  res.json(driver);
});

/** POST /drivers — driver registers themselves */
router.post("/drivers", requireAuth, async (req, res) => {
  const { user_id: _ignored, ...rest } = req.body;
  const [driver] = await db.insert(driversTable)
    .values({ ...rest, user_id: req.userId! })
    .returning();
  res.status(201).json(driver);
});

/** PATCH /drivers/:id — driver updates own record; admin can update any */
router.patch("/drivers/:id", requireAuth, async (req, res) => {
  const [existing] = await db.select({ user_id: driversTable.user_id })
    .from(driversTable).where(eq(driversTable.id, req.params.id)).limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const isOwner = existing.user_id === req.userId;
  const isAdmin = (req.userRoles ?? []).includes("admin");
  if (!isOwner && !isAdmin) return res.status(403).json({ error: "Forbidden" });

  // Sanitise the body — Drizzle PgTimestamp requires a real Date, not an ISO string
  const { last_location_at, updated_at: _ua, ...rest } = req.body;
  const patch: Record<string, unknown> = { ...rest, updated_at: new Date() };
  if (last_location_at != null) {
    const d = last_location_at instanceof Date ? last_location_at : new Date(last_location_at);
    if (!isNaN(d.getTime())) patch.last_location_at = d;
  }

  const [driver] = await db.update(driversTable)
    .set(patch)
    .where(eq(driversTable.id, req.params.id))
    .returning();
  res.json(driver);
});

export default router;
