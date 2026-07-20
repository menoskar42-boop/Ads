import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePageTracker } from '@/hooks/usePageTracker';
import { useExitTracker } from '@/hooks/useExitTracker';
import { useSearch, useLocation, useParams } from 'wouter';
import { motion } from 'framer-motion';
import { Book, ChevronDown, ChevronLeft, ChevronRight, Highlighter, Check, Volume2, BookText, BookOpen, Loader2, GraduationCap, Share2, Music } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type BibleBook, type BibleVerse } from '@/lib/api';
import { fetchBookIntro, fetchChapterTafsir, fetchVerseTafsir } from '@/lib/tafsir-csv-service';
import { getVideoId } from '@/lib/video-links-data';
import { getChanteVideoId, getSpokenVideoId } from '@/lib/chanted-videos-data';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getDaoudLameiLessons, refreshDaoudLameiCache } from '@/lib/daoud-lamei-rss';
import { getBibleChapterSEO, getTafsirSEO, getVerseTafsirSEO } from '@/lib/seo-config';
import { SEOHead } from '@/components/SEOHead';
import { TafsirText } from '@/components/TafsirText';
import { YouTubeCard } from '@/components/YouTubeCard';
import { saveHighlightedVerse, removeHighlightedVerse } from '@/lib/saved-verses';

type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'orange';

const highlightColors: { color: HighlightColor; label: string; class: string }[] = [
  { color: 'yellow', label: 'أصفر', class: 'bg-yellow-400' },
  { color: 'green', label: 'أخضر', class: 'bg-green-400' },
  { color: 'blue', label: 'أزرق', class: 'bg-blue-400' },
  { color: 'pink', label: 'وردي', class: 'bg-pink-400' },
  { color: 'orange', label: 'برتقالي', class: 'bg-orange-400' },
];

export default function Bible() {
  usePageTracker('/bible');
  useExitTracker('/bible');
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const pathParams = useParams<{ book?: string; chapter?: string; view?: string }>();
  const urlParams = new URLSearchParams(searchString);
  // Path params take priority over query string params
  const urlBook = pathParams.book ? decodeURIComponent(pathParams.book) : urlParams.get('book');
  const urlChapter = pathParams.chapter ? pathParams.chapter : urlParams.get('chapter');
  const urlView = pathParams.view as 'verses' | 'tafsir' | 'lesson' | 'video' | undefined;
  const isPathBased = !!pathParams.book;
  const initialLoadDone = useRef(false);

  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [skipChapterReset, setSkipChapterReset] = useState<boolean>(false);
  const [bibleViewMode, setBibleViewMode] = useState<'browse' | 'chapter'>('browse');
  const [chapterSubView, setChapterSubView] = useState<'verses' | 'tafsir' | 'lesson' | 'video'>(urlView ?? 'verses');
  const [selectedVerseForHighlight, setSelectedVerseForHighlight] = useState<number | null>(null);
  const [tafsirDialogType, setTafsirDialogType] = useState<'intro' | 'chapter' | 'verse'>('chapter');
  const [tafsirVerseNum, setTafsirVerseNum] = useState<number>(0);
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentVideoStart, setCurrentVideoStart] = useState<number | undefined>(undefined);
  const [currentVideoEnd, setCurrentVideoEnd] = useState<number | undefined>(undefined);
  const [lessonParts, setLessonParts] = useState<{ videoId: string; partNum: number; title: string }[]>([]);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [lessonVideoId, setLessonVideoId] = useState<string | null>(null);
  const [lessonVideoTitle, setLessonVideoTitle] = useState<string>('');
  const [lessonRefreshing, setLessonRefreshing] = useState(false);
  const [listenChoiceOpen, setListenChoiceOpen] = useState(false);
  const [listenChoiceChante, setListenChoiceChante] = useState<{ id: string; start?: number; end?: number } | null>(null);
  const [listenChoiceRegular, setListenChoiceRegular] = useState<string | null>(null);
  const [isChantedMode, setIsChantedMode] = useState<boolean>(false);
  const queryClient = useQueryClient();

  const changeSubView = useCallback((view: 'verses' | 'tafsir' | 'lesson' | 'video', book?: BibleBook | null, chapter?: number) => {
    setChapterSubView(view);
    const b = book ?? selectedBook;
    const ch = chapter ?? selectedChapter;
    if (!b) return;
    const base = `/bible/${encodeURIComponent(b.name)}/${ch}`;
    navigate(view === 'verses' ? base : `${base}/${view}`, { replace: true });
  }, [navigate, selectedBook, selectedChapter]);

  const { data: oldTestamentBooks, isLoading: oldLoading } = useQuery({
    queryKey: ['books', 'old'],
    queryFn: () => api.books.getByTestament('old'),
  });

  const { data: newTestamentBooks, isLoading: newLoading } = useQuery({
    queryKey: ['books', 'new'],
    queryFn: () => api.books.getByTestament('new'),
  });

  const { data: currentUser } = useQuery({
    queryKey: ['user'],
    queryFn: () => api.user.get(),
    staleTime: 5 * 60 * 1000,
  });

  const allBooks = useMemo(() => {
    const books = [...(oldTestamentBooks || []), ...(newTestamentBooks || [])];
    return books.sort((a, b) => a.bookOrder - b.bookOrder);
  }, [oldTestamentBooks, newTestamentBooks]);

  useEffect(() => {
    if (initialLoadDone.current) return;
    
    const booksLoaded = oldTestamentBooks !== undefined && newTestamentBooks !== undefined;
    if (!booksLoaded) return;
    
    if (!urlBook) {
      initialLoadDone.current = true;
      return;
    }
    
    const foundBook = allBooks.find(b => b.name === urlBook);
    
    if (foundBook) {
      setSkipChapterReset(true);
      setSelectedBook(foundBook);
      if (urlChapter) {
        const parsedChapter = parseInt(urlChapter, 10);
        if (!isNaN(parsedChapter) && parsedChapter >= 1 && parsedChapter <= foundBook.chaptersCount) {
          setSelectedChapter(parsedChapter);
        }
      }
      setBibleViewMode('chapter');
    }

    initialLoadDone.current = true;
    // For query-string URLs, redirect to path-based canonical URL
    if (!isPathBased) {
      const targetPath = urlChapter
        ? `/bible/${encodeURIComponent(foundBook?.name || urlBook!)}/${urlChapter}`
        : `/bible/${encodeURIComponent(foundBook?.name || urlBook!)}`;
      navigate(targetPath, { replace: true });
    }
  }, [urlBook, urlChapter, oldTestamentBooks, newTestamentBooks, navigate, allBooks, isPathBased]);

  const { data: chapters } = useQuery({
    queryKey: ['chapters', selectedBook?.id],
    queryFn: () => api.books.getChapters(selectedBook!.id),
    enabled: !!selectedBook,
  });

  const { data: verses, isLoading: versesLoading } = useQuery({
    queryKey: ['verses', selectedBook?.id, selectedChapter],
    queryFn: () => api.verses.getByBook(selectedBook!.id, selectedChapter),
    enabled: !!selectedBook && bibleViewMode === 'chapter',
  });

  const { data: highlights } = useQuery({
    queryKey: ['highlights'],
    queryFn: api.highlights.getAll,
  });

  const createHighlight = useMutation({
    mutationFn: (data: { verseId: number; color: string }) =>
      api.highlights.create(data.verseId, data.color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      setSelectedVerseForHighlight(null);
    },
  });

  const deleteHighlight = useMutation({
    mutationFn: (id: number) => api.highlights.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['highlights'] });
      setSelectedVerseForHighlight(null);
    },
  });

  const getVerseHighlight = (verseId: number): HighlightColor | undefined => {
    const highlight = highlights?.find(h => h.verseId === verseId);
    return highlight?.color as HighlightColor | undefined;
  };

  const getHighlightId = (verseId: number): number | undefined => {
    return highlights?.find(h => h.verseId === verseId)?.id;
  };

  const handleHighlight = (verseId: number, color: HighlightColor) => {
    const existingId = getHighlightId(verseId);
    if (existingId) {
      deleteHighlight.mutate(existingId);
    }
    createHighlight.mutate({ verseId, color });

    const verse = verses?.find(v => v.id === verseId);
    if (verse && selectedBook) {
      const ref = `${selectedBook.name} ${verse.chapter}:${verse.verse}`;
      removeHighlightedVerse(ref);
      saveHighlightedVerse(verse.text, ref, color);
    }
  };

  const removeHighlight = (verseId: number) => {
    const highlightId = getHighlightId(verseId);
    if (highlightId) {
      deleteHighlight.mutate(highlightId);
    }
    const verse = verses?.find(v => v.id === verseId);
    if (verse && selectedBook) {
      const ref = `${selectedBook.name} ${verse.chapter}:${verse.verse}`;
      removeHighlightedVerse(ref);
    }
  };

  const getHighlightClass = (color?: HighlightColor) => {
    if (!color) return '';
    return `verse-highlight-${color}`;
  };

  const handleChapterClick = (chapter: number) => {
    setSelectedChapter(chapter);
    setChapterSubView('verses');
    setBibleViewMode('chapter');
    if (selectedBook) {
      navigate(`/bible/${encodeURIComponent(selectedBook.name)}/${chapter}`, { replace: true });
    }
  };

  const handleListenClick = () => {
    if (!selectedBook) return;
    const chanteId = getChanteVideoId(selectedBook.name, selectedChapter);
    if (chanteId) {
      setListenChoiceChante(chanteId);
      setListenChoiceRegular(getVideoId(selectedBook.name, selectedChapter));
      setListenChoiceOpen(true);
      return;
    }
    setIsChantedMode(false);
    setCurrentVideoId(getVideoId(selectedBook.name, selectedChapter));
    setCurrentVideoStart(undefined);
    setCurrentVideoEnd(undefined);
    changeSubView('video');
  };

  const openLessonResults = (parts: { videoId: string; partNum: number; title: string }[]) => {
    if (parts.length === 1) {
      setLessonVideoId(parts[0].videoId);
      setLessonVideoTitle(parts[0].title);
      setLessonParts([]);
    } else {
      setLessonParts(parts);
      setLessonVideoId(null);
    }
    changeSubView('lesson');
  };

  const handleLessonClick = async () => {
    if (!selectedBook) return;
    setLessonLoading(true);
    try {
      const parts = await getDaoudLameiLessons(selectedBook.name, selectedChapter);
      openLessonResults(parts);
    } catch {
      setLessonParts([]);
      setLessonVideoId(null);
      changeSubView('lesson');
    } finally {
      setLessonLoading(false);
    }
  };

  const handleLessonRefresh = async () => {
    if (!selectedBook) return;
    setLessonRefreshing(true);
    try {
      const parts = await getDaoudLameiLessons(selectedBook.name, selectedChapter, true);
      openLessonResults(parts);
    } catch {
      // silently fail
    } finally {
      setLessonRefreshing(false);
    }
  };

  const goToNextChapter = useCallback(() => {
    if (!selectedBook || allBooks.length === 0) return;
    if (selectedChapter < selectedBook.chaptersCount) {
      setSelectedChapter(selectedChapter + 1);
    } else {
      const currentBookIndex = allBooks.findIndex(b => b.id === selectedBook.id);
      if (currentBookIndex < allBooks.length - 1) {
        const nextBook = allBooks[currentBookIndex + 1];
        setSkipChapterReset(true);
        setSelectedBook(nextBook);
        setSelectedChapter(1);
      }
    }
  }, [selectedBook, selectedChapter, allBooks]);

  const goToPrevChapter = useCallback(() => {
    if (!selectedBook || allBooks.length === 0) return;
    if (selectedChapter > 1) {
      setSelectedChapter(selectedChapter - 1);
    } else {
      const currentBookIndex = allBooks.findIndex(b => b.id === selectedBook.id);
      if (currentBookIndex > 0) {
        const prevBook = allBooks[currentBookIndex - 1];
        setSkipChapterReset(true);
        setSelectedBook(prevBook);
        setSelectedChapter(prevBook.chaptersCount);
      }
    }
  }, [selectedBook, selectedChapter, allBooks]);

  const isFirstChapterOfFirstBook = selectedBook && allBooks.length > 0 &&
    allBooks[0].id === selectedBook.id && selectedChapter === 1;

  const isLastChapterOfLastBook = selectedBook && allBooks.length > 0 &&
    allBooks[allBooks.length - 1].id === selectedBook.id &&
    selectedChapter === selectedBook.chaptersCount;

  const applyVideoPreference = useCallback((bookName: string, chapter: number, preferChanted: boolean) => {
    if (preferChanted) {
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
    if (!preferChanted) {
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
  }, []);

  const goToVideoNextChapter = useCallback(() => {
    if (!selectedBook || allBooks.length === 0) return;
    let nextBook = selectedBook;
    let nextChapter = selectedChapter;
    if (selectedChapter < selectedBook.chaptersCount) {
      nextChapter = selectedChapter + 1;
    } else {
      const currentBookIndex = allBooks.findIndex(b => b.id === selectedBook.id);
      if (currentBookIndex < allBooks.length - 1) {
        nextBook = allBooks[currentBookIndex + 1];
        nextChapter = 1;
      } else {
        return;
      }
    }
    setSkipChapterReset(true);
    setSelectedBook(nextBook);
    setSelectedChapter(nextChapter);
    applyVideoPreference(nextBook.name, nextChapter, isChantedMode);
  }, [selectedBook, selectedChapter, allBooks, isChantedMode, applyVideoPreference]);

  const goToVideoPrevChapter = useCallback(() => {
    if (!selectedBook || allBooks.length === 0) return;
    let prevBook = selectedBook;
    let prevChapter = selectedChapter;
    if (selectedChapter > 1) {
      prevChapter = selectedChapter - 1;
    } else {
      const currentBookIndex = allBooks.findIndex(b => b.id === selectedBook.id);
      if (currentBookIndex > 0) {
        prevBook = allBooks[currentBookIndex - 1];
        prevChapter = prevBook.chaptersCount;
      } else {
        return;
      }
    }
    setSkipChapterReset(true);
    setSelectedBook(prevBook);
    setSelectedChapter(prevChapter);
    applyVideoPreference(prevBook.name, prevChapter, isChantedMode);
  }, [selectedBook, selectedChapter, allBooks, isChantedMode, applyVideoPreference]);

  useEffect(() => {
    if (selectedBook) {
      if (skipChapterReset) {
        setSkipChapterReset(false);
      } else {
        setSelectedChapter(1);
      }
    }
  }, [selectedBook?.id]);

  const dynamicSEO = useMemo(() => {
    if (!selectedBook) return null;
    if (chapterSubView === 'tafsir' && tafsirDialogType === 'chapter') {
      return getTafsirSEO(selectedBook.name, selectedChapter);
    }
    if (chapterSubView === 'tafsir' && tafsirDialogType === 'verse') {
      return getVerseTafsirSEO(selectedBook.name, selectedChapter, tafsirVerseNum);
    }
    return getBibleChapterSEO(selectedBook.name, selectedChapter);
  }, [selectedBook, selectedChapter, chapterSubView, tafsirDialogType, tafsirVerseNum]);

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
            <Book className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">الكتاب المقدس</h1>
            <p className="text-sm text-muted-foreground">تصفح الأسفار والإصحاحات</p>
          </div>
        </div>

        {bibleViewMode === 'browse' && <Tabs defaultValue="old" className="mb-6">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="old" data-testid="tab-old-testament">العهد القديم</TabsTrigger>
            <TabsTrigger value="new" data-testid="tab-new-testament">العهد الجديد</TabsTrigger>
          </TabsList>

          <TabsContent value="old" className="mt-4">
            {oldLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-48">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {oldTestamentBooks?.map((book) => (
                    <Button
                      key={book.id}
                      variant={selectedBook?.id === book.id ? 'default' : 'outline'}
                      size="sm"
                      className="justify-start text-sm"
                      onClick={() => setSelectedBook(book)}
                      data-testid={`book-${book.id}`}
                    >
                      {book.name}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="new" className="mt-4">
            {newLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-10 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-48">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {newTestamentBooks?.map((book) => (
                    <Button
                      key={book.id}
                      variant={selectedBook?.id === book.id ? 'default' : 'outline'}
                      size="sm"
                      className="justify-start text-sm"
                      onClick={() => setSelectedBook(book)}
                      data-testid={`book-${book.id}`}
                    >
                      {book.name}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>}

        {bibleViewMode === 'browse' && selectedBook && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="font-semibold text-foreground">{selectedBook.name}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">اختر إصحاحاً</span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {chapters?.map((chapter) => (
                  <Button
                    key={chapter}
                    variant="ghost"
                    size="sm"
                    className="w-10 h-10 p-0 text-base"
                    onClick={() => handleChapterClick(chapter)}
                    data-testid={`chapter-${chapter}`}
                  >
                    {chapter}
                  </Button>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

      {bibleViewMode === 'chapter' && (
        <motion.div
          key="chapter-view"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBibleViewMode('browse')}
            className="mb-4"
            data-testid="button-back-to-browse"
          >
            <ChevronLeft className="w-4 h-4 ml-1" />
            رجوع للكتاب المقدس
          </Button>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-muted-foreground">
                {selectedBook ? `${selectedChapter} / ${selectedBook.chaptersCount}` : ''}
              </div>
              <h2 className="font-display text-xl font-bold text-center text-foreground" data-testid="text-bible-reader-title">
                {selectedBook ? `${selectedBook.name} - الإصحاح ${selectedChapter}` : ''}
              </h2>
              <div className="w-8" />
            </div>

            {chapterSubView !== 'verses' && (
              <Button
                variant="outline"
                onClick={() => changeSubView('verses')}
                className="mb-4 w-full border-primary text-primary font-semibold"
                data-testid="button-back-to-verses"
              >
                <ChevronLeft className="w-5 h-5 ml-1" />
                رجوع للآيات
              </Button>
            )}

            {chapterSubView === 'verses' && <div dir="rtl">
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
                    style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                    data-testid="button-listen-chapter"
                  >
                    <Volume2 className="w-4 h-4 ml-1" />
                    استمع للإصحاح
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleLessonClick}
                    disabled={lessonLoading}
                    className="bg-gradient-to-r from-amber-600 to-amber-500 text-white"
                    style={{ background: '#b45309', color: '#ffffff' }}
                    data-testid="button-lesson-chapter"
                  >
                    {lessonLoading
                      ? <Loader2 className="w-4 h-4 ml-1 animate-spin" />
                      : <GraduationCap className="w-4 h-4 ml-1" />
                    }
                    درس كتاب
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!selectedBook) return;
                      setTafsirDialogType('intro');
                      changeSubView('tafsir');
                      setTafsirText(null);
                      setTafsirLoading(true);
                      fetchBookIntro(selectedBook.name)
                        .then(text => { setTafsirText(text); setTafsirLoading(false); })
                        .catch(() => setTafsirLoading(false));
                    }}
                    className="bg-gradient-to-r from-primary to-primary/80"
                    style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                    data-testid="button-book-intro"
                  >
                    <BookOpen className="w-4 h-4 ml-1" />
                    مقدمة عن السفر
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!selectedBook) return;
                      setTafsirDialogType('chapter');
                      changeSubView('tafsir');
                      setTafsirText(null);
                      setTafsirLoading(true);
                      fetchChapterTafsir(selectedBook.name, selectedChapter)
                        .then(text => { setTafsirText(text); setTafsirLoading(false); })
                        .catch(() => setTafsirLoading(false));
                    }}
                    className="bg-gradient-to-r from-primary to-primary/80"
                    style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                    data-testid="button-chapter-tafsir"
                  >
                    <BookText className="w-4 h-4 ml-1" />
                    تفسير الإصحاح
                  </Button>
                </div>
                <div className="space-y-4 font-display text-xl md:text-2xl leading-loose">
                  {verses?.map((verse) => {
                    const highlightColor = getVerseHighlight(verse.id);
                    return (
                      <div key={verse.id} className="group">
                        <div className="flex items-start gap-1">
                          <Popover
                            open={selectedVerseForHighlight === verse.id}
                            onOpenChange={(open) => setSelectedVerseForHighlight(open ? verse.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <p
                                className={cn(
                                  'cursor-pointer transition-all rounded-lg p-2 -m-2 hover:bg-muted/50 flex-1',
                                  getHighlightClass(highlightColor)
                                )}
                                data-testid={`verse-${verse.id}`}
                              >
                                <span className="text-primary font-bold ml-2">{verse.verse}</span>
                                {verse.text}
                              </p>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" align="center">
                              <div className="flex items-center gap-1">
                                {highlightColors.map((hl) => (
                                  <button
                                    key={hl.color}
                                    className={cn(
                                      'w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110',
                                      hl.class
                                    )}
                                    onClick={() => handleHighlight(verse.id, hl.color)}
                                    data-testid={`highlight-${hl.color}`}
                                  >
                                    {highlightColor === hl.color && (
                                      <Check className="w-4 h-4 text-white" />
                                    )}
                                  </button>
                                ))}
                                {highlightColor && (
                                  <button
                                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium hover:bg-muted/80"
                                    onClick={() => removeHighlight(verse.id)}
                                    data-testid="remove-highlight"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            </PopoverContent>
                          </Popover>
                          <div className="flex flex-col gap-1 shrink-0">
                            <button
                              className="mt-2 px-3 py-1.5 rounded text-sm font-medium text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                              onClick={() => {
                                if (!selectedBook) return;
                                setTafsirDialogType('verse');
                                setTafsirVerseNum(verse.verse);
                                changeSubView('tafsir');
                                setTafsirText(null);
                                setTafsirLoading(true);
                                fetchVerseTafsir(selectedBook.name, selectedChapter, verse.verse)
                                  .then(text => { setTafsirText(text); setTafsirLoading(false); })
                                  .catch(() => setTafsirLoading(false));
                              }}
                              data-testid={`button-verse-tafsir-${verse.verse}`}
                            >
                              تفسير الآية
                            </button>
                            <button
                              className="px-3 py-1.5 rounded text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors whitespace-nowrap flex items-center gap-1"
                              onClick={() => {
                                const shareUrl = `${window.location.origin}/share/verse/${verse.id}`;
                                const shareText = `"${verse.text}"\n\n📖 ${selectedBook?.name} ${selectedChapter}:${verse.verse}\n\n${shareUrl}`;
                                if (navigator.share) {
                                  navigator.share({ title: `${selectedBook?.name} ${selectedChapter}:${verse.verse}`, text: shareText, url: shareUrl }).catch(() => navigator.clipboard.writeText(shareText));
                                } else {
                                  navigator.clipboard.writeText(shareText);
                                }
                              }}
                              data-testid={`button-verse-share-${verse.verse}`}
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              مشاركة
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                لا توجد آيات متاحة
              </p>
            )}
          </div>}

            {/* Tafsir inline panel */}
            {chapterSubView === 'tafsir' && (
              <div className="mt-2" dir="rtl">
                <h3 className="font-display text-lg font-semibold mb-4 text-center" data-testid="text-commentary-title">
                  {tafsirDialogType === 'intro'
                    ? `مقدمة عن سفر ${selectedBook?.name}`
                    : tafsirDialogType === 'verse'
                    ? `تفسير ${selectedBook?.name} ${selectedChapter}:${tafsirVerseNum}`
                    : `تفسير ${selectedBook?.name} - الإصحاح ${selectedChapter}`}
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
                <Button variant="outline" onClick={() => changeSubView('verses')} className="mt-4 w-full border-primary text-primary font-semibold">
                  <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
                </Button>
              </div>
            )}

            {/* Lesson inline panel */}
            {chapterSubView === 'lesson' && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-amber-500" />
                    <h3 className="font-display text-lg font-semibold">درس كتاب — {selectedBook?.name} {selectedChapter}</h3>
                  </div>
                  {currentUser?.isPremium && (
                    <Button variant="ghost" size="sm" onClick={handleLessonRefresh} disabled={lessonRefreshing} className="text-xs text-muted-foreground" data-testid="button-lesson-refresh">
                      {lessonRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : '↻'}
                    </Button>
                  )}
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
                          data-testid={`button-lesson-part-${idx + 1}`}>
                          <GraduationCap className="w-4 h-4 ml-1" />
                          الجزء {part.partNum}
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
                <Button variant="outline" onClick={() => changeSubView('verses')} className="mt-4 w-full border-primary text-primary font-semibold">
                  <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
                </Button>
              </div>
            )}

            {/* Video/Listen inline panel */}
            {chapterSubView === 'video' && (
              <div className="mt-2">
                <h3 className="font-display text-lg font-semibold mb-4 text-center">
                  {isChantedMode ? 'استمع مرتلاً' : 'استمع كقراءة'} — {selectedBook?.name} {selectedChapter}
                </h3>
                <div className="mb-4 pb-3 border-b flex flex-wrap justify-center gap-2" dir="rtl">
                  {/* Smart listen button: switches to the other type */}
                  {isChantedMode
                    ? (() => {
                        const regularId = selectedBook ? getVideoId(selectedBook.name, selectedChapter) : null;
                        if (!regularId) return null;
                        return (
                          <Button
                            size="sm"
                            onClick={() => {
                              setIsChantedMode(false);
                              setCurrentVideoId(regularId);
                              setCurrentVideoStart(undefined);
                              setCurrentVideoEnd(undefined);
                            }}
                            style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                          >
                            <Volume2 className="w-4 h-4 ml-1" />
                            استمع كقراءة
                          </Button>
                        );
                      })()
                    : (() => {
                        const chanteId = selectedBook ? getChanteVideoId(selectedBook.name, selectedChapter) : null;
                        if (!chanteId) return null;
                        return (
                          <Button
                            size="sm"
                            onClick={() => {
                              setIsChantedMode(true);
                              setCurrentVideoId(chanteId.id);
                              setCurrentVideoStart(chanteId.start);
                              setCurrentVideoEnd(chanteId.end);
                            }}
                            style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                          >
                            <Music className="w-4 h-4 ml-1" />
                            استمع مرتلاً
                          </Button>
                        );
                      })()
                  }
                  {/* Spoken (quiet reading) button */}
                  {(() => {
                    const spokenId = selectedBook ? getSpokenVideoId(selectedBook.name, selectedChapter) : null;
                    if (!spokenId) return null;
                    return (
                      <Button
                        size="sm"
                        onClick={() => {
                          setIsChantedMode(true);
                          setCurrentVideoId(spokenId);
                          setCurrentVideoStart(undefined);
                          setCurrentVideoEnd(undefined);
                        }}
                        style={{ background: 'hsl(210, 50%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                      >
                        <Volume2 className="w-4 h-4 ml-1" />
                        قراءة هادئة
                      </Button>
                    );
                  })()}
                  <Button
                    size="sm"
                    onClick={handleLessonClick}
                    disabled={lessonLoading}
                    className="bg-gradient-to-r from-amber-600 to-amber-500 text-white"
                    style={{ background: '#b45309', color: '#ffffff' }}
                  >
                    {lessonLoading
                      ? <Loader2 className="w-4 h-4 ml-1 animate-spin" />
                      : <GraduationCap className="w-4 h-4 ml-1" />
                    }
                    درس كتاب
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!selectedBook) return;
                      setTafsirDialogType('intro');
                      changeSubView('tafsir');
                      setTafsirText(null);
                      setTafsirLoading(true);
                      fetchBookIntro(selectedBook.name)
                        .then(text => { setTafsirText(text); setTafsirLoading(false); })
                        .catch(() => setTafsirLoading(false));
                    }}
                    style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                  >
                    <BookOpen className="w-4 h-4 ml-1" />
                    مقدمة عن السفر
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!selectedBook) return;
                      setTafsirDialogType('chapter');
                      changeSubView('tafsir');
                      setTafsirText(null);
                      setTafsirLoading(true);
                      fetchChapterTafsir(selectedBook.name, selectedChapter)
                        .then(text => { setTafsirText(text); setTafsirLoading(false); })
                        .catch(() => setTafsirLoading(false));
                    }}
                    style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
                  >
                    <BookText className="w-4 h-4 ml-1" />
                    تفسير الإصحاح
                  </Button>
                </div>
                {currentVideoId ? (
                  <YouTubeCard videoId={currentVideoId} start={currentVideoStart} end={currentVideoEnd} />
                ) : (
                  <div className="aspect-video flex items-center justify-center bg-muted rounded-lg">
                    <p className="text-muted-foreground text-center p-8 font-display">لا توجد ملفات صوتية أو مرئية لهذا الإصحاح</p>
                  </div>
                )}
                <Button variant="outline" onClick={() => changeSubView('verses')} className="mt-4 w-full border-primary text-primary font-semibold">
                  <ChevronLeft className="w-5 h-5 ml-1" />رجوع للآيات
                </Button>
                <div className="flex items-center justify-between gap-3 pt-3 mt-3 border-t">
                  <Button variant="outline" onClick={goToVideoPrevChapter} disabled={!!isFirstChapterOfFirstBook} className="flex-1" data-testid="button-video-prev-chapter">
                    <ChevronRight className="w-4 h-4 ml-2" />السابق
                  </Button>
                  <span className="text-xs text-muted-foreground shrink-0">{selectedBook?.name} {selectedChapter}</span>
                  <Button onClick={goToVideoNextChapter} disabled={!!isLastChapterOfLastBook} className="flex-1" data-testid="button-video-next-chapter">
                    التالي<ChevronLeft className="w-4 h-4 mr-2" />
                  </Button>
                </div>
              </div>
            )}

          {chapterSubView === 'verses' && <div className="p-3 border-t flex items-center justify-between gap-2">
            <Button
              variant="outline"
              onClick={goToPrevChapter}
              disabled={!!isFirstChapterOfFirstBook}
              className="flex-1"
              data-testid="button-bible-prev-chapter"
            >
              <ChevronRight className="w-4 h-4 ml-2" />
              السابق
            </Button>
            <span className="text-xs text-muted-foreground font-medium shrink-0 px-2 text-center leading-tight">
              {selectedBook?.name} {selectedChapter}
            </span>
            <Button
              onClick={goToNextChapter}
              disabled={!!isLastChapterOfLastBook}
              className="flex-1"
              data-testid="button-bible-next-chapter"
            >
              التالي
              <ChevronLeft className="w-4 h-4 mr-2" />
            </Button>
          </div>}
          </Card>
        </motion.div>
      )}

      </motion.div>
    </div>

    <Dialog open={listenChoiceOpen} onOpenChange={setListenChoiceOpen}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-center">
            استمع للإصحاح — {selectedBook?.name} {selectedChapter}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-2">
          <Button
            className="gap-2 justify-start"
            style={{ background: 'hsl(345, 55%, 35%)', color: 'hsl(40, 30%, 97%)' }}
            onClick={() => {
              if (listenChoiceChante) {
                setCurrentVideoId(listenChoiceChante.id);
                setCurrentVideoStart(listenChoiceChante.start);
                setCurrentVideoEnd(listenChoiceChante.end);
              }
              setIsChantedMode(true);
              changeSubView('video');
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
              setCurrentVideoId(listenChoiceRegular);
              setCurrentVideoStart(undefined);
              setCurrentVideoEnd(undefined);
              setIsChantedMode(false);
              changeSubView('video');
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
