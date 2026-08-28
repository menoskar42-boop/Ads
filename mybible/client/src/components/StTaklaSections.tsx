import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, BookOpen, CalendarDays, Church, ChevronLeft, ChevronRight, ExternalLink, Library, RefreshCw, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api, type StTaklaSectionArticle, type StTaklaSectionCatalog, type StTaklaSectionKey, type StTaklaSectionItem } from '@/lib/api';

const sectionIcons: Record<StTaklaSectionKey, typeof Church> = {
  ritual: Church,
  bible: BookOpen,
  calendar: CalendarDays,
};

const sectionAccents: Record<StTaklaSectionKey, { icon: string; soft: string; border: string; text: string }> = {
  ritual: {
    icon: 'bg-amber-700 text-amber-50',
    soft: 'bg-amber-50/80 dark:bg-amber-950/20',
    border: 'border-amber-200/80 dark:border-amber-900/60',
    text: 'text-amber-800 dark:text-amber-300',
  },
  bible: {
    icon: 'bg-slate-700 text-slate-50',
    soft: 'bg-slate-50/90 dark:bg-slate-950/25',
    border: 'border-slate-200 dark:border-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
  },
  calendar: {
    icon: 'bg-teal-700 text-teal-50',
    soft: 'bg-teal-50/80 dark:bg-teal-950/20',
    border: 'border-teal-200/80 dark:border-teal-900/60',
    text: 'text-teal-800 dark:text-teal-300',
  },
};

function SourceLink({ href, label = 'المصدر على St-Takla.org' }: { href: string; label?: string }) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
      aria-label={`${label} — يفتح في نافذة جديدة`}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </a>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-[1.25fr_1fr_1fr]" aria-label="جاري تحميل أقسام St-Takla" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className={`rounded-2xl border border-border/60 bg-muted/25 p-5 ${item === 0 ? 'md:row-span-2 md:min-h-[220px]' : 'min-h-[150px]'}`}
        >
          <div className="mb-5 h-10 w-10 animate-pulse rounded-xl bg-muted" />
          <div className="mb-3 h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function UnavailableCatalog({ catalog }: { catalog: StTaklaSectionCatalog }) {
  const Icon = sectionIcons[catalog.key];
  const accent = sectionAccents[catalog.key];

  return (
    <div className={`rounded-2xl border ${accent.border} ${accent.soft} p-5`} data-testid={`sttakla-section-unavailable-${catalog.key}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent.icon}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-bold text-foreground">{catalog.title}</h3>
            <Badge variant="outline" className="border-amber-300/80 text-[11px] font-normal text-amber-700 dark:border-amber-800 dark:text-amber-300">
              غير متاح حاليًا
            </Badge>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {catalog.error || 'تعذر الوصول إلى هذا القسم من المصدر العام حاليًا.'}
          </p>
          <div className="mt-4">
            <SourceLink href={catalog.sourceUrl} />
          </div>
        </div>
      </div>
    </div>
  );
}

const ST_TAKLA_ROUTE = '/orthodox/st-takla';
const ST_TAKLA_SECTION_KEYS = new Set<StTaklaSectionKey>(['ritual', 'bible', 'calendar']);

function parseStTaklaLocation(location: string): {
  section: StTaklaSectionKey | null;
  browse: string | null;
  page: number;
  query: string;
} {
  const queryString = location.split('?')[1]?.split('#')[0] ?? '';
  const params = new URLSearchParams(queryString);
  const sectionValue = params.get('section');
  const pageValue = Number(params.get('page') || 1);

  return {
    section: sectionValue && ST_TAKLA_SECTION_KEYS.has(sectionValue as StTaklaSectionKey)
      ? sectionValue as StTaklaSectionKey
      : null,
    browse: params.get('browse')?.trim() || null,
    page: Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    query: params.get('q')?.trim().slice(0, 80) || '',
  };
}

function buildStTaklaUrl(state: {
  section: StTaklaSectionKey;
  browse: string;
  page: number;
  query: string;
}): string {
  const params = new URLSearchParams({
    section: state.section,
    browse: state.browse,
    page: String(Math.max(1, Math.floor(state.page))),
  });
  if (state.query) params.set('q', state.query);
  return `${ST_TAKLA_ROUTE}?${params.toString()}`;
}

export function StTaklaSections() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const currentLocation = search ? `${location}?${search}` : location;
  const locationState = useMemo(() => parseStTaklaLocation(currentLocation), [currentLocation]);
  const [searchInput, setSearchInput] = useState(locationState.query);
  const [selectedItem, setSelectedItem] = useState<StTaklaSectionItem | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<StTaklaSectionArticle | null>(null);
  const [browseArticleDismissed, setBrowseArticleDismissed] = useState(false);

  const sectionsQuery = useQuery({
    queryKey: ['sttakla-sections'],
    queryFn: api.stTakla.getSections,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const catalogs = useMemo(() => sectionsQuery.data?.sections ?? [], [sectionsQuery.data]);
  const selectedSectionKey = useMemo<StTaklaSectionKey | null>(() => {
    const requested = catalogs.find((catalog) => catalog.key === locationState.section);
    return requested?.key ?? catalogs.find((catalog) => catalog.status === 'ok')?.key ?? catalogs[0]?.key ?? null;
  }, [catalogs, locationState.section]);
  const selectedCatalog = useMemo(
    () => catalogs.find((catalog) => catalog.key === selectedSectionKey) ?? null,
    [catalogs, selectedSectionKey],
  );
  const selectedBrowseKey = useMemo(
    () => selectedCatalog?.browse.find((link) => link.id === locationState.browse)?.id ?? selectedCatalog?.browse[0]?.id ?? null,
    [selectedCatalog, locationState.browse],
  );
  const submittedQuery = locationState.query;
  const browsePage = locationState.page;

  const browseQuery = useQuery({
    queryKey: ['sttakla-section-browse', selectedSectionKey, selectedBrowseKey, submittedQuery, browsePage],
    queryFn: () => api.stTakla.browse(selectedSectionKey!, selectedBrowseKey!, submittedQuery, browsePage),
    enabled: Boolean(selectedSectionKey && selectedBrowseKey && selectedCatalog?.status === 'ok'),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const articleQuery = useQuery({
    queryKey: ['sttakla-section-article', selectedSectionKey, selectedItem?.url],
    queryFn: () => api.stTakla.article(selectedSectionKey!, selectedItem!.url),
    enabled: Boolean(selectedSectionKey && selectedItem),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const browseArticle = browseQuery.data?.article;
  const pagination = browseQuery.data?.pagination;
  const article = selectedArticle ?? articleQuery.data ?? (!selectedItem && !browseArticleDismissed ? browseArticle : undefined);
  const isArticleView = Boolean(selectedItem || article);
  const isArticleLoading = Boolean(selectedItem && articleQuery.isLoading);
  const articleError = Boolean(selectedItem && articleQuery.isError);

  useEffect(() => {
    setSearchInput(submittedQuery);
    setSelectedItem(null);
    setSelectedArticle(null);
    setBrowseArticleDismissed(false);
  }, [currentLocation, submittedQuery]);

  useEffect(() => {
    if (!catalogs.length || !selectedSectionKey || !selectedBrowseKey || location !== ST_TAKLA_ROUTE) return;
    const canonicalUrl = buildStTaklaUrl({
      section: selectedSectionKey,
      browse: selectedBrowseKey,
      page: browsePage,
      query: submittedQuery,
    });
    const isCanonical = locationState.section === selectedSectionKey
      && locationState.browse === selectedBrowseKey
      && locationState.page === browsePage
      && locationState.query === submittedQuery;
    if (!isCanonical) navigate(canonicalUrl, { replace: true });
  }, [catalogs.length, selectedBrowseKey, selectedSectionKey, browsePage, submittedQuery, location, currentLocation, navigate]);

  useEffect(() => {
    if (!pagination || pagination.page === browsePage || !selectedSectionKey || !selectedBrowseKey) return;
    navigate(buildStTaklaUrl({
      section: selectedSectionKey,
      browse: selectedBrowseKey,
      page: pagination.page,
      query: submittedQuery,
    }), { replace: true });
  }, [pagination?.page, browsePage, selectedSectionKey, selectedBrowseKey, submittedQuery, navigate]);

  const selectSection = (catalog: StTaklaSectionCatalog) => {
    setSelectedItem(null);
    setSelectedArticle(null);
    setBrowseArticleDismissed(false);
    const firstBrowse = catalog.browse[0]?.id;
    if (firstBrowse) {
      navigate(buildStTaklaUrl({ section: catalog.key, browse: firstBrowse, page: 1, query: '' }), { replace: true });
    }
  };

  const selectBrowseLink = (key: string) => {
    setSelectedItem(null);
    setSelectedArticle(null);
    setBrowseArticleDismissed(false);
    if (selectedSectionKey) {
      navigate(buildStTaklaUrl({ section: selectedSectionKey, browse: key, page: 1, query: '' }), { replace: true });
    }
  };

  const openArticle = (item: StTaklaSectionItem) => {
    setSelectedItem(item);
    setSelectedArticle(null);
    setBrowseArticleDismissed(false);
  };

  const goBackToBrowse = () => {
    setSelectedItem(null);
    setSelectedArticle(null);
    if (browseArticle) setBrowseArticleDismissed(true);
  };

  const goToBrowsePage = (page: number) => {
    if (!selectedSectionKey || !selectedBrowseKey) return;
    navigate(buildStTaklaUrl({
      section: selectedSectionKey,
      browse: selectedBrowseKey,
      page,
      query: submittedQuery,
    }), { replace: true });
  };

  if (sectionsQuery.isLoading) {
    return (
      <section className="mb-6 space-y-5" dir="rtl" data-testid="sttakla-sections-loading">
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/40 p-5 dark:border-amber-900/50 dark:bg-amber-950/10">
          <div className="h-3 w-28 animate-pulse rounded bg-amber-200/70 dark:bg-amber-900/60" />
          <div className="mt-3 h-6 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
        </div>
        <CatalogSkeleton />
      </section>
    );
  }

  if (sectionsQuery.isError) {
    return (
      <Card className="mb-6 border-amber-200/80 bg-amber-50/60 p-6 dark:border-amber-900/60 dark:bg-amber-950/15" dir="rtl" data-testid="sttakla-sections-error">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="font-display text-lg font-bold text-foreground">تعذر تحميل رف St-Takla</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            لم نتمكن من جلب فهرس الأقسام من المصدر الآن. أعد المحاولة للاتصال بالمصدر العام.
          </p>
          <Button type="button" variant="outline" className="mt-5 gap-2" onClick={() => sectionsQuery.refetch()} data-testid="sttakla-sections-retry">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            إعادة المحاولة
          </Button>
        </div>
      </Card>
    );
  }

  if (!catalogs.length) {
    return (
      <Card className="mb-6 border-dashed p-8 text-center" dir="rtl" data-testid="sttakla-sections-empty">
        <Library className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
        <h2 className="font-display text-lg font-bold text-foreground">لا توجد أقسام متاحة</h2>
        <p className="mt-2 text-sm text-muted-foreground">لم يرسل المصدر العام أي أقسام مرجعية في الوقت الحالي.</p>
      </Card>
    );
  }

  return (
    <section className="mb-6 space-y-5" dir="rtl" data-testid="sttakla-sections">
      <div className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-background to-teal-50/50 p-5 shadow-sm dark:border-amber-900/60 dark:from-amber-950/25 dark:via-background dark:to-teal-950/15">
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-700 text-amber-50 shadow-sm dark:bg-amber-800">
            <Library className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-300">رف مرجعي</p>
              <Badge variant="secondary" className="bg-background/70 text-[11px] font-normal text-muted-foreground">St-Takla.org</Badge>
            </div>
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">أقسام St-Takla المفيدة</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              مراجع إضافية للطقوس والكتاب المقدس والتقويم القبطي، مع إبقاء كل مادة منسوبة إلى مصدرها الأصلي.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1.25fr_1fr_1fr]" data-testid="sttakla-section-catalogs">
        {catalogs.map((catalog, index) => {
          if (catalog.status === 'unavailable') return <UnavailableCatalog key={catalog.key} catalog={catalog} />;

          const Icon = sectionIcons[catalog.key];
          const accent = sectionAccents[catalog.key];
          const isSelected = selectedCatalog?.key === catalog.key;

          return (
            <button
              key={catalog.key}
              type="button"
              className={`group rounded-2xl border p-5 text-right transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 ${index === 0 ? 'md:row-span-2 md:min-h-[220px]' : 'min-h-[150px]'} ${isSelected ? `${accent.border} ${accent.soft} shadow-sm` : 'border-border/70 bg-card hover:border-amber-200 dark:hover:border-amber-900'}`}
              onClick={() => selectSection(catalog)}
              aria-pressed={isSelected}
              data-testid={`sttakla-section-${catalog.key}`}
            >
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent.icon}`}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <ArrowRight className={`mt-1 h-4 w-4 rotate-180 transition-transform group-hover:-translate-x-1 ${isSelected ? accent.text : 'text-muted-foreground/60'}`} aria-hidden="true" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-foreground">{catalog.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{catalog.description}</p>
                <p className={`mt-4 text-xs font-medium ${isSelected ? accent.text : 'text-muted-foreground'}`}>
                  {catalog.browse.length ? `${catalog.browse.length} مداخل للتصفح` : 'لا توجد مداخل متاحة'}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {selectedCatalog?.status === 'unavailable' ? (
        <UnavailableCatalog catalog={selectedCatalog} />
      ) : selectedCatalog ? (
        <Card className="overflow-hidden border-border/70 shadow-sm" data-testid="sttakla-browse-panel">
          <div className="border-b border-border/70 bg-muted/20 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">تصفح المصدر</p>
                <h2 className="mt-1 font-display text-xl font-bold text-foreground">{selectedCatalog.title}</h2>
                <div className="mt-2">
                  <SourceLink href={selectedCatalog.sourceUrl} />
                </div>
              </div>
              <form
                className="flex w-full max-w-md gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSelectedItem(null);
                  setSelectedArticle(null);
                  setBrowseArticleDismissed(false);
                   if (selectedSectionKey && selectedBrowseKey) {
                     navigate(buildStTaklaUrl({
                       section: selectedSectionKey,
                       browse: selectedBrowseKey,
                       page: 1,
                       query: searchInput.trim(),
                     }), { replace: true });
                   }
                }}
                role="search"
                aria-label={`البحث في ${selectedCatalog.title}`}
              >
                <Input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="ابحث داخل هذا القسم"
                  className="h-10 bg-background/80 text-right"
                  aria-label="عبارة البحث"
                  data-testid="sttakla-search-input"
                />
                <Button type="submit" className="h-10 shrink-0 gap-2" data-testid="sttakla-search-submit">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  بحث
                </Button>
              </form>
            </div>
          </div>

          {selectedCatalog.browse.length ? (
            <div className="border-b border-border/70 px-5 py-4">
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="مداخل القسم">
                {selectedCatalog.browse.map((link) => (
                  <Button
                    key={link.id}
                    type="button"
                    size="sm"
                    variant={selectedBrowseKey === link.id ? 'default' : 'outline'}
                    className="h-auto min-h-9 whitespace-normal text-right"
                    onClick={() => selectBrowseLink(link.id)}
                    role="tab"
                    aria-selected={selectedBrowseKey === link.id}
                    data-testid={`sttakla-browse-key-${link.id}`}
                  >
                    {link.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {isArticleView ? (
            <div className="p-5 sm:p-7" data-testid="sttakla-article-view">
              <Button type="button" variant="ghost" size="sm" className="mb-5 gap-2 px-2 text-muted-foreground" onClick={goBackToBrowse} data-testid="sttakla-article-back">
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                العودة إلى النتائج
              </Button>

              {isArticleLoading ? (
                <div className="space-y-4" aria-busy="true" aria-label="جاري تحميل المقال">
                  <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="mt-7 h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
                </div>
              ) : articleError ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 text-center dark:border-amber-900/60 dark:bg-amber-950/15">
                  <AlertCircle className="mx-auto mb-2 h-6 w-6 text-amber-700 dark:text-amber-300" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">تعذر تحميل المقال من المصدر.</p>
                  <Button type="button" variant="outline" size="sm" className="mt-4 gap-2" onClick={() => articleQuery.refetch()} data-testid="sttakla-article-retry">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    إعادة المحاولة
                  </Button>
                </div>
              ) : article ? (
                <article>
                  <div className="mb-6 border-b border-border/70 pb-5">
                    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{selectedCatalog.title}</span>
                    </div>
                    <h3 className="font-display text-2xl font-bold leading-tight text-foreground">{article.title}</h3>
                  </div>
                  <div className="whitespace-pre-wrap font-display text-lg leading-[2.05] text-foreground/90" data-testid="sttakla-article-content">
                    {article.content}
                  </div>
                  <div className="mt-8 border-t border-border/70 pt-4">
                    <SourceLink href={article.sourceUrl} label="قراءة المقال على St-Takla.org" />
                  </div>
                </article>
              ) : null}
            </div>
          ) : browseQuery.isLoading ? (
            <div className="space-y-4 p-5" aria-busy="true" aria-label="جاري تحميل النتائج">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="rounded-xl border border-border/60 p-4">
                  <div className="h-4 w-2/5 animate-pulse rounded bg-muted" />
                  <div className="mt-3 h-3 w-1/4 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : browseQuery.isError ? (
            <div className="p-8 text-center" data-testid="sttakla-browse-error">
              <AlertCircle className="mx-auto mb-3 h-7 w-7 text-amber-700 dark:text-amber-300" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">تعذر تحميل مداخل هذا القسم.</p>
              <p className="mt-1 text-sm text-muted-foreground">قد يكون المصدر غير متاح مؤقتًا.</p>
              <Button type="button" variant="outline" size="sm" className="mt-4 gap-2" onClick={() => browseQuery.refetch()} data-testid="sttakla-browse-retry">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                إعادة المحاولة
              </Button>
            </div>
          ) : browseQuery.data?.items.length ? (
            <div className="divide-y divide-border/70" aria-busy={browseQuery.isFetching} data-testid="sttakla-browse-results">
              {browseQuery.data.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-right transition-colors hover:bg-amber-50/50 focus-visible:bg-amber-50/60 focus-visible:outline-none dark:hover:bg-amber-950/15 dark:focus-visible:bg-amber-950/20"
                  onClick={() => openArticle(item)}
                  data-testid={`sttakla-item-${item.id}`}
                >
                  <span className="min-w-0">
                    <span className="block font-display text-base font-semibold text-foreground transition-colors group-hover:text-amber-800 dark:group-hover:text-amber-300">{item.title}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{item.url}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 rotate-180 text-muted-foreground transition-transform group-hover:-translate-x-1" aria-hidden="true" />
                </button>
              ))}
              <div className="space-y-3 bg-muted/15 px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {submittedQuery ? `نتائج البحث عن «${submittedQuery}»` : 'مداخل من الفهرس العام'}
                  </p>
                  <SourceLink href={browseQuery.data.sourceUrl} />
                </div>
                {pagination ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 pt-3" data-testid="sttakla-pagination">
                    <p className="text-xs text-muted-foreground">
                      {pagination.totalItems} مدخلًا · صفحة {pagination.page} من {pagination.totalPages}
                    </p>
                    {pagination.totalPages > 1 ? (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => goToBrowsePage(pagination.page - 1)}
                          disabled={pagination.page <= 1 || browseQuery.isFetching}
                          aria-label="الصفحة السابقة"
                          data-testid="sttakla-pagination-previous"
                        >
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          السابق
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => goToBrowsePage(pagination.page + 1)}
                          disabled={pagination.page >= pagination.totalPages || browseQuery.isFetching}
                          aria-label="الصفحة التالية"
                          data-testid="sttakla-pagination-next"
                        >
                          التالي
                          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="p-9 text-center" data-testid="sttakla-browse-empty">
              <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-foreground">لا توجد نتائج</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {submittedQuery ? 'جرّب عبارة بحث أخرى داخل هذا المدخل.' : 'لا توجد مواد منشورة لهذا المدخل حاليًا.'}
              </p>
              <div className="mt-4">
                <SourceLink href={browseQuery.data?.sourceUrl || selectedCatalog.sourceUrl} />
              </div>
            </div>
          )}
        </Card>
      ) : null}
    </section>
  );
}

export default StTaklaSections;