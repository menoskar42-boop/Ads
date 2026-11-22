import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertTriangle, TrendingDown, Lightbulb, BarChart3, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SEOHead } from '@/components/SEOHead';

interface DashboardData {
  worstPages: Array<{ pageUrl: string; totalExits: number; topIssue: string }>;
  topIssues: Array<{ issueType: string; total: number }>;
}

const ISSUE_META: Record<string, { label: string; color: string; suggestion: string; emoji: string }> = {
  weak_intro:      { label: 'مقدمة ضعيفة',      color: 'bg-red-100 text-red-700 border-red-200',    suggestion: 'ابدأ بآية قوية أو محتوى لافت في الأعلى',     emoji: '🚪' },
  boring_content:  { label: 'محتوى غير جذاب',   color: 'bg-orange-100 text-orange-700 border-orange-200', suggestion: 'قلّل الفقرات وأضف تفاعلاً (أزرار وروابط)', emoji: '😴' },
  missing_target:  { label: 'هدف مفقود',         color: 'bg-yellow-100 text-yellow-700 border-yellow-200', suggestion: 'أضف زر CTA مبكراً في الصفحة',            emoji: '🎯' },
};

const PAGE_LABELS: Record<string, string> = {
  '/':          'الصفحة الرئيسية',
  '/bible':     'الكتاب المقدس',
  '/emotions':  'التعزية الروحية',
  '/kids':      'للأطفال',
  '/orthodox':  'أرثوذوكسيات',
  '/plans':     'خطط القراءة',
  '/search':    'البحث',
};

function getPageLabel(url: string) {
  return PAGE_LABELS[url] || url;
}

function IssueBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden mt-1">
      <motion.div
        className="h-full bg-gradient-to-r from-red-400 to-orange-400 rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
    </div>
  );
}

export default function ExitIntelligence() {
  const { data, isLoading, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ['/api/exit/dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/exit/dashboard');
      if (!res.ok) return { worstPages: [], topIssues: [] };
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const maxExits = Math.max(...(data?.worstPages.map(p => p.totalExits) || [1]), 1);
  const maxIssue = Math.max(...(data?.topIssues.map(i => i.total) || [1]), 1);

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl" dir="rtl">
      <SEOHead />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow">
            <TrendingDown className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">ذكاء الخروج</h1>
            <p className="text-sm text-muted-foreground">تحليل أسباب مغادرة المستخدمين</p>
          </div>
        </div>
        <Button
          variant="outline" size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="btn-refresh-dashboard"
        >
          <RefreshCw className={`w-4 h-4 ml-1 ${isFetching ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">

          {/* Issue Distribution */}
          <section>
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              توزيع المشكلات
            </h2>
            {!data?.topIssues.length ? (
              <Card className="p-6 text-center text-muted-foreground text-sm">لا توجد بيانات بعد — ستظهر هنا عندما يبدأ المستخدمون في تصفح التطبيق</Card>
            ) : (
              <div className="grid sm:grid-cols-3 gap-3">
                {data.topIssues.map((issue) => {
                  const meta = ISSUE_META[issue.issueType];
                  if (!meta) return null;
                  return (
                    <motion.div key={issue.issueType} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                      <Card className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-2xl">{meta.emoji}</span>
                          <span className="text-xl font-bold text-foreground">{issue.total.toLocaleString('ar')}</span>
                        </div>
                        <Badge variant="outline" className={`text-xs ${meta.color} mb-2`}>{meta.label}</Badge>
                        <IssueBar value={issue.total} max={maxIssue} />
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Worst Pages */}
          <section>
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              الصفحات الأكثر مشكلةً
            </h2>
            {!data?.worstPages.length ? (
              <Card className="p-6 text-center text-muted-foreground text-sm">لا توجد مشكلات مرصودة حتى الآن</Card>
            ) : (
              <Card className="divide-y divide-border/50">
                {data.worstPages.map((page, i) => {
                  const meta = ISSUE_META[page.topIssue];
                  return (
                    <motion.div
                      key={page.pageUrl}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-4"
                      data-testid={`worst-page-${i}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{getPageLabel(page.pageUrl)}</p>
                          <p className="text-xs text-muted-foreground">{page.pageUrl}</p>
                          <IssueBar value={page.totalExits} max={maxExits} />
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold text-foreground">{page.totalExits}</div>
                          <div className="text-xs text-muted-foreground">خروج</div>
                          {meta && (
                            <Badge variant="outline" className={`text-xs mt-1 ${meta.color}`}>
                              {meta.emoji} {meta.label}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </Card>
            )}
          </section>

          {/* Optimization Suggestions */}
          <section>
            <h2 className="font-semibold text-base mb-3 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              اقتراحات التحسين التلقائي
            </h2>
            <div className="space-y-2">
              {Object.entries(ISSUE_META).map(([key, meta]) => (
                <Card key={key} className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{meta.emoji}</span>
                    <div>
                      <Badge variant="outline" className={`text-xs ${meta.color} mb-1`}>{meta.label}</Badge>
                      <p className="text-sm text-foreground font-medium">{meta.suggestion}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {key === 'weak_intro'     && 'يُطبَّق تلقائياً: رفع آية اليوم لأعلى الصفحة'}
                        {key === 'boring_content' && 'يُطبَّق تلقائياً: إخفاء الفقرات الطويلة'}
                        {key === 'missing_target' && 'يُطبَّق تلقائياً: إظهار أزرار التصفح مبكراً'}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
