import { useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'wouter';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Cross, Play, BookOpen, Music, Calendar, Video, ChevronDown, ChevronUp, Church, Mic2, BookMarked, History, HelpCircle, Users, Search, Map, Library, MessageCircle, BookText, Loader2, Scroll, ChevronRight, X, ChevronLeft, Volume2, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useQuery } from '@tanstack/react-query';
import { api, type SynaxariumEntry as LiveSynaxariumEntry } from '@/lib/api';
import { SEOHead } from '@/components/SEOHead';
import { usePageTracker } from '@/hooks/usePageTracker';
import { useExitTracker } from '@/hooks/useExitTracker';
import { liturgies, type Liturgy } from '@/lib/liturgy-content';
import { agpeyaHoursFull, type AgpeyaHourFull } from '@/lib/agpeya-content';
import { commentaryFathers, type CommentaryFather, type CommentaryBook, type CommentarySection } from '@/lib/commentary-content';
import { saintsData, saintCategories, type Saint } from '@/lib/saints-content';
import { hymnsCategoriesData, type HymnsCategory, type Hymn } from '@/lib/hymns-content';
import {
  saintsVideos,
  deaconSections,
  bibleLocations,
  bibleLocationCategories,
  type BibleLocation,
  type BibleLocationCategory,
  popeShenoudaQAVideos,
  popeShenoudaQACategories,
  type SaintVideo,
} from '@/lib/orthodox-data';
import {
  niceneCreed,
  creedTopics,
  creedCategories,
  historyEras,
  creedQA,
  qaCategories,
  churchFigures,
  figureCategories,
} from '@/lib/creed-data';
import {
  orthodoxBooks,
  orthodoxBookCategoryList,
  type OrthodoxBook,
  type BookChapter,
} from '@/lib/orthodox-books-content';
import { apocryphaBooks, type ApocryphaBook } from '@/lib/apocrypha-content';
import { getLectionaryForDate, type ReadingRef } from '@/lib/coptic-lectionary';
import { katameroSeasons, type KatamerosSeason, type KatamerosDay } from '@/lib/katameros-content';
import { RemoteDeuteroReader } from '@/components/RemoteDeuteroReader';
import { StTaklaSections } from '@/components/StTaklaSections';
import { fetchVerseTafsir, fetchChapterTafsir } from '@/lib/tafsir-csv-service';
import {
  synaxariumMonths,
  gregorianToCoptic,
} from '@/lib/synaxarium-content';

function YouTubeEmbed({ videoId, title, onClose }: { videoId: string; title: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="font-display text-lg">{title}</DialogTitle>
        </DialogHeader>
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── السنكسار القبطي المدمج ────────────────────────────────────────────────────
function SynaxariumSection() {
  const todayCoptic = gregorianToCoptic(new Date());

  // حالة التصفح: null = عرض اليوم، 'months' = قائمة الشهور، {monthId} = أيام الشهر
  const [view, setView] = useState<'today' | 'months' | 'days' | 'detail'>('today');
  const [selectedMonth, setSelectedMonth] = useState<number>(todayCoptic.month);
  const [selectedDay, setSelectedDay] = useState<number>(todayCoptic.day);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const currentMonth = synaxariumMonths.find(m => m.id === selectedMonth);
  const activeMonth = view === 'today' ? todayCoptic.month : selectedMonth;
  const activeDay = view === 'today' ? todayCoptic.day : selectedDay;
  const {
    data: liveDay,
    isLoading: liveDayLoading,
    isError: liveDayError,
  } = useQuery({
    queryKey: ['orthodox-synaxarium', activeMonth, activeDay],
    queryFn: () => api.orthodox.getSynaxariumDay(activeMonth, activeDay),
    enabled: view === 'today' || view === 'detail',
    staleTime: 6 * 60 * 60 * 1000,
  });

  function renderEntryCard(entry: LiveSynaxariumEntry, i: number) {
    const key = entry.id || `${activeMonth}-${activeDay}-${i}`;
    const isOpen = expandedEntry === key;
    return (
      <motion.div key={key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
        <Card
          className="p-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setExpandedEntry(isOpen ? null : key)}
        >
          <div className="flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display font-bold text-foreground text-lg leading-snug">{entry.title}</p>
                <Badge variant="secondary" className="text-xs">سنكسار</Badge>
              </div>
              <AnimatePresence>
                {isOpen && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-base text-foreground/90 font-medium mt-2 leading-relaxed"
                  >
                    {entry.description}
                  </motion.p>
                )}
              </AnimatePresence>
              {isOpen && entry.url && (
                <a
                  href={entry.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-3"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  فتح المصدر
                </a>
              )}
            </div>
            {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />}
          </div>
        </Card>
      </motion.div>
    );
  }

  function renderLiveEntries() {
    if (liveDayLoading) {
      return (
        <Card className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          جاري تحميل السنكسار من المصدر...
        </Card>
      );
    }
    if (liveDayError) {
      return (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground">تعذر تحميل السنكسار من المصدر حاليًا.</p>
          <p className="text-xs text-muted-foreground mt-1">حاول تحديث الصفحة بعد قليل.</p>
        </Card>
      );
    }
    if (!liveDay?.entries.length) {
      return <p className="text-center text-muted-foreground py-8">لا توجد بيانات لهذا اليوم.</p>;
    }
    return (
      <div className="space-y-3">
        {liveDay.entries.map((entry, i) => renderEntryCard(entry, i))}
      </div>
    );
  }

  // ── عرض اليوم الحالي ─────────────────────────────────────────────────────
  if (view === 'today') {
    return (
      <div dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-amber-500" />
            <h2 className="font-display text-xl font-bold text-foreground">
              {liveDay?.copticDate || 'سنكسار اليوم'}
            </h2>
          </div>
          <Button size="sm" variant="outline" onClick={() => setView('months')}>
            تصفح السنة
            <ChevronLeft className="w-4 h-4 mr-1" />
          </Button>
        </div>
        {renderLiveEntries()}
        <p className="text-sm text-center text-muted-foreground mt-4">
          اضغط على أي مدخل لقراءة النص • من المصدر القبطي الموثوق
        </p>
      </div>
    );
  }

  // ── قائمة الشهور ─────────────────────────────────────────────────────────
  if (view === 'months') {
    return (
      <div dir="rtl">
        <div className="flex items-center gap-2 mb-4">
          <Button size="sm" variant="ghost" onClick={() => setView('today')}>
            <ChevronRight className="w-4 h-4 ml-1" />
            اليوم
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">اختر شهراً</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {synaxariumMonths.map(month => (
            <Card
              key={month.id}
              className={`p-3 cursor-pointer hover:shadow-md transition-shadow text-center ${month.id === todayCoptic.month ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : ''}`}
              onClick={() => { setSelectedMonth(month.id); setView('days'); }}
            >
              <p className="font-display font-bold text-foreground text-base">{month.arabicName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{month.gregStart}</p>
              {month.id === todayCoptic.month && (
                <Badge className="mt-1 text-xs bg-amber-500">الشهر الحالي</Badge>
              )}
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── أيام الشهر ───────────────────────────────────────────────────────────
  if (view === 'days' && currentMonth) {
    return (
      <div dir="rtl">
        <div className="flex items-center gap-2 mb-4">
          <Button size="sm" variant="ghost" onClick={() => setView('months')}>
            <ChevronRight className="w-4 h-4 ml-1" />
            الشهور
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">{currentMonth.arabicName}</span>
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
          {currentMonth.days.map(d => {
            const isToday = currentMonth.id === todayCoptic.month && d.day === todayCoptic.day;
            return (
              <Card
                key={d.day}
                className={`p-2 cursor-pointer hover:shadow-md transition-shadow text-center ${isToday ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : ''}`}
                onClick={() => { setSelectedDay(d.day); setView('detail'); }}
              >
                <p className={`font-bold text-lg ${isToday ? 'text-amber-600' : 'text-foreground'}`}>{d.day}</p>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // ── تفاصيل اليوم المحدد ───────────────────────────────────────────────────
  if (view === 'detail') {
    return (
      <div dir="rtl">
        <div className="flex items-center gap-2 mb-4">
          <Button size="sm" variant="ghost" onClick={() => setView('days')}>
            <ChevronRight className="w-4 h-4 ml-1" />
            {currentMonth?.arabicName}
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">{selectedDay} {currentMonth?.arabicName}</span>
        </div>
        {renderLiveEntries()}
      </div>
    );
  }

  return null;
}

const AGPEYA_HOUR_VIDEO: Record<string, string> = {
  prime:    'GHdBAQSvJKE',
  terce:    'S0j7u_ofox0',
  sext:     'gLF5RdzeUiU',
  none:     'PaYAUeyPcxk',
  vespers:  'HLvvnxMA_JI',
  compline: 'N6sfbh3bmMk',
  midnight: 'YHtnFevTKx0',
};

function AgpeyaSection() {
  const [selectedHour, setSelectedHour] = useState<AgpeyaHourFull | null>(null);
  const [expandedPrayers, setExpandedPrayers] = useState<Set<string>>(new Set());
  const [audioOpen, setAudioOpen] = useState(false);

  const togglePrayer = (id: string) => {
    setExpandedPrayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openHour = (hour: AgpeyaHourFull) => {
    setSelectedHour(hour);
    setExpandedPrayers(new Set());
    setAudioOpen(false);
  };

  const roleColor: Record<string, string> = {
    'الكاهن':  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    'الشماس': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    'الشعب':  'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    'الكل':   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  };

  if (selectedHour) {
    return (
      <div dir="rtl">
        {/* شريط التنقل */}
        <div className="flex items-center gap-2 mb-4">
          <Button size="sm" variant="ghost" onClick={() => setSelectedHour(null)} className="gap-1 text-xs">
            <ChevronDown className="w-3 h-3 rotate-90" />
            الأجبية
          </Button>
          <span className="text-muted-foreground text-xs">/</span>
          <span className="text-xs font-medium truncate">{selectedHour.name}</span>
        </div>

        {/* رأس الساعة */}
        <div className={`rounded-xl p-4 mb-4 ${selectedHour.colorBg} border ${selectedHour.colorBorder}`}>
          <div className="flex items-start gap-3">
            <span className="text-3xl flex-shrink-0">{selectedHour.icon}</span>
            <div className="flex-1">
              <h2 className="font-display font-bold text-foreground text-xl">{selectedHour.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedHour.arabicTime}</p>
              <Badge variant="outline" className={`text-xs mt-2 ${selectedHour.colorText} border-current`}>
                {selectedHour.memory}
              </Badge>
              <div className="mt-2 flex flex-col gap-0.5">
                <p className="text-xs text-muted-foreground">📖 {selectedHour.psalms}</p>
                <p className="text-xs text-muted-foreground">✝️ الإنجيل: {selectedHour.gospel}</p>
              </div>
              <Button
                size="sm"
                className="mt-3 gap-1.5 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground"
                onClick={() => setAudioOpen(true)}
                data-testid={`agpeya-listen-${selectedHour.id}`}
              >
                <Volume2 className="w-4 h-4 ml-1" />
                استمع للصلاة
              </Button>
            </div>
          </div>
        </div>

        {/* مشغّل الصلاة — نافذة يوتيوب */}
        <Dialog open={audioOpen} onOpenChange={setAudioOpen}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl" data-testid="agpeya-audio-dialog">
            <DialogHeader className="px-4 pt-4 pb-2">
              <DialogTitle className="text-right font-display text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span>{selectedHour.icon}</span>
                  <span>{selectedHour.name} — استمع للصلاة</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAudioOpen(false)}
                  className="flex-shrink-0"
                  data-testid="agpeya-audio-close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="px-4 pb-2">
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                <iframe
                  key={selectedHour.id}
                  src={`https://www.youtube-nocookie.com/embed/${AGPEYA_HOUR_VIDEO[selectedHour.id]}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                  title={selectedHour.name}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              </div>
            </div>
            <div className="px-4 pb-4">
              <a
                href={`https://www.youtube.com/watch?v=${AGPEYA_HOUR_VIDEO[selectedHour.id]}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-sm transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                افتح الفيديو على يوتيوب
              </a>
            </div>
          </DialogContent>
        </Dialog>

        {/* صلوات الساعة */}
        <div className="space-y-2 mb-5">
          {selectedHour.prayers.map((prayer) => (
            <motion.div
              key={prayer.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card
                className="overflow-hidden border border-border/60 cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => togglePrayer(prayer.id)}
                data-testid={`agpeya-prayer-${prayer.id}`}
              >
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {prayer.role && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${roleColor[prayer.role] ?? roleColor['الكل']}`}>
                        {prayer.role}
                      </span>
                    )}
                    <span className="text-base font-medium text-foreground truncate">{prayer.title}</span>
                  </div>
                  {expandedPrayers.has(prayer.id)
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  }
                </div>
                <AnimatePresence>
                  {expandedPrayers.has(prayer.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 border-t border-border/40">
                        <p className="text-base leading-loose text-foreground whitespace-pre-line mt-3">
                          {prayer.text}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* التنقل بين الساعات */}
        <div className="flex gap-2 flex-wrap mb-4">
          {agpeyaHoursFull.map((h) => (
            <button
              key={h.id}
              onClick={() => openHour(h)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                h.id === selectedHour.id
                  ? `${selectedHour.colorBadge} border-current font-bold`
                  : 'border-border text-muted-foreground hover:border-foreground/40'
              }`}
            >
              {h.icon} {h.name}
            </button>
          ))}
        </div>

        <div className="pt-3 border-t border-border/30">
          <span className="text-xs text-muted-foreground opacity-70">
            🔓 تراث طقسي قبطي أرثوذكسي — مُحمَّل مباشرةً على الموقع
          </span>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="w-5 h-5 text-blue-500" />
        <h2 className="font-display text-xl font-bold text-foreground">الأجبية — ساعات الصلاة السبع</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        الأجبية (كتاب الساعات) هو كتاب الصلوات اليومية في الكنيسة القبطية الأرثوذكسية. كل ساعة تحمل ذكرى روحية من حياة المسيح — مُحمَّل مباشرةً للقراءة على موقعنا.
      </p>

      <div className="space-y-3 mb-5">
        {agpeyaHoursFull.map((hour, i) => (
          <motion.div
            key={hour.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card
              className={`overflow-hidden border ${hour.colorBorder} cursor-pointer hover:shadow-md transition-shadow`}
              onClick={() => openHour(hour)}
              data-testid={`agpeya-hour-${hour.id}`}
            >
              <div className={`p-4 ${hour.colorBg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl bg-white/60 dark:bg-black/20`}>
                      {hour.icon}
                    </div>
                    <div>
                      <p className="font-display font-bold text-foreground text-lg">{hour.name}</p>
                      <p className="text-sm text-muted-foreground">{hour.arabicTime}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs hidden sm:flex ${hour.colorText} border-current`}>
                      {hour.prayers.length} صلوات
                    </Badge>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{hour.description}</p>
                <p className="text-sm mt-1.5 opacity-70">📖 {hour.psalms}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-2">
          <span className="text-lg">🔓</span>
          <div>
            <p className="text-sm font-bold text-blue-800 dark:text-blue-200 mb-1">نصوص طقسية أصيلة — مُحمَّلة مباشرةً على موقعنا</p>
            <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
              صلوات الأجبية السبع مضمّنة للقراءة داخل الموقع — محتوى طقسي قبطي أرثوذكسي مدمج دون الاعتماد على روابط خارجية.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LiturgySection() {
  const [selectedLiturgy, setSelectedLiturgy] = useState<Liturgy | null>(null);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState(0);
  const [expandedParts, setExpandedParts] = useState<Set<string>>(new Set());

  const togglePart = (id: string) => {
    setExpandedParts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openLiturgy = (lit: Liturgy) => {
    setSelectedLiturgy(lit);
    setSelectedChapterIdx(0);
    setExpandedParts(new Set());
  };

  const chapter = selectedLiturgy?.chapters[selectedChapterIdx];

  const roleColor: Record<string, string> = {
    'الكاهن':  'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    'الشماس': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    'الشعب':  'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    'الكل':   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  };

  if (selectedLiturgy && chapter) {
    return (
      <div dir="rtl">
        {/* شريط التنقل */}
        <div className="flex items-center gap-2 mb-4">
          <Button size="sm" variant="ghost" onClick={() => setSelectedLiturgy(null)} className="gap-1 text-xs">
            <ChevronDown className="w-3 h-3 rotate-90" />
            القداسات
          </Button>
          <span className="text-muted-foreground text-xs">/</span>
          <span className="text-xs font-medium truncate">{selectedLiturgy.name}</span>
        </div>

        {/* اسم القداس */}
        <div className={`rounded-xl p-4 mb-4 ${selectedLiturgy.colorBg} border ${selectedLiturgy.colorBorder}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{selectedLiturgy.icon}</span>
            <div>
              <h2 className="font-display font-bold text-foreground text-xl">{selectedLiturgy.name}</h2>
              <Badge variant="outline" className={`text-xs mt-1 ${selectedLiturgy.colorText} border-current`}>
                {selectedLiturgy.occasion}
              </Badge>
            </div>
          </div>
        </div>

        {/* قائمة الأقسام */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {selectedLiturgy.chapters.map((ch, idx) => (
            <button
              key={ch.id}
              onClick={() => { setSelectedChapterIdx(idx); setExpandedParts(new Set()); }}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                idx === selectedChapterIdx
                  ? `${selectedLiturgy.colorBadge} border-current font-bold`
                  : 'border-border text-muted-foreground hover:border-foreground/40'
              }`}
              data-testid={`liturgy-chapter-${idx}`}
            >
              {ch.title}
            </button>
          ))}
        </div>

        {/* محتوى القسم */}
        <div className="space-y-3">
          {chapter.description && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-relaxed">{chapter.description}</p>
          )}
          {chapter.parts.map((part) => (
            <motion.div
              key={part.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card
                className="overflow-hidden border border-border/60 cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => togglePart(part.id)}
                data-testid={`liturgy-part-${part.id}`}
              >
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {part.role && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${roleColor[part.role] ?? roleColor['الكل']}`}>
                        {part.role}
                      </span>
                    )}
                    <span className="text-base font-medium text-foreground truncate">{part.title}</span>
                  </div>
                  {expandedParts.has(part.id)
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  }
                </div>
                <AnimatePresence>
                  {expandedParts.has(part.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 border-t border-border/40">
                        <p className="text-base leading-loose text-foreground whitespace-pre-line font-arabic mt-3">
                          {part.text}
                        </p>
                        {part.copticText && (
                          <div className="mt-3 pt-3 border-t border-border/30">
                            <span className="text-xs font-bold text-blue-500 dark:text-blue-400 mb-1 block">ϯⲙⲉⲧⲣⲉⲙⲛ̀ⲭⲏⲙⲓ — القبطية</span>
                            <p dir="ltr" className="text-base leading-loose text-blue-700 dark:text-blue-300 whitespace-pre-line mt-1" style={{ fontFamily: 'serif' }}>
                              {part.copticText}
                            </p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* أزرار التنقل بين الأقسام */}
        <div className="flex justify-between mt-5">
          <Button
            size="sm" variant="outline"
            disabled={selectedChapterIdx === 0}
            onClick={() => setSelectedChapterIdx(i => i - 1)}
          >
            <ChevronUp className="w-4 h-4 ml-1 rotate-90" />
            السابق
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            {selectedChapterIdx + 1} / {selectedLiturgy.chapters.length}
          </span>
          <Button
            size="sm" variant="outline"
            disabled={selectedChapterIdx === selectedLiturgy.chapters.length - 1}
            onClick={() => setSelectedChapterIdx(i => i + 1)}
          >
            التالي
            <ChevronDown className="w-4 h-4 mr-1 rotate-90" />
          </Button>
        </div>

        <div className="mt-4 pt-3 border-t border-border/30">
          <span className="text-xs text-muted-foreground opacity-70">
            🔓 نص طقسي قبطي أرثوذكسي — محتوى مضمّن للقراءة
          </span>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <Church className="w-5 h-5 text-purple-500" />
        <h2 className="font-display text-xl font-bold text-foreground">الخولاجي المقدس والقداسات الإلهية</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        ثلاثة نصوص مدمجة للقداسات الإلهية في الكنيسة القبطية الأرثوذكسية — اختر نصًا للقراءة داخل الموقع.
      </p>

      <div className="space-y-4 mb-5">
        {liturgies.map((lit, i) => (
          <motion.div
            key={lit.id}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.09 }}
          >
            <Card
              className={`p-5 border ${lit.colorBorder} cursor-pointer hover:shadow-md transition-shadow`}
              onClick={() => openLiturgy(lit)}
              data-testid={`liturgy-${lit.id}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl flex-shrink-0">{lit.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="font-display font-bold text-foreground text-lg">{lit.name}</h3>
                    <Badge variant="outline" className={`text-xs ${lit.colorText} border-current`}>
                      {lit.occasion}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-3">{lit.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{lit.chapters.length} أقسام مدمجة</span>
                    <Button size="sm" className={`text-xs gap-1`} variant="outline">
                      <BookOpen className="w-3.5 h-3.5" />
                      اقرأ القداس
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* نظام عرض القداس الكنسي */}
      <Card
        className="p-4 mb-4 border-2 border-dashed border-amber-400/60 bg-amber-50/60 dark:bg-amber-900/10 cursor-pointer hover:shadow-md transition-all group"
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

      <Card className="p-4 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
        <div className="flex items-start gap-2">
          <span className="text-lg">🔓</span>
          <div>
            <p className="text-sm font-bold text-purple-800 dark:text-purple-200 mb-1">نصوص طقسية مضمّنة للقراءة</p>
            <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
              نصوص مدمجة للقداسات الثلاثة متاحة للقراءة داخل الموقع. يُرجى الرجوع إلى النص الكنسي المعتمد عند الاستخدام الطقسي.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function HymnsSection() {
  const [selectedCategory, setSelectedCategory] = useState<HymnsCategory | null>(null);
  const [selectedHymn, setSelectedHymn] = useState<Hymn | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ── عرض قسم (section) داخل لحن ── */
  if (selectedHymn && selectedCategory) {
    return (
      <div dir="rtl">
        {/* تنقل */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap text-xs">
          <button onClick={() => { setSelectedCategory(null); setSelectedHymn(null); }} className="text-muted-foreground hover:text-foreground transition-colors">الألحان</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => setSelectedHymn(null)} className="text-muted-foreground hover:text-foreground transition-colors">{selectedCategory.name}</button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{selectedHymn.name}</span>
        </div>

        {/* رأس اللحن */}
        <div className={`rounded-xl p-4 mb-5 ${selectedCategory.colorBg} border ${selectedCategory.colorBorder}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{selectedHymn.icon}</span>
            <div>
              <h2 className="font-display font-bold text-foreground text-base">{selectedHymn.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedHymn.arabicDesc}</p>
              <span className={`inline-block mt-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${selectedCategory.colorBg} ${selectedCategory.colorText} border ${selectedCategory.colorBorder}`}>{selectedHymn.occasion}</span>
            </div>
          </div>
        </div>

        {/* الأقسام accordion */}
        <div className="space-y-3">
          {selectedHymn.sections.map((sec) => (
            <Card key={sec.id} className={`border ${selectedCategory.colorBorder} overflow-hidden`}>
              <button
                className="w-full flex items-center justify-between gap-3 p-4 text-right"
                onClick={() => toggleSection(sec.id)}
                data-testid={`hymn-section-${sec.id}`}
              >
                <span className="font-display font-bold text-foreground text-base">{sec.title}</span>
                <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${expandedSections.has(sec.id) ? 'rotate-180' : ''}`} />
              </button>
              {expandedSections.has(sec.id) && (
                <div className={`px-4 pb-4 border-t ${selectedCategory.colorBorder} ${selectedCategory.colorBg}`}>
                  {sec.note && (
                    <p className={`text-xs italic ${selectedCategory.colorText} mb-3 mt-3 font-medium`}>{sec.note}</p>
                  )}
                  <pre className="text-base text-foreground leading-9 whitespace-pre-wrap font-arabic mt-3 text-right">
                    {sec.text}
                  </pre>
                </div>
              )}
            </Card>
          ))}
        </div>

        <button
          onClick={() => setSelectedHymn(null)}
          className="mt-5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <ChevronRight className="w-3.5 h-3.5" />
          العودة إلى {selectedCategory.name}
        </button>
      </div>
    );
  }

  /* ── قائمة الألحان داخل فئة ── */
  if (selectedCategory) {
    return (
      <div dir="rtl">
        <div className="flex items-center gap-1.5 mb-4 text-xs">
          <button onClick={() => setSelectedCategory(null)} className="text-muted-foreground hover:text-foreground transition-colors">الألحان</button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{selectedCategory.name}</span>
        </div>

        <div className={`rounded-xl p-4 mb-5 ${selectedCategory.colorBg} border ${selectedCategory.colorBorder}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{selectedCategory.icon}</span>
            <div>
              <h2 className="font-display font-bold text-foreground text-base">{selectedCategory.name}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedCategory.description}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {selectedCategory.hymns.map((hymn, i) => (
            <motion.div
              key={hymn.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <button
                className="w-full text-right"
                onClick={() => { setSelectedHymn(hymn); setExpandedSections(new Set()); }}
                data-testid={`hymn-item-${hymn.id}`}
              >
                <Card className={`p-4 hover:shadow-md transition-all hover:scale-[1.01] cursor-pointer border ${selectedCategory.colorBorder}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{hymn.icon}</span>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-foreground text-base">{hymn.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{hymn.arabicDesc}</p>
                      <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full ${selectedCategory.colorBg} ${selectedCategory.colorText} border ${selectedCategory.colorBorder}`}>
                        {hymn.sections.length} {hymn.sections.length === 1 ? 'قسم' : 'أقسام'}
                      </span>
                    </div>
                    <ChevronLeft className={`w-4 h-4 flex-shrink-0 ${selectedCategory.colorText}`} />
                  </div>
                </Card>
              </button>
            </motion.div>
          ))}
        </div>

        <button
          onClick={() => setSelectedCategory(null)}
          className="mt-5 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <ChevronRight className="w-3.5 h-3.5" />
          العودة إلى جميع التصنيفات
        </button>
      </div>
    );
  }

  /* ── القائمة الرئيسية للفئات ── */
  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <Music className="w-5 h-5 text-rose-500" />
        <h2 className="font-display text-xl font-bold text-foreground">ألحان قبطية أرثوذكسية</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        الألحان القبطية تراث روحي عريق — مختارات عربية مضمّنة للقراءة من التراث الطقسي القبطي الأرثوذكسي.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        {hymnsCategoriesData.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.07 }}
          >
            <button
              className="w-full text-right"
              onClick={() => setSelectedCategory(cat)}
              data-testid={`hymn-category-${cat.id}`}
            >
              <Card className={`p-4 h-full hover:shadow-md transition-all hover:scale-[1.02] cursor-pointer border ${cat.colorBorder}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold text-foreground mb-1 text-lg">{cat.name}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{cat.description}</p>
                    <p className={`text-sm mt-2 font-medium ${cat.colorText}`}>{cat.hymns.length} ألحان</p>
                  </div>
                  <ChevronLeft className={`w-4 h-4 flex-shrink-0 mt-1 ${cat.colorText}`} />
                </div>
              </Card>
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function DailyLectionarySection() {
  const [date, setDate] = useState(() => new Date());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const formatApiDate = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const dateKey = formatApiDate(date);
  const formatDateAr = (value: Date) =>
    value.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['orthodox-katameros', dateKey],
    queryFn: () => api.orthodox.getKatamerosDay(dateKey),
    staleTime: 5 * 60 * 1000,
  });

  const moveDay = (amount: number) => {
    setDate(current => {
      const next = new Date(current);
      next.setDate(next.getDate() + amount);
      return next;
    });
    setExpandedKey(null);
  };

  const readingCards = data?.readings ?? [];

  return (
    <div className="space-y-4" dir="rtl" data-testid="katameros-live-section">
      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-3">
        <Button variant="ghost" size="sm" onClick={() => moveDay(-1)} className="text-amber-700" aria-label="اليوم السابق">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <div className="text-lg font-bold text-amber-900">{data?.title || 'قراءات اليوم'}</div>
          <div className="text-xs text-amber-600">{formatDateAr(date)}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => moveDay(1)} className="text-amber-700" aria-label="اليوم التالي">
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-800 dark:text-green-200">
        <div className="flex items-center justify-between gap-3">
          <span>القراءات والنصوص من St-Takla.org مباشرةً</span>
          {data?.sourcePageUrl && (
            <a href={data.sourcePageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2 whitespace-nowrap" data-testid="katameros-source-link">
              فتح المصدر <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
        {data?.title && <p className="text-xs mt-1 opacity-80">{data.title}</p>}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          <span>جاري تحميل قراءات St-Takla...</span>
        </div>
      )}

      {isError && (
        <div className="rounded-xl border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/30 p-4 text-center">
          <p className="font-bold text-orange-800 dark:text-orange-300 mb-2">تعذر تحميل القطمارس من St-Takla</p>
          <p className="text-sm text-orange-700 dark:text-orange-400 mb-3">لن نعرض نصًا محليًا بديلًا غير موثوق.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>إعادة المحاولة</Button>
        </div>
      )}

      {!isLoading && !isError && readingCards.length === 0 && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center text-sm text-orange-800">
          لم يرجع St-Takla قراءات قابلة للعرض لهذا اليوم.
        </div>
      )}

      {readingCards.map(reading => {
        const isExpanded = expandedKey === reading.id;
        return (
          <Card
            key={reading.id}
            className="overflow-hidden border border-amber-100 shadow-sm cursor-pointer"
            onClick={() => setExpandedKey(current => current === reading.id ? null : reading.id)}
            data-testid={`katameros-live-reading-${reading.id}`}
          >
            <div className="flex items-center justify-between gap-3 p-3 bg-white">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs text-amber-600 font-medium whitespace-nowrap">{reading.label}</span>
                <span className="text-sm font-semibold text-gray-800 truncate">{reading.reference}</span>
              </div>
              {isExpanded
                ? <ChevronUp className="w-4 h-4 text-amber-500 shrink-0" />
                : <ChevronDown className="w-4 h-4 text-amber-400 shrink-0" />}
            </div>
            {isExpanded && reading.status === 'ok' && reading.verses.length > 0 && (
              <div className="px-4 pb-4 pt-1 bg-amber-50 border-t border-amber-100 space-y-1 max-h-[32rem] overflow-y-auto" data-testid={`katameros-live-verses-${reading.id}`}>
                {reading.verses.map(verse => (
                  <p key={`${verse.chapter}-${verse.verse}`} className="text-sm text-gray-700 leading-relaxed">
                    <span className="text-amber-600 font-bold ml-1 text-xs">{verse.chapter}:{verse.verse}</span>
                    {verse.text}
                  </p>
                ))}
                <a href={reading.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-green-700 underline mt-2" onClick={event => event.stopPropagation()}>
                  مصدر النص في St-Takla <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            {isExpanded && (reading.status !== 'ok' || reading.verses.length === 0) && (
              <div className="px-4 pb-3 pt-2 bg-amber-50 border-t border-amber-100 text-xs text-orange-700 text-center">
                النص غير متاح من St-Takla لهذا الرابط حاليًا.
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function LegacyDailyLectionarySection() {
  const [date, setDate] = useState(() => new Date());
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [readingTexts, setReadingTexts] = useState<Record<string, { chapter: number; verse: number; text: string }[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const { reading, copticDate, exact: readingIsForToday, actualFor } = getLectionaryForDate(date);

  const readingCards: { key: string; label: string; icon: string; ref: ReadingRef }[] = [
    { key: 'pauline',  label: 'رسالة بولس',   icon: '✉️', ref: reading.pauline },
    { key: 'catholic', label: 'الكاثوليكون',   icon: '📖', ref: reading.catholic },
    { key: 'praxis',   label: 'الإبركسيس',    icon: '📜', ref: reading.praxis },
    { key: 'psalm',    label: 'المزمور',       icon: '🎵', ref: reading.psalm },
    { key: 'gospel',   label: 'الإنجيل',      icon: '✝️', ref: reading.gospel },
  ];

  const formatDateAr = (d: Date) =>
    d.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  async function loadText(key: string, ref: ReadingRef) {
    if (readingTexts[key]) {
      setExpandedKey(prev => (prev === key ? null : key));
      return;
    }
    setLoadingKey(key);
    setExpandedKey(key);
    try {
      const params = new URLSearchParams({
        bookName: ref.book,
        fromCh: String(ref.fromCh),
        fromVs: String(ref.fromVs),
        toCh: String(ref.toCh),
        toVs: String(ref.toVs),
      });
      const res = await fetch(`/api/reading-text?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReadingTexts(prev => ({ ...prev, [key]: data.verses ?? [] }));
      }
    } finally {
      setLoadingKey(null);
    }
  }

  function prevDay() {
    setDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return nd; });
    setExpandedKey(null);
    setReadingTexts({});
  }
  function nextDay() {
    setDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return nd; });
    setExpandedKey(null);
    setReadingTexts({});
  }

  return (
    <div className="space-y-4" dir="rtl">
      {/* Date header */}
      <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-3">
        <Button variant="ghost" size="sm" onClick={prevDay} className="text-amber-700">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <div className="text-center">
          <div className="text-lg font-bold text-amber-900">{copticDate}</div>
          <div className="text-xs text-amber-600">{formatDateAr(date)}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={nextDay} className="text-amber-700">
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* ── تنبيه: دي مش قراءات اليوم ──────────────────────────────────────
          القطمارس عندنا ١٠٢ يوم من ٣٦٦. قبل كده كانت قراءات أقرب يوم سابق
          بتتعرض **بعنوان تاريخ النهارده** من غير أي تنبيه — وده بيدّي
          معلومة غلط بثقة لحد بيحضّر قراءات القداس. */}
      {!readingIsForToday && (
        <div className="rounded-xl border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/30 p-4">
          <div className="font-bold text-orange-800 dark:text-orange-300 mb-1">
            ⚠️ قراءات {copticDate} مش متسجّلة عندنا
          </div>
          <p className="text-sm text-orange-700 dark:text-orange-400 leading-7">
            {actualFor
              ? <>اللي تحت ده قراءات <strong>{actualFor}</strong> — معروض للاطّلاع بس.
                  <strong> ماتعتمدش عليه كقراءات النهارده</strong>، راجع القطمارس المطبوع.</>
              : <>اللي تحت قراءات عامة مش مرتبطة باليوم. راجع القطمارس المطبوع.</>}
          </p>
        </div>
      )}

      {/* Reading cards */}
      {readingCards.map(({ key, label, icon, ref }) => {
        const isExpanded = expandedKey === key;
        const isLoading = loadingKey === key;
        const verses = readingTexts[key] ?? [];

        return (
          <Card
            key={key}
            className="overflow-hidden border border-amber-100 shadow-sm cursor-pointer"
            onClick={() => loadText(key, ref)}
          >
            <div className="flex items-center justify-between p-3 bg-white">
              <div className="flex items-center gap-2">
                <span className="text-lg">{icon}</span>
                <div>
                  <div className="text-xs text-amber-600 font-medium">{label}</div>
                  <div className="text-sm font-semibold text-gray-800">{ref.label}</div>
                </div>
              </div>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
              ) : (
                isExpanded ? <ChevronUp className="w-4 h-4 text-amber-500" /> : <ChevronDown className="w-4 h-4 text-amber-400" />
              )}
            </div>
            {isExpanded && verses.length > 0 && (
              <div className="px-4 pb-4 pt-1 bg-amber-50 border-t border-amber-100 space-y-1 max-h-72 overflow-y-auto">
                {verses.map((v, i) => (
                  <p key={i} className="text-sm text-gray-700 leading-relaxed">
                    <span className="text-amber-600 font-bold ml-1 text-xs">{v.chapter}:{v.verse}</span>
                    {v.text}
                  </p>
                ))}
              </div>
            )}
            {isExpanded && !isLoading && verses.length === 0 && (
              <div className="px-4 pb-3 pt-1 bg-amber-50 border-t border-amber-100 text-xs text-gray-400 text-center">
                النص غير متاح
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function KatamarosSection() {
  const [selectedSeason, setSelectedSeason] = useState<KatamerosSeason | null>(null);
  const [selectedDay, setSelectedDay] = useState<KatamerosDay | null>(null);
  const [expandedReadings, setExpandedReadings] = useState<Set<string>>(new Set());

  const toggleReading = (label: string) => {
    setExpandedReadings(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const openSeason = (season: KatamerosSeason) => {
    setSelectedSeason(season);
    setSelectedDay(null);
    setExpandedReadings(new Set());
  };

  const openDay = (day: KatamerosDay) => {
    setSelectedDay(day);
    setExpandedReadings(new Set());
  };

  // ── شاشة قراءات يوم معين ─────────────────────────────────────────────────
  if (selectedDay && selectedSeason) {
    return (
      <div dir="rtl">
        {/* شريط التنقل */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap text-xs">
          <button onClick={() => { setSelectedSeason(null); setSelectedDay(null); }} className="text-muted-foreground hover:text-foreground transition-colors">
            القطمارس
          </button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => setSelectedDay(null)} className="text-muted-foreground hover:text-foreground transition-colors">
            {selectedSeason.arabicName}
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{selectedDay.name}</span>
        </div>

        {/* رأس اليوم */}
        <div className={`rounded-xl p-4 mb-4 ${selectedSeason.colorBg} border ${selectedSeason.colorBorder}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{selectedSeason.icon}</span>
            <div>
              <h2 className="font-display font-bold text-foreground text-base">{selectedDay.name}</h2>
              <Badge variant="outline" className={`text-xs mt-1 ${selectedSeason.colorText} border-current`}>
                {selectedDay.season}
              </Badge>
            </div>
          </div>
        </div>

        {/* القراءات */}
        <div className="space-y-2 mb-5">
          {selectedDay.readings.map((reading, i) => (
            <motion.div key={reading.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card
                className={`overflow-hidden border cursor-pointer hover:shadow-sm transition-shadow ${
                  expandedReadings.has(reading.label)
                    ? `${selectedSeason.colorBorder} ${selectedSeason.colorBg}`
                    : 'border-border/60'
                }`}
                onClick={() => toggleReading(reading.label)}
                data-testid={`katameros-reading-${reading.label}`}
              >
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedSeason.colorBg} ${selectedSeason.colorText}`}>
                      {reading.label}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">{reading.reference}</span>
                  </div>
                  {expandedReadings.has(reading.label)
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </div>
                <AnimatePresence>
                  {expandedReadings.has(reading.label) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 border-t border-border/30">
                        <p className="text-xs text-muted-foreground mt-2 mb-3 font-medium">{reading.reference}</p>
                        <p className="text-base leading-loose text-foreground whitespace-pre-line font-arabic">
                          {reading.text}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* زر "افتح الكل" */}
        <div className="flex gap-2 mb-4">
          <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => {
            const all = new Set(selectedDay.readings.map(r => r.label));
            setExpandedReadings(all);
          }}>
            افتح جميع القراءات
          </Button>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setExpandedReadings(new Set())}>
            طيّ الكل
          </Button>
        </div>

        {/* تنقل بين الأيام */}
        <div className="border-t border-border/30 pt-3">
          <p className="text-xs text-muted-foreground mb-2">أيام {selectedSeason.arabicName}:</p>
          <div className="flex gap-2 flex-wrap">
            {selectedSeason.days.map(day => (
              <button
                key={day.id}
                onClick={() => openDay(day)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                  day.id === selectedDay.id
                    ? `${selectedSeason.colorBg} ${selectedSeason.colorText} border-current font-bold`
                    : 'border-border text-muted-foreground hover:border-foreground/40'
                }`}
              >
                {day.name.split('—')[0].trim()}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground opacity-60 mt-3">
            📖 النصوص من الكتاب المقدس العربي (ترجمة فاندايك 1865م — ملك عام) • ترتيب القراءات: القطمارس القبطي الأرثوذكسي
          </p>
        </div>
      </div>
    );
  }

  // ── شاشة أيام موسم معين ──────────────────────────────────────────────────
  if (selectedSeason) {
    return (
      <div dir="rtl">
        {/* شريط التنقل */}
        <div className="flex items-center gap-1.5 mb-4 text-xs">
          <button onClick={() => setSelectedSeason(null)} className="text-muted-foreground hover:text-foreground transition-colors">
            القطمارس
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">{selectedSeason.arabicName}</span>
        </div>

        {/* رأس الموسم */}
        <div className={`rounded-xl p-4 mb-5 ${selectedSeason.colorBg} border ${selectedSeason.colorBorder}`}>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">{selectedSeason.icon}</span>
            <div>
              <h2 className="font-display font-bold text-foreground text-lg">{selectedSeason.arabicName}</h2>
              <Badge variant="outline" className={`text-xs mt-1 ${selectedSeason.colorText} border-current`}>
                {selectedSeason.days.length} يوم / أحد
              </Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{selectedSeason.description}</p>
        </div>

        {/* قائمة الأيام */}
        <div className="space-y-2 mb-4">
          {selectedSeason.days.map((day, i) => (
            <motion.div key={day.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <Card
                className={`border ${selectedSeason.colorBorder} cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => openDay(day)}
                data-testid={`katameros-day-${day.id}`}
              >
                <div className={`p-4 ${selectedSeason.colorBg} flex items-center justify-between gap-3`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${selectedSeason.colorBg}`}>
                      {selectedSeason.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display font-bold text-foreground text-lg">{day.name}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {day.readings.map(r => r.label).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 -rotate-90" />
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card className="p-3 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            📖 النصوص من الكتاب المقدس العربي (ترجمة فاندايك 1865م — ملك عام) • الترتيب الطقسي: القطمارس القبطي الأرثوذكسي
          </p>
        </Card>
      </div>
    );
  }

  // ── الشاشة الرئيسية — اختيار الموسم ─────────────────────────────────────
  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <Calendar className="w-5 h-5 text-green-500" />
        <h2 className="font-display text-xl font-bold text-foreground">القطمارس القبطي الأرثوذكسي</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        القراءات الطقسية اليومية مُحمَّلة مباشرةً — إنجيل ورسائل ومزامير وأعمال لكل يوم في المواسم الطقسية القبطية. النصوص من ترجمة فاندايك (1865م — ملك عام).
      </p>

      <div className="space-y-4 mb-5">
        {katameroSeasons.map((season, i) => (
          <motion.div key={season.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.09 }}>
            <Card
              className={`overflow-hidden border ${season.colorBorder} cursor-pointer hover:shadow-lg transition-all group`}
              onClick={() => openSeason(season)}
              data-testid={`katameros-season-${season.id}`}
            >
              <div className={`p-5 ${season.colorBg}`}>
                <div className="flex items-start gap-4">
                  <div className="text-4xl flex-shrink-0 group-hover:scale-110 transition-transform">
                    {season.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold text-foreground text-lg leading-snug">{season.arabicName}</h3>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${season.colorText} border-current`}>
                        {season.days.length} يوم / أحد
                      </Badge>
                      <Badge variant="outline" className="text-xs text-muted-foreground border-border">
                        5 قراءات / يوم
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-2">
                      {season.description}
                    </p>
                  </div>
                  <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0 -rotate-90 mt-1" />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
        <div className="flex items-start gap-2">
          <span className="text-base flex-shrink-0">📖</span>
          <div>
            <p className="text-xs font-bold text-green-800 dark:text-green-200 mb-1">مصدر النصوص</p>
            <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">
              جميع القراءات من الكتاب المقدس العربي — ترجمة فاندايك 1865م (ملك عام) — مُحمَّلة مباشرةً على موقعنا. ترتيب القراءات وفق القطمارس القبطي الأرثوذكسي — التراث الطقسي الكنسي القبطي.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SaintsVideosSection() {
  const [selectedSaint, setSelectedSaint] = useState<Saint | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<string>('الكل');
  const [selectedVideo, setSelectedVideo] = useState<SaintVideo | null>(null);
  const [activeVideoCategory, setActiveVideoCategory] = useState<string>('الكل');

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openSaint = (saint: Saint) => {
    setSelectedSaint(saint);
    setExpandedSections(new Set());
  };

  const filteredSaints = categoryFilter === 'الكل'
    ? saintsData
    : saintsData.filter(s => s.category === categoryFilter);

  const videoCategories = ['الكل', 'شهداء', 'رسل', 'شهيدات', 'آباء', 'رهبان'];
  const filteredVideos = activeVideoCategory === 'الكل'
    ? saintsVideos
    : saintsVideos.filter(v => v.category === activeVideoCategory);

  // ── قارئ سيرة القديس المختار ─────────────────────────────────────────────
  if (selectedSaint) {
    return (
      <div dir="rtl">
        {/* شريط التنقل */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => setSelectedSaint(null)} className="gap-1 text-xs h-7">
            <ChevronDown className="w-3 h-3 rotate-90" />
            سير القديسين
          </Button>
          <span className="text-muted-foreground text-xs">/</span>
          <span className="text-xs font-medium">{selectedSaint.name}</span>
        </div>

        {/* رأس القديس */}
        <div className={`rounded-xl p-4 mb-4 ${selectedSaint.colorBg} border ${selectedSaint.colorBorder}`}>
          <div className="flex items-start gap-3">
            <div className="w-14 h-14 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center text-3xl flex-shrink-0">
              {selectedSaint.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-foreground text-base leading-snug">{selectedSaint.name}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant="outline" className={`text-xs ${selectedSaint.colorText} border-current`}>
                  {selectedSaint.category}
                </Badge>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  🕊️ {selectedSaint.feastDay}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{selectedSaint.shortBio}</p>
            </div>
          </div>
        </div>

        {/* أقسام السيرة */}
        <div className="space-y-2 mb-5">
          {selectedSaint.sections.map((section, i) => (
            <motion.div key={section.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Card
                className="overflow-hidden cursor-pointer hover:shadow-sm transition-shadow border border-border/60"
                onClick={() => toggleSection(section.id)}
                data-testid={`saint-section-${section.id}`}
              >
                <div className="flex items-center justify-between gap-3 p-3">
                  <p className="text-base font-bold text-foreground">{section.title}</p>
                  {expandedSections.has(section.id)
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </div>
                <AnimatePresence>
                  {expandedSections.has(section.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 border-t border-border/40">
                        <p className="text-base leading-loose text-foreground whitespace-pre-line mt-3">
                          {section.text}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* تنقل سريع بين القديسين */}
        <div className="border-t border-border/30 pt-3 mb-4">
          <p className="text-xs text-muted-foreground mb-2">قديسون آخرون:</p>
          <div className="flex gap-2 flex-wrap">
            {saintsData.map(s => (
              <button
                key={s.id}
                onClick={() => openSaint(s)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  s.id === selectedSaint.id
                    ? `${selectedSaint.colorBg} ${selectedSaint.colorText} border-current font-bold`
                    : 'border-border text-muted-foreground hover:border-foreground/40'
                }`}
              >
                {s.icon} {s.name.split(' ').slice(-2).join(' ')}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground opacity-60 mt-3">
            📖 سير ومعلومات مضمّنة للقراءة — يُرجى الرجوع إلى المصدر الكنسي عند التحقق
          </p>
        </div>
      </div>
    );
  }

  // ── القائمة الرئيسية ───────────────────────────────────────────────────────
  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <Cross className="w-5 h-5 text-indigo-500" />
        <h2 className="font-display text-xl font-bold text-foreground">سير القديسين والشهداء الأقباط</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        سير القديسين والشهداء الأقباط مضمّنة للقراءة داخل الموقع — محتوى تعليمي مستقى من التراث الكنسي.
      </p>

      {/* ── قسم السير المدمجة ── */}
      <div className="mb-6">
        <h3 className="font-display font-bold text-foreground text-base mb-3 flex items-center gap-2">
          <span>✝️</span> اقرأ سيرة القديس مباشرةً
        </h3>

        {/* فلتر الفئة */}
        <div className="flex gap-2 flex-wrap mb-4">
          {saintCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                categoryFilter === cat
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-300 font-bold'
                  : 'border-border text-muted-foreground hover:border-foreground/40'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filteredSaints.map((saint, i) => (
            <motion.div key={saint.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <Card
                className={`overflow-hidden border ${saint.colorBorder} cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => openSaint(saint)}
                data-testid={`saint-card-${saint.id}`}
              >
                <div className={`p-4 ${saint.colorBg}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center text-2xl flex-shrink-0">
                      {saint.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-display font-bold text-foreground text-lg leading-snug">{saint.name}</h4>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className={`text-xs ${saint.colorText} border-current`}>
                          {saint.category}
                        </Badge>
                        <span className="text-sm text-muted-foreground">🕊️ {saint.feastDay}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                        {saint.shortBio}
                      </p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800">
          <div className="flex items-start gap-2">
            <span className="text-base">📖</span>
            <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
              السير المعروضة مادة تعليمية مضمّنة وليست إصدارًا نقديًا أو حكمًا قانونيًا على مصدر النصوص وحقوق ترجمتها.
            </p>
          </div>
        </Card>
      </div>

      {/* ── فيديوهات سير القديسين ── */}
      <div>
        <h3 className="font-display font-bold text-foreground text-base mb-3 flex items-center gap-2">
          <span>🎬</span> فيديوهات سير القديسين والشهداء
        </h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {videoCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveVideoCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                activeVideoCategory === cat
                  ? 'bg-indigo-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
              data-testid={`video-category-${cat}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {filteredVideos.map((video, i) => (
            <motion.div
              key={video.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Card
                className="overflow-hidden cursor-pointer hover:shadow-lg transition-all group"
                onClick={() => setSelectedVideo(video)}
                data-testid={`saint-video-${video.id}`}
              >
                <div className="relative h-36 overflow-hidden bg-gray-100 dark:bg-gray-800">
                  <img
                    src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
                    alt={video.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-5 h-5 text-indigo-600 ml-0.5" />
                    </div>
                  </div>
                  <Badge className="absolute top-2 right-2 text-xs bg-indigo-600 text-white border-0">
                    {video.category}
                  </Badge>
                </div>
                <div className="p-3">
                  <h4 className="font-display font-semibold text-foreground text-sm leading-snug mb-1">
                    {video.title}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">{video.description}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>

      {selectedVideo && (
        <YouTubeEmbed
          videoId={selectedVideo.youtubeId}
          title={selectedVideo.title}
          onClose={() => setSelectedVideo(null)}
        />
      )}
    </div>
  );
}

const colorMap: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20',  border: 'border-amber-200 dark:border-amber-800',  badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', text: 'text-amber-700 dark:text-amber-300' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300', text: 'text-orange-700 dark:text-orange-300' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300', text: 'text-purple-700 dark:text-purple-300' },
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',    border: 'border-blue-200 dark:border-blue-800',    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',    text: 'text-blue-700 dark:text-blue-300' },
};

function DeaconResponsesSection() {
  const [expandedSection, setExpandedSection] = useState<string | null>('general');

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-4">
        <Mic2 className="w-5 h-5 text-teal-500" />
        <h2 className="font-display text-xl font-bold text-foreground">مردات الشماس</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        المردات هي الردود الطقسية التي يُرددها الشماس والشعب أثناء الصلوات والقداس الإلهي. تُشكّل جوهر المشاركة الجماعية في الطقس القبطي الأرثوذكسي.
      </p>

      <div className="space-y-4 mb-6">
        {deaconSections.map((section, si) => {
          const c = colorMap[section.color] ?? colorMap['amber'];
          const isOpen = expandedSection === section.id;
          return (
            <motion.div
              key={section.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: si * 0.08 }}
            >
              <Card
                className={`overflow-hidden border ${c.border} cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => setExpandedSection(isOpen ? null : section.id)}
                data-testid={`deacon-section-${section.id}`}
              >
                <div className={`p-4 ${c.bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{section.icon}</span>
                      <div>
                        <h3 className="font-display font-bold text-foreground text-lg">{section.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{section.responses.length} مردة</p>
                      </div>
                    </div>
                    {isOpen
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    }
                  </div>
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 pt-0 border-t border-border/40">
                        <p className="text-base text-muted-foreground mt-3 mb-4">{section.description}</p>
                        <div className="space-y-4">
                          {section.responses.map((resp, ri) => (
                            <motion.div
                              key={ri}
                              initial={{ opacity: 0, x: 12 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: ri * 0.05 }}
                              className="rounded-xl border border-border/60 p-4 bg-background"
                              data-testid={`deacon-response-${section.id}-${ri}`}
                            >
                              <div className="flex items-start gap-3">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${c.badge}`}>
                                  {ri + 1}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-display text-lg font-bold text-foreground leading-tight mb-1">
                                    {resp.arabic}
                                  </p>
                                  {resp.copticArabic && (
                                    <p className={`text-sm font-medium mb-1 leading-relaxed ${c.text} opacity-80`}>
                                      {resp.copticArabic}
                                    </p>
                                  )}
                                  {resp.coptic && (
                                    <p className="text-base font-mono text-muted-foreground mb-1 leading-relaxed break-all">
                                      {resp.coptic}
                                    </p>
                                  )}
                                  <Badge variant="outline" className={`text-xs mb-2 ${c.text} border-current`}>
                                    {resp.meaning}
                                  </Badge>
                                  <p className="text-sm text-muted-foreground leading-relaxed">
                                    {resp.usage}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                        <div className="mt-3 pt-3 border-t border-border/30">
                          <span className="text-xs text-muted-foreground opacity-70">
                            🔓 تراث طقسي قبطي أرثوذكسي — مُحمَّل مباشرةً على الموقع
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <Card className="p-4 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800">
        <div className="flex items-start gap-2">
          <span className="text-lg">🔓</span>
          <div>
            <p className="text-sm font-bold text-teal-800 dark:text-teal-200 mb-1">تراث طقسي أصيل — مُحمَّل مباشرةً على موقعنا</p>
            <p className="text-xs text-teal-700 dark:text-teal-300 leading-relaxed">
              جميع المردات المعروضة نصوص طقسية قبطية أرثوذكسية تراثية قديمة متاحة للقراءة والحفظ دون أي روابط خارجية.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── قسم العقيدة ───────────────────────────────────────────────────────────────
function CreedSection() {
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [showCreed, setShowCreed] = useState(false);

  const filtered = activeCategory === 'الكل'
    ? creedTopics
    : creedTopics.filter(t => t.category === activeCategory);

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <BookMarked className="w-5 h-5 text-amber-600" />
        <h2 className="font-display text-xl font-bold text-foreground">العقيدة واللاهوت الأرثوذكسي</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        عقائد الكنيسة القبطية الأرثوذكسية — من الإيمان بالثالوث حتى الأخرويات، مستمدةً من الكتاب المقدس وتعاليم آباء الكنيسة.
      </p>

      {/* قانون الإيمان النيقاوي */}
      <Card
        className="mb-5 overflow-hidden border-amber-200 dark:border-amber-800 cursor-pointer"
        onClick={() => setShowCreed(!showCreed)}
        data-testid="creed-nicene-toggle"
      >
        <div className="p-4 bg-gradient-to-l from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📜</span>
              <div>
                <h3 className="font-display font-bold text-foreground text-lg">قانون الإيمان النيقاوي</h3>
                <p className="text-sm text-muted-foreground">صِيغ في مجمع نيقية 325م — يُتلى في كل قداس إلهي</p>
              </div>
            </div>
            {showCreed ? <ChevronUp className="w-4 h-4 text-amber-600" /> : <ChevronDown className="w-4 h-4 text-amber-600" />}
          </div>
        </div>
        <AnimatePresence>
          {showCreed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="p-5 border-t border-amber-100 dark:border-amber-800">
                {niceneCreed.split('\n\n').map((para, i) => (
                  <p key={i} className="text-base text-foreground leading-loose mb-3 font-display">
                    {para}
                  </p>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* التصنيفات */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {creedCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-amber-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            data-testid={`creed-cat-${cat}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* موضوعات العقيدة */}
      <div className="space-y-3">
        {filtered.map((topic, i) => (
          <motion.div
            key={topic.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card
              className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedTopic(expandedTopic === topic.id ? null : topic.id)}
              data-testid={`creed-topic-${topic.id}`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="text-2xl flex-shrink-0">{topic.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-display font-bold text-foreground text-lg">{topic.title}</h3>
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">{topic.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{topic.summary}</p>
                    </div>
                  </div>
                  {expandedTopic === topic.id
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  }
                </div>
                <AnimatePresence>
                  {expandedTopic === topic.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t border-border/40 space-y-3">
                        {topic.content.map((para, pi) => (
                          <p key={pi} className="text-base text-foreground leading-relaxed">
                            {para}
                          </p>
                        ))}
                        {topic.tags && (
                          <div className="flex flex-wrap gap-1.5 pt-2">
                            {topic.tags.map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── قسم التاريخ ───────────────────────────────────────────────────────────────
const historyColorMap: Record<string, { bg: string; badge: string; border: string; dot: string }> = {
  amber:  { bg: 'bg-amber-50 dark:bg-amber-900/20', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  red:    { bg: 'bg-red-50 dark:bg-red-900/20', badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', border: 'border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300', border: 'border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
  green:  { bg: 'bg-green-50 dark:bg-green-900/20', badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', border: 'border-green-200 dark:border-green-800', dot: 'bg-green-500' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800', dot: 'bg-purple-500' },
};

function HistorySection() {
  const [expandedEra, setExpandedEra] = useState<string | null>('founding');

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <History className="w-5 h-5 text-blue-600" />
        <h2 className="font-display text-xl font-bold text-foreground">تاريخ الكنيسة القبطية الأرثوذكسية</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        الكنيسة القبطية أسسها القديس مرقس الرسول حوالي 48م — وعمرها الآن أكثر من تسعة عشر قرناً من الزمان.
      </p>

      <div className="space-y-3">
        {historyEras.map((era, i) => {
          const c = historyColorMap[era.color] ?? historyColorMap['amber'];
          const isOpen = expandedEra === era.id;
          return (
            <motion.div
              key={era.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Card
                className={`overflow-hidden border ${c.border} cursor-pointer hover:shadow-md transition-shadow`}
                onClick={() => setExpandedEra(isOpen ? null : era.id)}
                data-testid={`history-era-${era.id}`}
              >
                <div className={`p-4 ${c.bg}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{era.icon}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-display font-bold text-foreground text-lg">{era.era}</h3>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.badge}`}>{era.period}</span>
                        </div>
                        <p className="text-sm text-foreground/80 font-medium mt-0.5">{era.summary}</p>
                      </div>
                    </div>
                    {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </div>
                </div>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="p-4 border-t border-border/30">
                        <p className="text-base text-foreground/90 font-medium mb-3 leading-relaxed">{era.summary}</p>
                        <h4 className="text-sm font-bold text-foreground mb-2 uppercase tracking-wide">أبرز الأحداث</h4>
                        <ul className="space-y-2">
                          {era.events.map((ev, ei) => (
                            <li key={ei} className="flex items-start gap-2.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${c.dot} flex-shrink-0 mt-1.5`} />
                              <span className="text-base text-foreground leading-relaxed">{ev}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}

// ── قسم الأسئلة والأجوبة ─────────────────────────────────────────────────────
function QASection() {
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedQ, setExpandedQ] = useState<string | null>(null);

  const filtered = creedQA
    .filter(q => activeCategory === 'الكل' || q.category === activeCategory)
    .filter(q =>
      !searchQuery ||
      q.question.includes(searchQuery) ||
      q.answer.includes(searchQuery)
    );

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <HelpCircle className="w-5 h-5 text-violet-600" />
        <h2 className="font-display text-xl font-bold text-foreground">أسئلة وأجوبة في الإيمان والعقيدة</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        إجابات على أبرز الأسئلة العقائدية عن الكنيسة القبطية الأرثوذكسية — من الهوية حتى المقارنة مع المذاهب الأخرى.
      </p>

      <div className="relative mb-3">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="ابحث في الأسئلة..."
          className="pr-9 text-sm"
          data-testid="qa-search"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {qaCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-violet-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            data-testid={`qa-cat-${cat}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">لا توجد نتائج لبحثك</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Card
                className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setExpandedQ(expandedQ === item.id ? null : item.id)}
                data-testid={`qa-item-${item.id}`}
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-violet-500 font-bold text-lg leading-none flex-shrink-0">س</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-semibold text-foreground text-lg md:text-xl leading-snug">{item.question}</p>
                      <Badge variant="outline" className="text-xs mt-1 text-violet-600 border-violet-300">{item.category}</Badge>
                    </div>
                    {expandedQ === item.id
                      ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    }
                  </div>
                  <AnimatePresence>
                    {expandedQ === item.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 pt-3 border-t border-border/40">
                          <div className="flex items-start gap-3">
                            <span className="text-emerald-500 font-bold text-lg leading-none flex-shrink-0">ج</span>
                            <p className="text-base text-foreground leading-relaxed">{item.answer}</p>
                          </div>
                          {item.source && (
                            <p className="text-xs text-muted-foreground mt-2 mr-6">— {item.source}</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

    </div>
  );
}

// ── قسم الشخصيات ──────────────────────────────────────────────────────────────
function FiguresSection() {
  const [activeCategory, setActiveCategory] = useState('الكل');
  const [expandedFigure, setExpandedFigure] = useState<string | null>(null);

  const filtered = activeCategory === 'الكل'
    ? churchFigures
    : churchFigures.filter(f => f.category === activeCategory);

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-5 h-5 text-rose-600" />
        <h2 className="font-display text-xl font-bold text-foreground">شخصيات الكنيسة القبطية</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        أبرز الشخصيات التي شكّلت تاريخ الكنيسة القبطية — من الرسل والآباء حتى بابوات العصر الحديث.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {figureCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-rose-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            data-testid={`figure-cat-${cat}`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((figure, i) => (
          <motion.div
            key={figure.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card
              className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setExpandedFigure(expandedFigure === figure.id ? null : figure.id)}
              data-testid={`figure-${figure.id}`}
            >
              <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-lg">{figure.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-foreground text-lg">{figure.name}</h3>
                        <Badge variant="outline" className="text-xs text-rose-600 border-rose-300">{figure.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">{figure.title}</p>
                      <p className="text-sm text-rose-600 dark:text-rose-400">{figure.period}</p>
                    </div>
                  </div>
                  {expandedFigure === figure.id
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  }
                </div>
                <AnimatePresence>
                  {expandedFigure === figure.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                        <p className="text-base text-foreground leading-relaxed">{figure.description}</p>
                        <div className="mt-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20">
                          <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 mb-1">الإرث والأثر</p>
                          <p className="text-sm text-foreground leading-relaxed">{figure.legacy}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

    </div>
  );
}

// ── تفاسير الكتاب المقدس ─────────────────────────────────────────────────────
function BibleCommentarySection() {
  const [selectedFather, setSelectedFather] = useState<CommentaryFather | null>(null);
  const [selectedBook, setSelectedBook] = useState<CommentaryBook | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [testamentFilter, setTestamentFilter] = useState<'all' | 'old' | 'new'>('all');

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openFather = (father: CommentaryFather) => {
    setSelectedFather(father);
    setSelectedBook(father.books[0] ?? null);
    setExpandedSections(new Set());
  };

  const openBook = (book: CommentaryBook) => {
    setSelectedBook(book);
    setExpandedSections(new Set());
  };

  const filteredFathers = testamentFilter === 'all'
    ? commentaryFathers
    : commentaryFathers.filter(f =>
        f.books.some(b => testamentFilter === 'old' ? b.testament === 'old' : b.testament === 'new')
      );

  // ── قارئ الكتاب المختار ─────────────────────────────────────────────────
  if (selectedFather && selectedBook) {
    return (
      <div dir="rtl">
        {/* شريط التنقل */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => { setSelectedFather(null); setSelectedBook(null); }} className="gap-1 text-xs h-7">
            <ChevronDown className="w-3 h-3 rotate-90" />
            التفاسير
          </Button>
          <span className="text-muted-foreground text-xs">/</span>
          <Button size="sm" variant="ghost" onClick={() => setSelectedBook(selectedFather.books[0])} className="text-xs h-7">
            {selectedFather.name.split(' ').slice(-2).join(' ')}
          </Button>
          <span className="text-muted-foreground text-xs">/</span>
          <span className="text-xs font-medium">{selectedBook.bibleBook}</span>
        </div>

        {/* رأس الأب */}
        <div className={`rounded-xl p-4 mb-4 ${selectedFather.colorBg} border ${selectedFather.colorBorder}`}>
          <div className="flex items-start gap-3">
            <span className="text-3xl flex-shrink-0">{selectedFather.icon}</span>
            <div className="flex-1">
              <h2 className="font-display font-bold text-foreground text-base">{selectedFather.name}</h2>
              <p className="text-xs text-muted-foreground">{selectedFather.fullTitle}</p>
              <Badge variant="outline" className={`text-xs mt-1.5 ${selectedFather.colorText} border-current`}>
                {selectedFather.century}
              </Badge>
            </div>
          </div>
        </div>

        {/* اختيار الكتاب */}
        {selectedFather.books.length > 1 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {selectedFather.books.map(b => (
              <button
                key={b.id}
                onClick={() => openBook(b)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  b.id === selectedBook.id
                    ? `${selectedFather.colorBg} ${selectedFather.colorText} border-current font-bold`
                    : 'border-border text-muted-foreground hover:border-foreground/40'
                }`}
              >
                {b.bibleBook}
              </button>
            ))}
          </div>
        )}

        {/* أقسام التفسير */}
        <div className="space-y-2 mb-5">
          {selectedBook.sections.map((section, i) => (
            <motion.div key={section.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card
                className="overflow-hidden cursor-pointer hover:shadow-sm transition-shadow border border-border/60"
                onClick={() => toggleSection(section.id)}
                data-testid={`commentary-section-${section.id}`}
              >
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-foreground">{section.title}</p>
                    {section.verses && (
                      <p className="text-xs text-muted-foreground mt-0.5">📖 {section.verses}</p>
                    )}
                  </div>
                  {expandedSections.has(section.id)
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                </div>
                <AnimatePresence>
                  {expandedSections.has(section.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 pt-0 border-t border-border/40">
                        <p className="text-base leading-loose text-foreground whitespace-pre-line mt-3">
                          {section.text}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* تنقل سريع بين الآباء */}
        <div className="border-t border-border/30 pt-3">
          <p className="text-xs text-muted-foreground mb-2">آباء آخرون:</p>
          <div className="flex gap-2 flex-wrap">
            {commentaryFathers.map(f => (
              <button
                key={f.id}
                onClick={() => openFather(f)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  f.id === selectedFather.id
                    ? `${selectedFather.colorBg} ${selectedFather.colorText} border-current font-bold`
                    : 'border-border text-muted-foreground hover:border-foreground/40'
                }`}
              >
                {f.icon} {f.name.split(' ').slice(-2).join(' ')}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground opacity-60 mt-3">
             🔓 مادة آبائية تعليمية مضمّنة — تحتاج مراجعة المصدر والترجمة
          </p>
        </div>
      </div>
    );
  }

  // ── القائمة الرئيسية ────────────────────────────────────────────────────
  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="w-5 h-5 text-amber-500" />
        <h2 className="font-display text-xl font-bold text-foreground">تفاسير آباء الكنيسة</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
         مواد تعليمية عربية منسوبة إلى آباء الكنيسة في القرون الأولى — مضمّنة للقراءة، وليست بديلًا عن النصوص المحققة أو الترجمات المنشورة.
      </p>

      {/* فلتر العهد */}
      <div className="flex gap-2 mb-4">
        {([['all', 'الكل'], ['old', 'العهد القديم'], ['new', 'العهد الجديد']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTestamentFilter(val)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              testamentFilter === val
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 font-bold'
                : 'border-border text-muted-foreground hover:border-foreground/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3 mb-5">
        {filteredFathers.map((father, i) => (
          <motion.div key={father.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <Card
              className={`overflow-hidden border ${father.colorBorder} cursor-pointer hover:shadow-md transition-shadow`}
              onClick={() => openFather(father)}
              data-testid={`commentator-${father.id}`}
            >
              <div className={`p-4 ${father.colorBg}`}>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/60 dark:bg-black/20 flex items-center justify-center text-2xl flex-shrink-0">
                    {father.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-bold text-foreground text-lg">{father.name}</h3>
                    <p className="text-sm text-muted-foreground">{father.fullTitle}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <Badge variant="outline" className={`text-xs ${father.colorText} border-current`}>
                        {father.century}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                        {father.books.length} كتاب مُدمج
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2">{father.bio}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {father.books.map(b => (
                        <span key={b.id} className="text-xs bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-full text-foreground/70">
                          {b.bibleBook}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-2">
          <span className="text-lg">🔓</span>
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200 mb-1">محتوى آبائي تعليمي مضمّن</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              ملخصات ومواد تعليمية منسوبة إلى آباء الكنيسة الكبار، متاحة للقراءة داخل الموقع. لا نعرضها هنا بوصفها نصوصًا كاملة أو تحقيقًا نقديًا.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── المكتبة المدمجة — قارئ الكتب الأرثوذكسية ──────────────────────────────────
const COLOR_MAP: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  amber:   { bg: 'bg-amber-50 dark:bg-amber-900/20',   text: 'text-amber-700 dark:text-amber-300',   border: 'border-amber-200 dark:border-amber-800',   badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  indigo:  { bg: 'bg-indigo-50 dark:bg-indigo-900/20',  text: 'text-indigo-700 dark:text-indigo-300',  border: 'border-indigo-200 dark:border-indigo-800',  badge: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' },
  purple:  { bg: 'bg-purple-50 dark:bg-purple-900/20',  text: 'text-purple-700 dark:text-purple-300',  border: 'border-purple-200 dark:border-purple-800',  badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300' },
  teal:    { bg: 'bg-teal-50 dark:bg-teal-900/20',      text: 'text-teal-700 dark:text-teal-300',      border: 'border-teal-200 dark:border-teal-800',      badge: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300' },
};

function BookReaderSection() {
  const [categoryFilter, setCategoryFilter] = useState('الكل');
  const [selectedBook, setSelectedBook] = useState<OrthodoxBook | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<BookChapter | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const filteredBooks = categoryFilter === 'الكل'
    ? orthodoxBooks
    : orthodoxBooks.filter(b => b.category === categoryFilter);

  function openBook(book: OrthodoxBook) {
    setSelectedBook(book);
    setSelectedChapter(book.chapters[0] ?? null);
    setSearchQuery('');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  function openChapter(ch: BookChapter) {
    setSelectedChapter(ch);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  function goBack() {
    if (selectedChapter && selectedBook) {
      setSelectedChapter(null);
    } else {
      setSelectedBook(null);
      setSelectedChapter(null);
    }
  }

  const colors = selectedBook ? (COLOR_MAP[selectedBook.color] ?? COLOR_MAP.amber) : COLOR_MAP.amber;

  // ── شاشة القراءة ───────────────────────────────────────────────────────────
  if (selectedBook && selectedChapter) {
    const chIdx = selectedBook.chapters.findIndex(c => c.id === selectedChapter.id);
    const prevCh = chIdx > 0 ? selectedBook.chapters[chIdx - 1] : null;
    const nextCh = chIdx < selectedBook.chapters.length - 1 ? selectedBook.chapters[chIdx + 1] : null;

    const paragraphs = selectedChapter.content.split('\n').filter(p => p.trim() !== '');

    return (
      <div dir="rtl">
        {/* شريط العنوان */}
        <div className={`flex items-center gap-2 p-3 rounded-xl mb-3 ${colors.bg} ${colors.border} border`}>
          <button onClick={goBack} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="reader-back-chapter">
            <ChevronDown className="w-4 h-4 rotate-90" />
            {selectedBook.title}
          </button>
          <span className="text-muted-foreground">›</span>
          <span className={`text-xs font-bold ${colors.text} flex-1 truncate`}>{selectedChapter.title}</span>
        </div>

        {/* النص */}
        <div ref={contentRef}>
          <Card className={`p-5 border ${colors.border}`}>
            <h2 className="font-display text-lg font-bold text-foreground mb-4 leading-snug">{selectedChapter.title}</h2>
            <div className="space-y-4">
              {paragraphs.map((para, i) => (
                <p
                  key={i}
                  className={`text-base leading-9 text-foreground/90 ${
                    para.startsWith('**') && para.endsWith('**')
                      ? 'font-bold text-foreground'
                      : ''
                  }`}
                >
                  {para.startsWith('**') && para.endsWith('**')
                    ? para.slice(2, -2)
                    : para}
                </p>
              ))}
            </div>

            {/* معلومات الترخيص */}
            <div className={`mt-6 pt-4 border-t ${colors.border} text-center`}>
              <p className={`text-xs ${colors.text} opacity-70`}>
                📜 {selectedBook.license} — {selectedBook.author}
              </p>
            </div>
          </Card>
        </div>

        {/* التنقل بين الفصول */}
        <div className="flex items-center justify-between gap-2 mt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!prevCh}
            onClick={() => prevCh && openChapter(prevCh)}
            className="text-sm"
            data-testid="reader-prev-chapter"
          >
            <ChevronDown className="w-3.5 h-3.5 ml-1 rotate-90" />
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">{chIdx + 1} / {selectedBook.chapters.length}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!nextCh}
            onClick={() => nextCh && openChapter(nextCh)}
            className="text-sm"
            data-testid="reader-next-chapter"
          >
            التالي
            <ChevronDown className="w-3.5 h-3.5 mr-1 -rotate-90" />
          </Button>
        </div>
      </div>
    );
  }

  // ── قائمة فصول الكتاب ──────────────────────────────────────────────────────
  if (selectedBook) {
    return (
      <div dir="rtl">
        {/* رأس الكتاب */}
        <button onClick={goBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors" data-testid="reader-back-list">
          <ChevronDown className="w-4 h-4 rotate-90" />
          الرجوع للمكتبة
        </button>

        <div className={`rounded-xl p-4 mb-4 ${colors.bg} border ${colors.border}`}>
          <div className="flex items-start gap-3">
            <span className="text-4xl">{selectedBook.icon}</span>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl font-bold text-foreground">{selectedBook.title}</h2>
              <p className={`text-sm font-medium mt-0.5 ${colors.text}`}>{selectedBook.subtitle}</p>
              <p className="text-xs text-muted-foreground mt-1">{selectedBook.author} — {selectedBook.era}</p>
              <p className="text-xs text-foreground/70 mt-2 leading-relaxed">{selectedBook.description}</p>
              <div className="mt-2">
                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>
                  🔓 {selectedBook.license}
                </span>
              </div>
            </div>
          </div>
        </div>

        <h3 className="font-display font-bold text-foreground text-base mb-2">
          الفصول ({selectedBook.chapters.length})
        </h3>
        <div className="space-y-2">
          {selectedBook.chapters.map((ch, i) => (
            <motion.button
              key={ch.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => openChapter(ch)}
              className="w-full text-right"
              data-testid={`chapter-btn-${ch.id}`}
            >
              <Card className={`p-3 flex items-center gap-3 hover:shadow-md transition-all hover:${colors.bg} cursor-pointer`}>
                <span className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${colors.badge}`}>
                  {i + 1}
                </span>
                <span className="text-base text-foreground leading-snug text-right flex-1">{ch.title}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 flex-shrink-0" />
              </Card>
            </motion.button>
          ))}
        </div>
      </div>
    );
  }

  // ── قائمة الكتب (الصفحة الرئيسية) ─────────────────────────────────────────
  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 mb-2">
        <Library className="w-5 h-5 text-amber-600" />
        <h2 className="font-display text-xl font-bold text-foreground">المكتبة الأرثوذكسية المدمجة</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        نصوص أرثوذكسية قديمة في الملك العام — مُحمَّلة مباشرةً على موقعنا للقراءة دون الإنترنت أو روابط خارجية.
      </p>

      {/* فلتر التصنيفات */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {orthodoxBookCategoryList.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === cat
                ? 'bg-amber-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            data-testid={`book-filter-${cat}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* شبكة الكتب */}
      <div className="grid sm:grid-cols-2 gap-3 mb-5">
        {filteredBooks.map((book, i) => {
          const c = COLOR_MAP[book.color] ?? COLOR_MAP.amber;
          return (
            <motion.div
              key={book.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
            >
              <button
                onClick={() => openBook(book)}
                className="w-full text-right"
                data-testid={`open-book-${book.id}`}
              >
                <Card className={`p-4 h-full hover:shadow-lg transition-all cursor-pointer border ${c.border} hover:${c.bg}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl ${c.bg}`}>
                      {book.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-bold text-foreground text-lg leading-snug">{book.title}</h3>
                      <p className={`text-sm mt-0.5 font-medium ${c.text}`}>{book.era}</p>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed line-clamp-2">{book.description}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${c.badge}`}>{book.category}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                          🔓 مادة تراثية مضمّنة — الترجمة وحقوق النشر بحاجة إلى توثيق
                        </span>
                        <span className="text-xs text-muted-foreground">{book.chapters.length} فصل</span>
                      </div>
                    </div>
                    <BookOpen className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </Card>
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* تنبيه الملك العام */}
      <Card className="p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
        <div className="flex items-start gap-2">
          <span className="text-lg">🔓</span>
          <div>
            <p className="text-sm font-bold text-green-800 dark:text-green-200 mb-1">نصوص في الملك العام — مُحمَّلة على موقعنا</p>
            <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">
              جميع الكتب المعروضة نصوص مسيحية قديمة (القرن الأول — السابع الميلادي) في الملك العام.
              النصوص مضمّنة داخل الموقع للقراءة دون الاعتماد على روابط خارجية.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── خرائط الكتاب المقدس التفاعلية ────────────────────────────────────────────
const CATEGORY_ICONS: Record<string, string> = {
  'مدن': '🏛️',
  'جبال': '⛰️',
  'أنهار وبحار': '🌊',
  'مناطق': '🗺️',
};

const TESTAMENT_COLORS: Record<string, string> = {
  'قديم': '#6366f1',
  'جديد': '#10b981',
  'كلاهما': '#f59e0b',
};

function createColoredIcon(color: string, _category: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.27 0 0 6.27 0 14c0 9.33 14 22 14 22S28 23.33 28 14C28 6.27 21.73 0 14 0z" fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="7" fill="white" opacity="0.85"/>
  </svg>`;
  return L.divIcon({
    html: `<div style="width:28px;height:36px">${svg}</div>`,
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  });
}

function BibleMapsSection() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const [activeTestament, setActiveTestament] = useState<'الكل' | 'قديم' | 'جديد' | 'كلاهما'>('الكل');
  const [activeCategory, setActiveCategory] = useState<BibleLocationCategory>('الكل');
  const [selectedLocation, setSelectedLocation] = useState<BibleLocation | null>(null);
  const [locationCount, setLocationCount] = useState(bibleLocations.length);

  const testaments: Array<'الكل' | 'قديم' | 'جديد' | 'كلاهما'> = ['الكل', 'قديم', 'جديد', 'كلاهما'];

  // تهيئة الخريطة
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;

    // إصلاح أيقونات Leaflet في بيئة Vite
    delete (L.Icon.Default.prototype as any)._getIconUrl;

    const map = L.map(mapRef.current, {
      center: [31.5, 35.0],
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    leafletMap.current = map;
    return () => {
      map.remove();
      leafletMap.current = null;
    };
  }, []);

  // تحديث العلامات عند تغيير الفلتر
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    // إزالة العلامات القديمة
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const visibleLocations = bibleLocations.filter(loc => {
      const testamentMatch = activeTestament === 'الكل' || loc.testament === activeTestament || loc.testament === 'كلاهما';
      const categoryMatch = activeCategory === 'الكل' || loc.category === activeCategory;
      return testamentMatch && categoryMatch;
    });

    setLocationCount(visibleLocations.length);

    visibleLocations.forEach(loc => {
      const color = TESTAMENT_COLORS[loc.testament] ?? '#6366f1';
      const icon = createColoredIcon(color, loc.category);
      const marker = L.marker([loc.lat, loc.lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div dir="rtl" style="font-family:system-ui,sans-serif;min-width:200px;max-width:260px">
            <div style="font-weight:700;font-size:14px;margin-bottom:4px;color:#1f2937">${loc.name}</div>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              <span style="background:${color}20;color:${color};padding:1px 7px;border-radius:99px;font-size:11px;font-weight:600">
                ${loc.testament === 'قديم' ? 'العهد القديم' : loc.testament === 'جديد' ? 'العهد الجديد' : 'العهدان'}
              </span>
              <span style="background:#f3f4f6;color:#6b7280;padding:1px 7px;border-radius:99px;font-size:11px">
                ${CATEGORY_ICONS[loc.category] ?? ''} ${loc.category}
              </span>
            </div>
            <div style="font-size:12px;color:#374151;line-height:1.6;margin-bottom:4px">${loc.description}</div>
            ${loc.verse ? `<div style="font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:4px;margin-top:4px">📖 ${loc.verse}</div>` : ''}
          </div>
        `, { maxWidth: 280 });

      marker.on('click', () => setSelectedLocation(loc));
      markersRef.current.push(marker);
    });
  }, [activeTestament, activeCategory]);

  return (
    <div dir="rtl">
      {/* العنوان */}
      <div className="flex items-center gap-2 mb-1">
        <Map className="w-5 h-5 text-teal-500" />
        <h2 className="font-display text-xl font-bold text-foreground">خريطة الكتاب المقدس التفاعلية</h2>
        <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 text-xs mr-auto">
          {locationCount} موقع
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        اضغط على أي علامة لمعرفة تفاصيل الموقع الكتابي — مبنيّة بالكامل داخل الموقع.
      </p>

      {/* أزرار العهد */}
      <div className="flex gap-2 flex-wrap mb-3">
        {testaments.map(t => (
          <button
            key={t}
            onClick={() => setActiveTestament(t)}
            data-testid={`map-testament-${t}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeTestament === t
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {t === 'قديم' ? '📜 العهد القديم' : t === 'جديد' ? '✝️ العهد الجديد' : t === 'كلاهما' ? '📖 العهدان' : '🌍 الكل'}
          </button>
        ))}
      </div>

      {/* أزرار الفئة */}
      <div className="flex gap-2 flex-wrap mb-4">
        {bibleLocationCategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            data-testid={`map-category-${cat}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {cat === 'الكل' ? 'كل الأنواع' : `${CATEGORY_ICONS[cat] ?? ''} ${cat}`}
          </button>
        ))}
      </div>

      {/* لوحة الأسطورة */}
      <div className="flex gap-3 flex-wrap mb-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{background:'#6366f1'}}></span> العهد القديم</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{background:'#10b981'}}></span> العهد الجديد</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{background:'#f59e0b'}}></span> العهدان معاً</span>
      </div>

      {/* الخريطة */}
      <div
        ref={mapRef}
        data-testid="bible-interactive-map"
        className="w-full rounded-xl overflow-hidden border border-teal-200 dark:border-teal-800 shadow-md"
        style={{ height: '420px' }}
      />

      {/* بطاقة الموقع المحدد */}
      {selectedLocation && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4"
        >
          <Card className="p-4 border-teal-200 dark:border-teal-800 bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-display font-bold text-foreground text-lg">{selectedLocation.name}</h3>
                  <Badge style={{background: TESTAMENT_COLORS[selectedLocation.testament] + '20', color: TESTAMENT_COLORS[selectedLocation.testament], border: 'none'}} className="text-xs font-semibold">
                    {selectedLocation.testament === 'قديم' ? 'العهد القديم' : selectedLocation.testament === 'جديد' ? 'العهد الجديد' : 'العهدان'}
                  </Badge>
                  <Badge variant="outline" className="text-xs">{CATEGORY_ICONS[selectedLocation.category]} {selectedLocation.category}</Badge>
                </div>
                <p className="text-base text-muted-foreground leading-relaxed">{selectedLocation.description}</p>
                {selectedLocation.verse && (
                  <p className="text-xs text-teal-600 dark:text-teal-400 mt-2 font-medium">📖 {selectedLocation.verse}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedLocation(null)}
                className="text-muted-foreground hover:text-foreground text-lg leading-none flex-shrink-0"
                data-testid="close-location-card"
              >×</button>
            </div>
          </Card>
        </motion.div>
      )}

      {/* معلومات الترخيص */}
      <p className="text-sm text-muted-foreground mt-3 text-center">
        🗺️ خرائط OpenStreetMap — مفتوحة المصدر © مساهمو OpenStreetMap | بيانات المواقع: تراث عام
      </p>
    </div>
  );
}

// ── أسئلة مع البابا شنودة الثالث ─────────────────────────────────────────────
function PopeShenoudaQASection() {
  const [activeCategory, setActiveCategory] = useState<string>('الكل');
  const [expandedQ, setExpandedQ] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  const filtered = activeCategory === 'الكل'
    ? popeShenoudaQAVideos
    : popeShenoudaQAVideos.filter(v => v.category === activeCategory);

  return (
    <div dir="rtl">
      {/* رأس القسم */}
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle className="w-5 h-5 text-amber-500" />
        <h2 className="text-lg font-bold font-display text-foreground">أسئلة مع البابا شنودة الثالث</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">فيديوهات أسئلة الشعب وإجابات البابا — اضغط على الفيديو لمشاهدته والأسئلة مكتوبة بجانبه</p>

      {/* فلتر التصنيف */}
      <div className="flex flex-wrap gap-2 mb-5">
        {popeShenoudaQACategories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-amber-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-amber-100 dark:hover:bg-amber-900/30'
            }`}
            data-testid={`pope-qa-cat-${cat}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* بطاقات الفيديوهات */}
      <div className="space-y-5">
        {filtered.map((video, i) => (
          <motion.div
            key={video.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Card className="overflow-hidden border-amber-100 dark:border-amber-900/30 shadow-sm">
              {/* شريط العنوان */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 px-4 py-3 border-b border-amber-100 dark:border-amber-900/30 flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{video.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base text-foreground leading-snug">{video.title}</h3>
                    <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 flex-shrink-0">{video.category}</Badge>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{video.subtitle}</p>
                </div>
              </div>

              {/* المحتوى: فيديو + أسئلة */}
              <div className="p-4">
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{video.description}</p>

                <div className="flex flex-col lg:flex-row gap-4">
                  {/* مشغل يوتيوب */}
                  <div className="lg:w-2/5 flex-shrink-0">
                    {activeVideo === video.id ? (
                      <div className="relative rounded-xl overflow-hidden shadow-md aspect-video bg-black">
                        <iframe
                          src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0`}
                          title={video.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="absolute inset-0 w-full h-full"
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveVideo(video.id)}
                        className="relative w-full rounded-xl overflow-hidden shadow-md group aspect-video bg-gray-900 block"
                        data-testid={`pope-qa-play-${video.id}`}
                      >
                        <img
                          src={`https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`}
                          alt={video.title}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-90 transition-opacity"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <Play className="w-6 h-6 text-white fill-white mr-[-2px]" />
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-white text-xs font-medium line-clamp-2 text-right">{video.title}</p>
                        </div>
                      </button>
                    )}
                  </div>

                  {/* قائمة الأسئلة */}
                  <div className="lg:w-3/5 flex-1">
                    <p className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      الأسئلة المطروحة في هذا الفيديو
                    </p>
                    <div className="space-y-2">
                      {video.questions.map((qa, qi) => {
                        const key = `${video.id}-${qi}`;
                        const isOpen = expandedQ === key;
                        return (
                          <div key={key} className="rounded-lg border border-amber-100 dark:border-amber-900/40 overflow-hidden">
                            <button
                              onClick={() => setExpandedQ(isOpen ? null : key)}
                              className="w-full text-right flex items-start gap-2 px-3 py-2.5 bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                              data-testid={`pope-qa-q-${video.id}-${qi}`}
                            >
                              <span className="w-5 h-5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">
                                {qi + 1}
                              </span>
                              <span className="flex-1 text-sm font-medium text-foreground leading-relaxed text-right">{qa.q}</span>
                              {isOpen
                                ? <ChevronUp className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                              }
                            </button>
                            <AnimatePresence>
                              {isOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 py-3 bg-white dark:bg-card border-t border-amber-100 dark:border-amber-900/30">
                                    <p className="text-sm text-muted-foreground leading-relaxed text-right">{qa.summary}</p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

    </div>
  );
}

// ── الصفحة الرئيسية ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
// الأسفار القانونية الثانية — مكوّن القارئ
// ══════════════════════════════════════════════════════════════════════════
const categoryColors: Record<string, string> = {
  'تاريخي': 'from-amber-500 to-orange-500',
  'حكمي':   'from-yellow-500 to-amber-400',
  'نبوي':   'from-blue-500 to-indigo-500',
  'عبادي':  'from-purple-500 to-violet-500',
};

const categoryBg: Record<string, string> = {
  'تاريخي': 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
  'حكمي':   'bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-800',
  'نبوي':   'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
  'عبادي':  'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
};

function ApocryphaSection() {
  const [selectedBook, setSelectedBook] = useState<ApocryphaBook | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);
  const [filterCat, setFilterCat] = useState<string>('الكل');
  const [tafsirDialogOpen, setTafsirDialogOpen] = useState(false);
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [tafsirTitle, setTafsirTitle] = useState('');
  const versesPanelRef = useRef<HTMLDivElement>(null);

  const categories = ['الكل', 'تاريخي', 'حكمي', 'نبوي', 'عبادي'];
  const filteredBooks = filterCat === 'الكل'
    ? apocryphaBooks
    : apocryphaBooks.filter(b => b.category === filterCat);

  const chapterData = selectedBook && selectedChapter !== null
    ? selectedBook.chapters.find(c => c.chapter === selectedChapter)
    : null;

  const handleBookSelect = (book: ApocryphaBook) => {
    setSelectedBook(book);
    setSelectedChapter(null);
  };

  const handleChapterSelect = (chNum: number) => {
    setSelectedChapter(chNum);
    setTimeout(() => versesPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const openChapterTafsir = async () => {
    if (!selectedBook || selectedChapter === null) return;
    setTafsirTitle(`تفسير ${selectedBook.name} — الإصحاح ${selectedChapter}`);
    setTafsirDialogOpen(true);
    setTafsirText(null);
    setTafsirLoading(true);
    try {
      const text = await fetchChapterTafsir(selectedBook.name, selectedChapter);
      setTafsirText(text);
    } finally {
      setTafsirLoading(false);
    }
  };

  const openVerseTafsir = async (verseNum: number) => {
    if (!selectedBook || selectedChapter === null) return;
    setTafsirTitle(`تفسير ${selectedBook.name} ${selectedChapter}:${verseNum}`);
    setTafsirDialogOpen(true);
    setTafsirText(null);
    setTafsirLoading(true);
    try {
      const text = await fetchVerseTafsir(selectedBook.name, selectedChapter, verseNum);
      setTafsirText(text);
    } finally {
      setTafsirLoading(false);
    }
  };

  return (
    <div dir="rtl">
      {/* رأس القسم */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-md">
          <Scroll className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-display text-xl font-bold text-foreground">الأسفار القانونية الثانية</h2>
          <p className="text-sm text-muted-foreground">الأسفار المقبولة في الكنيسة القبطية الأرثوذكسية</p>
        </div>
      </div>

      {/* تصفية حسب النوع */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilterCat(cat)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCat === cat
                ? 'bg-indigo-600 text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            data-testid={`apocrypha-cat-${cat}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* شبكة الأسفار — نفس شكل أسفار الكتاب المقدس */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {filteredBooks.map(book => (
          <motion.button
            key={book.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleBookSelect(book)}
            className={`p-3 rounded-xl border text-right transition-all ${
              selectedBook?.id === book.id
                ? `bg-gradient-to-br ${categoryColors[book.category]} text-white border-transparent shadow-md`
                : `${categoryBg[book.category]} hover:shadow-sm`
            }`}
            data-testid={`apocrypha-book-${book.id}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{book.icon}</span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 ${selectedBook?.id === book.id ? 'border-white/40 text-white/80' : 'text-muted-foreground'}`}
              >
                {book.category}
              </Badge>
            </div>
            <p className={`font-display font-bold text-base leading-tight ${selectedBook?.id === book.id ? 'text-white' : 'text-foreground'}`}>
              {book.name}
            </p>
            <p className={`text-[11px] mt-0.5 ${selectedBook?.id === book.id ? 'text-white/70' : 'text-muted-foreground'}`}>
              {book.chaptersCount} إصحاح
            </p>
          </motion.button>
        ))}
      </div>

      {/* شبكة الإصحاحات — تظهر عند اختيار سفر */}
      <AnimatePresence>
        {selectedBook && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4"
          >
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{selectedBook.icon}</span>
                  <div>
                    <p className="font-display font-bold text-foreground text-base">{selectedBook.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedBook.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedBook(null); setSelectedChapter(null); }}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1"
                  data-testid="apocrypha-close-book"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-3">اختر إصحاحاً للقراءة:</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: selectedBook.chaptersCount }, (_, i) => i + 1).map(chNum => {
                  const hasContent = selectedBook.chapters.some(c => c.chapter === chNum && c.verses.length > 0);
                  return (
                    <Button
                      key={chNum}
                      variant={selectedChapter === chNum ? 'default' : 'outline'}
                      size="sm"
                      className={`w-10 h-10 p-0 text-sm font-medium ${!hasContent ? 'opacity-50' : ''}`}
                      onClick={() => hasContent && handleChapterSelect(chNum)}
                      disabled={!hasContent}
                      data-testid={`apocrypha-chapter-${chNum}`}
                    >
                      {chNum}
                    </Button>
                  );
                })}
              </div>
              {selectedBook.chapters.length < selectedBook.chaptersCount && (
                <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/40"></span>
                  الإصحاحات الرمادية قيد الإضافة
                </p>
              )}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* قارئ الآيات — يظهر عند اختيار إصحاح */}
      <AnimatePresence>
        {selectedBook && selectedChapter !== null && (
          <motion.div
            ref={versesPanelRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="overflow-hidden">
              {/* رأس القارئ */}
              <div className={`p-3 bg-gradient-to-r ${categoryColors[selectedBook.category]} text-white`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span>{selectedBook.icon}</span>
                    <div>
                      <p className="font-display font-bold text-sm">{selectedBook.name}</p>
                      <p className="text-white/75 text-xs">الإصحاح {selectedChapter} من {selectedBook.chaptersCount}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-white hover:bg-white/20 text-xs px-2 h-8"
                      onClick={openChapterTafsir}
                      data-testid="apocrypha-chapter-tafsir"
                    >
                      <BookText className="w-3 h-3 ml-1" />
                      تفسير الإصحاح
                    </Button>
                    <button
                      onClick={() => setSelectedChapter(null)}
                      className="text-white/70 hover:text-white transition-colors p-1"
                      data-testid="apocrypha-close-chapter"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* الآيات */}
              <div className="p-4">
                {chapterData && chapterData.verses.length > 0 ? (
                  <div className="space-y-4 font-display text-xl leading-loose">
                    {chapterData.verses.map(verse => (
                      <div key={verse.verse} className="flex items-start gap-2">
                        <p className="flex-1 text-foreground leading-relaxed">
                          <span className="text-primary font-bold ml-2 text-base">{verse.verse}</span>
                          {verse.text}
                        </p>
                        <button
                          className="mt-1 px-3 py-1.5 rounded text-sm font-display font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors whitespace-nowrap flex-shrink-0"
                          onClick={() => openVerseTafsir(verse.verse)}
                          data-testid={`apocrypha-verse-tafsir-${verse.verse}`}
                        >
                          تفسير
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center text-muted-foreground">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">هذا الإصحاح قيد الإضافة</p>
                  </div>
                )}
              </div>

              {/* التنقل بين الإصحاحات */}
              <div className="border-t p-3 flex items-center justify-between bg-muted/30">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const prev = selectedChapter - 1;
                    if (prev >= 1) {
                      const hasPrev = selectedBook.chapters.some(c => c.chapter === prev && c.verses.length > 0);
                      if (hasPrev) handleChapterSelect(prev);
                    }
                  }}
                  disabled={selectedChapter <= 1 || !selectedBook.chapters.some(c => c.chapter === selectedChapter - 1 && c.verses.length > 0)}
                  className="gap-1 text-xs"
                  data-testid="apocrypha-prev-chapter"
                >
                  <ChevronRight className="w-4 h-4" />
                  السابق
                </Button>
                <span className="text-sm text-muted-foreground font-medium">
                  {selectedChapter} / {selectedBook.chaptersCount}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const next = selectedChapter + 1;
                    if (next <= selectedBook.chaptersCount) {
                      const hasNext = selectedBook.chapters.some(c => c.chapter === next && c.verses.length > 0);
                      if (hasNext) handleChapterSelect(next);
                    }
                  }}
                  disabled={selectedChapter >= selectedBook.chaptersCount || !selectedBook.chapters.some(c => c.chapter === selectedChapter + 1 && c.verses.length > 0)}
                  className="gap-1 text-xs"
                  data-testid="apocrypha-next-chapter"
                >
                  التالي
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dialog التفسير */}
      <Dialog open={tafsirDialogOpen} onOpenChange={setTafsirDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col" dir="rtl">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="font-display text-base text-right">{tafsirTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4 px-1">
            {tafsirLoading ? (
              <div className="flex items-center justify-center py-12 gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">جاري تحميل التفسير...</span>
              </div>
            ) : tafsirText ? (
              <div className="prose prose-sm dark:prose-invert max-w-none text-right leading-loose whitespace-pre-line">
                {tafsirText}
              </div>
            ) : (
              <div className="py-10 text-center text-muted-foreground">
                <BookText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium mb-1">تفسير غير متاح</p>
                <p className="text-xs">لا يوجد تفسير مضمّن لهذا الجزء من الأسفار القانونية الثانية حالياً</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// التابات التي لها صفحات منفصلة (تتنقّل لصفحاتها الخاصة)
const ORTHODOX_DEDICATED_ROUTES: Record<string, string> = {
  liturgy: '/orthodox/kholagy',
  agpeya: '/orthodox/agpeya',
};

// التابات الصالحة كقيم لـ :tab في /orthodox/:tab
const ORTHODOX_VALID_TABS = new Set([
  'deacon', 'hymns', 'katameros', 'saints', 'creed', 'history',
  'books', 'qa', 'figures', 'apocrypha', 'tafseer', 'maps', 'pope-qa', 'st-takla',
]);

export default function Orthodox() {
  const params = useParams<{ tab?: string }>();
  const urlTab = params?.tab && ORTHODOX_VALID_TABS.has(params.tab) ? params.tab : 'synaxarium';
  const trackPath = params?.tab ? `/orthodox/${params.tab}` : '/orthodox';
  usePageTracker(trackPath);
  const [, navigate] = useLocation();
  useExitTracker(trackPath);

  const navigateToTab = (newTab: string) => {
    // السنكسار: ينقل مباشرة لسنكسار اليوم (وليس قائمة الشهور)
    if (newTab === 'synaxarium') {
      const t = gregorianToCoptic(new Date());
      navigate(`/orthodox/synaxarium/${t.month}/${t.day}`);
      return;
    }
    const dedicated = ORTHODOX_DEDICATED_ROUTES[newTab];
    navigate(dedicated ?? `/orthodox/${newTab}`);
  };
  return (
    <>
      <SEOHead />
      <div className="container mx-auto px-4 py-6 max-w-4xl" dir="rtl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-md">
              <Cross className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">أرثوذوكسيات</h1>
              <p className="text-sm text-muted-foreground">السنكسار، الأجبية، الخولاجي، التفاسير، الكتب، الخرائط والشخصيات</p>
            </div>
          </div>

          <Tabs value={urlTab} onValueChange={navigateToTab} className="w-full">
            {/* صف التبويبات الأول */}
            <TabsList className="w-full grid grid-cols-4 mb-1.5 h-10">
              <TabsTrigger value="synaxarium" className="text-sm py-1.5" data-testid="tab-synaxarium">
                <Calendar className="w-3 h-3 ml-1" />
                السنكسار
              </TabsTrigger>
              <TabsTrigger value="agpeya" className="text-sm py-1.5" data-testid="tab-agpeya">
                <BookOpen className="w-3 h-3 ml-1" />
                الأجبية
              </TabsTrigger>
              <TabsTrigger value="liturgy" className="text-sm py-1.5" data-testid="tab-liturgy">
                <Church className="w-3 h-3 ml-1" />
                الخولاجي
              </TabsTrigger>
              <TabsTrigger value="deacon" className="text-sm py-1.5" data-testid="tab-deacon">
                <Mic2 className="w-3 h-3 ml-1" />
                المردات
              </TabsTrigger>
            </TabsList>
            {/* صف التبويبات الثاني */}
            <TabsList className="w-full grid grid-cols-4 mb-1.5 h-10">
              <TabsTrigger value="hymns" className="text-sm py-1.5" data-testid="tab-hymns">
                <Music className="w-3 h-3 ml-1" />
                الألحان
              </TabsTrigger>
              <TabsTrigger value="katameros" className="text-sm py-1.5" data-testid="tab-katameros">
                <Calendar className="w-3 h-3 ml-1" />
                القطمارس
              </TabsTrigger>
              <TabsTrigger value="saints" className="text-sm py-1.5" data-testid="tab-saints">
                <Video className="w-3 h-3 ml-1" />
                القديسون
              </TabsTrigger>
              <TabsTrigger value="creed" className="text-sm py-1.5" data-testid="tab-creed">
                <BookMarked className="w-3 h-3 ml-1" />
                عقيدة
              </TabsTrigger>
            </TabsList>
            {/* صف التبويبات الثالث */}
            <TabsList className="w-full grid grid-cols-4 mb-1.5 h-10">
              <TabsTrigger value="history" className="text-sm py-1.5" data-testid="tab-history">
                <History className="w-3 h-3 ml-1" />
                تاريخ
              </TabsTrigger>
              <TabsTrigger value="books" className="text-sm py-1.5" data-testid="tab-books">
                <BookOpen className="w-3 h-3 ml-1" />
                كتب
              </TabsTrigger>
              <TabsTrigger value="qa" className="text-sm py-1.5" data-testid="tab-qa">
                <HelpCircle className="w-3 h-3 ml-1" />
                أسئلة
              </TabsTrigger>
              <TabsTrigger value="figures" className="text-sm py-1.5" data-testid="tab-figures">
                <Users className="w-3 h-3 ml-1" />
                شخصيات
              </TabsTrigger>
            </TabsList>
            {/* صف التبويبات الرابع — أقسام جديدة */}
            <TabsList className="w-full grid grid-cols-4 mb-6 h-12">
              <TabsTrigger value="apocrypha" className="text-sm py-1.5" data-testid="tab-apocrypha">
                <Scroll className="w-3 h-3 ml-1" />
                الأسفار
              </TabsTrigger>
              <TabsTrigger value="tafseer" className="text-sm py-1.5" data-testid="tab-tafseer">
                <BookMarked className="w-3 h-3 ml-1" />
                تفاسير
              </TabsTrigger>
              <TabsTrigger value="maps" className="text-sm py-1.5" data-testid="tab-maps">
                <Map className="w-3 h-3 ml-1" />
                خرائط
              </TabsTrigger>
              <TabsTrigger value="pope-qa" className="text-sm py-1.5" data-testid="tab-pope-qa">
                <MessageCircle className="w-3 h-3 ml-1" />
                أسئلة البابا
              </TabsTrigger>
            </TabsList>
            <TabsList className="w-full grid grid-cols-1 mb-6 h-10">
              <TabsTrigger value="st-takla" className="text-sm py-1.5" data-testid="tab-st-takla">
                <BookText className="w-3 h-3 ml-1" />
                مراجع St-Takla
              </TabsTrigger>
            </TabsList>

            <TabsContent value="synaxarium">
              <SynaxariumSection />
            </TabsContent>

            <TabsContent value="agpeya">
              <AgpeyaSection />
            </TabsContent>

            <TabsContent value="liturgy">
              <LiturgySection />
            </TabsContent>

            <TabsContent value="deacon">
              <DeaconResponsesSection />
            </TabsContent>

            <TabsContent value="hymns">
              <HymnsSection />
            </TabsContent>

            <TabsContent value="katameros">
              <DailyLectionarySection />
            </TabsContent>

            <TabsContent value="saints">
              <SaintsVideosSection />
            </TabsContent>

            <TabsContent value="creed">
              <CreedSection />
            </TabsContent>

            <TabsContent value="history">
              <HistorySection />
            </TabsContent>

            <TabsContent value="books">
              <BookReaderSection />
            </TabsContent>

            <TabsContent value="qa">
              <QASection />
            </TabsContent>

            <TabsContent value="figures">
              <FiguresSection />
            </TabsContent>

            <TabsContent value="apocrypha">
              <RemoteDeuteroReader />
            </TabsContent>

            <TabsContent value="tafseer">
              <BibleCommentarySection />
            </TabsContent>

            <TabsContent value="maps">
              <BibleMapsSection />
            </TabsContent>

            <TabsContent value="pope-qa">
              <PopeShenoudaQASection />
            </TabsContent>

            <TabsContent value="st-takla">
              <StTaklaSections />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </>
  );
}
