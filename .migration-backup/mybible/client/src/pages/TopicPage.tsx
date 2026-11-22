import { useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Search, ChevronLeft, Hash, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const SITE = 'https://mybible.oscardevs.com';

interface TopicData {
  topic: {
    id: number;
    title: string;
    slug: string;
    keywords: string[];
    visitCount: number;
  };
  verses: Array<{
    id: number;
    bookName: string;
    chapter: number;
    verse: number;
    text: string;
  }>;
  related: Array<{ title: string; slug: string }>;
}

function VerseCard({ v, index }: { v: TopicData['verses'][0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      <Card className="p-4 hover:shadow-md transition-shadow" data-testid={`verse-card-${index}`}>
        <p className="text-xs font-semibold text-primary mb-2">
          {v.bookName} <bdo dir="ltr">{v.verse}:{v.chapter}</bdo>
        </p>
        <p className="font-display text-xl leading-loose text-foreground">{v.text}</p>
        <div className="mt-2 flex gap-2">
          <Link href={`/bible?book=${encodeURIComponent(v.bookName)}&chapter=${v.chapter}`}>
            <Button variant="ghost" size="sm" className="text-xs gap-1">
              <BookOpen className="w-3 h-3" />
              اقرأ الإصحاح
            </Button>
          </Link>
        </div>
      </Card>
    </motion.div>
  );
}

export default function TopicPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, isError } = useQuery<TopicData>({
    queryKey: ['topic', slug],
    queryFn: async () => {
      const res = await fetch(`/api/topics/${slug}`);
      if (!res.ok) throw new Error('Not found');
      return res.json();
    },
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  });

  // Dynamic SEO meta tags
  useEffect(() => {
    if (!data) return;
    const { topic, verses } = data;
    const title = `آيات الكتاب المقدس عن ${topic.title} | الكتاب المقدس رفيقي`;
    const desc = `مجموعة آيات من الكتاب المقدس عن ${topic.title}. ${verses.length} آية مختارة تتحدث عن ${topic.keywords.slice(0, 3).join('، ')}.`;
    const canonical = `${SITE}/topics/${slug}`;

    document.title = title;

    const setMeta = (sel: string, attr: string, val: string) => {
      const el = document.querySelector(sel);
      if (el) el.setAttribute(attr, val);
    };
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('link[rel="canonical"]', 'href', canonical);

    // Inject structured data
    let s = document.querySelector('script[data-topic-schema]');
    if (s) s.remove();
    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: title,
        description: desc,
        url: canonical,
        inLanguage: 'ar',
        about: { '@type': 'Thing', name: topic.title },
        publisher: { '@type': 'Organization', name: 'الكتاب المقدس رفيقي', url: SITE },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `آيات عن ${topic.title}`,
        description: desc,
        numberOfItems: verses.length,
        itemListElement: verses.slice(0, 10).map((v, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${v.bookName} ${v.chapter}:${v.verse}`,
          description: v.text.substring(0, 150),
        })),
      },
    ];
    schemas.forEach((schema, i) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-topic-schema', String(i));
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });

    return () => {
      document.querySelectorAll('script[data-topic-schema]').forEach(el => el.remove());
    };
  }, [data, slug]);

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-3xl text-center">
        <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="font-display text-2xl font-bold mb-2">الموضوع غير موجود</h1>
        <p className="text-muted-foreground mb-6">لم يتم إنشاء هذه الصفحة بعد</p>
        <Link href="/search">
          <Button>البحث في الكتاب المقدس</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-3xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-4" aria-label="breadcrumb">
        <Link href="/" className="hover:text-foreground">الرئيسية</Link>
        <ChevronLeft className="w-3 h-3" />
        <Link href="/search" className="hover:text-foreground">البحث</Link>
        <ChevronLeft className="w-3 h-3" />
        <span className="text-foreground">{data?.topic.title ?? slug}</span>
      </nav>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-md">
              <Hash className="w-6 h-6 text-white" />
            </div>
            <div>
              {isLoading ? (
                <Skeleton className="h-7 w-48 mb-1" />
              ) : (
                <h1 className="font-display text-2xl font-bold text-foreground">
                  آيات عن {data?.topic.title}
                </h1>
              )}
              <p className="text-sm text-muted-foreground">
                مجموعة آيات من الكتاب المقدس
              </p>
            </div>
          </div>

          {/* Keywords */}
          {data?.topic.keywords && data.topic.keywords.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {data.topic.keywords.map(kw => (
                <Badge key={kw} variant="secondary" className="text-xs">
                  {kw}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Intro paragraph — template based, not AI */}
        {data && (
          <Card className="p-4 mb-6 bg-primary/5 border-primary/10">
            <p className="text-sm leading-relaxed text-foreground">
              مجموعة آيات من الكتاب المقدس عن <strong>{data.topic.title}</strong>. تتناول هذه الآيات
              موضوع {data.topic.keywords.slice(0, 2).join(' و')} من منظور الكتاب المقدس باللغة العربية.
              يمكنك البحث عن المزيد من الآيات في صفحة البحث أو قراءة الكتاب المقدس كاملاً.
            </p>
          </Card>
        )}

        {/* Verses */}
        <section aria-label="الآيات">
          <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            الآيات ({isLoading ? '...' : data?.verses.length ?? 0})
          </h2>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : data?.verses.length === 0 ? (
            <Card className="p-8 text-center">
              <Sparkles className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">لا توجد آيات محددة لهذا الموضوع بعد</p>
              <Link href={`/search?q=${encodeURIComponent(data?.topic.title ?? '')}`}>
                <Button variant="outline" className="mt-3">ابحث عن "{data?.topic.title}"</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {data?.verses.map((v, i) => (
                  <VerseCard key={v.id} v={v} index={i} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {/* Related Topics — internal linking */}
        {data?.related && data.related.length > 0 && (
          <section className="mt-8" aria-label="مواضيع ذات صلة">
            <h2 className="font-display text-base font-semibold mb-3 text-muted-foreground">
              مواضيع ذات صلة
            </h2>
            <div className="flex flex-wrap gap-2">
              {data.related.map(r => (
                <Link key={r.slug} href={`/topics/${r.slug}`}>
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-primary/10 transition-colors text-sm px-3 py-1"
                    data-testid={`related-topic-${r.slug}`}
                  >
                    {r.title}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* CTA */}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/search?q=${encodeURIComponent(data?.topic.title ?? slug ?? '')}`}>
            <Button variant="outline" className="gap-2">
              <Search className="w-4 h-4" />
              بحث أعمق عن "{data?.topic.title ?? slug}"
            </Button>
          </Link>
          <Link href="/emotions">
            <Button variant="ghost" className="gap-2">
              <Sparkles className="w-4 h-4" />
              آيات حسب مشاعرك
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
