import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PackageOpen, Search, FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { printTablePDF } from "@/lib/print-pdf";
import { format } from "date-fns";

// «متعذرات تم توفير خطوط بها» — متعذرات OM الحالية اللى الفنى ردّ عليها «لا يمكن التنفيذ
// — بوكس مليان». وقت الرد بيتسجّل عدد الخطوط الشغّالة على البكس (بيان فنى على البكس + له
// بورت)، ولو العدد ده قلّ بعدها فى أى وقت يبقى اتفكّت خطوط والمتعذر بيظهر هنا.
interface Row {
  serial: string;
  serviceNumber: string | null;
  customerName: string | null;
  msanCode: string | null;
  central: string | null;
  cabinet: string | null;
  box: string | null;
  recorded: number;
  current: number;
  freed: number;
  recordedAt: string | null;
  techName: string | null;
  respondedAt: string | null;
  status: string | null;
}

const fmtDt = (d: string | null) => {
  if (!d) return "-";
  const t = new Date(d);
  if (isNaN(t.getTime())) return "-";
  return t.toLocaleString("en-GB", {
    timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
};

const COLS = ["#", "المسلسل", "رقم الخدمة", "العميل", "كود المسان", "السنترال", "الكابينة", "البكس",
  "الشغّال وقت الرد", "الشغّال دلوقتى", "اتوفّر", "الفنى", "تاريخ الرد"];

export function OmBoxFreedReport() {
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");

  const { data = [], isFetching, refetch } = useQuery<Row[]>({
    queryKey: ["/api/reports/om-box-freed", showAll],
    queryFn: async () => {
      const res = await fetch(`/api/reports/om-box-freed${showAll ? "?all=1" : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "تعذّر التحميل");
      return res.json();
    },
  });

  const shown = useMemo(() => {
    const q = search.trim();
    if (!q) return data;
    return data.filter((r) =>
      [r.serial, r.serviceNumber, r.customerName, r.msanCode, r.cabinet, r.box, r.techName]
        .some((v) => String(v ?? "").includes(q)));
  }, [data, search]);

  const exportRows = () => shown.map((r, i) => [
    i + 1, r.serial, r.serviceNumber ?? "", r.customerName ?? "", r.msanCode ?? "", r.central ?? "",
    r.cabinet ?? "", r.box ?? "", r.recorded, r.current, r.freed, r.techName ?? "", fmtDt(r.respondedAt),
  ]);

  const title = showAll ? "متعذرات OM بوكس مليان — الشغّال وقت الرد ودلوقتى" : "متعذرات تم توفير خطوط بها";
  const handleExportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet([COLS, ...exportRows()]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تم توفير خطوط");
    XLSX.writeFile(wb, `om-box-freed-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };
  const handleExportPDF = () => printTablePDF({ title, columns: COLS, rows: exportRows() });

  return (
    <Card className="p-4 sm:p-5 bg-white border-0 shadow-sm" dir="rtl">
      <div className="flex items-center gap-2 mb-1">
        <PackageOpen className="w-5 h-5 text-primary" />
        <h2 className="text-base font-bold">{title}</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        لما الفنى يرد على متعذر OM <strong>«لا يمكن التنفيذ — بوكس مليان»</strong> بيتسجّل عدد
        الخطوط الشغّالة على البكس فى الوقت ده (الشغّال = بيان فنى على البكس <strong>وله بورت</strong>).
        لو العدد قلّ بعدها فى أى وقت، المتعذر بيظهر هنا — البكس اتوفّر فيه مكان.
        المتعذرات اللى كانت مردود عليها قبل الميزة اتسجّل لها الشغّال وقت تشغيلها.
      </p>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <label className="text-xs text-muted-foreground block mb-1">بحث</label>
          <Search className="absolute right-2 top-[30px] w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="المسلسل / الخدمة / البكس / الفنى" className="text-sm pr-8" dir="rtl"
            data-testid="input-om-box-freed-search" />
        </div>
        <label className="flex items-center gap-2 text-sm mb-2 cursor-pointer">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)}
            data-testid="checkbox-om-box-freed-all" />
          عرض كل متعذرات «بوكس مليان» (بالرقمين)
        </label>
        <div className="flex-1" />
        {isFetching && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mb-2" />}
        <span className="text-sm text-muted-foreground mb-2">
          إجمالي: <strong data-testid="text-om-box-freed-total">{shown.length}</strong> متعذر
        </span>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1 mb-1">
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={shown.length === 0}
          className="text-green-700 border-green-200 gap-1 mb-1">
          <FileSpreadsheet className="w-4 h-4" /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={shown.length === 0}
          className="text-red-700 border-red-200 gap-1 mb-1">
          <Printer className="w-4 h-4" /> PDF
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table className="text-right text-sm" dir="rtl">
          <TableHeader className="bg-muted/50">
            <TableRow>
              {COLS.map((c) => (
                <TableHead key={c} className="text-right font-bold whitespace-nowrap">{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS.length} className="text-center py-8 text-muted-foreground">
                  {isFetching ? "جارٍ التحميل…" : showAll
                    ? "مافيش متعذرات حالية ردّها «بوكس مليان»"
                    : "مافيش بكس مليان اتوفّرت فيه خطوط لحد دلوقتى"}
                </TableCell>
              </TableRow>
            ) : shown.map((r, i) => (
              <TableRow key={r.serial} className="hover:bg-muted/30 transition-colors">
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell dir="ltr" className="text-left whitespace-nowrap">{r.serial}</TableCell>
                <TableCell dir="ltr" className="text-left">{r.serviceNumber || "-"}</TableCell>
                <TableCell className="whitespace-nowrap">{r.customerName || "-"}</TableCell>
                <TableCell dir="ltr" className="text-left whitespace-nowrap">{r.msanCode || "-"}</TableCell>
                <TableCell className="whitespace-nowrap">{r.central || "-"}</TableCell>
                <TableCell className="font-medium">{r.cabinet || "-"}</TableCell>
                <TableCell className="font-medium text-blue-700">{r.box || "-"}</TableCell>
                <TableCell className="tabular-nums">{r.recorded}</TableCell>
                <TableCell className="tabular-nums">{r.current}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold tabular-nums ${
                    r.freed > 0 ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"
                  }`}>{r.freed > 0 ? `+${r.freed}` : r.freed}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{r.techName || "-"}</TableCell>
                <TableCell dir="ltr" className="text-left text-xs whitespace-nowrap">{fmtDt(r.respondedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
