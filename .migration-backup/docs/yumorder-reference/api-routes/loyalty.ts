import { Router } from "express";
import { db, loyaltyPointsTable, loyaltyTransactionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

// GET loyalty points — derived from session token, no user_id param
router.get("/loyalty/points", requireAuth, async (req, res) => {
  const [points] = await db.select().from(loyaltyPointsTable)
    .where(eq(loyaltyPointsTable.user_id, req.userId!)).limit(1);
  if (!points) return res.json([]);
  res.json([points]);
});

router.get("/loyalty/transactions", requireAuth, async (req, res) => {
  const txs = await db.select().from(loyaltyTransactionsTable)
    .where(eq(loyaltyTransactionsTable.user_id, req.userId!))
    .orderBy(desc(loyaltyTransactionsTable.created_at));
  res.json(txs);
});

// Combined loyalty data — user derived from token
router.get("/loyalty/me", requireAuth, async (req, res) => {
  const [points] = await db.select().from(loyaltyPointsTable)
    .where(eq(loyaltyPointsTable.user_id, req.userId!)).limit(1);
  const transactions = await db.select().from(loyaltyTransactionsTable)
    .where(eq(loyaltyTransactionsTable.user_id, req.userId!))
    .orderBy(desc(loyaltyTransactionsTable.created_at));
  res.json({ points: points || { balance: 0, lifetime_earned: 0 }, transactions });
});

export default router;
