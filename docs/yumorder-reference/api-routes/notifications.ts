import { Router } from "express";
import { db, notificationsTable } from "@workspace/db";
import { eq, desc, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET: only returns notifications belonging to the authenticated user — no IDOR via query param
router.get("/notifications", requireAuth, async (req, res) => {
  const notifs = await db.select().from(notificationsTable)
    .where(eq(notificationsTable.user_id, req.userId!))
    .orderBy(desc(notificationsTable.created_at));
  res.json(notifs);
});

// PATCH single: only allow updates to notifications owned by the authenticated user
router.patch("/notifications/:id", requireAuth, async (req, res) => {
  const { user_id: _ignored, ...rest } = req.body;
  const [notif] = await db.update(notificationsTable)
    .set(rest)
    .where(and(
      eq(notificationsTable.id, req.params.id),
      eq(notificationsTable.user_id, req.userId!),
    ))
    .returning();
  if (!notif) return res.status(404).json({ error: "Not found or not owned by you" });
  res.json(notif);
});

/**
 * PATCH /notifications?id__in=id1,id2 — bulk mark-read.
 * Enforces user ownership by AND-ing user_id = req.userId on every row touched.
 */
router.patch("/notifications", requireAuth, async (req, res) => {
  const { id__in } = req.query;
  if (!id__in) return res.status(400).json({ error: "id__in query param required" });
  const ids = (id__in as string).split(",").filter(Boolean);
  if (!ids.length) return res.json([]);
  const { user_id: _ignored, ...payload } = req.body;
  const updated = await db.update(notificationsTable)
    .set(payload)
    .where(and(
      inArray(notificationsTable.id, ids),
      eq(notificationsTable.user_id, req.userId!),
    ))
    .returning();
  res.json(updated);
});

// DELETE: only allow deletion of notifications owned by the authenticated user
router.delete("/notifications/:id", requireAuth, async (req, res) => {
  const result = await db.delete(notificationsTable)
    .where(and(
      eq(notificationsTable.id, req.params.id),
      eq(notificationsTable.user_id, req.userId!),
    ))
    .returning({ id: notificationsTable.id });
  if (!result.length) return res.status(404).json({ error: "Not found or not owned by you" });
  res.status(204).send();
});

export default router;
