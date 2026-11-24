import express, { type Express, type Request, type Response, type NextFunction } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { r2Get } from "./r2";

type ChurchSlidesDeps = {
  appDir?: string;
  getObject?: typeof r2Get;
};

const MIME_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

function defaultAppDir() {
  return path.resolve(__dirname, "../../church-display/app");
}

export function registerChurchSlidesRoutes(app: Express, deps: ChurchSlidesDeps = {}) {
  const router = express.Router();
  const appDir = deps.appDir || defaultAppDir();
  const getObject = deps.getObject || r2Get;

  app.get("/liturgy-slides", (req, res, next) => {
    if (req.path !== "/liturgy-slides") return next();
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.redirect(308, "/liturgy-slides/");
  });

  router.use((_req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  });

  const sendHtml = (filename: string) => async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const html = await fs.readFile(path.join(appDir, filename), "utf8");
      const withRobots = /<meta\s+name=["']robots["']/i.test(html)
        ? html
        : html.replace(/<head\b[^>]*>/i, (head) => `${head}\n  <meta name="robots" content="noindex">`);
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.type("html").send(withRobots);
    } catch (error) {
      next(error);
    }
  };

  router.get("/", sendHtml("index.html"));
  router.get("/index.html", sendHtml("index.html"));
  router.get("/display.html", sendHtml("display.html"));

  router.use("/out", async (req, res, next) => {
    if (req.method !== "GET") return next();
    let relative: string;
    try {
      relative = decodeURIComponent(req.path).replace(/^\/+/, "");
    } catch {
      return res.status(400).send("Invalid path");
    }
    const parts = relative.split("/");
    const extension = path.posix.extname(relative).toLowerCase();
    if (
      !relative ||
      relative.length > 1000 ||
      relative.includes("\\") ||
      parts.some((part) => !part || part === "." || part === "..") ||
      !MIME_TYPES[extension]
    ) {
      return res.status(400).send("Invalid path");
    }

    try {
      const object = await getObject(`church-slides/out/${relative}`);
      if (!object) return res.status(404).send("Not found");
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      res.setHeader("Content-Type", MIME_TYPES[extension]);
      return res.status(200).send(object.body);
    } catch (error) {
      return next(error);
    }
  });

  router.use(express.static(appDir, {
    index: false,
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }));

  router.use((_req, res) => res.status(404).send("Not found"));
  app.use("/liturgy-slides", router);
}
