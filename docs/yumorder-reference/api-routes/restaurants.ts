import { Router } from "express";
import { db, restaurantsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

function parseBool(val: string | undefined): boolean | undefined {
  if (val === "true" || val === "eq.true") return true;
  if (val === "false" || val === "eq.false") return false;
  return undefined;
}

function parseVal(val: string | undefined): string | undefined {
  if (!val) return undefined;
  if (val.startsWith("eq.")) return val.slice(3);
  return val;
}

router.get("/restaurants", async (req, res) => {
  const all = await db.select().from(restaurantsTable).orderBy(desc(restaurantsTable.created_at));

  let result = all;
  const is_approved = parseBool(req.query.is_approved as string);
  const is_active = parseBool(req.query.is_active as string);
  const vertical = parseVal(req.query.vertical as string);
  const city_id = parseVal(req.query.city_id as string);
  const owner_id = parseVal(req.query.owner_id as string);
  const id__in = req.query.id__in as string | undefined;

  if (is_approved !== undefined) result = result.filter(r => r.is_approved === is_approved);
  if (is_active !== undefined) result = result.filter(r => r.is_active === is_active);
  if (vertical) result = result.filter(r => r.vertical === vertical);
  if (city_id) result = result.filter(r => r.city_id === city_id);
  if (owner_id) result = result.filter(r => r.owner_id === owner_id);
  if (id__in) {
    const ids = id__in.split(",");
    result = result.filter(r => ids.includes(r.id));
  }

  res.json(result);
});

router.get("/restaurants/:id", async (req, res) => {
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, req.params.id)).limit(1);
  if (!restaurant) return res.status(404).json({ error: "Not found" });
  res.json(restaurant);
});

// Restaurant owners can update their own restaurant; admins can update any
router.patch("/restaurants/:id", requireAuth, async (req, res) => {
  // Check ownership or admin role
  const [existing] = await db.select({ owner_id: restaurantsTable.owner_id })
    .from(restaurantsTable)
    .where(eq(restaurantsTable.id, req.params.id))
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const isOwner = existing.owner_id === req.userId;
  const userRoles = req.userRoles ?? [];
  const isAdmin = userRoles.includes("admin");

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: "Forbidden: not the restaurant owner" });
  }

  const [restaurant] = await db.update(restaurantsTable)
    .set({ ...req.body, updated_at: new Date() })
    .where(eq(restaurantsTable.id, req.params.id))
    .returning();
  res.json(restaurant);
});

// Admins can create restaurants with any status.
// Restaurant owners can apply — they get is_approved:false, is_active:false, owner_id forced to themselves.
router.post("/restaurants", requireAuth, async (req, res) => {
  const userRoles = req.userRoles ?? [];
  const isAdmin = userRoles.includes("admin");
  const isOwner = userRoles.includes("restaurant_owner");

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: "Forbidden: only admins or restaurant owners can create restaurants" });
  }

  // Owners can only create a restaurant for themselves, and it starts as pending
  const payload = isAdmin
    ? req.body
    : {
        ...req.body,
        owner_id: req.userId,
        is_approved: false,
        is_active: false,
      };

  // Prevent owners from having multiple restaurants
  if (!isAdmin) {
    const existing = await db.select({ id: restaurantsTable.id })
      .from(restaurantsTable)
      .where(eq(restaurantsTable.owner_id, req.userId!))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "You already have a registered restaurant" });
    }
  }

  const [restaurant] = await db.insert(restaurantsTable).values(payload).returning();
  res.status(201).json(restaurant);
});

// Admin-only: approve, reject (set is_approved), toggle is_active, or fully delete a restaurant
router.delete("/restaurants/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.delete(restaurantsTable).where(eq(restaurantsTable.id, req.params.id));
  res.status(204).send();
});

export default router;
