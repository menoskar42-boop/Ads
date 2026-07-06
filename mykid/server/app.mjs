// ===== خادم Safari Kids Adventure =====
// يقدّم الملفات الثابتة + وسيطًا آمنًا لـ OpenAI (المفتاح يبقى على الخادم فقط).
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerOpenAIRoutes } from "./openai.js";
import { SECTIONS } from "./seoContent.js";
import {
  renderSectionPage,
  renderHomePage,
  renderSitemap,
  renderRobots,
} from "./seoRender.js";
import { GUIDES } from "./guidesContent.js";
import { renderGuidePage, renderGuidesIndex } from "./guidesRender.js";
import { renderAboutPage, renderPrivacyPage, renderContactPage } from "./pagesRender.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const app = express();
const PORT = process.env.PORT || 5000;

// نقبل JSON كبيراً نسبياً (لإرسال صوت base64 للنسخ الصوتي)
app.use(express.json({ limit: "8mb" }));

// توحيد الروابط أمام جوجل: إزالة الشرطة المائلة الأخيرة (301) لمنع تكرار المحتوى
app.use((req, res, next) => {
  if (req.method === "GET" && req.path.length > 1 && req.path.endsWith("/")) {
    const qs = req.url.slice(req.path.length);
    return res.redirect(301, req.path.replace(/\/+$/, "") + qs);
  }
  next();
});

// مسارات OpenAI: ‎/api/tts , ‎/api/ask , ‎/api/stt , ‎/api/health
registerOpenAIRoutes(app);

// ===== ملفات الأرشفة (SEO) =====
app.get("/sitemap.xml", (_req, res) => {
  const xml = renderSitemap().trim(); // إزالة أي سطر فارغ في البداية قد يُفسد الملف
  res.set("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(xml);
});
app.get("/robots.txt", (_req, res) => {
  res.type("text/plain").send(renderRobots());
});

// ===== بيان الأصول للعمل دون اتصال (PWA) — يتحدّث ذاتياً مع نموّ الملفات =====
function listAssets(dir, base) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base + "/" + name;
    if (fs.statSync(full).isDirectory()) out.push(...listAssets(full, rel));
    else if (/\.(js|css)$/.test(name)) out.push(rel);
  }
  return out;
}
app.get("/asset-manifest.json", (_req, res) => {
  const assets = [
    "/app",
    "/manifest.webmanifest",
    ...listAssets(path.join(ROOT, "css"), "/css"),
    ...listAssets(path.join(ROOT, "js"), "/js"),
  ];
  res.json({ assets });
});

// الرابط الرئيسي يفتح التطبيق التفاعلي مباشرة (أفضل تجربة للطفل)
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

// صفحة المحتوى الغنيّة للأرشفة (SEO) على /explore
app.get("/explore", (_req, res) => {
  res.type("html").send(renderHomePage());
});

// ===== الصفحات الثابتة (حول / الخصوصية) =====
app.get("/about", (_req, res) => {
  res.type("html").send(renderAboutPage());
});
app.get("/privacy", (_req, res) => {
  res.type("html").send(renderPrivacyPage());
});
app.get("/contact", (_req, res) => {
  res.type("html").send(renderContactPage());
});

// صفحات الأقسام الغنيّة: ‎/arabic-letters , ‎/animals , ...
const SLUGS = new Set(SECTIONS.map((s) => s.slug));
app.get("/:slug", (req, res, next) => {
  if (!SLUGS.has(req.params.slug)) return next();
  res.type("html").send(renderSectionPage(req.params.slug));
});

// ===== أدلة الآباء (مقالات) =====
app.get("/guides", (_req, res) => {
  res.type("html").send(renderGuidesIndex());
});
const GUIDE_SLUGS = new Set(GUIDES.map((g) => g.slug));
app.get("/guides/:slug", (req, res, next) => {
  if (!GUIDE_SLUGS.has(req.params.slug)) return next();
  res.type("html").send(renderGuidePage(req.params.slug));
});

// التطبيق التفاعلي (SPA) على /app
app.get("/app", (_req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

// تقديم WebP تلقائياً بدل PNG للمتصفحات الداعمة (توفير حجم بلا أي تغيير في كود التطبيق).
// نحتفظ بكل ملفات PNG؛ لو لم يوجد ملف .webp مرادف نقدّم PNG كما هو (تراجع تلقائي آمن).
app.use((req, res, next) => {
  if (
    req.method === "GET" &&
    req.path.endsWith(".png") &&
    (req.headers.accept || "").includes("image/webp")
  ) {
    const webpAbs = path.join(ROOT, req.path.slice(0, -4) + ".webp");
    if (fs.existsSync(webpAbs)) {
      res.setHeader("Vary", "Accept"); // كي لا تخلط الـCDN بين webp وpng
      const qs = req.url.slice(req.path.length);
      req.url = req.path.slice(0, -4) + ".webp" + qs;
    }
  }
  next();
});

// تقديم ملفات الواجهة الثابتة (css/js/manifest/sw...)
app.use(express.static(ROOT, { extensions: ["html"] }));

// أي مسار غير معروف → 404 حقيقي (لا Soft 404) كي لا تتأثّر ثقة الفهرسة
app.get("*", (_req, res) => {
  res
    .status(404)
    .type("html")
    .send(
      `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8" />` +
        `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` +
        `<meta name="robots" content="noindex" /><title>٤٠٤ — صفحة غير موجودة</title>` +
        `<link rel="stylesheet" href="/css/seo.css" /></head><body>` +
        `<main class="seo-main" style="text-align:center"><h1>🦁 ٤٠٤</h1>` +
        `<p>هذه الصفحة غير موجودة في عالم الاستكشاف.</p>` +
        `<p><a class="seo-play" href="/">العودة إلى الصفحة الرئيسية</a></p>` +
        `<p><a href="/app">▶ افتح التطبيق التفاعلي</a></p></main></body></html>`
    );
});

export default app;
