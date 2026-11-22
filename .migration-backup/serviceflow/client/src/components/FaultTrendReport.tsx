import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, Search, FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { printTablePDF } from "@/lib/print-pdf";
import { format } from "date-fns";
import { analyzeTrend, TREND_AR, type TrendDir } from "@shared/fault-trend";

// «اتجاه الأعطال» — تحليل أعطال الشبكة (خطة ٢٠٢٦-١١-١٦ البند ١٢). الحساب فى shared/fault-trend.ts.
type Group = "box" | "cabinet" | "tech";
interface ApiRow { central: string | null; cabinet: string | null; box: string | null; tech: string | null; lines: number; counts: number[] }
interface Api { months: string[]; fraction: number; group: Group; rows: ApiRow[] }

const CENTRALS = ["الغنايم", "الغنايم-العزايزة", "الغنايم-دير الجنادله", "الغنايم-نجع العمدة"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthLabel = (k: string) => `${MONTHS_AR[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
const GROUP_AR: Record<Group, string> = { box: "بكس", cabinet: "كابينة", tech: "فنى" };
const TREND_CLS: Record<TrendDir, string> = {
  up: "bg-red-100 text-red-800", down: "bg-green-100 text-green-800", flat: "bg-slate-100 text-slate-700", na: "bg-muted text-muted-foreground",
};

export function FaultTrendReport() {
  const [group, setGroup] = useState<Group>("box");
  const [months, setMonths] = useState(6);
  const [central, setCentral] = useState("");
  const [search, setSearch] = useState("");
  const [trendF, setTrendF] = useState<"" | TrendDir>("");
  const [chronicOnly, setChronicOnly] = useState(false);
  const [minPer1000, setMinPer1000] = useState("");

  const { data, isFetching, refetch } = useQuery<Api>({
    queryKey: ["/api/reports/fault-trend", group, months, central],
    queryFn: async () => {
      const p = new URLSearchParams({ group, months: String(months) });
      if (central) p.set("central", central);
      const res = await fetch(`/api/reports/fault-trend?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "تعذّر التحميل");
      return res.json();
    },
  });
  const keys = data?.months ?? [];

  const analyzed = useMemo(() => (data?.rows ?? []).map((r) => ({ ...r, a: analyzeTrend(r.counts, r.lines, data?.fraction ?? 1) })), [data]);

  const shown = useMemo(() => {
    const q = search.trim();
    const min = parseFloat(minPer1000);
    const out = analyzed.filter((r) =>
      (!q || [r.central, r.cabinet, r.box, r.tech].some((v) => String(v ?? "").includes(q)))
      && (!trendF || r.a.trend === trendF)
      && (!chronicOnly || r.a.chronic)
      && (isNaN(min) || (r.a.per1000 ?? 0) >= min));
    // البكس: الأكتر شهور فيها أعطال ثم الإجمالى · الكابينة والفنى: فى الألف
    return out.sort((x, y) => group === "box"
      ? (y.a.activeMonths - x.a.activeMonths) || (y.a.total - x.a.total)
      : ((y.a.per1000 ?? -1) - (x.a.per1000 ?? -1)) || (y.a.total - x.a.total));
  }, [analyzed, search, trendF, chronicOnly, minPer1000, group]);

  const totals = useMemo(() => keys.map((_, i) => shown.reduce((s, r) => s + r.counts[i], 0)), [keys, shown]);
  const maxTotal = Math.max(1, ...totals);
  const nUp = shown.filter((r) => r.a.trend === "up").length;
  const nDown = shown.filter((r) => r.a.trend === "down").length;
  const nChronic = shown.filter((r) => r.a.chronic).length;
  const fullN = Math.max(0, keys.length - 1);

  const place = group === "tech" ? ["الفنى"] : group === "cabinet" ? ["السنترال", "الكابينة", "الفنى"] : ["السنترال", "الكابينة", "البكس", "الفنى"];
  const cols = ["#", ...place, "الخطوط", ...keys.map((k, i) => (i === keys.length - 1 ? `${monthLabel(k)} (لحد النهارده)` : monthLabel(k))),
    "المتوقع للشهر", "متوسط الشهر", "فى الألف", "شهور فيها أعطال", "الاتجاه"];
  const placeCells = (r: ApiRow) => (group === "tech" ? [r.tech] : group === "cabinet" ? [r.central, r.cabinet, r.tech] : [r.central, r.cabinet, r.box, r.tech]);
  const exportRows = () => shown.map((r, i) => [
    i + 1, ...placeCells(r).map((v) => v ?? ""), r.lines, ...r.counts, r.a.projected, r.a.avgMonth, r.a.per1000 ?? "",
    `${r.a.activeMonths} من ${fullN}${r.a.chronic ? " (متكرر)" : ""}`, TREND_AR[r.a.trend],
  ]);
  const title = `اتجاه الأعطال لكل ${GROUP_AR[group]} — آخر ${months} شهور${central ? ` — ${central}` : ""}`;
  const handleExportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([cols, ...exportRows()]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "اتجاه الأعطال");
    XLSX.writeFile(wb, `fault-trend-${group}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };
  const handleExportPDF = () => printTablePDF({
    title, columns: cols, rows: exportRows(), rowsPerPage: 14,
    introHtml: `<div style="font-size:11px;margin:4px 0 8px">إجمالى الأعطال بالشهر: ${keys.map((k, i) => `${monthLabel(k)}: <b>${totals[i]}</b>`).join(" · ")}
      — بيزيد: <b>${nUp}</b> · بيقل: <b>${nDown}</b> · متكرر: <b>${nChronic}</b></div>`,
  });

  return (
    <Card className="p-4 sm:p-5 bg-white border-0 shadow-sm" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        عدد الأعطال شهر بشهر (شيت التفاصيل + تفاصيل المتبقى، مربوطة ببيان التليفونات).
        <strong> الاتجاه</strong> = متوسط آخر ٣ شهور كاملة قصاد الـ٣ اللى قبلهم: «بيزيد» لو زاد ٢٥٪ وعطل واحد فى الشهر على الأقل، و«بيقل» بالعكس.
        <strong> متكرر</strong> = فيه أعطال فى ثلثين الشهور الكاملة على الأقل. <strong>فى الألف</strong> = متوسط الشهر الكامل ÷ الخطوط × ١٠٠٠.
        الشهر الحالى مش داخل فى الحساب، وجنبه المتوقع للشهر كله.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="flex rounded-md border overflow-hidden" role="tablist">
          {(["box", "cabinet", "tech"] as Group[]).map((g) => (
            <button key={g} type="button" onClick={() => setGroup(g)} data-testid={`tab-fault-trend-${g}`}
              className={`px-3 py-1.5 text-sm ${group === g ? "bg-primary text-primary-foreground" : "bg-white hover:bg-muted"}`}>
              لكل {GROUP_AR[g]}
            </button>
          ))}
        </div>
        <label className="text-xs text-muted-foreground">الفترة
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="block border rounded px-2 py-1.5 text-sm text-foreground"
            data-testid="select-fault-trend-months">
            {[3, 6, 9, 12].map((m) => <option key={m} value={m}>آخر {m} شهور</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">السنترال
          <select value={central} onChange={(e) => setCentral(e.target.value)} className="block border rounded px-2 py-1.5 text-sm text-foreground">
            <option value="">الكل</option>
            {CENTRALS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">الاتجاه
          <select value={trendF} onChange={(e) => setTrendF(e.target.value as any)} className="block border rounded px-2 py-1.5 text-sm text-foreground"
            data-testid="select-fault-trend-dir">
            <option value="">الكل</option>
            <option value="up">بيزيد</option>
            <option value="down">بيقل</option>
            <option value="flat">ثابت</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">أقل فى الألف
          <Input value={minPer1000} onChange={(e) => setMinPer1000(e.target.value)} inputMode="decimal" className="w-24 text-sm" dir="ltr" />
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
          <input type="checkbox" checked={chronicOnly} onChange={(e) => setChronicOnly(e.target.checked)} data-testid="checkbox-fault-trend-chronic" />
          المتكرر بس
        </label>
        <div className="relative min-w-[160px] max-w-xs flex-1">
          <Search className="absolute right-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="كابينة / بكس / فنى" className="text-sm pr-8" dir="rtl" />
        </div>
        {isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mb-2" />}
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1 mb-1">
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={shown.length === 0} className="text-green-700 border-green-200 gap-1 mb-1">
          <FileSpreadsheet className="w-4 h-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={shown.length === 0} className="text-red-700 border-red-200 gap-1 mb-1">
          <Printer className="w-4 h-4" /> PDF
        </Button>
      </div>

      {keys.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] mb-4 items-end">
          <div className="flex items-end gap-2 h-28 border-b pb-1" aria-label="إجمالى الأعطال بالشهر">
            {keys.map((k, i) => {
              const cur = i === keys.length - 1;
              return (
                <div key={k} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
                  <span className="text-[11px] tabular-nums font-bold">{totals[i]}</span>
                  <div className={`w-full max-w-[44px] rounded-t ${cur ? "bg-primary/35" : "bg-primary/80"}`} style={{ height: `${(totals[i] / maxTotal) * 80}%` }} />
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center">{monthLabel(k)}{cur ? " *" : ""}</span>
                </div>
              );
            })}
          </div>
          <div className="flex sm:flex-col gap-2 text-sm">
            <span className="px-2 py-1 rounded bg-red-100 text-red-800">بيزيد: <b data-testid="text-fault-trend-up">{nUp}</b></span>
            <span className="px-2 py-1 rounded bg-green-100 text-green-800">بيقل: <b>{nDown}</b></span>
            <span className="px-2 py-1 rounded bg-amber-100 text-amber-800">متكرر: <b data-testid="text-fault-trend-chronic">{nChronic}</b></span>
            <span className="px-2 py-1 rounded bg-muted">إجمالى: <b data-testid="text-fault-trend-total">{shown.length}</b></span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table className="text-right text-sm" dir="rtl">
          <TableHeader className="bg-muted/50">
            <TableRow>{cols.map((c) => <TableHead key={c} className="text-right font-bold whitespace-nowrap">{c}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={cols.length} className="text-center py-8 text-muted-foreground">
                  {isFetching ? "جارٍ التحميل…" : "مافيش أعطال بالشروط دى"}
                </TableCell>
              </TableRow>
            ) : shown.slice(0, 1000).map((r, i) => (
              <TableRow key={`${r.central}|${r.cabinet}|${r.box}|${r.tech}`} className="hover:bg-muted/30">
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                {placeCells(r).map((v, j) => <TableCell key={j} className="whitespace-nowrap">{v || "-"}</TableCell>)}
                <TableCell className="tabular-nums">{r.lines}</TableCell>
                {r.counts.map((c, j) => (
                  <TableCell key={j} className={`tabular-nums text-center ${j === r.counts.length - 1 ? "text-muted-foreground" : c ? "font-semibold" : "text-muted-foreground"}`}>{c}</TableCell>
                ))}
                <TableCell className="tabular-nums text-center">{r.a.projected}</TableCell>
                <TableCell className="tabular-nums text-center">{r.a.avgMonth}</TableCell>
                <TableCell className="tabular-nums text-center font-bold">{r.a.per1000 ?? "-"}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.a.activeMonths} من {fullN}
                  {r.a.chronic && <span className="mr-1 text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">متكرر</span>}
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold whitespace-nowrap ${TREND_CLS[r.a.trend]}`}
                    title={r.a.recent !== null ? `آخر ٣ شهور: ${r.a.recent} فى الشهر — قبلهم: ${r.a.before}` : ""}>
                    {TREND_AR[r.a.trend]}{r.a.recent !== null && r.a.trend !== "flat" ? ` (${r.a.before} ← ${r.a.recent})` : ""}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {shown.length > 1000 && <p className="text-xs text-muted-foreground mt-2">معروض أول ١٠٠٠ — الباقى فى Excel وPDF.</p>}
      </div>
    </Card>
  );
}
