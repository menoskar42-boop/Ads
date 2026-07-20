import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Video, BookOpen, ChevronLeft, ExternalLink, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SEOHead } from '@/components/SEOHead';

interface VideoSeoData {
  youtubeId: string;
  title: string;
  description: string;
  book: string;
  chapter: number;
  keywords: string[];
}

export default function VideoPage() {
  const params = useParams<{ id: string }>();
  const youtubeId = params.id || '';

  const { data: videoData, isLoading } = useQuery<VideoSeoData>({
    queryKey: ['/api/video-seo', youtubeId],
    queryFn: async () => {
      const res = await fetch(`/api/video-seo/${youtubeId}`);
      if (!res.ok) throw new Error('Video not found');
      return res.json();
    },
    enabled: !!youtubeId,
  });

  const title = videoData?.title || 'فيديو تفسير الكتاب المقدس';
  const description = videoData?.description || 'فيديو تفسيري من الكتاب المقدس باللغة العربية.';

  return (
    <>
      <SEOHead
        dynamicSEO={videoData ? {
          title: `${title} | الكتاب المقدس رفيقي`,
          description,
          keywords: videoData.keywords,
          schema: {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": title,
            "description": description,
            "thumbnailUrl": `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
            "embedUrl": `https://www.youtube.com/embed/${youtubeId}`,
            "inLanguage": "ar",
            "publisher": { "@type": "Organization", "name": "الكتاب المقدس رفيقي" }
          }
        } : null}
      />

      <div className="min-h-screen bg-background" dir="rtl">
        <div className="max-w-4xl mx-auto px-4 py-6">

          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4 flex-wrap">
            <a href="/" className="hover:text-primary transition-colors">الرئيسية</a>
            <ChevronLeft className="w-3 h-3" />
            <a href="/bible" className="hover:text-primary transition-colors">الكتاب المقدس</a>
            {videoData?.book && (
              <>
                <ChevronLeft className="w-3 h-3" />
                <a
                  href={`/bible?book=${encodeURIComponent(videoData.book)}`}
                  className="hover:text-primary transition-colors"
                >
                  {videoData.book}
                </a>
              </>
            )}
          </nav>

          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 bg-muted rounded w-3/4" />
              <div className="aspect-video bg-muted rounded-xl" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {/* Title */}
              <div>
                <h1 className="font-display text-2xl font-bold text-foreground mb-2">
                  {title}
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {description}
                </p>
              </div>

              {/* YouTube Embed */}
              <div className="aspect-video rounded-xl overflow-hidden shadow-lg bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?rel=0&hl=ar`}
                  title={title}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>

              {/* Keywords */}
              {videoData?.keywords && videoData.keywords.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {videoData.keywords.map(kw => (
                    <Badge key={kw} variant="secondary" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Related links */}
              <div className="grid sm:grid-cols-2 gap-3">
                {videoData?.book && videoData.chapter > 0 && (
                  <Card className="p-4 hover:shadow-md transition-shadow">
                    <a
                      href={`/bible?book=${encodeURIComponent(videoData.book)}&chapter=${videoData.chapter}`}
                      className="flex items-center gap-3 group"
                    >
                      <BookOpen className="w-5 h-5 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">اقرأ النص الكامل</p>
                        <p className="font-semibold text-sm group-hover:text-primary transition-colors truncate">
                          {videoData.book} الإصحاح {videoData.chapter}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground mr-auto group-hover:text-primary shrink-0" />
                    </a>
                  </Card>
                )}
                {videoData?.book && (
                  <Card className="p-4 hover:shadow-md transition-shadow">
                    <a
                      href={`/bible?book=${encodeURIComponent(videoData.book)}`}
                      className="flex items-center gap-3 group"
                    >
                      <Video className="w-5 h-5 text-purple-600 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground mb-0.5">استعرض السفر كاملاً</p>
                        <p className="font-semibold text-sm group-hover:text-primary transition-colors truncate">
                          تفسير {videoData.book} كامل
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground mr-auto group-hover:text-primary shrink-0" />
                    </a>
                  </Card>
                )}
              </div>

              {/* External YouTube link */}
              <div className="flex gap-3 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="gap-2"
                >
                  <a
                    href={`https://www.youtube.com/watch?v=${youtubeId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    مشاهدة على YouTube
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild className="gap-2">
                  <a href="/bible">
                    <BookOpen className="w-4 h-4" />
                    الكتاب المقدس
                  </a>
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
}
