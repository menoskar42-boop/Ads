import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getSectionsForLiturgy,
  getSplitSlidesForSection,
  getPreludeSlidesForSection,
  getPostludeSlidesForSection,
  getReadingType,
  findEquivalentSection,
  getLiturgyLabel,
  getRoleLabel,
  getRoleColor,
  deaconResponses,
  defaultSession,
  COPTIC_ARABIC_MAP,
  READINGS_SECTION_KEYS,
  type LiturgyType,
  type LiturgySession,
  type LiturgySlide,
  type DeaconResponse,
  type DailyReadingSlides,
} from '@/lib/liturgy-map';
import {
  detectOccasion,
  detectSeasonalLitany,
  getQismaLabel,
  OCCASION_LABELS,
  OCCASION_ORDER,
  SEASONAL_LITANY_LABELS,
  type OccasionTag,
  type SeasonalLitanyType,
} from '@/lib/liturgy-occasion';
import {
  getTodaySynaxarium,
  entryTypeIcon,
  type SynaxariumEntry,
} from '@/lib/synaxarium-content';
import {
  getHymnsForOccasion,
  type Hymn,
} from '@/lib/hymns-content';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  ChevronLeft,
  ChevronRight,
  Monitor,
  RefreshCw,
  X,
  BookOpen,
  Copy,
  Check,
  Search,
} from 'lucide-react';

const LITURGY_TYPES: LiturgyType[] = ['basil', 'gregory', 'cyril'];
const LITURGY_COLORS: Record<LiturgyType, string> = {
  basil: 'bg-amber-600 hover:bg-amber-700',
  gregory: 'bg-purple-600 hover:bg-purple-700',
  cyril: 'bg-blue-600 hover:bg-blue-700',
};
const LITURGY_ACTIVE: Record<LiturgyType, string> = {
  basil: 'ring-2 ring-amber-400',
  gregory: 'ring-2 ring-purple-400',
  cyril: 'ring-2 ring-blue-400',
};

export default function LiturgyControl() {
  const params = useParams<{ slot?: string }>();
  const [, navigate] = useLocation();
  const [session, setSession] = useState<LiturgySession>(defaultSession as LiturgySession);
  const [slot, setSlot] = useState<string | null>(params?.slot ?? null);
  const [syncing, setSyncing] = useState(false);
  const [showDeaconPanel, setShowDeaconPanel] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  // copticMode مستقل عن session لتجنب stale closure عند pushSession
  const [copticMode, setCopticMode] = useState<'script' | 'arabic'>('script');
  const copticModeRef = useRef<'script' | 'arabic'>('script');

  const displayPath = slot ? `/liturgy-display/${slot}` : '/liturgy-display';

  function copyDisplayLink() {
    navigator.clipboard.writeText(window.location.origin + displayPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── بناء الشرائح: للأقسام القرائية = مقدمة + قراءة اليوم + خاتمة
  // مزمور القداس يأتي من إقحامات المناسبة (occasionInserts position:'before') لا من الإكتاتيروس
  const _readingType = READINGS_SECTION_KEYS.has(session.sectionKey) ? getReadingType(session.sectionKey) : null;
  const _activeReadings = session.readingsOverride as Record<string, { title: string; slides: string[] }> | null;
  const currentSlides: LiturgySlide[] = (() => {
    if (_readingType && _activeReadings) {
      const prelude = getPreludeSlidesForSection(session.liturgyType, session.sectionKey, session.occasion, session.seasonalLitany);
      const postlude = getPostludeSlidesForSection(session.sectionKey, session.occasion);
      const readingData = _activeReadings[_readingType];
      const readingSlides: LiturgySlide[] = readingData?.slides?.length
        ? readingData.slides.map((text, i) => ({ id: `reading-${_readingType}-${i}`, title: readingData.title, role: 'deacon' as const, text }))
        : [];
      if (readingSlides.length) {
        return [...prelude, ...readingSlides, ...postlude];
      }
    }
    return getSplitSlidesForSection(session.liturgyType, session.sectionKey, session.occasion, session.seasonalLitany);
  })();
  const currentSlide = currentSlides[session.slideIndex];
  // section key هو المعرّف الأصلي قبل التقسيم (basil-opening لا basil-opening-p4)
  const currentSectionKey = session.sectionKey;
  const currentCopticArabic = COPTIC_ARABIC_MAP[currentSectionKey] ?? null;

  const pushSession = useCallback(async (patch: Partial<LiturgySession>) => {
    // دائماً نستخدم copticModeRef لضمان القيمة الأحدث وتجنب stale closure
    const next = { ...session, copticMode: copticModeRef.current, ...patch };
    setSession(next);
    setSyncing(true);
    try {
      await fetch('/api/liturgy-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      setLastSync(new Date());
    } catch { /* silent */ }
    finally { setSyncing(false); }
  }, [session]);

  const [copticDate, setCopticDate] = useState<string | null>(null);
  // هل القراءات المعروضة هي قراءات اليوم نفسه؟ لو لأ، لازم الشاشة تقول كده —
  // القطمارس المخزّن مش مكتمل لكل أيام السنة، وعرض قراءة يوم تاني كأنها قراءة
  // النهاردة في قدّاس أسوأ بكتير من إننا نقول إنها تقريبية ومحتاجة مراجعة.
  const [readingsExact, setReadingsExact] = useState(true);
  const [readingsSourceDay, setReadingsSourceDay] = useState<string | null>(null);

  // جلب الجلسة والقراءات اليومية معاً عند الفتح
  useEffect(() => {
    Promise.all([
      fetch('/api/liturgy-session').then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
      fetch('/api/daily-readings').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([data, readings]) => {
      if (!params?.slot && data.slot) {
        navigate(`/liturgy-control/${data.slot}`, { replace: true });
      }
      setSlot(data.slot ?? null);
      // مناسبة اليوم: تُكتشف دائماً من التاريخ إلا إذا اختار المشغّل مناسبة بعينها
      // 'ordinary' الافتراضية لا تُعدّ اختياراً مقصوداً فتُكتشف من جديد
      const storedOccasion = data.occasion as OccasionTag | null;
      const occasion: OccasionTag = (storedOccasion && storedOccasion !== 'ordinary')
        ? storedOccasion
        : detectOccasion(new Date());
      const seasonalLitany: SeasonalLitanyType = (data.seasonalLitany as SeasonalLitanyType) ?? detectSeasonalLitany(new Date());
      const slides = getSplitSlidesForSection(data.liturgyType, data.sectionKey, occasion, seasonalLitany);
      const safeIdx = Math.min(Math.max(0, data.slideIndex), Math.max(0, slides.length - 1));
      const initialMode: 'script' | 'arabic' = data.copticMode === 'arabic' ? 'arabic' : 'script';
      copticModeRef.current = initialMode;
      setCopticMode(initialMode);
      let readingsOverride = data.readingsOverride ?? null;
      if (readings) {
        const { copticDate: cd, exact, sourceDay, ...override } = readings as
          { copticDate: string; exact?: boolean; sourceDay?: string } & DailyReadingSlides;
        readingsOverride = override as DailyReadingSlides;
        setCopticDate(cd);
        setReadingsExact(exact !== false);
        setReadingsSourceDay(sourceDay ?? null);
      }
      // السنكسار الحقيقي — يُملأ من بيانات الموقع (لا يحتاج خادماً)
      const synaxToday = getTodaySynaxarium();
      if (synaxToday) {
        const { month, day } = synaxToday;
        const synaxSlides = day.entries.map((e: SynaxariumEntry) => {
          const icon = entryTypeIcon[e.type] ?? '✝️';
          return `${icon} ${e.name}\n\n${e.description}`;
        });
        const synaxTitle = `سنكسار ${month.arabicName} — يوم ${day.day}`;
        readingsOverride = {
          ...(readingsOverride ?? {
            pauline:  { title: '', slides: [] },
            catholic: { title: '', slides: [] },
            praxis:   { title: '', slides: [] },
            psalm:    { title: '', slides: [] },
            gospel:   { title: '', slides: [] },
          }),
          synaxar: { title: synaxTitle, slides: synaxSlides },
        } as DailyReadingSlides;
      }
      const merged = { ...data, slideIndex: safeIdx, copticMode: initialMode, readingsOverride, occasion, seasonalLitany };
      setSession(merged);
      // مزامنة الجلسة مع القراءات الجديدة
      fetch('/api/liturgy-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      }).catch(() => {});
    }).catch(err => console.error('[LiturgyControl] failed to load session:', err));
  }, []);

  function switchLiturgy(type: LiturgyType) {
    const equivalentSection = findEquivalentSection(session.liturgyType, session.sectionKey, type);
    const fallback = getSectionsForLiturgy(type)[0]?.sectionKey ?? 'basil-opening';
    pushSession({ liturgyType: type, sectionKey: equivalentSection || fallback, slideIndex: 0, deaconOverride: null });
  }

  function switchSection(key: string) {
    pushSession({ sectionKey: key, slideIndex: 0, deaconOverride: null });
  }

  function switchOccasion(occasion: OccasionTag) {
    // تغيير المناسبة قد يغيّر عدد شرائح القسم (إقحامات العيد) ← نعيد المؤشر للبداية
    pushSession({ occasion, slideIndex: 0, deaconOverride: null });
  }

  // مردات الشماس الظاهرة: العامة دائماً + ما يطابق مناسبة اليوم
  const visibleDeaconResponses = deaconResponses.filter(
    r => !r.occasions || r.occasions.includes(session.occasion),
  );

  // ألحان اليوم المرتبطة بالمناسبة
  const occasionHymns: Hymn[] = getHymnsForOccasion(session.occasion);
  const [showHymnsPanel, setShowHymnsPanel] = useState(false);
  const [expandedHymnId, setExpandedHymnId] = useState<string | null>(null);

  const allSections = getSectionsForLiturgy(session.liturgyType);
  const currentSectionIdx = allSections.findIndex(s => s.sectionKey === session.sectionKey);
  const nextSection = allSections.slice(currentSectionIdx + 1).find(s => {
    const slides = getSplitSlidesForSection(session.liturgyType, s.sectionKey, session.occasion, session.seasonalLitany);
    return slides.length > 0;
  }) ?? null;
  const prevSection = allSections.slice(0, currentSectionIdx).reverse().find(s => {
    const slides = getSplitSlidesForSection(session.liturgyType, s.sectionKey, session.occasion, session.seasonalLitany);
    return slides.length > 0;
  }) ?? null;
  const isLastSlide = !session.deaconOverride && session.slideIndex >= currentSlides.length - 1;
  const isFirstSlide = !session.deaconOverride && session.slideIndex === 0;

  function goNext() {
    if (session.deaconOverride) {
      pushSession({ deaconOverride: null });
      return;
    }
    if (session.slideIndex < currentSlides.length - 1) {
      pushSession({ slideIndex: session.slideIndex + 1, deaconOverride: null });
    } else if (nextSection) {
      pushSession({ sectionKey: nextSection.sectionKey, slideIndex: 0, deaconOverride: null });
    }
  }

  function goPrev() {
    if (session.deaconOverride) {
      pushSession({ deaconOverride: null });
      return;
    }
    if (session.slideIndex > 0) {
      pushSession({ slideIndex: session.slideIndex - 1, deaconOverride: null });
    } else if (prevSection) {
      // لأقسام القراءات: نحسب عدد الشرائح الفعلي (مقدمة + قراءة + خاتمة) لا عدد kholagy
      const prevReadingType = READINGS_SECTION_KEYS.has(prevSection.sectionKey) ? getReadingType(prevSection.sectionKey) : null;
      const prevReadingData = prevReadingType && _activeReadings ? (_activeReadings as Record<string, { title: string; slides: string[] }>)[prevReadingType] : null;
      let prevLastIdx: number;
      if (prevReadingData?.slides?.length) {
        const prevPrelude = getPreludeSlidesForSection(session.liturgyType, prevSection.sectionKey, session.occasion, session.seasonalLitany);
        const prevPostlude = getPostludeSlidesForSection(prevSection.sectionKey, session.occasion);
        prevLastIdx = prevPrelude.length + prevReadingData.slides.length + prevPostlude.length - 1;
      } else {
        const prevSlides = getSplitSlidesForSection(session.liturgyType, prevSection.sectionKey, session.occasion, session.seasonalLitany);
        prevLastIdx = Math.max(0, prevSlides.length - 1);
      }
      pushSession({ sectionKey: prevSection.sectionKey, slideIndex: prevLastIdx, deaconOverride: null });
    }
  }

  // إذا كان slideIndex خارج نطاق الشرائح الحالية (مثلاً بعد تحميل قراءات اليوم)، نعود للشريحة الأولى
  useEffect(() => {
    if (!session.deaconOverride && currentSlides.length > 0 && session.slideIndex >= currentSlides.length) {
      pushSession({ slideIndex: 0 });
    }
  }, [session.sectionKey, session.slideIndex, currentSlides.length]);

  function injectDeacon(resp: DeaconResponse) {
    pushSession({ deaconOverride: resp });
    setShowDeaconPanel(false);
  }

  function clearDeacon() {
    pushSession({ deaconOverride: null });
  }

  // ── بحث ──────────────────────────────────────────────────────────────────
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  interface SearchHit {
    sectionKey: string;
    sectionLabel: string;
    sectionIcon: string;
    slideIndex: number;
    title: string;
    role: LiturgySlide['role'];
    excerpt: string;
  }

  function normalizeArabic(s: string) {
    return s
      .replace(/[ؐ-ًؚ-ٰٟ]/g, '')
      .replace(/[أإآ]/g, 'ا')
      .replace(/[ؤئ]/g, 'و')
      .replace(/ة/g, 'ه')
      .replace(/وا(?=\s|$)/g, 'و')         // الألف الفارقة: أنصتوا = أنصتو
      .replace(/[،,.:;؛!?؟\-\s]+/g, ' ')
      .trim();
  }

  function buildSearchResults(q: string): SearchHit[] {
    if (q.trim().length < 2) return [];
    const lower = normalizeArabic(q).toLowerCase();
    const sections = getSectionsForLiturgy(session.liturgyType);
    const activeReadings = session.readingsOverride as Record<string, { title: string; slides: string[] }> | null;
    const hits: SearchHit[] = [];
    for (const sec of sections) {
      const readingType = READINGS_SECTION_KEYS.has(sec.sectionKey) ? getReadingType(sec.sectionKey) : null;
      const readingData = readingType && activeReadings ? activeReadings[readingType] : null;

      let slides: LiturgySlide[];
      if (readingData?.slides?.length) {
        const prelude = getPreludeSlidesForSection(session.liturgyType, sec.sectionKey, session.occasion, session.seasonalLitany);
        const postlude = getPostludeSlidesForSection(sec.sectionKey, session.occasion);
        const readingSlides: LiturgySlide[] = readingData.slides.map((text, i) => ({
          id: `reading-${readingType}-${i}`,
          title: readingData.title,
          role: 'deacon' as const,
          text,
        }));
        slides = [...prelude, ...readingSlides, ...postlude];
      } else {
        slides = getSplitSlidesForSection(session.liturgyType, sec.sectionKey, session.occasion, session.seasonalLitany);
      }

      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const haystack = normalizeArabic(s.text + ' ' + (s.copticText ?? '') + ' ' + (s.copticArabicText ?? '') + ' ' + s.title).toLowerCase();
        if (!haystack.includes(lower)) continue;
        const inArabic = normalizeArabic(s.text).toLowerCase().includes(lower);
        const pos = inArabic
          ? Math.max(0, normalizeArabic(s.text).toLowerCase().indexOf(lower))
          : 0;
        const start = Math.max(0, pos - 30);
        const raw = s.text.slice(start, start + 100).replace(/\n/g, ' ');
        const excerpt = (start > 0 ? '...' : '') + raw + (raw.length >= 100 ? '...' : '');
        hits.push({
          sectionKey: sec.sectionKey,
          sectionLabel: sec.label,
          sectionIcon: sec.icon,
          slideIndex: i,
          title: s.title,
          role: s.role,
          excerpt,
        });
        if (hits.length >= 30) return hits;
      }
    }
    return hits;
  }

  const searchResults = buildSearchResults(searchQuery);

  function jumpToHit(hit: SearchHit) {
    pushSession({ sectionKey: hit.sectionKey, slideIndex: hit.slideIndex, deaconOverride: null });
    setShowSearch(false);
    setSearchQuery('');
  }

  function highlightQuery(text: string, q: string): React.ReactNode {
    if (!q.trim()) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-amber-400 text-black rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gray-950 text-white p-4">
      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            لوحة التحكم — القداس الإلهي
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            شاشة العرض:{' '}
            <span className="text-amber-300 font-mono">{displayPath}</span>
            {slot && (
              <span className="mr-2 text-gray-500">— {slot}</span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* الصف الأول: فتح شاشة العرض + نسخ الرابط */}
          <div className="flex items-center gap-2">
            {syncing && <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />}
            {lastSync && !syncing && (
              <span className="text-xs text-gray-500">
                {lastSync.toLocaleTimeString('ar-EG')}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-gray-600 text-gray-300"
              onClick={copyDisplayLink}
              title="نسخ رابط شاشة العرض"
            >
              {copied ? <Check className="w-3.5 h-3.5 ml-1 text-green-400" /> : <Copy className="w-3.5 h-3.5 ml-1" />}
              {copied ? 'تم النسخ' : 'نسخ الرابط'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-gray-600 text-gray-300"
              onClick={() => window.open(displayPath, '_blank')}
            >
              <Monitor className="w-3.5 h-3.5 ml-1" />
              فتح شاشة العرض
            </Button>
          </div>
          {/* الصف الثاني: بحث */}
          <div className="flex items-center">
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-amber-600/60 text-amber-300 hover:bg-amber-900/30 w-full sm:w-auto"
              onClick={() => setShowSearch(true)}
              title="بحث في نص القداس"
            >
              <Search className="w-3.5 h-3.5 ml-1" />
              بحث في نص القداس
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── العمود الأيمن: التحكم الرئيسي ── */}
        <div className="lg:col-span-2 space-y-4">

          {/* اختيار القداس */}
          <Card className="bg-gray-900 border-gray-700 p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">القداس</h2>
            <div className="flex gap-2 flex-wrap">
              {LITURGY_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => switchLiturgy(type)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-all ${LITURGY_COLORS[type]} ${session.liturgyType === type ? LITURGY_ACTIVE[type] : 'opacity-60'}`}
                  data-testid={`liturgy-switch-${type}`}
                >
                  {getLiturgyLabel(type)}
                </button>
              ))}
            </div>
          </Card>

          {/* مناسبة اليوم */}
          <Card className="bg-gray-900 border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-300">مناسبة اليوم</h2>
              <span className="text-xs text-emerald-400">
                {OCCASION_LABELS[session.occasion]}
              </span>
            </div>
            <select
              value={session.occasion}
              onChange={e => switchOccasion(e.target.value as OccasionTag)}
              className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              data-testid="occasion-select"
            >
              {OCCASION_ORDER.map(tag => (
                <option key={tag} value={tag}>{OCCASION_LABELS[tag]}</option>
              ))}
            </select>
            {/* مؤشرات القِسمة والهيتينية */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[11px] bg-amber-900/30 border border-amber-700/40 text-amber-300 px-2 py-0.5 rounded-full">
                {getQismaLabel(session.occasion)}
              </span>
              <span className="text-[11px] bg-blue-900/30 border border-blue-700/40 text-blue-300 px-2 py-0.5 rounded-full">
                {SEASONAL_LITANY_LABELS[session.seasonalLitany ?? 'weather']}
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              تُكتشف تلقائياً من التاريخ — غيّرها يدوياً عند الحاجة لتظهر مردات وألحان المناسبة في مواضعها.
            </p>
          </Card>

          {/* معاينة الشريحة الحالية */}
          <Card className="bg-gray-900 border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-300">الشريحة الحالية</h2>
              <span className="text-xs text-gray-500">
                {session.slideIndex + 1} / {currentSlides.length}
              </span>
            </div>

            <AnimatePresence mode="wait">
              {session.deaconOverride ? (
                <motion.div
                  key="deacon"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="bg-blue-900/40 border border-blue-700 rounded-xl p-4 mb-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-blue-300 font-bold">مرد الشماس — معروض الآن</span>
                    <button onClick={clearDeacon} className="text-gray-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-white text-lg font-serif whitespace-pre-line leading-relaxed">
                    {session.deaconOverride.text}
                  </p>
                </motion.div>
              ) : currentSlide ? (
                <motion.div
                  key={`${session.sectionKey}-${session.slideIndex}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="bg-gray-800 rounded-xl p-4 mb-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={`text-xs font-bold ${getRoleColor(currentSlide.role)}`}>
                      {getRoleLabel(currentSlide.role)}
                    </div>
                    {(currentSlide.copticText || currentCopticArabic) && (
                      <button
                        onClick={() => {
                          const next: 'script' | 'arabic' = copticModeRef.current === 'script' ? 'arabic' : 'script';
                          copticModeRef.current = next;
                          setCopticMode(next);
                          pushSession({ copticMode: next });
                        }}
                        className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                      >
                        {copticMode === 'script' ? 'قبطي بعربي ←' : '← ϯⲙⲉⲧⲣⲉⲙⲛ̀ⲭⲏⲙⲓ'}
                      </button>
                    )}
                  </div>
                  <h3 className="text-sm text-gray-400 mb-2">{currentSlide.title}</h3>
                  <p className="text-white text-sm font-serif whitespace-pre-line leading-relaxed line-clamp-6">
                    {currentSlide.text}
                  </p>
                  {copticMode === 'script' && currentSlide.copticText && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <span className="text-xs font-bold text-blue-400 block mb-1">ϯⲙⲉⲧⲣⲉⲙⲛ̀ⲭⲏⲙⲓ</span>
                      <p dir="ltr" className="text-blue-300 text-xs font-serif whitespace-pre-line leading-relaxed line-clamp-4">
                        {currentSlide.copticText}
                      </p>
                    </div>
                  )}
                  {copticMode === 'arabic' && currentCopticArabic && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <span className="text-xs font-bold text-amber-400 block mb-1">قبطي بحروف عربية</span>
                      <p dir="rtl" className="text-amber-300 text-xs whitespace-pre-line leading-relaxed line-clamp-4">
                        {currentCopticArabic}
                      </p>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="text-gray-500 text-sm text-center py-6">لا توجد شرائح</div>
              )}
            </AnimatePresence>

            {/* أزرار التنقل */}
            <div className="flex items-center gap-3 justify-center">
              <Button
                size="lg"
                variant="outline"
                onClick={goPrev}
                disabled={isFirstSlide && !prevSection}
                className={`flex-1 ${isFirstSlide && prevSection ? 'bg-blue-700 hover:bg-blue-800 text-white border-0' : 'border-gray-600 text-white hover:bg-gray-700'}`}
                data-testid="ctrl-prev"
              >
                <ChevronRight className="w-5 h-5 ml-1 flex-shrink-0" />
                {isFirstSlide && prevSection ? (
                  <span className="truncate text-sm">{prevSection.icon} {prevSection.label}</span>
                ) : 'السابق'}
              </Button>
              <Button
                size="lg"
                onClick={goNext}
                disabled={isLastSlide && !nextSection}
                className={`text-white flex-1 ${isLastSlide && nextSection ? 'bg-blue-700 hover:bg-blue-800' : 'bg-amber-600 hover:bg-amber-700'}`}
                data-testid="ctrl-next"
              >
                {isLastSlide && nextSection ? (
                  <span className="truncate text-sm">{nextSection.icon} {nextSection.label}</span>
                ) : 'التالي'}
                <ChevronLeft className="w-5 h-5 mr-1 flex-shrink-0" />
              </Button>
            </div>
          </Card>

          {/* قائمة الشرائح */}
          <Card className="bg-gray-900 border-gray-700 p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">شرائح القسم</h2>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {currentSlides.map((slide, i) => (
                <button
                  key={slide.id}
                  onClick={() => pushSession({ slideIndex: i, deaconOverride: null })}
                  className={`w-full text-right px-3 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                    i === session.slideIndex && !session.deaconOverride
                      ? 'bg-amber-600/20 border border-amber-600/40 text-amber-200'
                      : 'hover:bg-gray-800 text-gray-400'
                  }`}
                  data-testid={`slide-btn-${i}`}
                >
                  <span className={`w-16 flex-shrink-0 text-xs font-bold ${getRoleColor(slide.role)}`}>
                    {getRoleLabel(slide.role)}
                  </span>
                  <span className="truncate">{slide.title}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* ── العمود الأيسر: الأقسام + مردات الشماس ── */}
        <div className="space-y-4">
          {/* الأقسام */}
          <Card className="bg-gray-900 border-gray-700 p-4">
            <h2 className="text-sm font-bold text-gray-300 mb-3">الأقسام</h2>
            <div className="space-y-1">
              {getSectionsForLiturgy(session.liturgyType).map(sec => {
                const slides = getSplitSlidesForSection(session.liturgyType, sec.sectionKey, session.occasion, session.seasonalLitany);
                return (
                  <button
                    key={sec.sectionKey}
                    onClick={() => switchSection(sec.sectionKey)}
                    disabled={slides.length === 0}
                    className={`w-full text-right px-3 py-2.5 rounded-lg text-xs transition-all flex items-center gap-2 ${
                      session.sectionKey === sec.sectionKey
                        ? 'bg-amber-600/30 border border-amber-500/50 text-amber-200'
                        : slides.length === 0
                        ? 'text-gray-600 cursor-not-allowed'
                        : 'hover:bg-gray-800 text-gray-300'
                    }`}
                    data-testid={`section-btn-${sec.sectionKey}`}
                  >
                    <span>{sec.icon}</span>
                    <span className="flex-1">{sec.label}</span>
                    <span className="text-gray-600">{slides.length}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* مردات الشماس */}
          <Card className="bg-gray-900 border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-300">مردات الشماس</h2>
              <button
                onClick={() => setShowDeaconPanel(!showDeaconPanel)}
                className="text-xs text-blue-400 hover:text-blue-300"
                data-testid="toggle-deacon-panel"
              >
                {showDeaconPanel ? 'إغلاق' : 'إظهار'}
              </button>
            </div>

            {session.deaconOverride && (
              <div className="mb-2 flex items-center gap-2 bg-blue-900/30 border border-blue-700/50 rounded-lg px-3 py-2">
                <span className="text-xs text-blue-300 flex-1 truncate">
                  معروض: {session.deaconOverride.text.split('\n')[0]}
                </span>
                <button onClick={clearDeacon} data-testid="clear-deacon">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-white" />
                </button>
              </div>
            )}

            <AnimatePresence>
              {showDeaconPanel && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-1 mt-2">
                    {visibleDeaconResponses.map(resp => (
                      <button
                        key={resp.id}
                        onClick={() => injectDeacon(resp)}
                        className="w-full text-right px-3 py-2 rounded-lg text-xs hover:bg-blue-900/30 hover:text-blue-200 text-gray-400 transition-all border border-transparent hover:border-blue-800/50 font-serif"
                        data-testid={`deacon-btn-${resp.id}`}
                      >
                        {resp.text.split('\n')[0]}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!showDeaconPanel && (
              <button
                onClick={() => setShowDeaconPanel(true)}
                className="w-full py-3 border-2 border-dashed border-gray-700 rounded-xl text-xs text-gray-500 hover:border-blue-700 hover:text-blue-400 transition-all"
                data-testid="open-deacon-panel"
              >
                + إدخال مرد شماس
              </button>
            )}
          </Card>

          {/* ألحان اليوم */}
          <Card className="bg-gray-900 border-gray-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-300">
                ألحان اليوم
                {occasionHymns.length > 0 && (
                  <span className="mr-2 text-[10px] bg-emerald-700/40 text-emerald-300 px-2 py-0.5 rounded-full">
                    {occasionHymns.length}
                  </span>
                )}
              </h2>
              {occasionHymns.length > 0 && (
                <button
                  onClick={() => setShowHymnsPanel(!showHymnsPanel)}
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                >
                  {showHymnsPanel ? 'إغلاق' : 'إظهار'}
                </button>
              )}
            </div>

            {occasionHymns.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-3">
                لا توجد ألحان موسمية ليوم عادي
              </p>
            ) : !showHymnsPanel ? (
              <button
                onClick={() => setShowHymnsPanel(true)}
                className="w-full py-3 border-2 border-dashed border-gray-700 rounded-xl text-xs text-gray-500 hover:border-emerald-700 hover:text-emerald-400 transition-all"
              >
                🎵 {occasionHymns.map(h => h.name.split(' — ')[0]).join(' · ')}
              </button>
            ) : (
              <AnimatePresence>
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 mt-1">
                    {occasionHymns.map(hymn => (
                      <div key={hymn.id} className="border border-gray-800 rounded-lg overflow-hidden">
                        <button
                          onClick={() => setExpandedHymnId(expandedHymnId === hymn.id ? null : hymn.id)}
                          className="w-full text-right px-3 py-2 flex items-center gap-2 hover:bg-gray-800 transition-colors"
                        >
                          <span className="text-base flex-shrink-0">{hymn.icon}</span>
                          <span className="text-xs text-gray-300 font-bold flex-1 truncate">{hymn.name}</span>
                          <span className="text-[10px] text-gray-600 flex-shrink-0">
                            {expandedHymnId === hymn.id ? '▲' : '▼'}
                          </span>
                        </button>
                        {expandedHymnId === hymn.id && (
                          <div className="px-3 pb-3 border-t border-gray-800 space-y-2">
                            {hymn.sections.map(sec => (
                              <div key={sec.id} className="mt-2">
                                <p className="text-[10px] text-emerald-400 font-bold mb-1">{sec.title}</p>
                                <p className="text-xs text-gray-300 font-serif whitespace-pre-line leading-relaxed line-clamp-6">
                                  {sec.text}
                                </p>
                                {sec.note && (
                                  <p className="text-[10px] text-gray-600 mt-1 italic">{sec.note}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </Card>

          {/* التاريخ القبطي */}
          {copticDate && (
            <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2 text-center">
              <span className="text-xs text-gray-400">📅 </span>
              <span className="text-xs text-emerald-300 font-bold">{copticDate}</span>
            </div>
          )}

          {/* تحذير: القراءات المعروضة مش قراءات اليوم نفسه */}
          {copticDate && !readingsExact && (
            <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl px-4 py-3 text-center">
              <div className="text-xs text-amber-300 font-bold mb-1">⚠️ القراءات دي تقريبية</div>
              <div className="text-[11px] text-amber-200/90 leading-relaxed">
                مفيش قراءة مسجّلة ليوم <b>{copticDate}</b> في القطمارس المخزّن، فمعروض
                {readingsSourceDay ? <> قراءة يوم <b>{readingsSourceDay}</b></> : <> أقرب يوم سابق</>}.
                <br />راجع القطمارس قبل القراءة في القدّاس.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── مودال البحث ────────────────────────────────────────────────────── */}
      {showSearch && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={e => { if (e.target === e.currentTarget) { setShowSearch(false); setSearchQuery(''); } }}
        >
          <div className="w-full max-w-2xl bg-gray-900 rounded-2xl border border-gray-700 shadow-2xl overflow-hidden" dir="rtl">
            {/* شريط البحث */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-700">
              <Search className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="اكتب ما تسمعه من النص... (عربي أو قبطي)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-white placeholder-gray-500 text-base outline-none font-serif"
                dir="rtl"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-gray-500 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                className="text-gray-500 hover:text-white mr-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* تعليمات */}
            {!searchQuery && (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">
                <Search className="w-10 h-10 mx-auto mb-3 text-gray-700" />
                <p>اكتب أي كلمة تسمعها من نص القداس</p>
                <p className="text-xs mt-1 text-gray-600">سيبحث في كل أقسام {getLiturgyLabel(session.liturgyType)}</p>
              </div>
            )}

            {/* لا نتائج */}
            {searchQuery.length >= 2 && searchResults.length === 0 && (
              <div className="px-6 py-8 text-center text-gray-500 text-sm">
                <p>لا توجد نتائج لـ "<span className="text-white">{searchQuery}</span>"</p>
                <p className="text-xs mt-1 text-gray-600">جرّب كلمة أخرى من النص</p>
              </div>
            )}

            {/* النتائج */}
            {searchResults.length > 0 && (
              <div className="overflow-y-auto max-h-[60vh]">
                <div className="px-3 py-2 text-xs text-gray-500 border-b border-gray-800">
                  {searchResults.length} نتيجة في {getLiturgyLabel(session.liturgyType)}
                </div>
                {searchResults.map((hit, idx) => (
                  <button
                    key={`${hit.sectionKey}-${hit.slideIndex}-${idx}`}
                    onClick={() => jumpToHit(hit)}
                    className="w-full text-right px-4 py-3 hover:bg-amber-900/20 border-b border-gray-800/50 transition-all group"
                  >
                    {/* رأس النتيجة */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{hit.sectionIcon}</span>
                      <span className="text-xs text-amber-400 font-bold">{hit.sectionLabel}</span>
                      <span className="text-gray-600 text-xs">—</span>
                      <span className="text-xs text-gray-400">{hit.title}</span>
                      <span className={`text-xs font-bold mr-auto ${getRoleColor(hit.role)}`}>
                        {getRoleLabel(hit.role)}
                      </span>
                    </div>
                    {/* مقتطف النص مع تمييز */}
                    <p className="text-gray-300 text-sm font-serif leading-relaxed text-right group-hover:text-white transition-colors">
                      {highlightQuery(hit.excerpt, searchQuery)}
                    </p>
                    {/* زر الانتقال */}
                    <div className="mt-1 text-xs text-amber-600 group-hover:text-amber-400 transition-colors">
                      اضغط للانتقال إلى هذا الموضع ←
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
