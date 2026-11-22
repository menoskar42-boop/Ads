import { useQuery } from '@tanstack/react-query';

export interface PageOptimizations {
  showVerseEarly: boolean;    // weak_intro → move strong content to top
  reduceText: boolean;        // boring_content → hide verbose blocks
  showCTAEarly: boolean;      // missing_target → show action buttons higher
  dominantIssue: string | null;
  isLoading: boolean;
}

interface PageIssue {
  issueType: string;
  count: number;
}

const THRESHOLD = 3; // minimum occurrences to trigger optimization

/**
 * Fetches page issues and returns optimization flags.
 * Only activates when an issue appears ≥ THRESHOLD times.
 */
export function usePageOptimizations(pageUrl: string): PageOptimizations {
  const { data: issues, isLoading } = useQuery<PageIssue[]>({
    queryKey: ['/api/exit/issues', pageUrl],
    queryFn: async () => {
      const res = await fetch(`/api/exit/issues?page=${encodeURIComponent(pageUrl)}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 10 * 60 * 1000, // 10 min — optimizations don't need real-time updates
    gcTime: 30 * 60 * 1000,
  });

  if (!issues || issues.length === 0) {
    return { showVerseEarly: false, reduceText: false, showCTAEarly: false, dominantIssue: null, isLoading };
  }

  // Find the most frequent issue that exceeds the threshold
  const significant = issues
    .filter(i => i.count >= THRESHOLD && i.issueType !== 'normal_exit')
    .sort((a, b) => b.count - a.count);

  const dominant = significant[0]?.issueType ?? null;

  return {
    showVerseEarly: dominant === 'weak_intro',
    reduceText:     dominant === 'boring_content',
    showCTAEarly:   dominant === 'missing_target',
    dominantIssue:  dominant,
    isLoading,
  };
}
