import { Router, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();
const objectStorageService = new ObjectStorageService();

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number().max(MAX_FILE_SIZE_BYTES, "File exceeds 10 MB limit"),
  contentType: z.string().refine(
    (t) => ALLOWED_IMAGE_TYPES.has(t),
    "Only image files are allowed (jpeg, png, webp, gif, avif)",
  ),
});

/**
 * POST /storage/uploads/request-url
 *
 * Returns a presigned GCS URL. Client uploads the file directly to GCS.
 * Requires auth and owner or admin role.
 */
router.post(
  "/storage/uploads/request-url",
  requireAuth,
  requireRole("restaurant_owner", "admin"),
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.errors[0]?.message ?? "Invalid request body",
      });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      req.log.error({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

/**
 * POST /storage/upload  (multipart upload for ImageUploader)
 *
 * Accepts a multipart image upload, validates type and size, uploads to GCS,
 * returns { path, url, objectPath }.
 *
 * Requires auth and owner or admin role.
 */
router.post(
  "/storage/upload",
  requireAuth,
  requireRole("restaurant_owner", "admin"),
  async (req: Request, res: Response) => {
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({ error: "Expected multipart/form-data" });
    }

    const boundary = contentType.split("boundary=")[1]?.trim();
    if (!boundary) return res.status(400).json({ error: "No boundary in Content-Type" });

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += (chunk as Buffer).length;
      if (totalBytes > MAX_FILE_SIZE_BYTES) {
        res.status(400).json({ error: "Request body exceeds the 10 MB size limit." });
        return;
      }
      chunks.push(chunk as Buffer);
    }
    const body = Buffer.concat(chunks);

    const boundaryBuf = Buffer.from(`--${boundary}`);
    let fileBuffer: Buffer | null = null;
    let mimeType = "application/octet-stream";
    let bucketArg = "images";

    let start = 0;
    while (start < body.length) {
      const bIdx = body.indexOf(boundaryBuf, start);
      if (bIdx === -1) break;
      const end = body.indexOf(boundaryBuf, bIdx + boundaryBuf.length);
      if (end === -1) break;
      const part = body.slice(bIdx + boundaryBuf.length, end);
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd !== -1) {
        const header = part.slice(0, headerEnd).toString();
        const data = part.slice(headerEnd + 4, part.length - 2);
        if (header.includes('name="file"')) {
          const ctMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
          if (ctMatch) mimeType = ctMatch[1].trim();
          fileBuffer = data;
        } else if (header.includes('name="bucket"')) {
          bucketArg = data.toString().trim() || bucketArg;
        }
      }
      start = end;
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return res.status(400).json({ error: "No file in upload" });
    }

    if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
      return res.status(400).json({
        error: "Invalid file type. Only JPEG, PNG, WebP, GIF, and AVIF images are allowed.",
      });
    }

    if (fileBuffer.length > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({ error: "File exceeds the 10 MB size limit." });
    }

    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(fileBuffer.length),
        },
        body: fileBuffer,
      });

      if (!putRes.ok) {
        req.log.error({ status: putRes.status }, "GCS PUT failed");
        res.status(502).json({ error: "Failed to store the file. Please try again." });
        return;
      }

      const url = `/api/storage/objects${objectPath.replace(/^\/objects/, "")}`;
      res.json({ path: `${bucketArg}/${objectPath.split("/").pop()}`, url, objectPath });
    } catch (error) {
      req.log.error({ err: error }, "Error uploading file to object storage");
      res.status(500).json({ error: "Upload failed" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 * Unconditionally public — serves assets uploaded via the Object Storage tool pane.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 * Serves user-uploaded object entities from GCS (durable, not /tmp).
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
