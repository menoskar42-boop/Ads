import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrendingUp, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';

interface PageScore {
  pageUrl: string;
  score: number;
  totalSessions: number;
  avgTimeSpent: number;
  avgScrollPercent: number;
  totalClicks: number;
}

const PAGE_LABELS: Record<string, { label: string; emoji: string }> = {
  '/':          { label: 'الصفحة الرئيسية',   emoji: '🏠' },
  '/bible':     { label: 'الكتاب المقدس',     emoji: '📖' },
  '/emotions':  { label: 'التعزية الروحية',   emoji: '💙' },
  '/kids':      { label: 'قصص للأطفال',       emoji: '🌟' },
  '/orthodox':  { label: 'أرثوذوكسيات',       emoji: '✝️' },
  '/plans':     { label: 'خطط القراءة',       emoji: '📅' },
  '/search':    { label: 'البحث في الكتاب',   emoji: '🔍' },
  '/daily-verse': { label: 'آية اليوم',       emoji: '🌅' },
};

function getPageLabel(url: string): { label: string; emoji: string } {
  if (PAGE_LABELS[url]) return PAGE_LABELS[url];
  if (url.startsWith('/bible?book=')) {
    const params = new URLSearchParams(url.split('?')[1]);
    const book = params.get('book') || '';
    const ch = params.get('chapter');
    return { label: ch ? `${book} — الإصحاح ${ch}` : book, emoji: '📖' };
  }
  if (url.startsWith('/topics/')) {
    return { label: url.replace('/topics/', '').replace(/-/g, ' '), emoji: '🏷️' };
  }
  return { label: url, emoji: '📄' };
}

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
      <motion.div
        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
    </div>
  );
}

export function TrendingContent() {
  const { data: scores, isLoading } = useQuery<PageScore[]>({
    queryKey: ['/api/metrics/trending'],
    queryFn: async () => {
      const res = await fetch('/api/metrics/trending');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });

  if (isLoading || !scores || scores.length === 0) return null;

  const maxScore = Math.max(...scores.map(s => s.score), 1);

  return (
    <section dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-5 h-5 text-orange-500" />
        <h2 className="font-display text-lg font-bold text-foreground">الأكثر تفاعلاً</h2>
        <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 mr-auto">
          مباشر
        </Badge>
      </div>

      <Card className="p-4 divide-y divide-border/50">
        {scores.slice(0, 5).map((item, i) => {
          const { label, emoji } = getPageLabel(item.pageUrl);
          const isExternal = false;
          return (
            <motion.div
              key={item.pageUrl}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              className="py-3 first:pt-0 last:pb-0"
            >
              <Link href={item.pageUrl} data-testid={`trending-item-${i}`}>
                <div className="flex items-center gap-3 group cursor-pointer">
                  <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center flex-shrink-0 text-base">
                    {emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm text-foreground group-hover:text-orange-600 transition-colors truncate">
                        {label}
                      </p>
                      <span className="text-xs font-bold text-orange-600 flex-shrink-0">
                        {item.score.toLocaleString('ar')}
                      </span>
                    </div>
                    <ScoreBar score={item.score} max={maxScore} />
                    <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>⏱ {item.avgTimeSpent}ث</span>
                      <span>📜 {item.avgScrollPercent}%</span>
                      <span>👆 {item.totalClicks} نقرة</span>
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </Card>

      <p className="text-xs text-muted-foreground text-center mt-2">
        الترتيب بناءً على وقت القراءة والتفاعل الحقيقي للمستخدمين
      </p>
    </section>
  );
}
