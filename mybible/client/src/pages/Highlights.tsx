import { motion } from 'framer-motion';
import { Bookmark, Trash2, Share2, Highlighter } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { cn } from '@/lib/utils';
import {
  getMergedVerses,
  removeVerse,
  removeHighlightedVerse,
  type MergedVerse,
} from '@/lib/saved-verses';

const highlightColorClasses: Record<string, string> = {
  yellow: 'bg-yellow-100 dark:bg-yellow-900/30',
  green: 'bg-green-100 dark:bg-green-900/30',
  blue: 'bg-blue-100 dark:bg-blue-900/30',
  pink: 'bg-pink-100 dark:bg-pink-900/30',
  orange: 'bg-orange-100 dark:bg-orange-900/30',
};

export default function Highlights() {
  const [verses, setVerses] = useState<MergedVerse[]>(() => getMergedVerses());

  const refresh = useCallback(() => {
    setVerses(getMergedVerses());
  }, []);

  const handleDelete = (verse: MergedVerse) => {
    if (verse.type === 'saved') {
      removeVerse(verse.reference);
    } else {
      removeHighlightedVerse(verse.reference);
    }
    refresh();
    toast.success('تم حذف الآية');
  };

  const handleShare = async (verse: MergedVerse) => {
    const shareText = verse.text + ' - ' + verse.reference;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'آية من الكتاب المقدس',
          text: shareText,
          url: 'https://mybible.oscardevs.com',
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          await copyToClipboard(shareText);
        }
      }
    } else {
      await copyToClipboard(shareText);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('تم نسخ الآية، يمكنك لصقها في واتساب أو فيسبوك');
    } catch {
      toast.error('لم يتم النسخ، حاول مرة أخرى');
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md">
            <Bookmark className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">آياتي المحفوظة</h1>
            <p className="text-sm text-muted-foreground">الآيات التي قمت بحفظها أو تظليلها</p>
          </div>
        </div>

        {verses.length === 0 ? (
          <Card className="p-8 text-center">
            <Bookmark className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-display text-lg font-semibold text-foreground mb-2">
              لم تقم بحفظ أو تظليل أي آيات بعد
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              اضغط على زر "حفظ" في آية اليوم أو ظلّل آية أثناء القراءة
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/">
                <Button variant="outline" data-testid="button-go-home">
                  الصفحة الرئيسية
                </Button>
              </Link>
              <Link href="/bible">
                <Button variant="outline" data-testid="button-go-read">
                  ابدأ القراءة
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {verses.map((verse, index) => (
              <motion.div
                key={`${verse.type}-${verse.reference}-${verse.date}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card
                  className={cn(
                    'p-5 hover:shadow-md transition-shadow',
                    verse.type === 'highlight' && verse.color && highlightColorClasses[verse.color]
                  )}
                  data-testid={`verse-card-${index}`}
                >
                  <div className="flex items-start gap-3">
                    {verse.type === 'saved' ? (
                      <Bookmark className="w-5 h-5 text-primary shrink-0 mt-1.5 fill-current" />
                    ) : (
                      <Highlighter className="w-5 h-5 text-amber-500 shrink-0 mt-1.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {verse.type === 'saved' ? (
                          <Badge variant="secondary" className="text-xs" data-testid={`badge-${index}`}>
                            ⭐ محفوظة
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs" data-testid={`badge-${index}`}>
                            ✏️ مظللة
                          </Badge>
                        )}
                      </div>
                      <p className="font-display text-lg leading-relaxed text-foreground mb-2" data-testid={`verse-text-${index}`}>
                        {verse.text}
                      </p>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm font-semibold text-primary" data-testid={`verse-ref-${index}`}>
                          {verse.reference}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {verse.date}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleShare(verse)}
                            data-testid={`share-${index}`}
                          >
                            <Share2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(verse)}
                            data-testid={`delete-${index}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
