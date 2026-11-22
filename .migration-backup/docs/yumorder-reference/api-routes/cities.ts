import { Router } from "express";
import { db, citiesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

function parseBool(val: string | undefined): boolean | undefined {
  if (val === "true") return true;
  if (val === "false") return false;
  return undefined;
}

router.get("/cities", async (req, res) => {
  const activeOnly = parseBool(req.query.is_active as string);
  const cities = await db.select().from(citiesTable).orderBy(asc(citiesTable.sort_order));
  const result = activeOnly !== undefined ? cities.filter(c => c.is_active === activeOnly) : cities;
  res.json(result);
});

router.post("/cities", requireAuth, requireRole("admin"), async (req, res) => {
  const [city] = await db.insert(citiesTable).values(req.body).returning();
  res.status(201).json(city);
});

router.patch("/cities/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const [city] = await db.update(citiesTable)
    .set(req.body)
    .where(eq(citiesTable.id, req.params.id))
    .returning();
  if (!city) return res.status(404).json({ error: "Not found" });
  res.json(city);
});

router.delete("/cities/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.delete(citiesTable).where(eq(citiesTable.id, req.params.id));
  res.status(204).send();
});

export default router;
