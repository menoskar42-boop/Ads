import { useEffect, useRef, useState } from 'react';
import { useParams } from 'wouter';
import { detectOccasion, detectSeasonalLitany } from '@/lib/liturgy-occasion';
import {
  getSectionsForLiturgy,
  getSplitSlidesForSection,
  getPreludeSlidesForSection,
  getPostludeSlidesForSection,
  getRoleColor,
  getRoleLabel,
  getLiturgyLabel,
  COPTIC_ARABIC_MAP,
  READINGS_SECTION_KEYS,
  getReadingType,
  type LiturgySession,
  type LiturgySlide,
  type DeaconResponse,
  type DailyReadingSlides,
  defaultSession,
} from '@/lib/liturgy-map';

type ReadingsMap = Record<string, { title: string; slides: string[] }>;

function buildSlides(
  data: LiturgySession,
  readingType: keyof DailyReadingSlides | null,
  activeReadings: ReadingsMap | null,
): import('@/lib/liturgy-map').LiturgySlide[] {
  if (readingType && activeReadings) {
    const prelude = getPreludeSlidesForSection(data.liturgyType, data.sectionKey, data.occasion, data.seasonalLitany);
    const postlude = getPostludeSlidesForSection(data.sectionKey, data.occasion);
    const readingData = activeReadings[readingType];
    const readingSlides = readingData?.slides?.length
      ? readingData.slides.map((text, i) => ({
          id: `reading-${readingType}-${i}`, title: readingData.title,
          role: 'deacon' as import('@/lib/liturgy-map').LiturgySlide['role'], text,
        }))
      : [];
    if (readingSlides.length) {
      return [...prelude, ...readingSlides, ...postlude];
    }
  }
  return getSplitSlidesForSection(data.liturgyType, data.sectionKey, data.occasion, data.seasonalLitany);
}

export default function LiturgyDisplay() {
  const params = useParams<{ slot?: string }>();
  const slot = params?.slot;
  const [session, setSession] = useState<LiturgySession>(defaultSession as LiturgySession);
  const [currentSlide, setCurrentSlide] = useState<LiturgySlide | null>(null);
  const [deaconSlide, setDeaconSlide] = useState<DeaconResponse | null>(null);
  // قراءات اليوم — ref لتجنب stale closure في polling interval
  const localReadingsRef = useRef<Record<string, { title: string; slides: string[] }> | null>(null);

  // copticMode قد يأتي undefined من sessions قديمة — نضع fallback صريح
  const copticMode: 'script' | 'arabic' =
    (session as LiturgySession & { copticMode?: string }).copticMode === 'arabic'
      ? 'arabic'
      : 'script';

  const copticArabicText = currentSlide?.copticArabicText ?? COPTIC_ARABIC_MAP[session.sectionKey] ?? null;
  const showCopticSide =
    (copticMode === 'script' && !!(currentSlide?.copticText)) ||
    (copticMode === 'arabic' && !!copticArabicText);
  const copticSideText =
    copticMode === 'arabic' ? copticArabicText : (currentSlide?.copticText ?? null);

  useEffect(() => {
    document.title = 'عرض القداس';
    document.body.style.background = '#000';
    document.body.style.overflow = 'hidden';
    // جلب قراءات اليوم مباشرة — لا نعتمد على الجلسة وحدها
    fetch('/api/daily-readings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const { copticDate: _cd, ...readings } = data;
        localReadingsRef.current = readings as Record<string, { title: string; slides: string[] }>;
      })
      .catch(() => {});
    return () => {
      document.body.style.background = '';
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const url = slot ? `/api/liturgy-session/${slot}` : '/api/liturgy-session';
        const res = await fetch(url);
        if (!res.ok || cancelled) return;
        const raw: LiturgySession = await res.json();
        // اكتشاف المناسبة من التاريخ إذا كانت الجلسة على القيمة الافتراضية 'ordinary'
        const effectiveOccasion = (raw.occasion && raw.occasion !== 'ordinary')
          ? raw.occasion
          : detectOccasion(new Date());
        const effectiveLitany = raw.seasonalLitany ?? detectSeasonalLitany(new Date());
        const data = { ...raw, occasion: effectiveOccasion, seasonalLitany: effectiveLitany };
        setSession(data);
        if (data.deaconOverride) {
          setDeaconSlide(data.deaconOverride as DeaconResponse);
          setCurrentSlide(null);
        } else {
          setDeaconSlide(null);
          const sessionOverride = (data as LiturgySession & { readingsOverride?: Record<string, { title: string; slides: string[] }> }).readingsOverride;
          const readingType = READINGS_SECTION_KEYS.has(data.sectionKey) ? getReadingType(data.sectionKey) : null;
          const activeReadings = sessionOverride ?? localReadingsRef.current;
          const allSlides = buildSlides(data, readingType, activeReadings);
          setCurrentSlide(allSlides[data.slideIndex] ?? null);
        }
      } catch {
        // silent — keep last state
      }
    }
    poll();
    const interval = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [slot]);

  const section = getSectionsForLiturgy(session.liturgyType).find(s => s.sectionKey === session.sectionKey);

  if (!slot) {
    return (
      <div dir="rtl" className="fixed inset-0 bg-black flex flex-col items-center justify-center text-center px-8">
        <p className="text-gray-400 text-lg mb-2">لم يتم تحديد جلسة</p>
        <p className="text-gray-600 text-sm">افتح شاشة العرض من رابط لوحة التحكم الخاصة بك</p>
        <p className="text-gray-700 text-xs mt-3 font-mono">/liturgy-control → نسخ الرابط</p>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden"
      style={{ fontFamily: 'serif' }}
    >
      {/* شريط المعلومات العلوي */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-4 opacity-40">
        <span className="text-white text-sm">
          {getLiturgyLabel(session.liturgyType)}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-white text-sm">{section?.icon} {section?.label}</span>
        </div>
        <span className="text-white text-sm">
          {session.slideIndex + 1}
        </span>
      </div>

      {/* شريحة الشماس */}
      {deaconSlide && (
        <div className="flex flex-col items-center gap-6 px-12 max-w-4xl text-center animate-pulse">
          <div className="text-blue-400 text-sm font-bold tracking-widest uppercase">
            مرد الشماس
          </div>
          <div
            className="text-white whitespace-pre-line"
            style={{ fontSize: 'clamp(2rem, 6vw, 4.5rem)', lineHeight: 1.6 }}
          >
            {deaconSlide.text}
          </div>
        </div>
      )}

      {/* الشريحة الرئيسية — مقسومة أو عادية */}
      {!deaconSlide && currentSlide && showCopticSide && (
        <div
          className="flex w-full"
          style={{ minHeight: 0, flex: 1, maxHeight: '85vh' }}
        >
          {/* الجانب العربي */}
          <div
            dir="rtl"
            className="flex-1 flex flex-col items-center justify-center gap-3 px-6 border-r border-white/10 min-w-0"
          >
            <div className={`text-xs font-bold tracking-widest uppercase flex-shrink-0 ${getRoleColor(currentSlide.role)}`}>
              {getRoleLabel(currentSlide.role)}
            </div>
            <div
              className="text-white whitespace-pre-line text-center w-full"
              style={{ fontSize: 'clamp(1rem, 2.6vw, 2.4rem)', lineHeight: 1.8 }}
            >
              {currentSlide.text}
            </div>
            <div className="text-white/30 text-xs flex-shrink-0">{currentSlide.title}</div>
          </div>
          {/* الجانب القبطي */}
          <div
            dir={copticMode === 'arabic' ? 'rtl' : 'ltr'}
            className="flex-1 flex flex-col items-center justify-center gap-3 px-6 min-w-0"
          >
            <div className="text-blue-300/60 text-xs font-bold tracking-widest uppercase flex-shrink-0">
              {copticMode === 'arabic' ? 'قبطي بحروف عربية' : 'Coptic'}
            </div>
            <div
              className="text-white/90 whitespace-pre-line text-center w-full"
              style={{
                fontSize: 'clamp(0.9rem, 2.3vw, 2.1rem)',
                lineHeight: 1.9,
                fontFamily: copticMode === 'arabic' ? 'inherit' : 'serif',
              }}
            >
              {copticSideText}
            </div>
          </div>
        </div>
      )}

      {!deaconSlide && currentSlide && !showCopticSide && (
        <div
          className="flex flex-col items-center justify-center gap-6 px-10 text-center w-full"
          style={{ flex: 1, maxHeight: '85vh', maxWidth: '90vw' }}
        >
          <div className={`text-xs font-bold tracking-widest uppercase flex-shrink-0 ${getRoleColor(currentSlide.role)}`}>
            {getRoleLabel(currentSlide.role)}
          </div>
          <div
            className="text-white whitespace-pre-line"
            style={{ fontSize: 'clamp(1.4rem, 3.8vw, 3.4rem)', lineHeight: 1.8 }}
          >
            {currentSlide.text}
          </div>
          <div className="text-white/30 text-sm flex-shrink-0">
            {currentSlide.title}
          </div>
        </div>
      )}

      {/* حالة الانتظار */}
      {!deaconSlide && !currentSlide && (
        <div className="text-white/30 text-2xl">
          في انتظار بدء القداس...
        </div>
      )}

      {/* شريط سفلي */}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
        {(() => {
          const ov = (session as LiturgySession & { readingsOverride?: ReadingsMap }).readingsOverride;
          const rt = READINGS_SECTION_KEYS.has(session.sectionKey) ? getReadingType(session.sectionKey) : null;
          const count = buildSlides(session as LiturgySession, rt, ov ?? localReadingsRef.current).length;
          return Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === session.slideIndex ? 'bg-white w-8' : 'bg-white/20 w-2'
              }`}
            />
          ));
        })()}
      </div>
    </div>
  );
}
