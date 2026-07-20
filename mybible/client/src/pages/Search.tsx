import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search as SearchIcon, Sparkles, Book, Clock, X, Target, Brain } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SEOHead } from '@/components/SEOHead';
import { SeoSmartBlock } from '@/components/SeoSmartBlock';
import { usePageTracker } from '@/hooks/usePageTracker';
import { useExitTracker } from '@/hooks/useExitTracker';

type SearchResult = {
  id: number;
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
  bookName?: string;
  relevanceScore?: number;
  matchType?: string;
  book?: { name: string };
};

const suggestedSearches = [
  'المحبة', 'الصبر', 'السلام', 'الإيمان', 'الرجاء', 'الفرح',
  'الصلاة', 'الغفران', 'الخلاص', 'الحكمة',
];

function VerseCard({ result, index, type }: { result: SearchResult; index: number; type: 'exact' | 'semantic' }) {
  const bookLabel = result.bookName || result.book?.name || `سفر ${result.bookId}`;
  return (
    <motion.div
      key={result.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card
        className="p-4 hover:shadow-md transition-shadow cursor-pointer"
        data-testid={`result-${type}-${index}`}
      >
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            type === 'exact'
              ? 'bg-primary/10'
              : 'bg-purple-500/10'
          }`}>
            {type === 'exact'
              ? <Book className="w-4 h-4 text-primary" />
              : <Brain className="w-4 h-4 text-purple-500" />
            }
          </div>
          <div className="flex-1">
            <p className={`text-sm font-semibold mb-1 ${
              type === 'exact' ? 'text-primary' : 'text-purple-600 dark:text-purple-400'
            }`}>
              {bookLabel} <bdo dir="ltr">{result.verse}:{result.chapter}</bdo>
            </p>
            <p className="font-display text-xl md:text-2xl leading-loose text-foreground">
              {result.text}
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function SectionHeader({ icon, title, count, color }: {
  icon: React.ReactNode;
  title: string;
  count: number;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${color}`}>
      {icon}
      <span className="font-display font-semibold text-base">{title}</span>
      <Badge variant="secondary" className="text-xs mr-auto">{count}</Badge>
    </div>
  );
}

function useEngagementTracker(query: string, hasSearched: boolean) {
  const startRef = useRef(Date.now());
  const clicksRef = useRef(0);
  const scrollRef = useRef(0);

  useEffect(() => {
    if (!hasSearched) return;
    startRef.current = Date.now();
    clicksRef.current = 0;
    scrollRef.current = 0;

    const onScroll = () => {
      const pct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      if (pct > scrollRef.current) scrollRef.current = Math.min(100, pct);
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      const seconds = Math.round((Date.now() - startRef.current) / 1000);
      if (seconds < 3) return;
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: '/search',
          query,
          scrollDepth: scrollRef.current,
          timeOnPage: seconds,
          verseClicks: clicksRef.current,
        }),
        keepalive: true,
      }).catch(() => {});
    };
  }, [query, hasSearched]);

  const trackClick = () => { clicksRef.current += 1; };
  return { trackClick };
}

export default function Search() {
  usePageTracker('/search');
  useExitTracker('/search');
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [lastQuery, setLastQuery] = useState('');

  const searchMutation = useMutation({
    mutationFn: (q: string) => api.verses.aiEnhancedSearch(q),
  });

  const handleSearch = (q?: string) => {
    const term = (q ?? query).trim();
    if (!term) return;
    setLastQuery(term);
    setHasSearched(true);
    searchMutation.mutate(term);
  };

  const handleClear = () => {
    setQuery('');
    setLastQuery('');
    setHasSearched(false);
    searchMutation.reset();
  };

  const exactResults: SearchResult[] = searchMutation.data?.exactResults ?? searchMutation.data?.results ?? [];
  const semanticResults: SearchResult[] = searchMutation.data?.semanticResults ?? [];
  const enhanced = searchMutation.data?.enhanced ?? false;
  const isLoading = searchMutation.isPending;
  const totalCount = exactResults.length + semanticResults.length;

  const { trackClick } = useEngagementTracker(lastQuery, hasSearched);

  const allVerses = [...exactResults, ...semanticResults].slice(0, 5).map(r => ({
    bookName: r.bookName || r.book?.name || '',
    chapter: r.chapter,
    verse: r.verse,
    text: r.text,
  }));

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-md">
            <SearchIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">بحث في الكتاب المقدس</h1>
            <p className="text-sm text-muted-foreground">ابحث بالكلمات أو المعنى — مُحسَّن بالذكاء الاصطناعي</p>
          </div>
        </div>

        <Card className="p-4 mb-6">
          <div className="flex gap-2">
            <Input
              type="search"
              placeholder="ابحث عن كلمة أو موضوع..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
              data-testid="input-search"
            />
            <Button
              onClick={() => handleSearch()}
              disabled={isLoading || !query.trim()}
              data-testid="button-search"
            >
              {isLoading ? (
                <span className="flex items-center gap-1">
                  <Sparkles className="w-4 h-4 animate-pulse ml-1" />
                  جاري البحث...
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <SearchIcon className="w-4 h-4 ml-1" />
                  بحث
                </span>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
            <Badge variant="secondary" className="gap-1 text-xs">
              <Target className="w-3 h-3" />
              نتائج مطابقة
            </Badge>
            <span className="text-muted-foreground text-xs">+</span>
            <Badge variant="secondary" className="gap-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              <Brain className="w-3 h-3" />
              نتائج ذكية بالذكاء الاصطناعي
            </Badge>
          </div>
        </Card>

        {!hasSearched ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">عمليات بحث مقترحة</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedSearches.map((search) => (
                <Button
                  key={search}
                  variant="outline"
                  size="sm"
                  onClick={() => { setQuery(search); handleSearch(search); }}
                  data-testid={`suggested-search-${search}`}
                >
                  {search}
                </Button>
              ))}
            </div>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={lastQuery}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-5">
                <span className="text-sm text-muted-foreground">
                  {isLoading
                    ? 'جاري البحث بالذكاء الاصطناعي...'
                    : `نتائج "${lastQuery}" (${totalCount} نتيجة)`}
                </span>
                <Button variant="ghost" size="sm" onClick={handleClear} data-testid="button-clear-search">
                  <X className="w-4 h-4 ml-1" />
                  مسح
                </Button>
              </div>

              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : totalCount === 0 ? (
                <Card className="p-8 text-center">
                  <SearchIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-display text-lg font-semibold text-foreground mb-2">لا توجد نتائج</h3>
                  <p className="text-sm text-muted-foreground">جرب كلمات بحث مختلفة</p>
                </Card>
              ) : (
                <div className="space-y-8">
                  {/* SEO Smart Block — intent-aware related links + FAQ schema injection */}
                  {!isLoading && totalCount > 0 && (
                    <SeoSmartBlock query={lastQuery} verses={allVerses} />
                  )}

                  {exactResults.length > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                      <SectionHeader
                        icon={<Target className="w-4 h-4 text-primary" />}
                        title="نتائج مطابقة"
                        count={exactResults.length}
                        color="border-primary/20"
                      />
                      <div className="space-y-3" onClick={trackClick}>
                        {exactResults.map((result, index) => (
                          <VerseCard key={result.id} result={result} index={index} type="exact" />
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {enhanced && semanticResults.length > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                      <SectionHeader
                        icon={<Brain className="w-4 h-4 text-purple-500" />}
                        title="نتائج ذكية"
                        count={semanticResults.length}
                        color="border-purple-500/20"
                      />
                      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-purple-400" />
                        آيات اقترحها الذكاء الاصطناعي بناءً على المعنى والمضمون
                      </p>
                      <div className="space-y-3" onClick={trackClick}>
                        {semanticResults.map((result, index) => (
                          <VerseCard key={result.id} result={result} index={index} type="semantic" />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </div>
  );
}
