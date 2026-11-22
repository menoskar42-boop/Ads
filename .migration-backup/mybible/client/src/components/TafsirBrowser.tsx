import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  BookText,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useLocation, useSearch } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TafsirText } from '@/components/TafsirText';
import { api, type TafsirCoverageBook } from '@/lib/api';

type TestamentFilter = 'all' | 'old' | 'new';

const NEW_TESTAMENT_BOOKS = new Set([
  'متى',
  'مرقس',
  'لوقا',
  'يوحنا',
  'أعمال الرسل',
  'رومية',
  'كورنثوس أولى',
  'كورنثوس ثانية',
  'غلاطية',
  'أفسس',
  'فيلبي',
  'كولوسي',
  'تسالونيكي أولى',
  'تسالونيكي ثانية',
  'تيموثاوس أولى',
  'تيموثاوس ثانية',
  'تيطس',
  'فليمون',
  'عبرانيين',
  'يعقوب',
  'بطرس أولى',
  'بطرس ثانية',
  'يوحنا أولى',
  'يوحنا ثانية',
  'يوحنا ثالثة',
  'يهوذا',
  'رؤيا',
]);

function isNewTestament(book: string): boolean {
  return NEW_TESTAMENT_BOOKS.has(book);
}

function parseState(search: string): {
  filter: TestamentFilter;
  book: string;
  chapter: number | null;
} {
  const params = new URLSearchParams(search);
  const filter = params.get('testament');
  const chapter = Number(params.get('chapter'));

  return {
    filter: filter === 'old' || filter === 'new' ? filter : 'all',
    book: params.get('book')?.trim() ?? '',
    chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : null,
  };
}

function sourceLink(url: string) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground"
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      فهرس التفسير على St-Takla.org
    </a>
  );
}

function coverageLabel(book: TafsirCoverageBook): string {
  if (book.fileMissing) return 'غير متاح';
  if (book.missing.length || book.substantive < book.expected) return 'جزئي';
  return 'مكتمل';
}

function coverageClasses(book: TafsirCoverageBook): string {
  if (book.fileMissing) {
    return 'border-border/70 bg-card text-muted-foreground';
  }
  if (book.missing.length || book.substantive < book.expected) {
    return 'border-amber-200 bg-amber-50/60 dark:border-amber-900/60 dark:bg-amber-950/15';
  }
  return 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/60 dark:bg-emerald-950/15';
}

function BookListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="جاري تحميل فهرس التفاسير">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="rounded-xl border border-border/60 p-3">
          <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function ChapterGrid({
  book,
  chapter,
  onSelect,
}: {
  book: TafsirCoverageBook;
  chapter: number | null;
  onSelect: (chapter: number) => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold text-foreground">
          إصحاحات سفر {book.book}
        </h3>
        <span className="text-xs text-muted-foreground">
          {book.substantive} تفسير حقيقي من {book.expected}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {Array.from({ length: book.expected }, (_, index) => index + 1).map((number) => {
          const missing = book.missing.includes(number);
          const selected = chapter === number;
          return (
            <button
              key={number}
              type="button"
              onClick={() => onSelect(number)}
              aria-pressed={selected}
              aria-label={`الإصحاح ${number} — ${missing ? 'محاولة جلب من المصدر' : 'متاح'}`}
              className={`min-h-11 rounded-lg border px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : missing
                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300'
                    : 'border-border/70 bg-background text-foreground hover:border-primary/60 hover:bg-primary/5'
              }`}
            >
              {number}
            </button>
          );
        })}
      </div>
      {book.missing.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          الإصحاحات غير المتاحة حاليًا: {book.missing.join('، ')}. لا نعرض تفسير إصحاح آخر بدلًا منها.
        </p>
      )}
    </div>
  );
}

export function TafsirBrowser() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const initialState = useMemo(() => parseState(search), [search]);
  const [searchInput, setSearchInput] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<TestamentFilter>(initialState.filter);
  const [selectedBookName, setSelectedBookName] = useState(initialState.book);
  const [selectedChapter, setSelectedChapter] = useState<number | null>(initialState.chapter);
  const readerHeadingRef = useRef<HTMLHeadingElement>(null);

  const coverageQuery = useQuery({
    queryKey: ['tafsir-coverage'],
    queryFn: () => api.tafsir.getCoverage(),
    staleTime: 60_000,
    retry: 1,
  });

  const books = coverageQuery.data?.books ?? [];
  const filteredBooks = useMemo(() => {
    const query = searchInput.trim();
    return books.filter((book) => {
      const matchesFilter =
        selectedFilter === 'all' ||
        (selectedFilter === 'new' ? isNewTestament(book.book) : !isNewTestament(book.book));
      return matchesFilter && (!query || book.book.includes(query));
    });
  }, [books, searchInput, selectedFilter]);

  const selectedBook = books.find((book) => book.book === selectedBookName) ?? null;
  const validSelectedBook = selectedBook && (
    selectedFilter === 'all' ||
    (selectedFilter === 'new' ? isNewTestament(selectedBook.book) : !isNewTestament(selectedBook.book))
  ) ? selectedBook : null;
  const activeBook = validSelectedBook ?? filteredBooks[0] ?? null;
  const activeChapter = activeBook && selectedChapter && selectedChapter <= activeBook.expected
    ? selectedChapter
    : activeBook && !activeBook.fileMissing
      ? Math.max(1, activeBook.missing.includes(1) ? (Array.from({ length: activeBook.expected }, (_, i) => i + 1).find((n) => !activeBook.missing.includes(n)) ?? 1) : 1)
      : null;

  const chapterQuery = useQuery({
    queryKey: ['tafsir-chapter', activeBook?.book, activeChapter],
    queryFn: () => api.tafsir.getChapter(activeBook!.book, activeChapter!),
    enabled: Boolean(activeBook && activeChapter),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  useEffect(() => {
    setSelectedFilter(initialState.filter);
    setSelectedBookName(initialState.book);
    setSelectedChapter(initialState.chapter);
  }, [initialState.book, initialState.chapter, initialState.filter]);

  useEffect(() => {
    if (!activeBook) return;
    const selectedIsValid = selectedBookName === activeBook.book && selectedChapter === activeChapter;
    if (selectedIsValid) return;
    setSelectedBookName(activeBook.book);
    setSelectedChapter(activeChapter);
  }, [activeBook, activeChapter, selectedBookName, selectedChapter]);

  useEffect(() => {
    if (!chapterQuery.data?.tafsir || !readerHeadingRef.current) return;
    readerHeadingRef.current.focus();
  }, [chapterQuery.data?.tafsir]);

  const updateUrl = (filter: TestamentFilter, book: string, chapter: number | null) => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('testament', filter);
    if (book) params.set('book', book);
    if (chapter) params.set('chapter', String(chapter));
    const query = params.toString();
    navigate(query ? `/orthodox/tafseer?${query}` : '/orthodox/tafseer', { replace: true });
  };

  const selectBook = (book: TafsirCoverageBook, filter = selectedFilter) => {
    const firstAvailable = Array.from({ length: book.expected }, (_, index) => index + 1)
      .find((number) => !book.missing.includes(number)) ?? null;
    setSelectedBookName(book.book);
    setSelectedChapter(firstAvailable);
    updateUrl(filter, book.book, firstAvailable);
  };

  const selectChapter = (chapter: number) => {
    if (!activeBook) return;
    setSelectedChapter(chapter);
    updateUrl(selectedFilter, activeBook.book, chapter);
  };

  if (coverageQuery.isLoading) {
    return (
      <section className="space-y-5" dir="rtl" data-testid="tafsir-browser-loading">
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-5 dark:border-amber-900/60 dark:bg-amber-950/15">
          <div className="h-3 w-28 animate-pulse rounded bg-amber-200/70 dark:bg-amber-900/60" />
          <div className="mt-3 h-7 w-72 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-muted" />
        </div>
        <BookListSkeleton />
      </section>
    );
  }

  if (coverageQuery.isError || !coverageQuery.data) {
    return (
      <Card className="border-amber-200/80 bg-amber-50/60 p-8 text-center dark:border-amber-900/60 dark:bg-amber-950/15" dir="rtl" data-testid="tafsir-browser-error">
        <AlertCircle className="mx-auto mb-3 h-7 w-7 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        <h2 className="font-display text-lg font-bold text-foreground">تعذر تحميل فهرس التفاسير</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          لم نتمكن من قراءة تقرير التغطية من مصدر St-Takla الآن. لم نعرض ملخصات بديلة غير موثقة.
        </p>
        <Button type="button" variant="outline" className="mt-5 gap-2" onClick={() => coverageQuery.refetch()} data-testid="tafsir-browser-retry">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          إعادة المحاولة
        </Button>
      </Card>
    );
  }

  const { totals } = coverageQuery.data;
  const completeBooks = books.filter((book) => !book.fileMissing && !book.missing.length && book.substantive >= book.expected).length;

  return (
    <section className="space-y-5" dir="rtl" data-testid="tafsir-browser">
      <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-background to-teal-50/50 p-5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/25 dark:via-background dark:to-teal-950/15">
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-700 text-amber-50 shadow-sm dark:bg-amber-800">
            <BookOpen className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-300">مرجع حي</p>
              <Badge variant="secondary" className="bg-background/70 text-[11px] font-normal text-muted-foreground">St-Takla.org</Badge>
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">تفسير الكتاب المقدس</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              النصوص المعروضة هنا مأخوذة من سلسلة تفسير الكتاب المقدس المنشورة على St-Takla.org. نعرض حالة التغطية كما هي، ولا نعتبر العناوين القصيرة تفسيرًا كاملًا.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span>{completeBooks} سفرًا مكتملًا</span>
              <span>{totals.substantiveChapters} من {totals.expectedChapters} إصحاحًا بمواد تفسيرية</span>
              {sourceLink('https://st-takla.org/pub_Bible-Interpretations/Tafseer-Al-Keta-Al-Mokadas-index-2-Father-Antonios-Fekry.html')}
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="تصفية أسفار الكتاب المقدس">
          {([
            ['all', 'الكل'],
            ['old', 'العهد القديم'],
            ['new', 'العهد الجديد'],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={selectedFilter === value ? 'default' : 'outline'}
              aria-pressed={selectedFilter === value}
              onClick={() => {
                setSelectedFilter(value);
                const nextBook = books.find((book) => value === 'all' || (value === 'new' ? isNewTestament(book.book) : !isNewTestament(book.book)));
                if (nextBook) selectBook(nextBook, value);
                else updateUrl(value, '', null);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="ابحث عن سفر"
            aria-label="ابحث عن سفر"
            className="pr-9 text-right"
            data-testid="tafsir-book-search"
          />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.8fr)]">
        <Card className="h-fit overflow-hidden border-border/70" data-testid="tafsir-book-list">
          <div className="border-b border-border/70 bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display font-bold text-foreground">الأسفار</h3>
              <span className="text-xs text-muted-foreground">{filteredBooks.length} من {books.length}</span>
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto p-2">
            {filteredBooks.length ? filteredBooks.map((book) => (
              <button
                key={book.book}
                type="button"
                onClick={() => selectBook(book)}
                aria-pressed={activeBook?.book === book.book}
                className={`mb-1 flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeBook?.book === book.book ? 'border-primary/60 bg-primary/5' : 'border-transparent hover:border-border/70 hover:bg-muted/40'}`}
                data-testid={`tafsir-book-${book.book}`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-display text-sm font-semibold text-foreground">{book.book}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {book.present} من {book.expected} إصحاحًا
                  </span>
                </span>
                <Badge variant="outline" className={`shrink-0 text-[10px] ${book.missing.length || book.substantive < book.expected ? 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300' : 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300'}`}>
                  {coverageLabel(book)}
                </Badge>
              </button>
            )) : (
              <p className="p-6 text-center text-sm text-muted-foreground" data-testid="tafsir-book-empty">
                لا توجد أسفار مطابقة للبحث.
              </p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden border-border/70" data-testid="tafsir-reader">
          {activeBook ? (
            <>
              <div className={`border-b p-5 ${coverageClasses(activeBook)}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">السفر المختار</p>
                    <h3 className="mt-1 font-display text-xl font-bold text-foreground">{activeBook.book}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {activeBook.substantive} إصحاحًا بمواد تفسيرية حقيقية من أصل {activeBook.expected}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-current text-xs">{coverageLabel(activeBook)}</Badge>
                </div>
                <ChapterGrid book={activeBook} chapter={activeChapter} onSelect={selectChapter} />
              </div>

              <div className="p-5 sm:p-7">
                <div className="mb-5 flex items-center justify-between gap-3 border-b border-border/70 pb-4">
                  <div className="flex items-center gap-2">
                    <BookText className="h-5 w-5 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                    <h2 ref={readerHeadingRef} tabIndex={-1} className="font-display text-lg font-bold text-foreground focus-visible:outline-none">
                      {activeChapter ? `تفسير ${activeBook.book} — الإصحاح ${activeChapter}` : 'اختر إصحاحًا للقراءة'}
                    </h2>
                  </div>
                  {chapterQuery.isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="جاري تحميل التفسير" />}
                </div>

                {activeBook.fileMissing ? (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    لا توجد مادة لهذا السفر في بيانات المصدر الحالية.
                  </div>
                ) : chapterQuery.isError ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 text-center dark:border-amber-900/60 dark:bg-amber-950/15">
                    <AlertCircle className="mx-auto mb-2 h-6 w-6 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                    <p className="text-sm font-medium text-foreground">تعذر تحميل الإصحاح من المصدر.</p>
                    <Button type="button" variant="outline" size="sm" className="mt-4 gap-2" onClick={() => chapterQuery.refetch()}>
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      إعادة المحاولة
                    </Button>
                  </div>
                ) : chapterQuery.isLoading ? (
                  <div className="space-y-3 rounded-xl border border-border/60 p-6" aria-busy="true" aria-label="جاري تحميل التفسير">
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                  </div>
                ) : chapterQuery.data?.tafsir ? (
                  <article aria-busy={chapterQuery.isFetching} className="font-display text-lg leading-[2.05] text-foreground/90" data-testid="tafsir-reader-content">
                    {chapterQuery.data.origin === 'live' && (
                      <div className="mb-4 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-2 text-xs text-teal-800 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-teal-300">
                        جُلب هذا الإصحاح مباشرة من الصفحة الحالية على St-Takla.org لأن النسخة المحلية كانت ناقصة.
                      </div>
                    )}
                    <TafsirText
                      text={chapterQuery.data.tafsir}
                      sourceUrl={chapterQuery.data.source.url}
                      sourceLabel="قراءة هذا الإصحاح على St-Takla.org"
                    />
                  </article>
                ) : (
                  <div className="rounded-xl border border-dashed border-amber-300 p-6 text-center text-sm leading-6 text-muted-foreground dark:border-amber-800" data-testid="tafsir-reader-missing">
                    لا توجد مادة تفسيرية لهذا الإصحاح في المصدر الحالي. لم نعرض تفسير الإصحاح السابق أو التالي بدلًا منه.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
              <BookOpen className="mb-3 h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
              <h3 className="font-display text-lg font-bold text-foreground">اختر سفرًا</h3>
              <p className="mt-2 text-sm text-muted-foreground">اختر سفرًا من الفهرس لعرض إصحاحاته وتفسيره الكامل.</p>
            </div>
          )}
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4 text-xs text-muted-foreground">
        <span>المصدر: St-Takla.org · التغطية: {totals.presentChapters} من {totals.expectedChapters} إصحاحًا</span>
        <div className="hidden items-center gap-2 sm:flex">
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span>اختر رقم الإصحاح للقراءة</span>
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}