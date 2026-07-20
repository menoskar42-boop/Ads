import { storage } from "./storage";

/**
 * score = (avg_time_spent * 0.5) + (avg_scroll_percent * 0.3) + (avg_clicks_per_session * 2)
 */
export function calculatePageScore(
  avgTimeSpent: number,
  avgScrollPercent: number,
  avgClicks: number,
): number {
  return Math.round((avgTimeSpent * 0.5) + (avgScrollPercent * 0.3) + (avgClicks * 2));
}

/**
 * Called after each metric insert — recalculates and upserts score for the page.
 */
export async function recalculatePageScore(pageUrl: string): Promise<void> {
  try {
    const agg = await storage.getPageAggregates(pageUrl);
    if (!agg || agg.totalSessions === 0) return;

    const score = calculatePageScore(
      agg.avgTimeSpent,
      agg.avgScrollPercent,
      agg.avgClicks,
    );

    await storage.upsertPageScore({
      pageUrl,
      score,
      totalSessions: agg.totalSessions,
      avgTimeSpent: agg.avgTimeSpent,
      avgScrollPercent: agg.avgScrollPercent,
      totalClicks: agg.totalClicks,
    });
  } catch (err) {
    console.error("[metrics] recalculate error:", err);
  }
}
