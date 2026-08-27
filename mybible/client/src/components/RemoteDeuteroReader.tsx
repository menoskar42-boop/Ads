import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, ExternalLink, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export function RemoteDeuteroReader() {
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [selectedChapter, setSelectedChapter] = useState(1);

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
                <p key={verse.verse} data-testid={`deutero-source-verse-${verse.verse}`}>
                  <span className="ml-2 font-bold text-emerald-700 dark:text-emerald-400">
                    {verse.verse}
                  </span>
                  {verse.text}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            لا توجد آيات متاحة لهذا الإصحاح في المصدر العام.
          </p>
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