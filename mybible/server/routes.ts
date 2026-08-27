import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { bibleCache, setStaticCacheHeaders } from "./bible-cache";
import { getCached, putCached } from "./ai-cache";
import { ensureSessionUser, getCurrentUser, checkPremiumStatus, checkAiUsageLimit } from "./auth";
import { processAiQuery, enhanceSearchWithGroq } from "./ai-service";
import { insertHighlightedVerseSchema, insertUserReadingProgressSchema } from "@shared/schema";
import { seedRelationsIfNeeded, startBackgroundImport, getImportJobStatus, reseedEmotionsAndTopics, importAiEmotionVersesFromCsv, importAiEmotionExamplesFromCsv, appendAiEmotionExamples100k, seedCalendarDailyVerses, refreshCalendarVerseTexts } from "./auto-seed";
import { deuteroStatus, importDeuteroFromFile, importAllDeutero, probeSources, importDeuteroFromUrl } from "./deutero";
import { getBookIntro, getChapterTafsir, getVerseTafsir, listAvailableBooks, getTafsirCoverage, hasBookFile } from "./tafsir-service";
import { fetchDaoudLameiRss, clearDaoudLameiCache } from "./daoud-lamei-service";
import { isTopicWorthy, extractKeywords, toSlug, buildTopicTitle } from "./seo-topics";
import { getVideoSeoById, getAllVideoSeoEntries } from "./video-seo-data";
import { fetchTodaySynaxarium } from "./orthodox-service";
import { recalculatePageScore } from "./metrics-service";
import { detectExitReason } from "./exit-intelligence";
import { sendWelcomeNotification, sendTestNotification, sendDailyVerseNotification, sendDailyGroupReadingNotification, getLastSendError } from "./push-notifications";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // 301 redirect: /bible?book=X&chapter=Y → /bible/X/Y (path-based canonical)
  app.get('/bible', (req, res, next) => {
    const { book, chapter } = req.query;
    if (typeof book === 'string' && book) {
      const encodedBook = encodeURIComponent(book);
      if (typeof chapter === 'string' && chapter) {
        return res.redirect(301, `/bible/${encodedBook}/${chapter}`);
      }
      return res.redirect(301, `/bible/${encodedBook}`);
    }
    next();
  });

  // Video SEO metadata endpoint
  app.get('/api/video-seo/:youtubeId', (req, res) => {
    const { youtubeId } = req.params;
    if (!youtubeId || !/^[A-Za-z0-9_\-]+$/.test(youtubeId)) {
      return res.status(400).json({ error: 'Invalid video ID' });
    }
    const data = getVideoSeoById(youtubeId);
    res.set('Cache-Control', 'public, max-age=86400');
    res.json(data);
  });

  // Video SEO — list all indexed videos
  app.get('/api/video-seo', (_req, res) => {
    const videos = getAllVideoSeoEntries();
    res.set('Cache-Control', 'public, max-age=3600');
    res.json(videos);
  });

  // ── Orthodox: Synaxarium proxy ──────────────────────────────────────────
  app.get('/api/orthodox/synaxarium', async (_req, res) => {
    try {
      const data = await fetchTodaySynaxarium();
      res.set('Cache-Control', 'public, max-age=21600');
      res.json(data);
    } catch (err) {
      console.error('[orthodox] Synaxarium route error:', err);
      res.status(500).json({ copticDate: '', entries: [] });
    }
  });

  // ── Exit Intelligence ─────────────────────────────────────────────────────

  // POST /api/exit — receive exit event, classify, store
  app.post('/api/exit', async (req, res) => {
    try {
      const { pageUrl, timeSpent, scrollDepth, lastClickedElement } = req.body;
      if (!pageUrl || typeof pageUrl !== 'string') {
        return res.status(400).json({ error: 'pageUrl required' });
      }

      const reason = detectExitReason({
        timeSpent: Number(timeSpent) || 0,
        scrollDepth: Number(scrollDepth) || 0,
        lastClickedElement: lastClickedElement || null,
      });

      await storage.insertExitEvent({
        pageUrl: pageUrl.slice(0, 500),
        timeSpent: Math.max(0, Number(timeSpent) || 0),
        scrollDepth: Math.min(100, Math.max(0, Number(scrollDepth) || 0)),
        lastClickedElement: lastClickedElement || null,
        exitReason: reason,
      });

      // Increment issue counter (async — don't block response)
      if (reason !== 'normal_exit') {
        storage.incrementPageIssue(pageUrl, reason).catch(() => {});
      }

      return res.status(204).send();
    } catch (err) {
      console.error('[exit] POST error:', err);
      return res.status(500).json({ error: 'internal error' });
    }
  });

  // GET /api/exit/issues?page=/bible — issues for a specific page
  app.get('/api/exit/issues', async (req, res) => {
    try {
      const page = String(req.query.page || '');
      if (!page) return res.json([]);
      const issues = await storage.getPageIssues(page);
      res.set('Cache-Control', 'public, max-age=600');
      res.json(issues);
    } catch (err) {
      console.error('[exit] issues error:', err);
      res.json([]);
    }
  });

  // GET /api/exit/dashboard — worst pages + top issues for admin panel
  app.get('/api/exit/dashboard', async (_req, res) => {
    try {
      const data = await storage.getExitDashboard();
      res.set('Cache-Control', 'public, max-age=120');
      res.json(data);
    } catch (err) {
      console.error('[exit] dashboard error:', err);
      res.json({ worstPages: [], topIssues: [] });
    }
  });

  // ── Behavioral SEO Metrics ────────────────────────────────────────────────

  // POST /api/metrics — receive page metric from frontend
  app.post('/api/metrics', async (req, res) => {
    try {
      const { pageUrl, timeSpent, scrollPercent, verseClicks, videoClicks, shareClicks } = req.body;

      if (!pageUrl || typeof pageUrl !== 'string') {
        return res.status(400).json({ error: 'pageUrl required' });
      }

      // Get session ID from session (anonymous or user)
      const sessionId: string = (req.session as any)?.id || req.headers['x-session-id'] as string || 'anon';

      await storage.insertPageMetric({
        pageUrl: pageUrl.slice(0, 500),
        sessionId,
        timeSpent: Math.max(0, Number(timeSpent) || 0),
        scrollPercent: Math.min(100, Math.max(0, Number(scrollPercent) || 0)),
        verseClicks: Math.max(0, Number(verseClicks) || 0),
        videoClicks: Math.max(0, Number(videoClicks) || 0),
        shareClicks: Math.max(0, Number(shareClicks) || 0),
      });

      // Async score recalculation — don't await to keep response fast
      recalculatePageScore(pageUrl).catch(() => {});

      return res.status(204).send();
    } catch (err) {
      console.error('[metrics] POST error:', err);
      return res.status(500).json({ error: 'internal error' });
    }
  });

  // GET /api/metrics/trending — top scoring pages for "الأكثر تفاعلاً"
  app.get('/api/metrics/trending', async (_req, res) => {
    try {
      const scores = await storage.getTopPageScores(8);
      res.set('Cache-Control', 'public, max-age=300'); // 5-min cache
      res.json(scores);
    } catch (err) {
      console.error('[metrics] trending error:', err);
      res.json([]);
    }
  });

  // GET /api/metrics/scores — full page scores list (for admin/debugging)
  app.get('/api/metrics/scores', async (_req, res) => {
    try {
      const scores = await storage.getTopPageScores(50);
      res.json(scores);
    } catch (err) {
      res.json([]);
    }
  });

  // Health check endpoint (no auth required)
  app.get('/api/health', async (_req, res) => {
    try {
      const books = await storage.getAllBooks();
      const emotions = await storage.getAllEmotions();
      res.json({
        status: 'ok',
        data: {
          booksCount: books.length,
          emotionsCount: emotions.length,
          seeded: books.length === 66 && emotions.length === 8
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: 'Database check failed' });
    }
  });

  // Manual seed endpoint for emotion_verses and topic_verses (no auth required)
  // Use ?force=true to clear and reseed
  app.get('/api/seed/relations', async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const result = await seedRelationsIfNeeded(force);
      res.json({
        status: 'ok',
        message: result.message,
        emotionVersesAdded: result.emotionVersesAdded,
        topicVersesAdded: result.topicVersesAdded
      });
    } catch (error) {
      console.error('[seed/relations] Error:', error);
      res.status(500).json({ status: 'error', message: 'Seeding failed' });
    }
  });

  // Recovery endpoint: reimport Bible verses in BACKGROUND (no auth required)
  // Use ?force=true to clear existing verses and reimport
  // Returns immediately - check /api/seed/verses/status for progress
  app.get('/api/seed/verses', (req, res) => {
    const force = req.query.force === 'true';
    console.log(`[API] Starting background Bible verses reimport... (force=${force})`);
    const result = startBackgroundImport(force);
    res.json({
      status: result.started ? 'accepted' : 'error',
      message: result.message
    });
  });

  /* ── الأسفار القانونية الثانية ─────────────────────────────────────────
   *
   * ⚠️ **بمفتاح، مش زي `/api/seed/verses` اللي فوق.**
   *
   * الراوت اللي فوقه مكتوب جنبه «no auth required»، يعني أي حد يقدر يشغّل
   * إعادة استيراد الكتاب كله. ده حمل تقيل على القاعدة بضغطة من أي حد،
   * وماينفعش أنسخ النمط ده في راوت **بيكتب** نص مقدّس.
   *
   * المفتاح `MYBIBLE_SEED_KEY`. ولو مش متظبّط، الراوت **مقفول** — مش
   * مفتوح. الإعداد الناقص مايفتحش باب. */
  const seedKeyOk = (req: any) => {
    const want = process.env.MYBIBLE_SEED_KEY || '';
    if (!want) return false;
    const got = String(req.headers['x-seed-key'] || req.query.key || '');
    return got.length === want.length && require('crypto').timingSafeEqual(Buffer.from(got), Buffer.from(want));
  };

  // تشخيص: إيه الموجود فعلاً في القاعدة. للقراءة، فمفيش مفتاح.
  app.get('/api/deutero/status', async (_req, res) => {
    try { res.json({ status: 'ok', ...(await deuteroStatus()) }); }
    catch (e: any) { res.status(500).json({ status: 'error', message: e.message }); }
  });

  /* بحث عن مصدر — قراءة من مصادر عامة، فمفيش مفتاح. بياخد وقت (بيجيب
   * قوايم أسفار كل ترجمة عربية)، فمايتنداش إلا لما نكون بندوّر فعلاً. */
  app.get('/api/deutero/sources', async (_req, res) => {
    try { res.json({ status: 'ok', ...(await probeSources()) }); }
    catch (e: any) { res.status(500).json({ status: 'error', message: e.message }); }
  });

  /* استيراد من رابط API خارجي. نفس المفتاح، ونفس كل الفحوص — الرابط
   * بيتحوّل لملف الأول عشان مايلفّش حول أي بوّابة. */
  app.post('/api/deutero/import-url', async (req, res) => {
    if (!seedKeyOk(req)) return res.status(403).json({ status: 'error', message: 'MYBIBLE_SEED_KEY مطلوب' });
    const b = req.body || {};
    const out = await importDeuteroFromUrl(
      String(b.book || '').trim(), String(b.url || '').trim(),
      String(b.source || '').trim(), b.confirmedByChurch === true,
    );
    res.status(out.ok ? 200 : 400).json({ status: out.ok ? 'ok' : 'error', ...out });
  });

  app.post('/api/deutero/import', async (req, res) => {
    if (!seedKeyOk(req)) return res.status(403).json({ status: 'error', message: 'MYBIBLE_SEED_KEY مطلوب' });
    try {
      const file = String((req.query.file as string) || '').trim();
      const out = file ? await importDeuteroFromFile(file) : await importAllDeutero();
      res.status(out.ok ? 200 : 400).json({ status: out.ok ? 'ok' : 'error', ...out });
    } catch (e: any) { res.status(500).json({ status: 'error', message: e.message }); }
  });

  // Status endpoint for verse import job
  app.get('/api/seed/verses/status', (_req, res) => {
    const status = getImportJobStatus();
    res.json(status);
  });

  // Fix duplicate verses in bible_verses table
  app.get('/api/fix/duplicate-verses', async (_req, res) => {
    try {
      console.log('[API] Checking for duplicate verses...');
      
      // Find duplicates
      const duplicates = await storage.findDuplicateVerses();
      
      if (duplicates.length === 0) {
        res.json({
          status: 'ok',
          message: 'No duplicate verses found',
          duplicatesFixed: 0
        });
        return;
      }
      
      // Delete duplicates (keeping the first one)
      const deletedCount = await storage.deleteDuplicateVerses();
      
      res.json({
        status: 'ok',
        message: `Fixed ${deletedCount} duplicate verses`,
        duplicatesFixed: deletedCount,
        duplicatesFound: duplicates.length
      });
    } catch (error) {
      console.error('[API] Error fixing duplicates:', error);
      res.status(500).json({ status: 'error', message: 'Failed to fix duplicates' });
    }
  });

  // Fix duplicate verses in emotion_verses table
  app.get('/api/fix/duplicate-emotion-verses', async (_req, res) => {
    try {
      console.log('[API] Checking for duplicate emotion verses...');
      
      const duplicates = await storage.findDuplicateEmotionVerses();
      
      if (duplicates.length === 0) {
        res.json({
          status: 'ok',
          message: 'No duplicate emotion verses found',
          duplicatesFixed: 0
        });
        return;
      }
      
      const deletedCount = await storage.deleteDuplicateEmotionVerses();
      
      res.json({
        status: 'ok',
        message: `Fixed ${deletedCount} duplicate emotion verses`,
        duplicatesFixed: deletedCount,
        duplicatesFound: duplicates.length
      });
    } catch (error) {
      console.error('[API] Error fixing emotion duplicates:', error);
      res.status(500).json({ status: 'error', message: 'Failed to fix emotion duplicates' });
    }
  });

  // Fix duplicate verses in topic_verses table
  app.get('/api/fix/duplicate-topic-verses', async (_req, res) => {
    try {
      console.log('[API] Checking for duplicate topic verses...');
      
      const duplicates = await storage.findDuplicateTopicVerses();
      
      if (duplicates.length === 0) {
        res.json({
          status: 'ok',
          message: 'No duplicate topic verses found',
          duplicatesFixed: 0
        });
        return;
      }
      
      const deletedCount = await storage.deleteDuplicateTopicVerses();
      
      res.json({
        status: 'ok',
        message: `Fixed ${deletedCount} duplicate topic verses`,
        duplicatesFixed: deletedCount,
        duplicatesFound: duplicates.length
      });
    } catch (error) {
      console.error('[API] Error fixing topic duplicates:', error);
      res.status(500).json({ status: 'error', message: 'Failed to fix topic duplicates' });
    }
  });

  // Reseed emotions and topics with correct data (for production fix)
  app.get('/api/seed/emotions', async (_req, res) => {
    try {
      console.log('[API] Reseeding emotions and topics...');
      const result = await reseedEmotionsAndTopics();
      res.json({
        status: 'ok',
        ...result
      });
    } catch (error) {
      console.error('[API] Error reseeding:', error);
      res.status(500).json({ status: 'error', message: 'Reseeding failed' });
    }
  });

  // Import AI emotion verses from CSV (for AI classification)
  app.get('/api/seed/ai-emotions', async (_req, res) => {
    try {
      console.log('[API] Importing AI emotion verses from CSV...');
      const result = await importAiEmotionVersesFromCsv();
      res.json({
        status: result.success ? 'ok' : 'error',
        ...result
      });
    } catch (error) {
      console.error('[API] Error importing AI emotions:', error);
      res.status(500).json({ status: 'error', message: 'Import failed' });
    }
  });

  // Get distinct AI emotions (for reference)
  app.get('/api/ai-emotions', async (_req, res) => {
    try {
      const emotions = await storage.getDistinctAiEmotions();
      res.json({ emotions, count: emotions.length });
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch AI emotions' });
    }
  });

  // Import AI emotion examples from CSV (for semantic classification)
  app.get('/api/seed/ai-examples', async (_req, res) => {
    try {
      console.log('[API] Importing AI emotion examples from CSV...');
      const result = await importAiEmotionExamplesFromCsv();
      res.json({
        status: result.success ? 'ok' : 'error',
        ...result
      });
    } catch (error) {
      console.error('[API] Error importing AI examples:', error);
      res.status(500).json({ status: 'error', message: 'Import failed' });
    }
  });

  // Append 100k AI emotion examples from large CSV (without clearing existing data)
  app.get('/api/seed/ai-examples-100k', async (_req, res) => {
    try {
      console.log('[API] Appending 100k AI emotion examples from CSV...');
      res.setHeader('Content-Type', 'application/json');
      const result = await appendAiEmotionExamples100k();
      res.json({
        status: result.success ? 'ok' : 'error',
        ...result
      });
    } catch (error) {
      console.error('[API] Error appending AI examples:', error);
      res.status(500).json({ status: 'error', message: 'Import failed' });
    }
  });

  // Refresh calendar_daily_verses texts from Bible DB
  app.get('/api/seed/refresh-calendar-texts', async (_req, res) => {
    try {
      const result = await refreshCalendarVerseTexts();
      res.json({ status: 'ok', ...result });
    } catch (error) {
      res.status(500).json({ status: 'error', message: String(error) });
    }
  });

  // Seed calendar daily verses from CSV
  app.get('/api/seed/calendar-verses', async (_req, res) => {
    try {
      console.log('[API] Importing calendar daily verses from CSV...');
      const result = await seedCalendarDailyVerses();
      res.json({
        status: result.success ? 'ok' : 'error',
        ...result
      });
    } catch (error) {
      console.error('[API] Error importing calendar verses:', error);
      res.status(500).json({ status: 'error', message: 'Import failed' });
    }
  });

  app.get('/api/tafsir/books', (_req, res) => {
    try {
      const books = listAvailableBooks();
      res.json({ books });
    } catch (error) {
      res.status(500).json({ message: 'Failed to list tafsir books' });
    }
  });

  // تقرير تغطية التفسير: كل سفر وكل إصحاح — موجود ولا ناقص.
  // ?refresh=1 يعيد الفحص بعد ما تضيف ملفات CSV جديدة من غير ما تعيد تشغيل السيرفر.
  app.get('/api/tafsir/coverage', (req, res) => {
    try {
      const coverage = getTafsirCoverage(req.query.refresh === '1');
      res.json(coverage);
    } catch (error) {
      console.error('[tafsir] coverage error:', error);
      res.status(500).json({ message: 'Failed to compute tafsir coverage' });
    }
  });

  app.get('/api/tafsir/book-intro/:csvName', (req, res) => {
    try {
      const csvName = decodeURIComponent(req.params.csvName);
      const intro = getBookIntro(csvName);
      res.json({ tafsir: intro });
    } catch (error) {
      console.error('[tafsir] book-intro error:', error);
      res.status(500).json({ message: 'Failed to fetch book intro' });
    }
  });

  app.get('/api/tafsir/chapter/:csvName/:chapter', (req, res) => {
    try {
      const csvName = decodeURIComponent(req.params.csvName);
      const chapter = parseInt(req.params.chapter, 10);
      const tafsir = getChapterTafsir(csvName, chapter);
      // نرجّع السبب عشان الواجهة تقول للمستخدم إيه اللي ناقص بالظبط بدل
      // رسالة «لا يوجد تفسير» اللي مش بتفرّق بين سفر مش متحمّل وإصحاح ناقص.
      const reason = tafsir ? null : hasBookFile(csvName) ? 'chapter-missing' : 'book-missing';
      res.json({ tafsir, reason });
    } catch (error) {
      console.error('[tafsir] chapter error:', error);
      res.status(500).json({ message: 'Failed to fetch chapter tafsir' });
    }
  });

  app.get('/api/tafsir/verse/:csvName/:chapter/:verse', (req, res) => {
    try {
      const csvName = decodeURIComponent(req.params.csvName);
      const chapter = parseInt(req.params.chapter, 10);
      const verse = parseInt(req.params.verse, 10);
      // لو الآية مالهاش تفسير مخصوص، نرجّع تفسير الإصحاح **بعلامة scope** بدل
      // ما نسيب المستخدم من غير حاجة. العلامة مش تفصيلة: عرض تفسير الإصحاح
      // على إنه تفسير الآية هو نفس الغلط اللي كان بيعرض مقدمة السفر.
      const verseText = getVerseTafsir(csvName, chapter, verse);
      if (verseText) return res.json({ tafsir: verseText, scope: 'verse' });
      const chapterText = getChapterTafsir(csvName, chapter);
      res.json({ tafsir: chapterText, scope: chapterText ? 'chapter' : null });
    } catch (error) {
      console.error('[tafsir] verse error:', error);
      res.status(500).json({ message: 'Failed to fetch verse tafsir' });
    }
  });

  app.use('/api/*', ensureSessionUser);

  app.get('/api/user', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const isPremium = await checkPremiumStatus(user);
      const usageCheck = await checkAiUsageLimit(user);

      res.json({
        id: user.id,
        isPremium,
        aiUsageRemaining: usageCheck.remaining,
        subscriptionExpiry: user.subscriptionExpiry,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch user' });
    }
  });

  app.post('/api/user/premium', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1);

      const updatedUser = await storage.updateUserPremiumStatus(user.id, true, expiryDate);

      res.json({
        success: true,
        isPremium: true,
        subscriptionExpiry: updatedUser.subscriptionExpiry,
      });
    } catch (error) {
      res.status(500).json({ message: 'Failed to update premium status' });
    }
  });

  // ── Viral Loop: Bot OG detection for /share/verse/:id ────────────────────
  const BOT_AGENTS = /facebookexternalhit|whatsapp|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|googlebot|bingbot|applebot|ia_archiver/i;
  const SITE_URL_FULL = 'https://mybible.oscardevs.com';

  app.get('/share/verse/:id', async (req, res, next) => {
    const ua = req.headers['user-agent'] || '';
    if (!BOT_AGENTS.test(ua)) return next();

    const id = parseInt(req.params.id);
    if (isNaN(id)) return next();

    try {
      const verse = await storage.getVerseById(id);
      if (!verse) return next();
      const book = await storage.getBookById(verse.bookId);
      const bookName = book?.name || '';
      const ref = `${bookName} ${verse.chapter}:${verse.verse}`;
      const snippet = verse.text.length > 120 ? verse.text.slice(0, 120) + '...' : verse.text;
      const title = `"${snippet}" — ${ref}`;
      const description = `${verse.text} | اقرأ الكتاب المقدس بالعربية على الكتاب المقدس رفيقي`;
      const shareUrl = `${SITE_URL_FULL}/share/verse/${id}`;
      const ogImage = `${SITE_URL_FULL}/opengraph.jpg`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | الكتاب المقدس رفيقي</title>
<meta name="description" content="${description}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="الكتاب المقدس رفيقي">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${shareUrl}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="ar_AR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${ogImage}">
<link rel="canonical" href="${shareUrl}">
<meta http-equiv="refresh" content="0; url=${shareUrl}">
</head>
<body>
<p>${verse.text}</p>
<p>${ref}</p>
<a href="${shareUrl}">اقرأ على الكتاب المقدس رفيقي</a>
</body>
</html>`);
    } catch {
      next();
    }
  });

  // ── Viral Loop: Verse by ID API ───────────────────────────────────────────
  app.get('/api/verse/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ message: 'Invalid verse ID' });
      const verse = await storage.getVerseById(id);
      if (!verse) return res.status(404).json({ message: 'Verse not found' });
      const book = await storage.getBookById(verse.bookId);
      res.json({ ...verse, bookName: book?.name || '' });
    } catch {
      res.status(500).json({ message: 'Failed to fetch verse' });
    }
  });

  app.get('/api/books', async (_req, res) => {
    try {
      const books = await bibleCache.getAllBooks();
      setStaticCacheHeaders(res);
      res.json(books);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch books' });
    }
  });

  app.get('/api/books/:testament', async (req, res) => {
    try {
      const testament = req.params.testament as 'old' | 'new';
      if (testament !== 'old' && testament !== 'new') {
        return res.status(400).json({ message: 'Invalid testament' });
      }

      const books = await bibleCache.getBooksByTestament(testament);
      setStaticCacheHeaders(res);
      res.json(books);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch books' });
    }
  });

  app.get('/api/verses/book/:bookId', async (req, res) => {
    try {
      const bookId = parseInt(req.params.bookId);
      const chapter = req.query.chapter ? parseInt(req.query.chapter as string) : undefined;

      const verses = await bibleCache.getVersesByBook(bookId, chapter);
      setStaticCacheHeaders(res);
      res.json(verses);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch verses' });
    }
  });

  app.get('/api/books/:bookId/chapters', async (req, res) => {
    try {
      const bookId = parseInt(req.params.bookId);
      const chapters = await bibleCache.getChaptersForBook(bookId);
      setStaticCacheHeaders(res);
      res.json(chapters);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch chapters' });
    }
  });

  // ── نص قراءة من نطاق آيات (للكتامارس في الخولاجي)
  app.get('/api/reading-text', async (req, res) => {
    try {
      const { bookName, fromCh, fromVs, toCh, toVs } = req.query as Record<string, string>;
      if (!bookName || !fromCh || !fromVs || !toCh || !toVs) {
        return res.status(400).json({ message: 'bookName, fromCh, fromVs, toCh, toVs required' });
      }
      const book = await bibleCache.getBookByName(bookName);
      if (!book) return res.status(404).json({ message: `Book not found: ${bookName}` });
      setStaticCacheHeaders(res);

      const fCh = parseInt(fromCh), fVs = parseInt(fromVs), tCh = parseInt(toCh), tVs = parseInt(toVs);
      const verses: { chapter: number; verse: number; text: string }[] = [];

      for (let ch = fCh; ch <= tCh; ch++) {
        const chVerses = await bibleCache.getVersesByBook(book.id, ch);
        for (const v of chVerses) {
          const inRange =
            (ch === fCh && ch === tCh) ? (v.verse >= fVs && v.verse <= tVs) :
            (ch === fCh)               ? (v.verse >= fVs) :
            (ch === tCh)               ? (v.verse <= tVs) :
            true;
          if (inRange) verses.push({ chapter: v.chapter, verse: v.verse, text: v.text });
        }
      }
      res.json({ bookName, verses });
    } catch (err) {
      res.status(500).json({ message: 'Failed to fetch reading text' });
    }
  });

  app.get('/api/verses/search', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: 'Query parameter required' });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
      const smart = req.query.smart !== 'false';
      
      if (smart) {
        const results = await storage.smartSearchVerses(query, limit);
        res.json(results);
      } else {
        const verses = await storage.searchVerses(query, limit);
        res.json(verses);
      }
    } catch (error) {
      console.error('[search] Error:', error);
      res.status(500).json({ message: 'Failed to search verses' });
    }
  });

  app.get('/api/search/smart', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: 'Query parameter required' });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 30;
      const results = await storage.smartSearchVerses(query, limit);
      
      res.json({
        query,
        count: results.length,
        results
      });
    } catch (error) {
      console.error('[smart-search] Error:', error);
      res.status(500).json({ message: 'Failed to search verses' });
    }
  });

  // ── Service section: AI-generated sermon/lesson outline ──────────────────
  app.post('/api/service/outline', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });

      const { topic, audience, type, duration: durationRaw } = req.body as { topic?: string; audience?: string; type?: 'sermon' | 'lesson'; duration?: number };
      if (!topic || !type || (type !== 'sermon' && type !== 'lesson')) {
        return res.status(400).json({ message: 'topic and type (sermon|lesson) required' });
      }

      const aud = (audience || (type === 'lesson' ? 'أطفال' : 'عام')).trim();
      const duration = Math.max(10, Math.min(120, durationRaw || 30));
      // كل نقطة ~5 دقائق، المقدمة والخاتمة ~5 دق لكل منهما
      const pointsCount = Math.max(2, Math.round((duration - 10) / 5));

      // كاش: مفتاح من كل المدخلات المؤثّرة (الموضوع + الجمهور + النوع + المدة + الموديل)
      const OUTLINE_MODEL = 'openai/gpt-oss-20b';
      const cachedOutline = await getCached('service/outline', [topic, aud, type, duration, OUTLINE_MODEL]);
      if (cachedOutline) return res.json(cachedOutline);

      const usageCheck = await checkAiUsageLimit(user);
      if (!usageCheck.allowed) {
        return res.status(429).json({ message: 'بلغت الحد اليومي لاستخدام الذكاء الاصطناعي' });
      }

      const groqApiKey = process.env.GROQ_API_KEY;
      if (!groqApiKey) return res.status(503).json({ message: 'AI provider not configured' });

      const prompt = type === 'sermon'
        ? `أنت مساعد لاهوتي قبطي أرثوذكسي خبير. اقترح هيكلاً لعظة كنسية أرثوذكسية.
الموضوع: "${topic}"
الجمهور المستهدف: ${aud}
مدة العظة: ${duration} دقيقة (المقدمة ~5 دق، كل نقطة رئيسية ~5 دق، التطبيق والخاتمة ~5 دق)

أجب فقط بكائن JSON خالص بهذا الشكل بالعربية الفصحى، بدون أي شرح إضافي:
{
  "intro": "مقدمة من 2-3 جمل تمهّد للموضوع (~5 دقائق)",
  "points": ${JSON.stringify(Array(pointsCount).fill(null).map((_, i) => `النقطة ${i + 1} مع شرحها الموجز (~5 دقائق)`))},
  "application": "تطبيق عملي يربط الموضوع بحياة المؤمن",
  "conclusion": "خاتمة موجزة تدعو للالتزام",
  "verseRefs": ["..."]
}

تنبيه: يجب أن يكون عدد النقاط في points بالضبط ${pointsCount} نقاط مناسبة لمدة ${duration} دقيقة.
في حقل verseRefs ضع حوالي 20 آية من أقوى الآيات المتعلقة بالموضوع من العهدين القديم والجديد. الصيغة لكل عنصر: "اسم السفر فصل:آية".`
        : `أنت خادم مدارس أحد قبطي أرثوذكسي خبير. اقترح هيكلاً لدرس مدارس أحد جذاب.
الموضوع: "${topic}"
الفئة العمرية: ${aud}
مدة الدرس: ${duration} دقيقة (التمهيد ~5 دق، كل فكرة ~5 دق، النشاط والصلاة ~5 دق)

أجب فقط بكائن JSON خالص بهذا الشكل بالعربية البسيطة المناسبة للأطفال، بدون أي شرح إضافي:
{
  "intro": "تمهيد قصير يجذب الانتباه (سؤال أو قصة قصيرة) (~5 دقائق)",
  "points": ${JSON.stringify(Array(pointsCount).fill(null).map((_, i) => `الفكرة ${i + 1} مبسطة (~5 دقائق)`))},
  "activity": "نشاط تفاعلي مناسب للعمر",
  "prayer": "صلاة ختامية قصيرة بلغة الأطفال",
  "verseRefs": ["..."]
}

تنبيه: يجب أن يكون عدد النقاط في points بالضبط ${pointsCount} أفكار مناسبة لمدة ${duration} دقيقة.
في حقل verseRefs ضع حوالي 20 آية من أقوى الآيات المتعلقة بالموضوع بصياغة مناسبة للأطفال. الصيغة لكل عنصر: "اسم السفر فصل:آية".`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: OUTLINE_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4000,
          temperature: 0.5,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        console.error('[service/outline] Groq error:', response.status);
        return res.status(502).json({ message: 'تعذّر توليد الهيكل، حاول مرة أخرى' });
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return res.status(502).json({ message: 'استجابة فارغة من المساعد' });

      let outline: any;
      try {
        outline = JSON.parse(content);
      } catch {
        const m = content.match(/\{[\s\S]*\}/);
        if (!m) return res.status(502).json({ message: 'تعذّر تحليل الاستجابة' });
        outline = JSON.parse(m[0]);
      }

      // Fetch verse texts from DB for verseRefs
      const fetchedVerses: Array<{ ref: string; book: string; chapter: number; verse: number; text: string }> = [];
      if (Array.isArray(outline.verseRefs)) {
        const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d: string) => String(d.charCodeAt(0) - 0x0660));
        for (const raw of outline.verseRefs as string[]) {
          const clean = raw.trim();
          const m2 = clean.match(/^([؀-ۿٰ\s]+?)\s+([\d٠-٩]+):([\d٠-٩]+)/);
          if (!m2) continue;
          const book = m2[1].trim();
          const chapter = parseInt(toWestern(m2[2]), 10);
          const verse = parseInt(toWestern(m2[3]), 10);
          try {
            const found = await storage.getVerseByReference(book, chapter, verse);
            if (found) fetchedVerses.push({ ref: clean, book, chapter, verse, text: found.text });
          } catch { /* skip */ }
        }
      }

      const outlineResult = { outline, type, outlineVerses: fetchedVerses };
      await putCached('service/outline', [topic, aud, type, duration, OUTLINE_MODEL], outlineResult);
      return res.json(outlineResult);
    } catch (e) {
      console.error('[service/outline] error:', e);
      res.status(500).json({ message: 'فشل توليد الهيكل' });
    }
  });

  // توسيع نقطة من هيكل العظة/الدرس إلى مقالة كلامية
  app.post('/api/service/expand-point', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });

      const { point, topic, type } = req.body as { point?: string; topic?: string; type?: 'sermon' | 'lesson' };
      if (!point) return res.status(400).json({ message: 'point required' });

      const EXPAND_MODEL = 'openai/gpt-oss-20b';
      const cachedExpand = await getCached('service/expand-point', [point, topic, type, EXPAND_MODEL]);
      if (cachedExpand) return res.json(cachedExpand);

      const usageCheck = await checkAiUsageLimit(user);
      if (!usageCheck.allowed) return res.status(429).json({ message: 'بلغت الحد اليومي' });

      const groqApiKey = process.env.GROQ_API_KEY;
      if (!groqApiKey) return res.status(503).json({ message: 'AI not configured' });

      const isLesson = type === 'lesson';
      const prompt = isLesson
        ? `أنت خادم مدارس أحد قبطي أرثوذكسي. اكتب شرحاً موسّعاً لهذه الفكرة من درس مدارس الأحد بأسلوب بسيط ومحبب للأطفال والشباب.
الموضوع العام: "${topic || ''}"
الفكرة: "${point}"

اكتب مقطعاً من 3-4 فقرات يشمل: شرح الفكرة ببساطة، قصة أو مثال من الإنجيل أو الحياة اليومية، سؤال للتفكير، وتطبيق عملي.
أجب بنص عربي مباشر فقط بدون عناوين أو JSON.`
        : `أنت مساعد لاهوتي قبطي أرثوذكسي. اكتب شرحاً موسّعاً لهذه النقطة من العظة بأسلوب لاهوتي أرثوذكسي رصين.
الموضوع العام: "${topic || ''}"
النقطة: "${point}"

اكتب مقطعاً من 3-5 فقرات يشمل: الشرح اللاهوتي، آيات داعمة من العهدين، تطبيق روحي على حياة المؤمن، وخلاصة موجزة.
أجب بنص عربي مباشر فقط بدون عناوين أو JSON.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey}` },
        body: JSON.stringify({
          model: EXPAND_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 1200,
        }),
      });
      if (!response.ok) return res.status(502).json({ message: 'AI request failed' });
      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (!text) return res.status(500).json({ message: 'Empty response' });
      const expandResult = { text };
      await putCached('service/expand-point', [point, topic, type, EXPAND_MODEL], expandResult);
      res.json(expandResult);
    } catch (e) {
      console.error('[service/expand-point] error:', e);
      res.status(500).json({ message: 'فشل التوسيع' });
    }
  });

  // More verses on a topic — used by both Service outline and Search "load more" buttons
  app.post('/api/verses/more-on-topic', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });

      const { topic, excludeRefs } = req.body as { topic?: string; excludeRefs?: string[] };
      if (!topic || !topic.trim()) return res.status(400).json({ message: 'topic required' });

      const excluded = Array.isArray(excludeRefs) ? excludeRefs.slice(0, 300) : [];

      // كاش: مفتاح من الموضوع + الآيات المستبعَدة (مرتّبة) + الموديل
      const MORE_MODEL = 'openai/gpt-oss-20b';
      const cachedMore = await getCached('verses/more-on-topic', [topic.trim(), [...excluded].sort().join('|'), MORE_MODEL]);
      if (cachedMore) return res.json(cachedMore);

      const groqApiKey = process.env.GROQ_API_KEY;
      if (!groqApiKey) return res.status(503).json({ message: 'AI provider not configured' });
      const excludedStr = excluded.length ? excluded.join('، ') : '(لا شيء بعد)';

      const prompt = `أنت خبير لاهوتي في الكتاب المقدس العربي نسخة فان دايك.

الموضوع: "${topic.trim()}"

ذكرت سابقاً هذه الآيات (لا تكررها):
${excludedStr}

اذكر الآن آيات إضافية متعلقة بنفس الموضوع — حوالي 30 آية جديدة من الكتاب المقدس، من العهدين القديم والجديد.
إذا لم تتبقَ آيات قوية الصلة (نفدت الآيات المعروفة عن الموضوع)، أرجع refs فارغة.

أجب بـ JSON فقط:
{"refs": ["اسم السفر فصل:آية", ...]}
لا تكتب أي شرح خارج JSON.`;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey}` },
        body: JSON.stringify({
          model: MORE_MODEL,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 3000,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });

      if (!groqRes.ok) return res.status(502).json({ message: 'AI provider error' });
      const data = await groqRes.json() as any;
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) return res.json({ verses: [], done: true });

      let parsed: { refs?: unknown };
      try { parsed = JSON.parse(content); } catch { return res.json({ verses: [], done: true }); }

      const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d: string) => String(d.charCodeAt(0) - 0x0660));
      const verses: Array<{ ref: string; book: string; chapter: number; verse: number; text: string }> = [];
      const seen = new Set(excluded);

      if (Array.isArray(parsed.refs)) {
        for (const raw of parsed.refs as unknown[]) {
          if (typeof raw !== 'string') continue;
          const clean = raw.trim();
          if (seen.has(clean)) continue;
          const m = clean.match(/^([؀-ۿٰ\s]+?)\s+([\d٠-٩]+):([\d٠-٩]+)/);
          if (!m) continue;
          const book = m[1].trim();
          const chapter = parseInt(toWestern(m[2]), 10);
          const verse = parseInt(toWestern(m[3]), 10);
          try {
            const found = await storage.getVerseByReference(book, chapter, verse);
            if (found) {
              verses.push({ ref: clean, book, chapter, verse, text: found.text });
              seen.add(clean);
            }
          } catch { /* skip */ }
        }
      }

      // "done" if AI returned no new refs or very few — signals we've likely exhausted the topic
      const done = verses.length < 5;
      const moreResult = { verses, done };
      await putCached('verses/more-on-topic', [topic.trim(), [...excluded].sort().join('|'), MORE_MODEL], moreResult);
      return res.json(moreResult);
    } catch (e) {
      console.error('[verses/more-on-topic] error:', e);
      res.status(500).json({ message: 'Failed' });
    }
  });

  // AI-Enhanced Search: pure Groq semantic search (text search disabled temporarily)
  app.post('/api/search/ai-enhanced', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ message: 'Query required' });
      }

      // كاش: مفتاح من الاستعلام الكامل المطبّع + الموديل
      const SEARCH_MODEL = 'openai/gpt-oss-20b';
      const cachedSearch = await getCached('search/ai-enhanced', [query.trim(), SEARCH_MODEL]);
      if (cachedSearch) return res.json(cachedSearch);

      const groqApiKey = process.env.GROQ_API_KEY;
      if (!groqApiKey) {
        return res.json({ exactResults: [], semanticResults: [], results: [], enhanced: false });
      }

      // First batch: ~25 strongest verses (user can request more via /api/verses/more-on-topic)
      const aiPrompt = `أنت خبير لاهوتي في الكتاب المقدس العربي نسخة فان دايك.

الموضوع: "${query.trim()}"

اذكر حوالي 25 آية من أقوى الآيات صلةً بهذا الموضوع من الكتاب المقدس، من العهدين القديم والجديد.
أجب بـ JSON فقط:
{"refs": ["اسم السفر فصل:آية", ...]}
مثال: {"refs": ["يوحنا 3:16", "مزمور 51:1", "إشعياء 55:7"]}
لا تكتب أي شرح خارج JSON.`;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey}` },
        body: JSON.stringify({
          model: SEARCH_MODEL,
          messages: [{ role: 'user', content: aiPrompt }],
          max_tokens: 6000,
          temperature: 0.2,
          response_format: { type: 'json_object' },
        }),
      });

      if (!groqRes.ok) {
        console.error('[ai-enhanced-search] Groq error:', groqRes.status);
        return res.json({ exactResults: [], semanticResults: [], results: [], enhanced: false });
      }

      const groqData = await groqRes.json() as any;
      const content = groqData.choices?.[0]?.message?.content?.trim();
      if (!content) return res.json({ exactResults: [], semanticResults: [], results: [], enhanced: false });

      let parsed: { refs?: unknown };
      try { parsed = JSON.parse(content); } catch {
        return res.json({ exactResults: [], semanticResults: [], results: [], enhanced: false });
      }

      const toWestern = (s: string) => s.replace(/[٠-٩]/g, (d: string) => String(d.charCodeAt(0) - 0x0660));
      const semanticResults: Array<{ id: number; bookId?: number; chapter: number; verse: number; text: string; bookName: string; relevanceScore: number; matchType: 'semantic' }> = [];
      const seenIds = new Set<number>();

      if (Array.isArray(parsed.refs)) {
        for (const raw of parsed.refs as unknown[]) {
          if (typeof raw !== 'string') continue;
          const m = raw.trim().match(/^([؀-ۿٰ\s]+?)\s+([\d٠-٩]+):([\d٠-٩]+)/);
          if (!m) continue;
          const book = m[1].trim();
          const chapter = parseInt(toWestern(m[2]), 10);
          const verse = parseInt(toWestern(m[3]), 10);
          try {
            const found = await storage.getVerseByReference(book, chapter, verse);
            if (found && !seenIds.has(found.id)) {
              semanticResults.push({ ...found, bookName: book, relevanceScore: 0.9, matchType: 'semantic' });
              seenIds.add(found.id);
            }
          } catch { /* skip */ }
        }
      }

      // Passive topic growth
      if (isTopicWorthy(query)) {
        const slug = toSlug(query.trim());
        const title = buildTopicTitle(query.trim());
        const keywords = extractKeywords(query.trim());
        storage.upsertSeoTopic(title, slug, keywords).catch(() => {});
      }

      const searchResult = {
        exactResults: [],
        semanticResults,
        results: semanticResults,
        enhanced: true,
        topicSlug: isTopicWorthy(query) ? toSlug(query.trim()) : undefined,
      };
      // خزّن فقط عند وجود نتائج فعلية (لا نكاش نتيجة فاضية ناتجة عن خطأ عابر)
      if (semanticResults.length > 0) {
        await putCached('search/ai-enhanced', [query.trim(), SEARCH_MODEL], searchResult);
      }
      return res.json(searchResult);
    } catch (error) {
      console.error('[ai-enhanced-search] Error:', error);
      res.status(500).json({ message: 'Search failed' });
    }
  });

  app.get('/api/daily-verse/:date', async (req, res) => {
    try {
      const dateStr = req.params.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ message: 'Invalid date format' });
      }
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid date' });
      const month = d.getMonth() + 1;
      const day = d.getDate();

      const calendarVerse = await bibleCache.getCalendarDailyVerse(month, day);
      if (calendarVerse) {
        const refParts = calendarVerse.verseReference.match(/^(.+?)\s*(\d+):(\d+)$/);
        const bookName = refParts ? refParts[1].trim() : calendarVerse.verseReference;
        const chapter = refParts ? parseInt(refParts[2]) : 1;
        const verseNum = refParts ? parseInt(refParts[3]) : 1;
        const dbVerse = await bibleCache.getVerseByReference(bookName, chapter, verseNum);
        const verseText = dbVerse?.text ?? calendarVerse.verseText;
        setStaticCacheHeaders(res);
        return res.json({
          id: calendarVerse.id,
          verseId: calendarVerse.id,
          date: dateStr,
          verse: { id: dbVerse?.id ?? calendarVerse.id, text: verseText, chapter, verse: verseNum },
          book: { name: bookName },
          theme: calendarVerse.theme,
        });
      }
      return res.json(null);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch daily verse' });
    }
  });

  app.get('/api/daily-verse', async (_req, res) => {
    try {
      const today = new Date();
      const month = today.getMonth() + 1;
      const day = today.getDate();
      
      const calendarVerse = await bibleCache.getCalendarDailyVerse(month, day);

      if (calendarVerse) {
        const refParts = calendarVerse.verseReference.match(/^(.+?)\s*(\d+):(\d+)$/);
        const bookName = refParts ? refParts[1].trim() : calendarVerse.verseReference;
        const chapter = refParts ? parseInt(refParts[2]) : 1;
        const verseNum = refParts ? parseInt(refParts[3]) : 1;

        const dbVerse = await bibleCache.getVerseByReference(bookName, chapter, verseNum);
        const verseText = dbVerse?.text ?? calendarVerse.verseText;
        setStaticCacheHeaders(res);

        return res.json({
          id: calendarVerse.id,
          verseId: calendarVerse.id,
          date: today.toISOString().split('T')[0],
          verse: {
            id: dbVerse?.id ?? calendarVerse.id,
            text: verseText,
            chapter: chapter,
            verse: verseNum,
          },
          book: {
            name: bookName,
          },
          theme: calendarVerse.theme,
        });
      }
      
      return res.json(null);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch daily verse' });
    }
  });

  // Push notification endpoints
  app.get('/api/push/vapid-key', (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return res.status(503).json({ message: 'Push notifications not configured' });
    res.json({ publicKey: key });
  });

  app.post('/api/push/subscribe', async (req, res) => {
    try {
      const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ message: 'Invalid subscription data' });
      }
      await storage.savePushSubscription(endpoint, keys.p256dh, keys.auth);
      res.json({ success: true });
    } catch (err) {
      console.error('[push/subscribe] ERROR:', err);
      res.status(500).json({ message: 'Failed to save subscription' });
    }
  });

  app.delete('/api/push/unsubscribe', async (req, res) => {
    try {
      const { endpoint } = req.body as { endpoint: string };
      if (!endpoint) return res.status(400).json({ message: 'Missing endpoint' });
      await storage.deletePushSubscription(endpoint);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: 'Failed to remove subscription' });
    }
  });

  // إشعار ترحيبي — يُرسَل عند عودة المستخدم للموقع
  app.post('/api/push/welcome', async (req, res) => {
    try {
      const { endpoint } = req.body as { endpoint: string };
      if (!endpoint) return res.status(400).json({ message: 'Missing endpoint' });
      const sent = await sendWelcomeNotification(endpoint);
      res.json({ sent });
    } catch (err) {
      console.error('[push/welcome] ERROR:', err);
      res.status(500).json({ message: 'Failed to send welcome notification', error: String(err) });
    }
  });

  // اختبار الإشعارات — يُرسَل لكل المشتركين (للتشخيص)
  app.post('/api/push/send-test', async (req, res) => {
    try {
      const result = await sendTestNotification();
      res.json(result);
    } catch {
      res.status(500).json({ message: 'Test notification failed' });
    }
  });

  // ── تشغيل إشعار آية اليوم من خدمة خارجية (cron-job.org أو UptimeRobot)
  // مُؤمَّن بـ CRON_SECRET لمنع الاستخدام غير المصرح به
  app.post('/api/push/trigger-daily', async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const provided = req.headers['x-cron-secret'] || req.body?.secret;
    if (!secret || provided !== secret) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
      // Send both dailies, matching the internal 6 AM cron — otherwise a day
      // driven by the external trigger would silently drop the group reading.
      // Both are date-guarded in app_settings, so repeat calls are no-ops.
      await sendDailyVerseNotification();
      await sendDailyGroupReadingNotification();
      res.json({ success: true, time: new Date().toISOString() });
    } catch {
      res.status(500).json({ message: 'Failed to send daily notification' });
    }
  });

  // حالة الإشعارات — تشخيص سريع
  // يجيب على 3 أسئلة: هل المفاتيح مضبوطة؟ هل المُشغّل اليومي اشتغل النهاردة؟
  // وهل مفتاح VAPID هنا هو نفسه اللي على النشر القديم (لو مختلف → كل الإرسال يفشل).
  app.get('/api/push/status', async (_req, res) => {
    try {
      const subs = await storage.getAllPushSubscriptions();
      const pub = (process.env.VAPID_PUBLIC_KEY || '').trim().replace(/\s+/g, '').replace(/=+$/, '');
      const todayCairo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
      const lastDailySent = await storage.getAppSetting('last_daily_notif_date').catch(() => null);
      const lastGroupSent = await storage.getAppSetting('last_group_reading_notif_date').catch(() => null);
      const lastDailyResult = await storage.getAppSetting('last_daily_notif_result').catch(() => null);
      // توزيع الاشتراكات حسب خدمة الدفع (آبل/جوجل/موزيلا) — لو كل اشتراكات آبل
      // بتفشل وحدها، المشكلة في قبول آبل للـVAPID مش في المفاتيح نفسها.
      const byHost: Record<string, number> = {};
      for (const s of subs) {
        let h = '?';
        try { h = new URL(s.endpoint).host; } catch { /* keep '?' */ }
        byHost[h] = (byHost[h] || 0) + 1;
      }
      res.json({
        vapidConfigured: !!process.env.VAPID_PUBLIC_KEY,
        activeSubscriptions: subs.length,
        // بصمة المفتاح العام — قارنها بين الموقعين؛ لازم تتطابق حرفياً
        vapidKeyFingerprint: pub ? `${pub.slice(0, 6)}…${pub.slice(-6)} (len ${pub.length})` : null,
        todayCairo,
        lastDailySent,
        lastGroupSent,
        dailyRanToday: lastDailySent === todayCairo,
        // ما حصل فعلاً في آخر إرسال يومي (sent/errors أو سبب التوقف)
        lastDailyResult,
        subscriptionsByHost: byHost,
        lastSendError: getLastSendError(),
        vapidSubject: process.env.VAPID_EMAIL || 'mailto:contact@oscardevs.com',
      });
    } catch {
      res.status(500).json({ message: 'Status check failed' });
    }
  });

  app.get('/api/reading-plans', async (_req, res) => {
    try {
      const plans = await bibleCache.getAllReadingPlans();
      setStaticCacheHeaders(res);
      res.json(plans);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch reading plans' });
    }
  });

  app.get('/api/reading-plans/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const plan = await bibleCache.getReadingPlanById(id);

      if (!plan) {
        return res.status(404).json({ message: 'Plan not found' });
      }
      setStaticCacheHeaders(res);

      res.json(plan);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch reading plan' });
    }
  });

  app.get('/api/user/progress', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      const memberKey = (req.query.memberKey as string) || null;
      const progress = await storage.getAllProgressMerged(user.id, memberKey);
      res.json(progress);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch progress' });
    }
  });

  // upsert لكل planId (لا يكرّر صفوف) — يقبل memberKey اختياري
  app.post('/api/user/progress', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      const { planId, currentDay, completedDays, memberKey } = req.body as { planId?: number; currentDay?: number; completedDays?: number[]; memberKey?: string };
      if (!planId) return res.status(400).json({ message: 'planId required' });
      await storage.upsertProgress({
        userId: user.id,
        memberKey: memberKey || null,
        planId,
        currentDay: currentDay ?? 0,
        completedDays: Array.isArray(completedDays) ? completedDays : [],
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: 'Invalid request data' });
    }
  });

  app.put('/api/user/progress/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { currentDay, completedDays } = req.body;

      const progress = await storage.updateUserProgress(id, currentDay, completedDays);
      res.json(progress);
    } catch (error) {
      res.status(400).json({ message: 'Failed to update progress' });
    }
  });

  app.get('/api/user/highlights', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const highlights = await storage.getUserHighlights(user.id);
      res.json(highlights);
    } catch (error) {
      console.error('Highlights fetch error:', error);
      res.status(500).json({ message: 'Failed to fetch highlights' });
    }
  });

  app.post('/api/user/highlights', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const validated = insertHighlightedVerseSchema.parse({
        ...req.body,
        userId: user.id,
      });

      const highlight = await storage.createHighlight(validated);
      res.json(highlight);
    } catch (error) {
      res.status(400).json({ message: 'Invalid request data' });
    }
  });

  app.delete('/api/user/highlights/:id', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const id = parseInt(req.params.id);
      await storage.deleteHighlight(id, user.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: 'Failed to delete highlight' });
    }
  });

  // ─── مزامنة بيانات المستخدم الشخصية (تشتغل للمجهول عبر getCurrentUser) ──────

  // الآيات المحفوظة / المظلّلة (المعتمدة على المرجع)
  app.get('/api/user/saved-verses', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.json([]);
      const rows = await storage.getSavedVerses(user.id, (req.query.memberKey as string) || null);
      res.json(rows);
    } catch { res.status(500).json({ message: 'Failed' }); }
  });
  app.post('/api/user/saved-verses', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(404).json({ message: 'no user' });
      const { verseRef, verseText, kind, color, memberKey } = req.body as any;
      if (!verseRef) return res.status(400).json({ message: 'verseRef required' });
      await storage.upsertSavedVerse({ userId: user.id, memberKey: memberKey || null, verseRef, verseText, kind: kind || 'saved', color });
      res.json({ ok: true });
    } catch { res.status(400).json({ message: 'Invalid' }); }
  });
  app.delete('/api/user/saved-verses', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(404).json({ message: 'no user' });
      const { verseRef, kind } = req.body as any;
      if (!verseRef) return res.status(400).json({ message: 'verseRef required' });
      await storage.deleteSavedVerse(user.id, verseRef, kind || 'saved');
      res.json({ ok: true });
    } catch { res.status(400).json({ message: 'Invalid' }); }
  });

  // آيات الحفظ (أطفال)
  app.get('/api/user/memorized-verses', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.json([]);
      const rows = await storage.getMemorized(user.id, (req.query.memberKey as string) || null);
      res.json(rows);
    } catch { res.status(500).json({ message: 'Failed' }); }
  });
  app.post('/api/user/memorized-verses', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(404).json({ message: 'no user' });
      const { verseRef, memberKey } = req.body as any;
      if (!verseRef) return res.status(400).json({ message: 'verseRef required' });
      await storage.addMemorized({ userId: user.id, memberKey: memberKey || null, verseRef });
      res.json({ ok: true });
    } catch { res.status(400).json({ message: 'Invalid' }); }
  });
  app.delete('/api/user/memorized-verses', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(404).json({ message: 'no user' });
      const { verseRef } = req.body as any;
      if (!verseRef) return res.status(400).json({ message: 'verseRef required' });
      await storage.deleteMemorized(user.id, verseRef);
      res.json({ ok: true });
    } catch { res.status(400).json({ message: 'Invalid' }); }
  });

  // الترانيم المفضّلة
  app.get('/api/user/favorite-hymns', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.json([]);
      const rows = await storage.getFavoriteHymns(user.id, (req.query.memberKey as string) || null);
      res.json(rows);
    } catch { res.status(500).json({ message: 'Failed' }); }
  });
  app.post('/api/user/favorite-hymns', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(404).json({ message: 'no user' });
      const { hymnId, title, memberKey } = req.body as any;
      if (!hymnId) return res.status(400).json({ message: 'hymnId required' });
      await storage.addFavoriteHymn({ userId: user.id, memberKey: memberKey || null, hymnId: String(hymnId), title });
      res.json({ ok: true });
    } catch { res.status(400).json({ message: 'Invalid' }); }
  });
  app.delete('/api/user/favorite-hymns', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(404).json({ message: 'no user' });
      const { hymnId } = req.body as any;
      if (!hymnId) return res.status(400).json({ message: 'hymnId required' });
      await storage.deleteFavoriteHymn(user.id, String(hymnId));
      res.json({ ok: true });
    } catch { res.status(400).json({ message: 'Invalid' }); }
  });

  // قراءاتي اليومية المخصّصة (JSON كامل)
  app.get('/api/user/daily-readings', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.json(null);
      const data = await storage.getUserDailyReadings(user.id, (req.query.memberKey as string) || null);
      res.json(data);
    } catch { res.status(500).json({ message: 'Failed' }); }
  });
  app.post('/api/user/daily-readings', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(404).json({ message: 'no user' });
      const { data, memberKey } = req.body as any;
      await storage.setUserDailyReadings({ userId: user.id, memberKey: memberKey || null, data: data ?? [] });
      res.json({ ok: true });
    } catch { res.status(400).json({ message: 'Invalid' }); }
  });

  // تقدّم خطط القراءة (JSON — planId نصّي)
  app.get('/api/user/plan-progress', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.json(null);
      const data = await storage.getPlanProgress(user.id, (req.query.memberKey as string) || null);
      res.json(data);
    } catch { res.status(500).json({ message: 'Failed' }); }
  });
  app.post('/api/user/plan-progress', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(404).json({ message: 'no user' });
      const { data, memberKey } = req.body as any;
      await storage.setPlanProgress({ userId: user.id, memberKey: memberKey || null, data: data ?? [] });
      res.json({ ok: true });
    } catch { res.status(400).json({ message: 'Invalid' }); }
  });

  // ترحيل لمرة واحدة: snapshot كامل من المتصفّح → upsert idempotent للكل
  app.post('/api/user/sync', async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(404).json({ message: 'no user' });
      const b = req.body as any;
      const memberKey = b.memberKey || null;

      if (Array.isArray(b.savedVerses)) {
        for (const v of b.savedVerses) {
          if (v?.reference) await storage.upsertSavedVerse({ userId: user.id, memberKey, verseRef: v.reference, verseText: v.text, kind: 'saved' });
        }
      }
      if (Array.isArray(b.highlightedVerses)) {
        for (const v of b.highlightedVerses) {
          if (v?.reference) await storage.upsertSavedVerse({ userId: user.id, memberKey, verseRef: v.reference, verseText: v.text, kind: 'highlight', color: v.color });
        }
      }
      if (Array.isArray(b.memorizedVerses)) {
        for (const ref of b.memorizedVerses) {
          if (ref) await storage.addMemorized({ userId: user.id, memberKey, verseRef: String(ref) });
        }
      }
      if (Array.isArray(b.favoriteHymns)) {
        for (const h of b.favoriteHymns) {
          const hid = typeof h === 'string' ? h : h?.hymnId;
          if (hid) await storage.addFavoriteHymn({ userId: user.id, memberKey, hymnId: String(hid), title: typeof h === 'object' ? h?.title : null });
        }
      }
      if (Array.isArray(b.readingPlanProgress)) {
        await storage.setPlanProgress({ userId: user.id, memberKey, data: b.readingPlanProgress });
      }
      if (b.dailyReadings !== undefined && b.dailyReadings !== null) {
        await storage.setUserDailyReadings({ userId: user.id, memberKey, data: b.dailyReadings });
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('[user/sync] error:', e);
      res.status(500).json({ message: 'sync failed' });
    }
  });

  app.get('/api/emotions', async (_req, res) => {
    try {
      const emotions = await bibleCache.getAllEmotions();
      setStaticCacheHeaders(res);
      res.json(emotions);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch emotions' });
    }
  });

  app.get('/api/emotions/:id/verses', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const verses = await bibleCache.getVersesByEmotion(id);
      setStaticCacheHeaders(res);

      const flatVerses = verses.map((verse) => ({
        id: verse.id,
        bookName: verse.bookName,
        chapter: verse.chapter,
        verse: verse.verse,
        text: verse.verseText,
      }));

      res.json(flatVerses);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch emotion verses' });
    }
  });

  app.get('/api/topics', async (_req, res) => {
    try {
      const topics = await bibleCache.getAllTopics();
      setStaticCacheHeaders(res);
      res.json(topics);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch topics' });
    }
  });

  app.get('/api/topics/:id/verses', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const verses = await bibleCache.getVersesByTopic(id);
      setStaticCacheHeaders(res);

      const flatVerses = verses.map((verse) => ({
        id: verse.id,
        bookName: verse.bookName,
        chapter: verse.chapter,
        verse: verse.verse,
        text: verse.verseText,
      }));

      res.json(flatVerses);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch topic verses' });
    }
  });

  app.get('/api/child-stories', async (_req, res) => {
    try {
      const stories = await bibleCache.getAllChildStories();
      setStaticCacheHeaders(res);
      res.json(stories);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch stories' });
    }
  });

  app.get('/api/child-stories/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const story = await bibleCache.getChildStoryById(id);

      if (!story) {
        return res.status(404).json({ message: 'Story not found' });
      }
      setStaticCacheHeaders(res);

      res.json(story);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch story' });
    }
  });

  // AI Query endpoint - works with or without session for maximum compatibility
  app.post('/api/ai/query', async (req, res) => {
    try {
      console.log(`[AI-Route] Received AI query request, sessionID: ${req.sessionID?.substring(0, 8) || 'none'}...`);
      
      // Try to get user from session, but don't require it
      let user = await getCurrentUser(req);
      
      // If no user in session, create a temporary anonymous user object for the query
      if (!user) {
        console.log('[AI-Route] No user in session, using anonymous user for AI query');
        user = {
          id: 'anonymous',
          sessionId: req.sessionID || 'anonymous',
          isPremium: false,
          aiUsageCount: 0,
          aiUsageResetDate: new Date(),
          subscriptionExpiry: null,
          createdAt: new Date(),
          churchNum: null,
        };
      } else {
        console.log(`[AI-Route] User found: ${user.id}`);
      }

      const { query } = req.body;
      console.log(`[AI-Route] Query: "${query?.substring(0, 50)}..."`);
      
      if (!query || typeof query !== 'string') {
        console.log('[AI-Route] Invalid query');
        return res.status(400).json({ message: 'Query is required' });
      }

      console.log('[AI-Route] Processing AI query...');
      const result = await processAiQuery(user, query);
      console.log(`[AI-Route] AI query result: success=${result.success}, emotion=${result.detectedEmotion}`);
      
      res.json(result);
    } catch (error) {
      console.error('[AI-Route] AI query failed:', error);
      res.status(500).json({ message: 'AI query failed' });
    }
  });

  // ── SEO Topic Pages ──────────────────────────────────────────────────────
  // GET /api/topics/:slug — fetch topic + verses + related topics
  app.get('/api/topics/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const topic = await storage.getSeoTopicBySlug(slug);
      if (!topic) return res.status(404).json({ message: 'Not found' });

      // Increment visit count (fire-and-forget)
      storage.incrementTopicVisit(slug).catch(() => {});

      // Fetch verses by keyword matching (no AI)
      const allVerses = await Promise.all(
        topic.keywords.slice(0, 4).map(kw => storage.smartSearchVerses(kw, 8))
      );
      // Deduplicate by id
      const seen = new Set<number>();
      const verses = allVerses.flat()
        .filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true; })
        .slice(0, 20)
        .map(v => ({
          id: v.id,
          bookName: (v as any).bookName || '',
          chapter: v.chapter,
          verse: v.verse,
          text: v.text,
        }));

      // Related topics by shared keywords
      const related = await storage.getSimilarTopics(slug, topic.keywords, 6);

      res.json({
        topic: {
          id: topic.id,
          title: topic.title,
          slug: topic.slug,
          keywords: topic.keywords,
          visitCount: topic.visitCount,
        },
        verses,
        related: related.map(r => ({ title: r.title, slug: r.slug })),
      });
    } catch (err) {
      console.error('[Topics] GET error:', err);
      res.status(500).json({ message: 'Server error' });
    }
  });

  // GET /api/topics — list popular topics
  app.get('/api/topics', async (_req, res) => {
    try {
      const topics = await storage.getPopularTopics(50);
      res.json(topics.map(t => ({ title: t.title, slug: t.slug, visitCount: t.visitCount })));
    } catch (err) {
      res.status(500).json([]);
    }
  });

  // ── SEO Intent + Internal Links API ─────────────────────────────────────
  app.post('/api/seo/context', async (req, res) => {
    try {
      const q = (req.query.q as string || req.body?.query || '').trim();
      const verses: Array<{ bookName: string; chapter: number; verse: number; text: string }> =
        Array.isArray(req.body?.verses) ? req.body.verses : [];

      if (!q) return res.json({ intent: 'general', title: '', links: [], faqSchema: null });

      const { detectIntent } = await import('./seo-intent');
      const { getInternalLinks } = await import('./internal-links');
      const { generateSearchTitle, generateFAQSchema } = await import('./seo-title');

      const intentResult = detectIntent(q);
      const links = getInternalLinks(q, 5);
      const title = generateSearchTitle(q);
      const faqSchema = verses.length > 0 ? generateFAQSchema(q, verses) : null;

      res.json({ intent: intentResult.intent, topics: intentResult.topics, title, links, faqSchema });
    } catch (err) {
      console.error('[SEO-Context] Error:', err);
      res.status(500).json({ intent: 'general', title: '', links: [], faqSchema: null });
    }
  });

  // ── SEO Engagement Tracking ──────────────────────────────────────────────
  app.post('/api/track', async (req, res) => {
    try {
      const sessionId = (req.session as any)?.userId || req.sessionID || 'anon';
      const { page, query, scrollDepth, timeOnPage, verseClicks } = req.body || {};
      if (!page) return res.json({ ok: false });
      await storage.trackEngagement({
        sessionId,
        page: String(page),
        query: query ? String(query) : undefined,
        scrollDepth: Number(scrollDepth) || 0,
        timeOnPage: Number(timeOnPage) || 0,
        verseClicks: Number(verseClicks) || 0,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[Track] Error:', err);
      res.json({ ok: false });
    }
  });

  // Daoud Lamei: serve RSS videos (channel + book playlist if available)
  app.get('/api/lessons/rss', async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const book = req.query.book as string | undefined;
      if (force) clearDaoudLameiCache(book);
      const videos = await fetchDaoudLameiRss(book, force);
      res.json(videos);
    } catch (err) {
      console.error('[DaoudLamei RSS] Route error:', err);
      res.status(500).json([]);
    }
  });

  // ── القراءات اليومية (كتامارس) ──────────────────────────────────────────────
  // تحويل التاريخ الميلادي إلى قبطي
  function gregorianToCopticServer(date: Date): { day: number; month: number } {
    const jdn = Math.floor((date.getTime() - new Date(1970, 0, 1).getTime()) / 86400000) + 2440588;
    const COPTIC_EPOCH = 1824665;
    const rem = jdn - COPTIC_EPOCH;
    const year  = Math.floor((4 * rem + 3) / 1461);
    const dayOfYear = rem - Math.floor((1461 * year) / 4);
    const month = Math.floor(dayOfYear / 30) + 1;
    const day   = dayOfYear % 30 + 1;
    return { day, month };
  }

  // قسّم النص إلى صفحات بحد أقصى 200 حرف
  function splitToSlides(text: string, maxChars = 200): string[] {
    const paragraphs = text.split('\n').filter(p => p.trim() !== '');
    const slides: string[] = [];
    let current = '';
    for (const para of paragraphs) {
      const candidate = current ? current + '\n' + para : para;
      if (candidate.length <= maxChars) {
        current = candidate;
      } else {
        if (current) slides.push(current);
        current = para.length > maxChars ? para.slice(0, maxChars) : para;
      }
    }
    if (current) slides.push(current);
    return slides.length > 0 ? slides : [text.slice(0, maxChars)];
  }

  interface ReadingRef { book: string; fromCh: number; fromVs: number; toCh: number; toVs: number; label: string; }

  async function fetchReadingText(ref: ReadingRef): Promise<{ title: string; slides: string[] }> {
    const bk = await storage.getBookByName(ref.book);
    if (!bk) return { title: ref.label, slides: [`[ ${ref.label} ]`] };

    const versesPerCh = await Promise.all(
      Array.from({ length: ref.toCh - ref.fromCh + 1 }, (_, i) => ref.fromCh + i)
        .map(ch => storage.getVersesByBook(bk.id, ch))
    );

    const filtered = versesPerCh.flatMap((chVerses, i) => {
      const ch = ref.fromCh + i;
      return chVerses.filter(v => {
        if (ch === ref.fromCh && ch === ref.toCh) return v.verse >= ref.fromVs && v.verse <= ref.toVs;
        if (ch === ref.fromCh) return v.verse >= ref.fromVs;
        if (ch === ref.toCh)   return v.verse <= ref.toVs;
        return true;
      });
    });

    const fullText = filtered.map(v => `${v.verse} ${v.text}`).join('\n');
    return { title: ref.label, slides: splitToSlides(fullText) };
  }

  // الكتامارس — مشترك مع الكلاينت لكن مُعرَّف هنا مستقلاً لتجنب حزمة العميل
  function getLectionaryKey(month: number, day: number): string {
    const ANCHORS = [1, 8, 15, 22, 29];
    const closest = ANCHORS.filter(d => d <= day).pop() ?? 1;
    return `${month}-${closest}`;
  }

  const MONTH_NAMES = ['', 'توت', 'بابه', 'هاتور', 'كيهك', 'طوبة', 'أمشير',
    'برمهات', 'برموده', 'بشنس', 'بؤونه', 'أبيب', 'مسرى', 'النسيء'];

  // ⚠️ دي **مش** القطمارس القبطي الحقيقي، رغم إن التعليق القديم كان بيقول كده.
  // خطة قراءات متسلسلة مولّدة آلياً: الإنجيل بيمشي بالترتيب (يوحنا ١ ← ٢ ← ٣ …)
  // والبولس (رومية بالترتيب) والكاثوليكون (يعقوب بالترتيب). القطمارس الحقيقي
  // بيوزّع قراءات محدّدة على أيام السنة الطقسية، مش تقسيم متسلسل للأسفار.
  // وكمان ٤٩ يوم بس من ٣٦٥. لازم يتبدّل بمصدر كنسي معتمد قبل الاعتماد عليه
  // في قدّاس — وعشان كده الـAPI بيرجّع exact=false والشاشة بتنبّه المستخدم.
  const serverLectionary: Record<string, { pauline: ReadingRef; catholic: ReadingRef; praxis: ReadingRef; psalm: ReadingRef; gospel: ReadingRef }> = {
    '1-1':  { pauline: {book:'رومية',fromCh:8,fromVs:1,toCh:8,toVs:11,label:'رومية 8: 1-11'}, catholic: {book:'يعقوب',fromCh:1,fromVs:1,toCh:1,toVs:12,label:'يعقوب 1: 1-12'}, praxis: {book:'أعمال الرسل',fromCh:1,fromVs:15,toCh:1,toVs:26,label:'أعمال 1: 15-26'}, psalm: {book:'المزامير',fromCh:1,fromVs:1,toCh:1,toVs:6,label:'مزمور 1: 1-6'}, gospel: {book:'يوحنا',fromCh:1,fromVs:1,toCh:1,toVs:17,label:'يوحنا 1: 1-17'} },
    '1-8':  { pauline: {book:'رومية',fromCh:8,fromVs:12,toCh:8,toVs:27,label:'رومية 8: 12-27'}, catholic: {book:'يعقوب',fromCh:1,fromVs:13,toCh:1,toVs:27,label:'يعقوب 1: 13-27'}, praxis: {book:'أعمال الرسل',fromCh:2,fromVs:1,toCh:2,toVs:21,label:'أعمال 2: 1-21'}, psalm: {book:'المزامير',fromCh:8,fromVs:1,toCh:8,toVs:9,label:'مزمور 8: 1-9'}, gospel: {book:'يوحنا',fromCh:1,fromVs:18,toCh:1,toVs:34,label:'يوحنا 1: 18-34'} },
    '1-15': { pauline: {book:'رومية',fromCh:8,fromVs:28,toCh:8,toVs:39,label:'رومية 8: 28-39'}, catholic: {book:'يعقوب',fromCh:2,fromVs:1,toCh:2,toVs:13,label:'يعقوب 2: 1-13'}, praxis: {book:'أعمال الرسل',fromCh:2,fromVs:22,toCh:2,toVs:41,label:'أعمال 2: 22-41'}, psalm: {book:'المزامير',fromCh:19,fromVs:1,toCh:19,toVs:6,label:'مزمور 19: 1-6'}, gospel: {book:'يوحنا',fromCh:1,fromVs:35,toCh:1,toVs:51,label:'يوحنا 1: 35-51'} },
    '1-22': { pauline: {book:'رومية',fromCh:9,fromVs:1,toCh:9,toVs:18,label:'رومية 9: 1-18'}, catholic: {book:'يعقوب',fromCh:2,fromVs:14,toCh:2,toVs:26,label:'يعقوب 2: 14-26'}, praxis: {book:'أعمال الرسل',fromCh:3,fromVs:1,toCh:3,toVs:16,label:'أعمال 3: 1-16'}, psalm: {book:'المزامير',fromCh:23,fromVs:1,toCh:23,toVs:6,label:'مزمور 23: 1-6'}, gospel: {book:'يوحنا',fromCh:2,fromVs:1,toCh:2,toVs:12,label:'يوحنا 2: 1-12'} },
    '1-29': { pauline: {book:'رومية',fromCh:10,fromVs:1,toCh:10,toVs:13,label:'رومية 10: 1-13'}, catholic: {book:'يعقوب',fromCh:3,fromVs:1,toCh:3,toVs:18,label:'يعقوب 3: 1-18'}, praxis: {book:'أعمال الرسل',fromCh:4,fromVs:1,toCh:4,toVs:22,label:'أعمال 4: 1-22'}, psalm: {book:'المزامير',fromCh:27,fromVs:1,toCh:27,toVs:6,label:'مزمور 27: 1-6'}, gospel: {book:'يوحنا',fromCh:3,fromVs:1,toCh:3,toVs:21,label:'يوحنا 3: 1-21'} },
    '2-7':  { pauline: {book:'رومية',fromCh:11,fromVs:1,toCh:11,toVs:24,label:'رومية 11: 1-24'}, catholic: {book:'يعقوب',fromCh:4,fromVs:1,toCh:4,toVs:12,label:'يعقوب 4: 1-12'}, praxis: {book:'أعمال الرسل',fromCh:4,fromVs:23,toCh:4,toVs:37,label:'أعمال 4: 23-37'}, psalm: {book:'المزامير',fromCh:34,fromVs:1,toCh:34,toVs:10,label:'مزمور 34: 1-10'}, gospel: {book:'يوحنا',fromCh:4,fromVs:1,toCh:4,toVs:26,label:'يوحنا 4: 1-26'} },
    '2-14': { pauline: {book:'رومية',fromCh:12,fromVs:1,toCh:12,toVs:21,label:'رومية 12: 1-21'}, catholic: {book:'يعقوب',fromCh:4,fromVs:13,toCh:5,toVs:6,label:'يعقوب 4: 13-5: 6'}, praxis: {book:'أعمال الرسل',fromCh:5,fromVs:1,toCh:5,toVs:16,label:'أعمال 5: 1-16'}, psalm: {book:'المزامير',fromCh:46,fromVs:1,toCh:46,toVs:11,label:'مزمور 46: 1-11'}, gospel: {book:'يوحنا',fromCh:5,fromVs:1,toCh:5,toVs:18,label:'يوحنا 5: 1-18'} },
    '2-21': { pauline: {book:'رومية',fromCh:13,fromVs:1,toCh:13,toVs:14,label:'رومية 13: 1-14'}, catholic: {book:'يعقوب',fromCh:5,fromVs:7,toCh:5,toVs:20,label:'يعقوب 5: 7-20'}, praxis: {book:'أعمال الرسل',fromCh:5,fromVs:17,toCh:5,toVs:42,label:'أعمال 5: 17-42'}, psalm: {book:'المزامير',fromCh:48,fromVs:1,toCh:48,toVs:14,label:'مزمور 48: 1-14'}, gospel: {book:'يوحنا',fromCh:6,fromVs:1,toCh:6,toVs:21,label:'يوحنا 6: 1-21'} },
    '2-28': { pauline: {book:'رومية',fromCh:14,fromVs:1,toCh:14,toVs:23,label:'رومية 14: 1-23'}, catholic: {book:'بطرس الأولى',fromCh:1,fromVs:1,toCh:1,toVs:12,label:'بطرس الأولى 1: 1-12'}, praxis: {book:'أعمال الرسل',fromCh:6,fromVs:1,toCh:6,toVs:15,label:'أعمال 6: 1-15'}, psalm: {book:'المزامير',fromCh:92,fromVs:1,toCh:92,toVs:8,label:'مزمور 92: 1-8'}, gospel: {book:'يوحنا',fromCh:6,fromVs:22,toCh:6,toVs:40,label:'يوحنا 6: 22-40'} },
    '3-6':  { pauline: {book:'كورنثوس الأولى',fromCh:1,fromVs:1,toCh:1,toVs:17,label:'كورنثوس الأولى 1: 1-17'}, catholic: {book:'بطرس الأولى',fromCh:1,fromVs:13,toCh:1,toVs:25,label:'بطرس الأولى 1: 13-25'}, praxis: {book:'أعمال الرسل',fromCh:7,fromVs:1,toCh:7,toVs:29,label:'أعمال 7: 1-29'}, psalm: {book:'المزامير',fromCh:95,fromVs:1,toCh:95,toVs:7,label:'مزمور 95: 1-7'}, gospel: {book:'يوحنا',fromCh:6,fromVs:41,toCh:6,toVs:59,label:'يوحنا 6: 41-59'} },
    '3-13': { pauline: {book:'كورنثوس الأولى',fromCh:2,fromVs:1,toCh:2,toVs:16,label:'كورنثوس الأولى 2: 1-16'}, catholic: {book:'بطرس الأولى',fromCh:2,fromVs:1,toCh:2,toVs:12,label:'بطرس الأولى 2: 1-12'}, praxis: {book:'أعمال الرسل',fromCh:7,fromVs:30,toCh:7,toVs:60,label:'أعمال 7: 30-60'}, psalm: {book:'المزامير',fromCh:96,fromVs:1,toCh:96,toVs:9,label:'مزمور 96: 1-9'}, gospel: {book:'يوحنا',fromCh:7,fromVs:1,toCh:7,toVs:24,label:'يوحنا 7: 1-24'} },
    '3-20': { pauline: {book:'كورنثوس الأولى',fromCh:3,fromVs:1,toCh:3,toVs:23,label:'كورنثوس الأولى 3: 1-23'}, catholic: {book:'بطرس الأولى',fromCh:2,fromVs:13,toCh:2,toVs:25,label:'بطرس الأولى 2: 13-25'}, praxis: {book:'أعمال الرسل',fromCh:8,fromVs:1,toCh:8,toVs:25,label:'أعمال 8: 1-25'}, psalm: {book:'المزامير',fromCh:100,fromVs:1,toCh:100,toVs:5,label:'مزمور 100: 1-5'}, gospel: {book:'يوحنا',fromCh:8,fromVs:1,toCh:8,toVs:20,label:'يوحنا 8: 1-20'} },
    '3-27': { pauline: {book:'كورنثوس الأولى',fromCh:4,fromVs:1,toCh:4,toVs:21,label:'كورنثوس الأولى 4: 1-21'}, catholic: {book:'بطرس الأولى',fromCh:3,fromVs:1,toCh:3,toVs:12,label:'بطرس الأولى 3: 1-12'}, praxis: {book:'أعمال الرسل',fromCh:8,fromVs:26,toCh:8,toVs:40,label:'أعمال 8: 26-40'}, psalm: {book:'المزامير',fromCh:111,fromVs:1,toCh:111,toVs:10,label:'مزمور 111: 1-10'}, gospel: {book:'يوحنا',fromCh:9,fromVs:1,toCh:9,toVs:25,label:'يوحنا 9: 1-25'} },
    '4-5':  { pauline: {book:'كورنثوس الأولى',fromCh:5,fromVs:1,toCh:6,toVs:11,label:'كورنثوس الأولى 5-6'}, catholic: {book:'بطرس الأولى',fromCh:3,fromVs:13,toCh:4,toVs:6,label:'بطرس الأولى 3: 13-4: 6'}, praxis: {book:'أعمال الرسل',fromCh:9,fromVs:1,toCh:9,toVs:22,label:'أعمال 9: 1-22'}, psalm: {book:'المزامير',fromCh:122,fromVs:1,toCh:122,toVs:9,label:'مزمور 122: 1-9'}, gospel: {book:'يوحنا',fromCh:10,fromVs:1,toCh:10,toVs:21,label:'يوحنا 10: 1-21'} },
    '4-12': { pauline: {book:'كورنثوس الأولى',fromCh:7,fromVs:1,toCh:7,toVs:7,label:'كورنثوس الأولى 7: 1-7'}, catholic: {book:'بطرس الأولى',fromCh:4,fromVs:7,toCh:4,toVs:19,label:'بطرس الأولى 4: 7-19'}, praxis: {book:'أعمال الرسل',fromCh:9,fromVs:23,toCh:9,toVs:43,label:'أعمال 9: 23-43'}, psalm: {book:'المزامير',fromCh:126,fromVs:1,toCh:126,toVs:6,label:'مزمور 126: 1-6'}, gospel: {book:'يوحنا',fromCh:10,fromVs:22,toCh:10,toVs:42,label:'يوحنا 10: 22-42'} },
    '4-19': { pauline: {book:'كورنثوس الأولى',fromCh:7,fromVs:8,toCh:7,toVs:24,label:'كورنثوس الأولى 7: 8-24'}, catholic: {book:'بطرس الأولى',fromCh:5,fromVs:1,toCh:5,toVs:14,label:'بطرس الأولى 5: 1-14'}, praxis: {book:'أعمال الرسل',fromCh:10,fromVs:1,toCh:10,toVs:23,label:'أعمال 10: 1-23'}, psalm: {book:'المزامير',fromCh:130,fromVs:1,toCh:130,toVs:8,label:'مزمور 130: 1-8'}, gospel: {book:'يوحنا',fromCh:11,fromVs:1,toCh:11,toVs:27,label:'يوحنا 11: 1-27'} },
    '4-26': { pauline: {book:'كورنثوس الأولى',fromCh:7,fromVs:25,toCh:8,toVs:13,label:'كورنثوس الأولى 7: 25-8: 13'}, catholic: {book:'بطرس الثانية',fromCh:1,fromVs:1,toCh:1,toVs:11,label:'بطرس الثانية 1: 1-11'}, praxis: {book:'أعمال الرسل',fromCh:10,fromVs:24,toCh:10,toVs:48,label:'أعمال 10: 24-48'}, psalm: {book:'المزامير',fromCh:132,fromVs:1,toCh:132,toVs:9,label:'مزمور 132: 1-9'}, gospel: {book:'يوحنا',fromCh:11,fromVs:28,toCh:11,toVs:44,label:'يوحنا 11: 28-44'} },
    '5-4':  { pauline: {book:'كورنثوس الأولى',fromCh:9,fromVs:1,toCh:9,toVs:27,label:'كورنثوس الأولى 9: 1-27'}, catholic: {book:'بطرس الثانية',fromCh:1,fromVs:12,toCh:2,toVs:3,label:'بطرس الثانية 1: 12-2: 3'}, praxis: {book:'أعمال الرسل',fromCh:11,fromVs:1,toCh:11,toVs:18,label:'أعمال 11: 1-18'}, psalm: {book:'المزامير',fromCh:133,fromVs:1,toCh:133,toVs:3,label:'مزمور 133: 1-3'}, gospel: {book:'يوحنا',fromCh:12,fromVs:1,toCh:12,toVs:19,label:'يوحنا 12: 1-19'} },
    '5-11': { pauline: {book:'كورنثوس الأولى',fromCh:10,fromVs:1,toCh:10,toVs:22,label:'كورنثوس الأولى 10: 1-22'}, catholic: {book:'بطرس الثانية',fromCh:2,fromVs:4,toCh:2,toVs:22,label:'بطرس الثانية 2: 4-22'}, praxis: {book:'أعمال الرسل',fromCh:11,fromVs:19,toCh:11,toVs:30,label:'أعمال 11: 19-30'}, psalm: {book:'المزامير',fromCh:135,fromVs:1,toCh:135,toVs:7,label:'مزمور 135: 1-7'}, gospel: {book:'يوحنا',fromCh:13,fromVs:1,toCh:13,toVs:20,label:'يوحنا 13: 1-20'} },
    '5-18': { pauline: {book:'كورنثوس الأولى',fromCh:11,fromVs:17,toCh:11,toVs:34,label:'كورنثوس الأولى 11: 17-34'}, catholic: {book:'بطرس الثانية',fromCh:3,fromVs:1,toCh:3,toVs:18,label:'بطرس الثانية 3: 1-18'}, praxis: {book:'أعمال الرسل',fromCh:12,fromVs:1,toCh:12,toVs:24,label:'أعمال 12: 1-24'}, psalm: {book:'المزامير',fromCh:138,fromVs:1,toCh:138,toVs:8,label:'مزمور 138: 1-8'}, gospel: {book:'يوحنا',fromCh:14,fromVs:1,toCh:14,toVs:14,label:'يوحنا 14: 1-14'} },
    '5-25': { pauline: {book:'كورنثوس الأولى',fromCh:12,fromVs:1,toCh:12,toVs:31,label:'كورنثوس الأولى 12: 1-31'}, catholic: {book:'يوحنا الأولى',fromCh:1,fromVs:1,toCh:1,toVs:10,label:'يوحنا الأولى 1: 1-10'}, praxis: {book:'أعمال الرسل',fromCh:13,fromVs:1,toCh:13,toVs:15,label:'أعمال 13: 1-15'}, psalm: {book:'المزامير',fromCh:139,fromVs:1,toCh:139,toVs:12,label:'مزمور 139: 1-12'}, gospel: {book:'يوحنا',fromCh:15,fromVs:1,toCh:15,toVs:17,label:'يوحنا 15: 1-17'} },
    '6-3':  { pauline: {book:'كورنثوس الأولى',fromCh:13,fromVs:1,toCh:14,toVs:5,label:'كورنثوس الأولى 13-14'}, catholic: {book:'يوحنا الأولى',fromCh:2,fromVs:1,toCh:2,toVs:17,label:'يوحنا الأولى 2: 1-17'}, praxis: {book:'أعمال الرسل',fromCh:13,fromVs:16,toCh:13,toVs:52,label:'أعمال 13: 16-52'}, psalm: {book:'المزامير',fromCh:143,fromVs:1,toCh:143,toVs:10,label:'مزمور 143: 1-10'}, gospel: {book:'يوحنا',fromCh:16,fromVs:1,toCh:16,toVs:24,label:'يوحنا 16: 1-24'} },
    '6-10': { pauline: {book:'كورنثوس الأولى',fromCh:15,fromVs:1,toCh:15,toVs:28,label:'كورنثوس الأولى 15: 1-28'}, catholic: {book:'يوحنا الأولى',fromCh:2,fromVs:18,toCh:3,toVs:10,label:'يوحنا الأولى 2: 18-3: 10'}, praxis: {book:'أعمال الرسل',fromCh:14,fromVs:1,toCh:14,toVs:28,label:'أعمال 14: 1-28'}, psalm: {book:'المزامير',fromCh:145,fromVs:1,toCh:145,toVs:13,label:'مزمور 145: 1-13'}, gospel: {book:'يوحنا',fromCh:17,fromVs:1,toCh:17,toVs:19,label:'يوحنا 17: 1-19'} },
    '6-17': { pauline: {book:'كورنثوس الأولى',fromCh:15,fromVs:29,toCh:15,toVs:58,label:'كورنثوس الأولى 15: 29-58'}, catholic: {book:'يوحنا الأولى',fromCh:3,fromVs:11,toCh:4,toVs:6,label:'يوحنا الأولى 3: 11-4: 6'}, praxis: {book:'أعمال الرسل',fromCh:15,fromVs:1,toCh:15,toVs:21,label:'أعمال 15: 1-21'}, psalm: {book:'المزامير',fromCh:146,fromVs:1,toCh:146,toVs:10,label:'مزمور 146: 1-10'}, gospel: {book:'يوحنا',fromCh:18,fromVs:1,toCh:18,toVs:27,label:'يوحنا 18: 1-27'} },
    '6-24': { pauline: {book:'كورنثوس الثانية',fromCh:1,fromVs:1,toCh:1,toVs:22,label:'كورنثوس الثانية 1: 1-22'}, catholic: {book:'يوحنا الأولى',fromCh:4,fromVs:7,toCh:5,toVs:4,label:'يوحنا الأولى 4: 7-5: 4'}, praxis: {book:'أعمال الرسل',fromCh:15,fromVs:22,toCh:15,toVs:41,label:'أعمال 15: 22-41'}, psalm: {book:'المزامير',fromCh:147,fromVs:1,toCh:147,toVs:11,label:'مزمور 147: 1-11'}, gospel: {book:'يوحنا',fromCh:19,fromVs:1,toCh:19,toVs:22,label:'يوحنا 19: 1-22'} },
    '7-3':  { pauline: {book:'كورنثوس الثانية',fromCh:4,fromVs:1,toCh:4,toVs:18,label:'كورنثوس الثانية 4: 1-18'}, catholic: {book:'يوحنا الأولى',fromCh:5,fromVs:5,toCh:5,toVs:21,label:'يوحنا الأولى 5: 5-21'}, praxis: {book:'أعمال الرسل',fromCh:16,fromVs:1,toCh:16,toVs:18,label:'أعمال 16: 1-18'}, psalm: {book:'المزامير',fromCh:148,fromVs:1,toCh:148,toVs:14,label:'مزمور 148: 1-14'}, gospel: {book:'مرقس',fromCh:1,fromVs:1,toCh:1,toVs:20,label:'مرقس 1: 1-20'} },
    '7-10': { pauline: {book:'كورنثوس الثانية',fromCh:5,fromVs:1,toCh:5,toVs:21,label:'كورنثوس الثانية 5: 1-21'}, catholic: {book:'يوحنا الثانية',fromCh:1,fromVs:1,toCh:1,toVs:13,label:'يوحنا الثانية 1: 1-13'}, praxis: {book:'أعمال الرسل',fromCh:16,fromVs:19,toCh:16,toVs:40,label:'أعمال 16: 19-40'}, psalm: {book:'المزامير',fromCh:22,fromVs:1,toCh:22,toVs:11,label:'مزمور 22: 1-11'}, gospel: {book:'مرقس',fromCh:2,fromVs:1,toCh:2,toVs:22,label:'مرقس 2: 1-22'} },
    '7-17': { pauline: {book:'كورنثوس الثانية',fromCh:6,fromVs:1,toCh:6,toVs:18,label:'كورنثوس الثانية 6: 1-18'}, catholic: {book:'يوحنا الثالثة',fromCh:1,fromVs:1,toCh:1,toVs:14,label:'يوحنا الثالثة 1: 1-14'}, praxis: {book:'أعمال الرسل',fromCh:17,fromVs:1,toCh:17,toVs:15,label:'أعمال 17: 1-15'}, psalm: {book:'المزامير',fromCh:31,fromVs:1,toCh:31,toVs:8,label:'مزمور 31: 1-8'}, gospel: {book:'مرقس',fromCh:3,fromVs:1,toCh:3,toVs:21,label:'مرقس 3: 1-21'} },
    '7-24': { pauline: {book:'كورنثوس الثانية',fromCh:7,fromVs:1,toCh:7,toVs:16,label:'كورنثوس الثانية 7: 1-16'}, catholic: {book:'يهوذا',fromCh:1,fromVs:1,toCh:1,toVs:25,label:'يهوذا 1: 1-25'}, praxis: {book:'أعمال الرسل',fromCh:17,fromVs:16,toCh:17,toVs:34,label:'أعمال 17: 16-34'}, psalm: {book:'المزامير',fromCh:38,fromVs:1,toCh:38,toVs:11,label:'مزمور 38: 1-11'}, gospel: {book:'مرقس',fromCh:4,fromVs:1,toCh:4,toVs:25,label:'مرقس 4: 1-25'} },
    '8-2':  { pauline: {book:'غلاطية',fromCh:3,fromVs:23,toCh:4,toVs:7,label:'غلاطية 3: 23-4: 7'}, catholic: {book:'يعقوب',fromCh:1,fromVs:1,toCh:1,toVs:18,label:'يعقوب 1: 1-18'}, praxis: {book:'أعمال الرسل',fromCh:18,fromVs:1,toCh:18,toVs:23,label:'أعمال 18: 1-23'}, psalm: {book:'المزامير',fromCh:40,fromVs:1,toCh:40,toVs:8,label:'مزمور 40: 1-8'}, gospel: {book:'لوقا',fromCh:24,fromVs:1,toCh:24,toVs:35,label:'لوقا 24: 1-35'} },
    '8-9':  { pauline: {book:'أفسس',fromCh:1,fromVs:1,toCh:1,toVs:14,label:'أفسس 1: 1-14'}, catholic: {book:'يعقوب',fromCh:1,fromVs:19,toCh:2,toVs:13,label:'يعقوب 1: 19-2: 13'}, praxis: {book:'أعمال الرسل',fromCh:18,fromVs:24,toCh:19,toVs:10,label:'أعمال 18: 24-19: 10'}, psalm: {book:'المزامير',fromCh:47,fromVs:1,toCh:47,toVs:9,label:'مزمور 47: 1-9'}, gospel: {book:'لوقا',fromCh:24,fromVs:36,toCh:24,toVs:53,label:'لوقا 24: 36-53'} },
    '8-16': { pauline: {book:'أفسس',fromCh:2,fromVs:1,toCh:2,toVs:22,label:'أفسس 2: 1-22'}, catholic: {book:'يعقوب',fromCh:2,fromVs:14,toCh:3,toVs:12,label:'يعقوب 2: 14-3: 12'}, praxis: {book:'أعمال الرسل',fromCh:19,fromVs:11,toCh:19,toVs:41,label:'أعمال 19: 11-41'}, psalm: {book:'المزامير',fromCh:57,fromVs:8,toCh:57,toVs:12,label:'مزمور 57: 8-12'}, gospel: {book:'يوحنا',fromCh:20,fromVs:19,toCh:20,toVs:31,label:'يوحنا 20: 19-31'} },
    '8-23': { pauline: {book:'أفسس',fromCh:3,fromVs:1,toCh:3,toVs:21,label:'أفسس 3: 1-21'}, catholic: {book:'يعقوب',fromCh:3,fromVs:13,toCh:4,toVs:12,label:'يعقوب 3: 13-4: 12'}, praxis: {book:'أعمال الرسل',fromCh:20,fromVs:1,toCh:20,toVs:16,label:'أعمال 20: 1-16'}, psalm: {book:'المزامير',fromCh:66,fromVs:1,toCh:66,toVs:8,label:'مزمور 66: 1-8'}, gospel: {book:'يوحنا',fromCh:21,fromVs:1,toCh:21,toVs:25,label:'يوحنا 21: 1-25'} },
    '9-1':  { pauline: {book:'أفسس',fromCh:4,fromVs:1,toCh:4,toVs:16,label:'أفسس 4: 1-16'}, catholic: {book:'يعقوب',fromCh:4,fromVs:13,toCh:5,toVs:20,label:'يعقوب 4: 13-5: 20'}, praxis: {book:'أعمال الرسل',fromCh:20,fromVs:17,toCh:20,toVs:38,label:'أعمال 20: 17-38'}, psalm: {book:'المزامير',fromCh:68,fromVs:18,toCh:68,toVs:18,label:'مزمور 68: 18'}, gospel: {book:'متى',fromCh:28,fromVs:1,toCh:28,toVs:20,label:'متى 28: 1-20'} },
    '9-8':  { pauline: {book:'أفسس',fromCh:5,fromVs:22,toCh:6,toVs:9,label:'أفسس 5: 22-6: 9'}, catholic: {book:'بطرس الأولى',fromCh:1,fromVs:1,toCh:1,toVs:25,label:'بطرس الأولى 1: 1-25'}, praxis: {book:'أعمال الرسل',fromCh:21,fromVs:1,toCh:21,toVs:17,label:'أعمال 21: 1-17'}, psalm: {book:'المزامير',fromCh:104,fromVs:24,toCh:104,toVs:30,label:'مزمور 104: 24-30'}, gospel: {book:'يوحنا',fromCh:14,fromVs:15,toCh:14,toVs:31,label:'يوحنا 14: 15-31'} },
    '9-15': { pauline: {book:'أفسس',fromCh:6,fromVs:10,toCh:6,toVs:24,label:'أفسس 6: 10-24'}, catholic: {book:'بطرس الأولى',fromCh:2,fromVs:1,toCh:2,toVs:25,label:'بطرس الأولى 2: 1-25'}, praxis: {book:'أعمال الرسل',fromCh:21,fromVs:18,toCh:21,toVs:40,label:'أعمال 21: 18-40'}, psalm: {book:'المزامير',fromCh:68,fromVs:35,toCh:68,toVs:35,label:'مزمور 68: 35'}, gospel: {book:'يوحنا',fromCh:15,fromVs:26,toCh:16,toVs:15,label:'يوحنا 15: 26-16: 15'} },
    '9-22': { pauline: {book:'فيلبي',fromCh:1,fromVs:1,toCh:1,toVs:20,label:'فيلبي 1: 1-20'}, catholic: {book:'بطرس الأولى',fromCh:3,fromVs:1,toCh:3,toVs:22,label:'بطرس الأولى 3: 1-22'}, praxis: {book:'أعمال الرسل',fromCh:22,fromVs:1,toCh:22,toVs:22,label:'أعمال 22: 1-22'}, psalm: {book:'المزامير',fromCh:118,fromVs:105,toCh:118,toVs:105,label:'مزمور 118: 105'}, gospel: {book:'يوحنا',fromCh:16,fromVs:16,toCh:16,toVs:33,label:'يوحنا 16: 16-33'} },
    '10-1': { pauline: {book:'فيلبي',fromCh:2,fromVs:1,toCh:2,toVs:18,label:'فيلبي 2: 1-18'}, catholic: {book:'بطرس الأولى',fromCh:4,fromVs:1,toCh:4,toVs:19,label:'بطرس الأولى 4: 1-19'}, praxis: {book:'أعمال الرسل',fromCh:23,fromVs:1,toCh:23,toVs:22,label:'أعمال 23: 1-22'}, psalm: {book:'المزامير',fromCh:1,fromVs:1,toCh:1,toVs:3,label:'مزمور 1: 1-3'}, gospel: {book:'يوحنا',fromCh:3,fromVs:1,toCh:3,toVs:21,label:'يوحنا 3: 1-21'} },
    '10-8': { pauline: {book:'فيلبي',fromCh:3,fromVs:1,toCh:3,toVs:21,label:'فيلبي 3: 1-21'}, catholic: {book:'بطرس الأولى',fromCh:5,fromVs:1,toCh:5,toVs:14,label:'بطرس الأولى 5: 1-14'}, praxis: {book:'أعمال الرسل',fromCh:24,fromVs:1,toCh:24,toVs:27,label:'أعمال 24: 1-27'}, psalm: {book:'المزامير',fromCh:16,fromVs:11,toCh:16,toVs:11,label:'مزمور 16: 11'}, gospel: {book:'متى',fromCh:5,fromVs:1,toCh:5,toVs:16,label:'متى 5: 1-16'} },
    '10-15':{ pauline: {book:'فيلبي',fromCh:4,fromVs:1,toCh:4,toVs:23,label:'فيلبي 4: 1-23'}, catholic: {book:'بطرس الثانية',fromCh:1,fromVs:1,toCh:1,toVs:21,label:'بطرس الثانية 1: 1-21'}, praxis: {book:'أعمال الرسل',fromCh:25,fromVs:1,toCh:25,toVs:22,label:'أعمال 25: 1-22'}, psalm: {book:'المزامير',fromCh:44,fromVs:3,toCh:44,toVs:3,label:'مزمور 44: 3'}, gospel: {book:'متى',fromCh:13,fromVs:1,toCh:13,toVs:23,label:'متى 13: 1-23'} },
    '10-22':{ pauline: {book:'كولوسي',fromCh:1,fromVs:1,toCh:1,toVs:20,label:'كولوسي 1: 1-20'}, catholic: {book:'بطرس الثانية',fromCh:2,fromVs:1,toCh:2,toVs:22,label:'بطرس الثانية 2: 1-22'}, praxis: {book:'أعمال الرسل',fromCh:26,fromVs:1,toCh:26,toVs:18,label:'أعمال 26: 1-18'}, psalm: {book:'المزامير',fromCh:89,fromVs:15,toCh:89,toVs:15,label:'مزمور 89: 15'}, gospel: {book:'متى',fromCh:16,fromVs:13,toCh:16,toVs:28,label:'متى 16: 13-28'} },
    '11-1': { pauline: {book:'كولوسي',fromCh:3,fromVs:1,toCh:3,toVs:17,label:'كولوسي 3: 1-17'}, catholic: {book:'يوحنا الأولى',fromCh:1,fromVs:1,toCh:2,toVs:6,label:'يوحنا الأولى 1: 1-2: 6'}, praxis: {book:'أعمال الرسل',fromCh:27,fromVs:1,toCh:27,toVs:26,label:'أعمال 27: 1-26'}, psalm: {book:'المزامير',fromCh:90,fromVs:1,toCh:90,toVs:12,label:'مزمور 90: 1-12'}, gospel: {book:'متى',fromCh:18,fromVs:1,toCh:18,toVs:20,label:'متى 18: 1-20'} },
    '11-8': { pauline: {book:'تسالونيكى الأولى',fromCh:1,fromVs:1,toCh:2,toVs:12,label:'تسالونيكى الأولى 1: 1-2: 12'}, catholic: {book:'يوحنا الأولى',fromCh:2,fromVs:7,toCh:2,toVs:29,label:'يوحنا الأولى 2: 7-29'}, praxis: {book:'أعمال الرسل',fromCh:27,fromVs:27,toCh:28,toVs:16,label:'أعمال 27: 27-28: 16'}, psalm: {book:'المزامير',fromCh:93,fromVs:1,toCh:93,toVs:5,label:'مزمور 93: 1-5'}, gospel: {book:'متى',fromCh:22,fromVs:34,toCh:22,toVs:46,label:'متى 22: 34-46'} },
    '11-15':{ pauline: {book:'تسالونيكى الأولى',fromCh:4,fromVs:1,toCh:4,toVs:18,label:'تسالونيكى الأولى 4: 1-18'}, catholic: {book:'يوحنا الأولى',fromCh:3,fromVs:1,toCh:3,toVs:24,label:'يوحنا الأولى 3: 1-24'}, praxis: {book:'أعمال الرسل',fromCh:28,fromVs:17,toCh:28,toVs:31,label:'أعمال 28: 17-31'}, psalm: {book:'المزامير',fromCh:97,fromVs:1,toCh:97,toVs:7,label:'مزمور 97: 1-7'}, gospel: {book:'متى',fromCh:24,fromVs:29,toCh:24,toVs:51,label:'متى 24: 29-51'} },
    '11-22':{ pauline: {book:'تيموثاوس الأولى',fromCh:1,fromVs:1,toCh:1,toVs:20,label:'تيموثاوس الأولى 1: 1-20'}, catholic: {book:'يوحنا الأولى',fromCh:4,fromVs:1,toCh:4,toVs:21,label:'يوحنا الأولى 4: 1-21'}, praxis: {book:'أعمال الرسل',fromCh:1,fromVs:1,toCh:1,toVs:26,label:'أعمال 1: 1-26'}, psalm: {book:'المزامير',fromCh:98,fromVs:1,toCh:98,toVs:9,label:'مزمور 98: 1-9'}, gospel: {book:'متى',fromCh:25,fromVs:31,toCh:25,toVs:46,label:'متى 25: 31-46'} },
    '12-1': { pauline: {book:'عبرانيين',fromCh:11,fromVs:1,toCh:11,toVs:22,label:'عبرانيين 11: 1-22'}, catholic: {book:'يوحنا الأولى',fromCh:5,fromVs:1,toCh:5,toVs:21,label:'يوحنا الأولى 5: 1-21'}, praxis: {book:'أعمال الرسل',fromCh:2,fromVs:1,toCh:2,toVs:47,label:'أعمال 2: 1-47'}, psalm: {book:'المزامير',fromCh:150,fromVs:1,toCh:150,toVs:6,label:'مزمور 150: 1-6'}, gospel: {book:'متى',fromCh:17,fromVs:1,toCh:17,toVs:13,label:'متى 17: 1-13'} },
    '12-8': { pauline: {book:'عبرانيين',fromCh:12,fromVs:1,toCh:12,toVs:17,label:'عبرانيين 12: 1-17'}, catholic: {book:'يوحنا الثانية',fromCh:1,fromVs:1,toCh:1,toVs:13,label:'يوحنا الثانية 1: 1-13'}, praxis: {book:'أعمال الرسل',fromCh:3,fromVs:1,toCh:3,toVs:26,label:'أعمال 3: 1-26'}, psalm: {book:'المزامير',fromCh:149,fromVs:1,toCh:149,toVs:9,label:'مزمور 149: 1-9'}, gospel: {book:'متى',fromCh:19,fromVs:16,toCh:19,toVs:30,label:'متى 19: 16-30'} },
    '12-15':{ pauline: {book:'عبرانيين',fromCh:13,fromVs:1,toCh:13,toVs:25,label:'عبرانيين 13: 1-25'}, catholic: {book:'يوحنا الثالثة',fromCh:1,fromVs:1,toCh:1,toVs:14,label:'يوحنا الثالثة 1: 1-14'}, praxis: {book:'أعمال الرسل',fromCh:4,fromVs:1,toCh:4,toVs:31,label:'أعمال 4: 1-31'}, psalm: {book:'المزامير',fromCh:147,fromVs:12,toCh:147,toVs:20,label:'مزمور 147: 12-20'}, gospel: {book:'متى',fromCh:20,fromVs:1,toCh:20,toVs:28,label:'متى 20: 1-28'} },
    '12-22':{ pauline: {book:'رؤيا يوحنا',fromCh:1,fromVs:1,toCh:1,toVs:8,label:'رؤيا يوحنا 1: 1-8'}, catholic: {book:'يهوذا',fromCh:1,fromVs:1,toCh:1,toVs:25,label:'يهوذا 1: 1-25'}, praxis: {book:'أعمال الرسل',fromCh:5,fromVs:1,toCh:5,toVs:42,label:'أعمال 5: 1-42'}, psalm: {book:'المزامير',fromCh:148,fromVs:1,toCh:148,toVs:14,label:'مزمور 148: 1-14'}, gospel: {book:'متى',fromCh:22,fromVs:1,toCh:22,toVs:22,label:'متى 22: 1-22'} },
    // ── الأعياد الكبرى ──
    'feast-christmas':    { pauline: {book:'غلاطية',fromCh:4,fromVs:4,toCh:4,toVs:7,label:'غلاطية 4: 4-7'}, catholic: {book:'عبرانيين',fromCh:1,fromVs:1,toCh:1,toVs:12,label:'عبرانيين 1: 1-12'}, praxis: {book:'أعمال الرسل',fromCh:13,fromVs:16,toCh:13,toVs:41,label:'أعمال 13: 16-41'}, psalm: {book:'المزامير',fromCh:110,fromVs:3,toCh:110,toVs:3,label:'مزمور 110: 3'}, gospel: {book:'لوقا',fromCh:2,fromVs:1,toCh:2,toVs:20,label:'لوقا 2: 1-20'} },
    'feast-epiphany':     { pauline: {book:'رومية',fromCh:6,fromVs:3,toCh:6,toVs:11,label:'رومية 6: 3-11'}, catholic: {book:'يوحنا الأولى',fromCh:5,fromVs:5,toCh:5,toVs:12,label:'يوحنا الأولى 5: 5-12'}, praxis: {book:'أعمال الرسل',fromCh:19,fromVs:1,toCh:19,toVs:7,label:'أعمال 19: 1-7'}, psalm: {book:'المزامير',fromCh:29,fromVs:3,toCh:29,toVs:3,label:'مزمور 29: 3'}, gospel: {book:'مرقس',fromCh:1,fromVs:9,toCh:1,toVs:11,label:'مرقس 1: 9-11'} },
    'feast-presentation': { pauline: {book:'عبرانيين',fromCh:2,fromVs:14,toCh:2,toVs:18,label:'عبرانيين 2: 14-18'}, catholic: {book:'يوحنا الأولى',fromCh:3,fromVs:1,toCh:3,toVs:10,label:'يوحنا الأولى 3: 1-10'}, praxis: {book:'أعمال الرسل',fromCh:3,fromVs:1,toCh:3,toVs:16,label:'أعمال 3: 1-16'}, psalm: {book:'المزامير',fromCh:45,fromVs:12,toCh:45,toVs:12,label:'مزمور 45: 12'}, gospel: {book:'لوقا',fromCh:2,fromVs:22,toCh:2,toVs:40,label:'لوقا 2: 22-40'} },
    'feast-palm-sunday':  { pauline: {book:'فيلبي',fromCh:4,fromVs:4,toCh:4,toVs:13,label:'فيلبي 4: 4-13'}, catholic: {book:'يوحنا الأولى',fromCh:5,fromVs:1,toCh:5,toVs:5,label:'يوحنا الأولى 5: 1-5'}, praxis: {book:'أعمال الرسل',fromCh:28,fromVs:11,toCh:28,toVs:31,label:'أعمال 28: 11-31'}, psalm: {book:'المزامير',fromCh:118,fromVs:26,toCh:118,toVs:26,label:'مزمور 118: 26'}, gospel: {book:'يوحنا',fromCh:12,fromVs:12,toCh:12,toVs:22,label:'يوحنا 12: 12-22'} },
    'feast-easter':       { pauline: {book:'كورنثوس الأولى',fromCh:5,fromVs:7,toCh:5,toVs:8,label:'كورنثوس الأولى 5: 7-8'}, catholic: {book:'بطرس الأولى',fromCh:1,fromVs:3,toCh:1,toVs:9,label:'بطرس الأولى 1: 3-9'}, praxis: {book:'أعمال الرسل',fromCh:1,fromVs:1,toCh:1,toVs:14,label:'أعمال 1: 1-14'}, psalm: {book:'المزامير',fromCh:118,fromVs:24,toCh:118,toVs:24,label:'مزمور 118: 24'}, gospel: {book:'يوحنا',fromCh:20,fromVs:1,toCh:20,toVs:18,label:'يوحنا 20: 1-18'} },
    'feast-ascension':    { pauline: {book:'أفسس',fromCh:4,fromVs:7,toCh:4,toVs:16,label:'أفسس 4: 7-16'}, catholic: {book:'يوحنا الأولى',fromCh:4,fromVs:7,toCh:4,toVs:21,label:'يوحنا الأولى 4: 7-21'}, praxis: {book:'أعمال الرسل',fromCh:1,fromVs:1,toCh:1,toVs:11,label:'أعمال 1: 1-11'}, psalm: {book:'المزامير',fromCh:47,fromVs:5,toCh:47,toVs:5,label:'مزمور 47: 5'}, gospel: {book:'لوقا',fromCh:24,fromVs:49,toCh:24,toVs:53,label:'لوقا 24: 49-53'} },
    'feast-pentecost':    { pauline: {book:'كورنثوس الأولى',fromCh:12,fromVs:1,toCh:12,toVs:14,label:'كورنثوس الأولى 12: 1-14'}, catholic: {book:'يوحنا الأولى',fromCh:4,fromVs:1,toCh:4,toVs:6,label:'يوحنا الأولى 4: 1-6'}, praxis: {book:'أعمال الرسل',fromCh:2,fromVs:1,toCh:2,toVs:21,label:'أعمال 2: 1-21'}, psalm: {book:'المزامير',fromCh:104,fromVs:30,toCh:104,toVs:30,label:'مزمور 104: 30'}, gospel: {book:'يوحنا',fromCh:14,fromVs:15,toCh:14,toVs:27,label:'يوحنا 14: 15-27'} },
  };

  // يبحث عن قراءة اليوم، ويقول بصراحة إن كانت قراءة اليوم نفسه أم أقرب يوم سابق.
  //
  // النسخة القديمة كانت تبحث في أيام ثابتة [1,8,15,22,29] فقط، بينما مدخلات
  // الجدول الفعلية في الشهور 2..8 مسجّلة على أيام 7/14/21/28 و6/13/20/27 …
  // فلم تكن تُعثر أبداً، فيسقط البحث على الشهر السابق ثم على '1-1'. النتيجة:
  // ستة شهور كاملة (هاتور→برموده، ومنها كيهك والصوم الكبير) كانت تعرض قراءة
  // '1-1' طوال الوقت، ويوم واحد فقط من كل ١٧ يوماً كان يعرض قراءته الصحيحة.
  // الحل: نبحث في مفاتيح الشهر الموجودة فعلاً بدل قائمة أيام مفترضة.
  function getServerLectionary(month: number, day: number): {
    reading: typeof serverLectionary[string]; exact: boolean; sourceKey: string;
  } {
    const exactKey = `${month}-${day}`;
    if (serverLectionary[exactKey]) {
      return { reading: serverLectionary[exactKey], exact: true, sourceKey: exactKey };
    }
    // أقرب يوم سابق داخل نفس الشهر — من المفاتيح الموجودة فعلاً لا من أيام مفترضة
    const daysInMonth = Object.keys(serverLectionary)
      .filter(k => k.startsWith(`${month}-`))
      .map(k => parseInt(k.split('-')[1], 10))
      .filter(d => Number.isFinite(d) && d <= day)
      .sort((a, b) => b - a);
    if (daysInMonth.length) {
      const key = `${month}-${daysInMonth[0]}`;
      return { reading: serverLectionary[key], exact: false, sourceKey: key };
    }
    // وإلا: آخر يوم مسجّل في الشهر السابق
    const prevMonth = month === 1 ? 13 : month - 1;
    const daysPrev = Object.keys(serverLectionary)
      .filter(k => k.startsWith(`${prevMonth}-`))
      .map(k => parseInt(k.split('-')[1], 10))
      .filter(d => Number.isFinite(d))
      .sort((a, b) => b - a);
    if (daysPrev.length) {
      const key = `${prevMonth}-${daysPrev[0]}`;
      return { reading: serverLectionary[key], exact: false, sourceKey: key };
    }
    return { reading: serverLectionary['1-1'], exact: false, sourceKey: '1-1' };
  }

  // حساب الفصح القبطي (أرثوذكسي) باستخدام خوارزمية Meeus/Jones/Butcher مع تحويل يوليانى→ميلادى
  function calculateCopticEaster(year: number): Date {
    const a = year % 4, b = year % 7, c = year % 19;
    const d = (19 * c + 15) % 30;
    const e = (2 * a + 4 * b - d + 34) % 7;
    const month = Math.floor((d + e + 114) / 31);
    const day = ((d + e + 114) % 31) + 1;
    // الكنيسة القبطية تتبع التقويم اليوليانى — يُضاف 13 يوماً للتحويل للميلادى
    const julian = new Date(year, month - 1, day);
    julian.setDate(julian.getDate() + 13);
    return julian;
  }

  function getFeastKey(date: Date): string | null {
    const m = date.getMonth() + 1, d = date.getDate(), y = date.getFullYear();
    if (m === 12 && d === 29) return 'feast-christmas';
    if (m === 1  && d === 7)  return 'feast-christmas'; // الكريسماس الأرثوذكسى 7 يناير
    if (m === 1  && d === 19) return 'feast-epiphany';
    if (m === 2  && d === 15) return 'feast-presentation';
    const easter = calculateCopticEaster(y);
    const diff = Math.round((new Date(y, m - 1, d).getTime() - easter.getTime()) / 86400000);
    if (diff === -7)  return 'feast-palm-sunday';
    if (diff === 0)   return 'feast-easter';
    if (diff === 39)  return 'feast-ascension';
    if (diff === 49)  return 'feast-pentecost';
    return null;
  }

  // GET /api/daily-readings — يُعيد القراءات الخمس مع نصوصها لليوم الحالي
  app.get('/api/daily-readings', async (_req, res) => {
    try {
      const today = new Date();
      const { day, month } = gregorianToCopticServer(today);
      const copticDate = `${day} ${MONTH_NAMES[month] ?? 'توت'}`;
      const feastKey = getFeastKey(today);
      const feastReading = feastKey ? serverLectionary[feastKey] : undefined;
      const resolved = feastReading
        ? { reading: feastReading, exact: true, sourceKey: feastKey as string }
        : getServerLectionary(month, day);
      const lectionary = resolved.reading;

      const [pauline, catholic, praxis, psalm, gospel] = await Promise.all([
        fetchReadingText(lectionary.pauline),
        fetchReadingText(lectionary.catholic),
        fetchReadingText(lectionary.praxis),
        fetchReadingText(lectionary.psalm),
        fetchReadingText(lectionary.gospel),
      ]);

      // exact=false يعني إن دي أقرب قراءة سابقة مش قراءة اليوم نفسه. الشاشة
      // لازم تقول كده بوضوح — عرض قراءة يوم تاني كأنها قراءة النهاردة في قدّاس
      // أسوأ بكتير من إننا نقول إنها غير مؤكدة.
      const sourceDay = /^\d+-\d+$/.test(resolved.sourceKey)
        ? `${resolved.sourceKey.split('-')[1]} ${MONTH_NAMES[parseInt(resolved.sourceKey.split('-')[0], 10)] ?? ''}`.trim()
        : resolved.sourceKey;
      res.json({
        copticDate, pauline, catholic, praxis, psalm, gospel,
        exact: resolved.exact,
        sourceDay,
      });
    } catch (err) {
      console.error('daily-readings error:', err);
      res.status(500).json({ error: 'فشل جلب القراءات' });
    }
  });

  // ── Liturgy Presentation Session (per-user) ───────────────────────────────
  type LiturgySessionState = {
    slot: string; liturgyType: string; sectionKey: string;
    slideIndex: number; deaconOverride: unknown; copticMode: string;
    readingsOverride: unknown; occasion: string; seasonalLitany: string; updatedAt: number;
  };

  const liturgySessions = new Map<string, LiturgySessionState>();

  function makeDefaultSession(slot: string): LiturgySessionState {
    return { slot, liturgyType: 'basil', sectionKey: 'basil-opening',
             slideIndex: 0, deaconOverride: null, copticMode: 'script', readingsOverride: null,
             occasion: 'ordinary', seasonalLitany: 'weather', updatedAt: Date.now() };
  }

  // GET جلسة المستخدم الحالي (يُعيد slot الخاص به أيضاً)
  app.get('/api/liturgy-session', async (req, res) => {
    const num = await storage.assignChurchNum(req.session.userId!);
    const slot = `user${num}`;
    res.json(liturgySessions.get(slot) ?? makeDefaultSession(slot));
  });

  // GET by slot — مفتوح لأي جهاز (شاشة العرض)
  app.get('/api/liturgy-session/:slot', (req, res) => {
    const slot = req.params.slot;
    res.json(liturgySessions.get(slot) ?? makeDefaultSession(slot));
  });

  // POST — يُحدّث جلسة المستخدم الحالي فقط
  // نُمرّر كل حقول req.body مباشرةً حتى لا نحتاج تعديل عند إضافة حقول جديدة
  app.post('/api/liturgy-session', async (req, res) => {
    const num = await storage.assignChurchNum(req.session.userId!);
    const slot = `user${num}`;
    const existing = liturgySessions.get(slot) ?? makeDefaultSession(slot);
    const body = req.body ?? {};
    // slot و updatedAt محجوزان للسيرفر فقط
    const { slot: _s, updatedAt: _u, ...clientFields } = body;
    const next = { ...existing, ...clientFields, slot, updatedAt: Date.now() };
    liturgySessions.set(slot, next);
    res.json(next);
  });

  return httpServer;
}
