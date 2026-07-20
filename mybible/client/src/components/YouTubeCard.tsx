import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';

interface YouTubeCardProps {
  videoId: string;
  title?: string;
  autoplayEmbed?: boolean;
  start?: number;
  end?: number;
}

export function YouTubeCard({ videoId, title, start, end }: YouTubeCardProps) {
  const [playing, setPlaying] = useState(false);

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    + (start != null ? `&t=${start}` : '');
  const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`
    + (start != null ? `&start=${start}` : '')
    + (end   != null ? `&end=${end}`     : '');

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black">
        {playing ? (
          <iframe
            src={embedUrl}
            title={title ?? 'فيديو'}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="absolute inset-0 w-full h-full group cursor-pointer"
            aria-label={title ?? 'تشغيل الفيديو'}
          >
            <img
              src={thumbnailUrl}
              alt={title ?? 'صورة مصغرة للفيديو'}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors duration-300" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform duration-200">
                <Play className="w-7 h-7 text-white fill-white mr-[-2px]" />
              </div>
            </div>
            <div className="absolute bottom-2 left-2">
              <div className="bg-black/70 rounded px-1.5 py-0.5">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden="true">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </div>
            </div>
          </button>
        )}
      </div>

      {title && (
        <p className="text-sm text-muted-foreground text-right font-display line-clamp-2 px-1">{title}</p>
      )}

      <a
        href={youtubeUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-display text-sm transition-colors"
      >
        <ExternalLink className="w-4 h-4" />
        صعوبة في التشغيل؟ افتح على يوتيوب
      </a>
    </div>
  );
}
