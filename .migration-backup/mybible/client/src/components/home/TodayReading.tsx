import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, ChevronLeft, ChevronRight, BookMarked, X, Loader2, Volume2, BookText, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { registerPushSubscription, unregisterPushSubscription } from '@/lib/push-notifications';
import { getTodayReadings, type DailyReading } from '@/lib/daily-reading-engine';
import { fetchBookIntro, fetchChapterTafsir, fetchVerseTafsir } from '@/lib/tafsir-csv-service';
import { getVideoId } from '@/lib/video-links-data';
import { TafsirText } from '@/components/TafsirText';

type NotifState = 'unsupported' | 'idle' | 'loading' | 'subscribed';

export function TodayReading() {
  const [notifState, setNotifState] = useState<NotifState>('idle');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tafsirDialogOpen, setTafsirDialogOpen] = useState(false);
  const [tafsirDialogType, setTafsirDialogType] = useState<'intro' | 'chapter' | 'verse'>('chapter');
  const [tafsirVerseNum, setTafsirVerseNum] = useState<number>(0);
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [videoModalOpen, setVideoModalOpen] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [videoReadingIndex, setVideoReadingIndex] = useState(0);
  const [viewingChapter, setViewingChapter] = useState<number | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotifState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') return;
    navigator.serviceWorker.getRegistration('/sw.js').then(reg => {
      if (!reg) return;
      reg.pushManager.getSubscription().then(sub => {
        if (sub) setNotifState('subscribed');
      });
    });
  }, []);

  const handleNotification = async () => {
    if (notifState === 'subscribed') {
      setNotifState('loading');
      await unregisterPushSubscription();
      setNotifState('idle');
      toast.success('تم إلغاء تذكير القراءة اليومية');
      return;
    }
    setNotifState('loading');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setNotifState('idle');
      toast.error('لم يتم منح إذن الإشعارات');
      return;
    }
    const ok = await registerPushSubscription();
    if (ok) {
      setNotifState('subscribed');
      toast.success('سيصلك تذكير بقراءة اليوم كل صباح الساعة 8 ✓');
    } else {
      setNotifState('idle');
      toast.error('حدث خطأ أثناء تفعيل الإشعارات');
    }
  };

  const dailyReadings = useMemo(() => {
    try {
      return getTodayReadings();
    } catch {
      return null;
    }
  }, []);

  const readings = dailyReadings?.readings ?? [];
  const activeReading: DailyReading | null = readings[currentIndex] ?? null;

  const { data: allOldBooks } = useQuery({
    queryKey: ['books', 'old'],
    queryFn: () => api.books.getByTestament('old'),
  });

  const { data: allNewBooks } = useQuery({
    queryKey: ['books', 'new'],
    queryFn: () => api.books.getByTestament('new'),
  });

  const allBooks = useMemo(() => [...(allOldBooks || []), ...(allNewBooks || [])], [allOldBooks, allNewBooks]);

  const activeBook = useMemo(() => {
    if (!activeReading) return null;
    return allBooks.find(b => b.name === activeReading.bookName) ?? null;
  }, [activeReading, allBooks]);

  const effectiveChapter = viewingChapter ?? activeReading?.chapter ?? 1;

  const { data: verses, isLoading: versesLoading } = useQuery({
    queryKey: ['verses', activeBook?.id, effectiveChapter],
    queryFn: () => api.verses.getByBook(activeBook!.id, effectiveChapter),
    enabled: viewerOpen && !!activeBook && !!activeReading,
  });

  function openViewer(index: number) {
    setCurrentIndex(index);
    setViewingChapter(null);
    setViewerOpen(true);
  }

  function goNext() {
    if (currentIndex < readings.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setViewingChapter(null);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setViewingChapter(null);
    }
  }

  const videoReading = readings[videoReadingIndex] ?? null;

  function handleListenClick() {
    if (!activeReading) return;
    setVideoReadingIndex(currentIndex);
    const videoId = getVideoId(activeReading.bookName, effectiveChapter);
    setCurrentVideoId(videoId);
    setVideoModalOpen(true);
  }

  function goToVideoPrevReading() {
    if (videoReadingIndex <= 0) return;
    const newIndex = videoReadingIndex - 1;
    const prevReading = readings[newIndex];
    if (!prevReading) return;
    setVideoReadingIndex(newIndex);
    setCurrentIndex(newIndex);
    setViewingChapter(null);
    setCurrentVideoId(getVideoId(prevReading.bookName, prevReading.chapter));
  }

  function goToVideoNextReading() {
    if (videoReadingIndex >= readings.length - 1) return;
    const newIndex = videoReadingIndex + 1;
    const nextReading = readings[newIndex];
    if (!nextReading) return;
    setVideoReadingIndex(newIndex);
    setCurrentIndex(newIndex);
    setViewingChapter(null);
    setCurrentVideoId(getVideoId(nextReading.bookName, nextReading.chapter));
  }

  function handleBookIntro() {
    if (!activeReading) return;
    setTafsirDialogType('intro');
    setTafsirDialogOpen(true);
    setTafsirText(null);
    setTafsirLoading(true);
    fetchBookIntro(activeReading.bookName)
      .then(text => { setTafsirText(text); setTafsirLoading(false); })
      .catch(() => setTafsirLoading(false));
  }

  function handleChapterTafsir() {
    if (!activeReading) return;
    setTafsirDialogType('chapter');
    setTafsirDialogOpen(true);
    setTafsirText(null);
    setTafsirLoading(true);
    fetchChapterTafsir(activeReading.bookName, effectiveChapter)
      .then(text => { setTafsirText(text); setTafsirLoading(false); })
      .catch(() => setTafsirLoading(false));
  }

  function handleVerseTafsir(verseNum: number) {
    if (!activeReading) return;
    setTafsirDialogType('verse');
    setTafsirVerseNum(verseNum);
    setTafsirDialogOpen(true);
    setTafsirText(null);
    setTafsirLoading(true);
    fetchVerseTafsir(activeReading.bookName, effectiveChapter, verseNum)
      .then(text => { setTafsirText(text); setTafsirLoading(false); })
      .catch(() => setTafsirLoading(false));
  }

  const typeConfig = {
    old: { colorBg: 'bg-blue-500/5', colorBorder: 'border-blue-500/10', colorIcon: 'text-blue-600 dark:text-blue-400', colorBgIcon: 'bg-blue-500/10', label: 'العهد القديم' },
    new: { colorBg: 'bg-emerald-500/5', colorBorder: 'border-emerald-500/10', colorIcon: 'text-emerald-600 dark:text-emerald-400', colorBgIcon: 'bg-emerald-500/10', label: 'العهد الجديد' },
    psalm: { colorBg: 'bg-amber-500/5', colorBorder: 'border-amber-500/10', colorIcon: 'text-amber-600 dark:text-amber-400', colorBgIcon: 'bg-amber-500/10', label: 'مزمور' },
  };

  if (!dailyReadings || readings.length === 0) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
        <Card className="overflow-hidden bg-card border-border/50 shadow-md">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center shadow-md">
                <BookOpen className="w-5 h-5 text-accent-foreground" />
              </div>
              <h2 className="font-display text-xl font-bold text-foreground">اقرأ إيه النهارده؟</h2>
            </div>
            <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-readings">
              لا توجد قراءات متاحة اليوم
            </p>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        <Card className="overflow-hidden bg-card border-border/50 shadow-md hover:shadow-lg transition-shadow">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent/80 flex items-center justify-center shadow-md">
                <BookOpen className="w-5 h-5 text-accent-foreground" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-foreground">
                  اقرأ إيه النهارده؟
                </h2>
                <p className="text-xs text-muted-foreground">
                  قراءات اليوم من الكتاب المقدس
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              {readings.map((reading, idx) => {
                const cfg = typeConfig[reading.type];
                return (
                  <button
                    key={idx}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl ${cfg.colorBg} border ${cfg.colorBorder} text-right hover:opacity-80 transition-opacity cursor-pointer`}
                    onClick={() => openViewer(idx)}
                    data-testid={`reading-card-${reading.type}`}
                  >
                    <div className={`w-8 h-8 rounded-lg ${cfg.colorBgIcon} flex items-center justify-center`}>
                      {reading.type === 'psalm' ? (
                        <span className="text-sm">🎵</span>
                      ) : (
                        <BookMarked className={`w-4 h-4 ${cfg.colorIcon}`} />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`text-xs ${cfg.colorIcon} font-medium`}>{cfg.label}</p>
                      <p className="text-sm font-semibold text-foreground" data-testid={`text-reading-${reading.type}`}>
                        {reading.label}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <Button
              className="w-full bg-gradient-to-l from-accent to-accent/90 hover:from-accent/90 hover:to-accent/80 text-accent-foreground shadow-md"
              onClick={() => openViewer(0)}
              data-testid="button-start-reading"
            >
              ابدأ القراءة
              <ChevronLeft className="w-4 h-4 mr-2" />
            </Button>

            {notifState !== 'unsupported' && (
              <Button
                variant={notifState === 'subscribed' ? 'default' : 'outline'}
                size="sm"
                className={cn('w-full mt-2', notifState === 'subscribed' && 'bg-green-600 hover:bg-green-700 text-white')}
                onClick={handleNotification}
                disabled={notifState === 'loading'}
                data-testid="button-toggle-reading-notifications"
              >
                {notifState === 'subscribed' ? (
                  <><BellOff className="w-4 h-4 ml-1" />إلغاء تذكير القراءة اليومية</>
                ) : (
                  <><Bell className="w-4 h-4 ml-1" />تذكير بقراءة اليوم يومياً</>
                )}
              </Button>
            )}
          </div>
        </Card>
      </motion.div>

      <Dialog open={viewerOpen} onOpenChange={(open) => { setViewerOpen(open); if (!open) setViewingChapter(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0" data-testid="dialog-daily-reader">
          <DialogHeader className="p-4 pb-2 border-b">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setViewerOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
              <DialogTitle className="font-display text-lg" data-testid="text-reader-title">
                {activeReading ? `${activeReading.bookName} - الإصحاح ${effectiveChapter}` : ''}
              </DialogTitle>
              <div className="text-xs text-muted-foreground">
                {currentIndex + 1} / {readings.length}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4" dir="rtl">
            {versesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="mr-2 text-sm text-muted-foreground">جاري التحميل...</span>
              </div>
            ) : verses && verses.length > 0 ? (
              <>
                <div className="mb-4 pb-3 border-b flex flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleListenClick}
                    className="bg-gradient-to-r from-primary to-primary/80"
                    data-testid="daily-button-listen"
                  >
                    <Volume2 className="w-4 h-4 ml-1" />
                    استمع للإصحاح
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleBookIntro}
                    className="bg-gradient-to-r from-primary to-primary/80"
                    data-testid="daily-button-intro"
                  >
                    <BookOpen className="w-4 h-4 ml-1" />
                    مقدمة عن السفر
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleChapterTafsir}
                    className="bg-gradient-to-r from-primary to-primary/80"
                    data-testid="daily-button-chapter-tafsir"
                  >
                    <BookText className="w-4 h-4 ml-1" />
                    تفسير الإصحاح
                  </Button>
                </div>
                <div className="space-y-4 font-display text-lg md:text-xl leading-loose">
                  {verses.map((verse) => (
                    <div key={verse.id} className="group flex items-start gap-1">
                      <p className="flex-1 p-1" data-testid={`daily-verse-${verse.verse}`}>
                        <span className="text-primary font-bold ml-2">{verse.verse}</span>
                        {verse.text}
                      </p>
                      <button
                        className="mt-2 px-2 py-1 rounded text-xs font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors shrink-0 whitespace-nowrap"
                        onClick={() => handleVerseTafsir(verse.verse)}
                        data-testid={`daily-button-verse-tafsir-${verse.verse}`}
                      >
                        تفسير الآية
                      </button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                لا توجد آيات متاحة
              </p>
            )}
          </div>

          <div className="p-3 border-t flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={goPrev}
              disabled={currentIndex === 0}
              className="flex-1"
              data-testid="button-prev-reading"
            >
              <ChevronRight className="w-4 h-4 ml-2" />
              السابق
            </Button>
            <span className="text-xs text-muted-foreground font-medium shrink-0 px-2">
              {activeReading ? typeConfig[activeReading.type].label : ''}
            </span>
            <Button
              onClick={goNext}
              disabled={currentIndex === readings.length - 1}
              className="flex-1"
              data-testid="button-next-reading"
            >
              التالي
              <ChevronLeft className="w-4 h-4 mr-2" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={tafsirDialogOpen} onOpenChange={setTafsirDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col" data-testid="dialog-daily-commentary">
          <DialogHeader>
            <DialogTitle className="text-right font-display" data-testid="text-daily-commentary-title">
              {tafsirDialogType === 'intro'
                ? `مقدمة عن سفر ${activeReading?.bookName}`
                : tafsirDialogType === 'verse'
                ? `تفسير ${activeReading?.bookName} ${effectiveChapter}:${tafsirVerseNum}`
                : `تفسير ${activeReading?.bookName} - الإصحاح ${effectiveChapter}`}
            </DialogTitle>
          </DialogHeader>
          <div className="text-right flex-1 overflow-hidden flex flex-col">
            {tafsirLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="mr-2 text-sm text-muted-foreground">جاري تحميل التفسير...</span>
              </div>
            ) : tafsirText ? (
              <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: '60vh' }}>
                <div className="p-4 bg-primary/5 rounded-lg whitespace-pre-wrap text-lg leading-loose font-body" dir="rtl" data-testid="text-daily-tafsir-content">
                  <TafsirText text={tafsirText} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center p-4" data-testid="text-daily-no-tafsir">
                لا يوجد تفسير متاح حاليًا.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={videoModalOpen} onOpenChange={(open) => { setVideoModalOpen(open); if (!open) setCurrentVideoId(null); }}>
        <DialogContent className="max-w-3xl" data-testid="dialog-daily-video">
          <DialogHeader>
            <DialogTitle className="text-right font-display flex items-center justify-between">
              <span>استمع للإصحاح - {videoReading?.bookName} {videoReading?.chapter}</span>
              <Button variant="ghost" size="sm" onClick={() => setVideoModalOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="aspect-video w-full relative">
            {currentVideoId ? (
              <>
                <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg z-0">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
                <iframe
                  key={currentVideoId}
                  width="100%"
                  height="100%"
                  src={`https://www.youtube-nocookie.com/embed/${currentVideoId}?rel=0&modestbranding=1`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="rounded-lg relative z-10"
                />
              </>
            ) : (
              <div className="flex items-center justify-center h-full bg-muted rounded-lg">
                <p className="text-muted-foreground text-center p-8 font-display">
                  لا توجد ملفات صوتية أو مرئية لهذا الإصحاح حالياً
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 pt-3 border-t">
            <Button
              variant="outline"
              onClick={goToVideoPrevReading}
              disabled={videoReadingIndex <= 0}
              className="flex-1"
              data-testid="button-video-prev-reading"
            >
              <ChevronRight className="w-4 h-4 ml-2" />
              السابق
            </Button>
            <span className="text-sm text-muted-foreground font-medium shrink-0 text-center leading-tight">
              {videoReading?.bookName} {videoReading?.chapter}
            </span>
            <Button
              onClick={goToVideoNextReading}
              disabled={videoReadingIndex >= readings.length - 1}
              className="flex-1"
              data-testid="button-video-next-reading"
            >
              التالي
              <ChevronLeft className="w-4 h-4 mr-2" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
