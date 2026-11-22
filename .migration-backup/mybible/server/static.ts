import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  const assetsPath = path.join(distPath, "assets");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Never send the SPA shell for a missing hashed asset. A browser tab that
  // survived a deployment can request an old chunk; returning index.html with
  // HTTP 200 makes the dynamic import fail with a misleading MIME/parse error
  // and leaves the tab stuck on the error boundary.
  app.use("/assets", (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const requested = path.resolve(assetsPath, "." + req.path);
    const relative = path.relative(assetsPath, requested);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return res.status(400).end();
    }
    if (!fs.existsSync(requested)) {
      return res.status(404).end();
    }
    return next();
  });

  // The HTML shell contains hashed asset names and must be revalidated after
  // every deployment. Hashed JS/CSS files remain cacheable by express.static.
  app.use("/sw.js", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    next();
  });
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      // Vite asset names are content-hashed. Let browsers reuse them for a
      // year so a burst of visitors does not repeatedly consume VM bandwidth
      // and CPU for identical JavaScript/CSS files.
      if (filePath.startsWith(assetsPath + path.sep)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
