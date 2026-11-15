import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ClipboardCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type FollowupRow = {
  isComplete?: boolean;
  reviewedAt?: string | null;
  sourceData?: Record<string, unknown>;
};

type FollowupResponse = {
  rows: FollowupRow[];
};

type RepeatedRow = {
  phoneShort: string | null;
  lastComplainTime: string | null;
};

type RepeatReviewResponse = {
  data: { phoneShort: string; month: string }[];
};

type ProgressItem = {
  key: string;
  label: string;
  total: number;
  answered: number;
};

const currentCairoMonth = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "تعذر تحميل تقرير إنجاز المتابعة");
  }
  return response.json();
}

export function InspectionFollowupProgressReport() {
  const [month, setMonth] = useState(currentCairoMonth);
  const query = useQuery({
    queryKey: ["/api/inspection-followup/progress", month],
    queryFn: async () => {
      const monthStart = `${month}-01`;
      const [year, monthNumber] = month.split("-").map(Number);
      const monthEnd = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, "0")}`;
      const fetchSection = (section: string) =>
        getJson<FollowupResponse>(`/api/inspection-followup?section=${section}&month=${month}`);

      const [maintenance, om, installations, repeated] = await Promise.all([
        fetchSection("maintenance"),
        fetchSection("om"),
        fetchSection("installations"),
        getJson<RepeatedRow[]>(
          `/api/reports/repeated-within-month?dateFrom=${monthStart}&dateTo=${monthEnd}`,
        ),
      ]);

      const repeatKeys = Array.from(new Set(
        repeated
          .filter((row) => row.phoneShort && /^\d{4}-\d{2}$/.test(String(row.lastComplainTime || "").slice(0, 7)))
          .map((row) => `${row.phoneShort}|${String(row.lastComplainTime).slice(0, 7)}`),
      ));
      const reviewBatches: string[][] = [];
      for (let index = 0; index < repeatKeys.length; index += 200) {
        reviewBatches.push(repeatKeys.slice(index, index + 200));
      }
      const reviews = await Promise.all(reviewBatches.map((keys) =>
        getJson<RepeatReviewResponse>(`/api/repeat-reviews?keys=${encodeURIComponent(keys.join(","))}`),
      ));
      const repliedRepeats = new Set(reviews.flatMap((response) =>
        response.data.map((review) => `${review.phoneShort}|${review.month}`),
      ));
      const repeatedAnswered = repeated.filter((row) =>
        row.phoneShort && repliedRepeats.has(`${row.phoneShort}|${String(row.lastComplainTime || "").slice(0, 7)}`),
      ).length;

      const items: ProgressItem[] = [
        {
          key: "om",
          label: "متعذرات في المتابعة",
          total: om.rows.length,
          answered: om.rows.filter((row) => Boolean(row.sourceData?.respExternalResponseAt)).length,
        },
        {
          key: "installations",
          label: "التركيبات",
          total: installations.rows.length,
          answered: installations.rows.filter((row) => Boolean(row.reviewedAt || row.isComplete)).length,
        },
        {
          key: "repeated",
          label: "الأعطال المكررة",
          total: repeated.length,
          answered: repeatedAnswered,
        },
        {
          key: "maintenance",
          label: "صيانة البوكسات",
          total: maintenance.rows.length,
          answered: maintenance.rows.filter((row) => Boolean(row.isComplete)).length,
        },
      ];
      return items.map((item) => ({
        ...item,
        answered: Math.min(item.total, item.answered),
      }));
    },
  });

  const items = query.data ?? [];
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const answered = items.reduce((sum, item) => sum + item.answered, 0);
  const pending = Math.max(0, total - answered);
  const percent = total ? Math.round((answered * 100) / total) : 0;

  return (
    <div className="space-y-4 text-slate-800" dir="rtl">
      <section className="rounded-xl border border-[#cbd9d5] bg-[#f3f6f2] p-4 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-teal-800">
              <ClipboardCheck className="h-4 w-4" /> إنجاز الشئون الخارجية
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">نسبة إنجاز المتابعة</h2>
            <p className="mt-1 text-sm text-slate-600">إجمالي ما تم الرد عليه والمتبقي في أقسام المتابعة.</p>
          </div>
          <label className="flex w-full flex-col gap-1 text-xs font-semibold text-slate-600 sm:w-48">
            شهر التقرير
            <Input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-10 border-slate-300 bg-white font-mono"
              dir="ltr"
              data-testid="input-followup-progress-month"
            />
          </label>
        </div>
      </section>

      {query.isLoading && (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500" role="status">
          <Loader2 className="h-5 w-5 animate-spin" /> جاري حساب إنجاز المتابعة…
        </div>
      )}
      {query.isError && (
        <Card className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
          <AlertCircle className="h-6 w-6 text-rose-700" />
          <p className="font-semibold text-slate-800">{(query.error as Error).message}</p>
          <Button variant="outline" onClick={() => void query.refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> إعادة المحاولة
          </Button>
        </Card>
      )}
      {query.data && (
        <>
          <Card className="border-teal-200 bg-teal-900 p-4 text-white sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-teal-100">إنجاز المتابعة الكلي</div>
                <div className="mt-1 text-3xl font-bold">{percent}%</div>
                <div className="mt-1 text-xs text-teal-100">
                  تم الرد على {answered.toLocaleString("ar-EG")} من {total.toLocaleString("ar-EG")} سجل
                </div>
              </div>
              <div className="text-left text-sm">
                <div>المتبقي: <b>{pending.toLocaleString("ar-EG")}</b></div>
                <div className="mt-1">الأقسام: <b>{items.length}</b></div>
              </div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-teal-950/50" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${percent}%` }} />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => {
              const remaining = Math.max(0, item.total - item.answered);
              const itemPercent = item.total ? Math.round((item.answered * 100) / item.total) : 0;
              return (
                <Card key={item.key} className="space-y-3 border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900">{item.label}</h3>
                    <span className="rounded-full bg-teal-50 px-2.5 py-1 text-sm font-bold text-teal-800">{itemPercent}%</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <div className="text-lg font-bold text-slate-900">{item.total.toLocaleString("ar-EG")}</div>
                      <div className="text-[11px] text-slate-500">الإجمالي</div>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-2">
                      <div className="flex items-center justify-center gap-1 text-lg font-bold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4" /> {item.answered.toLocaleString("ar-EG")}
                      </div>
                      <div className="text-[11px] text-emerald-800">تم الرد</div>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-2">
                      <div className="text-lg font-bold text-amber-800">{remaining.toLocaleString("ar-EG")}</div>
                      <div className="text-[11px] text-amber-800">المتبقي</div>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-teal-700" style={{ width: `${itemPercent}%` }} />
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
