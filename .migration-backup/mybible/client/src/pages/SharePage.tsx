import { useParams, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Share2, Copy, BookOpen, ChevronLeft, Loader2, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useState, useEffect } from 'react';
import { useExitTracker } from '@/hooks/useExitTracker';

const SITE_URL = 'https://mybible.oscardevs.com';
const SITE_NAME = 'الكتاب المقدس رفيقي';

interface SharedVerse {
  id: number;
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
  bookName: string;
}

interface RelatedVerse {
  id: number;
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
}

async function fetchSharedVerse(id: string): Promise<SharedVerse> {
  const res = await fetch(`/api/verse/${id}`);
  if (!res.ok) throw new Error('Verse not found');
  return res.json();
}

async function fetchRelatedVerses(bookId: number, chapter: number, excludeVerseId: number): Promise<RelatedVerse[]> {
  const res = await fetch(`/api/verses/book/${bookId}?chapter=${chapter}`);
  if (!res.ok) return [];
  const verses: RelatedVerse[] = await res.json();
  return verses.filter(v => v.id !== excludeVerseId).slice(0, 5);
}

export default function SharePage() {
  useExitTracker('/share');
  const params = useParams<{ type: string; id: string }>();
  const [, navigate] = useLocation();
  const [copied, setCopied] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

  const verseId = params.id;

  const { data: verse, isLoading, error } = useQuery({
    queryKey: ['shared-verse', verseId],
    queryFn: () => fetchSharedVerse(verseId),
    enabled: !!verseId,
  });

  const { data: relatedVerses } = useQuery({
    queryKey: ['related-verses', verse?.bookId, verse?.chapter, verse?.id],
    queryFn: () => fetchRelatedVerses(verse!.bookId, verse!.chapter, verse!.id),
    enabled: !!verse,
  });

  useEffect(() => {
    if (verse) {
      const title = `${verse.text.slice(0, 60)}... — ${verse.bookName} ${verse.chapter}:${verse.verse}`;
      document.title = `${title} | ${SITE_NAME}`;

      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', title);

      const ogDesc = document.querySelector('meta[property="og:description"]');
      if (ogDesc) ogDesc.setAttribute('content', `${verse.text} — اقرأ الكتاب المقدس بالعربية على ${SITE_NAME}`);

      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute('content', `${SITE_URL}/share/verse/${verse.id}`);
    }
  }, [verse]);

  const shareUrl = `${SITE_URL}/share/verse/${verseId}`;

  const handleShare = async () => {
    const shareText = verse
      ? `"${verse.text}"\n\n📖 ${verse.bookName} ${verse.chapter}:${verse.verse}\n\n${shareUrl}`
      : shareUrl;

    if (navigator.share) {
      try {
        await navigator.share({
          title: verse ? `${verse.bookName} ${verse.chapter}:${verse.verse}` : SITE_NAME,
          text: shareText,
          url: shareUrl,
        });
        setShareSuccess(true);
        setTimeout(() => setShareSuccess(false), 2000);
      } catch {
        handleCopy();
      }
    } else {
      handleCopy();
    }
  };

  const handleCopy = async () => {
    const text = verse
      ? `"${verse.text}"\n\n📖 ${verse.bookName} ${verse.chapter}:${verse.verse}\n\n${shareUrl}`
      : shareUrl;
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReadChapter = () => {
    if (!verse) return;
    navigate(`/bible?book=${encodeURIComponent(verse.bookName)}&chapter=${verse.chapter}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !verse) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" dir="rtl">
        <p className="text-xl text-muted-foreground">الآية غير موجودة</p>
        <Button onClick={() => navigate('/bible')}>
          <BookOpen className="w-4 h-4 ml-2" />
          افتح الكتاب المقدس
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30" dir="rtl">
      <div className="max-w-xl mx-auto px-4 py-8 space-y-6">

        {/* PHASE 4: AUTO BRANDING — header with logo + site name */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity"
            data-testid="link-home"
          >
            <img src="/logo.png" alt={SITE_NAME} className="w-8 h-8 rounded-lg" />
            <span className="font-display font-bold text-lg">{SITE_NAME}</span>
          </button>
          <span className="text-xs text-muted-foreground">mybible.oscardevs.com</span>
        </motion.div>

        {/* PHASE 1: SHARE PAGE — main verse card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="relative overflow-hidden border-2 border-primary/20 shadow-xl">
            {/* Decorative gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 pointer-events-none" />

            <div className="relative p-6 space-y-4">
              {/* Verse reference badge */}
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-sm font-bold px-3 py-1 rounded-full">
                  <BookOpen className="w-3.5 h-3.5" />
                  {verse.bookName} <bdo dir="ltr">{verse.verse}:{verse.chapter}</bdo>
                </span>
                <span className="text-xs text-muted-foreground">الكتاب المقدس</span>
              </div>

              {/* Verse text — large and beautiful */}
              <blockquote
                className="font-display text-xl md:text-2xl leading-loose text-foreground text-right border-r-4 border-primary pr-4 py-2"
                data-testid="text-shared-verse"
              >
                {verse.text}
              </blockquote>

              {/* PHASE 4: branding footer */}
              <div className="flex items-center justify-between pt-2 border-t border-muted">
                <span className="text-xs text-muted-foreground font-medium">الكتاب المقدس بالعربية</span>
                <span className="text-xs text-muted-foreground">mybible.oscardevs.com</span>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* PHASE 2: SMART SHARE LINKS — share buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex gap-3"
        >
          <Button
            className="flex-1 bg-gradient-to-r from-primary to-primary/80 text-white gap-2"
            onClick={handleShare}
            data-testid="button-share-verse"
          >
            {shareSuccess ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
            {shareSuccess ? 'تم المشاركة!' : 'مشاركة الآية'}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleCopy}
            data-testid="button-copy-link"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'تم!' : 'نسخ'}
          </Button>
        </motion.div>

        {/* PHASE 1: CTA — "اقرأ الإصحاح بالكامل" */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <Button
            variant="outline"
            className="w-full gap-2 border-primary/30 hover:border-primary hover:bg-primary/5 text-base py-6"
            onClick={handleReadChapter}
            data-testid="button-read-chapter"
          >
            <BookOpen className="w-5 h-5 text-primary" />
            <span>اقرأ {verse.bookName} الإصحاح {verse.chapter} بالكامل</span>
            <ChevronLeft className="w-4 h-4 text-primary mr-auto" />
          </Button>
        </motion.div>

        {/* PHASE 5: ENGAGEMENT LOOP — similar verses */}
        {relatedVerses && relatedVerses.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-3"
          >
            <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
              <span className="w-1 h-5 bg-primary rounded-full inline-block" />
              آيات من نفس الإصحاح
            </h2>
            <div className="space-y-3">
              {relatedVerses.map((rv, i) => (
                <motion.div
                  key={rv.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.06 }}
                >
                  <Card
                    className="p-4 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all group"
                    onClick={() => navigate(`/share/verse/${rv.id}`)}
                    data-testid={`card-related-verse-${rv.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-primary font-bold text-sm shrink-0 mt-0.5">
                        {rv.verse}
                      </span>
                      <p className="text-base leading-relaxed text-foreground line-clamp-3 flex-1">
                        {rv.text}
                      </p>
                      <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* اقرأ المزيد */}
            <Button
              variant="ghost"
              className="w-full text-primary hover:text-primary hover:bg-primary/5 gap-2"
              onClick={handleReadChapter}
              data-testid="button-read-more"
            >
              اقرأ المزيد من {verse.bookName}
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </motion.div>
        )}

        {/* Discover the app */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="p-5 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt={SITE_NAME} className="w-12 h-12 rounded-xl shadow" />
              <div className="flex-1 text-right">
                <h3 className="font-display font-bold text-foreground">{SITE_NAME}</h3>
                <p className="text-sm text-muted-foreground">قراءة · تعزية · دراسة</p>
              </div>
              <Button
                size="sm"
                className="bg-primary text-white gap-1 shrink-0"
                onClick={() => navigate('/')}
                data-testid="button-visit-app"
              >
                افتح التطبيق
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
            </div>
          </Card>
        </motion.div>

      </div>
    </div>
  );
}
