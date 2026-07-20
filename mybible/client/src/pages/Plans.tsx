import { useState, useEffect, useMemo, useRef } from 'react';
import { dataSync } from '@/lib/user-data-sync';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, BookOpen, CheckCircle2, Circle, Play, ArrowLeft, ArrowRight, Plus, Trash2, Star, PartyPopper, Volume2, BookText, Loader2, GraduationCap, Music } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { staticReadingPlans, type StaticReadingPlan, type DayReading } from '@/lib/reading-plans-data';
import { useQuery } from '@tanstack/react-query';
import { api, type BibleBook } from '@/lib/api';
import { fetchBookIntro, fetchChapterTafsir, fetchVerseTafsir } from '@/lib/tafsir-csv-service';
import { getBibleChapterSEO, getTafsirSEO, getVerseTafsirSEO, getBookIntroSEO } from '@/lib/seo-config';
import { getVideoId } from '@/lib/video-links-data';
import { getChanteVideoId } from '@/lib/chanted-videos-data';
import { getDaoudLameiLessons } from '@/lib/daoud-lamei-rss';
import { SEOHead } from '@/components/SEOHead';
import { TafsirText } from '@/components/TafsirText';
import { YouTubeCard } from '@/components/YouTubeCard';

type ViewMode = 'plans' | 'days' | 'reading' | 'chapter';

const SESSION_KEY = 'plans-reading-position';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface PlansSession {
  ts: number;
  viewMode: ViewMode;
  selectedPlanId: string | null;
  selectedDay: number;
  currentReadingIndex: number;
  activeTab: string;
  showCustomChapter: boolean;
  customReadingIndex: number;
}

function loadPlansSession(): PlansSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data: PlansSession = JSON.parse(raw);
    if (Date.now() - data.ts > SESSION_TTL_MS) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

interface UserPlanProgress {
  planId: string;
  currentDay: number;
  completedDays: number[];
}

interface CustomReading {
  id: string;
  bookId: number;
  bookName: string;
  chapter: number;
}

export default function Plans() {
  const sessionRef = useRef<PlansSession | null>(loadPlansSession());
  const sess = sessionRef.current;

  const [viewMode, setViewMode] = useState<ViewMode>(sess?.viewMode ?? 'plans');
  const [selectedPlan, setSelectedPlan] = useState<StaticReadingPlan | null>(
    sess?.selectedPlanId ? (staticReadingPlans.find(p => p.id === sess.selectedPlanId) ?? null) : null
  );
  const [selectedDay, setSelectedDay] = useState<number>(sess?.selectedDay ?? 1);
  const [currentReadingIndex, setCurrentReadingIndex] = useState<number>(sess?.currentReadingIndex ?? 0);
  const [showDayComplete, setShowDayComplete] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(sess?.activeTab ?? 'plans');
  
  const [customReadings, setCustomReadings] = useState<CustomReading[]>(() => {
    try {
      const saved = localStorage.getItem('my-daily-readings');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [customReadingIndex, setCustomReadingIndex] = useState(sess?.customReadingIndex ?? 0);
  const [showCustomChapter, setShowCustomChapter] = useState(sess?.showCustomChapter ?? false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [tafsirDialogType, setTafsirDialogType] = useState<'intro' | 'chapter' | 'verse'>('chapter');
  const [tafsirVerseNum, setTafsirVerseNum] = useState<number>(0);
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [tafsirBookName, setTafsirBookName] = useState<string>('');
  const [tafsirChapter, setTafsirChapter] = useState<number>(1);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('1');
  
  const [userProgress, setUserProgress] = useState<UserPlanProgress[]>(() => {
    try {
      const saved = localStorage.getItem('reading-plan-progress');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentVideoStart, setCurrentVideoStart] = useState<number | undefined>(undefined);
  const [currentVideoEnd, setCurrentVideoEnd] = useState<number | undefined>(undefined);
  const [currentVideoBookName, setCurrentVideoBookName] = useState<string>('');
  const [currentVideoChapter, setCurrentVideoChapter] = useState<number>(1);
  const [videoReadingIndex, setVideoReadingIndex] = useState<number>(0);
  const [planChapterOverride, setPlanChapterOverride] = useState<number | null>(null);
  const [customChapterOverride, setCustomChapterOverride] = useState<number | null>(null);
  const [videoSource, setVideoSource] = useState<'plan' | 'custom'>('plan');
  const [listenChoiceOpen, setListenChoiceOpen] = useState(false);
  const [listenChoiceBook, setListenChoiceBook] = useState('');
  const [listenChoiceChapter, setListenChoiceChapter] = useState(1);
  const [listenChoiceChante, setListenChoiceChante] = useState<{ id: string; start?: number; end?: number } | null>(null);
  const [listenChoiceRegular, setListenChoiceRegular] = useState<string | null>(null);
  const [listenChoiceSource, setListenChoiceSource] = useState<'plan' | 'custom'>('plan');
  const [isChantedMode, setIsChantedMode] = useState<boolean>(false);

  const [chapterSubView, setChapterSubView] = useState<'verses' | 'tafsir' | 'lesson' | 'video'>('verses');
  const [lessonParts, setLessonParts] = useState<{ videoId: string; partNum: number; title: string }[]>([]);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonVideoId, setLessonVideoId] = useState<string | null>(null);
  const [lessonVideoTitle, setLessonVideoTitle] = useState<string>('');
  const [lessonBookName, setLessonBookName] = useState<string>('');
  const [lessonChapterNum, setLessonChapterNum] = useState<number>(1);

  useEffect(() => {
    try {
      const data: PlansSession = {
        ts: Date.now(),
        viewMode,
        selectedPlanId: selectedPlan?.id ?? null,
        selectedDay,
        currentReadingIndex,
        activeTab,
        showCustomChapter,
        customReadingIndex,
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {}
  }, [viewMode, selectedPlan, selectedDay, currentReadingIndex, activeTab, showCustomChapter, customReadingIndex]);

  const dynamicSEO = useMemo(() => {
    if (chapterSubView === 'tafsir' && tafsirBookName) {
      if (tafsirDialogType === 'chapter') {
        return getTafsirSEO(tafsirBookName, tafsirChapter);
      } else if (tafsirDialogType === 'verse') {
        return getVerseTafsirSEO(tafsirBookName, tafsirChapter, tafsirVerseNum);
      } else if (tafsirDialogType === 'intro') {
        return getBookIntroSEO(tafsirBookName);
      }
    }
    return null;
  }, [chapterSubView, tafsirDialogType, tafsirBookName, tafsirChapter, tafsirVerseNum]);

  const handleListenClick = (bookName: string, chapter: number, source: 'plan' | 'custom' = 'plan') => {
    const chanteId = getChanteVideoId(bookName, chapter);
    if (chanteId) {
      setListenChoiceBook(bookName);
      setListenChoiceChapter(chapter);
      setListenChoiceChante(chanteId);
      setListenChoiceRegular(getVideoId(bookName, chapter));
      setListenChoiceSource(source);
      setListenChoiceOpen(true);
      return;
    }
    setCurrentVideoBookName(bookName);
    setCurrentVideoChapter(chapter);
    setVideoSource(source);
    setIsChantedMode(false);
    setCurrentVideoId(getVideoId(bookName, chapter));
    if (source === 'plan') setVideoReadingIndex(currentReadingIndex);
    else setVideoReadingIndex(customReadingIndex);
    setChapterSubView('video');
  };

  const getVideoReadingsList = () => {
    if (videoSource === 'plan') {
      return currentDayData?.readings ?? [];
    }
    return customReadings.map(r => ({ book: r.bookName, bookDbName: r.bookName, chapter: r.chapter }));
  };

  const applyVideoPreferenceForReading = (bookName: string, chapter: number) => {
    if (isChantedMode) {
      const chanteId = getChanteVideoId(bookName, chapter);
      if (chanteId) {
        setCurrentVideoId(chanteId.id);
        setCurrentVideoStart(chanteId.start);
        setCurrentVideoEnd(chanteId.end);
        setIsChantedMode(true);
        return;
      }
    }
    const regularId = getVideoId(bookName, chapter);
    if (regularId) {
      setCurrentVideoId(regularId);
      setCurrentVideoStart(undefined);
      setCurrentVideoEnd(undefined);
      setIsChantedMode(false);
      return;
    }
    if (!isChantedMode) {
      const chanteId = getChanteVideoId(bookName, chapter);
      if (chanteId) {
        setCurrentVideoId(chanteId.id);
        setCurrentVideoStart(chanteId.start);
        setCurrentVideoEnd(chanteId.end);
        setIsChantedMode(true);
        return;
      }
    }
    setCurrentVideoId(null);
    setCurrentVideoStart(undefined);
    setCurrentVideoEnd(undefined);
    setIsChantedMode(false);
  };

  const goToVideoPrevReading = () => {
    const readingsList = getVideoReadingsList();
    if (videoReadingIndex <= 0) return;
    const newIndex = videoReadingIndex - 1;
    const prevReading = readingsList[newIndex];
    if (!prevReading) return;
    setVideoReadingIndex(newIndex);
    if (videoSource === 'plan') {
      setCurrentReadingIndex(newIndex);
      setPlanChapterOverride(null);
    } else {
      setCustomReadingIndex(newIndex);
      setCustomChapterOverride(null);
    }
    const bookName = videoSource === 'plan' ? prevReading.bookDbName : prevReading.book;
    setCurrentVideoBookName(bookName);
    setCurrentVideoChapter(prevReading.chapter);
    applyVideoPreferenceForReading(bookName, prevReading.chapter);
  };

  const goToVideoNextReading = () => {
    const readingsList = getVideoReadingsList();
    if (videoReadingIndex >= readingsList.length - 1) return;
    const newIndex = videoReadingIndex + 1;
    const nextReading = readingsList[newIndex];
    if (!nextReading) return;
    setVideoReadingIndex(newIndex);
    if (videoSource === 'plan') {
      setCurrentReadingIndex(newIndex);
      setPlanChapterOverride(null);
    } else {
      setCustomReadingIndex(newIndex);
      setCustomChapterOverride(null);
    }
    const bookName = videoSource === 'plan' ? nextReading.bookDbName : nextReading.book;
    setCurrentVideoBookName(bookName);
    setCurrentVideoChapter(nextReading.chapter);
    applyVideoPreferenceForReading(bookName, nextReading.chapter);
  };

  const { data: oldBooks } = useQuery({
    queryKey: ['books', 'old'],
    queryFn: () => api.books.getByTestament('old'),
  });

  const { data: newBooks } = useQuery({
    queryKey: ['books', 'new'],
    queryFn: () => api.books.getByTestament('new'),
  });

  const allBooks = [...(oldBooks || []), ...(newBooks || [])];
  const selectedBookData = allBooks.find(b => b.id.toString() === selectedBookId);

  const currentDayData = selectedPlan?.days.find(d => d.dayNumber === selectedDay);
  const currentReading = currentDayData?.readings[currentReadingIndex];
  
  const currentBookForChapter = currentReading 
    ? allBooks.find(b => b.name === currentReading.bookDbName)
    : null;

  const planEffectiveChapter = planChapterOverride ?? currentReading?.chapter ?? 1;

  const { data: chapterVerses, isLoading: versesLoading } = useQuery({
    queryKey: ['verses', currentBookForChapter?.id, planEffectiveChapter],
    queryFn: () => currentBookForChapter 
      ? api.verses.getByBook(currentBookForChapter.id, planEffectiveChapter)
      : Promise.resolve([]),
    enabled: !!currentBookForChapter && !!currentReading && viewMode === 'chapter',
  });

  const customCurrentReading = customReadings[customReadingIndex];
  const customEffectiveChapter = customChapterOverride ?? customCurrentReading?.chapter ?? 1;
  const customBookData = customCurrentReading ? allBooks.find(b => b.id === customCurrentReading.bookId) : null;

  const { data: customChapterVerses, isLoading: customVersesLoading } = useQuery({
    queryKey: ['verses', customCurrentReading?.bookId, customEffectiveChapter],
    queryFn: () => customCurrentReading 
      ? api.verses.getByBook(customCurrentReading.bookId, customEffectiveChapter)
      : Promise.resolve([]),
    enabled: !!customCurrentReading && showCustomChapter,
  });

  const saveProgress = (progress: UserPlanProgress[]) => {
    setUserProgress(progress);
    localStorage.setItem('reading-plan-progress', JSON.stringify(progress));
    dataSync.planProgress(progress);
  };

  const saveCustomReadings = (readings: CustomReading[]) => {
    setCustomReadings(readings);
    localStorage.setItem('my-daily-readings', JSON.stringify(readings));
    dataSync.dailyReadings(readings);
  };

  const getProgressForPlan = (planId: string): UserPlanProgress | undefined => {
    return userProgress.find(p => p.planId === planId);
  };

  const startPlan = (plan: StaticReadingPlan) => {
    const existing = getProgressForPlan(plan.id);
    if (!existing) {
      const newProgress = [...userProgress, { planId: plan.id, currentDay: 1, completedDays: [] }];
      saveProgress(newProgress);
    }
    setSelectedPlan(plan);
    setSelectedDay(existing?.currentDay || 1);
    setViewMode('days');
  };

  const selectDay = (dayNumber: number) => {
    setSelectedDay(dayNumber);
    setCurrentReadingIndex(0);
    setShowDayComplete(false);
    setChapterSubView('verses');
    setViewMode('reading');
  };

  const markDayCompleted = () => {
    if (!selectedPlan) return;
    
    const existing = getProgressForPlan(selectedPlan.id);
    if (existing) {
      const newCompletedDays = existing.completedDays.includes(selectedDay)
        ? existing.completedDays
        : [...existing.completedDays, selectedDay];
      const nextDay = selectedDay < selectedPlan.daysTotal ? selectedDay + 1 : selectedDay;
      
      const newProgress = userProgress.map(p => 
        p.planId === selectedPlan.id 
          ? { ...p, completedDays: newCompletedDays, currentDay: nextDay }
          : p
      );
      saveProgress(newProgress);
      setShowDayComplete(true);
    }
  };

  const goToNextDay = () => {
    if (!selectedPlan || selectedDay >= selectedPlan.daysTotal) return;
    setSelectedDay(selectedDay + 1);
    setCurrentReadingIndex(0);
    setShowDayComplete(false);
    setViewMode('reading');
  };

  const openChapterInline = (index: number) => {
    setCurrentReadingIndex(index);
    setPlanChapterOverride(null);
    setChapterSubView('verses');
    setViewMode('chapter');
  };

  const goToNextReading = () => {
    const dayData = selectedPlan?.days.find(d => d.dayNumber === selectedDay);
    if (dayData && currentReadingIndex < dayData.readings.length - 1) {
      setCurrentReadingIndex(currentReadingIndex + 1);
      setPlanChapterOverride(null);
      setChapterSubView('verses');
    } else if (dayData && currentReadingIndex === dayData.readings.length - 1) {
      markDayCompleted();
    }
  };

  const goToPrevReading = () => {
    if (currentReadingIndex > 0) {
      setCurrentReadingIndex(currentReadingIndex - 1);
      setPlanChapterOverride(null);
      setChapterSubView('verses');
    }
  };

  const addCustomReading = () => {
    if (!selectedBookId || !selectedChapter) return;
    const book = allBooks.find(b => b.id.toString() === selectedBookId);
    if (!book) return;
    
    const newReading: CustomReading = {
      id: `${book.id}-${selectedChapter}-${Date.now()}`,
      bookId: book.id,
      bookName: book.name,
      chapter: parseInt(selectedChapter),
    };
    
    saveCustomReadings([...customReadings, newReading]);
    setAddDialogOpen(false);
    setSelectedBookId('');
    setSelectedChapter('1');
  };

  const removeCustomReading = (id: string) => {
    saveCustomReadings(customReadings.filter(r => r.id !== id));
    if (customReadingIndex >= customReadings.length - 1) {
      setCustomReadingIndex(Math.max(0, customReadingIndex - 1));
    }
  };

  const openCustomReading = (index: number) => {
    setCustomReadingIndex(index);
    setCustomChapterOverride(null);
    setChapterSubView('verses');
    setShowCustomChapter(true);
  };

  const goToNextCustomReading = () => {
    if (customReadingIndex < customReadings.length - 1) {
      setCustomReadingIndex(customReadingIndex + 1);
      setCustomChapterOverride(null);
      setChapterSubView('verses');
    }
  };

  const goToPrevCustomReading = () => {
    if (customReadingIndex > 0) {
      setCustomReadingIndex(customReadingIndex - 1);
      setCustomChapterOverride(null);
      setChapterSubView('verses');
    }
  };

  const handleLessonClick = async (bookName: string, chapter: number) => {
    setLessonBookName(bookName);
    setLessonChapterNum(chapter);
    setLessonVideoId(null);
    setLessonParts([]);
    setLessonLoading(true);
    setChapterSubView('lesson');
    try {
      const parts = await getDaoudLameiLessons(bookName, chapter);
      if (parts.length === 1) {
        setLessonVideoId(parts[0].videoId);
        setLessonVideoTitle(parts[0].title);
        setLessonParts([]);
      } else {
        setLessonParts(parts);
        setLessonVideoId(null);
      }
    } catch {
      setLessonParts([]);
      setLessonVideoId(null);
    } finally {
      setLessonLoading(false);
    }
  };

  const renderPlansView = () => (
    <motion.div
      key="plans"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="space-y-4">
        {staticReadingPlans.map((plan, index) => {
          const progress = getProgressForPlan(plan.id);
          const isActive = !!progress;
          const currentDay = progress?.currentDay || 0;
          const completedDays = progress?.completedDays || [];
          const progressPercent = (completedDays.length / plan.daysTotal) * 100;

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Card
                className={cn(
                  'p-5 transition-all cursor-pointer hover:shadow-md',
                  isActive && 'ring-2 ring-primary shadow-lg'
                )}
                onClick={() => startPlan(plan)}
                data-testid={`plan-card-${plan.id}`}
              >
                <div className="flex items-start gap-4">
                  <div className={cn(
                    'w-14 h-14 rounded-xl flex items-center justify-center shrink-0',
                    isActive
                      ? 'bg-gradient-to-br from-primary to-primary/80'
                      : 'bg-muted'
                  )}>
                    {isActive ? (
                      <Play className="w-6 h-6 text-primary-foreground" />
                    ) : (
                      <CalendarDays className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-display text-lg font-bold text-foreground">
                        {plan.name}
                      </h3>
                      {isActive && (
                        <Badge variant="secondary" className="text-xs">
                          نشطة
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {plan.description}
                    </p>

                    {isActive ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <Progress value={progressPercent} className="h-2 flex-1" />
                          <span className="text-sm font-semibold text-primary whitespace-nowrap">
                            {completedDays.length}/{plan.daysTotal}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          اليوم الحالي: {currentDay}
                        </p>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Circle className="w-4 h-4" />
                        <span>{plan.daysTotal} يوم</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );

  const renderDaysView = () => {
    if (!selectedPlan) return null;
    const progress = getProgressForPlan(selectedPlan.id);
    const completedDays = progress?.completedDays || [];

    return (
      <motion.div
        key="days"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setViewMode('plans');
            setSelectedPlan(null);
          }}
          className="mb-4"
          data-testid="button-back-plans"
        >
          <ChevronLeft className="w-4 h-4 ml-1" />
          رجوع للخطط
        </Button>

        <Card className="p-4 mb-4">
          <h2 className="font-display text-xl font-bold text-foreground mb-2">
            {selectedPlan.name}
          </h2>
          <p className="text-sm text-muted-foreground mb-3">{selectedPlan.description}</p>
          <div className="flex items-center gap-3">
            <Progress value={(completedDays.length / selectedPlan.daysTotal) * 100} className="h-2 flex-1" />
            <span className="text-sm font-semibold text-primary">
              {completedDays.length}/{selectedPlan.daysTotal}
            </span>
          </div>
        </Card>

        <h3 className="font-semibold text-foreground mb-3">اختر يوماً للقراءة</h3>
        
        <ScrollArea className="h-[400px]">
          <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-10 gap-2 p-1">
            {selectedPlan.days.map((day) => {
              const isCompleted = completedDays.includes(day.dayNumber);
              const isCurrent = progress?.currentDay === day.dayNumber;

              return (
                <button
                  key={day.dayNumber}
                  onClick={() => selectDay(day.dayNumber)}
                  className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-all',
                    isCompleted
                      ? 'bg-primary text-primary-foreground'
                      : isCurrent
                      ? 'bg-primary/20 text-primary ring-2 ring-primary'
                      : 'bg-muted hover:bg-muted/80 text-foreground'
                  )}
                  data-testid={`day-${day.dayNumber}`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    day.dayNumber
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </motion.div>
    );
  };

  const renderReadingView = () => {
    if (!selectedPlan) return null;
    const dayData = selectedPlan.days.find(d => d.dayNumber === selectedDay);
    if (!dayData) return null;

    const progress = getProgressForPlan(selectedPlan.id);
    const isCompleted = progress?.completedDays.includes(selectedDay);

    return (
      <motion.div
        key="reading"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setViewMode('days')}
          className="mb-4"
          data-testid="button-back-days"
        >
          <ChevronLeft className="w-4 h-4 ml-1" />
          رجوع للأيام
        </Button>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Badge variant="secondary" className="mb-2">
                اليوم {selectedDay} من {selectedPlan.daysTotal}
              </Badge>
              <h2 className="font-display text-xl font-bold text-foreground">
                قراءات اليوم ({dayData.readings.length} إصحاحات)
              </h2>
            </div>
            {isCompleted && (
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">مكتمل</span>
              </div>
            )}
          </div>

          <div className="space-y-3 mb-6">
            {dayData.readings.map((reading, index) => (
              <button
                key={index}
                onClick={() => openChapterInline(index)}
                className={cn(
                  'w-full p-4 rounded-xl flex items-center gap-4 transition-all text-right',
                  index === currentReadingIndex
                    ? 'bg-primary/10 ring-2 ring-primary'
                    : 'bg-muted hover:bg-muted/80'
                )}
                data-testid={`reading-${index}`}
              >
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                  index === currentReadingIndex
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground'
                )}>
                  <BookOpen className="w-5 h-5" />
                </div>
                <div className="flex-1 text-right">
                  <p className="font-semibold text-foreground">
                    {reading.book} - الإصحاح {reading.chapter}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    اضغط للقراءة
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
              </button>
            ))}
          </div>
        </Card>
      </motion.div>
    );
  };

  const renderChapterView = () => {
    if (!selectedPlan || !currentReading) return null;
    const dayData = selectedPlan.days.find(d => d.dayNumber === selectedDay);
    if (!dayData) return null;

    const isLastReading = currentReadingIndex === dayData.readings.length - 1;
    const progress = getProgressForPlan(selectedPlan.id);
    const isCompleted = progress?.completedDays.includes(selectedDay);

    if (showDayComplete) {
      return (
        <motion.div
          key="complete"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-12"
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center">
            <PartyPopper className="w-10 h-10 text-white" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground mb-2">
            تم الانتهاء من قراءات اليوم!
          </h2>
          <p className="text-muted-foreground mb-6">
            أحسنت! لقد أكملت قراءات اليوم {selectedDay}
          </p>
          {selectedDay < selectedPlan.daysTotal ? (
            <Button
              onClick={goToNextDay}
              size="lg"
              className="bg-gradient-to-r from-primary to-primary/80"
              data-testid="button-next-day"
            >
              الانتقال إلى اليوم التالي
              <ArrowLeft className="w-5 h-5 mr-2" />
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-lg font-semibold text-primary">
                🎉 مبروك! لقد أكملت الخطة بالكامل!
              </p>
              <Button
                onClick={() => {
                  setViewMode('plans');
                  setSelectedPlan(null);
                }}
                variant="outline"
              >
                رجوع للخطط
              </Button>
            </div>
          )}
        </motion.div>
      );
    }

    return (
      <motion.div
        key="chapter"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setPlanChapterOverride(null); setViewMode('reading'); }}
          className="mb-4"
          data-testid="button-back-readings"
        >
          <ChevronLeft className="w-4 h-4 ml-1" />
          رجوع للقراءات
        </Button>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <Badge variant="secondary">
              القراءة {currentReadingIndex + 1} من {dayData.readings.length}
            </Badge>
            <Badge variant="outline">
              اليوم {selectedDay}
            </Badge>
          </div>

          <h2 className="font-display text-xl font-bold text-foreground mb-4 text-center">
            {currentReading.book} - الإصحاح {planEffectiveChapter}
          </h2>

          {chapterSubView !== 'verses' && (
            <Button variant="outline" onClick={() => setChapterSubView('verses')} className="mb-4 w-full border-primary text-primary font-semibold">
              <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
            </Button>
          )}

          {chapterSubView === 'verses' && (
            <div className="flex flex-wrap justify-center gap-2 mb-4 pb-3 border-b">
              <Button
                size="sm"
                onClick={() => handleListenClick(currentReading.book, planEffectiveChapter, 'plan')}
                style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                data-testid="button-listen-chapter"
              >
                <Volume2 className="w-4 h-4 ml-1" />
                استمع للإصحاح
              </Button>
              <Button
                size="sm"
                onClick={() => handleLessonClick(currentReading.book, planEffectiveChapter)}
                disabled={lessonLoading}
                style={{ background: '#b45309', color: '#ffffff' }}
                data-testid="button-lesson-plan"
              >
                {lessonLoading ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <GraduationCap className="w-4 h-4 ml-1" />}
                درس كتاب
              </Button>
              <Button
                size="sm"
                style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                onClick={() => {
                  setTafsirDialogType('intro');
                  setTafsirBookName(currentReading.book);
                  setChapterSubView('tafsir');
                  setTafsirText(null);
                  setTafsirLoading(true);
                  fetchBookIntro(currentReading.book)
                    .then(text => { setTafsirText(text); setTafsirLoading(false); })
                    .catch(() => setTafsirLoading(false));
                }}
                data-testid="button-book-intro"
              >
                <BookOpen className="w-4 h-4 ml-1" />
                مقدمة عن السفر
              </Button>
              <Button
                size="sm"
                style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                onClick={() => {
                  setTafsirDialogType('chapter');
                  setTafsirBookName(currentReading.book);
                  setTafsirChapter(planEffectiveChapter);
                  setChapterSubView('tafsir');
                  setTafsirText(null);
                  setTafsirLoading(true);
                  fetchChapterTafsir(currentReading.book, planEffectiveChapter)
                    .then(text => { setTafsirText(text); setTafsirLoading(false); })
                    .catch(() => setTafsirLoading(false));
                }}
                data-testid="button-chapter-tafsir"
              >
                <BookText className="w-4 h-4 ml-1" />
                تفسير الإصحاح
              </Button>
            </div>
          )}

          {chapterSubView === 'verses' && (
            <div className="mb-6">
              {versesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              ) : chapterVerses && chapterVerses.length > 0 ? (
                <div className="space-y-4 p-2" dir="rtl">
                  {chapterVerses.map((verse) => (
                    <div key={verse.id} className="group">
                      <div className="flex gap-2">
                        <span className="text-primary font-bold text-sm min-w-[2rem]">
                          {verse.verse}
                        </span>
                        <p className="font-display text-xl md:text-2xl leading-loose text-foreground flex-1">
                          {verse.text}
                        </p>
                        <button
                          className="mt-2 px-3 py-1.5 rounded text-sm font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors shrink-0 whitespace-nowrap"
                          onClick={() => {
                            if (!currentReading) return;
                            setTafsirDialogType('verse');
                            setTafsirVerseNum(verse.verse);
                            setTafsirBookName(currentReading.book);
                            setTafsirChapter(planEffectiveChapter);
                            setChapterSubView('tafsir');
                            setTafsirText(null);
                            setTafsirLoading(true);
                            fetchVerseTafsir(currentReading.book, planEffectiveChapter, verse.verse)
                              .then(text => { setTafsirText(text); setTafsirLoading(false); })
                              .catch(() => setTafsirLoading(false));
                          }}
                          data-testid={`button-verse-tafsir-${verse.verse}`}
                        >
                          تفسير الآية
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-12">
                  لا توجد آيات متاحة
                </p>
              )}
            </div>
          )}

          {chapterSubView === 'tafsir' && (
            <div className="mt-2" dir="rtl">
              <h3 className="font-display text-lg font-semibold mb-4 text-center" data-testid="text-commentary-title">
                {tafsirDialogType === 'intro'
                  ? `مقدمة عن سفر ${tafsirBookName}`
                  : tafsirDialogType === 'verse'
                  ? `تفسير ${tafsirBookName} ${tafsirChapter}:${tafsirVerseNum}`
                  : `تفسير ${tafsirBookName} - الإصحاح ${tafsirChapter}`}
              </h3>
              {tafsirLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="mr-2 text-sm text-muted-foreground">جاري تحميل التفسير...</span>
                </div>
              ) : tafsirText ? (
                <div className="p-4 bg-primary/5 rounded-lg whitespace-pre-wrap text-lg leading-loose font-body" style={{ background: 'rgba(155, 40, 65, 0.06)' }} data-testid="text-tafsir-content">
                  <TafsirText text={tafsirText} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center p-4" data-testid="text-no-tafsir">لا يوجد تفسير متاح حاليًا.</p>
              )}
              <Button variant="outline" onClick={() => setChapterSubView('verses')} className="mt-4 w-full border-primary text-primary font-semibold">
                <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
              </Button>
            </div>
          )}

          {chapterSubView === 'lesson' && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="w-5 h-5 text-amber-500" />
                <h3 className="font-display text-lg font-semibold">درس كتاب — {lessonBookName} {lessonChapterNum}</h3>
              </div>
              {lessonLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                </div>
              ) : lessonVideoId && lessonParts.length === 0 ? (
                <YouTubeCard videoId={lessonVideoId} title={lessonVideoTitle} />
              ) : lessonParts.length > 1 && !lessonVideoId ? (
                <div className="space-y-3 py-2">
                  <p className="text-right text-sm text-muted-foreground font-display">اختر الجزء:</p>
                  <div className="flex flex-wrap gap-3 justify-center">
                    {lessonParts.map((part, idx) => (
                      <Button key={part.videoId} onClick={() => { setLessonVideoId(part.videoId); setLessonVideoTitle(part.title); setLessonParts([]); }}
                        className="bg-gradient-to-r from-amber-600 to-amber-500 text-white min-w-[120px]"
                        style={{ background: '#b45309', color: '#ffffff' }}
                        data-testid={`button-plans-lesson-part-${idx + 1}`}>
                        <GraduationCap className="w-4 h-4 ml-1" />الجزء {part.partNum}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground font-display space-y-3">
                  <GraduationCap className="w-10 h-10 mx-auto text-amber-400 opacity-60" />
                  <p className="text-base">لا يوجد شرح متاح حالياً</p>
                </div>
              )}
              <Button variant="outline" onClick={() => setChapterSubView('verses')} className="mt-4 w-full border-primary text-primary font-semibold">
                <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
              </Button>
            </div>
          )}

          {chapterSubView === 'video' && (
            <div className="mt-2">
              <h3 className="font-display text-lg font-semibold mb-4 text-center">
                {isChantedMode ? 'استمع مرتلاً' : 'استمع كقراءة'} — {currentVideoBookName} {currentVideoChapter}
              </h3>
              <div className="mb-4 pb-3 border-b flex flex-wrap justify-center gap-2" dir="rtl">
                {isChantedMode
                  ? (() => {
                      const regularId = getVideoId(currentVideoBookName, currentVideoChapter);
                      if (!regularId) return null;
                      return (
                        <Button size="sm" onClick={() => { setIsChantedMode(false); setCurrentVideoId(regularId); setCurrentVideoStart(undefined); setCurrentVideoEnd(undefined); }} style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}>
                          <Volume2 className="w-4 h-4 ml-1" />استمع كقراءة
                        </Button>
                      );
                    })()
                  : (() => {
                      const chanteId = getChanteVideoId(currentVideoBookName, currentVideoChapter);
                      if (!chanteId) return null;
                      return (
                        <Button size="sm" onClick={() => { setIsChantedMode(true); setCurrentVideoId(chanteId.id); setCurrentVideoStart(chanteId.start); setCurrentVideoEnd(chanteId.end); }} style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}>
                          <Music className="w-4 h-4 ml-1" />استمع مرتلاً
                        </Button>
                      );
                    })()
                }
                <Button size="sm" onClick={() => handleLessonClick(currentVideoBookName, currentVideoChapter)} disabled={lessonLoading} style={{ background: '#b45309', color: '#ffffff' }}>
                  {lessonLoading ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <GraduationCap className="w-4 h-4 ml-1" />}درس كتاب
                </Button>
                <Button size="sm" style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }} onClick={() => { setTafsirDialogType('intro'); setTafsirBookName(currentVideoBookName); setChapterSubView('tafsir'); setTafsirText(null); setTafsirLoading(true); fetchBookIntro(currentVideoBookName).then(t => { setTafsirText(t); setTafsirLoading(false); }).catch(() => setTafsirLoading(false)); }}>
                  <BookOpen className="w-4 h-4 ml-1" />مقدمة عن السفر
                </Button>
                <Button size="sm" style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }} onClick={() => { setTafsirDialogType('chapter'); setTafsirBookName(currentVideoBookName); setTafsirChapter(currentVideoChapter); setChapterSubView('tafsir'); setTafsirText(null); setTafsirLoading(true); fetchChapterTafsir(currentVideoBookName, currentVideoChapter).then(t => { setTafsirText(t); setTafsirLoading(false); }).catch(() => setTafsirLoading(false)); }}>
                  <BookText className="w-4 h-4 ml-1" />تفسير الإصحاح
                </Button>
              </div>
              {currentVideoId ? (
                <YouTubeCard videoId={currentVideoId} start={currentVideoStart} end={currentVideoEnd} />
              ) : (
                <div className="aspect-video flex items-center justify-center bg-muted rounded-lg">
                  <p className="text-muted-foreground text-center p-8 font-display">لا توجد ملفات صوتية أو مرئية لهذا الإصحاح</p>
                </div>
              )}
              <Button variant="outline" onClick={() => setChapterSubView('verses')} className="mt-4 w-full border-primary text-primary font-semibold">
                <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
              </Button>
              <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t">
                <Button variant="outline" onClick={goToVideoPrevReading} disabled={videoReadingIndex <= 0} className="flex-1" data-testid="button-video-prev-reading">
                  <ChevronRight className="w-4 h-4 ml-2" />السابق
                </Button>
                <span className="text-xs text-muted-foreground shrink-0">{currentVideoBookName} {currentVideoChapter}</span>
                {videoSource === 'plan' && videoReadingIndex >= getVideoReadingsList().length - 1 ? (
                  <Button
                    onClick={() => { markDayCompleted(); setChapterSubView('verses'); setCurrentVideoId(null); }}
                    disabled={selectedPlan ? getProgressForPlan(selectedPlan.id)?.completedDays.includes(selectedDay) : false}
                    className="flex-1 bg-gradient-to-r from-green-500 to-green-600"
                    data-testid="button-video-finish-day"
                  >
                    <CheckCircle2 className="w-4 h-4 ml-2" />
                    {selectedPlan && getProgressForPlan(selectedPlan.id)?.completedDays.includes(selectedDay) ? 'مكتمل' : 'إنهاء اليوم'}
                  </Button>
                ) : (
                  <Button onClick={goToVideoNextReading} disabled={videoReadingIndex >= getVideoReadingsList().length - 1} className="flex-1" data-testid="button-video-next-reading">
                    التالي<ChevronLeft className="w-4 h-4 mr-2" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {chapterSubView === 'verses' && (
            <div className="flex items-center justify-between gap-4 pt-4 border-t">
              <Button
                variant="outline"
                onClick={goToPrevReading}
                disabled={currentReadingIndex === 0}
                className="flex-1"
                data-testid="button-prev-chapter"
              >
                <ArrowRight className="w-4 h-4 ml-2" />
                السابق
              </Button>

              {isLastReading ? (
                <Button
                  onClick={goToNextReading}
                  disabled={isCompleted}
                  className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
                  data-testid="button-finish-day"
                >
                  <CheckCircle2 className="w-4 h-4 ml-2" />
                  {isCompleted ? 'مكتمل' : 'إنهاء اليوم'}
                </Button>
              ) : (
                <Button
                  onClick={goToNextReading}
                  className="flex-1"
                  data-testid="button-next-chapter"
                >
                  التالي
                  <ArrowLeft className="w-4 h-4 mr-2" />
                </Button>
              )}
            </div>
          )}
        </Card>
      </motion.div>
    );
  };

  const renderMyReadings = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {showCustomChapter && customCurrentReading ? (
        <motion.div
          key="custom-chapter"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setCustomChapterOverride(null); setShowCustomChapter(false); }}
            className="mb-4"
          >
            <ChevronLeft className="w-4 h-4 ml-1" />
            رجوع للقراءات
          </Button>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="secondary">
                القراءة {customReadingIndex + 1} من {customReadings.length}
              </Badge>
            </div>

            <h2 className="font-display text-xl font-bold text-foreground mb-4 text-center">
              {customCurrentReading.bookName} - الإصحاح {customEffectiveChapter}
            </h2>

            {chapterSubView !== 'verses' && (
              <Button variant="outline" onClick={() => setChapterSubView('verses')} className="mb-4 w-full border-primary text-primary font-semibold">
                <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
              </Button>
            )}

            {chapterSubView === 'verses' && (
              <div className="flex flex-wrap justify-center gap-2 mb-4 pb-3 border-b">
                <Button
                  size="sm"
                  onClick={() => handleListenClick(customCurrentReading.bookName, customEffectiveChapter, 'custom')}
                  style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                  data-testid="button-listen-custom-chapter"
                >
                  <Volume2 className="w-4 h-4 ml-1" />
                  استمع للإصحاح
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleLessonClick(customCurrentReading.bookName, customEffectiveChapter)}
                  disabled={lessonLoading}
                  style={{ background: '#b45309', color: '#ffffff' }}
                  data-testid="button-lesson-custom"
                >
                  {lessonLoading ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <GraduationCap className="w-4 h-4 ml-1" />}
                  درس كتاب
                </Button>
                <Button
                  size="sm"
                  style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                  onClick={() => {
                    setTafsirDialogType('intro');
                    setTafsirBookName(customCurrentReading.bookName);
                    setChapterSubView('tafsir');
                    setTafsirText(null);
                    setTafsirLoading(true);
                    fetchBookIntro(customCurrentReading.bookName)
                      .then(text => { setTafsirText(text); setTafsirLoading(false); })
                      .catch(() => setTafsirLoading(false));
                  }}
                  data-testid="button-custom-book-intro"
                >
                  <BookOpen className="w-4 h-4 ml-1" />
                  مقدمة عن السفر
                </Button>
                <Button
                  size="sm"
                  style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                  onClick={() => {
                    setTafsirDialogType('chapter');
                    setTafsirBookName(customCurrentReading.bookName);
                    setTafsirChapter(customEffectiveChapter);
                    setChapterSubView('tafsir');
                    setTafsirText(null);
                    setTafsirLoading(true);
                    fetchChapterTafsir(customCurrentReading.bookName, customEffectiveChapter)
                      .then(text => { setTafsirText(text); setTafsirLoading(false); })
                      .catch(() => setTafsirLoading(false));
                  }}
                  data-testid="button-custom-chapter-tafsir"
                >
                  <BookText className="w-4 h-4 ml-1" />
                  تفسير الإصحاح
                </Button>
              </div>
            )}

            {chapterSubView === 'verses' && (
              <div className="mb-6">
                {customVersesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : customChapterVerses && customChapterVerses.length > 0 ? (
                  <div className="space-y-4 p-2" dir="rtl">
                    {customChapterVerses.map((verse) => (
                      <div key={verse.id} className="group">
                        <div className="flex gap-2">
                          <span className="text-primary font-bold text-sm min-w-[2rem]">
                            {verse.verse}
                          </span>
                          <p className="font-display text-xl md:text-2xl leading-loose text-foreground flex-1">
                            {verse.text}
                          </p>
                          <button
                            className="mt-2 px-3 py-1.5 rounded text-sm font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors shrink-0 whitespace-nowrap"
                            onClick={() => {
                              if (!customCurrentReading) return;
                              setTafsirDialogType('verse');
                              setTafsirVerseNum(verse.verse);
                              setTafsirBookName(customCurrentReading.bookName);
                              setTafsirChapter(customEffectiveChapter);
                              setChapterSubView('tafsir');
                              setTafsirText(null);
                              setTafsirLoading(true);
                              fetchVerseTafsir(customCurrentReading.bookName, customEffectiveChapter, verse.verse)
                                .then(text => { setTafsirText(text); setTafsirLoading(false); })
                                .catch(() => setTafsirLoading(false));
                            }}
                            data-testid={`button-custom-verse-tafsir-${verse.verse}`}
                          >
                            تفسير الآية
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-12">
                    لا توجد آيات متاحة
                  </p>
                )}
              </div>
            )}

            {chapterSubView === 'tafsir' && (
              <div className="mt-2" dir="rtl">
                <h3 className="font-display text-lg font-semibold mb-4 text-center" data-testid="text-commentary-title">
                  {tafsirDialogType === 'intro'
                    ? `مقدمة عن سفر ${tafsirBookName}`
                    : tafsirDialogType === 'verse'
                    ? `تفسير ${tafsirBookName} ${tafsirChapter}:${tafsirVerseNum}`
                    : `تفسير ${tafsirBookName} - الإصحاح ${tafsirChapter}`}
                </h3>
                {tafsirLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    <span className="mr-2 text-sm text-muted-foreground">جاري تحميل التفسير...</span>
                  </div>
                ) : tafsirText ? (
                  <div className="p-4 bg-primary/5 rounded-lg whitespace-pre-wrap text-lg leading-loose font-body" style={{ background: 'rgba(155, 40, 65, 0.06)' }} data-testid="text-tafsir-content">
                    <TafsirText text={tafsirText} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center p-4" data-testid="text-no-tafsir">لا يوجد تفسير متاح حاليًا.</p>
                )}
                <Button variant="outline" onClick={() => setChapterSubView('verses')} className="mt-4 w-full border-primary text-primary font-semibold">
                  <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
                </Button>
              </div>
            )}

            {chapterSubView === 'lesson' && (
              <div className="mt-2">
                <div className="flex items-center gap-2 mb-4">
                  <GraduationCap className="w-5 h-5 text-amber-500" />
                  <h3 className="font-display text-lg font-semibold">درس كتاب — {lessonBookName} {lessonChapterNum}</h3>
                </div>
                {lessonLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                  </div>
                ) : lessonVideoId && lessonParts.length === 0 ? (
                  <YouTubeCard videoId={lessonVideoId} title={lessonVideoTitle} />
                ) : lessonParts.length > 1 && !lessonVideoId ? (
                  <div className="space-y-3 py-2">
                    <p className="text-right text-sm text-muted-foreground font-display">اختر الجزء:</p>
                    <div className="flex flex-wrap gap-3 justify-center">
                      {lessonParts.map((part, idx) => (
                        <Button key={part.videoId} onClick={() => { setLessonVideoId(part.videoId); setLessonVideoTitle(part.title); setLessonParts([]); }}
                          className="bg-gradient-to-r from-amber-600 to-amber-500 text-white min-w-[120px]"
                          style={{ background: '#b45309', color: '#ffffff' }}
                          data-testid={`button-plans-lesson-part-${idx + 1}`}>
                          <GraduationCap className="w-4 h-4 ml-1" />الجزء {part.partNum}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground font-display space-y-3">
                    <GraduationCap className="w-10 h-10 mx-auto text-amber-400 opacity-60" />
                    <p className="text-base">لا يوجد شرح متاح حالياً</p>
                  </div>
                )}
                <Button variant="outline" onClick={() => setChapterSubView('verses')} className="mt-4 w-full border-primary text-primary font-semibold">
                  <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
                </Button>
              </div>
            )}

            {chapterSubView === 'video' && (
              <div className="mt-2">
                <h3 className="font-display text-lg font-semibold mb-4 text-center">
                  {isChantedMode ? 'استمع مرتلاً' : 'استمع كقراءة'} — {currentVideoBookName} {currentVideoChapter}
                </h3>
                <div className="mb-4 pb-3 border-b flex flex-wrap justify-center gap-2" dir="rtl">
                  {isChantedMode
                    ? (() => {
                        const regularId = getVideoId(currentVideoBookName, currentVideoChapter);
                        if (!regularId) return null;
                        return (
                          <Button size="sm" onClick={() => { setIsChantedMode(false); setCurrentVideoId(regularId); setCurrentVideoStart(undefined); setCurrentVideoEnd(undefined); }} style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}>
                            <Volume2 className="w-4 h-4 ml-1" />استمع كقراءة
                          </Button>
                        );
                      })()
                    : (() => {
                        const chanteId = getChanteVideoId(currentVideoBookName, currentVideoChapter);
                        if (!chanteId) return null;
                        return (
                          <Button size="sm" onClick={() => { setIsChantedMode(true); setCurrentVideoId(chanteId.id); setCurrentVideoStart(chanteId.start); setCurrentVideoEnd(chanteId.end); }} style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}>
                            <Music className="w-4 h-4 ml-1" />استمع مرتلاً
                          </Button>
                        );
                      })()
                  }
                  <Button size="sm" onClick={() => handleLessonClick(currentVideoBookName, currentVideoChapter)} disabled={lessonLoading} style={{ background: '#b45309', color: '#ffffff' }}>
                    {lessonLoading ? <Loader2 className="w-4 h-4 ml-1 animate-spin" /> : <GraduationCap className="w-4 h-4 ml-1" />}درس كتاب
                  </Button>
                  <Button size="sm" style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }} onClick={() => { setTafsirDialogType('intro'); setTafsirBookName(currentVideoBookName); setChapterSubView('tafsir'); setTafsirText(null); setTafsirLoading(true); fetchBookIntro(currentVideoBookName).then(t => { setTafsirText(t); setTafsirLoading(false); }).catch(() => setTafsirLoading(false)); }}>
                    <BookOpen className="w-4 h-4 ml-1" />مقدمة عن السفر
                  </Button>
                  <Button size="sm" style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }} onClick={() => { setTafsirDialogType('chapter'); setTafsirBookName(currentVideoBookName); setTafsirChapter(currentVideoChapter); setChapterSubView('tafsir'); setTafsirText(null); setTafsirLoading(true); fetchChapterTafsir(currentVideoBookName, currentVideoChapter).then(t => { setTafsirText(t); setTafsirLoading(false); }).catch(() => setTafsirLoading(false)); }}>
                    <BookText className="w-4 h-4 ml-1" />تفسير الإصحاح
                  </Button>
                </div>
                {currentVideoId ? (
                  <YouTubeCard videoId={currentVideoId} start={currentVideoStart} end={currentVideoEnd} />
                ) : (
                  <div className="aspect-video flex items-center justify-center bg-muted rounded-lg">
                    <p className="text-muted-foreground text-center p-8 font-display">لا توجد ملفات صوتية أو مرئية لهذا الإصحاح</p>
                  </div>
                )}
                <Button variant="outline" onClick={() => setChapterSubView('verses')} className="mt-4 w-full border-primary text-primary font-semibold">
                  <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
                </Button>
                <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t">
                  <Button variant="outline" onClick={goToVideoPrevReading} disabled={videoReadingIndex <= 0} className="flex-1" data-testid="button-video-prev-reading">
                    <ChevronRight className="w-4 h-4 ml-2" />السابق
                  </Button>
                  <span className="text-xs text-muted-foreground shrink-0">{currentVideoBookName} {currentVideoChapter}</span>
                  <Button onClick={goToVideoNextReading} disabled={videoReadingIndex >= getVideoReadingsList().length - 1} className="flex-1" data-testid="button-video-next-reading">
                    التالي<ChevronLeft className="w-4 h-4 mr-2" />
                  </Button>
                </div>
              </div>
            )}

            {chapterSubView === 'verses' && (
              <div className="flex items-center justify-between gap-4 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={goToPrevCustomReading}
                  disabled={customReadingIndex === 0}
                  className="flex-1"
                >
                  <ArrowRight className="w-4 h-4 ml-2" />
                  السابق
                </Button>

                <Button
                  onClick={goToNextCustomReading}
                  disabled={customReadingIndex >= customReadings.length - 1}
                  className="flex-1"
                >
                  التالي
                  <ArrowLeft className="w-4 h-4 mr-2" />
                </Button>
              </div>
            )}
          </Card>
        </motion.div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              <span className="font-semibold text-foreground">قراءاتي ({customReadings.length})</span>
            </div>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-reading">
                  <Plus className="w-4 h-4 ml-1" />
                  إضافة
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>إضافة قراءة جديدة</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">السفر</label>
                    <Select value={selectedBookId} onValueChange={setSelectedBookId}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر السفر" />
                      </SelectTrigger>
                      <SelectContent>
                        {allBooks.map((book) => (
                          <SelectItem key={book.id} value={book.id.toString()}>
                            {book.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">الإصحاح</label>
                    <Select value={selectedChapter} onValueChange={setSelectedChapter}>
                      <SelectTrigger>
                        <SelectValue placeholder="اختر الإصحاح" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedBookData && Array.from(
                          { length: selectedBookData.chaptersCount }, 
                          (_, i) => i + 1
                        ).map((ch) => (
                          <SelectItem key={ch} value={ch.toString()}>
                            الإصحاح {ch}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={addCustomReading} 
                    className="w-full"
                    disabled={!selectedBookId}
                  >
                    إضافة
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {customReadings.length === 0 ? (
            <Card className="p-8 text-center">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold text-foreground mb-2">لا توجد قراءات بعد</h3>
              <p className="text-sm text-muted-foreground mb-4">
                أضف قراءات خاصة بك لتتابعها يومياً
              </p>
              <Button onClick={() => setAddDialogOpen(true)}>
                <Plus className="w-4 h-4 ml-1" />
                إضافة قراءة
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {customReadings.map((reading, index) => (
                <Card
                  key={reading.id}
                  className="p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => openCustomReading(index)}
                  data-testid={`custom-reading-${index}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-foreground">
                      {reading.bookName} - الإصحاح {reading.chapter}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustomReading(reading.id);
                    }}
                    data-testid={`remove-reading-${index}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );

  return (
    <>
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead dynamicSEO={dynamicSEO} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
            <CalendarDays className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">خطط القراءة</h1>
            <p className="text-sm text-muted-foreground">اختر خطة تناسب وقتك وأهدافك</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => { setChapterSubView('verses'); setActiveTab(v); }} className="mb-6">
          <TabsList className="w-full grid grid-cols-2 h-12">
            <TabsTrigger value="plans" className="text-base" data-testid="tab-plans">
              <CalendarDays className="w-4 h-4 ml-2" />
              خطط القراءة
            </TabsTrigger>
            <TabsTrigger value="my-readings" className="text-base" data-testid="tab-my-readings">
              <Star className="w-4 h-4 ml-2" />
              قراءتي اليومية
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="mt-4">
            <AnimatePresence mode="wait">
              {viewMode === 'plans' && renderPlansView()}
              {viewMode === 'days' && renderDaysView()}
              {viewMode === 'reading' && renderReadingView()}
              {viewMode === 'chapter' && renderChapterView()}
            </AnimatePresence>
          </TabsContent>

          <TabsContent value="my-readings" className="mt-4">
            {renderMyReadings()}
          </TabsContent>
        </Tabs>
      </motion.div>

    </div>

    <Dialog open={listenChoiceOpen} onOpenChange={setListenChoiceOpen}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-center">
            استمع للإصحاح — {listenChoiceBook} {listenChoiceChapter}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button
            className="gap-2 justify-start"
            style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
            onClick={() => {
              setCurrentVideoBookName(listenChoiceBook);
              setCurrentVideoChapter(listenChoiceChapter);
              setVideoSource(listenChoiceSource);
              if (listenChoiceChante) {
                setCurrentVideoId(listenChoiceChante.id);
                setCurrentVideoStart(listenChoiceChante.start);
                setCurrentVideoEnd(listenChoiceChante.end);
              }
              setIsChantedMode(true);
              if (listenChoiceSource === 'plan') setVideoReadingIndex(currentReadingIndex);
              else setVideoReadingIndex(customReadingIndex);
              setChapterSubView('video');
              setListenChoiceOpen(false);
            }}
          >
            <Music className="w-4 h-4" />
            استمع له مرتلاً
          </Button>
          <Button
            variant="outline"
            className="gap-2 justify-start"
            onClick={() => {
              setCurrentVideoBookName(listenChoiceBook);
              setCurrentVideoChapter(listenChoiceChapter);
              setVideoSource(listenChoiceSource);
              setCurrentVideoId(listenChoiceRegular);
              setCurrentVideoStart(undefined);
              setCurrentVideoEnd(undefined);
              setIsChantedMode(false);
              if (listenChoiceSource === 'plan') setVideoReadingIndex(currentReadingIndex);
              else setVideoReadingIndex(customReadingIndex);
              setChapterSubView('video');
              setListenChoiceOpen(false);
            }}
          >
            <Volume2 className="w-4 h-4" />
            استمع له كقراءة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
