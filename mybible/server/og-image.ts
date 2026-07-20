import sharp from "sharp";

const SITE = "https://mybible.oscardevs.com";
const W = 1200;
const H = 630;

// Arabic-safe SVG text — truncate if too long
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function xmlEsc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSvg(type: string, params: Record<string, string>): string {
  const gradient = type === "chapter"
    ? ["#1a3a2a", "#2d5a40"]   // Dark green for Bible chapters
    : type === "orthodox"
    ? ["#2a1a3a", "#5a2d7a"]   // Purple for orthodox
    : type === "emotion"
    ? ["#3a1a1a", "#7a3a2d"]   // Red for emotions
    : ["#1a2a3a", "#2d405a"];  // Default blue-gray

  const icon = type === "chapter" ? "📖"
    : type === "orthodox" ? "✝️"
    : type === "emotion" ? "🕊️"
    : "📿";

  const siteLabel = "mybible.oscardevs.com";

  let titleLine1 = "";
  let titleLine2 = "";
  let subtitle = "";

  if (type === "chapter") {
    const book = params.book || "";
    const chapter = params.chapter || "";
    titleLine1 = truncate(book, 20);
    titleLine2 = `الإصحاح ${chapter}`;
    subtitle = "الكتاب المقدس العربي";
  } else if (type === "book") {
    titleLine1 = truncate(params.book || "", 20);
    titleLine2 = params.chapters ? `${params.chapters} إصحاحاً` : "";
    subtitle = "الكتاب المقدس العربي";
  } else if (type === "orthodox") {
    titleLine1 = truncate(params.title || "أرثوذوكسيات", 22);
    titleLine2 = params.subtitle || "";
    subtitle = "الكنيسة القبطية الأرثوذكسية";
  } else if (type === "emotion") {
    titleLine1 = `آيات عن ${truncate(params.emotion || "", 16)}`;
    titleLine2 = "";
    subtitle = "التغذية الروحية — الكتاب المقدس";
  } else {
    titleLine1 = truncate(params.title || "الكتاب المقدس رفيقي", 22);
    titleLine2 = "";
    subtitle = "رفيقك الروحي اليومي";
  }

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${gradient[0]};stop-opacity:1"/>
      <stop offset="100%" style="stop-color:${gradient[1]};stop-opacity:1"/>
    </linearGradient>
    <linearGradient id="card" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:rgba(255,255,255,0.12);stop-opacity:1"/>
      <stop offset="100%" style="stop-color:rgba(255,255,255,0.04);stop-opacity:1"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Decorative circles -->
  <circle cx="100" cy="100" r="180" fill="rgba(255,255,255,0.04)"/>
  <circle cx="1150" cy="550" r="220" fill="rgba(255,255,255,0.05)"/>
  <circle cx="600" cy="630" r="300" fill="rgba(255,255,255,0.03)"/>

  <!-- Card -->
  <rect x="60" y="60" width="${W - 120}" height="${H - 120}" rx="24" fill="url(#card)" stroke="rgba(255,255,255,0.15)" stroke-width="1.5"/>

  <!-- Top accent line -->
  <rect x="60" y="60" width="${W - 120}" height="4" rx="2" fill="rgba(255,255,255,0.3)"/>

  <!-- Icon -->
  <text x="${W / 2}" y="230" font-size="90" text-anchor="middle" dominant-baseline="middle">${icon}</text>

  <!-- Title line 1 -->
  <text x="${W / 2}" y="330" font-size="64" font-weight="bold" fill="white" text-anchor="middle"
    font-family="'Noto Naskh Arabic','Arial Arabic',Arial,sans-serif"
    direction="rtl" unicode-bidi="embed">${xmlEsc(titleLine1)}</text>

  <!-- Title line 2 -->
  ${titleLine2 ? `<text x="${W / 2}" y="410" font-size="52" font-weight="bold" fill="rgba(255,255,255,0.9)" text-anchor="middle"
    font-family="'Noto Naskh Arabic','Arial Arabic',Arial,sans-serif"
    direction="rtl" unicode-bidi="embed">${xmlEsc(titleLine2)}</text>` : ""}

  <!-- Subtitle -->
  <text x="${W / 2}" y="490" font-size="28" fill="rgba(255,255,255,0.6)" text-anchor="middle"
    font-family="'Noto Naskh Arabic','Arial Arabic',Arial,sans-serif"
    direction="rtl" unicode-bidi="embed">${xmlEsc(subtitle)}</text>

  <!-- Divider -->
  <line x1="${W / 2 - 80}" y1="522" x2="${W / 2 + 80}" y2="522" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>

  <!-- Site URL -->
  <text x="${W / 2}" y="555" font-size="22" fill="rgba(255,255,255,0.45)" text-anchor="middle"
    font-family="Arial,sans-serif">${xmlEsc(siteLabel)}</text>
</svg>`;
}

// Cache: key → PNG buffer (max 200 entries, simple LRU)
const ogCache = new Map<string, { buf: Buffer; ts: number }>();
const OG_CACHE_TTL = 24 * 60 * 60 * 1000;
const OG_CACHE_MAX = 200;

function getCachedOg(key: string): Buffer | null {
  const c = ogCache.get(key);
  if (c && Date.now() - c.ts < OG_CACHE_TTL) return c.buf;
  return null;
}

function setCachedOg(key: string, buf: Buffer) {
  if (ogCache.size >= OG_CACHE_MAX) {
    const entries: Array<[string, { buf: Buffer; ts: number }]> = [];
    ogCache.forEach((v, k) => entries.push([k, v]));
    const oldest = entries.sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) ogCache.delete(oldest[0]);
  }
  ogCache.set(key, { buf, ts: Date.now() });
}

import type { Request, Response } from "express";

export async function ogImageHandler(req: Request, res: Response) {
  const type = (req.query.type as string) || "default";
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== "type" && typeof v === "string") params[k] = v;
  }

  const cacheKey = `${type}:${JSON.stringify(params)}`;
  const cached = getCachedOg(cacheKey);
  if (cached) {
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(cached);
  }

  try {
    const svg = buildSvg(type, params);
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    setCachedOg(cacheKey, png);
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(png);
  } catch (err) {
    console.error("[og-image] Error:", err);
    res.status(500).send("Error generating image");
  }
}

// Helper: build OG image URL for a Bible chapter
export function buildChapterOgUrl(bookName: string, chapter: number): string {
  return `${SITE}/api/og-image?type=chapter&book=${encodeURIComponent(bookName)}&chapter=${chapter}`;
}

// Helper: build OG image URL for a Bible book
export function buildBookOgUrl(bookName: string, chaptersCount: number): string {
  return `${SITE}/api/og-image?type=book&book=${encodeURIComponent(bookName)}&chapters=${chaptersCount}`;
}

// Helper: build OG image URL for orthodox pages
export function buildOrthodoxOgUrl(title: string, subtitle = ""): string {
  return `${SITE}/api/og-image?type=orthodox&title=${encodeURIComponent(title)}&subtitle=${encodeURIComponent(subtitle)}`;
}
