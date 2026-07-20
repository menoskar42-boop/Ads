import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, ChevronRight, ChevronLeft, BookOpen, List, X, Search, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SEOHead } from '@/components/SEOHead';
import { kholagyLiturgies, type KholagyLiturgy, type KholagySection } from '@/lib/kholagy-data';
import { COPTIC_TEXT_MAP, COPTIC_ARABIC_MAP } from '@/lib/liturgy-map';
import { getLectionaryForDate, type ReadingRef } from '@/lib/coptic-lectionary';

// ── تعيين أقسام القراءات إلى نوع القراءة في الكتامارس
const SECTION_TO_READING: Record<string, keyof ReturnType<typeof getLectionaryForDate>['reading']> = {
  'basil-pauline':  'pauline',
  'basil-catholic': 'catholic',
  'basil-praxis':   'praxis',
  'basil-gospel':   'gospel',
  'greg-pauline':   'pauline',
  'greg-catholic':  'catholic',
  'greg-praxis':    'praxis',
  'greg-gospel':    'gospel',
  'cyril-pauline':  'pauline',
  'cyril-catholic': 'catholic',
  'cyril-praxis':   'praxis',
  'cyril-gospel':   'gospel',
};

// ── جلب نص القراءة من السيرفر
function useDailyReadingText(ref: ReadingRef | null) {
  const [verses, setVerses] = useState<{ chapter: number; verse: number; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ref) return;
    setLoading(true);
    setVerses([]);
    const params = new URLSearchParams({
      bookName: ref.book,
      fromCh: String(ref.fromCh),
      fromVs: String(ref.fromVs),
      toCh:   String(ref.toCh),
      toVs:   String(ref.toVs),
    });
    fetch(`/api/reading-text?${params}`)
      .then(r => r.json())
      .then(data => { setVerses(data.verses ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [ref?.book, ref?.fromCh, ref?.fromVs, ref?.toCh, ref?.toVs]);

  return { verses, loading };
}

// ── ألوان الأدوار
const roleColors: Record<string, string> = {
  'الكاهن':  'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
  'الشماس':  'bg-amber-100  text-amber-800  dark:bg-amber-900/40  dark:text-amber-200',
  'الشعب':   'bg-teal-100   text-teal-800   dark:bg-teal-900/40   dark:text-teal-200',
  'الكل':    'bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-200',
};

const roleBorder: Record<string, string> = {
  'الكاهن':  'border-r-4 border-purple-400',
  'الشماس':  'border-r-4 border-amber-400',
  'الشعب':   'border-r-4 border-teal-400',
  'الكل':    'border-r-4 border-blue-400',
};

// ── قائمة القداسات (/kholagy أو /orthodox/kholagy)
function LiturgyList({ basePath }: { basePath: string }) {
  const [, navigate] = useLocation();

  const cardColors: Record<string, { border: string; bg: string; text: string; badge: string }> = {
    purple: {
      border: 'border-purple-300 dark:border-purple-700',
      bg: 'bg-purple-50 dark:bg-purple-950/20',
      text: 'text-purple-700 dark:text-purple-300',
      badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    },
    amber: {
      border: 'border-amber-300 dark:border-amber-700',
      bg: 'bg-amber-50 dark:bg-amber-950/20',
      text: 'text-amber-700 dark:text-amber-300',
      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    },
    teal: {
      border: 'border-teal-300 dark:border-teal-700',
      bg: 'bg-teal-50 dark:bg-teal-950/20',
      text: 'text-teal-700 dark:text-teal-300',
      badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    },
  };

  return (
    <>
      <SEOHead dynamicSEO={{
        title: 'الخولاجي المقدس — القداسات القبطية الأرثوذكسية',
        description: 'اقرأ نصوص القداسات القبطية الأرثوذكسية بالعربية: قداس القديس باسيليوس وغريغوريوس وكيرلس كاملاً',
        keywords: ['خولاجي', 'قداس قبطي', 'باسيليوس', 'غريغوريوس', 'كيرلس', 'صلوات قبطية أرثوذكسية'],
      }} />
      <div className="max-w-2xl mx-auto px-4 py-8" dir="rtl">
        {basePath === '/orthodox/kholagy' && (
          <div className="mb-6 flex items-center gap-2 text-sm">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              onClick={() => navigate('/orthodox')}
            >
              <ChevronRight className="w-4 h-4" /> الأرثوذكسيات
            </button>
            <span className="text-muted-foreground">›</span>
            <span className="font-medium text-foreground">الخولاجي</span>
          </div>
        )}

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">الخولاجي المقدس</h1>
          <p className="text-muted-foreground">القداسات القبطية الأرثوذكسية الثلاثة</p>
        </div>

        <div className="space-y-4">
          {kholagyLiturgies.map((lit, i) => {
            const c = cardColors[lit.color] ?? cardColors['purple'];
            return (
              <motion.div
                key={lit.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card
                  className={`p-5 cursor-pointer border-2 hover:shadow-md transition-all ${c.border} ${c.bg}`}
                  onClick={() => navigate(`${basePath}/${lit.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-4xl">{lit.icon}</div>
                    <div className="flex-1">
                      <h2 className={`font-bold text-lg ${c.text}`}>{lit.name}</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {lit.sections.length} قسماً طقسياً
                      </p>
                    </div>
                    <ChevronLeft className={`w-5 h-5 ${c.text}`} />
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {basePath === '/orthodox/kholagy' && (
          <Card
            className="mt-8 p-4 border-2 border-dashed border-amber-400/60 bg-amber-50/60 dark:bg-amber-900/10 cursor-pointer hover:shadow-md transition-all group"
            onClick={() => window.open('/liturgy-control', '_blank')}
            data-testid="open-liturgy-presentation"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">📺</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-200">نظام عرض القداس على الشاشة</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed mt-0.5">
                  افتح لوحة التحكم للتبديل بين القداسات الثلاثة وعرض الشرائح على شاشة الكنيسة — مع دعم مردات الشماس
                </p>
              </div>
              <div className="flex flex-col gap-1 items-end text-xs text-amber-600 dark:text-amber-400 group-hover:gap-2 transition-all">
                <span className="font-mono bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded">/liturgy-control</span>
                <span className="font-mono bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded">/liturgy-display</span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

// ── قارئ القسم الواحد (/kholagy/basil/[sectionId] أو /orthodox/kholagy/basil/[sectionId])
function SectionReader({ liturgy, section, sectionIdx, basePath }: {
  liturgy: KholagyLiturgy;
  section: KholagySection;
  sectionIdx: number;
  basePath: string;
}) {
  const [, navigate] = useLocation();
  const [tocOpen, setTocOpen] = useState(false);
  const [textMode, setTextMode] = useState<'arabic' | 'copticScript' | 'copticArabic'>('arabic');

  const prev = liturgy.sections[sectionIdx - 1];
  const next = liturgy.sections[sectionIdx + 1];
  const borderClass = roleBorder[section.role] ?? 'border-r-4 border-slate-300';
  const badgeClass = roleColors[section.role] ?? 'bg-slate-100 text-slate-700';

  const copticScript = section.copticText || COPTIC_TEXT_MAP[section.id] || null;
  const copticArabic = section.copticArabicText || COPTIC_ARABIC_MAP[section.id] || null;
  const hasCoptic = !!(copticScript || copticArabic);

  // ── قراءة اليوم من الكتامارس
  const readingType = SECTION_TO_READING[section.id] ?? null;
  const todayLectionary = useMemo(() => getLectionaryForDate(new Date()), []);
  const todayRef: ReadingRef | null = readingType ? todayLectionary.reading[readingType] : null;
  const { verses: readingVerses, loading: readingLoading } = useDailyReadingText(todayRef);

  // الزر يعرض الوضع الحالي — يدور: عربي ← قبطي بحروف قبطية ← قبطي بحروف عربية ← عربي
  const modeIcon: Record<typeof textMode, string> = {
    arabic:       'عر',
    copticScript: 'ϯⲘ',
    copticArabic: 'قب',
  };
  const modeLabel: Record<typeof textMode, string> = {
    arabic:       'عربي',
    copticScript: 'قبطي بحروف قبطية',
    copticArabic: 'قبطي بحروف عربية',
  };

  function cycleMode() {
    setTextMode(prev =>
      prev === 'arabic'
        ? copticScript ? 'copticScript' : copticArabic ? 'copticArabic' : 'arabic'
        : prev === 'copticScript'
        ? copticArabic ? 'copticArabic' : 'arabic'
        : 'arabic'
    );
  }

  return (
    <>
      <SEOHead dynamicSEO={{
        title: `${section.title} — ${liturgy.name} — الخولاجي المقدس`,
        description: `${section.title} من ${liturgy.name} — نص طقسي قبطي أرثوذكسي كامل بالعربية`,
        keywords: ['خولاجي', 'قداس قبطي', liturgy.name, section.title],
      }} />

      <div className="max-w-2xl mx-auto pb-24" dir="rtl">
        {/* شريط التنقل الثابت — يحتوي الفهرس داخله */}
        <div className="sticky top-0 z-30 bg-background border-b shadow-sm">
          {/* breadcrumb + فهرس */}
          <div className="flex items-center gap-2 px-4 py-2.5 text-sm">
            <button
              className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 flex-shrink-0"
              onClick={() => navigate(basePath)}
            >
              <ChevronRight className="w-3.5 h-3.5" /> الخولاجي
            </button>
            <span className="text-muted-foreground">›</span>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors truncate flex-1 text-right"
              onClick={() => navigate(`${basePath}/${liturgy.id}`)}
            >
              {liturgy.name.split(' — ')[0]}
            </button>
            {/* زر الفهرس */}
            <button
              onClick={() => setTocOpen(v => !v)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-medium text-xs transition-colors"
            >
              {tocOpen ? <X className="w-3.5 h-3.5" /> : <List className="w-3.5 h-3.5" />}
              فهرس
            </button>
          </div>

          {/* الشريط السفلي — اسم القسم الحالي */}
          <div className="flex items-center justify-between px-4 pb-2.5 gap-2">
            <span className="text-xs font-medium text-foreground truncate flex-1">{section.title}</span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {sectionIdx + 1} / {liturgy.sections.length}
            </span>
          </div>

          {/* قائمة الفهرس — داخل الحاوية الثابتة تماماً */}
          <AnimatePresence>
            {tocOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden border-t"
              >
                <div className="max-h-72 overflow-y-auto bg-background shadow-inner">
                  {liturgy.sections.map((sec, i) => {
                    const bc = roleColors[sec.role] ?? 'bg-slate-100 text-slate-700';
                    const isActive = i === sectionIdx;
                    return (
                      <button
                        key={sec.id}
                        onClick={() => {
                          navigate(`${basePath}/${liturgy.id}/${sec.id}`);
                          setTocOpen(false);
                          window.scrollTo(0, 0);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-right transition-colors border-b border-border/40 last:border-0 ${
                          isActive ? 'bg-primary/10' : 'hover:bg-muted/60'
                        }`}
                      >
                        <span className="text-xs text-muted-foreground w-5 flex-shrink-0">{i + 1}</span>
                        <span className={`flex-1 text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>
                          {sec.title}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${bc}`}>{sec.role}</span>
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* عنوان القسم */}
        <div className={`mx-4 mt-5 mb-4 p-4 rounded-xl ${borderClass} bg-muted/30`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{section.title}</h1>
            <div className="flex items-center gap-2">
              {hasCoptic && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cycleMode}
                  className="gap-1 text-xs h-7 px-2"
                  title={modeLabel[textMode]}
                >
                  <Languages className="w-3 h-3" />
                  <span className="font-mono font-bold">{modeIcon[textMode]}</span>
                  <span>{modeLabel[textMode]}</span>
                </Button>
              )}
              <Badge className={`text-xs border-0 ${badgeClass}`}>{section.role}</Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {sectionIdx + 1} / {liturgy.sections.length}
          </p>
        </div>

        {/* ── قراءة اليوم (تظهر في أقسام القراءات فقط) */}
        {todayRef && (
          <div className="px-4 mb-4">
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4" dir="rtl">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="text-sm font-bold text-amber-800 dark:text-amber-300">
                  قراءة اليوم — {todayLectionary.copticDate}
                </span>
                <span className="text-xs text-amber-600 dark:text-amber-400 mr-auto">{todayRef.label}</span>
              </div>
              {readingLoading ? (
                <p className="text-sm text-amber-700 dark:text-amber-400 animate-pulse">جاري التحميل…</p>
              ) : readingVerses.length > 0 ? (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {readingVerses.map(v => (
                    <p key={`${v.chapter}-${v.verse}`} className="text-sm leading-7 text-foreground text-right">
                      <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">{v.verse}</span>
                      {v.text}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-amber-700 dark:text-amber-400">{todayRef.label}</p>
              )}
            </div>
          </div>
        )}

        {/* النص الطقسي */}
        <div className="px-4">
          <div className={`rounded-xl p-5 bg-muted/20 border ${borderClass} space-y-4`}>
            {/* عربي */}
            {(textMode === 'arabic') && (
              <p className="text-base leading-9 whitespace-pre-line text-foreground text-right font-medium">
                {section.text}
              </p>
            )}
            {/* قبطي بحروف قبطية */}
            {(textMode === 'copticScript') && copticScript && (
              <p
                className="text-sm leading-8 whitespace-pre-line text-foreground font-medium"
                style={{ fontFamily: 'serif', direction: 'ltr', textAlign: 'left' }}
              >
                {copticScript}
              </p>
            )}
            {/* قبطي بحروف عربية */}
            {(textMode === 'copticArabic') && copticArabic && (
              <p className="text-base leading-9 whitespace-pre-line text-foreground text-right font-medium">
                {copticArabic}
              </p>
            )}
          </div>
        </div>

        {/* تنقل السابق / التالي */}
        <div className="flex items-center justify-between px-4 pt-8">
          <Button
            variant="outline"
            size="sm"
            disabled={!prev}
            onClick={() => {
              if (prev) {
                navigate(`${basePath}/${liturgy.id}/${prev.id}`);
                window.scrollTo(0, 0);
              }
            }}
            className="gap-1"
          >
            <ChevronRight className="w-4 h-4" /> {prev?.title?.substring(0, 12) ?? 'السابق'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!next}
            onClick={() => {
              if (next) {
                navigate(`${basePath}/${liturgy.id}/${next.id}`);
                window.scrollTo(0, 0);
              }
            }}
            className="gap-1"
          >
            {next?.title?.substring(0, 12) ?? 'التالي'} <ChevronLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* شريط البحث العائم */}
      <KholagySearch liturgy={liturgy} basePath={basePath} />
    </>
  );
}

// ── شريط البحث الإبداعي
function KholagySearch({ liturgy, basePath }: { liturgy: KholagyLiturgy; basePath: string }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];
    const qLow = q.toLowerCase();
    return liturgy.sections
      .filter(sec =>
        sec.title.toLowerCase().includes(qLow) ||
        sec.text.toLowerCase().includes(qLow) ||
        (sec.copticArabicText?.toLowerCase().includes(qLow) ?? false)
      )
      .slice(0, 10)
      .map(sec => {
        const textLow = sec.text.toLowerCase();
        const idx = textLow.indexOf(qLow);
        const inTitle = sec.title.toLowerCase().includes(qLow);
        let snippet = '';
        if (!inTitle && idx !== -1) {
          const start = Math.max(0, idx - 35);
          const end = Math.min(sec.text.length, idx + qLow.length + 65);
          snippet = (start > 0 ? '...' : '') +
            sec.text.slice(start, end) +
            (end < sec.text.length ? '...' : '');
        } else if (!inTitle && idx === -1 && sec.copticArabicText) {
          // التطابق في النص القبطي المكتوب بالحروف العربية
          const copticLow = sec.copticArabicText.toLowerCase();
          const cIdx = copticLow.indexOf(qLow);
          if (cIdx !== -1) {
            const start = Math.max(0, cIdx - 35);
            const end = Math.min(sec.copticArabicText.length, cIdx + qLow.length + 65);
            snippet = (start > 0 ? '...' : '') +
              sec.copticArabicText.slice(start, end) +
              (end < sec.copticArabicText.length ? '...' : '');
          }
        }
        return { sec, snippet, inTitle };
      });
  }, [query, liturgy]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  // إغلاق عند Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const highlightMatch = (text: string, q: string) => {
    if (!q.trim()) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 dark:bg-yellow-700/60 text-foreground rounded px-0.5">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <>
      {/* زر البحث العائم */}
      <motion.button
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.08 }}
        onClick={() => setOpen(true)}
        className="fixed bottom-24 left-4 z-40 w-13 h-13 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center"
        style={{ width: 52, height: 52 }}
      >
        <Search className="w-5 h-5" />
      </motion.button>

      {/* Overlay البحث */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-50 bg-background/97 backdrop-blur-md overflow-hidden"
            dir="rtl"
          >
            <div className="max-w-2xl mx-auto h-full flex flex-col">
              {/* رأس الـ overlay */}
              <div className="px-4 pt-4 pb-3 border-b">
                <div className="flex items-center gap-3 bg-muted/60 rounded-2xl px-4 py-3 shadow-inner">
                  <Search className="w-5 h-5 text-primary flex-shrink-0" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={`ابحث في ${liturgy.sections.length} قسماً من ${liturgy.name.split(' — ')[0]}...`}
                    className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-right outline-none text-base"
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => { setOpen(false); setQuery(''); }}
                    className="text-muted-foreground hover:text-foreground text-sm font-medium px-2 flex-shrink-0"
                  >
                    إلغاء
                  </button>
                </div>
              </div>

              {/* النتائج */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
                {query.length < 2 && (
                  <div className="text-center py-16">
                    <Search className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-muted-foreground text-sm">ابحث في نصوص وعناوين أقسام القداس</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">{liturgy.sections.length} قسماً متاحاً</p>
                  </div>
                )}

                {query.length >= 2 && results.length === 0 && (
                  <div className="text-center py-16">
                    <p className="text-muted-foreground text-sm">لا توجد نتائج لـ "{query}"</p>
                    <p className="text-muted-foreground/60 text-xs mt-1">جرّب كلمة مختلفة</p>
                  </div>
                )}

                {query.length >= 2 && results.length > 0 && (
                  <p className="text-xs text-muted-foreground pb-1">
                    {results.length} نتيجة
                  </p>
                )}

                {results.map(({ sec, snippet, inTitle }, ri) => {
                  const badgeClass = roleColors[sec.role] ?? 'bg-slate-100 text-slate-700';
                  const borderClass = roleBorder[sec.role] ?? 'border-r-4 border-slate-300';
                  return (
                    <motion.button
                      key={sec.id}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: ri * 0.04 }}
                      onClick={() => {
                        navigate(`${basePath}/${liturgy.id}/${sec.id}`);
                        setOpen(false);
                        setQuery('');
                        window.scrollTo(0, 0);
                      }}
                      className={`w-full text-right p-4 rounded-xl bg-muted/40 hover:bg-muted/80 ${borderClass} transition-colors`}
                    >
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-foreground text-sm">
                          {inTitle
                            ? highlightMatch(sec.title, query.trim())
                            : sec.title
                          }
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${badgeClass}`}>{sec.role}</span>
                      </div>
                      {snippet && (
                        <p className="text-xs text-muted-foreground leading-6 text-right">
                          {highlightMatch(snippet, query.trim())}
                        </p>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ── قائمة أقسام القداس (/kholagy/:liturgyId أو /orthodox/kholagy/:liturgyId)
function LiturgySections({ liturgy, basePath }: { liturgy: KholagyLiturgy; basePath: string }) {
  const [, navigate] = useLocation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <>
      <SEOHead dynamicSEO={{
        title: `${liturgy.name} — الخولاجي المقدس`,
        description: `نص ${liturgy.name} الكامل بالعربية — ${liturgy.sections.length} قسماً طقسياً`,
        keywords: ['خولاجي', 'قداس قبطي', liturgy.name],
      }} />

      <div className="max-w-2xl mx-auto pb-16" dir="rtl">
        {/* رأس الصفحة */}
        <div className="sticky top-0 z-10 bg-background border-b shadow-sm px-4 py-3 flex items-center gap-3">
          <button
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm"
            onClick={() => navigate(basePath)}
          >
            <ChevronRight className="w-4 h-4" /> الخولاجي
          </button>
          <span className="text-muted-foreground">›</span>
          <h1 className="font-bold text-sm text-foreground truncate">{liturgy.name}</h1>
        </div>

        {/* قائمة الأقسام */}
        <div className="px-4 pt-4 space-y-2">
          {liturgy.sections.map((sec, idx) => {
            const isOpen = expandedId === sec.id;
            const badgeClass = roleColors[sec.role] ?? 'bg-slate-100 text-slate-700';
            const borderClass = roleBorder[sec.role] ?? 'border-r-4 border-slate-300';

            return (
              <motion.div
                key={sec.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.02 }}
              >
                <Card className={`overflow-hidden border-0 shadow-sm ${borderClass}`}>
                  {/* رأس القسم */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-right hover:bg-muted/40 transition-colors"
                    onClick={() => setExpandedId(isOpen ? null : sec.id)}
                  >
                    <span className="text-xs text-muted-foreground w-6 flex-shrink-0">{idx + 1}</span>
                    <span className="flex-1 font-medium text-sm text-foreground">{sec.title}</span>
                    <Badge className={`text-xs border-0 flex-shrink-0 ${badgeClass}`}>{sec.role}</Badge>
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      : <ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    }
                  </button>

                  {/* معاينة + زر القراءة الكاملة */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-1 border-t border-border space-y-3">
                          {/* معاينة أول 200 حرف */}
                          <p className="text-sm leading-7 text-muted-foreground line-clamp-3 text-right">
                            {sec.text.substring(0, 200)}...
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full gap-1 text-xs"
                            onClick={() => navigate(`${basePath}/${liturgy.id}/${sec.id}`)}
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            قراءة القسم كاملاً
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* شريط البحث العائم */}
        <KholagySearch liturgy={liturgy} basePath={basePath} />
      </div>
    </>
  );
}

// ── الصفحة الرئيسية
export default function KholagyPro() {
  const { liturgyId, chapterId } = useParams<{ liturgyId?: string; chapterId?: string }>();
  const [location] = useLocation();
  const basePath = location.startsWith('/orthodox/kholagy') ? '/orthodox/kholagy' : '/kholagy';

  if (!liturgyId) return <LiturgyList basePath={basePath} />;

  const liturgy = kholagyLiturgies.find(l => l.id === liturgyId);
  if (!liturgy) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 py-16" dir="rtl">
        <BookOpen className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">هذا القداس غير موجود</p>
        <Button variant="outline" onClick={() => window.location.href = basePath}>
          العودة للخولاجي
        </Button>
      </div>
    );
  }

  if (!chapterId) return <LiturgySections liturgy={liturgy} basePath={basePath} />;

  const sectionIdx = liturgy.sections.findIndex(s => s.id === chapterId);
  if (sectionIdx === -1) return <LiturgySections liturgy={liturgy} basePath={basePath} />;

  return (
    <SectionReader
      liturgy={liturgy}
      section={liturgy.sections[sectionIdx]}
      sectionIdx={sectionIdx}
      basePath={basePath}
    />
  );
}
