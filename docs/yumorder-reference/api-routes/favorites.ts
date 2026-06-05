import { Router } from "express";
import { db, favoritesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, attachUser } from "../middleware/auth";

const router = Router();

/**
 * GET /favorites — returns favorites for the authenticated user.
 * If a valid session token is present, user_id is derived from it and any
 * client-supplied user_id query param is ignored (prevents IDOR).
 * Falls back to unauthenticated query-param path only for admin/server-side use.
 */
router.get("/favorites", requireAuth, async (req, res) => {
  const favs = await db.select().from(favoritesTable)
    .where(eq(favoritesTable.user_id, req.userId!));
  res.json(favs);
});

// POST: derive user_id from verified auth — reject client-supplied user_id
router.post("/favorites", requireAuth, async (req, res) => {
  const { restaurant_id } = req.body;
  const userId = req.userId!;
  const existing = await db.select().from(favoritesTable)
    .where(and(eq(favoritesTable.user_id, userId), eq(favoritesTable.restaurant_id, restaurant_id)))
    .limit(1);
  if (existing.length) return res.json(existing[0]);
  const [fav] = await db.insert(favoritesTable).values({ user_id: userId, restaurant_id }).returning();
  res.status(201).json(fav);
});

// DELETE by user_id + restaurant_id: enforce ownership via req.userId
router.delete("/favorites", requireAuth, async (req, res) => {
  const { restaurant_id } = req.query;
  if (!restaurant_id) return res.status(400).json({ error: "restaurant_id required" });
  await db.delete(favoritesTable)
    .where(and(
      eq(favoritesTable.user_id, req.userId!),
      eq(favoritesTable.restaurant_id, restaurant_id as string),
    ));
  res.status(204).send();
});

// DELETE by record id: verify ownership before deletion
router.delete("/favorites/:id", requireAuth, async (req, res) => {
  const result = await db.delete(favoritesTable)
    .where(and(
      eq(favoritesTable.id, req.params.id),
      eq(favoritesTable.user_id, req.userId!),
    ))
    .returning({ id: favoritesTable.id });
  if (!result.length) return res.status(404).json({ error: "Not found or not owned by you" });
  res.status(204).send();
});

export default router;
