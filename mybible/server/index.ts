import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { registerRoutes } from "./routes";
import { registerGroupRoutes } from "./group-routes";
import { registerChurchRoutes } from "./church-routes";
import { registerChallengeRoutes } from "./challenge-routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { autoSeedIfNeeded } from "./auto-seed";
import { botSnapshotMiddleware } from "./bot-snapshot";
import { sitemapHandler, robotsHandler, llmsHandler, sitemapBibleHandler, sitemapOrthodoxHandler, sitemapPagesHandler, sitemapTopicsHandler, sitemapSearchHandler, sitemapVideosHandler, sitemapListenHandler, sitemapChurchesHandler, sitemapKholagyHandler, sitemapNewsHandler } from "./sitemap-generator";
import { INDEXNOW_KEY, indexNowKeyFileHandler, indexNowPingHandler, scheduleIndexNow } from "./indexnow";
import { ogImageHandler } from "./og-image";
import { setupVapid, scheduleDailyNotification } from "./push-notifications";

const app = express();
const httpServer = createServer({ maxHeaderSize: 65536 }, app);

const SERVER_START_TIME = Date.now();
app.get('/api/app-version', (_req, res) => {
  res.json({ version: SERVER_START_TIME });
});

// Trust the proxy in production (Replit's reverse proxy)
app.set('trust proxy', 1);

// Detect if we're running behind Replit's HTTPS proxy
const isProduction = process.env.NODE_ENV === 'production';

// Setup PostgreSQL session store for production compatibility
const PgSession = connectPgSimple(session);
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(
  session({
    store: new PgSession({
      pool: pgPool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'bible-companion-secret-key-change-in-production',
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    },
  })
);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '5mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);
  registerGroupRoutes(app);
  registerChurchRoutes(app);
  registerChallengeRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  app.get("/sitemap.xml", sitemapHandler);
  app.get("/sitemap-pages.xml", sitemapPagesHandler);
  app.get("/sitemap-bible.xml", sitemapBibleHandler);
  app.get("/sitemap-orthodox.xml", sitemapOrthodoxHandler);
  app.get("/sitemap-kholagy.xml", sitemapKholagyHandler);
  app.get("/sitemap-topics.xml", sitemapTopicsHandler);
  app.get("/sitemap-search.xml", sitemapSearchHandler);
  app.get("/sitemap-videos.xml", sitemapVideosHandler);
  app.get("/sitemap-listen.xml", sitemapListenHandler);
  app.get("/sitemap-churches.xml", sitemapChurchesHandler);
  app.get("/sitemap-news.xml", sitemapNewsHandler);
  app.get("/api/og-image", ogImageHandler);
  app.get("/robots.txt", robotsHandler);
  app.get("/llms.txt", llmsHandler);
  app.get(`/${INDEXNOW_KEY}.txt`, indexNowKeyFileHandler);
  app.post("/api/indexnow-ping", indexNowPingHandler);

  setupVapid();
  scheduleDailyNotification();
  scheduleIndexNow();

  app.use(botSnapshotMiddleware);

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      
      // إضافة أعمدة جديدة إن لم تكن موجودة (migration آمنة)
      pgPool.query(`ALTER TABLE reading_groups ADD COLUMN IF NOT EXISTS auto_reading_config jsonb DEFAULT NULL`)
        .catch(e => console.warn('[migration] auto_reading_config:', e.message));
      pgPool.query(`ALTER TABLE reading_groups ADD COLUMN IF NOT EXISTS messaging_mode text DEFAULT 'all'`)
        .catch(e => console.warn('[migration] reading_groups.messaging_mode:', e.message));

      pgPool.query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS image_url text`)
        .catch(e => console.warn('[migration] group_messages.image_url:', e.message));
      pgPool.query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_id integer`)
        .catch(e => console.warn('[migration] group_messages.reply_to_id:', e.message));
      pgPool.query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_text text`)
        .catch(e => console.warn('[migration] group_messages.reply_to_text:', e.message));
      pgPool.query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reply_to_user_name text`)
        .catch(e => console.warn('[migration] group_messages.reply_to_user_name:', e.message));
      pgPool.query(`ALTER TABLE group_messages ADD COLUMN IF NOT EXISTS reactions jsonb DEFAULT '[]'::jsonb`)
        .catch(e => console.warn('[migration] group_messages.reactions:', e.message));

      pgPool.query(`CREATE TABLE IF NOT EXISTS group_push_subscriptions (
        id serial primary key,
        group_id integer not null,
        group_code text not null,
        user_name text not null,
        member_key text not null,
        endpoint text not null,
        p256dh text not null,
        auth text not null,
        created_at timestamp default now(),
        updated_at timestamp default now(),
        UNIQUE(group_id, endpoint)
      )`).catch(e => console.warn('[migration] group_push_subscriptions:', e.message));

      // ترقية constraint من UNIQUE(endpoint) إلى UNIQUE(group_id, endpoint)
      // على القواعد القديمة التي أُنشئت قبل هذا التعديل
      pgPool.query(`
        ALTER TABLE group_push_subscriptions DROP CONSTRAINT IF EXISTS group_push_subscriptions_endpoint_key;
        CREATE UNIQUE INDEX IF NOT EXISTS gps_group_endpoint_idx ON group_push_subscriptions(group_id, endpoint)
      `).catch(e => console.warn('[migration] gps constraint upgrade:', e.message));

      pgPool.query(`CREATE TABLE IF NOT EXISTS app_settings (
        key text primary key,
        value text not null,
        updated_at timestamp default now()
      )`).catch(e => console.warn('[migration] app_settings:', e.message));

      // تنظيف الأعضاء المكررين بنفس رقم الموبايل في المجموعة الواحدة
      // يحتفظ بالأدمن إن وُجد، وإلا بالأحدث تاريخاً
      pgPool.query(`
        DELETE FROM group_members gm
        WHERE gm.phone IS NOT NULL
          AND gm.id NOT IN (
            SELECT DISTINCT ON (group_id, phone)
              CASE WHEN bool_or(is_admin) OVER (PARTITION BY group_id, phone)
                   THEN first_value(id) OVER (PARTITION BY group_id, phone ORDER BY is_admin DESC, joined_at DESC)
                   ELSE first_value(id) OVER (PARTITION BY group_id, phone ORDER BY joined_at DESC)
              END
            FROM group_members
            WHERE phone IS NOT NULL
          )
      `).then(r => {
        if (r.rowCount) console.log(`[startup] removed ${r.rowCount} duplicate group member(s) with same phone`);
      }).catch(e => console.warn('[migration] dedup group_members:', e.message));

      // إضافة unique index على (group_id, phone) لمنع التكرار مستقبلاً
      pgPool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS gm_group_phone_unique_idx
        ON group_members (group_id, phone)
        WHERE phone IS NOT NULL
      `).catch(e => console.warn('[migration] gm_group_phone_unique_idx:', e.message));

      // Run database seeding in the background after server starts
      console.log('[startup] Starting background database seed...');
      autoSeedIfNeeded()
        .then(() => {
          console.log('[startup] Background database seed complete');
        })
        .catch((error) => {
          console.error('[startup] Background database seed failed:', error);
        });
    },
  );
})();
