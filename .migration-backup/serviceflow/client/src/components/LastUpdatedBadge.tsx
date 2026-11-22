import { useQuery } from "@tanstack/react-query";
import { useNightPause, nightAwareInterval } from "@/lib/night-pause";
import { fmtUploadTime } from "@/lib/cairo-time";

// شارة "آخر تحديث" لملف مصدر معيّن (مثلاً FCC / WFM / OSS) — تقرأ من /api/upload-times
export function LastUpdatedBadge({ endpoint, label }: { endpoint: string; label: string }) {
  // بالليل (١٢ ← ٧) مفيش تحديث دورى — أى سؤال للسيرفر بيصحّى القاعدة (إلا لو حد بيستعمل البرنامج)
  const { refreshPaused: nightPaused } = useNightPause();
  const { data: uploadTimes = {} } = useQuery<Record<string, string | null>>({
    queryKey: ["/api/upload-times"],
    queryFn: () => fetch("/api/upload-times", { credentials: "include" }).then((r) => r.json()),
    refetchInterval: nightAwareInterval(60000, nightPaused),
    staleTime: 30000,
  });
  return (
    <span className="text-xs px-2 py-0.5 rounded font-medium bg-slate-100 text-slate-700 whitespace-nowrap">
      {label}: <strong>{fmtUploadTime(uploadTimes[endpoint])}</strong>
    </span>
  );
}
