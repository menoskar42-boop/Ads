import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronLeft, Loader2, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { printTablePDF } from "@/lib/print-pdf";

// «سجل خطوات PO» (المالك ٢٠٢٦-١١-٠٣): سكربت رفع السرعة/الإيقاف (0.9.24+) بيبعت سطر لكل خط فيه كل خطوة
// عملها — الحالة اللى قراها، اختار إيه من Choose Action وإزاى، داس Yes ولا لأ، الريفريشات، والنتيجة.
// server: GET /api/po-traces (سوبر أدمن) · الجدول po_traces.

interface Step { t: string | null; s: string | null; m: string | null }
interface Trace {
  id: number; accountNo: string; mode: string | null; outcome: string | null; lastStatus: string | null;
  lane: string | null; version: string | null; startedAt: string | null; endedAt: string | null; createdAt: string;
  steps: Step[] | null;
}

const OUTCOMES: Record<string, { label: string; cls: string }> = {
  stopped:     { label: "اتوقف",                    cls: "bg-emerald-100 text-emerald-800" },
  already:     { label: "كان Not Started",          cls: "bg-slate-100 text-slate-700" },
  raise:       { label: "رفع سرعة",                 cls: "bg-blue-100 text-blue-800" },
  gave_up:     { label: "فشل بعد ٣ محاولات",        cls: "bg-red-100 text-red-800" },
  timeout:     { label: "المهلة خلصت",              cls: "bg-red-100 text-red-800" },
  interrupted: { label: "اتقطع (التاب اتقفل)",       cls: "bg-amber-100 text-amber-800" },
  not_found:   { label: "الرقم مش موجود",           cls: "bg-slate-100 text-slate-700" },
  skipped:     { label: "اتخطّى",                    cls: "bg-amber-100 text-amber-800" },
  no_result:   { label: "من غير نتيجة",             cls: "bg-red-100 text-red-800" },
};
const outcomeLabel = (o: string | null) => (o && OUTCOMES[o]?.label) || o || "-";
const BAD = new Set(["gave_up", "timeout", "interrupted", "no_result", "skipped"]);

const todayCairo = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const fmt = (v: string | null) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("en-GB", { timeZone: "Africa/Cairo", hour12: false, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};
const clock = (v: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { timeZone: "Africa/Cairo", hour12: false });
};
const duration = (a: string | null, b: string | null) => {
  if (!a || !b) return "-";
  const s = Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}د ${s % 60}ث` : `${s}ث`;
};
const stepsText = (t: Trace) => (t.steps || []).map((x) => `${clock(x.t)} [${x.s || "-"}] ${x.m || ""}`).join("\n");

export function PoTraceReport() {
  const [from, setFrom] = useState(todayCairo);
  const [to, setTo] = useState(todayCairo);
  const [account, setAccount] = useState("");
  const [outcome, setOutcome] = useState("");
  const [mode, setMode] = useState("stop");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (account.trim()) params.set("account", account.trim());
  if (outcome) params.set("outcome", outcome);
  if (mode) params.set("mode", mode);
  const url = `/api/po-traces?${params}`;
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: [url],
    queryFn: async () => {
      const r = await fetch(url, { credentials: "include" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`);
      return j as { data: Trace[]; counts: Record<string, number> };
    },
  });
  const rows = data?.data ?? [];
  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportExcel = () => {
    const sheet = rows.map((t, i) => ({
      "#": i + 1, "الأكونت": t.accountNo, "الوضع": t.mode === "stop" ? "إيقاف" : "رفع سرعة", "النتيجة": outcomeLabel(t.outcome),
      "آخر حالة": t.lastStatus || "", "البداية": fmt(t.startedAt), "النهاية": fmt(t.endedAt), "المدة": duration(t.startedAt, t.endedAt),
      "التاب": t.lane || "", "نسخة السكربت": t.version || "", "الخطوات": stepsText(t),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "سجل خطوات PO");
    XLSX.writeFile(wb, `po-traces-${from}_${to}.xlsx`);
  };
  const exportPDF = () => printTablePDF({
    title: `سجل خطوات PO (${from} → ${to})`,
    columns: ["#", "الأكونت", "النتيجة", "آخر حالة", "البداية", "المدة", "الخطوات"],
    rows: rows.map((t, i) => [i + 1, t.accountNo, outcomeLabel(t.outcome), t.lastStatus || "-", fmt(t.startedAt), duration(t.startedAt, t.endedAt), stepsText(t)]),
    rowsPerPage: 6,
  });

  return (
    <Card className="overflow-hidden shadow-sm border-0 bg-white" dir="rtl">
      <div className="p-4 border-b flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base">سجل خطوات PO</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            كل خط اشتغل عليه سكربت الإيقاف/رفع السرعة (0.9.24 وبعدها): الحالة اللى قراها، عمل إيه، والنتيجة — دوس على السطر يفتح الخطوات
          </p>
          {data && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(data.counts).sort((a, b) => b[1] - a[1]).map(([o, n]) => (
                <button key={o} type="button" onClick={() => setOutcome(outcome === o ? "" : o)}
                  className={`text-[11px] px-2 py-0.5 rounded font-semibold ${OUTCOMES[o]?.cls || "bg-slate-100"} ${outcome === o ? "ring-2 ring-offset-1 ring-slate-400" : ""}`}>
                  {outcomeLabel(o)}: {n.toLocaleString("ar-EG")}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">من</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36 text-sm" dir="ltr" />
          <span className="text-xs text-muted-foreground">إلى</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36 text-sm" dir="ltr" />
          <Input value={account} onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))} placeholder="رقم الأكونت" className="h-9 w-32 text-sm" dir="ltr" />
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="h-9 border rounded px-2 text-sm">
            <option value="stop">إيقاف PO</option>
            <option value="full">رفع سرعة</option>
            <option value="">الكل</option>
          </select>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="h-9 border rounded px-2 text-sm">
            <option value="">كل النتايج</option>
            {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 ml-1 ${isFetching ? "animate-spin" : ""}`} /> تحديث
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} className="text-green-700 border-green-200" disabled={!rows.length}>تصدير Excel</Button>
          <Button variant="outline" size="sm" onClick={exportPDF} className="text-red-700 border-red-200" disabled={!rows.length}>تصدير PDF</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : isError ? (
        <div className="py-12 text-center text-red-700">تعذّر تحميل السجل: {error instanceof Error ? error.message : ""}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-right text-xs" dir="rtl">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-6" />
                <TableHead className="text-right font-bold whitespace-nowrap">الأكونت</TableHead>
                <TableHead className="text-right font-bold whitespace-nowrap">النتيجة</TableHead>
                <TableHead className="text-right font-bold whitespace-nowrap">آخر حالة اتقرت</TableHead>
                <TableHead className="text-right font-bold whitespace-nowrap">آخر خطوة</TableHead>
                <TableHead className="text-right font-bold whitespace-nowrap">البداية</TableHead>
                <TableHead className="text-right font-bold whitespace-nowrap">المدة</TableHead>
                <TableHead className="text-right font-bold whitespace-nowrap">خطوات</TableHead>
                <TableHead className="text-right font-bold whitespace-nowrap">التاب · النسخة</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">مفيش سجلات فى المدة دى — السجل بيبدأ من نسخة السكربت 0.9.24</TableCell></TableRow>
              ) : rows.map((t) => {
                const steps = t.steps || [];
                const isOpen = open.has(t.id);
                return (
                  <Fragment key={t.id}>
                    <TableRow onClick={() => toggle(t.id)} className={`cursor-pointer hover:bg-muted/30 ${BAD.has(String(t.outcome)) ? "bg-red-50/40" : ""}`} data-testid={`po-trace-${t.id}`}>
                      <TableCell>{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}</TableCell>
                      <TableCell className="font-mono font-semibold">{t.accountNo}</TableCell>
                      <TableCell><span className={`text-[11px] px-2 py-0.5 rounded font-semibold whitespace-nowrap ${OUTCOMES[String(t.outcome)]?.cls || ""}`}>{outcomeLabel(t.outcome)}</span></TableCell>
                      <TableCell className="whitespace-nowrap">{t.lastStatus || "-"}</TableCell>
                      <TableCell className="min-w-[220px] max-w-[420px] whitespace-normal">{steps[steps.length - 1]?.m || "-"}</TableCell>
                      <TableCell className="whitespace-nowrap" dir="ltr">{fmt(t.startedAt)}</TableCell>
                      <TableCell className="whitespace-nowrap">{duration(t.startedAt, t.endedAt)}</TableCell>
                      <TableCell>{steps.length}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{t.lane || "-"} · {t.version || "-"}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-slate-50">
                        <TableCell />
                        <TableCell colSpan={8}>
                          <ol className="space-y-1 py-1">
                            {steps.map((x, i) => (
                              <li key={i} className="flex gap-2 items-baseline">
                                <span className="font-mono text-muted-foreground whitespace-nowrap" dir="ltr">{clock(x.t)}</span>
                                <span className="text-[11px] px-1.5 rounded bg-white border whitespace-nowrap">{x.s || "—"}</span>
                                <span className="whitespace-normal">{x.m}</span>
                              </li>
                            ))}
                          </ol>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
