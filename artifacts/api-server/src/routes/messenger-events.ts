import { getAuth } from "@clerk/express";
import { Router, type RequestHandler } from "express";
import { waitForEvents } from "../lib/messenger-events.ts";

const router = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.locals.userId = userId;
  next();
};

router.get("/messenger/events", requireAuth, async (req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  const rawSince = req.query.since;
  const since = rawSince === undefined
    ? 0
    : typeof rawSince === "string" && /^\d{1,16}$/.test(rawSince)
      ? Number(rawSince)
      : Number.NaN;
  if (!Number.isSafeInteger(since) || since < 0) {
    res.status(400).json({ error: "قيمة since غير صحيحة." });
    return;
  }

  const controller = new AbortController();
  const abortIfClosed = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.on("aborted", abortIfClosed);
  res.on("close", abortIfClosed);
  try {
    const result = await waitForEvents(String(res.locals.userId), since, undefined, controller.signal);
    if (!res.destroyed && !res.writableEnded) res.json(result);
  } catch (error) {
    next(error);
  } finally {
    req.off("aborted", abortIfClosed);
    res.off("close", abortIfClosed);
  }
});

export default router;
