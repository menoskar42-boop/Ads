import { Router } from "express";
import { db, couponsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.get("/coupons", async (req, res) => {
  const { code, is_active } = req.query;
  let coupons = await db.select().from(couponsTable);
  if (code) coupons = coupons.filter(c => c.code === (code as string).toUpperCase());
  if (is_active !== undefined) {
    const active = is_active === "true" || is_active === true;
    coupons = coupons.filter(c => c.is_active === active);
  }
  res.json(coupons);
});

router.get("/coupons/:code", async (req, res) => {
  const [coupon] = await db.select().from(couponsTable)
    .where(eq(couponsTable.code, req.params.code.toUpperCase()))
    .limit(1);
  if (!coupon) return res.status(404).json({ error: "Coupon not found" });
  res.json(coupon);
});

router.post("/coupons", requireAuth, requireRole("admin"), async (req, res) => {
  const [coupon] = await db.insert(couponsTable)
    .values({ ...req.body, code: req.body.code?.toUpperCase() })
    .returning();
  res.status(201).json(coupon);
});

router.patch("/coupons/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const [coupon] = await db.update(couponsTable)
    .set({ ...req.body, updated_at: new Date() })
    .where(eq(couponsTable.id, req.params.id))
    .returning();
  if (!coupon) return res.status(404).json({ error: "Not found" });
  res.json(coupon);
});

router.delete("/coupons/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.delete(couponsTable).where(eq(couponsTable.id, req.params.id));
  res.status(204).send();
});

export default router;
