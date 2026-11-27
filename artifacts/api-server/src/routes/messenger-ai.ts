import { getAuth } from "@clerk/express";
import express, { Router, type Request, type RequestHandler } from "express";
import {
  createGeminiLiveToken,
  endGeminiLiveSession,
  parseGeminiLiveOptions,
  type GeminiLiveTokenResult,
} from "../lib/messenger-ai-live.ts";
import { synthesizeGeminiSpeech } from "../lib/messenger-ai-tts.ts";
import {
  baseAudioType,
  listenAndRespond,
  listenAndReplyForCall,
  parseTurnUpload,
  reserveTurn,
  respondTurn,
  TURN_DAILY_LIMIT,
  TURN_MAX_AUDIO_BYTES,
  TURN_MAX_CONTEXT_BYTES,
  type Usage,
} from "../lib/messenger-ai-turn.ts";

type Dependencies = {
  getUserId?: (req: Request) => string | null;
  getApiKey?: () => string | undefined;
  createToken?: (userId: string) => Promise<GeminiLiveTokenResult>;
  fetcher?: typeof fetch;
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

  // Turn mode (owner's choice 2026-11-27): one request ⇒ what the user said + the reply.
  const apiKey = () => (dependencies.getApiKey ? dependencies.getApiKey() : process.env.GEMINI_API_KEY);
  const fetcher = dependencies.fetcher ?? fetch;
  // All Gemini requests, including tool follow-ups, share one per-user daily budget.
  const turnUsage: Usage = new Map();
  const parseTurnBody: RequestHandler = (req, res, next) => {
    express.raw({
      type: "application/octet-stream",
      limit: TURN_MAX_AUDIO_BYTES + TURN_MAX_CONTEXT_BYTES + 4,
    })(req, res, (error: unknown) => {
      if (error) {
        res.status(413).json({ error: "التسجيل أطول من اللازم." });
        return;
      }
      next();
    });
  };

  router.post("/messenger/ai/turn", requireAuth, parseTurnBody, async (req, res) => {
    const upload = parseTurnUpload(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    if (!upload.ok) {
      res.status(upload.status).json({ error: upload.error });
      return;
    }
    const mimeType = baseAudioType(upload.context.mimeType);
    if (!mimeType) {
      res.status(415).json({ error: "نوع التسجيل مش مدعوم." });
      return;
    }
    const limited = reserveTurn(String(res.locals.userId), turnUsage);
    if (limited) {
      res.status(limited.status).json({ error: limited.error });
      return;
    }
    const result = await listenAndRespond(
      apiKey(),
      upload.audio,
      mimeType,
      upload.context.history,
      parseGeminiLiveOptions(upload.context),
      fetcher,
    );
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const { ok: _ok, ...reply } = result;
    res.json(reply);
  });

  router.post("/messenger/ai/tts", requireAuth, async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    const voice = req.body?.voice === "male" ? "male" : "female";
    if (!text || text.length > 1_200) {
      res.status(400).json({ error: "النص فاضي أو أطول من اللازم." });
      return;
    }
    const limited = reserveTurn(String(res.locals.userId), turnUsage, Date.now(), TURN_DAILY_LIMIT);
    if (limited) {
      res.status(limited.status).json({ error: limited.error });
      return;
    }
    const result = await synthesizeGeminiSpeech(apiKey(), text, voice, fetcher);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Content-Length", String(result.audio.length));
    res.setHeader("Cache-Control", "private, no-store");
    res.send(result.audio);
  });

  router.post("/messenger/ai/call-turn", requireAuth, parseTurnBody, async (req, res) => {
    const upload = parseTurnUpload(Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
    if (!upload.ok) {
      res.status(upload.status).json({ error: upload.error });
      return;
    }
    const mimeType = baseAudioType(upload.context.mimeType);
    if (!mimeType) {
      res.status(415).json({ error: "نوع التسجيل مش مدعوم." });
      return;
    }
    const limited = reserveTurn(String(res.locals.userId), turnUsage);
    if (limited) {
      res.status(limited.status).json({ error: limited.error });
      return;
    }
    const result = await listenAndReplyForCall(apiKey(), upload.audio, mimeType, fetcher);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json({ reply: result.reply });
  });

  router.post("/messenger/ai/turn/follow-up", requireAuth, async (req, res) => {
    const limited = reserveTurn(String(res.locals.userId), turnUsage, Date.now(), TURN_DAILY_LIMIT);
    if (limited) {
      res.status(limited.status).json({ error: limited.error });
      return;
    }
    const result = await respondTurn(apiKey(), req.body?.contents, parseGeminiLiveOptions(req.body), fetcher);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const { ok: _ok, ...reply } = result;
    res.json(reply);
  });

  return router;
}

export default createMessengerAiRouter();
