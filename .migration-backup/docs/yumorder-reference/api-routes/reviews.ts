import { Router } from "express";
import { db, reviewsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/reviews", async (req, res) => {
  const { restaurant_id, order_id, customer_id__in } = req.query;
  let reviews = await db.select().from(reviewsTable).orderBy(desc(reviewsTable.created_at));
  if (restaurant_id) reviews = reviews.filter(r => r.restaurant_id === restaurant_id);
  if (order_id) reviews = reviews.filter(r => r.order_id === order_id);
  if (customer_id__in) {
    const ids = (customer_id__in as string).split(",");
    reviews = reviews.filter(r => ids.includes(r.customer_id));
  }
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  if (limit) reviews = reviews.slice(0, limit);
  res.json(reviews);
});

// POST: enforce customer_id from auth, not from client body
router.post("/reviews", requireAuth, async (req, res) => {
  const { customer_id: _ignored, ...rest } = req.body;
  const [review] = await db.insert(reviewsTable)
    .values({ ...rest, customer_id: req.userId! })
    .returning();
  res.status(201).json(review);
});

// DELETE: only the review author can delete their own review
router.delete("/reviews/:id", requireAuth, async (req, res) => {
  const result = await db.delete(reviewsTable)
    .where(and(
      eq(reviewsTable.id, req.params.id),
      eq(reviewsTable.customer_id, req.userId!),
    ))
    .returning({ id: reviewsTable.id });
  if (!result.length) return res.status(404).json({ error: "Not found or not owned by you" });
  res.status(204).send();
});

export default router;
