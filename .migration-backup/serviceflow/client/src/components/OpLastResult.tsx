// «آخر محاولة» جنب زرار إلغاء الإسناد وغيّر البورت (بروفيجن) — زى Re-Execute (المالك ٢٠٢٦-١١-٠٣).
// السكربت بيبعت كل نتيجة (نجاح أو سبب الوقوف) لـ /api/op-results/ingest، وهنا بنعرض آخر واحدة للرقم.
import { useQuery } from "@tanstack/react-query";
import { PORTCHANGE_AR, WFM_CANCEL_AR } from "@/lib/exec-queue";
import { nightAwareInterval, useNightPause } from "@/lib/night-pause";

type OpType = "wfmcancel" | "portchange";
export type OpLast = {
  result: string; message: string | null; reportedAt: string;
  detail?: { requestId?: string; status?: string } | null;
};
const LABELS: Record<OpType, Record<string, string>> = { wfmcancel: WFM_CANCEL_AR, portchange: PORTCHANGE_AR };

export const opResultKey = (v: unknown) => String(v ?? "").replace(/\D/g, "").replace(/^88/, "");

/** النص اللى بيتعرض — منفصل عشان يتختبر من غير React */
export function opLastText(type: OpType, r: OpLast): string {
  const label = LABELS[type][r.result] || r.result;
  const req = r.detail?.requestId ? ` · طلب ${r.detail.requestId}${r.detail.status ? ` (${r.detail.status})` : ""}` : "";
  const why = r.result !== "done" && r.message ? ` · ${r.message}` : "";
  return `آخر محاولة: ${label}${req}${why} · ${String(r.reportedAt || "").replace("T", " ").slice(0, 16)}`;
}

export function OpLastResult({ type, phone, enabled = true, compact = false }: {
  type: OpType; phone: string | null | undefined; enabled?: boolean; compact?: boolean;
}) {
  const key = opResultKey(phone);
  const { refreshPaused } = useNightPause();
  const { data } = useQuery<{ data: Record<string, OpLast> }>({
    queryKey: ["/api/op-results/last", type, key],
    queryFn: async () => {
      const r = await fetch(`/api/op-results/last?type=${type}&keys=${encodeURIComponent(key)}`, { credentials: "include" });
      return r.ok ? r.json() : { data: {} };
    },
    enabled: enabled && !!key,
    refetchInterval: nightAwareInterval(30_000, refreshPaused),
  });
  const row = key ? data?.data?.[key] : undefined;
  if (!row) return null;
  const bad = row.result === "failed" || row.result === "not_found";
  return (
    <span
      className={`${compact ? "text-[10px] max-w-[220px]" : "text-xs"} whitespace-normal ${bad ? "text-red-700" : row.result === "done" ? "text-emerald-700" : "text-amber-700"}`}
      data-testid={`text-op-last-${type}`}
    >
      {opLastText(type, row)}
    </span>
  );
}
