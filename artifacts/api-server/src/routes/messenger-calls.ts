import { getAuth } from "@clerk/express";
import { Router, type RequestHandler } from "express";
import {
  answerMessengerCall,
  endMessengerCall,
  getActiveMessengerCall,
  getMessengerCallSignals,
  messengerIceServersFromConfig,
  publishExpiredMessengerCallEvents,
  publishMessengerCallEvent,
  sendMessengerCallSignal,
  startMessengerCall,
} from "../lib/messenger-calls.ts";
import { notifyMessengerIncomingCall } from "../lib/messenger-web-push.ts";

type DbPool = Awaited<ReturnType<typeof loadPool>>;

async function loadPool() {
  if (!process.env.ADS_DATABASE_URL) return null;
  const db = await import("@workspace/db");
  return db.pool;
}

const router = Router();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.locals.userId = userId;
  next();
};

function getUserId(res: Parameters<RequestHandler>[1]): string {
  return String(res.locals.userId);
}

function requirePool(pool: DbPool, res: Parameters<RequestHandler>[1]) {
  if (!pool) {
    res.status(503).json({ error: "Messenger storage is not configured" });
    return null;
  }
  return pool;
}

function sendFailure(
  res: Parameters<RequestHandler>[1],
  result: { ok: false; status: number; error: string },
): void {
  res.status(result.status).json({ error: result.error });
}

router.post(
  "/messenger/conversations/:conversationId/calls",
  requireAuth,
  async (req, res, next): Promise<void> => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const conversationId = String(req.params.conversationId);
      const result = await startMessengerCall(
        pool,
        conversationId,
        getUserId(res),
      );
      publishExpiredMessengerCallEvents(pool);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }

      await publishMessengerCallEvent(pool, result.call.id, result.notifyUserIds);
      let callerName = "مستخدم";
      try {
        const nameResult = await pool.query(
          "SELECT display_name FROM messenger_profiles WHERE user_id = $1",
          [getUserId(res)],
        );
        callerName = String(nameResult.rows[0]?.display_name ?? callerName);
      } catch {
        // The call must not depend on the optional notification name lookup.
      }
      void notifyMessengerIncomingCall(pool, {
        callerId: getUserId(res),
        calleeId: result.call.calleeId,
        callerName,
        conversationId,
        callId: result.call.id,
      });
      res.status(201).json({ call: result.call });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/calls/:callId/accept",
  requireAuth,
  async (req, res, next): Promise<void> => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const result = await answerMessengerCall(
        pool,
        String(req.params.callId),
        getUserId(res),
        "accept",
      );
      publishExpiredMessengerCallEvents(pool);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      await publishMessengerCallEvent(pool, result.call.id, result.notifyUserIds);
      res.json({ call: result.call });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/calls/:callId/reject",
  requireAuth,
  async (req, res, next): Promise<void> => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const result = await answerMessengerCall(
        pool,
        String(req.params.callId),
        getUserId(res),
        "reject",
      );
      publishExpiredMessengerCallEvents(pool);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      await publishMessengerCallEvent(pool, result.call.id, result.notifyUserIds);
      res.json({ call: result.call });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/calls/:callId/end",
  requireAuth,
  async (req, res, next): Promise<void> => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const result = await endMessengerCall(
        pool,
        String(req.params.callId),
        getUserId(res),
      );
      publishExpiredMessengerCallEvents(pool);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      await publishMessengerCallEvent(pool, result.call.id, result.notifyUserIds);
      res.json({ call: result.call });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/messenger/calls/:callId/signal",
  requireAuth,
  async (req, res, next): Promise<void> => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const { kind, payload } = req.body ?? {};

      const result = await sendMessengerCallSignal(
        pool,
        String(req.params.callId),
        getUserId(res),
        kind,
        payload,
      );
      publishExpiredMessengerCallEvents(pool);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      await publishMessengerCallEvent(pool, result.call.id, result.notifyUserIds);
      res.status(202).json({ accepted: true, seq: result.seq });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/messenger/calls/:callId/signals",
  requireAuth,
  async (req, res, next): Promise<void> => {
    try {
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
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const result = await getMessengerCallSignals(
        pool,
        String(req.params.callId),
        getUserId(res),
        since,
      );
      publishExpiredMessengerCallEvents(pool);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      res.json({
        call: result.call,
        signals: result.signals,
        nextSince: result.nextSince,
        reset: result.reset,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/messenger/calls/active",
  requireAuth,
  async (req, res, next): Promise<void> => {
    try {
      const pool = requirePool(await loadPool(), res);
      if (!pool) return;
      const result = await getActiveMessengerCall(pool, getUserId(res));
      publishExpiredMessengerCallEvents(pool);
      if (!result.ok) {
        sendFailure(res, result);
        return;
      }
      res.json({ call: result.call });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/messenger/calls/config", requireAuth, (_req, res) => {
  res.json({
    iceServers: messengerIceServersFromConfig(
      process.env.MESSENGER_ICE_SERVERS,
    ),
  });
});

export default router;
