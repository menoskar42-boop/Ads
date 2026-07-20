import { DailyVerse } from '@/components/home/DailyVerse';
import { TodayReading } from '@/components/home/TodayReading';
import { QuickActions } from '@/components/home/QuickActions';
import { ReadingPlansPreview } from '@/components/home/ReadingPlansPreview';
import { Disclaimer } from '@/components/home/Disclaimer';
import { TrendingContent } from '@/components/home/TrendingContent';
import { OfflineManager } from '@/components/OfflineManager';
import { SEOHead } from '@/components/SEOHead';
import { usePageTracker } from '@/hooks/usePageTracker';
import { useExitTracker } from '@/hooks/useExitTracker';
import { usePageOptimizations } from '@/hooks/usePageOptimizations';

export default function Home() {
  usePageTracker('/');
  useExitTracker('/');
  const opts = usePageOptimizations('/');

  // Auto-optimization: reorder sections based on detected issues
  const mainContent = (
    <div className="space-y-6">
      {/* weak_intro: bring verse to very top (it's always first anyway) */}
      <DailyVerse />

      {/* missing_target: show QuickActions above reading grid */}
      {opts.showCTAEarly && <QuickActions />}

      <div className="grid lg:grid-cols-2 gap-6">
        <TodayReading />
        <ReadingPlansPreview />
      </div>

      {/* default QuickActions position (unless moved up) */}
      {!opts.showCTAEarly && <QuickActions />}

      <TrendingContent />
      <OfflineManager />
      <Disclaimer />
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <SEOHead />
      {mainContent}
    </div>
  );
}
