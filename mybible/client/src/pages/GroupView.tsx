import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Users, BookOpen, BarChart3, MessageCircle, Settings, Check, X, Copy, Loader2, LogOut, Shield, ShieldOff, Trophy, Award, Target, Share2, AlertTriangle, ArrowRight, Clock, Plus, Eye, Trash2, ChevronDown, ChevronUp, ScrollText, UserPlus, Link2, Zap, RotateCcw, Play, Search } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OT_BOOKS, NT_BOOKS, OT_FLAT, NT_FLAT, getAutoReadingForDate, todayStr, findFlatIndex, DEUTEROCANONICAL_BOOKS, type AutoReadingConfig } from '@/lib/group-auto-reading';
import { apocryphaBooks } from '@/lib/apocrypha-content';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { SEOHead } from '@/components/SEOHead';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getUserGroupEntry, addUserGroup, removeUserGroup } from '@/lib/user-groups';
import { fetchBookIntro, fetchVerseTafsir, fetchChapterTafsir, getCSVFileName } from '@/lib/tafsir-csv-service';
import { OfflineManager } from '@/components/OfflineManager';

interface GroupData {
  group: any;
  members: any[];
  stats: { totalMembers: number; readToday: number; chaptersRead: number };
}

function RankStars({ count }: { count: number }) {
  const levels = [
    { min: 200, stars: 5, color: 'text-amber-500', label: 'قارئ متميّز — ٢٠٠ إصحاح فأكثر' },
    { min: 100, stars: 4, color: 'text-amber-400', label: 'قارئ أمين — ١٠٠ إصحاح فأكثر' },
    { min: 50,  stars: 3, color: 'text-yellow-400', label: 'قارئ نشيط — ٥٠ إصحاح فأكثر' },
    { min: 15,  stars: 2, color: 'text-sky-400',    label: 'قارئ منتظم — ١٥ إصحاح فأكثر' },
    { min: 4,   stars: 1, color: 'text-blue-400',   label: 'قارئ مبتدئ — ٤ إصحاحات فأكثر' },
  ];
  const level = levels.find(l => count >= l.min);
  if (!level) return null;
  return (
    <span className="inline-flex gap-px" title={level.label}>
      {Array.from({ length: level.stars }).map((_, i) => (
        <span key={i} className={`${level.color} text-base leading-none`}>★</span>
      ))}
    </span>
  );
}

function getMedal(index: number): string {
  if (index === 0) return '🥇';
  if (index === 1) return '🥈';
  if (index === 2) return '🥉';
  return `${index + 1}`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds} ثانية`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins} دقيقة و ${secs} ثانية` : `${mins} دقيقة`;
}

const MIN_SECONDS = 40;
const MIN_SCROLLS = 5;
const MIN_DEPTH = 80;

function InlineChapterReader({ bookName: initialBookName, chapter: initialChapter, groupCode, assignmentId, userName, chapters, schedule, onComplete, onChapterDone }: {
  bookName: string;
  chapter: number;
  groupCode: string;
  assignmentId: number | null;
  userName: string;
  chapters?: number[];
  schedule?: {book: string; chapter: number}[];
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

  // Navigate between chapters (cross-testament supported)
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
    // Scroll to top of page so chapter starts from the beginning
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // الأسفار القانونية الثانية محتواها مخزّن محلياً (apocrypha-content) وليس في الـ API
  const isDeutero = DEUTEROCANONICAL_BOOKS.has(currentBook);
  const apocryphaBook = isDeutero ? apocryphaBooks.find(b => b.name === currentBook) : undefined;

  // Build navigation schedule (cross-testament: {book,chapter}[])
  const bookData = allBooks?.find((b: any) => b.name === currentBook);
  const totalChapters = bookData?.chaptersCount || apocryphaBook?.chaptersCount || 0;
  const navSchedule: {book: string; chapter: number}[] = schedule && schedule.length > 0
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
        // الأسفار القانونية الثانية — تُحمّل من المحتوى المحلي
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

  const condTime = elapsed >= MIN_SECONDS;
  const condScrolls = scrollCount >= MIN_SCROLLS;
  const condDepth = scrollDepth >= MIN_DEPTH;

  const QUEUE_KEY = 'offline_reading_queue';
  const recordReading = async (chap: number, timeSpent: number) => {
    if (assignmentId !== null) {
      const url = `/api/groups/${groupCode}/assignments/${assignmentId}/read`;
      const body = { userName, bookName: currentBook, chapter: chap, timeSpent, scrollCount, scrollDepth };
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return res.ok ? await res.json() : {};
      } catch {
        try {
          const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
          q.push({ url, body });
          localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
        } catch {}
        return {};
      }
    } else {
      const url = `/api/groups/${groupCode}/reading`;
      const body = { userName, book: currentBook, chapter: chap, timeSpent, scrollPercent: scrollDepth };
      try {
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch {
        try {
          const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
          q.push({ url, body });
          localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
        } catch {}
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
        toast.success('🎉 مبروك! أنهيت كل القراءات المطلوبة اليوم', { duration: 5000 });
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
      {/* مؤشرات القراءة */}
      <div className="grid grid-cols-3 gap-2">
        <div className={`flex flex-col items-center p-2 rounded-lg text-sm font-semibold border transition-colors ${condTime ? 'bg-green-50 dark:bg-green-950/30 border-green-300 text-green-700' : 'bg-muted/50 border-border text-muted-foreground'}`}>
          <Clock className="w-4 h-4 mb-1" />
          <span>{elapsed >= MIN_SECONDS ? '✓' : `${elapsed}/${MIN_SECONDS}`} ث</span>
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

      {/* منطقة القراءة — بدون تمرير داخلي لإظهار كل الآيات */}
      <div ref={containerRef} className="rounded-lg border p-4 bg-background" dir="rtl">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-xl font-bold text-primary">{currentBook} — الإصحاح {currentChapter}</h3>
            {navSchedule.length > 1 && (
              <span className="text-xs text-muted-foreground">{currentIdx + 1} / {navSchedule.length}</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-sm h-10" onClick={() => openTafsir('intro')} data-testid="button-book-intro">
              <BookOpen className="w-4 h-4 text-indigo-500" />
              مقدمة السفر
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-sm h-10" onClick={() => openTafsir('chapter')} data-testid="button-chapter-tafsir">
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
                data-testid={`button-verse-tafsir-${v.verse}`}
              >
                <BookOpen className="w-4 h-4" />
                <span className="text-[9px]">تفسير</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* أزرار التنقل + الإنهاء */}
      <div className="flex gap-2 mt-4">
        {hasPrev && (
          <Button variant="outline" size="lg" className="h-14 text-base gap-1 px-4 shrink-0" onClick={() => { const p = navSchedule[currentIdx - 1]; navigateTo(p.book, p.chapter); }} data-testid="button-prev-chapter">
            <ChevronDown className="w-5 h-5 rotate-90" />
            السابق
          </Button>
        )}
        <Button onClick={handleFinishReading} disabled={completing} className="h-14 text-base font-bold flex-1 min-w-0" size="lg" data-testid="button-finish-reading">
          {completing ? <Loader2 className="w-4 h-4 animate-spin ml-1 shrink-0" /> : <Check className="w-4 h-4 ml-1 shrink-0" />}
          <span className="truncate">{hasNext ? 'اكتملت ← التالي' : 'اكتملت القراءة ✅'}</span>
        </Button>
      </div>

      {/* Dialog التفسير */}
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

function AssignmentSection({ groupCode, isAdmin, memberKey, userName, allBooks, onReadComplete }: {
  groupCode: string;
  isAdmin: boolean;
  memberKey: string;
  userName: string;
  allBooks: any[];
  onReadComplete?: () => void;
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportAssignmentId, setReportAssignmentId] = useState<number | null>(null);
  const [readingChapter, setReadingChapter] = useState<{ assignmentId: number; bookName: string; chapter: number; isLastChapter: boolean; chapters?: number[] } | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number> | null>(null);
  const [completedAssignmentIds, setCompletedAssignmentIds] = useState<Set<number>>(new Set());

  const [assignType, setAssignType] = useState<'daily' | 'weekly'>('daily');
  const [assignTestament, setAssignTestament] = useState<'old' | 'new' | ''>('');
  const [assignBook, setAssignBook] = useState('');
  const [assignChapters, setAssignChapters] = useState<number[]>([]);
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDeadline, setAssignDeadline] = useState('');

  const { data: assignmentsData, refetch: refetchAssignments } = useQuery({
    queryKey: ['assignments', groupCode],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupCode}/assignments`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!groupCode,
  });

  const assignments = assignmentsData?.assignments || [];

  // فتح كل القراءات بشكل افتراضي، وفتح أي قراءة جديدة تُضاف لاحقاً
  useEffect(() => {
    if (assignments.length === 0) return;
    setExpandedIds(prev => {
      const next = new Set<number>(prev ?? new Set<number>());
      let changed = false;
      for (const a of assignments) {
        if (!next.has(a.id)) { next.add(a.id); changed = true; }
      }
      return changed ? next : (prev ?? next);
    });
  }, [assignments]);

  // Pre-warm offline cache: fetch verses + tafsir for all assignment chapters in background
  useEffect(() => {
    if (!assignments.length || !allBooks.length) return;
    if (!('caches' in window)) return;
    const controller = new AbortController();
    (async () => {
      const cache = await caches.open('mybible-static-v1');
      for (const a of assignments) {
        const chapters: number[] = (a.chapters as number[]) || [];
        const book = allBooks.find((b: any) => b.name === a.bookName);
        const csvName = getCSVFileName(a.bookName);
        for (const ch of chapters) {
          if (controller.signal.aborted) return;
          // Verses
          if (book) {
            const versesUrl = `/api/verses/book/${book.id}?chapter=${ch}`;
            if (!(await cache.match(versesUrl))) {
              try { const r = await fetch(versesUrl, { signal: controller.signal }); if (r.ok) await cache.put(versesUrl, r); } catch {}
            }
          }
          // Tafsir
          if (csvName) {
            const tafsirUrl = `/api/tafsir/chapter/${encodeURIComponent(csvName)}/${ch}`;
            if (!(await cache.match(tafsirUrl))) {
              try { const r = await fetch(tafsirUrl, { signal: controller.signal }); if (r.ok) await cache.put(tafsirUrl, r); } catch {}
            }
          }
          // Small delay to avoid hammering the server
          await new Promise(res => setTimeout(res, 120));
        }
      }
    })();
    return () => controller.abort();
  }, [assignments, allBooks]);

  const currentExpandedIds = expandedIds ?? new Set<number>();

  // جلب progress لكل قراءة مفتوحة بشكل مستقل
  const progressResults = useQueries({
    queries: assignments.map((a: any) => ({
      queryKey: ['assignment-progress', groupCode, a.id],
      queryFn: async () => {
        const res = await fetch(`/api/groups/${groupCode}/assignments/${a.id}/progress`);
        if (!res.ok) throw new Error();
        return res.json();
      },
      enabled: !!groupCode && currentExpandedIds.has(a.id),
    })),
  });

  const getProgressDataForAssignment = (assignmentId: number) => {
    const idx = assignments.findIndex((a: any) => a.id === assignmentId);
    return idx >= 0 ? progressResults[idx]?.data : null;
  };

  const refetchProgress = () => {
    progressResults.forEach(r => r.refetch?.());
  };

  const { data: reportData } = useQuery({
    queryKey: ['assignment-report', groupCode, reportAssignmentId],
    queryFn: async () => {
      if (!reportAssignmentId) return null;
      const res = await fetch(`/api/groups/${groupCode}/assignments/${reportAssignmentId}/admin-report`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!reportAssignmentId,
  });

  const createAssignment = async () => {
    if (!assignBook || assignChapters.length === 0) {
      toast.error('اختر السفر والإصحاحات المطلوبة');
      return;
    }

    try {
      const res = await fetch(`/api/groups/${groupCode}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderKey: memberKey,
          userName,
          type: assignType,
          title: assignTitle || null,
          bookName: assignBook,
          chapters: assignChapters,
          deadline: assignDeadline || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إضافة القراءة المطلوبة');
      setCreateOpen(false);
      setAssignTestament('');
      setAssignBook('');
      setAssignChapters([]);
      setAssignTitle('');
      setAssignDeadline('');
      refetchAssignments();
    } catch {
      toast.error('فشل إنشاء القراءة المطلوبة');
    }
  };

  const deleteAssignment = async (assignmentId: number) => {
    try {
      await fetch(`/api/groups/${groupCode}/assignments/${assignmentId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey }),
      });
      toast.success('تم حذف القراءة');
      refetchAssignments();
    } catch {
      toast.error('فشل الحذف');
    }
  };

  const handleReadComplete = () => {
    setReadingChapter(null);
    refetchProgress();
    refetchAssignments();
    queryClient.invalidateQueries({ queryKey: ['leaderboard', groupCode] });
    onReadComplete?.();
  };

  const getMyProgress = (assignmentId: number, chapters: number[]) => {
    const pd = getProgressDataForAssignment(assignmentId) as any;
    const mp = pd?.memberProgress?.[userName];
    if (!mp) return { completed: 0, total: chapters.length };
    return { completed: mp.completed || 0, total: chapters.length };
  };

  const isChapterCompleted = (assignmentId: number, chapter: number) => {
    const pd = getProgressDataForAssignment(assignmentId) as any;
    const mp = pd?.memberProgress?.[userName];
    if (!mp) return false;
    return mp.chapters?.[chapter]?.completed || false;
  };

  const getChapterData = (assignmentId: number, chapter: number) => {
    const pd = getProgressDataForAssignment(assignmentId) as any;
    return pd?.memberProgress?.[userName]?.chapters?.[chapter];
  };

  if (readingChapter) {
    return (
      <Card className="p-5 mb-6 border-emerald-200 dark:border-emerald-800/30" data-testid="card-inline-reader">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            <h3 className="font-display font-bold text-foreground">{readingChapter.bookName} {readingChapter.chapter}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setReadingChapter(null)} data-testid="button-close-reader">
            <X className="w-4 h-4 ml-1" />
            إغلاق
          </Button>
        </div>
        <InlineChapterReader
          bookName={readingChapter.bookName}
          chapter={readingChapter.chapter}
          groupCode={groupCode}
          assignmentId={readingChapter.assignmentId}
          userName={userName}
          chapters={readingChapter.chapters}
          onComplete={handleReadComplete}
        />
      </Card>
    );
  }

  return (
    <>
      {assignments.length > 0 && assignments.every((a: any) => {
        const p = getMyProgress(a.id, a.chapters || []);
        return p.completed >= p.total && p.total > 0;
      }) && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800 text-center mb-4">
          <p className="text-2xl mb-1">🎉</p>
          <p className="font-display font-bold text-green-700 dark:text-green-400">مبروك! أنهيت كل القراءات المطلوبة</p>
          <p className="text-xs text-green-600/80 dark:text-green-400/70 mt-1">«اَلَّذِينَ يَزْرَعُونَ بِالدُّمُوعِ يَحْصُدُونَ بِالتَّرَنُّمِ» (مز ١٢٦: ٥)</p>
        </div>
      )}

      {assignments.length > 0 && (
        <div className="mb-6 space-y-4">
          {assignments.map((a: any) => {
            const chapters = (a.chapters as number[]) || [];
            const isExpanded = currentExpandedIds.has(a.id);
            const myProg = getMyProgress(a.id, chapters);
            const isDone = myProg.completed >= myProg.total && myProg.total > 0;

            return (
              <Card key={a.id} className="p-5 border-emerald-200 dark:border-emerald-800/30" data-testid={`card-assignment-${a.id}`}>
                <div
                  className="flex items-center justify-between mb-2 cursor-pointer select-none"
                  onClick={() => setExpandedIds(prev => {
                    const next = new Set<number>(prev ?? new Set<number>());
                    if (next.has(a.id)) next.delete(a.id); else next.add(a.id);
                    return next;
                  })}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                      <BookOpen className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-display font-bold text-foreground text-sm">{a.title || `قراءة ${a.type === 'daily' ? 'يومية' : 'أسبوعية'}`}</h4>
                        <Badge variant={a.type === 'daily' ? 'default' : 'secondary'} className="text-xs">
                          {a.type === 'daily' ? 'يومية' : 'أسبوعية'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{a.bookName} - {chapters.length} إصحاح</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1 text-indigo-600 text-xs" onClick={e => { e.stopPropagation(); setReportAssignmentId(a.id); setReportOpen(true); }} data-testid={`button-report-${a.id}`}>
                          <Eye className="w-3.5 h-3.5" />
                          تقرير
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 px-2 gap-1 text-red-500 text-xs" onClick={e => { e.stopPropagation(); deleteAssignment(a.id); }} data-testid={`button-delete-assignment-${a.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                          حذف
                        </Button>
                      </>
                    )}
                    <div className="h-7 w-7 flex items-center justify-center" data-testid={`button-expand-${a.id}`}>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>
                {a.deadline && <p className="text-xs text-muted-foreground mb-2">الموعد النهائي: {a.deadline}</p>}

                {isExpanded && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-3 pt-3 border-t">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">تقدمك</span>
                      <span className="font-semibold">{myProg.completed} / {myProg.total} إصحاح</span>
                    </div>
                    <Progress value={myProg.total > 0 ? Math.min((myProg.completed / myProg.total) * 100, 100) : 0} className="h-2 mb-3" />

                    {isDone && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-center mb-3">
                        <p className="text-amber-700 dark:text-amber-400 font-bold text-sm">✝️ أحسنت! أكملت قراءة {a.bookName}</p>
                        <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-1">«مَنْ يَثْبُتْ إِلَى الْمُنْتَهَى فَذَاكَ يَخْلُصُ» (مت ٢٤: ١٣)</p>
                      </div>
                    )}

                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {chapters.map((ch: number) => {
                        const done = isChapterCompleted(a.id, ch);
                        const chapterData = getChapterData(a.id, ch);
                        return (
                          <button
                            key={ch}
                            onClick={() => {
                              if (done) return;
                              const remaining = chapters.filter((c: number) => !isChapterCompleted(a.id, c));
                              setReadingChapter({ assignmentId: a.id, bookName: a.bookName, chapter: ch, isLastChapter: remaining.length === 1, chapters: remaining });
                            }}
                            disabled={done}
                            className={`relative p-4 rounded-xl border text-center transition-all ${
                              done
                                ? 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800'
                                : 'bg-background border-border hover:border-primary hover:shadow-md cursor-pointer active:scale-95'
                            }`}
                            data-testid={`button-chapter-${a.id}-${ch}`}
                          >
                            <span className={`font-bold text-xl ${done ? 'text-green-600' : 'text-foreground'}`}>{ch}</span>
                            {done && (
                              <div className="mt-1">
                                <Check className="w-5 h-5 text-green-500 mx-auto" />
                                {chapterData && (
                                  <span className="text-[10px] text-green-600 block mt-0.5">{formatTime(chapterData.timeSpent)}</span>
                                )}
                              </div>
                            )}
                            {!done && <p className="text-xs text-primary font-semibold mt-1">▶ اقرأ</p>}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <Card className="p-5 mb-6 border-dashed border-2 border-emerald-300 dark:border-emerald-700 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setCreateOpen(true)} data-testid="card-create-assignment">
          <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400">
            <Plus className="w-5 h-5" />
            <span className="font-bold">إضافة قراءة مطلوبة للمجموعة</span>
          </div>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setAssignTestament(''); setAssignBook(''); setAssignChapters([]); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة قراءة مطلوبة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* نوع القراءة */}
            <div>
              <Label>نوع القراءة</Label>
              <div className="flex gap-2 mt-1">
                <Button variant={assignType === 'daily' ? 'default' : 'outline'} size="sm" onClick={() => setAssignType('daily')} data-testid="button-type-daily">يومية</Button>
                <Button variant={assignType === 'weekly' ? 'default' : 'outline'} size="sm" onClick={() => setAssignType('weekly')} data-testid="button-type-weekly">أسبوعية</Button>
              </div>
            </div>

            {/* عنوان */}
            <div>
              <Label>عنوان (اختياري)</Label>
              <Input value={assignTitle} onChange={e => setAssignTitle(e.target.value)} placeholder="مثال: قراءة يوم الأحد" data-testid="input-assign-title" />
            </div>

            {/* العهد */}
            <div>
              <Label>العهد</Label>
              <select
                value={assignTestament}
                onChange={e => { setAssignTestament(e.target.value as 'old' | 'new' | ''); setAssignBook(''); setAssignChapters([]); }}
                className="w-full border rounded-md p-2 bg-background text-foreground"
                data-testid="select-assign-testament"
              >
                <option value="">اختر العهد</option>
                <option value="old">العهد القديم</option>
                <option value="new">العهد الجديد</option>
              </select>
            </div>

            {/* السفر */}
            {assignTestament && (
              <div>
                <Label>السفر</Label>
                <select
                  value={assignBook}
                  onChange={e => { setAssignBook(e.target.value); setAssignChapters([]); }}
                  className="w-full border rounded-md p-2 bg-background text-foreground"
                  data-testid="select-assign-book"
                >
                  <option value="">اختر السفر</option>
                  {allBooks?.filter((b: any) => b.testament === assignTestament).map((b: any) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* الإصحاحات */}
            {assignBook && (() => {
              const book = allBooks?.find((b: any) => b.name === assignBook);
              const total = book?.chaptersCount || 0;
              return total > 0 ? (
                <div>
                  <Label>الإصحاحات المطلوبة ({assignChapters.length} مختار)</Label>
                  <div className="flex gap-2 mb-2 mt-1 flex-wrap">
                    <Button type="button" size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => setAssignChapters(Array.from({ length: total }, (_, i) => i + 1))}>
                      اختر الكل
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => setAssignChapters([])}>
                      مسح الكل
                    </Button>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5 max-h-40 overflow-y-auto p-1">
                    {Array.from({ length: total }, (_, i) => i + 1).map(ch => {
                      const selected = assignChapters.includes(ch);
                      return (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setAssignChapters(prev =>
                            selected ? prev.filter(c => c !== ch) : [...prev, ch].sort((a, b) => a - b)
                          )}
                          className={`rounded-md py-1.5 text-sm font-semibold border transition-colors ${
                            selected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background border-border hover:border-primary'
                          }`}
                          data-testid={`chapter-btn-${ch}`}
                        >
                          {ch}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null;
            })()}

            {assignType === 'weekly' && (
              <div>
                <Label>الموعد النهائي</Label>
                <Input type="date" value={assignDeadline} onChange={e => setAssignDeadline(e.target.value)} data-testid="input-assign-deadline" />
              </div>
            )}

            <Button onClick={createAssignment} className="w-full" data-testid="button-create-assignment">إضافة القراءة</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reportOpen} onOpenChange={(o) => { setReportOpen(o); if (!o) setReportAssignmentId(null); }}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-indigo-500" />
              تقرير متابعة القراءة
            </DialogTitle>
          </DialogHeader>
          {reportData?.report ? (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg text-sm flex items-center justify-between">
                <div>
                  <p className="font-bold">{reportData.assignment?.title || reportData.assignment?.bookName}</p>
                  <p className="text-muted-foreground">{reportData.assignment?.bookName} — {(reportData.assignment?.chapters as number[])?.length} إصحاح</p>
                </div>
                <div className="text-left text-xs text-muted-foreground space-y-1">
                  <p>أنهوا: <span className="font-bold text-green-600">{reportData.report.filter((m: any) => m.completedChapters === m.totalChapters).length}</span></p>
                  <p>في التقدم: <span className="font-bold text-amber-600">{reportData.report.filter((m: any) => m.completedChapters > 0 && m.completedChapters < m.totalChapters).length}</span></p>
                  <p>لم يبدأوا: <span className="font-bold text-red-500">{reportData.report.filter((m: any) => m.completedChapters === 0 && !m.openedChapters).length}</span></p>
                </div>
              </div>

              {reportData.report.map((m: any) => {
                const pct = m.totalChapters > 0 ? (m.completedChapters / m.totalChapters) * 100 : 0;
                const isComplete = m.completedChapters === m.totalChapters;
                const hasStarted = m.completedChapters > 0 || m.openedChapters > 0;
                return (
                  <Card key={m.userName} className={`p-4 border-l-4 ${isComplete ? 'border-l-green-500' : hasStarted ? 'border-l-amber-400' : 'border-l-red-400'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{m.userName}</span>
                          {isComplete && <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 text-xs">✓ أنهى</Badge>}
                          {!isComplete && hasStarted && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 text-xs">جارٍ</Badge>}
                          {!hasStarted && <Badge variant="outline" className="text-red-500 text-xs">لم يبدأ</Badge>}
                        </div>
                        {m.lastActivity && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            آخر نشاط: {new Date(m.lastActivity).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{m.completedChapters}/{m.totalChapters} إصحاح</span>
                        {m.totalTime > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(m.totalTime)}</span>}
                        {m.avgScrollDepth > 0 && <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{m.avgScrollDepth}% عمق</span>}
                      </div>
                    </div>

                    <Progress value={Math.min(pct, 100)} className={`h-1.5 mb-3 ${isComplete ? '[&>div]:bg-green-500' : '[&>div]:bg-amber-400'}`} />

                    <div className="flex flex-wrap gap-1.5">
                      {m.chapterDetails.map((cd: any) => {
                        let bg = 'bg-muted/60 text-muted-foreground border border-border';
                        let icon = '—';
                        let tooltip = 'لم يُفتح بعد';
                        if (cd.completed) {
                          const qual = cd.quality;
                          bg = qual === 'genuine'
                            ? 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-300'
                            : qual === 'fast'
                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 border border-orange-300'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 border border-blue-300';
                          icon = '✓';
                          tooltip = `${formatTime(cd.timeSpent)} — عمق ${cd.scrollDepth}%${cd.completedAt ? ' — ' + new Date(cd.completedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''}`;
                        } else if (cd.opened) {
                          bg = 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 border border-amber-300';
                          icon = '◑';
                          tooltip = `فتح الإصحاح${cd.openedAt ? ' الساعة ' + new Date(cd.openedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : ''} ولم يكمل`;
                        }
                        return (
                          <div key={cd.chapter} className={`text-[11px] px-2 py-1 rounded-md font-mono ${bg} cursor-default select-none`} title={tooltip}>
                            <span className="font-semibold">{cd.chapter}</span>
                            <span className="mr-1">{icon}</span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                      <span>✓ أنهى</span>
                      <span className="text-green-600">■ متأنٍ</span>
                      <span className="text-blue-600">■ عادي</span>
                      <span className="text-orange-500">■ سريع</span>
                      <span className="text-amber-600">◑ فتح فقط</span>
                      <span>— لم يفتح</span>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── كارت القراءة الموحّد مع التقويم ──────────────────────────────────────────
function DailyReadingCard({ autoReading, autoConfig, stats, progress, challengeTotal, groupCode, userName, memberKey, onReadComplete }: {
  autoReading: import('@/lib/group-auto-reading').DayAutoReading;
  autoConfig: import('@/lib/group-auto-reading').AutoReadingConfig;
  stats: { totalMembers: number; readToday: number; chaptersRead: number };
  progress: number;
  challengeTotal: number;
  groupCode: string;
  userName: string;
  memberKey: string;
  onReadComplete: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [showCalendar, setShowCalendar] = useState(false);
  const [reading, setReading] = useState<{ book: string; chapter: number; schedule: {book: string; chapter: number}[]; assignmentId?: number | null } | null>(null);

  // ── الإصحاحات غير المقروءة ─────────────────────────────────────────────
  const [unreadOpen, setUnreadOpen] = useState(false);
  const [unreadChapters, setUnreadChapters] = useState<{ book: string; chapter: number; assignmentId: number }[] | null>(null);
  const [unreadAssignmentId, setUnreadAssignmentId] = useState<number | null>(null);
  const [unreadHasAssignment, setUnreadHasAssignment] = useState<boolean | null>(null);
  const [unreadLoading, setUnreadLoading] = useState(false);

  const openUnread = async () => {
    setUnreadOpen(true);
    if (unreadChapters !== null) return; // مخزّن مسبقاً
    setUnreadLoading(true);
    try {
      // القراءة التلقائية مفعّلة → احسب المتبقّي من خطة القراءة نفسها (من تاريخ البدء حتى اليوم)
      if (autoConfig?.enabled && autoConfig?.baseDate) {
        // إصحاحات قرأها العضو
        const readSet = new Set<string>();
        try {
          const rc = await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(userName)}/read-chapters`);
          if (rc.ok) {
            const rd = await rc.json();
            for (const c of (rd.chapters || [])) readSet.add(`${c.book}|${c.chapter}`);
          }
        } catch {}

        // ولّد إصحاحات الخطة من تاريخ البدء حتى اليوم (بدون تكرار)
        const today = todayStr();
        const allChapters = OT_FLAT.length + NT_FLAT.length; // بعد جمعها كلها لا جديد
        const seen = new Set<string>();
        const scheduled: { book: string; chapter: number }[] = [];
        let cursor = autoConfig.baseDate;
        for (let i = 0; i <= 2000; i++) {
          const dr = getAutoReadingForDate(autoConfig, cursor);
          for (const c of [...dr.ot, ...dr.nt]) {
            const key = `${c.book}|${c.chapter}`;
            if (!seen.has(key)) { seen.add(key); scheduled.push({ book: c.book, chapter: c.chapter }); }
          }
          if (cursor >= today || seen.size >= allChapters) break;
          const nd = new Date(cursor + 'T00:00:00');
          nd.setDate(nd.getDate() + 1);
          cursor = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(nd.getDate()).padStart(2, '0')}`;
        }

        const remaining = scheduled.filter(c => !readSet.has(`${c.book}|${c.chapter}`));
        setUnreadHasAssignment(true);
        setUnreadAssignmentId(null);
        setUnreadChapters(remaining.map(c => ({ ...c, assignmentId: 0 })));
        return;
      }

      // غير ذلك → المهام اليدوية (assignments)
      const res = await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(userName)}/readings?memberKey=${encodeURIComponent(memberKey)}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setUnreadHasAssignment(d.hasAssignment !== false);
      setUnreadChapters(d.chapters || []);
      setUnreadAssignmentId(d.assignmentId ?? null);
    } catch {
      setUnreadHasAssignment(false);
      setUnreadChapters([]);
    } finally {
      setUnreadLoading(false);
    }
  };
  // إصحاحات منتهية اليوم — مخزّنة في localStorage
  const [doneChs, setDoneChs] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`daily_done_${groupCode}_${todayStr()}`) || '[]') as string[];
      return new Set(saved);
    } catch { return new Set(); }
  });

  const markChapterDone = (book: string, chapter: number) => {
    const chKey = `${book}_${chapter}`;
    setDoneChs(prev => {
      const next = new Set(prev);
      next.add(chKey);
      try { localStorage.setItem(`daily_done_${groupCode}_${todayStr()}`, JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const displayReading = useMemo(() => {
    try { return getAutoReadingForDate(autoConfig, selectedDate); } catch { return autoReading; }
  }, [selectedDate, autoConfig, autoReading]);

  const isToday = selectedDate === todayStr();

  // افتح إصحاحاً مع جدول كامل OT+NT لدعم التنقل المتتالي بين العهدين
  const openReading = (book: string, chapter: number) => {
    const schedule = [...displayReading.ot, ...displayReading.nt].map(c => ({ book: c.book, chapter: c.chapter }));
    setReading({ book, chapter, schedule });
  };

  // عند فتح إصحاح للقراءة المُتتبَّعة (يسجّل المدة/العمق/التمرير)
  if (reading) {
    return (
      <Card className="p-5 mb-6" data-testid="card-today-reading-inline">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <h3 className="font-display font-bold text-lg text-foreground">قراءة اليوم</h3>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setReading(null)}>
            <ArrowRight className="w-4 h-4 ml-1" />رجوع للقائمة
          </Button>
        </div>
        <InlineChapterReader
          bookName={reading.book}
          chapter={reading.chapter}
          groupCode={groupCode}
          assignmentId={reading.assignmentId ?? null}
          userName={userName}
          schedule={reading.schedule}
          onComplete={() => { setReading(null); onReadComplete(); }}
          onChapterDone={markChapterDone}
        />
      </Card>
    );
  }

  return (
    <Card className="p-5 mb-6" data-testid="card-today-reading">
      {/* رأس الكارت */}
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-amber-500" />
        <h3 className="font-display font-bold text-lg text-foreground">قراءة اليوم</h3>
        <div className="mr-auto flex items-center gap-2">
          {!isToday && (
            <Badge variant="secondary" className="text-xs">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
            </Badge>
          )}
          <Button
            variant="outline" size="sm"
            className="h-7 text-xs gap-1"
            onClick={openUnread}
            title="الإصحاحات المتبقية"
          >
            📋 {unreadChapters !== null ? `${unreadChapters.length} متبقٍ` : 'المتبقي'}
          </Button>
          <Button
            variant="outline" size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setShowCalendar(v => !v)}
          >
            📅 {isToday ? 'اليوم' : 'تغيير'}
          </Button>
        </div>
      </div>

      {/* منتقي التاريخ */}
      {showCalendar && (
        <div className="mb-4 p-2 border rounded-lg bg-muted/30">
          <input
            type="date"
            value={selectedDate}
            max={todayStr()}
            onChange={e => { setSelectedDate(e.target.value); setShowCalendar(false); }}
            className="w-full text-sm rounded px-2 py-1 border bg-background"
          />
          {!isToday && (
            <Button variant="ghost" size="sm" className="w-full mt-1 text-xs h-7"
              onClick={() => { setSelectedDate(todayStr()); setShowCalendar(false); }}>
              العودة لليوم
            </Button>
          )}
        </div>
      )}

      {/* الإصحاحات — كروت جاهزة للفتح (الضغط يفتح القراءة المُتتبَّعة لليوم) */}
      <div className="space-y-2.5 mb-4">
        {[...displayReading.ot.map(c => ({ ...c, testament: 'ot' as const })),
          ...displayReading.nt.map(c => ({ ...c, testament: 'nt' as const }))].map((c, i) => {
          const isOt = c.testament === 'ot';
          const isDone = isToday && doneChs.has(`${c.book}_${c.chapter}`);
          const cardCls = isDone
            ? 'border-green-300 dark:border-green-700/50 bg-green-50/60 dark:bg-green-950/20'
            : isOt
              ? 'border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40'
              : 'border-blue-200 dark:border-blue-800/40 bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-100 dark:hover:bg-blue-950/40';
          const iconBoxCls = isDone ? 'from-green-500 to-green-600' : isOt ? 'from-amber-500 to-amber-600' : 'from-blue-500 to-blue-600';
          const btnCls = isDone ? 'bg-green-600' : isOt ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-500 hover:bg-blue-600';
          const inner = (
            <>
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${iconBoxCls} flex items-center justify-center shrink-0`}>
                {isDone ? <Check className="w-5 h-5 text-white" /> : <BookOpen className="w-5 h-5 text-white" />}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <h4 className="font-display font-bold text-foreground text-base truncate">{c.book}</h4>
                <p className="text-base text-muted-foreground">الإصحاح {c.chapter}</p>
              </div>
              <span className={`shrink-0 text-white text-sm font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1 ${btnCls} transition-colors`}>
                {isDone ? <><Check className="w-3 h-3" />تمت</> : <><Play className="w-3 h-3" />اقرأ</>}
              </span>
            </>
          );
          // يفتح دائماً القارئ المُتتبَّع داخل الجروب (عداد الوقت/العمق) — حتى لأيام سابقة
          return (
            <button
              key={`${c.testament}-${i}`}
              onClick={() => openReading(c.book, c.chapter)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border ${cardCls} transition-colors cursor-pointer shadow-sm`}
              data-testid={`card-daily-chapter-${c.book}-${c.chapter}`}
            >
              {inner}
            </button>
          );
        })}
      </div>

      {/* إحصاء المجموعة */}
      <div className="border-t pt-3 flex items-center justify-between text-base">
        <span className="text-muted-foreground">{stats.totalMembers} عضو</span>
        <span className="font-semibold text-green-600">قرأ {stats.readToday} اليوم ✓</span>
      </div>
      {challengeTotal > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>تحدي القراءة</span>
            <span>{stats.chaptersRead} / {challengeTotal}</span>
          </div>
          <Progress value={Math.min(progress, 100)} className="h-1.5" />
        </div>
      )}

      {/* ── Dialog الإصحاحات المتبقية ─────────────────────────────────── */}
      <Dialog open={unreadOpen} onOpenChange={(o) => { setUnreadOpen(o); if (!o) setUnreadChapters(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto w-full max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              إصحاحاتي غير المقروءة
            </DialogTitle>
          </DialogHeader>
          {unreadLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : unreadChapters && unreadChapters.length === 0 ? (
            <div className="text-center py-8">
              {unreadHasAssignment === false ? (
                <>
                  <p className="text-3xl mb-2">📋</p>
                  <p className="font-semibold">لا توجد مهام قراءة محددة لك حالياً</p>
                  <p className="text-sm text-muted-foreground mt-1">تواصل مع الخادم لإضافة مهمة قراءة</p>
                </>
              ) : (
                <>
                  <p className="text-3xl mb-2">🎉</p>
                  <p className="font-semibold">أنهيت كل الإصحاحات المطلوبة</p>
                </>
              )}
            </div>
          ) : unreadChapters ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground mb-3">{unreadChapters.length} إصحاح متبقٍ</p>
              {unreadChapters.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground/40">○</span>
                    <span className="text-sm font-medium">{r.book} — إصحاح {r.chapter}</span>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                    setUnreadOpen(false);
                    setReading({
                      book: r.book,
                      chapter: r.chapter,
                      schedule: unreadChapters.map(c => ({ book: c.book, chapter: c.chapter })),
                      assignmentId: unreadAssignmentId,
                    });
                  }}>
                    <Play className="w-3 h-3" />
                    اقرأ
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function GroupView() {
  const params = useParams<{ groupId: string }>();
  const groupCode = params.groupId || '';
  const [, navigate] = useLocation();
  const [data, setData] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [missionOpen, setMissionOpen] = useState(false);
  const [challengeTotal, setChallengeTotal] = useState('');
  const [copied, setCopied] = useState(false);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [addAdminName, setAddAdminName] = useState('');
  const [addAdminPhone, setAddAdminPhone] = useState('');
  const [addAdminLoading, setAddAdminLoading] = useState(false);
  const [addAdminResult, setAddAdminResult] = useState<string | null>(null);
  const [linkJoinMode, setLinkJoinMode] = useState<'approval' | 'auto'>('approval');
  const [linkModeLoading, setLinkModeLoading] = useState(false);
  const [messagingMode, setMessagingMode] = useState<'all' | 'admin_only'>('all');
  const [messagingModeLoading, setMessagingModeLoading] = useState(false);
  const [reportActiveOpen, setReportActiveOpen] = useState(false);
  const [reportActiveSearch, setReportActiveSearch] = useState('');
  const [reportInactiveOpen, setReportInactiveOpen] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatLastMsg, setChatLastMsg] = useState<{ senderName: string; text: string } | null>(null);

  const [missionTitle, setMissionTitle] = useState('');
  const [missionBook, setMissionBook] = useState('');
  const [missionStart, setMissionStart] = useState('');
  const [missionEnd, setMissionEnd] = useState('');
  const [missionDeadline, setMissionDeadline] = useState('');

  // ── القراءات التلقائية ──────────────────────────────────────────────────────
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoOtChap, setAutoOtChap] = useState(3);
  const [autoNtChap, setAutoNtChap] = useState(1);
  const [autoOtBook, setAutoOtBook] = useState(OT_BOOKS[0][0]);
  const [autoOtChapter, setAutoOtChapter] = useState(1);
  const [autoNtBook, setAutoNtBook] = useState(NT_BOOKS[0][0]);
  const [autoNtChapter, setAutoNtChapter] = useState(1);
  const [autoSaving, setAutoSaving] = useState(false);

  // ── الدخول الضيف ──────────────────────────────────────────────────────────
  const [guestJoining, setGuestJoining] = useState(false);
  const [guestCreds, setGuestCreds] = useState<{ userName: string; memberKey: string } | null>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(`group_${groupCode}`) || '{}');
      return (s.isGuest && s.userName && s.memberKey) ? { userName: s.userName, memberKey: s.memberKey } : null;
    } catch { return null; }
  });
  const [isGuest, setIsGuest] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`group_${groupCode}`) || '{}').isGuest === true; } catch { return false; }
  });
  const [guestRegisterOpen, setGuestRegisterOpen] = useState(false);
  const [guestRegName, setGuestRegName] = useState('');
  const [guestRegPhone, setGuestRegPhone] = useState('');
  const [guestRegLoading, setGuestRegLoading] = useState(false);
  const [guestAccessEnabled, setGuestAccessEnabled] = useState(false);
  const [guestAccessLoading, setGuestAccessLoading] = useState(false);

  const stored = JSON.parse(localStorage.getItem(`group_${groupCode}`) || '{}');
  const userEntry = getUserGroupEntry(groupCode);
  const isAdmin = userEntry?.role === 'admin' || stored.isLeader || false;
  const memberKey = userEntry?.memberKey || stored.memberKey || guestCreds?.memberKey || '';
  const userName = userEntry?.userName || stored.userName || guestCreds?.userName || '';

  // Reactive admin state — starts from localStorage, updated when server confirms admin
  const [isAdminConfirmed, setIsAdminConfirmed] = useState(isAdmin);

  const { data: allBooks } = useQuery({
    queryKey: ['books'],
    queryFn: api.books.getAll,
  });

  const fetchGroup = useCallback(async () => {
    const CACHE_KEY = `group_arc_${groupCode}`;
    const DATA_CACHE_KEY = `group_data_${groupCode}`;
    try {
      // Pass our own memberKey so the server returns it on OUR row only (it now
      // hides every other member's key and phone). Self-identification below
      // still matches on m.memberKey === memberKey because our row keeps it.
      const _meParam = memberKey ? `?me=${encodeURIComponent(memberKey)}` : '';
      const res = await fetch(`/api/groups/${groupCode}${_meParam}`);
      if (!res.ok) throw new Error();
      const d = await res.json();
      setData(d);
      // حفظ بيانات الجروب كاملةً للاستخدام أوفلاين
      try { localStorage.setItem(DATA_CACHE_KEY, JSON.stringify(d)); } catch {}
      setChallengeTotal(d.group.challengeTotal?.toString() || '');
      setLinkJoinMode((d.group.linkJoinMode as 'approval' | 'auto') || 'approval');
      setMessagingMode((d.group.messagingMode as 'all' | 'admin_only') || 'all');
      setGuestAccessEnabled(!!d.group.guestAccessEnabled);
      // تحميل إعداد القراءات التلقائية
      const arc = d.group.autoReadingConfig;
      if (arc) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(arc)); } catch {}
        setAutoEnabled(arc.enabled ?? false);
        setAutoOtChap(arc.otChaptersPerDay ?? 3);
        setAutoNtChap(arc.ntChaptersPerDay ?? 1);
        const otEntry = OT_FLAT[arc.otStartIndex ?? 0];
        const ntEntry = NT_FLAT[arc.ntStartIndex ?? 0];
        if (otEntry) { setAutoOtBook(otEntry.book); setAutoOtChapter(otEntry.chapter); }
        if (ntEntry) { setAutoNtBook(ntEntry.book); setAutoNtChapter(ntEntry.chapter); }
      }
    } catch {
      // أوفلاين: استخدم بيانات الجروب المحفوظة كاملةً
      const cachedData = localStorage.getItem(DATA_CACHE_KEY);
      if (cachedData) {
        try {
          const d = JSON.parse(cachedData);
          setData((prev: any) => prev ?? d);
          const arc = d.group?.autoReadingConfig;
          if (arc) {
            setAutoEnabled(arc.enabled ?? false);
            setAutoOtChap(arc.otChaptersPerDay ?? 3);
            setAutoNtChap(arc.ntChaptersPerDay ?? 1);
            const otEntry = OT_FLAT[arc.otStartIndex ?? 0];
            const ntEntry = NT_FLAT[arc.ntStartIndex ?? 0];
            if (otEntry) { setAutoOtBook(otEntry.book); setAutoOtChapter(otEntry.chapter); }
            if (ntEntry) { setAutoNtBook(ntEntry.book); setAutoNtChapter(ntEntry.chapter); }
          }
        } catch {}
        setLoading(false);
        return;
      }
      // fallback: arc فقط
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        try {
          const arc = JSON.parse(stored);
          setData((prev: any) => prev ?? { group: { autoReadingConfig: arc }, members: [], stats: { totalMembers: 0, readToday: 0, chaptersRead: 0 } });
        } catch {}
        setLoading(false);
        return;
      }
      toast.error('فشل تحميل بيانات المجموعة');
    } finally {
      setLoading(false);
    }
  }, [groupCode, memberKey]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  // مزامنة تقدم القراءة المخزّن أوفلاين فور رجوع الاتصال
  useEffect(() => {
    const QUEUE_KEY = 'offline_reading_queue';
    const flush = async () => {
      try {
        const queue: { url: string; body: object }[] = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        if (!queue.length) return;
        const failed: typeof queue = [];
        for (const item of queue) {
          try {
            const res = await fetch(item.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item.body) });
            if (!res.ok) failed.push(item);
          } catch { failed.push(item); }
        }
        localStorage.setItem(QUEUE_KEY, JSON.stringify(failed));
        if (failed.length < queue.length) {
          toast.success('تم مزامنة تقدم القراءة مع السيرفر');
          fetchGroup();
          // تحديث الـ leaderboard وبيانات الأعضاء بعد المزامنة
          queryClient.invalidateQueries({ queryKey: ['leaderboard', groupCode] });
        }
      } catch {}
    };
    window.addEventListener('online', flush);
    // محاولة فور التحميل لو كان النت شغّال
    if (navigator.onLine) flush();
    return () => window.removeEventListener('online', flush);
  }, [fetchGroup]);

  // Pre-cache قراءات الـ 7 أيام الجاية أوفلاين
  useEffect(() => {
    const arc = data?.group?.autoReadingConfig;
    if (!arc?.enabled || !allBooks?.length || !('caches' in window)) return;
    const controller = new AbortController();
    (async () => {
      const cache = await caches.open('mybible-static-v1');
      const today = new Date();
      const urlsToCache: string[] = [];
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const d = new Date(today);
        d.setDate(d.getDate() + dayOffset);
        const dateStr = d.toISOString().slice(0, 10);
        const dayReading = getAutoReadingForDate(arc, dateStr);
        for (const ch of [...dayReading.ot, ...dayReading.nt]) {
          if (DEUTEROCANONICAL_BOOKS.has(ch.book)) continue; // embedded locally
          const book = (allBooks as any[]).find((b: any) => b.name === ch.book);
          if (book) urlsToCache.push(`/api/verses/book/${book.id}?chapter=${ch.chapter}`);
          const csvName = getCSVFileName(ch.book);
          if (csvName) urlsToCache.push(`/api/tafsir/chapter/${encodeURIComponent(csvName)}/${ch.chapter}`);
        }
      }
      for (const url of urlsToCache) {
        if (controller.signal.aborted) return;
        if (await cache.match(url)) continue;
        try { const r = await fetch(url, { signal: controller.signal }); if (r.ok) await cache.put(url, r); } catch {}
      }
    })();
    return () => controller.abort();
  }, [data?.group?.autoReadingConfig, allBooks]);

  // جلب ملخص الشات لعرض عداد الرسائل الجديدة
  useEffect(() => {
    if (!groupCode) return;
    const afterId = (() => { try { return parseInt(localStorage.getItem(`chat_lastread_${groupCode}`) || '0') || 0; } catch { return 0; } })();
    fetch(`/api/groups/${groupCode}/messages/summary?afterId=${afterId}`)
      .then(r => r.json())
      .then(d => {
        setChatUnreadCount(d.unreadCount || 0);
        if (d.lastMessage && d.lastSenderName) setChatLastMsg({ senderName: d.lastSenderName, text: d.lastMessage });
      })
      .catch(() => {});
  }, [groupCode]);

  // اشتراك تلقائي في إشعارات الجروب
  useEffect(() => {
    if (!groupCode || !memberKey || !userName) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const subscribeToPush = async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const vapidKey = await fetch('/api/push/vapid-key').then(r => r.json()).then(d => d.publicKey).catch(() => null);
        if (!vapidKey) return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
        await fetch(`/api/groups/${groupCode}/push-subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberKey, userName, subscription: sub.toJSON() }),
        });
      } catch {}
    };

    subscribeToPush();
  }, [groupCode, memberKey, userName]);

  // الدخول الضيف التلقائي — يُشغَّل عندما يكون الجروب يسمح بالضيوف والمستخدم بدون بيانات
  useEffect(() => {
    if (!data || userName || guestCreds || guestJoining) return;
    if (!data.group?.guestAccessEnabled) return;
    setGuestJoining(true);
    fetch(`/api/groups/${groupCode}/guest-join`, { method: 'POST', credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.userName && d.memberKey) {
          const creds = { userName: d.userName, memberKey: d.memberKey };
          setGuestCreds(creds);
          setIsGuest(true);
          localStorage.setItem(`group_${groupCode}`, JSON.stringify({
            userName: d.userName, memberKey: d.memberKey, isLeader: false, isGuest: true,
          }));
          addUserGroup({
            groupId: groupCode,
            groupName: (data as any).group?.name || '',
            churchName: (data as any).group?.churchName || '',
            role: 'member',
            userName: d.userName,
            memberKey: d.memberKey,
          });
          fetchGroup();
        }
      })
      .catch(() => toast.error('فشل الدخول التلقائي'))
      .finally(() => setGuestJoining(false));
  }, [data, userName, guestCreds, guestJoining, groupCode]);

  const handleGuestRegister = async () => {
    if (!guestRegName.trim()) return;
    setGuestRegLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupCode}/guest-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberKey, userName: guestRegName.trim(), phone: guestRegPhone.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      // لو كان اسمه موجوداً كعضو حقيقي (أدمن مثلاً) → استخدم مفتاحه الأصلي
      const realMemberKey = d.memberKey || memberKey;
      const realIsAdmin = d.isAdmin || false;
      // تحديث localStorage باسم حقيقي وإلغاء وضع الضيف
      localStorage.setItem(`group_${groupCode}`, JSON.stringify({
        userName: d.userName, memberKey: realMemberKey, isLeader: realIsAdmin, isGuest: false,
      }));
      addUserGroup({
        groupId: groupCode,
        groupName: (data as any)?.group?.name || '',
        churchName: (data as any)?.group?.churchName || '',
        role: realIsAdmin ? 'admin' : 'member',
        userName: d.userName,
        memberKey: realMemberKey,
      });
      setGuestCreds({ userName: d.userName, memberKey: realMemberKey });
      setIsGuest(false);
      setGuestRegisterOpen(false);
      if (d.merged) {
        // أعد تحميل الصفحة لتفعيل الأدمن status من localStorage الجديد
        toast.success('تم استعادة حسابك بنجاح!');
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.success('تم تسجيل اسمك بنجاح');
        fetchGroup();
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل التسجيل');
    } finally {
      setGuestRegLoading(false);
    }
  };

  const handleToggleGuestAccess = async (enabled: boolean) => {
    setGuestAccessLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupCode}/guest-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, enabled }),
      });
      if (!res.ok) throw new Error();
      setGuestAccessEnabled(enabled);
      toast.success(enabled ? 'تم تفعيل الدخول الضيف' : 'تم إيقاف الدخول الضيف');
    } catch {
      toast.error('فشل تحديث الإعداد');
    } finally {
      setGuestAccessLoading(false);
    }
  };

  useEffect(() => {
    if (!data || !userName) return;
    const { members: mbs, group: grp } = data as any;
    // Find by exact match or by name+isAdmin (fallback when memberKey is missing)
    const me = mbs?.find((m: any) => m.userName === userName && m.memberKey === memberKey)
      || (memberKey ? null : mbs?.find((m: any) => m.userName === userName && m.isAdmin === true));
    const serverIsAdmin = me?.isAdmin === true || grp?.leaderKey === memberKey;
    if (serverIsAdmin) {
      if (!isAdminConfirmed) setIsAdminConfirmed(true);
      if (!isAdmin) {
        const restoredKey = me?.memberKey || memberKey;
        const entry = getUserGroupEntry(groupCode);
        addUserGroup({
          ...(entry || {}),
          groupId: groupCode,
          groupName: grp?.name || entry?.groupName || '',
          churchName: grp?.churchName || entry?.churchName || '',
          role: 'admin',
          userName: userName,
          memberKey: restoredKey,
        } as any);
        const curr = JSON.parse(localStorage.getItem(`group_${groupCode}`) || '{}');
        localStorage.setItem(`group_${groupCode}`, JSON.stringify({ ...curr, isLeader: true, memberKey: restoredKey, userName }));
      }
    }
  }, [data, memberKey, userName, groupCode, isAdmin, isAdminConfirmed]);

  const { data: leaderboardData } = useQuery({
    queryKey: ['leaderboard', groupCode],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupCode}/leaderboard`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!groupCode,
  });

  const { data: missionData, refetch: refetchMission } = useQuery({
    queryKey: ['mission', groupCode],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupCode}/missions`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!groupCode,
  });

  const { data: pageAssignmentsData } = useQuery({
    queryKey: ['assignments', groupCode],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupCode}/assignments`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!groupCode,
  });
  const todayAssignment = ((pageAssignmentsData?.assignments || []) as any[]).find(
    (a: any) => a.type === 'daily' && a.isActive !== false
  ) ?? null;

  const { data: leaderReport } = useQuery({
    queryKey: ['leader-report', groupCode],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupCode}/leader-report?leaderKey=${encodeURIComponent(memberKey)}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!groupCode && isAdminConfirmed,
  });

  const queryClient = useQueryClient();

  const { data: joinRequestsData, refetch: refetchJoinRequests } = useQuery({
    queryKey: ['join-requests', groupCode, memberKey],
    queryFn: async () => {
      // The listing endpoint now requires an admin key, like approve/reject.
      const res = await fetch(`/api/groups/${groupCode}/join-requests?leaderKey=${encodeURIComponent(memberKey)}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    enabled: !!groupCode && isAdminConfirmed && !!memberKey,
  });

  const joinRequests = joinRequestsData?.joinRequests || [];

  const handleApproveRequest = async (requestId: number) => {
    try {
      const res = await fetch(`/api/groups/${groupCode}/join-requests/${requestId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم قبول العضو');
      refetchJoinRequests();
      fetchGroup();
    } catch {
      toast.error('فشل قبول الطلب');
    }
  };

  const handleRejectRequest = async (requestId: number) => {
    try {
      const res = await fetch(`/api/groups/${groupCode}/join-requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم رفض الطلب');
      refetchJoinRequests();
    } catch {
      toast.error('فشل رفض الطلب');
    }
  };

  // القراءة التلقائية لليوم (محسوبة من الإعداد)
  const todayAutoReading = useMemo(() => {
    const arc = data?.group?.autoReadingConfig;
    if (!arc?.enabled) return null;
    try { return getAutoReadingForDate(arc, todayStr()); } catch { return null; }
  }, [data?.group?.autoReadingConfig]);

  const saveAutoReading = async (enabled: boolean) => {
    setAutoSaving(true);
    try {
      const otIdx = findFlatIndex(OT_FLAT, autoOtBook, autoOtChapter);
      const ntIdx = findFlatIndex(NT_FLAT, autoNtBook, autoNtChapter);
      const config: AutoReadingConfig = {
        enabled,
        otChaptersPerDay: autoOtChap,
        ntChaptersPerDay: autoNtChap,
        baseDate: todayStr(),
        otStartIndex: otIdx,
        ntStartIndex: ntIdx,
      };
      const res = await fetch(`/api/groups/${groupCode}/auto-reading`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, config }),
      });
      if (!res.ok) throw new Error();
      toast.success(enabled ? 'تم تفعيل القراءات التلقائية' : 'تم إيقاف القراءات التلقائية');
      fetchGroup();
    } catch {
      toast.error('فشل الحفظ');
    } finally {
      setAutoSaving(false);
    }
  };

  const updateToday = async () => {
    try {
      const res = await fetch(`/api/groups/${groupCode}/today`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderKey: memberKey,
          challengeTotal: challengeTotal ? parseInt(challengeTotal) : 0,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم تحديث قراءة اليوم');
      setAdminOpen(false);
      fetchGroup();
    } catch {
      toast.error('فشل التحديث');
    }
  };

  const createMission = async () => {
    if (!missionTitle || !missionBook || !missionStart || !missionEnd || !missionDeadline) {
      toast.error('جميع الحقول مطلوبة');
      return;
    }
    try {
      const res = await fetch(`/api/groups/${groupCode}/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderKey: memberKey,
          userName,
          title: missionTitle,
          bookName: missionBook,
          startChapter: parseInt(missionStart),
          endChapter: parseInt(missionEnd),
          deadline: missionDeadline,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم إنشاء المهمة');
      setMissionOpen(false);
      setMissionTitle('');
      setMissionBook('');
      setMissionStart('');
      setMissionEnd('');
      setMissionDeadline('');
      refetchMission();
    } catch {
      toast.error('فشل إنشاء المهمة');
    }
  };

  const shareMission = async () => {
    const mission = missionData?.mission;
    if (!mission) return;
    const text = `انضم لمجموعة القراءة الروحية هذا الأسبوع واقرأ معنا ${mission.bookName} من الإصحاح ${mission.startChapter} إلى ${mission.endChapter}\n\nكود المجموعة: ${groupCode}\nhttps://mybible.oscardevs.com/groups/join`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'مهمة القراءة الأسبوعية', text });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(text);
    toast.success('تم نسخ رابط المهمة');
  };

  const removeMember = async (memberName: string) => {
    try {
      const res = await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(memberName)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey }),
      });
      if (!res.ok) throw new Error();
      toast.success('تم حذف العضو');
      fetchGroup();
    } catch {
      toast.error('فشل الحذف');
    }
  };

  const toggleMute = async (memberName: string, muted: boolean) => {
    try {
      await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(memberName)}/mute`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, muted }),
      });
      toast.success(muted ? 'تم كتم العضو' : 'تم إلغاء الكتم');
      fetchGroup();
    } catch {
      toast.error('فشل');
    }
  };

  const toggleAdmin = async (memberName: string, setAsAdmin: boolean) => {
    try {
      const res = await fetch(`/api/groups/${groupCode}/members/${encodeURIComponent(memberName)}/admin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, isAdmin: setAsAdmin }),
      });
      if (!res.ok) throw new Error();
      toast.success(setAsAdmin ? 'تم تعيينه كأدمن' : 'تم إزالة صلاحية الأدمن');
      fetchGroup();
    } catch {
      toast.error('فشل تغيير الدور');
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(groupCode);
      setCopied(true);
      toast.success('تم نسخ الكود');
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const leaveGroup = async () => {
    try {
      const res = await fetch(`/api/groups/${groupCode}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberKey }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || 'فشل المغادرة');
        return;
      }
      removeUserGroup(groupCode);
      toast.success('تم مغادرة المجموعة');
      navigate('/groups');
    } catch {
      toast.error('فشل المغادرة');
    }
  };

  const handleCopyInviteLink = async () => {
    const link = `${window.location.origin}/invite/${groupCode}`;
    const shareText = `انضم لمجموعة "${data?.group?.name || groupCode}" في تطبيق الكتاب المقدس رفيقي:\n${link}`;
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success('تم نسخ رابط الدعوة — شاركه مع أعضاء مجموعتك');
    } catch {
      // clipboard غير متاح — نعرض الرابط في toast
      toast.info(link, { duration: 8000 });
    }
  };

  const handleToggleLinkMode = async (newMode: 'approval' | 'auto') => {
    setLinkModeLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupCode}/link-mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, mode: newMode }),
      });
      if (!res.ok) throw new Error();
      setLinkJoinMode(newMode);
      toast.success(newMode === 'auto' ? 'الانضمام أصبح فورياً عبر الرابط' : 'الانضمام يتطلب موافقتك الآن');
    } catch {
      toast.error('فشل تحديث الإعداد');
    } finally {
      setLinkModeLoading(false);
    }
  };

  const handleToggleMessagingMode = async (newMode: 'all' | 'admin_only') => {
    setMessagingModeLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupCode}/messaging-mode`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, mode: newMode }),
      });
      if (!res.ok) throw new Error();
      setMessagingMode(newMode);
      toast.success(newMode === 'admin_only' ? 'الإرسال للأدمن فقط الآن' : 'كل الأعضاء يستطيعون الإرسال الآن');
    } catch {
      toast.error('فشل تحديث الإعداد');
    } finally {
      setMessagingModeLoading(false);
    }
  };

  const handleAddAdmin = async () => {
    if (!addAdminName.trim() || !addAdminPhone.trim()) {
      toast.error('الاسم ورقم الموبايل مطلوبان');
      return;
    }
    if (addAdminPhone.trim().length < 10) {
      toast.error('رقم الموبايل غير صحيح');
      return;
    }
    setAddAdminLoading(true);
    try {
      const res = await fetch(`/api/groups/${groupCode}/add-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderKey: memberKey, name: addAdminName.trim(), phone: addAdminPhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAddAdminResult(data.memberKey);
      fetchGroup();
    } catch (err: any) {
      toast.error(err.message || 'فشل إضافة الأدمن');
    } finally {
      setAddAdminLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="p-8 text-center">
          <h2 className="font-display text-xl font-bold mb-2">المجموعة غير موجودة</h2>
          <Link href="/groups"><Button variant="outline">العودة</Button></Link>
        </Card>
      </div>
    );
  }

  const { group, members, stats } = data;
  // الضيف يُعتبر عضو مباشرة (حتى لو في تأخير DB بعد أول دخول)
  // العضوية تُطابَق بالمفتاح (memberKey) وحده — لا تتأثر بتغيير الاسم أو تأخّر تحديث القائمة
  const isMember = (isGuest && !!memberKey) ||
    (!!memberKey && members.some((m: any) => m.memberKey === memberKey)) ||
    members.some((m: any) => m.userName === userName && m.isAdmin === true && !memberKey);

  const serverMember = members.find((m: any) => (memberKey && m.memberKey === memberKey) || (m.userName === userName && m.memberKey === memberKey));
  // Fallback: if memberKey is missing but name matches leader name
  const serverMemberByName = !serverMember && userName ? members.find((m: any) => m.userName === userName && m.isAdmin === true) : null;
  const isAdminFinal = isAdmin || serverMember?.isAdmin === true || group.leaderKey === memberKey || !!serverMemberByName;

  if (!isMember && !isAdminFinal) {
    if (guestJoining || (data?.group?.guestAccessEnabled && !userName)) {
      return (
        <div className="container mx-auto px-4 py-6 max-w-4xl flex items-center justify-center min-h-[50vh]">
          <div className="text-center space-y-3">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">جاري تسجيل دخولك تلقائياً...</p>
          </div>
        </div>
      );
    }
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Card className="p-8 text-center">
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h2 className="font-display text-xl font-bold mb-2">أنت لست عضواً في هذه المجموعة</h2>
          <p className="text-sm text-muted-foreground mb-4">اطلب من الخادم المسؤول قبول طلب الانضمام</p>
          <Link href="/groups"><Button variant="outline">العودة لمجموعاتي</Button></Link>
        </Card>
      </div>
    );
  }
  const progress = group.challengeTotal > 0 ? Math.round((stats.chaptersRead / group.challengeTotal) * 100) : 0;
  const leaderboard = leaderboardData?.leaderboard || [];
  const mission = missionData?.mission || null;
  const myMissionProgress = mission && missionData?.memberProgress ? (missionData.memberProgress[userName] || 0) : 0;
  const missionTotal = missionData?.totalChapters || 0;
  const missionCompleted = missionTotal > 0 && myMissionProgress >= missionTotal;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl text-[19px]">
      <SEOHead />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              {group.churchName && <p className="text-base font-semibold text-muted-foreground">{group.churchName}</p>}
              <h1 className="font-display text-2xl font-bold text-foreground">{group.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={copyCode} data-testid="button-copy-group-code">
              {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleCopyInviteLink} title="مشاركة رابط الانضمام" data-testid="button-share-invite">
              <Link2 className="w-4 h-4" />
            </Button>
            {isAdminFinal && (
              <Button variant="ghost" size="icon" onClick={() => setAdminOpen(true)} data-testid="button-admin">
                <Settings className="w-4 h-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate('/groups')} data-testid="button-back-groups">
              <ArrowRight className="w-4 h-4 ml-1" />
              رجوع
            </Button>
          </div>
        </div>

        {userName && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-gradient-to-l from-green-50 to-transparent dark:from-green-900/20 border border-green-200 dark:border-green-800/40">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {userName[0]}
            </div>
            <p className="text-sm text-foreground flex-1">
              <span className="text-muted-foreground">أهلاً</span>{' '}
              <span className="font-bold text-green-700 dark:text-green-400">{userName}</span>
              {isAdminFinal && <span className="text-xs text-muted-foreground"> — أنت أدمن هذه المجموعة</span>}
            </p>
            {isGuest && (
              <Button size="sm" variant="outline" className="text-xs shrink-0 h-7 px-2" onClick={() => setGuestRegisterOpen(true)}>
                <UserPlus className="w-3 h-3 ml-1" />
                سجّل اسمك
              </Button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mb-6">
          <Badge variant="secondary">كود: {groupCode}</Badge>
          <Badge variant="outline">الأدمن: {group.leaderName}</Badge>
          {isAdminFinal && <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 gap-1"><Shield className="w-3 h-3" /> أدمن</Badge>}
        </div>

        {/* ── كارت القراءة الموحّد ──────────────────────────────────────────── */}
        {todayAutoReading && (
          <DailyReadingCard
            autoReading={todayAutoReading}
            autoConfig={data.group.autoReadingConfig}
            stats={stats}
            progress={progress}
            challengeTotal={group.challengeTotal}
            groupCode={groupCode}
            userName={userName}
            memberKey={memberKey}
            onReadComplete={() => fetchGroup()}
          />
        )}
        {!todayAutoReading && (
          <Card className="p-5 mb-6" data-testid="card-group-stats">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-5 h-5 text-green-500" />
              <h3 className="font-display font-bold text-foreground">تقدم المجموعة</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">الأعضاء</span>
                <span className="font-semibold">{stats.totalMembers} عضو</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">قرأوا اليوم</span>
                <span className="font-semibold text-green-600">{stats.readToday}</span>
              </div>
              {group.challengeTotal > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">تحدي القراءة</span>
                    <span className="font-semibold">{stats.chaptersRead} / {group.challengeTotal}</span>
                  </div>
                  <Progress value={Math.min(progress, 100)} className="h-2" />
                </div>
              )}
            </div>
          </Card>
        )}

        <div id="assignment-section">
          <AssignmentSection
            groupCode={groupCode}
            isAdmin={isAdminFinal}
            memberKey={memberKey}
            userName={userName}
            allBooks={allBooks || []}
            onReadComplete={fetchGroup}
          />
        </div>

        {mission && (
          <Card className="p-5 mb-6 border-amber-200 dark:border-amber-800/30" data-testid="card-mission">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-500" />
                <h3 className="font-display font-bold text-foreground">مهمة القراءة الأسبوعية</h3>
              </div>
              <Button variant="ghost" size="sm" onClick={shareMission} data-testid="button-share-mission">
                <Share2 className="w-4 h-4 ml-1" />
                مشاركة
              </Button>
            </div>
            <p className="font-semibold text-primary mb-2">{mission.title}</p>
            <p className="text-sm text-muted-foreground mb-3">
              {mission.bookName} - الإصحاح {mission.startChapter} إلى {mission.endChapter} | الموعد: {mission.deadline}
            </p>
            <div className="mb-2">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">تقدمك</span>
                <span className="font-semibold">{myMissionProgress} / {missionTotal} إصحاح</span>
              </div>
              <Progress value={missionTotal > 0 ? Math.min((myMissionProgress / missionTotal) * 100, 100) : 0} className="h-2" />
            </div>
            {missionCompleted && (
              <div className="mt-2 p-2 rounded-lg bg-green-50 dark:bg-green-950/30 text-center">
                <p className="text-green-600 dark:text-green-400 font-bold text-sm">🎉 مبروك! أنهيت مهمة القراءة</p>
              </div>
            )}
            {missionData?.groupProgress !== undefined && (
              <div className="mt-3 pt-3 border-t">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">تقدم المجموعة هذا الأسبوع</span>
                  <span className="font-semibold">{missionData.groupProgress}%</span>
                </div>
                <Progress value={missionData.groupProgress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{missionData.completedMembers} من {missionData.totalMembers} أكملوا المهمة</p>
              </div>
            )}
          </Card>
        )}


        {leaderboard.length > 0 && (
          <Card className="p-5 mb-6" data-testid="card-leaderboard">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h3 className="font-display font-bold text-foreground">ترتيب القراءة في المجموعة</h3>
            </div>
            <div className="space-y-2">
              {leaderboard.map((entry: any, i: number) => (
                <div key={entry.userName} className={`flex items-center justify-between py-2 px-3 rounded-lg ${i < 3 ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-bold w-8 text-center">{getMedal(i)}</span>
                    <span className="font-medium text-sm">{entry.userName}</span>
                    <RankStars count={entry.chaptersReadCount} />
                  </div>
                  <span className="text-sm font-semibold text-muted-foreground">{entry.chaptersReadCount} إصحاح</span>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground mt-3 pt-2 border-t border-border/50 flex-wrap justify-center">
              <span className="flex items-center gap-1"><span className="text-blue-400">★</span> قارئ مبتدئ (٤+)</span>
              <span className="flex items-center gap-1"><span className="text-yellow-400">★★</span> قارئ نشيط (٢٥+)</span>
              <span className="flex items-center gap-1"><span className="text-amber-400">★★★</span> قارئ أمين (١٠٠+)</span>
            </div>
          </Card>
        )}

        <div className="mb-6">
          <OfflineManager />
        </div>

        {isAdminFinal && joinRequests.length > 0 && (
          <Card className="p-5 mb-4 border-amber-200 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-900/10" data-testid="card-join-requests">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-5 h-5 text-amber-500" />
              <h3 className="font-display font-bold text-foreground">طلبات انضمام ({joinRequests.length})</h3>
            </div>
            <div className="space-y-2">
              {joinRequests.map((req: any) => (
                <div key={req.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-sm font-medium">{req.userName}</span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                      onClick={() => handleApproveRequest(req.id)}
                      data-testid={`button-approve-${req.id}`}
                    >
                      <Check className="w-3 h-3 ml-1" />
                      قبول
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => handleRejectRequest(req.id)}
                      data-testid={`button-reject-${req.id}`}
                    >
                      <X className="w-3 h-3 ml-1" />
                      رفض
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <Link href={`/group/${groupCode}/members`}>
            <Card className="p-5 hover:shadow-lg transition-shadow cursor-pointer h-full" data-testid="card-members">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-blue-500" />
                <h3 className="font-display font-bold text-foreground">الأعضاء</h3>
              </div>
              <p className="text-3xl font-bold text-center my-2 text-foreground">{members.length}</p>
              <p className="text-sm text-muted-foreground text-center mb-3">
                <span className="text-green-600 font-semibold">{members.filter((m: any) => m.readToday).length}</span> قرأوا اليوم
              </p>
              <Button variant="outline" size="sm" className="w-full">عرض الأعضاء</Button>
            </Card>
          </Link>

          <Link href={`/group/${groupCode}/chat`}>
            <Card className="p-5 hover:shadow-lg transition-shadow cursor-pointer h-full" data-testid="card-chat">
              <div className="flex items-center gap-2 mb-2">
                <MessageCircle className="w-5 h-5 text-purple-500" />
                <h3 className="font-display font-bold text-foreground">شات المجموعة</h3>
                {chatUnreadCount > 0 && (
                  <Badge className="bg-green-500 text-white text-xs min-w-[20px] text-center mr-auto">
                    {chatUnreadCount}
                  </Badge>
                )}
              </div>
              {chatLastMsg ? (
                <p className="text-xs text-muted-foreground truncate">
                  <span className="font-semibold text-primary">{chatLastMsg.senderName}:</span> {chatLastMsg.text}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">تواصل مع أعضاء المجموعة</p>
              )}
              <Button variant="outline" size="sm" className={`mt-3 w-full ${chatUnreadCount > 0 ? 'border-green-400 text-green-700' : ''}`}>
                {chatUnreadCount > 0 ? `📨 ${chatUnreadCount} رسالة جديدة` : 'فتح الشات'}
              </Button>
            </Card>
          </Link>
        </div>

        {isAdminFinal && leaderReport && (
          <Card className="p-5 mb-6 border-indigo-200 dark:border-indigo-800/30" data-testid="card-leader-report">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-5 h-5 text-indigo-500" />
              <h3 className="font-display font-bold text-foreground">تقرير الخادم</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">اسم المجموعة</span>
                <span className="font-semibold">{leaderReport.groupName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">عدد الأعضاء</span>
                <span className="font-semibold">{leaderReport.totalMembers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إصحاحات هذا الأسبوع</span>
                <span className="font-semibold text-green-600">{leaderReport.chaptersThisWeek}</span>
              </div>
              <div className="mt-3 pt-3 border-t flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 text-green-700 border-green-300"
                  onClick={() => setReportActiveOpen(true)}>
                  قرأوا ({leaderReport.activeMembers?.length || 0})
                </Button>
                <Button size="sm" variant="outline" className="flex-1 text-amber-700 border-amber-300"
                  onClick={() => setReportInactiveOpen(true)}>
                  لم يقرأوا ({leaderReport.inactiveMembers?.length || 0})
                </Button>
              </div>
            </div>
          </Card>
        )}

        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={leaveGroup} data-testid="button-leave-group">
            <LogOut className="w-4 h-4 ml-2" />
            مغادرة المجموعة
          </Button>
        </div>

        {/* ── تقرير: الأعضاء الذين قرأوا ── */}
        <Dialog open={reportActiveOpen} onOpenChange={(o) => { setReportActiveOpen(o); if (!o) setReportActiveSearch(''); }}>
          <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-green-700">الأعضاء الذين قرأوا هذا الأسبوع ({leaderReport?.activeMembers?.length || 0})</DialogTitle>
            </DialogHeader>
            {/* بحث بالاسم — خاص بالأعضاء الذين قرأوا */}
            <div className="relative mt-2">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={reportActiveSearch}
                onChange={e => setReportActiveSearch(e.target.value)}
                placeholder="ابحث باسم العضو..."
                className="w-full bg-muted/40 rounded-lg pr-9 pl-3 py-2 text-sm border-0 focus:outline-none focus:ring-1 focus:ring-primary"
                dir="rtl"
              />
            </div>
            <div className="space-y-4 mt-3">
              {(leaderReport?.activeMembers || [])
                .filter((m: any) => !reportActiveSearch.trim() || (m.userName || '').toLowerCase().includes(reportActiveSearch.trim().toLowerCase()))
                .map((m: any) => {
                const totalTime = (m.chapters || []).reduce((s: number, c: any) => s + (c.timeSpent || 0), 0);
                const avgDepth = m.chapters?.length ? Math.round((m.chapters || []).reduce((s: number, c: any) => s + (c.scrollDepth || 0), 0) / m.chapters.length) : 0;
                const genuineCount = (m.chapters || []).filter((c: any) => (c.scrollDepth || 0) >= 80 && (c.timeSpent || 0) >= 60).length;
                const fastCount = (m.chapters || []).filter((c: any) => (c.timeSpent || 0) < 30).length;
                return (
                  <div key={m.userName} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-foreground">{m.userName}</p>
                      <div className="flex gap-1 flex-wrap justify-end">
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">{m.chapters?.length || 0} إصحاح</span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">⏱ {Math.floor(totalTime / 60)} د</span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded">📊 {avgDepth}%</span>
                      </div>
                    </div>
                    {genuineCount > 0 && <p className="text-xs text-green-600 mb-2">✓ {genuineCount} قراءة متأنية</p>}
                    {fastCount > 0 && <p className="text-xs text-orange-500 mb-2">⚡ {fastCount} قراءة سريعة جداً</p>}
                    <div className="space-y-1.5">
                      {(m.chapters || []).map((ch: any, i: number) => {
                        const isGenuine = (ch.scrollDepth || 0) >= 80 && (ch.timeSpent || 0) >= 60;
                        const isFast = (ch.timeSpent || 0) < 30;
                        const qualityColor = isGenuine ? 'bg-green-50 dark:bg-green-950/30 border-green-200' : isFast ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200' : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200';
                        const qualityLabel = isGenuine ? '✓ متأنٍ' : isFast ? '⚡ سريع' : '● عادي';
                        const qualityTextColor = isGenuine ? 'text-green-700' : isFast ? 'text-orange-600' : 'text-blue-700';
                        return (
                          <div key={i} className={`rounded p-2 text-xs border ${qualityColor}`}>
                            <div className="flex items-center justify-between">
                              <p className="font-semibold">{ch.bookName} إصحاح {ch.chapter}</p>
                              <span className={`font-bold text-xs ${qualityTextColor}`}>{qualityLabel}</span>
                            </div>
                            <div className="flex gap-3 mt-1 text-muted-foreground">
                              <span>⏱ {Math.round((ch.timeSpent || 0) / 60)} د {(ch.timeSpent || 0) % 60} ث</span>
                              <span>📜 {ch.scrollCount || 0} تمرير</span>
                              <span>📊 {ch.scrollDepth || 0}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {(!m.chapters?.length) && <p className="text-xs text-muted-foreground">لا توجد تفاصيل متاحة</p>}
                  </div>
                );
              })}
              {(!leaderReport?.activeMembers?.length) && (
                <p className="text-center text-muted-foreground py-4">لا يوجد أعضاء قرأوا هذا الأسبوع</p>
              )}
              {leaderReport?.activeMembers?.length > 0 &&
                reportActiveSearch.trim() &&
                !(leaderReport.activeMembers || []).some((m: any) => (m.userName || '').toLowerCase().includes(reportActiveSearch.trim().toLowerCase())) && (
                <p className="text-center text-muted-foreground py-4">لا يوجد عضو بهذا الاسم</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ── تقرير: الأعضاء الذين لم يقرأوا ── */}
        <Dialog open={reportInactiveOpen} onOpenChange={setReportInactiveOpen}>
          <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-amber-700">لم يقرأوا منذ 3+ أيام ({leaderReport?.inactiveMembers?.length || 0})</DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-1">
              {(leaderReport?.inactiveMembers || []).map((name: string) => (
                <div key={name} className="flex items-center gap-2 py-2 border-b last:border-0">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <span className="text-foreground">{name}</span>
                </div>
              ))}
              {(!leaderReport?.inactiveMembers?.length) && (
                <p className="text-center text-muted-foreground py-4">🎉 كل الأعضاء قرأوا مؤخراً</p>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ── نافذة تسجيل اسم الضيف ── */}
        <Dialog open={guestRegisterOpen} onOpenChange={setGuestRegisterOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>سجّل اسمك (اختياري)</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                أنت الآن مسجّل كـ <strong>{userName}</strong>. سجّل اسمك الحقيقي لتظهر باسمك في المجموعة.
                رقم عضويتك لن يتغير.
              </p>
              <div>
                <Label htmlFor="guest-name">الاسم *</Label>
                <Input id="guest-name" value={guestRegName} onChange={e => setGuestRegName(e.target.value)} placeholder="اكتب اسمك" />
              </div>
              <div>
                <Label htmlFor="guest-phone">رقم الموبايل (اختياري)</Label>
                <Input id="guest-phone" value={guestRegPhone} onChange={e => setGuestRegPhone(e.target.value)} placeholder="01000000000" type="tel" dir="ltr" className="text-left" />
              </div>
              <p className="text-xs text-muted-foreground">بالضغط على "تسجيل" أنت توافق على شروط الاستخدام وسياسة الخصوصية.</p>
              <Button onClick={handleGuestRegister} disabled={guestRegLoading || !guestRegName.trim()} className="w-full">
                {guestRegLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                تسجيل
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
          <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>إدارة المجموعة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Button onClick={updateToday} className="w-full" data-testid="button-save-admin">حفظ التغييرات</Button>

              {/* ── القراءات التلقائية ───────────────────────────────────── */}
              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <Label className="font-bold">القراءات التلقائية اليومية</Label>
                  </div>
                  <Switch
                    checked={autoEnabled}
                    onCheckedChange={v => { setAutoEnabled(v); if (!v) saveAutoReading(false); }}
                  />
                </div>

                {autoEnabled && (
                  <div className="space-y-3 p-3 rounded-lg bg-muted/40 border">
                    <p className="text-xs text-muted-foreground">حدّد نقطة البداية وعدد الإصحاحات — سيكمل النظام تلقائياً من بعدها كل يوم</p>

                    {/* العهد القديم */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-amber-600">📖 العهد القديم</Label>
                      <div className="flex gap-2">
                        <Select value={autoOtBook} onValueChange={v => { setAutoOtBook(v); setAutoOtChapter(1); }}>
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OT_BOOKS.map(([name]) => (
                              <SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={String(autoOtChapter)} onValueChange={v => setAutoOtChapter(Number(v))}>
                          <SelectTrigger className="w-20 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: OT_BOOKS.find(([n]) => n === autoOtBook)?.[1] ?? 1 }, (_, i) => i + 1).map(n => (
                              <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground w-24">إصحاحات/يوم</Label>
                        <Select value={String(autoOtChap)} onValueChange={v => setAutoOtChap(Number(v))}>
                          <SelectTrigger className="w-20 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1,2,3,4,5].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* العهد الجديد */}
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-blue-600">✝️ العهد الجديد</Label>
                      <div className="flex gap-2">
                        <Select value={autoNtBook} onValueChange={v => { setAutoNtBook(v); setAutoNtChapter(1); }}>
                          <SelectTrigger className="flex-1 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {NT_BOOKS.map(([name]) => (
                              <SelectItem key={name} value={name} className="text-xs">{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={String(autoNtChapter)} onValueChange={v => setAutoNtChapter(Number(v))}>
                          <SelectTrigger className="w-20 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: NT_BOOKS.find(([n]) => n === autoNtBook)?.[1] ?? 1 }, (_, i) => i + 1).map(n => (
                              <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground w-24">إصحاحات/يوم</Label>
                        <Select value={String(autoNtChap)} onValueChange={v => setAutoNtChap(Number(v))}>
                          <SelectTrigger className="w-20 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[1,2,3].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Button
                      onClick={() => saveAutoReading(true)}
                      disabled={autoSaving}
                      className="w-full h-8 text-xs"
                      variant="default"
                    >
                      {autoSaving ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <RotateCcw className="w-3 h-3 ml-1" />}
                      اضبط وابدأ من اليوم
                    </Button>
                  </div>
                )}
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-indigo-500" />
                  <Label className="font-bold">رابط الدعوة</Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={handleCopyInviteLink} data-testid="button-copy-invite-link">
                    <Copy className="w-3.5 h-3.5 ml-1" />
                    نسخ الرابط
                  </Button>
                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <Button variant="outline" size="sm" className="flex-1 text-xs" data-testid="button-share-invite-native"
                      onClick={async () => {
                        const link = `${window.location.origin}/invite/${groupCode}`;
                        try {
                          await navigator.share({ url: link });
                        } catch {
                          handleCopyInviteLink();
                        }
                      }}>
                      <Share2 className="w-3.5 h-3.5 ml-1" />
                      مشاركة
                    </Button>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">وضع الانضمام عبر الرابط</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={linkJoinMode === 'approval' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 text-xs"
                      disabled={linkModeLoading}
                      onClick={() => handleToggleLinkMode('approval')}
                      data-testid="button-mode-approval"
                    >
                      بعد موافقتي
                    </Button>
                    <Button
                      variant={linkJoinMode === 'auto' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 text-xs"
                      disabled={linkModeLoading}
                      onClick={() => handleToggleLinkMode('auto')}
                      data-testid="button-mode-auto"
                    >
                      انضمام فوري
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {linkJoinMode === 'auto' ? 'كل من يفتح الرابط ينضم فوراً بدون موافقة' : 'تصلك طلبات ويمكنك قبول أو رفض كل شخص'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">من يستطيع الإرسال في الشات</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={messagingMode === 'all' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 text-xs"
                      disabled={messagingModeLoading}
                      onClick={() => handleToggleMessagingMode('all')}
                      data-testid="button-messaging-all"
                    >
                      كل الأعضاء
                    </Button>
                    <Button
                      variant={messagingMode === 'admin_only' ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1 text-xs"
                      disabled={messagingModeLoading}
                      onClick={() => handleToggleMessagingMode('admin_only')}
                      data-testid="button-messaging-admin-only"
                    >
                      الأدمن فقط
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {messagingMode === 'admin_only' ? 'الأعضاء يقرأون فقط، الأدمن يرسل' : 'كل الأعضاء يستطيعون إرسال الرسائل'}
                  </p>
                </div>
                {/* ── الدخول الضيف ── */}
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="font-bold text-sm">الدخول الضيف</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {guestAccessEnabled
                          ? '✅ مفعّل — أي شخص يفتح الرابط يدخل تلقائياً بدون اسم أو موبايل'
                          : '🔒 مطفي — الدخول يتطلب الاسم ورقم الموبايل'}
                      </p>
                    </div>
                    <Switch
                      checked={guestAccessEnabled}
                      disabled={guestAccessLoading}
                      onCheckedChange={handleToggleGuestAccess}
                    />
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={missionOpen} onOpenChange={setMissionOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إنشاء مهمة قراءة أسبوعية</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>عنوان المهمة</Label>
                <Input value={missionTitle} onChange={e => setMissionTitle(e.target.value)} placeholder="مثال: اقرأ إنجيل مرقس هذا الأسبوع" data-testid="input-mission-title" />
              </div>
              <div>
                <Label>السفر</Label>
                <select
                  value={missionBook}
                  onChange={e => setMissionBook(e.target.value)}
                  className="w-full border rounded-md p-2 bg-background text-foreground"
                  data-testid="select-mission-book"
                >
                  <option value="">اختر السفر</option>
                  {allBooks?.map((b: any) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>من إصحاح</Label>
                  <Input type="number" min="1" value={missionStart} onChange={e => setMissionStart(e.target.value)} data-testid="input-mission-start" />
                </div>
                <div>
                  <Label>إلى إصحاح</Label>
                  <Input type="number" min="1" value={missionEnd} onChange={e => setMissionEnd(e.target.value)} data-testid="input-mission-end" />
                </div>
              </div>
              <div>
                <Label>الموعد النهائي</Label>
                <Input type="date" value={missionDeadline} onChange={e => setMissionDeadline(e.target.value)} data-testid="input-mission-deadline" />
              </div>
              <Button onClick={createMission} className="w-full" data-testid="button-create-mission">إنشاء المهمة</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={addAdminOpen} onOpenChange={(o) => { setAddAdminOpen(o); if (!o) setAddAdminResult(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-500" />
                إضافة أدمن للمجموعة
              </DialogTitle>
            </DialogHeader>
            {addAdminResult ? (
              <div className="space-y-4 text-center">
                <div className="w-14 h-14 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="w-7 h-7 text-green-600" />
                </div>
                <p className="font-bold text-foreground">تم إضافة {addAdminName} كأدمن</p>
                <div className="bg-muted rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-2">شارك هذا الكود الشخصي مع الأدمن الجديد ليسجل دخوله</p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="font-mono text-sm font-bold text-primary bg-background px-3 py-1.5 rounded-lg border" data-testid="text-new-admin-key">{addAdminResult}</code>
                    <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(addAdminResult); toast.success('تم النسخ'); }} data-testid="button-copy-admin-key">
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">يمكنه الانضمام بكود المجموعة <strong>{groupCode}</strong> باستخدام اسمه ورقم موبايله</p>
                <Button onClick={() => setAddAdminOpen(false)} className="w-full" data-testid="button-close-add-admin">إغلاق</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="admin-name">الاسم *</Label>
                  <Input id="admin-name" value={addAdminName} onChange={e => setAddAdminName(e.target.value)} placeholder="اكتب اسم الأدمن الجديد" data-testid="input-add-admin-name" />
                </div>
                <div>
                  <Label htmlFor="admin-phone">رقم الموبايل *</Label>
                  <Input id="admin-phone" value={addAdminPhone} onChange={e => setAddAdminPhone(e.target.value)} placeholder="01000000000" type="tel" dir="ltr" className="text-left" data-testid="input-add-admin-phone" />
                </div>
                <p className="text-xs text-muted-foreground">سيُضاف هذا الشخص مباشرة كأدمن ويمكنه تسجيل الدخول بنفس الاسم والرقم</p>
                <Button onClick={handleAddAdmin} disabled={addAdminLoading} className="w-full" data-testid="button-submit-add-admin">
                  {addAdminLoading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <UserPlus className="w-4 h-4 ml-2" />}
                  إضافة كأدمن
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </motion.div>
    </div>
  );
}
