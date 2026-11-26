import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { existsSync } from "node:fs";
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

type ZipSourceFile = {
  fullPath: string;
  archivePath: string;
  size: number;
  mtimeMs: number;
};

type ZipCache = {
  manifest: string;
  builtAt: number;
  buffer: Buffer;
};

const ZIP_CACHE_TTL_MS = 60 * 60 * 1000;
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let remainder = value;
  for (let bit = 0; bit < 8; bit += 1) {
    remainder = remainder & 1 ? 0xedb88320 ^ (remainder >>> 1) : remainder >>> 1;
  }
  return remainder >>> 0;
});

function crc32(buffer: Buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function collectZipFiles(churchDisplayDir: string): Promise<ZipSourceFile[]> {
  const files: ZipSourceFile[] = [];
  const addFile = async (fullPath: string, archivePath: string) => {
    const info = await fs.stat(fullPath);
    if (!info.isFile()) return;
    files.push({ fullPath, archivePath, size: info.size, mtimeMs: info.mtimeMs });
  };

  const walk = async (directory: string) => {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name.startsWith(".") ||
        entry.name === "test" ||
        entry.name === "node_modules" ||
        entry.isSymbolicLink()
      ) {
        continue;
      }
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(churchDisplayDir, fullPath).split(path.sep).join("/");
        await addFile(fullPath, path.posix.join("church-display", relativePath));
      }
    }
  };

  for (const directoryName of ["app", "export", "sample"]) {
    const directory = path.join(churchDisplayDir, directoryName);
    if (existsSync(directory)) await walk(directory);
  }
  for (const filename of ["service-rules.js", "service-rules.json", "README.md"]) {
    const fullPath = path.join(churchDisplayDir, filename);
    if (existsSync(fullPath)) await addFile(fullPath, path.posix.join("church-display", filename));
  }

  return files.sort((left, right) => left.archivePath.localeCompare(right.archivePath));
}

async function createStoreZip(files: ZipSourceFile[]) {
  if (files.length > 0xffff) throw new Error("Too many files for a standard ZIP archive");

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = Buffer.from(file.archivePath, "utf8");
    const content = await fs.readFile(file.fullPath);
    if (content.length > 0xffffffff || localOffset > 0xffffffff) {
      throw new Error("Church display archive exceeds standard ZIP limits");
    }
    const checksum = crc32(content);
    const { time, day } = dosDateTime(new Date(file.mtimeMs));

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(day, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(day, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  if (centralDirectory.length > 0xffffffff || localOffset > 0xffffffff) {
    throw new Error("Church display archive exceeds standard ZIP limits");
  }
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(localOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function defaultAppDir() {
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : null;
  const candidates = [
    entry ? path.resolve(path.dirname(entry), "../../church-display/app") : null,
    path.resolve(process.cwd(), "../church-display/app"),
    path.resolve(process.cwd(), "church-display/app"),
    path.resolve(process.cwd(), ".migration-backup/church-display/app"),
  ].filter((candidate): candidate is string => candidate !== null);
  return candidates.find((candidate) => existsSync(path.join(candidate, "index.html"))) ?? candidates[0];
}

export function registerChurchSlidesRoutes(app: Express, deps: ChurchSlidesDeps = {}) {
  const router = express.Router();
  const appDir = deps.appDir || defaultAppDir();
  const getObject = deps.getObject || r2Get;
  let zipCache: ZipCache | null = null;

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

  router.get("/church-display-pc.zip", async (_req, res, next) => {
    try {
      if (!existsSync(path.join(appDir, "index.html"))) {
        return res.status(404).send("البرنامج مش متاح دلوقتى");
      }
      const churchDisplayDir = path.dirname(appDir);
      const files = await collectZipFiles(churchDisplayDir);
      const manifest = files.map((file) => `${file.archivePath}\0${file.size}\0${file.mtimeMs}`).join("\n");
      const now = Date.now();
      if (zipCache && zipCache.manifest === manifest && now - zipCache.builtAt < ZIP_CACHE_TTL_MS) {
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", 'attachment; filename="church-display-pc.zip"');
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        res.setHeader("Cache-Control", "no-cache");
        return res.status(200).send(zipCache.buffer);
      }

      const archive = await createStoreZip(files);
      zipCache = { manifest, builtAt: now, buffer: archive };
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="church-display-pc.zip"');
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.setHeader("Cache-Control", "no-cache");
      return res.status(200).send(archive);
    } catch (error) {
      return next(error);
    }
  });

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
