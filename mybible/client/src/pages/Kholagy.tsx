import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ChevronRight, ChevronLeft, BookOpen, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SEOHead } from '@/components/SEOHead';
import { liturgies, type Liturgy, type LiturgyChapter } from '@/lib/liturgy-content';

// ── ألوان الأدوار ─────────────────────────────────────────────────────────────
const roleColors: Record<string, string> = {
  'الكاهن':  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'الشماس':  'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-300',
  'الشعب':   'bg-teal-100   text-teal-700   dark:bg-teal-900/40   dark:text-teal-300',
  'الكل':    'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300',
  'الكاهن والشعب': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'الكاهن والشعب معاً': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'القارئ':  'bg-slate-100  text-slate-700  dark:bg-slate-800      dark:text-slate-300',
};

// ── صفحة قائمة القداسات (/kholagy) ───────────────────────────────────────────
function LiturgyList() {
  const [, navigate] = useLocation();
  return (
    <>
      <SEOHead dynamicSEO={{
        title: 'الخولاجي المقدس — القداسات القبطية الأرثوذكسية',
        description: 'اقرأ نصوص القداسات القبطية الأرثوذكسية الثلاثة: قداس باسيليوس وغريغوريوس وكيرلس بالعربية والقبطية',
        keywords: ['خولاجي', 'قداس قبطي', 'باسيليوس', 'غريغوريوس', 'كيرلس', 'صلوات قبطية'],
      }} />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6" dir="rtl">
        {/* رأس الصفحة */}
        <div className="text-center space-y-2 pb-4">
          <h1 className="text-2xl font-bold text-foreground">الخولاجي المقدس</h1>
          <p className="text-muted-foreground text-sm">
            القداسات القبطية الأرثوذكسية الثلاثة
          </p>
        </div>

        {/* بطاقات القداسات */}
        {liturgies.map((lit) => (
          <motion.div
            key={lit.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Card
              className={`p-5 cursor-pointer border-2 hover:shadow-md transition-all ${lit.colorBorder} ${lit.colorBg}`}
              onClick={() => navigate(`/kholagy/${lit.id}`)}
            >
              <div className="flex items-start gap-4">
                <div className="text-3xl mt-1">{lit.icon}</div>
                <div className="flex-1 space-y-1">
                  <h2 className={`font-bold text-lg ${lit.colorText}`}>{lit.name}</h2>
                  <Badge variant="outline" className={`text-xs ${lit.colorBadge} border-0`}>
                    {lit.occasion}
                  </Badge>
                  <p className="text-sm text-muted-foreground leading-relaxed pt-1">
                    {lit.description}
                  </p>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      {lit.chapters.length} قسماً
                    </span>
                    <Button size="sm" variant="ghost" className={`gap-1 text-xs ${lit.colorText}`}>
                      اقرأ <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </>
  );
}

// ── صفحة قداس بعينه (/kholagy/:liturgyId أو /kholagy/:liturgyId/:chapterId) ──
function LiturgyReader({ liturgy, initialChapterId }: { liturgy: Liturgy; initialChapterId?: string }) {
  const [, navigate] = useLocation();
  const chapNavRef = useRef<HTMLDivElement>(null);

  // تحديد الفصل الأولي
  const initialIdx = initialChapterId
    ? liturgy.chapters.findIndex(c => c.id === initialChapterId)
    : 0;
  const [chapterIdx, setChapterIdx] = useState(Math.max(0, initialIdx));
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());
  const [textMode, setTextMode] = useState<'arabic' | 'coptic' | 'both'>('both');

  const chapter: LiturgyChapter = liturgy.chapters[chapterIdx];

  // تمرير تبويب الفصل الحالي للظهور
  useEffect(() => {
    const el = chapNavRef.current?.querySelector(`[data-idx="${chapterIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [chapterIdx]);

  // تحديث URL عند تغيير الفصل
  useEffect(() => {
    navigate(`/kholagy/${liturgy.id}/${chapter.id}`, { replace: true });
  }, [chapterIdx]);

  function togglePart(id: string) {
    setExpandedParts(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedParts(new Set(chapter.parts.map(p => p.id)));
  }

  function collapseAll() {
    setExpandedParts(new Set());
  }

  return (
    <>
      <SEOHead dynamicSEO={{
        title: `${chapter.title} — ${liturgy.name} — الخولاجي المقدس`,
        description: chapter.description ?? `قراءة ${chapter.title} من ${liturgy.name} بالعربية والقبطية`,
        keywords: ['خولاجي', liturgy.name, chapter.title, 'قداس قبطي', 'صلوات قبطية'],
      }} />

      <div className="max-w-2xl mx-auto pb-20" dir="rtl">

        {/* رأس الصفحة */}
        <div className={`sticky top-0 z-20 ${liturgy.colorBg} border-b ${liturgy.colorBorder} shadow-sm`}>
          {/* شريط التنقل العلوي */}
          <div className="flex items-center gap-2 px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => navigate('/kholagy')}
            >
              <ChevronLeft className="w-4 h-4" /> الخولاجي
            </Button>
            <span className="text-muted-foreground text-xs">›</span>
            <span className={`text-sm font-medium ${liturgy.colorText}`}>{liturgy.name}</span>
          </div>

          {/* تبويبات الفصول — scrollable */}
          <div
            ref={chapNavRef}
            className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-hide"
          >
            {liturgy.chapters.map((ch, i) => (
              <button
                key={ch.id}
                data-idx={i}
                onClick={() => { setChapterIdx(i); setExpandedParts(new Set()); }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  i === chapterIdx
                    ? `${liturgy.colorBadge} ring-1 ring-current`
                    : 'text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted'
                }`}
              >
                {ch.title}
              </button>
            ))}
          </div>
        </div>

        {/* عنوان الفصل */}
        <div className="px-4 pt-5 pb-3 space-y-2">
          <h1 className={`text-xl font-bold ${liturgy.colorText}`}>{chapter.title}</h1>
          {chapter.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">{chapter.description}</p>
          )}

          {/* أدوات التحكم */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={expandAll}>
              فتح الكل <ChevronDown className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={collapseAll}>
              إغلاق الكل <ChevronUp className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1 font-medium"
              onClick={() => setTextMode(m => m === 'arabic' ? 'coptic' : m === 'coptic' ? 'both' : 'arabic')}
            >
              {textMode === 'arabic' && '🇪🇬 عربي فقط'}
              {textMode === 'coptic' && '🔤 قبطي فقط'}
              {textMode === 'both'   && '🔤🇪🇬 عربي + قبطي'}
            </Button>
          </div>
        </div>

        {/* أجزاء الفصل */}
        <div className="px-4 space-y-2">
          {chapter.parts.map((part, idx) => {
            const isOpen = expandedParts.has(part.id);
            const roleColor = part.role ? (roleColors[part.role] ?? 'bg-slate-100 text-slate-600') : '';
            return (
              <motion.div
                key={part.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.03 }}
              >
                <Card className={`overflow-hidden border ${liturgy.colorBorder}`}>
                  {/* رأس الجزء — قابل للضغط */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-muted/30 transition-colors"
                    onClick={() => togglePart(part.id)}
                  >
                    {part.role && (
                      <Badge className={`flex-shrink-0 text-xs border-0 ${roleColor}`}>
                        {part.role}
                      </Badge>
                    )}
                    <span className="flex-1 font-medium text-sm text-foreground text-right">
                      {part.title}
                    </span>
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    }
                  </button>

                  {/* نص الجزء */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className={`px-4 pb-4 pt-1 border-t ${liturgy.colorBorder} space-y-3`}>
                          {/* النص العربي */}
                          {(textMode === 'arabic' || textMode === 'both') && (
                            <p className="text-sm leading-8 whitespace-pre-line text-foreground text-right">
                              {part.text}
                            </p>
                          )}
                          {/* النص القبطي */}
                          {(textMode === 'coptic' || textMode === 'both') && part.copticText && (
                            <div className={`${textMode === 'both' ? `mt-2 pt-2 border-t ${liturgy.colorBorder}` : ''}`}>
                              <p
                                className="text-sm leading-8 whitespace-pre-line text-muted-foreground"
                                style={{ fontFamily: 'serif', direction: 'ltr', textAlign: 'left' }}
                              >
                                {part.copticText}
                              </p>
                            </div>
                          )}
                          {/* إذا لا يوجد نص قبطي وطُلب القبطي فقط */}
                          {textMode === 'coptic' && !part.copticText && (
                            <p className="text-xs text-muted-foreground text-center italic py-1">
                              لا يوجد نص قبطي لهذا الجزء
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* تنقل السابق / التالي */}
        <div className="flex items-center justify-between px-4 pt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={chapterIdx === 0}
            onClick={() => { setChapterIdx(i => i - 1); setExpandedParts(new Set()); window.scrollTo(0, 0); }}
            className="gap-1"
          >
            <ChevronRight className="w-4 h-4" /> السابق
          </Button>
          <span className="text-xs text-muted-foreground">
            {chapterIdx + 1} / {liturgy.chapters.length}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={chapterIdx === liturgy.chapters.length - 1}
            onClick={() => { setChapterIdx(i => i + 1); setExpandedParts(new Set()); window.scrollTo(0, 0); }}
            className="gap-1"
          >
            التالي <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

// ── الصفحة الرئيسية — تختار LiturgyList أو LiturgyReader ─────────────────────
export default function Kholagy() {
  const { liturgyId, chapterId } = useParams<{ liturgyId?: string; chapterId?: string }>();

  if (!liturgyId) return <LiturgyList />;

  const liturgy = liturgies.find(l => l.id === liturgyId);
  if (!liturgy) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4" dir="rtl">
        <BookOpen className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">هذا القداس غير موجود</p>
        <Button variant="outline" onClick={() => window.location.href = '/kholagy'}>
          العودة للخولاجي
        </Button>
      </div>
    );
  }

  return <LiturgyReader liturgy={liturgy} initialChapterId={chapterId} />;
}
