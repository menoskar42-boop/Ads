import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { Router, type RequestHandler } from "express";
import {
  configuredVapidPublicKey,
  hasMessengerPushSchema,
} from "../lib/messenger-web-push";

type DbPool = Awaited<ReturnType<typeof loadPool>>;

async function loadPool() {
  if (!process.env.ADS_DATABASE_URL) return null;
  const db = await import("@workspace/db");
  return db.pool;
}

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

function userIdFrom(res: Parameters<RequestHandler>[1]): string {
  return String(res.locals.userId);
}

function requirePool(pool: DbPool, res: Parameters<RequestHandler>[1]) {
  if (!pool) {
    res.status(503).json({ error: "Messenger storage is not configured" });
    return null;
  }
  return pool;
}

function validEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length >= 1000) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function validPushKey(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length < 200 &&
    /^[A-Za-z0-9_-]+$/.test(value);
}

router.get("/messenger/push/capability", requireAuth, async (_req, res, next) => {
  try {
    const publicKey = configuredVapidPublicKey();
    const pool = await loadPool();
    const schemaReady = pool ? await hasMessengerPushSchema(pool) : false;
    const enabled = Boolean(publicKey && schemaReady);
    const reason = enabled
      ? null
      : !publicKey
        ? "push_not_configured"
        : "database_update_required";
    res.json({
      enabled,
      reason,
      publicKey: enabled ? publicKey : null,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/messenger/push/subscriptions", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool) return;
    if (!configuredVapidPublicKey()) {
      res.status(503).json({ error: "Web Push is not configured", reason: "push_not_configured" });
      return;
    }
    if (!(await hasMessengerPushSchema(pool))) {
      res.status(503).json({ error: "Web Push database update is required", reason: "database_update_required" });
      return;
    }

    const endpoint = req.body?.endpoint;
    const p256dh = req.body?.keys?.p256dh;
    const auth = req.body?.keys?.auth;
    if (!validEndpoint(endpoint) || !validPushKey(p256dh) || !validPushKey(auth)) {
      res.status(400).json({ error: "Check the push subscription and try again" });
      return;
    }

    const userId = userIdFrom(res);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1)::bigint)", [userId]);
      await client.query(
        `INSERT INTO messenger_push_subscriptions
           (id, user_id, endpoint, p256dh, auth, created_at, last_success_at)
         VALUES ($1, $2, $3, $4, $5, now(), NULL)
         ON CONFLICT (endpoint) DO UPDATE SET
           user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           created_at = now(),
           last_success_at = NULL`,
        [randomUUID(), userId, endpoint, p256dh, auth],
      );
      await client.query(
        `DELETE FROM messenger_push_subscriptions
         WHERE id IN (
           SELECT id FROM messenger_push_subscriptions
           WHERE user_id = $1
           ORDER BY created_at DESC, id DESC
           OFFSET 5
         )`,
        [userId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete("/messenger/push/subscriptions", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool) return;
    if (!(await hasMessengerPushSchema(pool))) {
      res.status(503).json({ error: "Web Push database update is required", reason: "database_update_required" });
      return;
    }
    const endpoint = req.body?.endpoint;
    if (!validEndpoint(endpoint)) {
      res.status(400).json({ error: "Check the push subscription and try again" });
      return;
    }
    await pool.query(
      `DELETE FROM messenger_push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
      [userIdFrom(res), endpoint],
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.put("/messenger/profile/push-preview", requireAuth, async (req, res, next) => {
  try {
    const pool = requirePool(await loadPool(), res);
    if (!pool) return;
    if (!(await hasMessengerPushSchema(pool))) {
      res.status(503).json({ error: "Web Push database update is required", reason: "database_update_required" });
      return;
    }
    if (typeof req.body?.pushShowPreview !== "boolean") {
      res.status(400).json({ error: "Choose whether to show message previews" });
      return;
    }
    const result = await pool.query(
      `UPDATE messenger_profiles
       SET push_show_preview = $1, updated_at = now()
       WHERE user_id = $2
       RETURNING push_show_preview`,
      [req.body.pushShowPreview, userIdFrom(res)],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Complete profile setup first" });
      return;
    }
    res.json({ pushShowPreview: Boolean(result.rows[0].push_show_preview) });
  } catch (error) {
    next(error);
  }
});

export default router;
