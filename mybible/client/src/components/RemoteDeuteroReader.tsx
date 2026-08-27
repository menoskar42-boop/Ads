import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, BookText, ChevronLeft, ExternalLink, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import {
  fetchBookIntro,
  fetchChapterTafsir,
  fetchVerseTafsir,
  getLastChapterTafsirReason,
  getLastVerseTafsirScope,
  type TafsirMissingReason,
  type TafsirScope,
} from '@/lib/tafsir-csv-service';
import { TafsirText } from '@/components/TafsirText';

export function RemoteDeuteroReader() {
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [tafsirView, setTafsirView] = useState<'intro' | 'chapter' | 'verse' | null>(null);
  const [tafsirVerse, setTafsirVerse] = useState<number | null>(null);
  const [tafsirText, setTafsirText] = useState<string | null>(null);
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [tafsirScope, setTafsirScope] = useState<TafsirScope>(null);
  const [tafsirReason, setTafsirReason] = useState<TafsirMissingReason>(null);

  const catalogQuery = useQuery({
    queryKey: ['deutero-sttakla-catalog'],
    queryFn: api.deuteroSource.getCatalog,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const catalog = catalogQuery.data;
  const selectedBook = useMemo(
    () => catalog?.books.find((book) => book.id === selectedBookId) || catalog?.books[0],
    [catalog?.books, selectedBookId],
  );

  useEffect(() => {
    if (!catalog?.status.available || !catalog.books.length) return;
    const bookStillExists = catalog.books.some((book) => book.id === selectedBookId);
    if (!bookStillExists) {
      setSelectedBookId(catalog.books[0].id);
      setSelectedChapter(1);
    }
  }, [catalog, selectedBookId]);

  useEffect(() => {
    if (!selectedBook) return;
    if (selectedChapter > selectedBook.chaptersCount) setSelectedChapter(1);
  }, [selectedBook, selectedChapter]);

  useEffect(() => {
    setTafsirView(null);
    setTafsirText(null);
    setTafsirVerse(null);
  }, [selectedBookId, selectedChapter]);

  const openTafsir = async (type: 'intro' | 'chapter' | 'verse', verse?: number) => {
    if (!selectedBook) return;
    setTafsirView(type);
    setTafsirVerse(type === 'verse' ? verse ?? null : null);
    setTafsirText(null);
    setTafsirScope(null);
    setTafsirReason(null);
    setTafsirLoading(true);

    try {
      if (type === 'intro') {
        setTafsirText(await fetchBookIntro(selectedBook.name));
      } else if (type === 'chapter') {
        setTafsirText(await fetchChapterTafsir(selectedBook.name, selectedChapter));
        setTafsirReason(getLastChapterTafsirReason());
      } else if (verse !== undefined) {
        setTafsirText(await fetchVerseTafsir(selectedBook.name, selectedChapter, verse));
        setTafsirScope(getLastVerseTafsirScope());
      }
    } finally {
      setTafsirLoading(false);
    }
  };

  const chapterQuery = useQuery({
    queryKey: ['deutero-sttakla-chapter', selectedBook?.id, selectedChapter],
    queryFn: () => api.deuteroSource.getChapter(selectedBook!.id, selectedChapter),
    enabled: !!selectedBook && !!catalog?.status.available,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  if (catalogQuery.isLoading) {
    return (
      <Card className="mb-6 p-5" dir="rtl" data-testid="deutero-source-loading">
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          جاري التحقق من مصدر الأسفار القانونية الثانية...
        </div>
      </Card>
    );
  }

  // عدم وجود المصدر العام يعني أن القسم لا يظهر، حتى لا نعرض نسخة قديمة.
  if (catalogQuery.isError || !catalog?.status.available || !catalog.books.length) return null;

  return (
    <Card className="mb-6 overflow-hidden border-emerald-200 dark:border-emerald-900/60" dir="rtl">
      <div className="border-b bg-emerald-50/70 p-5 dark:bg-emerald-950/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">
                الأسفار القانونية الثانية
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                النص من الترجمة اليسوعية القديمة 1877 عبر موقع St-Takla.org
              </p>
            </div>
          </div>
          <a
            href={catalog.status.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white hover:text-foreground dark:hover:bg-background"
            aria-label="فتح مصدر الأسفار على St-Takla"
          >
            <ExternalLink className="h-4 w-4" />
            المصدر
          </a>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-emerald-300 bg-white/70 text-emerald-800 hover:bg-white dark:border-emerald-800 dark:bg-background/40 dark:text-emerald-300"
            onClick={() => openTafsir('intro')}
            data-testid="deutero-book-intro-tafsir"
          >
            <BookOpen className="ml-1 h-4 w-4" />
            مقدمة عن السفر
          </Button>
          {selectedBook && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-emerald-300 bg-white/70 text-emerald-800 hover:bg-white dark:border-emerald-800 dark:bg-background/40 dark:text-emerald-300"
              onClick={() => openTafsir('chapter')}
              data-testid="deutero-chapter-tafsir"
            >
              <BookText className="ml-1 h-4 w-4" />
              تفسير الإصحاح
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-foreground">اختر السفر</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {catalog.books.map((book) => (
              <Button
                key={book.id}
                type="button"
                size="sm"
                variant={selectedBook?.id === book.id ? 'default' : 'outline'}
                className="h-auto min-h-10 justify-start whitespace-normal text-right text-sm"
                onClick={() => {
                  setSelectedBookId(book.id);
                  setSelectedChapter(1);
                }}
                data-testid={`deutero-source-book-${book.id}`}
              >
                {book.name}
              </Button>
            ))}
          </div>
        </div>

        {selectedBook && (
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">
              إصحاحات سفر {selectedBook.name}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: selectedBook.chaptersCount }, (_, index) => index + 1).map((chapter) => (
                <Button
                  key={chapter}
                  type="button"
                  size="sm"
                  variant={selectedChapter === chapter ? 'default' : 'ghost'}
                  className="h-9 w-9 p-0 text-sm"
                  onClick={() => setSelectedChapter(chapter)}
                  data-testid={`deutero-source-chapter-${chapter}`}
                >
                  {chapter}
                </Button>
              ))}
            </div>
          </div>
        )}

        {chapterQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            جاري تحميل الإصحاح...
          </div>
        ) : chapterQuery.isError ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            تعذر تحميل الإصحاح من المصدر العام.
          </div>
        ) : chapterQuery.data?.verses.length ? (
          <div className="rounded-xl bg-muted/30 p-4">
            <div className="mb-4 text-center text-sm font-semibold text-muted-foreground">
              {selectedBook?.name} — الإصحاح {selectedChapter}
            </div>
            <div className="space-y-4 font-display text-lg leading-loose md:text-xl">
              {chapterQuery.data.verses.map((verse) => (
                <div key={verse.verse} className="flex items-start gap-2" data-testid={`deutero-source-verse-${verse.verse}`}>
                  <p className="flex-1">
                    <span className="ml-2 font-bold text-emerald-700 dark:text-emerald-400">
                      {verse.verse}
                    </span>
                    {verse.text}
                  </p>
                  <button
                    type="button"
                    className="mt-1 shrink-0 whitespace-nowrap rounded px-2 py-1 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 hover:text-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
                    onClick={() => openTafsir('verse', verse.verse)}
                    data-testid={`deutero-verse-tafsir-${verse.verse}`}
                  >
                    تفسير الآية
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            لا توجد آيات متاحة لهذا الإصحاح في المصدر العام.
          </p>
        )}

        {tafsirView && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/10" dir="rtl">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-emerald-200 pb-3 dark:border-emerald-900/60">
              <h3 className="font-display text-base font-bold text-foreground">
                {tafsirView === 'intro'
                  ? `مقدمة عن سفر ${selectedBook?.name}`
                  : tafsirView === 'verse'
                    ? `تفسير ${selectedBook?.name} ${selectedChapter}:${tafsirVerse}`
                    : `تفسير ${selectedBook?.name} — الإصحاح ${selectedChapter}`}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1 text-xs text-muted-foreground"
                onClick={() => setTafsirView(null)}
                data-testid="deutero-close-tafsir"
              >
                <ChevronLeft className="h-4 w-4" />
                رجوع للآيات
              </Button>
            </div>

            {tafsirLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-700" />
                جاري تحميل التفسير...
              </div>
            ) : tafsirText ? (
              <>
                {tafsirView === 'verse' && tafsirScope === 'chapter' && (
                  <p className="mb-3 text-center text-xs text-muted-foreground" data-testid="deutero-tafsir-scope-note">
                    لا يوجد تفسير مخصوص لهذه الآية؛ المعروض هو تفسير الإصحاح {selectedChapter} كله.
                  </p>
                )}
                <div className="whitespace-pre-wrap rounded-lg bg-white/70 p-4 text-lg leading-loose dark:bg-background/40" data-testid="deutero-tafsir-content">
                  <TafsirText text={tafsirText} />
                </div>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  المصدر: نص تفسير فعلي من صفحات St-Takla.org، وليس رابطًا أو محتوى مولّدًا.
                </p>
              </>
            ) : (
              <div className="py-8 text-center text-muted-foreground" data-testid="deutero-no-tafsir">
                <BookText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm font-medium">
                  {tafsirReason === 'chapter-missing'
                    ? `لا يوجد تفسير مسجّل للإصحاح ${selectedChapter} حاليًا.`
                    : tafsirReason === 'book-missing'
                      ? `لا يوجد تفسير مضمّن لسفر ${selectedBook?.name} حاليًا.`
                      : tafsirView === 'intro'
                        ? 'لا توجد مقدمة تفسيرية متاحة لهذا السفر حاليًا.'
                        : tafsirView === 'verse'
                          ? 'لا يوجد تفسير متاح لهذه الآية حاليًا.'
                          : 'لا يوجد تفسير متاح حاليًا.'}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="border-t pt-3 text-center text-xs leading-5 text-muted-foreground">
           النص معروض مباشرة من مصدر St-Takla ولا يُخزّن في قاعدة بيانات MyBible.{' '}
          <a
             href={catalog.status.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-400"
          >
             فتح المصدر على St-Takla
          </a>
        </div>
      </div>
    </Card>
  );
}