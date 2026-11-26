import { spawn } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import { r2Configured, r2Get, r2Put } from "../../mybible/server/r2.ts";

const R2_PREFIX = "church-slides/out/";
const LIBRARY_KEY = `${R2_PREFIX}library.js`;
const MAX_CAPTURED_OUTPUT = 20_000;
const R2_UPLOAD_CONCURRENCY = 3;
const COMMAND_TIMEOUT_MS = 30 * 60 * 1000;

function appendTail(current, text) {
  const combined = current + text;
  return combined.length > MAX_CAPTURED_OUTPUT
    ? combined.slice(-MAX_CAPTURED_OUTPUT)
    : combined;
}

function runCommand(command, args, { cwd, timeoutMs = COMMAND_TIMEOUT_MS, workDir } = {}) {
  const safeEnv = {
    PATH: process.env.PATH || "",
    HOME: process.env.HOME || os.tmpdir(),
    LANG: process.env.LANG || "C.UTF-8",
    LC_ALL: process.env.LC_ALL || "C.UTF-8",
    TMPDIR: workDir || os.tmpdir(),
  };

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: safeEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
      finish(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    child.stdout.on("data", (chunk) => { stdout = appendTail(stdout, chunk.toString()); });
    child.stderr.on("data", (chunk) => { stderr = appendTail(stderr, chunk.toString()); });
    child.on("error", (error) => finish(new Error(`${command} could not start: ${error.message}`)));
    child.on("close", (code, signal) => {
      if (code === 0) return finish(null, { stdout, stderr });
      const details = (stderr || stdout).trim().slice(-4_000);
      finish(new Error(`${command} exited ${code ?? signal}${details ? `: ${details}` : ""}`));
    });
  });
}

function validateSourcePath(source) {
  if (typeof source !== "string" || !source || source.includes("\\") || source.startsWith("/")) {
    throw new Error("Manifest source path is invalid");
  }
  const parts = source.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error("Manifest source path is invalid");
  }
  return parts.join("/");
}

function zipEntries(zip) {
  let endOffset = -1;
  const minOffset = Math.max(0, zip.length - 65_557);
  for (let offset = zip.length - 22; offset >= minOffset; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Presentation archive has no ZIP directory");

  const entryCount = zip.readUInt16LE(endOffset + 10);
  const directoryOffset = zip.readUInt32LE(endOffset + 16);
  if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
    throw new Error("ZIP64 presentation archives are not supported");
  }

  const entries = new Map();
  let cursor = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("Presentation archive has an invalid ZIP directory");
    }
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (flags & 1) throw new Error("Encrypted presentation archives are not supported");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error("ZIP64 presentation archives are not supported");
    }

    if (!name.endsWith("/")) {
      if (zip.readUInt32LE(localOffset) !== 0x04034b50) {
        throw new Error("Presentation archive has an invalid local file header");
      }
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataOffset, dataOffset + compressedSize);
      let content;
      if (method === 0) content = Buffer.from(compressed);
      else if (method === 8) content = inflateRawSync(compressed);
      else throw new Error(`Unsupported ZIP compression method ${method}`);
      if (content.length !== uncompressedSize) {
        throw new Error(`Invalid uncompressed size for ${name}`);
      }
      entries.set(name, content);
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function xmlAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*["']([^"']*)["']`));
  return match?.[1] ?? null;
}

function xmlText(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const codePoint = entity[1].toLowerCase() === "x"
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return ({
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
    })[entity.toLowerCase()] ?? match;
  });
}

function presentationSlides(zip) {
  const entries = zipEntries(zip);
  const presentation = entries.get("ppt/presentation.xml")?.toString("utf8");
  const relationships = entries.get("ppt/_rels/presentation.xml.rels")?.toString("utf8");
  if (!presentation || !relationships) {
    throw new Error("Presentation XML or relationships are missing");
  }

  const relationshipTargets = new Map();
  for (const tag of relationships.match(/<Relationship\b[^>]*\/?>/g) || []) {
    const id = xmlAttribute(tag, "Id");
    const target = xmlAttribute(tag, "Target");
    if (id && target) {
      relationshipTargets.set(
        id,
        target.startsWith("/")
          ? path.posix.normalize(target.slice(1))
          : path.posix.normalize(path.posix.join("ppt", target)),
      );
    }
  }

  const slideOrder = [];
  for (const tag of presentation.match(/<p:sldId\b[^>]*\/?>/g) || []) {
    const relationshipId = xmlAttribute(tag, "r:id");
    const target = relationshipId ? relationshipTargets.get(relationshipId) : null;
    if (target) slideOrder.push(target);
  }
  if (!slideOrder.length) throw new Error("Presentation slide order is missing");

  return slideOrder.map((target, index) => {
    const xml = entries.get(target)?.toString("utf8");
    if (!xml) throw new Error(`Slide XML ${index + 1} is missing`);
    const rootTag = xml.match(/<p:sld\b[^>]*>/)?.[0] || "";
    const show = xmlAttribute(rootTag, "show");
    const text = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
      .map((match) => xmlText(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")))
      .join("\n");
    return {
      n: index + 1,
      hidden: show === "0" || show?.toLowerCase() === "false",
      text,
    };
  });
}

function parseLibrary(body) {
  const source = body.toString("utf8").replace(/^\uFEFF/, "");
  const match = source.match(/^\s*window\.CHURCH_LIBRARY\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error("Existing R2 library.js is not in the expected format");
  const parsed = JSON.parse(match[1]);
  if (!parsed || !Array.isArray(parsed.decks)) {
    throw new Error("Existing R2 library.js has an invalid deck list");
  }
  return parsed;
}

async function getR2Object(key) {
  try {
    return await r2Get(key);
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    throw new Error(`R2 read failed for ${key}: ${message}`);
  }
}

async function putR2Object(key, body, contentType) {
  try {
    await r2Put(key, body, contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "request failed";
    throw new Error(`R2 write failed for ${key}: ${message}`);
  }
}

function isSkippedPresentation(name, source) {
  return name.startsWith("~$") ||
    name.startsWith("._") ||
    source.split("/").includes("__MACOSX");
}

async function downloadPublicDriveFile(id, outputPath, expectedSize) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{10,}$/.test(id)) {
    throw new Error("Manifest contains an invalid Drive file ID");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  try {
    const response = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, {
      signal: controller.signal,
      headers: { "User-Agent": "OscarDevs-Church-Slides-Converter/1.0" },
    });
    if (!response.ok) throw new Error(`Public Drive download returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (/text\/html/i.test(contentType)) {
      throw new Error("Drive returned a confirmation page instead of the presentation");
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length !== expectedSize) {
      throw new Error(`Downloaded size ${content.length} does not match Drive metadata ${expectedSize}`);
    }
    await writeFile(outputPath, content);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Public Drive download timed out");
    if (
      error instanceof Error &&
      /^(Public Drive download returned HTTP|Drive returned a confirmation page|Downloaded size)/.test(error.message)
    ) {
      throw error;
    }
    throw new Error("Public Drive download failed");
  } finally {
    clearTimeout(timer);
  }
}

function librarySource(library) {
  return `window.CHURCH_LIBRARY = ${JSON.stringify(library)};`;
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  let firstError;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (!firstError) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= items.length) return;
        try {
          await worker(items[index]);
        } catch (error) {
          firstError = error;
        }
      }
    },
  );
  await Promise.all(workers);
  if (firstError) throw firstError;
}

function indexedFiles(names) {
  return new Map(names
    .map((name) => [name.match(/^slide-(\d+)\.jpg$/i)?.[1], name])
    .filter(([number]) => number)
    .map(([number, name]) => [Number(number), name]));
}

async function processDeck(item, index, workspace, library, dryRun) {
  const source = validateSourcePath(item.source);
  const filename = path.posix.basename(source);
  if (isSkippedPresentation(filename, source)) {
    return { status: "skipped", source, slides: 0, uploadedBytes: 0, elapsedMs: 0 };
  }
  const extension = path.posix.extname(filename).toLowerCase();
  if (![".ppt", ".pptx", ".pptm"].includes(extension)) {
    throw new Error("Manifest contains a file that is not a PowerPoint presentation");
  }
  const size = Number(item.size);
  if (!Number.isSafeInteger(size) || size <= 0 || typeof item.mtime !== "string" || !item.mtime) {
    throw new Error("Manifest presentation metadata is invalid");
  }

  const startedAt = Date.now();
  const oldDeck = library.decks.find((deck) => deck.source === source);
  if (!dryRun && oldDeck && Number(oldDeck.size) === size && oldDeck.mtime === item.mtime) {
    const firstSlide = oldDeck.slides?.find((slide) => slide.file && !slide.error);
    if (firstSlide && await getR2Object(`${R2_PREFIX}${source}/${firstSlide.file}`)) {
      return {
        status: "unchanged",
        source,
        slides: Number(oldDeck.slideCount) || oldDeck.slides.length,
        uploadedBytes: 0,
        elapsedMs: Date.now() - startedAt,
      };
    }
  }

  const deckWorkspace = item.resumeWorkspace
    ? path.resolve(item.resumeWorkspace)
    : path.join(workspace, `deck-${index + 1}`);
  if (item.resumeWorkspace) {
    const tempRoot = path.resolve(os.tmpdir());
    if (!deckWorkspace.startsWith(`${tempRoot}${path.sep}`)) {
      throw new Error("Manifest resume workspace must be under the system temporary directory");
    }
  }
  const downloadDir = path.join(deckWorkspace, "download");
  const pdfDir = path.join(deckWorkspace, "pdf");
  const pptxDir = path.join(deckWorkspace, "pptx");
  const renderedDir = path.join(deckWorkspace, "rendered");
  const outputDir = path.join(deckWorkspace, "output");
  await Promise.all([downloadDir, pdfDir, pptxDir, renderedDir, outputDir].map((directory) =>
    mkdir(directory, { recursive: true })));

  const localInput = path.join(downloadDir, `source${extension}`);
  let hasLocalInput = false;
  try {
    const existingInput = await stat(localInput);
    hasLocalInput = existingInput.isFile() && existingInput.size === size;
  } catch {}

  if (!hasLocalInput && typeof item.localPath === "string" && item.localPath.trim()) {
    const cachedPath = path.resolve(item.localPath);
    const tempRoot = path.resolve(os.tmpdir());
    if (!cachedPath.startsWith(`${tempRoot}${path.sep}`)) {
      throw new Error("Manifest cached file must be under the system temporary directory");
    }
    const cachedFile = await stat(cachedPath);
    if (!cachedFile.isFile() || cachedFile.size !== size) {
      throw new Error(`Cached file size does not match Drive metadata ${size}`);
    }
    await copyFile(cachedPath, localInput);
  } else if (!hasLocalInput) {
    await downloadPublicDriveFile(item.id || item.driveFileId, localInput, size);
  }

  let textSource = localInput;
  if (extension === ".ppt") {
    const conversion = await runCommand("soffice", [
      `-env:UserInstallation=${pathToFileURL(path.join(deckWorkspace, "lo-profile")).href}`,
      "--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck",
      "--convert-to", "pptx", "--outdir", pptxDir, localInput,
    ], { workDir: deckWorkspace });
    textSource = path.join(pptxDir, "source.pptx");
    try {
      await stat(textSource);
    } catch {
      throw new Error(`LibreOffice did not create the editable presentation${conversion.stderr ? `: ${conversion.stderr.slice(-1000)}` : ""}`);
    }
  }

  const slides = presentationSlides(await readFile(textSource));
  const pdfPath = path.join(pdfDir, "source.pdf");
  let renderedByPage = indexedFiles(await readdir(renderedDir));
  let outputByPage = indexedFiles(await readdir(outputDir));
  const hasCompleteLocalImages = item.resumeWorkspace &&
    slides.every((slide) => renderedByPage.has(slide.n) || outputByPage.has(slide.n));

  if (!hasCompleteLocalImages) {
    const profileUrl = pathToFileURL(path.join(deckWorkspace, "lo-profile")).href;
    await runCommand("soffice", [
      `-env:UserInstallation=${profileUrl}`,
      "--headless", "--nologo", "--nodefault", "--norestore", "--nolockcheck",
      "--convert-to",
      'pdf:impress_pdf_Export:{"ExportHiddenSlides":{"type":"boolean","value":"true"}}',
      "--outdir", pdfDir, localInput,
    ], { workDir: deckWorkspace });

    try {
      await stat(pdfPath);
    } catch {
      throw new Error("LibreOffice did not create a PDF");
    }
    const imagePrefix = path.join(renderedDir, "slide");
    await runCommand("pdftoppm", [
      "-jpeg",
      "-scale-to-x", "1920",
      "-scale-to-y", "-1",
      "-jpegopt", "quality=90",
      pdfPath,
      imagePrefix,
    ], { workDir: deckWorkspace });
    renderedByPage = indexedFiles(await readdir(renderedDir));
    outputByPage = indexedFiles(await readdir(outputDir));
  }

  for (const slide of slides) {
    if (!renderedByPage.has(slide.n) && !outputByPage.has(slide.n)) {
      throw new Error(`Slide ${slide.n} is missing from rendered and saved images`);
    }
  }

  const outputSlides = slides.map((slide) => ({
    ...slide,
    file: `slide-${String(slide.n).padStart(3, "0")}.jpg`,
  }));
  await runWithConcurrency(outputSlides, 8, async (slide) => {
    const outputPath = path.join(outputDir, slide.file);
    if (!outputByPage.has(slide.n)) {
      const renderedName = renderedByPage.get(slide.n);
      if (!renderedName) throw new Error(`Rendered image for slide ${slide.n} is missing`);
      await rename(path.join(renderedDir, renderedName), outputPath);
      outputByPage.set(slide.n, slide.file);
    }
  });

  let uploadedBytes = 0;
  if (!dryRun) {
    await runWithConcurrency(outputSlides, R2_UPLOAD_CONCURRENCY, async (slide) => {
      const content = await readFile(path.join(outputDir, slide.file));
      await putR2Object(`${R2_PREFIX}${source}/${slide.file}`, content, "image/jpeg");
      uploadedBytes += content.length;
    });
  }

  const deck = {
    title: typeof item.title === "string" && item.title.trim()
      ? item.title.trim()
      : path.posix.basename(filename, extension),
    source,
    size,
    mtime: item.mtime,
    slideCount: outputSlides.length,
    slides: outputSlides,
  };
  const deckJson = Buffer.from(JSON.stringify(deck), "utf8");
  if (!dryRun) {
    await putR2Object(`${R2_PREFIX}${source}/deck.json`, deckJson, "application/json; charset=utf-8");
    uploadedBytes += deckJson.length;
    const mergedDecks = library.decks.filter((existing) => existing.source !== source);
    const updatedLibrary = {
      generatedAt: new Date().toISOString(),
      decks: [...mergedDecks, deck],
    };
    const libraryBytes = Buffer.from(librarySource(updatedLibrary), "utf8");
    await putR2Object(LIBRARY_KEY, libraryBytes, "application/javascript; charset=utf-8");
    uploadedBytes += libraryBytes.length;
    library.generatedAt = updatedLibrary.generatedAt;
    library.decks = updatedLibrary.decks;
  }

  return {
    status: dryRun ? "dry-run" : "uploaded",
    source,
    slides: outputSlides.length,
    hiddenSlides: outputSlides.filter((slide) => slide.hidden).length,
    uploadedBytes,
    elapsedMs: Date.now() - startedAt,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const manifestPath = args.find((argument) => !argument.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  if (!manifestPath) {
    throw new Error("Usage: node --experimental-strip-types convert-online.mjs <manifest.json> [--dry-run]");
  }
  if (!dryRun && !r2Configured()) throw new Error("R2 is not configured");

  const manifest = JSON.parse(await readFile(path.resolve(manifestPath), "utf8"));
  const files = Array.isArray(manifest) ? manifest : manifest.files;
  if (!Array.isArray(files) || !files.length) throw new Error("Manifest must contain a non-empty files array");

  let workspace;
  if (typeof manifest.workspaceRoot === "string" && manifest.workspaceRoot.trim()) {
    workspace = path.resolve(manifest.workspaceRoot);
    const tempRoot = path.resolve(os.tmpdir());
    if (!workspace.startsWith(`${tempRoot}${path.sep}`)) {
      throw new Error("Manifest workspace root must be under the system temporary directory");
    }
    await mkdir(workspace, { recursive: true });
  } else {
    workspace = await mkdtemp(path.join(os.tmpdir(), "church-convert-"));
  }
  const startedAt = Date.now();
  const results = [];
  let library = { generatedAt: "", decks: [] };
  let fatalUploadError = null;

  try {
    if (!dryRun) {
      const current = await getR2Object(LIBRARY_KEY);
      if (current) library = parseLibrary(current.body);
    }

    for (let index = 0; index < files.length; index += 1) {
      const source = typeof files[index]?.source === "string" ? files[index].source : "(invalid source)";
      try {
        const result = await processDeck(files[index], index, workspace, library, dryRun);
        results.push(result);
        if (!dryRun && result.status === "uploaded") {
          const log = `${result.source}: uploaded ${result.slides} slides (${result.uploadedBytes} bytes)`;
          console.log(log);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown conversion error";
        results.push({
          status: "failed",
          source,
          error: message,
          slides: 0,
          uploadedBytes: 0,
          elapsedMs: 0,
        });
        console.error(`${source}: ${message}`);
        if (/R2 (?:read|write) failed/i.test(message)) {
          fatalUploadError = message;
        }
      }
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }

  const summary = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    dryRun,
    results,
    totals: {
      files: results.length,
      uploaded: results.filter((result) => result.status === "uploaded").length,
      unchanged: results.filter((result) => result.status === "unchanged").length,
      failed: results.filter((result) => result.status === "failed").length,
      slides: results.reduce((sum, result) => sum + (result.slides || 0), 0),
      uploadedBytes: results.reduce((sum, result) => sum + (result.uploadedBytes || 0), 0),
      elapsedMs: Date.now() - startedAt,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  if (fatalUploadError || summary.totals.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown conversion error";
  console.error(message);
  process.exitCode = 1;
});
