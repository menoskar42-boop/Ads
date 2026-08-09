import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ScrollText, Eye, Clock, Check, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { DEUTEROCANONICAL_BOOKS } from '@/lib/group-auto-reading';
import { apocryphaBooks } from '@/lib/apocrypha-content';
import { fetchBookIntro, fetchVerseTafsir, fetchChapterTafsir } from '@/lib/tafsir-csv-service';

const MAX_MIN_SECONDS = 40;
const MIN_SCROLLS = 5;
const MIN_DEPTH = 80;
const QUEUE_KEY = 'offline_reading_queue';

// عتبة الوقت تتناسب مع حجم الإصحاح: الإصحاح الصغير لا يتطلب ٤٠ ثانية كاملة.
// ~٢ ثانية لكل آية، بحد أدنى ١٠ ثوانٍ وحد أقصى ٤٠ ثانية.
function minSecondsFor(verseCount: number): number {
  if (!verseCount) return MAX_MIN_SECONDS;
  return Math.max(10, Math.min(MAX_MIN_SECONDS, verseCount * 2));
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds} ثانية`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins} دقيقة و ${secs} ثانية` : `${mins} دقيقة`;
}

export function InlineChapterReader({ bookName: initialBookName, chapter: initialChapter, groupCode, assignmentId, userName, chapters, schedule, onComplete, onChapterDone }: {
  bookName: string;
  chapter: number;
  groupCode: string;
  assignmentId: number | null;
  userName: string;
  chapters?: number[];
  schedule?: { book: string; chapter: number }[];
  onComplete: () => void;
  onChapterDone?: (book: string, chapter: number) => void;
}) {
  const [currentBook, setCurrentBook] = useState(initialBookName);
  const [currentChapter, setCurrentChapter] = useState(initialChapter);
  const [verses, setVerses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [scrollCount, setScrollCount] = useState(0);
  const [scrollDepth, setScrollDepth] = useState(0);
  const [completing, setCompleting] = useState(false);
  const startTimeRef = useRef(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);

  const [tafsirOpen, setTafsirOpen] = useState(false);
  const [tafsirTitle, setTafsirTitle] = useState('');
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);

  const openTafsir = async (type: 'intro' | 'verse' | 'chapter', verseNum?: number) => {
    setTafsirOpen(true);
    setTafsirLoading(true);
    setTafsirText(null);
    if (type === 'intro') {
      setTafsirTitle(`مقدمة عن سفر ${currentBook}`);
      const text = await fetchBookIntro(currentBook);
      setTafsirText(text || 'لا توجد مقدمة متاحة لهذا السفر حالياً');
    } else if (type === 'chapter') {
      setTafsirTitle(`تفسير ${currentBook} — الإصحاح ${currentChapter}`);
      const text = await fetchChapterTafsir(currentBook, currentChapter);
      setTafsirText(text || 'لا يوجد تفسير متاح لهذا الإصحاح حالياً');
    } else if (verseNum !== undefined) {
      setTafsirTitle(`تفسير ${currentBook} ${currentChapter}:${verseNum}`);
      const text = await fetchVerseTafsir(currentBook, currentChapter, verseNum);
      setTafsirText(text || 'لا يوجد تفسير متاح لهذه الآية حالياً');
    }
    setTafsirLoading(false);
  };

  const { data: allBooks } = useQuery({ queryKey: ['books'], queryFn: api.books.getAll });

  const navigateTo = (book: string, ch: number) => {
    setCurrentBook(book);
    setCurrentChapter(ch);
    setVerses([]);
    setLoading(true);
    setElapsed(0);
    setScrollCount(0);
    setScrollDepth(0);
    startTimeRef.current = Date.now();
    lastScrollTop.current = 0;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isDeutero = DEUTEROCANONICAL_BOOKS.has(currentBook);
  const apocryphaBook = isDeutero ? apocryphaBooks.find(b => b.name === currentBook) : undefined;

  const bookData = allBooks?.find((b: any) => b.name === currentBook);
  const totalChapters = bookData?.chaptersCount || apocryphaBook?.chaptersCount || 0;
  const navSchedule: { book: string; chapter: number }[] = schedule && schedule.length > 0
    ? schedule
    : chapters && chapters.length > 0
      ? chapters.map(ch => ({ book: currentBook, chapter: ch }))
      : totalChapters > 0
        ? Array.from({ length: totalChapters }, (_, i) => ({ book: currentBook, chapter: i + 1 }))
        : [];
  const currentIdx = navSchedule.findIndex(s => s.book === currentBook && s.chapter === currentChapter);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < navSchedule.length - 1;

  useEffect(() => {
    const loadVerses = async () => {
      try {
        if (isDeutero) {
          const ch = apocryphaBook?.chapters.find(c => c.chapter === currentChapter);
          setVerses((ch?.verses || []).map(v => ({ id: `${currentBook}-${currentChapter}-${v.verse}`, verse: v.verse, text: v.text })));
          setLoading(false);
          return;
        }
        if (!allBooks) return;
        const book = allBooks.find((b: any) => b.name === currentBook);
        if (!book) { setLoading(false); return; }
        const data = await api.verses.getByBook(book.id, currentChapter);
        setVerses(data);
        if (assignmentId !== null) {
          fetch(`/api/groups/${groupCode}/assignments/${assignmentId}/open`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userName, bookName: currentBook, chapter: currentChapter }),
          }).catch(() => {});
        }
      } catch {
        toast.error('فشل تحميل الآيات');
      } finally {
        setLoading(false);
      }
    };
    loadVerses();
  }, [currentBook, currentChapter, allBooks]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (loading) return;
    const handleScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const scrollY = window.scrollY;
      if (Math.abs(scrollY - lastScrollTop.current) > 30) {
        setScrollCount(prev => prev + 1);
        lastScrollTop.current = scrollY;
      }
      const rect = el.getBoundingClientRect();
      const scrolledPast = window.innerHeight - rect.top;
      if (el.scrollHeight > 0) {
        const depth = Math.round(Math.min(Math.max(scrolledPast / el.scrollHeight, 0), 1) * 100);
        setScrollDepth(prev => Math.max(prev, depth));
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loading]);

  const minSeconds = minSecondsFor(verses.length);
  const condTime = elapsed >= minSeconds;
  const condScrolls = scrollCount >= MIN_SCROLLS;
  const condDepth = scrollDepth >= MIN_DEPTH;

  // تسجيل تلقائي بمجرد أن يقرأ العضو الإصحاح فعلاً (وقت مناسب + وصل لنهايته)
  // حتى لا تضيع القراءة إذا نسي الضغط على زر "اكتملت" — يعمل مرة واحدة لكل إصحاح.
  const recordedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading) return;
    if (!(condTime && condDepth)) return;
    const key = `${currentBook}|${currentChapter}`;
    if (recordedRef.current.has(key)) return;
    recordedRef.current.add(key);
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    recordReading(currentChapter, timeSpent)
      .then(() => onChapterDone?.(currentBook, currentChapter))
      .catch(() => { recordedRef.current.delete(key); });
  }, [condTime, condDepth, loading, currentBook, currentChapter]);

  const recordReading = async (chap: number, timeSpent: number) => {
    if (assignmentId !== null) {
      const url = `/api/groups/${groupCode}/assignments/${assignmentId}/read`;
      const body = { userName, bookName: currentBook, chapter: chap, timeSpent, scrollCount, scrollDepth };
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return res.ok ? await res.json() : {};
      } catch {
        try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); q.push({ url, body }); localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
        return {};
      }
    } else {
      const url = `/api/groups/${groupCode}/reading`;
      const body = { userName, book: currentBook, chapter: chap, timeSpent, scrollPercent: scrollDepth };
      try {
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch {
        try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); q.push({ url, body }); localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
      }
      return {};
    }
  };

  const handleFinishReading = async () => {
    setCompleting(true);
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    try {
      const result = await recordReading(currentChapter, timeSpent);
      onChapterDone?.(currentBook, currentChapter);
      if (result.allDone) {
        toast.success('🎉 مبروك! أنهيت كل القراءات المطلوبة', { duration: 5000 });
        onComplete();
      } else if (hasNext) {
        const next = navSchedule[currentIdx + 1];
        toast.success(`✓ ${currentBook} ${currentChapter} - ${formatTime(timeSpent)}`);
        navigateTo(next.book, next.chapter);
      } else {
        toast.success(`تم تسجيل قراءة ${currentBook} ${currentChapter} - ${formatTime(timeSpent)}`);
        onComplete();
      }
    } catch {
      toast.error('فشل تسجيل القراءة');
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className={`flex flex-col items-center p-2 rounded-lg text-sm font-semibold border transition-colors ${condTime ? 'bg-green-50 dark:bg-green-950/30 border-green-300 text-green-700' : 'bg-muted/50 border-border text-muted-foreground'}`}>
          <Clock className="w-4 h-4 mb-1" />
          <span>{elapsed >= minSeconds ? '✓' : `${elapsed}/${minSeconds}`} ث</span>
          <span className="text-[10px] font-normal">وقت القراءة</span>
        </div>
        <div className={`flex flex-col items-center p-2 rounded-lg text-xs font-semibold border transition-colors ${condScrolls ? 'bg-green-50 dark:bg-green-950/30 border-green-300 text-green-700' : 'bg-muted/50 border-border text-muted-foreground'}`}>
          <ScrollText className="w-4 h-4 mb-1" />
          <span>{scrollCount >= MIN_SCROLLS ? '✓' : `${scrollCount}/${MIN_SCROLLS}`}</span>
          <span className="text-[10px] font-normal">تمريرات</span>
        </div>
        <div className={`flex flex-col items-center p-2 rounded-lg text-xs font-semibold border transition-colors ${condDepth ? 'bg-green-50 dark:bg-green-950/30 border-green-300 text-green-700' : 'bg-muted/50 border-border text-muted-foreground'}`}>
          <Eye className="w-4 h-4 mb-1" />
          <span>{scrollDepth >= MIN_DEPTH ? '✓' : `${scrollDepth}%`}</span>
          <span className="text-[10px] font-normal">عمق القراءة</span>
        </div>
      </div>

      <div ref={containerRef} className="rounded-lg border p-4 bg-background" dir="rtl">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-xl font-bold text-primary">{currentBook} — الإصحاح {currentChapter}</h3>
            {navSchedule.length > 1 && (
              <span className="text-xs text-muted-foreground">{currentIdx + 1} / {navSchedule.length}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-sm h-10" onClick={() => openTafsir('intro')}>
              <BookOpen className="w-4 h-4 text-indigo-500" />
              مقدمة السفر
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-sm h-10" onClick={() => openTafsir('chapter')}>
              <ScrollText className="w-4 h-4 text-emerald-500" />
              تفسير الإصحاح
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {verses.map((v: any) => (
            <div key={v.id} className="flex gap-2 items-start border-b border-border/30 pb-2 last:border-0">
              <p className="flex-1 text-xl leading-loose font-display">
                <span className="text-primary font-bold ml-1">{v.verse}</span>
                {v.text}
              </p>
              <button
                onClick={() => openTafsir('verse', v.verse)}
                className="flex-shrink-0 mt-2 flex flex-col items-center gap-0.5 text-muted-foreground hover:text-primary transition-colors px-1"
                title={`تفسير الآية ${v.verse}`}
              >
                <BookOpen className="w-4 h-4" />
                <span className="text-[9px]">تفسير</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        {hasPrev && (
          <Button variant="outline" size="lg" className="h-14 text-base gap-1 px-4 shrink-0" onClick={() => { const p = navSchedule[currentIdx - 1]; navigateTo(p.book, p.chapter); }}>
            <ChevronDown className="w-5 h-5 rotate-90" />
            السابق
          </Button>
        )}
        <Button onClick={handleFinishReading} disabled={completing} className="h-14 text-base font-bold flex-1 min-w-0" size="lg">
          {completing ? <Loader2 className="w-4 h-4 animate-spin ml-1 shrink-0" /> : <Check className="w-4 h-4 ml-1 shrink-0" />}
          <span className="truncate">{hasNext ? 'اكتملت ← التالي' : 'اكتملت القراءة ✅'}</span>
        </Button>
      </div>

      <Dialog open={tafsirOpen} onOpenChange={setTafsirOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-right">{tafsirTitle}</DialogTitle>
          </DialogHeader>
          {tafsirLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <p className="text-sm leading-loose whitespace-pre-wrap text-foreground font-display" dir="rtl">{tafsirText}</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
