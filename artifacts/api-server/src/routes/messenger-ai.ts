import { getAuth } from "@clerk/express";
import { Router, type Request, type RequestHandler } from "express";
import {
  createGeminiLiveToken,
  endGeminiLiveSession,
  parseGeminiLiveOptions,
  type GeminiLiveTokenResult,
} from "../lib/messenger-ai-live.ts";

type Dependencies = {
  getUserId?: (req: Request) => string | null;
  getApiKey?: () => string | undefined;
  createToken?: (userId: string) => Promise<GeminiLiveTokenResult>;
};

export function createMessengerAiRouter(dependencies: Dependencies = {}) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });

  const requireAuth: RequestHandler = (req, res, next) => {
    const userId = dependencies.getUserId
      ? dependencies.getUserId(req)
      : getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    res.locals.userId = userId;
    next();
  };

  router.post("/messenger/ai/live-session", requireAuth, async (req, res) => {
    const userId = String(res.locals.userId);
    const options = parseGeminiLiveOptions(req.body);
    const result = dependencies.createToken
      ? await dependencies.createToken(userId)
      : await createGeminiLiveToken(
          userId,
          dependencies.getApiKey
            ? dependencies.getApiKey()
            : process.env.GEMINI_API_KEY,
          fetch,
          undefined,
          Date.now(),
          options,
        );
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({
      token: result.token,
      model: result.model,
      ...("setup" in result && result.setup ? { setup: result.setup } : {}),
    });
  });

  router.post("/messenger/ai/live-session/end", requireAuth, (_req, res) => {
    endGeminiLiveSession(String(res.locals.userId));
    res.status(204).end();
  });

  return router;
}

export default createMessengerAiRouter();
