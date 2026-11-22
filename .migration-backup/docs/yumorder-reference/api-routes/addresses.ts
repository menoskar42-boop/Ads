import { Router } from "express";
import { db, userAddressesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET: only returns addresses belonging to the authenticated user — no IDOR via query param
router.get("/addresses", requireAuth, async (req, res) => {
  const addresses = await db.select().from(userAddressesTable)
    .where(eq(userAddressesTable.user_id, req.userId!));
  res.json(addresses);
});

// POST: force user_id from verified auth token — ignore any client-supplied user_id
router.post("/addresses", requireAuth, async (req, res) => {
  const { user_id: _ignored, ...rest } = req.body;
  const [address] = await db.insert(userAddressesTable)
    .values({ ...rest, user_id: req.userId! })
    .returning();
  res.status(201).json(address);
});

// PATCH: only update records owned by the authenticated user
router.patch("/addresses/:id", requireAuth, async (req, res) => {
  const { user_id: _ignored, ...rest } = req.body;
  const [address] = await db.update(userAddressesTable)
    .set({ ...rest, updated_at: new Date() })
    .where(and(
      eq(userAddressesTable.id, req.params.id),
      eq(userAddressesTable.user_id, req.userId!),
    ))
    .returning();
  if (!address) return res.status(404).json({ error: "Not found or not owned by you" });
  res.json(address);
});

// DELETE: only delete records owned by the authenticated user
router.delete("/addresses/:id", requireAuth, async (req, res) => {
  const result = await db.delete(userAddressesTable)
    .where(and(
      eq(userAddressesTable.id, req.params.id),
      eq(userAddressesTable.user_id, req.userId!),
    ))
    .returning({ id: userAddressesTable.id });
  if (!result.length) return res.status(404).json({ error: "Not found or not owned by you" });
  res.status(204).send();
});

export default router;
